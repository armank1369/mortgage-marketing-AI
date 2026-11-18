# Lucie environment configuration

Current reference for the Step J UI hotfixes and workspace-sharing implementation.
Start with the [README clone/install guide](../README.md#clone-and-install) for commands.
This document explains configuration; it does not provision or deploy infrastructure.

## Environment layout

| Environment | Application | Database/Auth | Configuration |
|---|---|---|---|
| Local development | Local React and Flask | Approved Neon development branch and matching Auth service | `client/.env`, `server/.env` |
| Preview/staging | Test deployment | Dedicated non-production DB/Auth environment | Hosting-provider variables |
| Production | Approved deployed application | Production DB/Auth environment | Deployment-managed secrets |

The latter two rows describe the intended separation, not verified deployment status.
Cloning the Git repository does not clone Neon data, create tables, add memberships,
create a brand profile or configure the Auth service. Obtain the approved existing
development environment from the team. Historical SQL/preflight scripts are not
installation steps. The UI/sharing hotfixes introduce no new environment variables
or required schema migration.

## Local files and variables

Copy the committed `.env.example` files to `.env` only if missing; the README provides
commands that preserve working local files. Replace placeholders before normal use.

| File/variable | Meaning |
|---|---|
| `server/.env` → `DATABASE_URL` | Approved Neon PostgreSQL connection string, including required SSL options |
| `server/.env` → `NEON_AUTH_BASE_URL` | Matching branch/environment Auth base URL |
| `server/.env` → `NEON_AUTH_JWKS_URL` | Optional override; blank derives `<base>/.well-known/jwks.json` |
| `server/.env` → `ANTHROPIC_API_KEY` | Backend provider credential for actual generation |
| `server/.env` → `ANTHROPIC_MODEL` | Team-approved model identifier; replace the example's `replace_me` |
| `server/.env` → `AI_PROVIDER` | Example defaults to `claude`; no alternate provider setup is introduced here |
| `client/.env` → `VITE_NEON_AUTH_URL` | Public Auth endpoint matching the backend's Auth base URL |

The PostgreSQL URL and Auth URL are different values. The database name can remain
`neondb` across branches; the hostname/branch determines which records/schema you
reach. A wrong branch can connect successfully but lack `public.workspace`.
Verify target/environment privately rather than printing connection strings.

`server/app.py` loads `server/.env` relative to itself before loading the database
layer. Existing process environment variables take precedence under dotenv's default
loading behavior. Vite loads client environment values for the selected mode; avoid
stale shell or `.env.local` overrides when investigating mismatches. Restart Flask
or Vite after changing its configuration.

`VITE_` variables are browser-visible. Database passwords, PostgreSQL URLs and provider
keys belong only on the backend. Real `.env` files are ignored by Git; example files
contain placeholders and are committed.

## Local startup and ports

From the repository root in separate PowerShell terminals:

```powershell
.\server\.venv\Scripts\python.exe server/app.py
```

```powershell
npm --prefix client run dev
```

Frontend: **http://localhost:3000**. Backend: **http://localhost:5001**.
`client/vite.config.js` forwards `/api` to Flask on 5001, so local frontend requests
need no extra API URL environment variable. If Vite selects another port because
3000 is occupied, resolve the conflict or verify the Auth origin configuration before
assuming the alternate origin will work. The dev servers bind to network interfaces;
Flask runs with debug enabled. Use a trusted development environment rather than
exposing these commands as production hosting.

On macOS/Linux, use `./server/.venv/bin/python` for the backend. There is no special
`runpy` workaround. Gunicorn is a Unix deployment dependency, not the Windows local
startup command. Deployment serving, proxy/CORS settings and worker timeouts must be
reviewed separately; the local Vite proxy is not a production deployment design.

## Login, membership and sharing

Neon Auth verifies identity; `public.workspace_member` grants workspace access.
Signing up alone does not provision membership. Flask verifies JWTs, selected workspace,
current membership and capabilities. A valid login can therefore coexist with 403
workspace responses. The workspace selector appears for multiple memberships; a
single authorized workspace resolves automatically.

Approved memberships must already be provisioned by an authorized administrator.
There is no automatic invitation, workspace creation or missing-brand-profile creation
UI. Older controlled SQL procedures are historical bootstrap references; coordinate
any actual provisioning against the correct target. Do not enable auth/workspace bypass
flags or grant every new signup access to a client workspace.

Saved chats are now shared across accounts in the selected workspace, including its
existing chats. Writers can continue/edit/archive/restore; viewers read/export. Brand
configuration permissions remain distinct: owner/admin, plus developer in development
or test. Members can write chats without permission to change shared brand settings.
No account, including a staff/admin account, gains access to another workspace without
membership. See the [authorization matrix](AUTHORIZATION_MATRIX.md).

Shared configuration and chat history use Neon. Calendar, legacy Local history and
pending browser request records retain their existing browser/account/workspace scope.
Unsent composer input is not a durable cross-device draft. No historical import or
calendar synchronization is performed by startup or account switching.

## Offline checks and live verification

Dependencies can be installed and the default backend/frontend suites run without
working DB/Auth/provider credentials. Default pytest blocks live PostgreSQL and skips
integration tests. The browser harness uses synthetic transport and fake outputs.
See the [README checks](../README.md#verify-the-installation) and
[testing guide](STEP_J_TESTING_GUIDE.md).

Normal signed-in use requires working DB/Auth configuration, approved memberships and
brand/persona settings. Normal Send/regenerate/clarify/media actions can invoke a paid
provider. Live integration tests need an approved disposable database and explicit
opt-in, and can create/delete fixture records. Neither is an installation step.

Live Auth/workspace/role/revocation acceptance, DB/RLS configuration, production secrets,
hosting/runtime behavior and paid output checks remain distinct from local synthetic
results. The optional `revoked_at` compatibility check does not itself provision a
soft-revocation lifecycle. Do not reuse production credentials for local synthetic tests.

## Related documentation

- [Current UI and workflow](CURRENT_UI_GUIDE.md)
- [Workspace chat sharing](WORKSPACE_CHAT_SHARING.md)
- [Current API and feature reference](STEP_J_FEATURE_AND_OPERATIONS_GUIDE.md)
- [Brand/persona context contract](STEP_I_CONTEXT_CONTRACT.md)
- [Documentation and setup verification](DOCUMENTATION_SETUP_SWEEP.md)

Step F/G/H/I reports and the prototype PDFs retain historical implementation evidence;
this document and the README replace their older browser-only chat/setup descriptions.
