"""Shared configuration validation and safe API field projection."""
import json
import re

from errors import ValidationError
from services.generation_context import (
    GenerationConfigurationError, _text, _strings, _json_context,
)

BRAND_FIELDS = {
    "business_name", "licensed_person_name", "nmls_id", "dre_number", "tone",
    "values", "keywords", "catchphrases", "banned_words", "blog_examples",
    "compliance_footer", "equal_housing_text",
}
PERSONA_FIELDS = {"slug", "name", "description", "audience_profile", "prompt_guidance"}


def _validate(payload, allowed, validator):
    if not isinstance(payload, dict) or not payload or payload.keys() - allowed:
        raise ValidationError("Supply only supported configuration fields.")
    result = {}
    for key, value in payload.items():
        if value is None:
            raise ValidationError("Use empty text, an array or an object to clear an optional field.", {"field": key})
        try:
            result[key] = validator(key, value)
        except GenerationConfigurationError:
            raise ValidationError("Invalid configuration field. Check its type and length.", {"field": key}) from None
    return result


def validate_brand_patch(payload):
    def validate(key, value):
        if key in {"values", "keywords", "catchphrases", "banned_words"}:
            return list(_strings(value, key))
        if key in {"tone", "blog_examples"}:
            expected, limit = (dict, 4000) if key == "tone" else ((list, dict), 8000)
            encoded = _json_context(value, key, expected, limit)
            return json.loads(encoded) if encoded else ({} if key == "tone" or isinstance(value, dict) else [])
        limit = {"compliance_footer": 1000, "equal_housing_text": 500,
                 "nmls_id": 20, "dre_number": 20}.get(key, 100)
        text = _text(value, key, limit, required=key == "business_name",
                     single_line=key not in {"compliance_footer", "equal_housing_text"})
        if key in {"nmls_id", "dre_number"} and text:
            if not re.fullmatch(r"[0-9]{1,20}", text) or not text.strip("0"):
                raise GenerationConfigurationError(key)
        return text
    return _validate(payload, BRAND_FIELDS, validate)


def validate_persona_patch(payload, *, creating=False):
    def validate(key, value):
        if key == "audience_profile":
            encoded = _json_context(value, key, dict, 4000)
            return json.loads(encoded) if encoded else {}
        limit = {"slug": 100, "name": 200, "description": 2000, "prompt_guidance": 4000}[key]
        text = _text(value, key, limit, required=key in {"slug", "name"},
                     single_line=key in {"slug", "name"})
        if key == "slug" and not re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", text):
            raise GenerationConfigurationError(key)
        return text
    result = _validate(payload, PERSONA_FIELDS, validate)
    if creating and not {"slug", "name"} <= result.keys():
        raise ValidationError("Persona name and slug are required.")
    return result


def brand_response(profile, workspace_id, can_write):
    profile = profile or {}
    settings = profile.get("settings") or {}
    # Whitelist fields: never return arbitrary settings or backend policies.
    result = {key: profile.get(key) for key in BRAND_FIELDS - {"licensed_person_name"}}
    result.update(workspace_id=str(workspace_id), exists=bool(profile), can_write=can_write,
                  licensed_person_name=settings.get("licensed_person_name", "") if isinstance(settings, dict) else "")
    for key in ("business_name", "nmls_id", "dre_number", "compliance_footer", "equal_housing_text"):
        result[key] = result.get(key) or ""
    for key in ("values", "keywords", "catchphrases", "banned_words", "blog_examples"):
        result[key] = result.get(key) or []
    result["tone"] = result.get("tone") or {}
    return result


def persona_response(row):
    return {**{key: row.get(key) for key in PERSONA_FIELDS},
            "id": str(row["id"]), "workspace_id": str(row["workspace_id"]),
            "is_starter": bool(row.get("is_starter")),
            "audience_profile": row.get("audience_profile") or {},
            "description": row.get("description") or "",
            "prompt_guidance": row.get("prompt_guidance") or ""}
