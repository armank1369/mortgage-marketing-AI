# Step I context contract

Status: implemented across backend generation, configuration APIs and frontend.
Updated 2026-10-18. Developer-reported basic acceptance and unconfirmed live cases
are distinguished in the [current report](STEP_I_IMPLEMENTATION_AND_TESTING.md).

## Trust boundary and invocation

Every generation route runs `require_workspace` and
`require_capability("ai:generate")` before invoking
`services.generation_context.resolve_generation_context` with `g.workspace_id`.
UUID validation in this service is not authentication or authorization.

The service accepts only an authorized workspace UUID string, a selected
`persona_id` UUID string. It accepts no request body, client licensing, role,
membership, workspace override, or prompt-guidance override. The licensed name
is read from `brand_profile.settings.licensed_person_name`, as approved by the owner.

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
| Licensed person's name | `identity.licensed_person_name`: required single-line text, 1–100 characters, from `settings.licensed_person_name` |
| `tone` | `brand.tone`: JSON object, serialized to at most 4,000 characters; UI displays `voice` only when it is text and preserves other JSON |
| `values` | `brand.values`: JSON string array normalized to tuple |
| `keywords`, `catchphrases`, `banned_words` | Corresponding brand tuples from string arrays |
| `blog_examples` | JSON list or object, serialized to at most 8,000 characters |
| `compliance_footer` | Optional text, at most 1,000 characters; retained as untrusted context, not an approved footer |
| `equal_housing_text` | Optional text, at most 500 characters; cannot replace fixed required disclosure |
| `settings` | Only `licensed_person_name` is read for identity; arbitrary settings are never returned or included in prompts |
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
object. No agent-operated live schema/record inspection was performed during
implementation or final review; developer UI acceptance is recorded separately. An
incompatible stored shape produces a configuration error rather than arbitrary
coercion; a targeted schema check can resolve any actual mismatch later.

## Approved licensed identity contract

The owner approved `brand_profile.settings.licensed_person_name` in this session.
GET/PUT `/api/brand-profile` expose a flat `licensed_person_name` field; the repository
merges only that key into JSONB settings atomically, preserving unrelated settings.
No dedicated column, migration, business-name substitution, legacy identity fallback
or development exception is used. Missing name or either identifier fails before
any provider call. Identifier syntax checks do not verify licensing or certify
legal compliance. Editors must configure independently verified facts.

Draft configuration can be saved with empty identity strings, but generation then
fails closed. Full arbitrary settings editing is not exposed. `config:write`
remains authoritative: owner/admin; developer only in development/test.

## Errors and precedence

| Condition | Domain response |
| --- | --- |
| Malformed workspace/persona selector | 400 `validation_error`, before repository reads |
| Missing, foreign, deleted, or mismatched persona | 404 `not_found`, before brand read |
| Missing/foreign profile, invalid stored fields, missing licensed-person name | 409 `generation_configuration_required`, with only the safe field name in details |
| Repository database outage | Existing 503 `database_unavailable` propagates |
| Unexpected programming exception | Existing route-level sanitized 500 handling |

No raw data, SQL, identifiers, or private text is added to configuration errors.
The service cannot call the provider. Real guarded route tests with mocked repositories
and provider verify guards execute before context reads and no provider call occurs on errors.

Implemented prompt trust order: authorized workspace/capabilities;
immutable backend safety rules; validated identity; bounded brand/persona data;
current task; feature formatting. Stored text remains untrusted business context.
Validation and serialization alone do not solve prompt injection. The builder delimits it as JSON, escapes delimiter-looking content, and preserves fixed
safety instructions and deterministic validators. Prompt construction tests do not
prove immunity to model-level prompt injection. Optional disclosure text is literal
supplemental text; it cannot remove the fixed identity/EHO minimum.

## Prompt and output contract

`services/prompt_builder.py` combines fixed policies, the authorized workspace,
validated identity, and bounded brand/persona JSON. The generic base no longer
contains Joseph-specific voice or an implicit hardcoded audience. Policy templates
receive identity substitutions in one pass; database text is not interpreted as a
template. Configured literal substitutions escape quotes/newlines. Empty optional
voice uses clear, professional educational language; immutable forbidden phrases
remain active alongside configured brand banned words.

`build_system` keeps the existing one-hour ephemeral cache breakpoint and uncached
variable blocks. Scoped brand/persona/identity are included in the cached prefix,
so changes produce different prefixes; request content stays in user messages.
Context is re-read each generation request, with no application cache or history
retrieval. Campaign clarification reuses the same context as the main call.

One footer builder supplies name, NMLS, DRE and `Equal Housing Opportunity`, followed
by any bounded supplemental disclosure and equal-housing text. Chat/posts/campaign
validators and video end cards use it. Social-image JSON preserves `template` and
`slots`, adding server `compliance_footer`, `business_name` and `compliance_flags`;
all six React templates render that footer. The model cannot choose image attribution
in place of the configured broker. Prompt and output checks retain human-review
notes; no legal certification is claimed.

## Configuration API and frontend compatibility

- GET/PUT `/api/brand-profile`: reads require `workspace:read`; writes require
  `config:write`. Existing business-name calls remain valid; expanded responses
  add approved fields, `exists` and `can_write`. Missing profile GET remains 200
  with `exists=false`; PUT remains 404, never false saved success.
- PUT is a top-level field patch. Omitted fields remain unchanged. Supplied
  tone/examples/arrays replace that field; the tone editor preserves existing
  tone keys while editing `voice`. Optional fields clear with empty text/array/
  object; nulls and unknown fields are rejected. Name writes merge settings.
- GET `/api/personas`: `workspace:read`, active workspace rows only, safe field
  projection and `can_write`. POST and PUT `/api/personas/<persona_id>` require
  `config:write`; create requires name/slug, with server-owned `is_starter=false`.
  Slugs are 1–100 lowercase ASCII characters, alphanumeric words with hyphens.
  Updates preserve omitted fields and constrain workspace and soft-deleted state.
- Generation requires an explicitly selected database UUID. Old `persona` keys
  are not mapped, and request-body NMLS/DRE/name values are ignored as authority.
  Unknown selections fail, never silently default to the business-owner persona.
- Each chat stores an explicitly chosen generation UUID in `generationPersonaId`
  within the existing account/workspace-scoped browser chat record. This selection
  takes precedence over the original persona snapshot and survives chat switching
  and reloads. Clearing it is explicit; unavailable/deleted/foreign selections do
  not silently fall back. Original persona data and historical message UUIDs are
  preserved. New chats without an override can use their original database persona.
- Workspace/account remounts abort provider/editor/nested generation requests;
  shared scoped transport also rejects late workspace responses. Backend guards
  recheck current membership on each request.
- Onboarding keeps pick/review/use stages with the shared persona editor. Legacy
  browser personas remain local. Selecting a database persona explicitly preserves
  a complete legacy snapshot in scoped preferences. An explicit review/copy action
  creates a draft and requires Save; no automatic insert/migration occurs.
- Preference storage retains unknown/historical fields and performs no read-time
  migration. Existing chat/calendar storage scope and history behavior are retained.
  Step J persistence and cross-device historical migration remain out of scope.

## Persistence and workspace UX acceptance

Brand/profile and persona **definitions** are shared Neon workspace configuration.
The developer confirmed those saves appear in multiple browsers using the same
account on the one development workspace. Chat messages, local preferences and
per-chat `generationPersonaId` remain scoped browser records; they are not shared
conversation persistence or a server-saved account default. The older-chat
selection hotfix requires an explicit choice and never maps a legacy ID silently.

One recognized membership is selected automatically. A Workspace dropdown appears
for multiple authorized memberships or unresolved selection; sidebar conversation
names are not workspace names. The UI cannot create workspaces, invite users or
change memberships. New workspace/member/profile provisioning is a separately
approved database operation, not part of Step I or the review-only voice/persona
seed. Multi-workspace live switching was not run; automated isolation coverage
and developer-reported same-account cross-browser persistence are separate evidence.
