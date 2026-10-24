# Lucie database workflows: code-to-data traces

> **Scope:** intended implementation in GitHub `codex/step-j-chat-persistence`, cross-checked against the Neon **development** schema snapshot supplied October 23, 2026. These are **application-level paths**, not proof of production deployment or live multi-account acceptance. [Overview](README.md) · [Architecture](ARCHITECTURE.md) · [Schema](SCHEMA.md).

## Before tracing any request

```text
client/src/lib/authenticatedApi.js
    -> Authorization: Bearer <Neon Auth session token>
    -> optional X-Workspace-Id from selected account/workspace
    -> Flask: server/auth/workspace_context.py (require_workspace)
    -> token verification -> current workspace_member + workspace
    -> server/auth/permissions.py (required capability)
    -> services / repositories -> authorized SQL
```

The client workspace selection is **not** authorization; Flask must verify that the account currently belongs to that workspace. Role grants are capability-based, not a numeric role hierarchy. Every data read/write needs the authorized workspace boundary even when a record ID is known.

## 1. A person signs up but cannot use Lucie yet

**Trigger:** A new user creates an account through Neon Auth.

1. Neon Auth creates/manages the account and session under `neon_auth.*`; Lucie's application does not insert accounts or passwords in `public`.
2. The authenticated browser calls `GET /api/workspaces` via `client/src/lib/authenticatedApi.js`.
3. `server/auth/workspace_context.py:list_user_workspaces()` looks up `public.workspace_member` joined to `public.workspace` by the verified token subject (`auth_user_id`).
4. **No membership:** Lucie's workspace-protected API actions are denied. **One membership:** resolved automatically. **Multiple:** explicit selection required.
5. The team **manually** provisions memberships for approved accounts through a controlled administrative process; there is no self-service workspace creation or invitation UI. Don't use a guessed user ID or insert into managed `neon_auth.user`.

**Tables:** `neon_auth.*` (managed), `workspace_member`, `workspace`. **No automatic write to Lucie `public` tables on signup.**

**Security/test cases:** new user cannot access an unassigned workspace; members cannot switch to another workspace by changing a header; departed accounts lose access on later requests; unknown roles are rejected.

## 2. An authorized editor changes the brand profile

**Trigger:** An owner/admin (or developer in a development/test workspace) saves business settings.

1. UI editor `client/src/components/BrandProfileEditor.jsx` / Settings builds a bounded patch and calls authenticated `PUT /api/brand-profile`.
2. Flask (`server/app.py`) verifies JWT, workspace membership and `config:write` capability; UI permissions are not a substitute.
3. `server/services/configuration.py` validates allowed input and shapes.
4. `server/repositories/brand_profile_repository.py:update_brand_profile()` issues a parameterized workspace-filtered update; it does **not** automatically create a missing profile.
5. Data persists in `public.brand_profile`. Identity includes `business_name`, NMLS/DRE, and `settings.licensed_person_name` (inside JSONB, not a dedicated SQL column). Tone, tags and writing examples remain editable data.
6. **Future** generation re-reads and validates this workspace's current configuration; previously saved outputs remain unchanged.

**Important:** missing/invalid licensing fields may be saved as drafts, but generation fails with `generation_configuration_required`. Additional `compliance_footer` or `equal_housing_text` is **not** permission to override fixed compliance rules. `workspace_member.role=member` is not enough for `config:write`.

**Tables:** `brand_profile`, `workspace_member`, `workspace`.

## 3. An authorized editor creates or changes a persona

**Trigger:** A persona is added/edited from Settings.

1. UI `client/src/components/PersonaManager.jsx` sends `POST /api/personas` or `PUT /api/personas/<persona_id>`.
2. `server/app.py` enforces current membership plus `config:write` and validates a workspace-owned UUID.
3. `server/services/configuration.py` validates `slug`, `name`, description, `audience_profile` and `prompt_guidance`.
4. `server/repositories/persona_repository.py` inserts/updates a `public.persona` row restricted to the authorized workspace; active reads exclude `deleted_at IS NOT NULL`.
5. The new/updated persona can be chosen **for a new chat**. A saved chat's persona is locked; historical messages and previous output are not silently rewritten.

**Tables:** `persona`, `workspace`, `workspace_member`; `chat_session.default_persona_id` references the saved selection.

**Security/test cases:** foreign/deleted persona ID returns not found; invalid input never becomes prompt context; viewers/members cannot edit shared brand configuration.

## 4. A user sends a new message; Lucie saves it and responds

```mermaid
sequenceDiagram
    participant UI as React chat UI
    participant API as Flask guarded API
    participant DB as Neon PostgreSQL
    participant AI as Claude
    UI->>UI: Create stable session and operation UUIDs; save pending state locally
    UI->>API: PUT /api/chat/sessions/{id} (idempotent)
    API->>DB: Verify membership, capability, persona; create session
    UI->>API: POST /api/chat/sessions/{id}/operations
    API->>DB: Preflight + claim; commit operation and request before AI
    API->>DB: Load authorized brand/persona and bounded same-chat context
    API->>DB: Start ai_run stage and commit before dispatch
    API->>AI: Generate with bounded context
    AI-->>API: Result or error/uncertainty
    API->>DB: Commit assistant result + ai_run outcome together
    API-->>UI: Saved response/status
```

1. A **new chat is unsaved until first Send**. Persona cards/guideline review confirm the selection. `client/src/lib/chatPersistence.js` records stable pending identifiers in scoped browser storage before sending.
2. `PUT /api/chat/sessions/{client_uuid}` is idempotent. The durable API lives in `server/services/chat_http.py`, with data-access code in `server/repositories/chat_persistence_repository.py`.
3. `POST /api/chat/sessions/{id}/operations` checks `chat:write` and—for provider-backed actions—`ai:generate`. The backend resolves the authorized workspace, validates the stored session and locked persona, and prevents foreign-session/source access.
4. `server/repositories/generation_operation_repository.py` prepares the request; chat persistence transactionally **claims the operation before paid generation**. Retry/replay of the same request must not trigger a second provider call.
5. `server/services/generation_context.py` loads and validates the workspace's brand profile and selected persona. `server/services/conversation_context.py` projects **up to 6 completed exchanges / 16 KiB** of relevant same-conversation history; bounded recent completed *workspace* ideas are separately consulted when applicable.
6. `server/services/generation_operations.py` records an `ai_run` stage before provider dispatch, invokes Claude through `server/services/generation.py`, then saves the assistant `chat_message` and final run status atomically where possible. Saved normalized payloads include operation/revision/media lineage in `chat_message.structured_data`.
7. React shows the persisted result and clears the matching local pending entry. Reopening the chat retrieves history; it does **not** call Claude again.

**Primary tables:** `chat_session`, `chat_message`, `ai_run`, `brand_profile`, `persona`, `workspace_member` and `workspace`.

**Not this flow:** no automatic semantic memory extraction, vector RAG retrieval or `chat_summary` generation. The presence of those tables in SQL does not imply they are invoked.

## 5. The provider call times out or the user reloads

1. The frontend may lose the response while the server/model call is still running. A browser timeout is **not** proof that the AI call did not happen.
2. UI preserves the pending operation key and can query `GET /api/chat/sessions/{id}/operations/{key}`. This is a **read-only status** operation and does not dispatch generation.
3. The backend tracks `running`, `succeeded`, `failed`, `unknown` or `abandoned` outcomes using existing message/operation records (no new Step J schema migration was required for workspace sharing).
4. For **unknown** outcomes, user acknowledgement is required before abandonment/new attempt. A retry of the exact completed request returns stored status/results; it does **not** silently spend additional model tokens.
5. Transactional fencing protects a live worker from a collaborator's stale changes. A caller whose membership is revoked does not gain access merely by knowing the operation key.

**Primary code:** `client/src/lib/chatPersistence.js`, `server/services/chat_http.py`, `server/repositories/chat_persistence_repository.py`, `server/repositories/generation_operation_repository.py`, `server/services/generation_operations.py`.

**Tests to preserve:** replay without second provider call, stale source rejection, no competing generations per chat, role enforcement on all operation paths, no raw claim token returned to the client.

## 6. A second authorized person opens or continues the same workspace chat

1. Two accounts must each have a valid `workspace_member` record for the **same** `workspace`.
2. A reader calls `GET /api/chat/sessions?version=2` and then `GET /api/chat/sessions/{id}?version=2`; repository lookups enforce workspace scope, not creator identity.
3. Writers (owner/admin/developer/member) can continue, revise, rename, archive or restore; viewers can read/export but not mutate or generate.
4. `chat_session.created_by_member_id` preserves the original creator; `chat_message.author_member_id` records each acting verified member. The system must not overwrite authorship with the currently logged-in account.
5. The UI periodically refreshes a visible shared chat and on refocus/reconnect; this is **polling**, not realtime collaborative editing. Unsent local composer content remains browser-scoped.
6. Archive/restore is shared state, so it affects **all** workspace members. Metadata ETags and stale-source checks protect against conflicting edits.

**Important transition:** this **supersedes** earlier Step G/J creator-private behavior. The new policy was validated largely with synthetic local tests; true multi-account Neon Auth and database acceptance remain separate. Existing chats can become visible to other workspace members after sharing-enabled backend deployment—review the privacy impact before launch.

Source: [`../WORKSPACE_CHAT_SHARING.md`](../WORKSPACE_CHAT_SHARING.md).

## 7. A chat is regenerated, shortened or exported

- **Regenerate:** a new linked assistant version uses the stored original task and the locked persona with **current** brand configuration. The previous response remains saved; stale-source checks prevent silently replacing a newer source.
- **Make it shorter:** deterministic text shortening happens without a Claude API call, retains full required disclosure/flags and creates a linked result.
- **Export:** the browser paginates through authorized history and produces a versioned JSON export containing saved structured outputs, revisions and relevant metadata. Export does not write/import the chat into another workspace.
- **Social image:** the persisted artifact is a validated *render specification* (template/slots/business identity/disclosure). The PNG is rendered/downloaded in the browser; the Step J flow does not automatically store a binary image in PostgreSQL.
- **Calendar:** remains browser-local despite `public.calendar_entry` existing. Do not document a cross-device calendar sync feature.

## 8. Switching from development to production (future checklist)

**This is a separate deployment project, not a SQL procedure to run now.**

1. Identify the **intended production** Neon database branch and matching Neon Auth environment. Never infer the branch from database name alone (`neondb` can exist in several branches).
2. Compare the production schema with the inspected development schema and the approved migrations; plan backup/rollback and run only approved changes. Do **not** replay historical initial-schema SQL against a live database without reconciliation.
3. Provision legitimate production accounts, `workspace`, `workspace_member`, `brand_profile` and approved personas. Do not copy developer/test memberships or fake data as production defaults.
4. Configure deployment-managed backend `DATABASE_URL`, `NEON_AUTH_BASE_URL`, optional `NEON_AUTH_JWKS_URL`, and provider secrets/model; configure browser-visible `VITE_NEON_AUTH_URL` for the **matching Auth service**. Avoid committing `.env` files or exposing PostgreSQL/provider credentials via `VITE_` variables.
5. Review database grants and least privilege, RLS decision, domains/origins, secrets, backups, logging, revocation, isolation and real end-to-end behavior. The inspected development schema has **no application RLS policies**.
6. Test signup with no membership, one and multiple memberships, writer versus viewer, foreign workspace denial, real two-account chat sharing and safe provider recovery before declaring production-ready.

For commands to run locally, see [`../ENVIRONMENT.md`](../ENVIRONMENT.md). For fuller API semantics, see [`../STEP_J_FEATURE_AND_OPERATIONS_GUIDE.md`](../STEP_J_FEATURE_AND_OPERATIONS_GUIDE.md).

## Maintenance

Update this file when an API route, repository path, authorization boundary, persistent-data shape or chat recovery contract changes. Each example should state whether it is **implemented**, **tested locally**, **live-verified**, or **planned**. Never use actual customer messages, account identifiers, credentials or private log outputs as examples.
