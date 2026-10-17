# Step I context contract — resolver slice

Status: resolver and mocked tests implemented; generation integration pending.
Prepared 2026-10-17. This contract describes implemented validation separately
from requirements for the subsequent prompt-builder and route slice.

## Trust boundary and invocation

The future route caller must run `require_workspace` and
`require_capability("ai:generate")` before invoking
`services.generation_context.resolve_generation_context` with `g.workspace_id`.
UUID validation in this service is not authentication or authorization.

The service accepts only an authorized workspace UUID string, a selected
`persona_id` UUID string, and an optional **backend-only** licensed-person-name
loader. It accepts no request body, client licensing, role, membership, workspace
override, or prompt-guidance override. Never bind the loader to request input.

It calls existing `get_persona(workspace_id, persona_id)` first, then
`get_brand_profile(workspace_id)` once each. It has no cache, Flask globals,
database writes, logging, model calls, or implicit defaults to a persona.
Repositories retain parameterized workspace-scoped SQL and the persona's
`deleted_at IS NULL` filter. Returned IDs are checked defensively. The repository
does not select `deleted_at`; if a future implementation includes it, a non-null
value is also rejected.

## Normalized result

Frozen dataclasses contain strings and immutable tuples; mutable repository
JSON is serialized to bounded JSON strings. Context, brand, persona, and identity
representations omit business text and identifiers. These objects are internal;
they are not API response schemas or authorization evidence.

| Stored field | Normalized field and rule |
| --- | --- |
| Authorized workspace | `GenerationContext.workspace_id`: canonical UUID |
| `business_name` | `brand.business_name`: required single-line text, 1–100 characters; never the licensee name |
| `nmls_id`, `dre_number` | `identity` fields: required strings of 1–20 ASCII digits, not all zeros; leading zeros preserved |
| Licensed person's name | `identity.licensed_person_name`: required single-line text, 1–100 characters, from an explicitly supplied backend loader |
| `tone` | `brand.tone`: JSON object, serialized to at most 4,000 characters |
| `values` | `brand.values`: JSON string array normalized to tuple |
| `keywords`, `catchphrases`, `banned_words` | Corresponding brand tuples from string arrays |
| `blog_examples` | JSON list or object, serialized to at most 8,000 characters |
| `compliance_footer` | Optional text, at most 1,000 characters; retained as untrusted context, not an approved footer |
| `equal_housing_text` | Optional text, at most 500 characters; cannot replace fixed required disclosure |
| `settings` | Not copied into generation context. No approved keys or licensed-person-name mapping exist yet |
| Persona `id`, `workspace_id` | Canonical UUIDs matching the selection and authorized workspace |
| Persona `slug`, `name` | Required single-line text, at most 100 and 200 characters respectively |
| Persona `description` | Optional text, at most 2,000 characters |
| Persona `audience_profile` | JSON object, serialized to at most 4,000 characters |
| Persona `prompt_guidance` | Optional text, at most 4,000 characters |
| Persona `is_starter` | Required boolean; not an automatic selection rule |

String arrays allow at most 40 elements, each at most 200 characters. Null
columns become empty tuples; empty strings are omitted, and non-string elements
are rejected. Optional text nulls become empty strings. JSON nulls and empty
containers become empty context strings. JSON has at most four nested levels,
40 entries per container, 100 characters per object key, and finite JSON numbers.
Unknown scalar types and control characters are rejected. Values are never
silently truncated. Required text is trimmed; multiline license identities are
rejected before trimming. Optional context keeps legitimate newlines.

These shapes follow the supplied schema/seed design: `tone` is JSONB object,
`values` JSONB array, voice keyword fields TEXT[], and audience profile JSONB
object. No live database types or records were inspected in this slice. An
incompatible stored shape produces a configuration error rather than arbitrary
coercion; a targeted schema check can resolve any actual mismatch later.

## Licensed identity decision remains open

The schema has no dedicated licensed-person name field. No settings key,
migration, business-name substitution, hardcoded Joseph fallback, or development
exception is implemented. Without a name loader the resolver fails with field
`licensed_person_name_source`. Synthetic tests supply a backend loader that
returns a synthetic name, proving the rest of the contract without choosing a
production representation.

The owner must decide the approved name source, required jurisdiction-specific
identifiers, who may edit/verify them, and disclosure wording before route
integration can enable generation. This slice conservatively requires both
existing identifier fields. Syntax checks do not verify licenses or certify
legal compliance. No existing settings key, historical number, or name is
treated as verified.

## Errors and precedence

| Condition | Domain response |
| --- | --- |
| Malformed workspace/persona selector | 400 `validation_error`, before repository reads |
| Missing, foreign, deleted, or mismatched persona | 404 `not_found`, before brand read |
| Missing/foreign profile, invalid stored fields, absent name source | 409 `generation_configuration_required`, with only the safe field name in details |
| Repository database outage | Existing 503 `database_unavailable` propagates |
| Unexpected programming/loader exception | Existing route-level sanitized 500 handling when wired |

No raw data, SQL, identifiers, or private text is added to configuration errors.
The service cannot call the provider. Subsequent route tests must separately
prove guards execute before context reads and no provider call occurs on errors.

Required trust order for the future builder: authorized workspace/capabilities;
immutable backend safety rules; validated identity; bounded brand/persona data;
current task; feature formatting. Stored text remains untrusted business context.
Validation and serialization alone do not solve prompt injection. The builder
must delimit it and preserve safety instructions and deterministic validators.
It must not treat arbitrary footer fields or settings as policy.

## Compatibility and remaining integration

Generation routes and frontend behavior are unchanged by this slice. The next
slice must replace conflicting Joseph-specific prompts, share one validated
identity/footer through chat, video, social-image and nested campaign paths,
and preserve response formats and `build_system` cache behavior.

The intended client contract is explicit database `persona_id` selection via a
workspace-scoped read-only list. `self-employed`, `custom`, and `custom-*` are
not UUIDs and this resolver rejects them. It does not auto-select a starter,
migrate local personas, alter local history, or delete browser data. Frontend
transition, Settings expansion and live acceptance remain subsequent work.
