# Lucie database: quick overview

> **Current reference: Neon `development` branch (October 23, 2026).** This describes Lucie's **development** database and the application behavior on the reviewed `codex/step-j-chat-persistence` feature branch. It is **not** evidence of a configured or verified production deployment. Some code paths have local/synthetic test coverage but still need live, multi-account acceptance.

## What Neon does for Lucie

Lucie is a mortgage-marketing assistant built with **React/Vite** (browser UI), **Flask** (server/API), **Anthropic Claude** (AI generation), and **Neon PostgreSQL** (durable application data). **Neon Auth**, a managed authentication system, handles account sign-in and sessions.

The basic path is:

```text
React browser -> Neon Auth sign-in -> authenticated Flask API
                                         |
                                         v
                             verify workspace membership
                                         |
                              authorized workspace only
                                         |
                      Neon PostgreSQL <-> Flask services -> Claude
```

The browser does **not** receive the PostgreSQL database password or Claude API key. A login proves *who someone is*; a workspace membership determines *which Lucie data they can use*.

## Accounts and workspace access

1. People may create their own Neon Auth account through the supported sign-up flow.
2. **Creating an account does not create or grant a Lucie workspace.** For now, the team intentionally assigns approved accounts to workspaces **manually**, through a controlled administrative process. There is no self-service workspace provisioning or invitation UI.
3. Flask verifies the signed-in user's token and looks up the current `public.workspace_member` entries. With one authorized workspace, it can select it automatically; with several, the user must select one. Without membership, workspace-protected features are unavailable.
4. A workspace is the **business/data boundary**. Its brand profile, personas and saved chats belong to that workspace. Membership and role determine the permitted actions.

**Current shared-chat policy (reviewed Step J branch):** saved database chats are visible to current members of their workspace. Owners/admins/developers/members may write/continue them; viewers may read/export but not generate or edit. Shared access is **not** access to other workspaces. Configuration editing has a separate role policy.

## What is stored

| Area | Main tables | Current status |
|---|---|---|
| Access | `workspace`, `workspace_member`; separate managed `neon_auth.*` | Used by authenticated backend |
| Business context | `brand_profile`, `persona` | Used for editable business/audience settings and validated AI context |
| Saved conversations | `chat_session`, `chat_message`, `ai_run` | Durable chats, linked operations and revisions in the reviewed Step J code |
| Future capabilities | `memory_item`, `retrieval_document`, `retrieval_chunk`, `chat_summary` | Schema exists; long-term memory/RAG/summarization are **not** implemented end-to-end |
| Other planned storage | Campaign, content, calendar and CRM-related tables | Tables exist; do **not** assume the UI uses them as the source of truth |

The **calendar, older local chat history and some pending browser state** remain browser-local. Step K work such as Joseph's historical ChatGPT import and final onboarding configuration remains separate and pending.

## Development is not production

The database schema described in these documents was inspected on the team's **Neon `development` branch**. The SQL export itself reports database `neondb`, but does not prove the branch name; `development` is the environment the team selected for the inspection. PostgreSQL databases on different Neon branches may share the name `neondb` yet have different data, schema and Auth endpoints.

**A production launch needs a separate review:** compare the actual production schema, apply **approved** migrations if needed, set up real workspaces/memberships and business details, verify authorization and database privileges, and configure production hosting and secrets. The development `.env` files **must not** be copied wholesale to production.

For local development, `server/.env` includes `DATABASE_URL` and `NEON_AUTH_BASE_URL`; `client/.env` includes `VITE_NEON_AUTH_URL`. They must refer to the **matching intended Neon branch/Auth service**. Production hosting should use managed environment variables or secrets, not committed `.env` files. See [existing environment guidance](../ENVIRONMENT.md).

**Security note:** all 24 inspected `public` application tables currently have **RLS disabled**, and no application RLS policies were returned. Flask authorization and workspace-filtered data access therefore remain essential. RLS and database-credential privileges require explicit production review.

## Read next

- [SCHEMA.md](SCHEMA.md) — actual development table/column/relationship reference.
- [ARCHITECTURE.md](ARCHITECTURE.md) — how Auth, Flask, PostgreSQL and AI generation fit together; production considerations.
- [WORKFLOWS.md](WORKFLOWS.md) — trace sign-in, settings changes, saved chat and collaboration through API/code.
- [AGENTS.md](AGENTS.md) — **instructions** for coding agents modifying the database-related system.
- [Existing authorization matrix](../AUTHORIZATION_MATRIX.md) and [current Step J guide](../STEP_J_FEATURE_AND_OPERATIONS_GUIDE.md) — detailed behavioral contracts.

**Documentation rule:** a database table's existence does not prove that a feature is implemented, tested live, or deployed. When documents disagree, verify current code, migration history and the actual intended Neon branch before changing anything.
