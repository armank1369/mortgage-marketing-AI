"""Shared Step I generation. No HTTP, database or implicit provider invocation.

invoke(label, **kwargs) is supplied by either the stateless wrapper or durable
orchestrator. The latter persists/rechecks an invocation before dispatching it.
"""
from datetime import date
import json

from errors import AppError
from services import generation_policy as policy
from services.prompt_builder import build_prompt, render_policy, build_footer


class InvalidGenerationOutputError(AppError):
    status_code = 502
    error_code = "invalid_provider_output"

    def __init__(self, legacy_message="Could not generate a response. Please try again."):
        self.legacy_message = legacy_message
        super().__init__(legacy_message)


def _raw(result):
    value = next((block.text for block in result.content if block.type == "text"), "")
    if not isinstance(value, str) or not value.strip() or getattr(result, "stop_reason", None) == "max_tokens":
        raise InvalidGenerationOutputError()
    return value


def generate_chat(message, context, invoke, *, model):
    is_campaign = bool(policy.CAMPAIGN_INTENT_PATTERN.search(message))
    is_followup = message.strip().lower().startswith("original request:")
    ambiguous = not is_campaign and bool(policy.AMBIGUOUS_SCOPE_PATTERN.search(message))
    shared = build_prompt(context, policy.BASE_PROMPT, policy.COMPLIANCE_PROMPT,
                          policy.PLATFORM_PROMPT, policy.NO_MARKDOWN_PROMPT)
    if is_campaign and not is_followup:
        check_prompt = shared + "\n\n" + render_policy(policy.CAMPAIGN_CLARIFICATION_PROMPT, context)
        check = invoke("campaign_clarification_check", model=model,
                       system=policy.build_system(check_prompt),
                       messages=[{"role": "user", "content": message}], max_tokens=1500,
                       thinking={"type": "disabled"})
        clarification = policy._parse_clarification(_raw(check))
        if clarification:
            return {"type": "clarification", "clarification": clarification}
    system = shared
    if is_campaign:
        system += "\n\n" + render_policy(policy.CAMPAIGN_FORMAT_PROMPT.replace(
            "{today}", date.today().strftime("%A, %B %d, %Y")), context)
    else:
        system += "\n\n" + render_policy(policy.NON_CAMPAIGN_FORMAT_PROMPT, context)
        if ambiguous:
            system += "\n\n" + policy.AMBIGUOUS_SCOPE_PROMPT
    kwargs = {"model": model, "system": policy.build_system(system),
              "messages": [{"role": "user", "content": message}],
              "thinking": {"type": "disabled"}, "max_tokens": 10000 if is_campaign else 4096}
    if is_campaign:
        kwargs["output_config"] = {"format": {"type": "json_schema", "schema": policy.CAMPAIGN_JSON_SCHEMA}}
    result = invoke("chat_campaign" if is_campaign else "chat_non_campaign", **kwargs)
    raw = _raw(result)
    if is_campaign:
        try:
            campaign = policy.strip_markdown_deep(json.loads(raw))
            shortfalls = policy._campaign_post_count_shortfalls(campaign)
            if shortfalls:
                print(f"[campaign_shortfall] {shortfalls}")
            campaign, flags = policy.enforce_campaign_compliance(campaign, context)
            return {"type": "campaign", "campaign": campaign, "compliance_flags": flags}
        except (json.JSONDecodeError, AttributeError):
            pass  # Preserve existing compliant text fallback for malformed campaign JSON.
    else:
        clarification = policy._parse_clarification(raw, force_multiple=ambiguous)
        if clarification:
            return {"type": "clarification", "clarification": clarification}
        posts = policy._parse_posts(raw)
        if posts:
            posts, flags = policy.enforce_posts_compliance(posts, context)
            return {"type": "posts", "posts": posts, "compliance_flags": flags}
    try:
        empty = json.loads(raw)
        if isinstance(empty, dict) and "posts" in empty and empty["posts"] == []:
            raise InvalidGenerationOutputError()
    except json.JSONDecodeError:
        pass
    raw = policy._strip_stray_empty_posts_envelope(raw)
    if not raw.strip():
        raise InvalidGenerationOutputError()
    response, flags = policy.enforce_compliance(policy.strip_markdown(raw), context)
    return {"type": "text", "response": response, "compliance_flags": flags}


def generate_video(data, context, invoke, *, model):
    prompt = build_prompt(context, policy.BASE_PROMPT, policy.COMPLIANCE_PROMPT, policy.PLATFORM_PROMPT,
                          policy.NO_MARKDOWN_PROMPT, policy.VIDEO_BRIEF_FORMAT_PROMPT)
    source = f"Platform: {data.get('platform', '')}\nCategory/pillar: {data.get('category', '')}\nCaption:\n{data['caption']}"
    result = invoke("video_brief", model=model, system=policy.build_system(prompt),
                    messages=[{"role": "user", "content": source}], max_tokens=2000,
                    thinking={"type": "disabled"},
                    output_config={"format": {"type": "json_schema", "schema": policy.VIDEO_BRIEF_JSON_SCHEMA}})
    try:
        video = json.loads(_raw(result))
        if not isinstance(video, dict):
            raise ValueError()
    except (ValueError, TypeError):
        raise InvalidGenerationOutputError("Could not generate a video script from this post. Try again.") from None
    video, flags = policy.enforce_video_brief_compliance(policy.strip_markdown_deep(video), context)
    return {"video": video, "compliance_flags": flags}


def generate_image(data, context, invoke, *, model):
    script = data.get("script") or {}
    body = script.get("body", "")
    body = "\n".join(body) if isinstance(body, list) else body
    title, hook, cta = data.get("title", ""), script.get("hook", ""), script.get("cta", "")
    source = f"Title: {title}\nPlatform: {data.get('platform', '')}\nHook: {hook}\nBody: {body}\nCTA: {cta}"
    previous = data.get("previous_attempt")
    if isinstance(previous, dict) and previous.get("template") and isinstance(previous.get("slots"), dict):
        summary = ", ".join(f"{k}: {v}" for k, v in previous["slots"].items() if v)
        source += (f'\n\nPREVIOUS ATTEMPT (template: {previous["template"]}) — {summary}\n'
                   'The user asked to regenerate because this attempt did not land. Produce a genuinely '
                   'different graphic: prefer switching to a different template if one fits the content '
                   'nearly as well; if keeping the same template, substantially change the angle and '
                   'wording — not a synonym swap of the same sentence.')
    prompt = build_prompt(context, policy.BASE_PROMPT, policy.COMPLIANCE_PROMPT,
                          policy.NO_MARKDOWN_PROMPT, policy.SOCIAL_IMAGE_PROMPT)
    result = invoke("social_image", model=model, system=policy.build_system(prompt),
                    messages=[{"role": "user", "content": source}], max_tokens=1200,
                    thinking={"type": "disabled"})
    graphic = policy._parse_social_image(_raw(result))
    if not graphic:
        raise InvalidGenerationOutputError("Could not generate a graphic from this content. Try again.")
    graphic, flags = policy.enforce_social_image_compliance(graphic, context)
    return {**graphic, "compliance_footer": build_footer(context),
            "business_name": context.brand.business_name, "compliance_flags": flags}
