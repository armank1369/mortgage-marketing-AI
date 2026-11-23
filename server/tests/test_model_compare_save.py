"""Saving a compare-and-combine result into a chat. Synthetic in-memory SQL; no provider, no database."""
from copy import deepcopy
from unittest.mock import Mock
from uuid import uuid4

import pytest

from errors import NotFoundError, ValidationError
from repositories import chat_persistence_repository as repo
from services import generation_operations as operations
from services.chat_contract import operation_fields
from tests.test_step_j_repository import MemorySQL, W, S, M, P, send

CID = "44444444-4444-4444-8444-444444444444"
PROMPT = "Write a Facebook post about pre-approval"
FOOTER = "Synthetic | NMLS #1 | DRE #2 | Equal Housing Opportunity"
TEXT = {"type": "text", "response": f"Combined answer.\n\n{FOOTER}", "compliance_flags": ["x_review"]}
DRAFT_A = {"type": "text", "response": f"Draft A.\n\n{FOOTER}", "compliance_flags": []}


class ComparisonSQL(MemorySQL):
    def __init__(self):
        super().__init__()
        self.comparisons = {CID: {"prompt": PROMPT, "persona_id": P, "candidates": [
            {"slot": "A", "provider": "anthropic", "model": "m1", "response": deepcopy(DRAFT_A)},
            {"slot": "B", "provider": "openai", "model": "m2", "error": "provider_rate_limited"}],
            "merges": [{"round": 1, "response": {"type": "text", "response": "Old round.", "compliance_flags": []}},
                       {"round": 2, "response": deepcopy(TEXT)}]}}

    def execute(self, sql, params=()):
        q = " ".join(sql.lower().split())
        if q.startswith("select") and "from public.model_comparison" in q:
            self.calls.append((q, params))
            row = self.comparisons.get(params[0])
            self.rows = [row] if row and params[1] == W else []
            return
        return super().execute(sql, params)


@pytest.fixture
def store(monkeypatch):
    db = ComparisonSQL()
    monkeypatch.setattr(repo, "get_db_transaction", db.transaction)
    repo.create_session(W, S, M, title="Synthetic", persona_id=P)
    return db


def save(source="combined", **changes):
    return send(message=PROMPT, comparison={"id": CID, "source": source}, **changes)


def test_save_combined_creates_a_normal_exchange_linked_to_the_comparison(store):
    result = repo.save_comparison_operation(W, S, M, operation_fields(save()))
    assert result["state"] == "succeeded"
    response = result["response"]
    assert response["structured_data"]["payload"]["response"].startswith("Combined answer.")  # latest round, not round 1
    assert response["structured_data"]["comparison"] == {"id": CID, "source": "combined", "round": 2}
    assert response["compliance_flags"] == ["x_review"]
    messages = sorted(store.messages.values(), key=lambda r: r["created_at"])
    assert [m["role"] for m in messages] == ["user", "assistant"]
    assert messages[0]["content"] == PROMPT  # the user bubble is the original prompt
    assert messages[0]["structured_data"]["input"]["action"] == "send"  # history, previews, regenerate all treat it as a send


def test_save_chosen_draft(store):
    result = repo.save_comparison_operation(W, S, M, operation_fields(save("A")))
    assert result["response"]["structured_data"]["payload"]["response"].startswith("Draft A.")
    assert result["response"]["structured_data"]["comparison"] == {"id": CID, "source": "A"}


def test_save_is_idempotent_per_operation_key(store):
    fields = operation_fields(save())
    first = repo.save_comparison_operation(W, S, M, fields)
    again = repo.save_comparison_operation(W, S, M, fields)
    assert again["response"]["id"] == first["response"]["id"]
    assert len(store.messages) == 2


@pytest.mark.parametrize("change,error", [
    (lambda db: db.comparisons[CID].update(prompt="Something else"), ValidationError),
    (lambda db: db.comparisons[CID].update(persona_id=str(uuid4())), ValidationError),
    (lambda db: db.comparisons[CID].update(merges=[]), ValidationError),
    (lambda db: db.comparisons[CID]["merges"].__setitem__(-1, {"round": 2, "response": {"type": "video"}}), ValidationError),
    (lambda db: db.comparisons.clear(), NotFoundError),
])
def test_bad_comparisons_save_nothing(store, change, error):
    change(store)
    with pytest.raises(error):
        repo.save_comparison_operation(W, S, M, operation_fields(save()))
    assert store.messages == {}


def test_a_failed_draft_cannot_be_saved(store):
    with pytest.raises(ValidationError):
        repo.save_comparison_operation(W, S, M, operation_fields(save("B")))
    assert store.messages == {}


def test_other_workspace_comparison_is_not_found(store, monkeypatch):
    monkeypatch.setattr(repo, "lock_member", lambda *a, **k: None)
    with pytest.raises(NotFoundError):
        repo.save_comparison_operation("99999999-9999-4999-8999-999999999999", S, M, operation_fields(save()))


def test_execute_operation_saves_without_any_provider_call(store, monkeypatch):
    runtime = Mock()
    resolve = Mock()
    monkeypatch.setattr(operations, "resolve_generation_context", resolve)
    result = operations.execute_operation(W, S, M, save(), runtime)
    assert result["state"] == "succeeded"
    runtime.create.assert_not_called()
    resolve.assert_not_called()


def test_a_saved_comparison_can_be_regenerated_like_any_send(store):
    """The saved request must keep working as a send for provenance (regenerate, shorten, history)."""
    saved = repo.save_comparison_operation(W, S, M, operation_fields(save()))["response"]
    fields = operation_fields({"operation_key": str(uuid4()), "action": "shorten", "source_message_id": saved["id"]})
    result = repo.shorten_operation(W, S, M, fields)
    assert result["state"] == "succeeded"


# ---------------------------------------------------------------- contract validation

@pytest.mark.parametrize("change", [
    {"comparison": {"id": "not-a-uuid", "source": "A"}},
    {"comparison": {"id": CID, "source": "C"}},
    {"comparison": {"id": CID}},
    {"comparison": {"id": CID, "source": "A", "extra": 1}},
    {"comparison": "A"},
])
def test_contract_rejects_bad_comparison_links(change):
    with pytest.raises(ValidationError):
        operation_fields(send(message=PROMPT, **change))


def test_comparison_only_allowed_on_send():
    with pytest.raises(ValidationError):
        operation_fields({"operation_key": str(uuid4()), "action": "regenerate", "persona_id": P,
                          "source_message_id": str(uuid4()), "comparison": {"id": CID, "source": "A"}})
