"""Resolve bounded business context after workspace authorization.

This module has no provider calls, writes, cache, or request-body dependency.
The licensed-person name source deliberately has no production default yet.
"""
from dataclasses import dataclass, field
import json
import re
from typing import Callable, Mapping, Optional
from uuid import UUID

from errors import AppError, NotFoundError, ValidationError
from repositories.brand_profile_repository import get_brand_profile
from repositories.persona_repository import get_persona


class GenerationConfigurationError(AppError):
    status_code = 409
    error_code = "generation_configuration_required"

    def __init__(self, field_name):
        super().__init__(
            "Generation configuration is incomplete or invalid. "
            "Ask a workspace administrator to review the indicated field.",
            details={"field": field_name},
        )


@dataclass(frozen=True, repr=False)
class LicenseIdentity:
    licensed_person_name: str
    nmls_id: str
    dre_number: str


@dataclass(frozen=True, repr=False)
class BrandContext:
    business_name: str
    tone: str
    values: tuple[str, ...]
    keywords: tuple[str, ...]
    catchphrases: tuple[str, ...]
    banned_words: tuple[str, ...]
    blog_examples: str
    compliance_footer: str
    equal_housing_text: str


@dataclass(frozen=True, repr=False)
class PersonaContext:
    id: str
    workspace_id: str
    slug: str
    name: str
    description: str
    audience_profile: str
    prompt_guidance: str
    is_starter: bool


@dataclass(frozen=True)
class GenerationContext:
    workspace_id: str
    identity: LicenseIdentity = field(repr=False)
    brand: BrandContext = field(repr=False)
    persona: PersonaContext = field(repr=False)


def _text(value, name, limit, *, required=False, single_line=False):
    if value is None and not required:
        return ""
    if not isinstance(value, str):
        raise GenerationConfigurationError(name)
    if any(ord(char) < 32 and char not in "\n\r\t" for char in value):
        raise GenerationConfigurationError(name)
    if single_line and any(char in value for char in "\n\r\t\u2028\u2029"):
        raise GenerationConfigurationError(name)
    value = value.strip()
    if len(value) > limit or (required and not value):
        raise GenerationConfigurationError(name)
    return value


def _strings(value, name):
    if value is None:
        return ()
    if not isinstance(value, list) or len(value) > 40:
        raise GenerationConfigurationError(name)
    normalized = []
    for item in value:
        if not isinstance(item, str):
            raise GenerationConfigurationError(name)
        text = _text(item, name, 200)
        if text:
            normalized.append(text)
    return tuple(normalized)


def _json_context(value, name, expected_type, limit):
    if value is None:
        return ""
    if not isinstance(value, expected_type):
        raise GenerationConfigurationError(name)

    def check(node, depth=0):
        if depth > 4:
            raise GenerationConfigurationError(name)
        if isinstance(node, dict):
            if len(node) > 40:
                raise GenerationConfigurationError(name)
            for key, item in node.items():
                _text(key, name, 100, required=True)
                check(item, depth + 1)
        elif isinstance(node, list):
            if len(node) > 40:
                raise GenerationConfigurationError(name)
            for item in node:
                check(item, depth + 1)
        elif isinstance(node, str):
            _text(node, name, limit)
        elif node is not None and type(node) not in (bool, int, float):
            raise GenerationConfigurationError(name)

    check(value)
    try:
        encoded = json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False)
    except (ValueError, TypeError):
        raise GenerationConfigurationError(name) from None
    if len(encoded) > limit:
        raise GenerationConfigurationError(name)
    return "" if not value else encoded


def _row_uuid(value, name):
    try:
        return str(UUID(str(value)))
    except (ValueError, TypeError, AttributeError):
        raise GenerationConfigurationError(name) from None


def resolve_generation_context(
    workspace_id: str,
    *,
    persona_id: str,
    licensed_person_name_loader: Optional[Callable[[Mapping], str]] = None,
) -> GenerationContext:
    """Caller must first authorize workspace + ai:generate.

    The optional loader is backend configuration, never request input. Until an
    owner-approved name source is implemented, omitting it fails closed. Tests
    supply a synthetic loader; no settings key or legacy name is assumed.
    """
    # UUID validation does not authorize workspace access.
    try:
        workspace_id = str(UUID(workspace_id))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError("workspace_id must be a valid UUID.") from None
    try:
        if not isinstance(persona_id, str):
            raise ValueError()
        persona_id = str(UUID(persona_id))
    except (ValueError, TypeError, AttributeError):
        raise ValidationError("persona_id must be a valid UUID.") from None

    persona = get_persona(workspace_id, persona_id)
    if persona is None:
        raise NotFoundError("The selected persona is unavailable in this workspace.")
    if not isinstance(persona, dict):
        raise GenerationConfigurationError("persona")
    if (_row_uuid(persona.get("workspace_id"), "persona.workspace_id") != workspace_id
            or _row_uuid(persona.get("id"), "persona.id") != persona_id
            or persona.get("deleted_at") is not None):
        raise NotFoundError("The selected persona is unavailable in this workspace.")

    profile = get_brand_profile(workspace_id)
    if not isinstance(profile, dict):
        raise GenerationConfigurationError("brand_profile")
    if _row_uuid(profile.get("workspace_id"), "brand_profile.workspace_id") != workspace_id:
        raise GenerationConfigurationError("brand_profile")

    business_name = _text(profile.get("business_name"), "business_name", 100,
                          required=True, single_line=True)
    identifiers = {}
    for name in ("nmls_id", "dre_number"):
        value = _text(profile.get(name), name, 20, required=True, single_line=True)
        if not re.fullmatch(r"[0-9]{1,20}", value) or not value.strip("0"):
            raise GenerationConfigurationError(name)
        identifiers[name] = value
    if licensed_person_name_loader is None:
        raise GenerationConfigurationError("licensed_person_name_source")
    licensed_name = _text(licensed_person_name_loader(profile), "licensed_person_name", 100,
                          required=True, single_line=True)

    brand = BrandContext(
        business_name=business_name,
        tone=_json_context(profile.get("tone"), "tone", dict, 4000),
        values=_strings(profile.get("values"), "values"),
        keywords=_strings(profile.get("keywords"), "keywords"),
        catchphrases=_strings(profile.get("catchphrases"), "catchphrases"),
        banned_words=_strings(profile.get("banned_words"), "banned_words"),
        blog_examples=_json_context(profile.get("blog_examples"), "blog_examples", (list, dict), 8000),
        compliance_footer=_text(profile.get("compliance_footer"), "compliance_footer", 1000),
        equal_housing_text=_text(profile.get("equal_housing_text"), "equal_housing_text", 500),
    )
    if type(persona.get("is_starter")) is not bool:
        raise GenerationConfigurationError("persona.is_starter")
    selected = PersonaContext(
        id=persona_id, workspace_id=workspace_id,
        slug=_text(persona.get("slug"), "persona.slug", 100, required=True, single_line=True),
        name=_text(persona.get("name"), "persona.name", 200, required=True, single_line=True),
        description=_text(persona.get("description"), "persona.description", 2000),
        audience_profile=_json_context(persona.get("audience_profile"), "persona.audience_profile", dict, 4000),
        prompt_guidance=_text(persona.get("prompt_guidance"), "persona.prompt_guidance", 4000),
        is_starter=persona["is_starter"],
    )
    return GenerationContext(workspace_id, LicenseIdentity(licensed_name, **identifiers), brand, selected)
