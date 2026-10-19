"""Synchronous durable orchestration; never retries a provider invocation."""
from dataclasses import dataclass
import logging
from time import perf_counter
from typing import Callable

import anthropic

from errors import (ChatConflictError, DatabaseUnavailableError, NotFoundError,
                    PermissionDeniedError, ValidationError, WorkspaceAccessDeniedError)
from repositories import chat_persistence_repository as chats
from repositories import generation_operation_repository as runs
from services.chat_contract import operation_fields
from services.generation_context import resolve_generation_context
from services.generation import generate_chat, generate_video, generate_image, InvalidGenerationOutputError
from services.conversation_context import capture_context

logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class GenerationRuntime:
    create: Callable
    model: str


def _metrics(result, elapsed):
    values = {"latency_ms": max(0, int(elapsed * 1000))}
    usage = getattr(result, "usage", None)
    for key in ("input_tokens", "cache_creation_input_tokens", "cache_read_input_tokens", "output_tokens"):
        value = getattr(usage, key, None)
        if type(value) is int and value >= 0:
            values[key] = value
    model = getattr(result, "model", None)
    if isinstance(model, str) and 0 < len(model) <= 200:
        values["model"] = model
    return values


def execute_operation(workspace_id, session_id, member_id, data, runtime):
    fields = operation_fields(data)
    if fields["action"] == "shorten":
        return chats.shorten_operation(workspace_id, session_id, member_id, fields)
    prepared = runs.prepare_operation(workspace_id, session_id, member_id, fields)
    if "replay" in prepared:
        return prepared["replay"]
    context = resolve_generation_context(workspace_id, persona_id=fields["persona_id"])
    task = prepared["generation_input"]
    claim = chats.claim_operation(workspace_id, session_id, member_id, fields, generation_input=task,
                                  persona_snapshot={"id": context.persona.id, "name": context.persona.name,
                                                    "slug": context.persona.slug},
                                  context_factory=lambda cur, sid, fields, source: capture_context(cur, sid, fields, source, runs._chat_task))
    if not claim["created"]:
        return claim["status"]
    task = claim["request"]["structured_data"]["generation_input"]
    key = fields["operation_key"]
    token = claim["request"]["structured_data"]["operation"]["claim_token"]
    stage, pending, active = 0, None, None

    def invoke(label, **kwargs):
        nonlocal stage, pending, active
        previous = pending
        pending, active = None, None
        # start_run commits before create. An exception never grants dispatch.
        run_id = runs.start_run(workspace_id, session_id, member_id, key, token,
                                model=kwargs["model"], system=kwargs["system"], stage=stage,
                                prior_success=previous)
        active = {"id": run_id, "metrics": {}}
        started = perf_counter()
        try:
            result = runtime.create(**kwargs)
        except Exception:
            active["metrics"] = _metrics(None, perf_counter() - started)
            raise
        active["metrics"] = _metrics(result, perf_counter() - started)
        pending = active
        stage += 1
        return result

    def fail(uncertain, code):
        # Access/claim checks are repeated here. Never overwrite a committed result
        # after an ambiguous completion acknowledgement, or an abandoned operation.
        return runs.fail_generation(workspace_id, session_id, member_id, key, token,
                                    uncertain=uncertain, safe_error=code, run=active)

    try:
        if task["kind"] == "chat":
            response = generate_chat(task["message"], context, invoke, model=runtime.model,
                                     history=task.get("conversation_context", {}).get("messages", []))
        elif task["kind"] == "video":
            response = {"type": "video", **generate_video(task, context, invoke, model=runtime.model)}
        else:
            response = {"type": "social_image", **generate_image(task, context, invoke, model=runtime.model)}
        if pending is None:
            raise InvalidGenerationOutputError()
        # Only repeat persistence of the SAME in-memory result. Never call the model
        # again to recover a save. Completion and final run link share a transaction.
        for attempt in range(2):
            try:
                return runs.complete_generation(workspace_id, session_id, member_id, key, token, response, pending)
            except DatabaseUnavailableError:
                if attempt:
                    raise
    except (WorkspaceAccessDeniedError, PermissionDeniedError, NotFoundError, ChatConflictError):
        raise  # Do not hide revocation/fencing behind a write or return private content.
    except DatabaseUnavailableError:
        try:
            return fail(True, "persistence_outcome_unknown")
        except DatabaseUnavailableError:
            raise
    except (InvalidGenerationOutputError, ValidationError):
        return fail(False, "invalid_provider_output")
    except anthropic.AuthenticationError:
        return fail(False, "provider_unavailable")
    except anthropic.RateLimitError:
        return fail(False, "provider_rate_limited")
    except anthropic.APIConnectionError:
        return fail(True, "provider_outcome_unknown")
    except anthropic.APIStatusError as error:
        return fail(error.status_code >= 500 or error.status_code in {408, 409},
                    "provider_outcome_unknown" if error.status_code >= 500 or error.status_code in {408, 409} else "provider_unavailable")
    except Exception as error:
        logger.error("Durable generation failed: %s", type(error).__name__)
        return fail(True, "generation_failed")


def response_status(result):
    """POST semantics; GET status remains 200 and never dispatches."""
    if result["state"] == "succeeded":
        return 200
    if result["state"] == "running":
        return 202
    if result["state"] == "abandoned":
        return 409
    if result["state"] == "unknown":
        return 503
    return 429 if result.get("safe_error_code") == "provider_rate_limited" else 502
