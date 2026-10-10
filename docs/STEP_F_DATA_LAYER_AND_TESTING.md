# Lucie — Step F Data Layer and Testing Handoff

**Patch basis:** `armank1369/mortgage-marketing-AI` branch
`feature/amogh-login-security-addon`, commit
`e64d32a11f6d5afb042a4f66f380974c7ac92313` (2026-10-10 UTC).
**Scope:** backend F.10 auth-to-workspace correction, focused cleanup,
regression tests, and documentation. Do not mistake this patch for a completed
chat synchronization or historical-data migration.

## Overview for teammates

Step D proved database connectivity; Step E added Neon Auth sign-in and Flask
JWT validation (`/api/auth/me`); Step F introduced reusable PostgreSQL pooled
connections, workspace-scoped brand/persona/chat repositories, transactions,
error types, and tests. **The existing ChatPage still uses browser localStorage**
(`lucent_chats`) and calls legacy `/api/chat` for generation. The SQLite
anti-repetition data store remains. Chrome/Edge chat lists do not synchronize
just because both browsers sign into the same Neon Auth account.

This patch corrects the distinction between authentication (verified identity)
and authorization (membership in `public.workspace_member`). The earlier
`@require_workspace` looked for `g.auth_user_id` without calling JWT verification;
a browser request to `/api/brand-profile` sent a valid bearer JWT but received
HTTP 403 with `Unauthenticated: Valid Neon Auth session or token required.`
It also accepted a client-supplied `X-Dev-Auth-User-Id` under development flags
and could give unknown users the development workspace with role `admin`.

### Patch behavior

1. `@require_workspace` calls Step E's **existing** `authenticate_request()`
   on **every request**, preserving its 401/500/503 responses. Only verified
   JWT `sub` is used to authorize a workspace.
2. Database membership is **mandatory**; the automatic dev workspace admin
   fallback and dev identity header bypass have been removed, even if legacy
   flags remain in a developer's environment. A valid JWT with no membership
   gets HTTP **403** (expected until provisioned).
3. App domain errors now respond as `{ "error": "workspace_access_denied",
   "message": "..." }` with correct status codes instead of using the freeform
   message in the `error` field.
4. F.10 tests now exercise the actual authentication function (mocked JWKS
   signing key, decode result) as well as membership checks. They do **not**
   claim to verify real Neon Auth cryptography/networking.
5. Smoke scripts now find `server/.env` independently of current directory.
   Database pool shutdown is registered at process exit to reduce the Python
   3.14 `PythonFinalizationError` warnings seen in one-shot scripts.

## Setup on a clean Windows device

Recommended: Python 3.11 or 3.12 in a virtual environment, Node.js compatible
with the repository's Vite 8 requirements, Git, and access to the **Neon
`development` branch**. Do not commit live credentials.

From the repository root on the correct branch:

```powershell
# Git Bash equivalents: use 'source .venv/Scripts/activate' or call python directly.
git status --short
git rev-parse HEAD
cd server
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Add real **development-only** values to `server/.env`:

```dotenv
DATABASE_URL=postgresql://ROLE:PASSWORD@DEVELOPMENT-POOLER/neondb?sslmode=require
NEON_AUTH_BASE_URL=https://DEVELOPMENT-AUTH/neondb/auth
NEON_AUTH_JWKS_URL=
ANTHROPIC_API_KEY=YOUR_KEY
ANTHROPIC_MODEL=YOUR_WORKING_MODEL
```

`DATABASE_URL` is the **database** connection, not the auth URL. In Neon,
choose the **development** branch, `neondb`, and a suitable role, then copy the
connection string using **Connect**. Earlier we found an erroneous host pointed
to a different branch whose `public.workspace` table was missing. `NEON_AUTH_*`
settings must target the corresponding Auth environment; they do not replace
`DATABASE_URL`.

React frontend: in `client/`, create `.env` from `client/.env.example`, provide
`VITE_NEON_AUTH_URL` matching the development Auth branch. Run `npm ci`, then
`npm run dev`. Backend (another terminal in `server/`): `python app.py`.
Expected local ports: React `http://localhost:3000`, Flask `:5001`.
A Flask terminal is occupied while the server runs; execute tests in another
terminal. This patched `app.py` loads `server/.env` before DB imports; no
`runpy` special command is needed. In Git Bash, Windows `\` paths may need `/`.

## Critical: provision explicit workspace membership

Your Neon Auth test account may authenticate successfully yet get 403 on
workspace routes: a JWT **does not** create a membership automatically.
Using the Neon SQL Editor **on the development branch**, run read-only queries
first (replace the placeholder with the auth user ID shown under Settings):

```sql
SELECT current_database(), to_regclass('public.workspace'),
       to_regclass('public.workspace_member'),
       to_regclass('public.brand_profile'), to_regclass('public.chat_session');
SELECT id, slug, name, environment
FROM public.workspace WHERE slug = 'lucie-development';
SELECT wm.auth_user_id, wm.workspace_id, wm.role, w.slug
FROM public.workspace_member wm
JOIN public.workspace w ON w.id = wm.workspace_id
WHERE wm.auth_user_id = 'REPLACE_WITH_YOUR_VERIFIED_NEON_AUTH_USER_ID';
```

If no row exists, arrange for an authorized database administrator to create a
correct development membership under the project's actual column defaults,
role constraints, and provisioning policy. **Do not invent a role value or
insert an automatic admin membership.** Avoid changes to production or
someone else's user memberships. Authorization after this patch is designed to
fail closed until membership is provisioned.

## What to test, and what modifies data

| Test | Command from `server/` | Expected | Side effects |
|---|---|---|---|
| JWT/workspace mocked regression | `python -m pytest tests/test_workspace_context.py -v` | All tests pass, including 401/403/200 | No DB writes from test body (test initialization still reads config) |
| Brand read / isolation | `python -m pytest tests/test_brand_profile_repository.py::test_get_existing_brand_profile tests/test_brand_profile_repository.py::test_brand_profile_isolated_from_foreign_workspace -v` | 2 pass | Read-only |
| Unknown persona lookup | `python -m pytest tests/test_persona_repository.py::test_query_unknown_persona -v` | 1 pass | Read-only |
| Chat repository | `python -m pytest tests/test_chat_repository.py -v` | 2 pass | Creates and deletes synthetic DB rows |
| Full brand + persona suite | `python -m pytest tests/test_brand_profile_repository.py tests/test_persona_repository.py -v` | Existing tests pass | **Updates a real brand profile**, creates/updates/deletes personas; use an isolated disposable Neon test branch |
| DB smoke | `python scripts/db_smoke_test.py` | Prints `lucie-development` workspace | Read-only |
| Persistent synthetic chat | `python scripts/manual_chat_persistence_check.py create`, then `read ID`, then `delete ID` | The second process reads the same message | Inserts and deletes a synthetic chat |

**Never run write tests against production.** On a shared development branch,
coordinate first; interruption during a test may leave changes behind. The
synthetic persistence helper is already committed on this branch; it is *not*
a standard part of the ChatPage UI. Its `delete` command is destructive for the
specific synthetic ID, so retain the ID and clean up carefully. The repository
connection and table-read tests are independent of browser sign-in.

## Real browser-to-Flask check — required before F.10 approval

1. Start Flask (`python app.py`) and Vite (`npm run dev`) with matching
   **development** Auth and DB configuration.
2. At `http://localhost:3000`, sign in, open Settings and select
   **Test Backend Identity**. `/api/auth/me` should verify the JWT.
3. In browser DevTools **Console** on that page run the following. It does
   **not** log the JWT; do not paste session tokens into screenshots:

```js
(async () => {
  const { authClient } = await import('/src/lib/neon/neon.js');
  const { data, error } = await authClient.getSession();
  if (error || !data?.session?.token) {
    console.log('No Neon Auth session');
    return;
  }
  for (const path of ['/api/brand-profile', '/api/chat/sessions']) {
    const response = await fetch(path, {
      headers: { Authorization: `Bearer ${data.session.token}` }
    });
    console.log(path, response.status, await response.json());
  }
})();
```

Expected with a **real membership**: `/api/brand-profile` returns 200 if a
profile exists (404 if it does not); `/api/chat/sessions` returns 200 with an
array. Missing token should return **401**; a valid token with **no workspace
membership** should return **403**. A user claiming another workspace via
`X-Workspace-Id` should also receive **403**. Avoid posting tokens or secrets
in chat or logs. `@require_workspace` routes should never accept
`X-Dev-Auth-User-Id` in place of a JWT.

These live scenarios are **not covered** simply by the existing pytest suite;
record both response status and whether membership was provisioned.

## Acceptance, remaining gaps, and ownership

- [ ] Patch applies cleanly on the exact base SHA (or has been rebased/reviewed).
- [ ] Backend and frontend start on teammate's device; correct development
      endpoints chosen; no `.env` committed.
- [ ] New F.10 tests pass and original repository tests stay green.
- [ ] `/api/auth/me` proves actual JWT verification (Step E regression).
- [ ] Real member's `/api/brand-profile` and `/api/chat/sessions` succeed.
- [ ] Missing/invalid JWT and cross-workspace requests fail closed.
- [ ] Any synthetic chat is cleaned up; no real brand/persona data remains altered.
- [ ] Team reviews and agrees to merge F.10 correction only after the live test.

**Still out of scope:** migration of old local browser chats to Neon; full
frontend CRUD and cross-browser sync; complete user/role admin policies;
refactoring legacy SQLite history; RAG and long-term memory. Those are later
integration features, not demonstrated by these Step F tests.

**Known test limitations:** one existing brand `test_database_connection_failure_handling`
simulates a local exception rather than exercising actual pool failure;
repository-level isolation does not alone prove all HTTP endpoints enforce
workspace authorization. The patched tests focus on F.10 correctness, and a
live API verification remains mandatory.

## Patch application

See the ZIP root `APPLY_AND_VERIFY.md` for a clean, repeatable Git procedure.
Keep this file on the Step F branch so the next teammate has a stable guide.
