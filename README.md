# Lucie — Mortgage Marketing AI Assistant

Lucie helps Lucent Brokerage create social posts, campaigns, video briefs and social
image specifications. React provides the UI; Flask handles generation, authentication
and workspace authorization; Neon PostgreSQL stores brand settings, personas and chats.
Anthropic provides AI generation.

## Start here

- **New developer:** follow [Clone and install](#clone-and-install), then [Run locally](#run-locally).
- **Using the current UI:** see the [UI and workflow guide](docs/CURRENT_UI_GUIDE.md).
- **Access and collaboration:** see [Workspace chat sharing](docs/WORKSPACE_CHAT_SHARING.md) and the [authorization matrix](docs/AUTHORIZATION_MATRIX.md).
- **Configuration:** see [Environment configuration](docs/ENVIRONMENT.md).
- **Maintainers:** see the [feature/API guide](docs/STEP_J_FEATURE_AND_OPERATIONS_GUIDE.md), [UI recovery/parity report](docs/LEGACY_RECOVERY_PATCH.md) and [testing guide](docs/STEP_J_TESTING_GUIDE.md).
- **Database design:** start with the [database overview](docs/database/README.md), then consult the [schema](docs/database/SCHEMA.md), [architecture](docs/database/ARCHITECTURE.md) and [workflows](docs/database/WORKFLOWS.md).

The current development branch is **`codex/step-j-chat-persistence`**, including the
UI hotfixes and workspace sharing. `main` is the presentation-era UI reference;
`luciev2_newteam` is an earlier development baseline. Clone the branch below to test
these changes. These instructions describe local development, not deployment.

> The database references describe the Neon `development` branch inspected October 23, 2026; they do not certify production. Production requires an independently verified schema, approved migrations, matching database and Auth configuration, securely managed environment variables, provisioned workspace access and separate live security testing.

## What is implemented

- First use and New Chat open persona cards, followed by review and confirmation.
  A saved chat keeps one persona; start a new chat for another audience.
- Brand setup restores numbered 1–5 tone choices, optional age-range slider and
  income/education fields, audience guidance and a persistent Brand Summary.
  Keywords, catchphrases, banned words and values use removable tags. Writing
  examples use sample cards; routine brand editing requires no JSON syntax.
- The sidebar has stacked Chat, Calendar and New Chat controls, persona labels,
  previews and content-type badges. Suggestions rotate with More.
- Database chats are shared within their workspace. Writers can continue, rename,
  revise and archive/restore them; viewers can read/export. Original authorship and
  previous revisions remain preserved. Archive/restore affects all workspace members.
- Selected-chat JSON export includes all history pages, structured outputs, revisions,
  persona snapshots and review flags. Cross-chat idea avoidance uses bounded recent
  completed outputs from the selected workspace.
- Brand/persona changes affect future generation. Saved output remains unchanged.
  Uncertain requests require explicit recovery; reopening never regenerates output.

Calendar and legacy Local history remain browser-local. Unsent composer text is not
promised to survive a reload. There is no automatic historical import, synchronized
calendar, invitation UI, workspace-creation UI, Save Draft storage or long-term/RAG
memory. AI output still requires human review before publication.

## Clone and install

Commands below use **Windows PowerShell**. Run them in order. No virtual-environment
activation or PowerShell execution-policy change is required.

### 1. Install prerequisites

Install Git, Python **3.11 or newer** with pip/venv, and Node.js **22.12 or newer**
with npm. Node 24 is used in the local verification environment. Verify in a new terminal:

```powershell
git --version
py -3 --version
node --version
npm --version
```

If `py` is unavailable but `python --version` reports a compatible Python, use
`python` in place of `py -3` when creating the virtual environment. If PowerShell
blocks `npm.ps1`, use `npm.cmd` in place of `npm`; changing execution policy is unnecessary.

An installed Chrome or Edge is needed only for the optional browser acceptance test.
No local PostgreSQL server, Docker, global Vite/Flask install, Playwright or separate
JavaScript package manager is required for this setup.

### 2. Clone the current development branch

From the parent folder where you want the project:

```powershell
git clone --branch codex/step-j-chat-persistence https://github.com/armank1369/mortgage-marketing-AI.git
cd mortgage-marketing-AI
git branch --show-current
```

The last command should print `codex/step-j-chat-persistence`. GitHub authentication
may be required if your account does not already have repository access.

For an **existing checkout**, use this instead, starting inside that checkout:

```powershell
git status --short
git fetch origin
git switch codex/step-j-chat-persistence
git pull --ff-only
```

If the local branch does not exist, use
`git switch --track origin/codex/step-j-chat-persistence` instead of `git switch` above.
Preserve any uncommitted work before switching/updating; do not discard it. Run the
installation commands again after dependency files change.

### 3. Install backend dependencies

From the **repository root**:

```powershell
py -3 -m venv server/.venv
.\server\.venv\Scripts\python.exe -m pip install --upgrade pip
.\server\.venv\Scripts\python.exe -m pip install -r server/requirements.txt
.\server\.venv\Scripts\python.exe -m pip check
```

`server/requirements.txt` installs Flask, CORS, Anthropic, dotenv, PostgreSQL driver
and connection pooling, JWT/cryptography support, Gunicorn and pytest, plus their
transitive dependencies. The binary PostgreSQL driver avoids a separate libpq setup.
Gunicorn is for Unix deployment; local Windows startup uses Flask below.

Use this virtual environment's Python for subsequent backend commands. An existing
`server/venv` also works, but substitute its path consistently; new setup uses `.venv`.

### 4. Install frontend dependencies

Still from the **repository root**:

```powershell
npm --prefix client ci
```

This installs both runtime and development dependencies from `client/package-lock.json`,
including React, Vite, Tailwind, Oxlint, the Neon client and image export support.
Keep development dependencies installed for local development and tests. There is no
root `package.json`; run npm with `--prefix client` or from inside `client/`.

### 5. Create local configuration files

These commands create missing files without overwriting existing configuration:

```powershell
if (!(Test-Path server/.env)) { Copy-Item server/.env.example server/.env }
if (!(Test-Path client/.env)) { Copy-Item client/.env.example client/.env }
```

Edit both files and replace the example placeholders:

| File | Variable | Value to obtain from the team |
|---|---|---|
| `server/.env` | `DATABASE_URL` | Approved development Neon PostgreSQL connection string; retain required SSL options |
| `server/.env` | `NEON_AUTH_BASE_URL` | Neon Auth URL for the matching development environment |
| `server/.env` | `NEON_AUTH_JWKS_URL` | Optional override; leave blank to derive it from the Auth URL |
| `server/.env` | `ANTHROPIC_API_KEY` | Approved development provider key; needed for actual generation |
| `server/.env` | `ANTHROPIC_MODEL` | Team-approved model identifier, replacing `replace_me` |
| `client/.env` | `VITE_NEON_AUTH_URL` | Same Auth base URL as the backend |

Leave the example's `AI_PROVIDER=claude` unchanged. Keep database credentials and
provider keys on the backend, never in `VITE_` variables. Real `.env` files are ignored
by Git. Restart the affected server after changing configuration.

**Cloning and installing do not provision Neon.** Normal signed-in use requires an
existing compatible development schema, workspace, brand profile and membership for
your Auth account. Request the approved development configuration and membership
from the team. Sign-up alone grants no workspace access. An authorized configuration
editor can create personas in the UI, but the UI cannot create the initial workspace
or missing brand-profile row. The UI/sharing hotfixes require no schema migration.
Do not run old seed/preflight SQL as an installation step.

Offline tests below can run without working Neon/Auth/provider credentials.

## Run locally

Open **two PowerShell terminals**, both starting at the repository root.

Terminal 1 — Flask API:

```powershell
.\server\.venv\Scripts\python.exe server/app.py
```

Terminal 2 — React/Vite:

```powershell
npm --prefix client run dev
```

Open **http://localhost:3000**. Flask listens at **http://localhost:5001**; Vite proxies
`/api` to it. Keep both terminals running; Ctrl+C stops each process. No frontend API
key or additional API URL variable is needed for this local proxy configuration.
The development servers bind to network interfaces and Flask enables debug mode;
these commands are for a trusted local development environment.

Sign in, select a workspace if offered, then select/review a persona and confirm its
guidelines before composing. The chat is saved on the first accepted Send. Reopen a
saved chat from any account with membership in that workspace. Changes from teammates
refresh on focus/reconnect and approximately every 15–16 seconds while visible/online.

On macOS/Linux, replace `py -3` with `python3` and the executable path
`.\server\.venv\Scripts\python.exe` with `./server/.venv/bin/python`; use `cp` to copy
missing `.env` files. The npm commands are the same. Python 3 and venv support must
already be installed by your operating system/package manager.

## Verify the installation

From the repository root, using the environment installed above:

```powershell
.\server\.venv\Scripts\python.exe -m pytest server/tests -q
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
git diff --check
```

Default backend tests block live PostgreSQL connections and skip opt-in integration
checks. Frontend tests use synthetic fixtures. These commands do not require live
credentials or paid generation and do not prove live login/database connectivity.

Optional browser acceptance, with installed Chrome/Edge:

```powershell
npm --prefix client run test:chat-browser
```

The harness starts its own synthetic Vite server and does not use Flask, Neon or a
provider. If the browser is not auto-detected, set its executable path first, e.g.:

```powershell
$env:STEP_J_BROWSER = 'C:\Program Files\Google\Chrome\Application\chrome.exe'
npm --prefix client run test:chat-browser
```

On macOS/Linux, also set `STEP_J_BROWSER` to an installed Chrome/Chromium executable
using your shell's environment syntax. No browser download is built into this script.
Live database tests require explicit opt-in and an approved disposable database;
see the [testing guide](docs/STEP_J_TESTING_GUIDE.md). They are not an install step.

## Troubleshooting

| Symptom | Check |
|---|---|
| `ModuleNotFoundError` / pytest missing | Use `server/.venv/Scripts/python.exe`, then rerun the requirements install with that same executable. |
| Unsupported Node engine or Vite startup failure | Check `node --version`; use Node 22.12+ and rerun `npm --prefix client ci`. |
| `npm ci` cannot find a lockfile | Run from the repository root with `--prefix client`; the lockfile is in `client/`. |
| Browser says `VITE_NEON_AUTH_URL is not configured` | Fill `client/.env` and restart Vite. |
| Login succeeds but workspace access is 403 | Your account needs membership in the selected workspace. No client flag or auth bypass grants it. |
| No workspaces or wrong brand/personas | Verify the matching development Auth and DB environment and approved membership with the team. |
| API requests fail / connection refused | Keep Flask running on 5001 and Vite on 3000; resolve port conflicts before retrying. |
| Missing tables or database unavailable | Verify the approved database branch/schema and connection string; installing Python packages does not create tables. |
| Missing brand configuration / generation blocked | An authorized editor must complete required identity and persona configuration. |
| Provider authentication/model failure | Check backend key/model privately; never paste secrets into chats or issues. |
| Shared chat updates not visible yet | Refocus the tab or wait about 16 seconds; confirm both accounts selected the same authorized workspace. |

If npm reports `UNABLE_TO_VERIFY_LEAF_SIGNATURE` on a managed Windows network,
use the organization's approved CA configuration. On Node 24, the Windows system
certificate store can be enabled for the current terminal without disabling TLS:

```powershell
$env:NODE_OPTIONS = "$env:NODE_OPTIONS --use-system-ca".Trim()
npm --prefix client ci
```

This addresses trust configuration, not dependency versions. Never use
`strict-ssl=false` or `NODE_TLS_REJECT_UNAUTHORIZED=0` as an installation workaround.

The current lockfile installs successfully but reports dependency peer/deprecation
notices and **9 audit findings (7 high, 2 moderate)**. See the
[setup sweep](docs/DOCUMENTATION_SETUP_SWEEP.md#verification) for affected packages
and verification limits. Treat dependency remediation as a reviewed compatibility
change; do not apply `npm audit fix --force` as a setup step.

## Maintainer references and remaining checks

The [UI recovery report](docs/LEGACY_RECOVERY_PATCH.md) maps legacy features to current
storage and records deliberate differences. The [workspace-sharing report](docs/WORKSPACE_CHAT_SHARING.md)
records access semantics and its synthetic acceptance results. The
[documentation/setup sweep](docs/DOCUMENTATION_SETUP_SWEEP.md) records fresh-install
verification and this documentation review.

Step F/G/H/I implementation reports and the prototype PDFs remain historical evidence.
They do not supersede the current workflow, install instructions or authorization matrix.
Live Auth/role/revocation/workspace isolation, database/RLS configuration, deployed
worker timeouts and paid generation behavior remain separate verification gates.
Historical import, schema changes, publishing and deployment are separate work.

```text
mortgage-marketing-AI/
  client/       React UI, package.json, package-lock.json, .env.example
  server/       Flask API, auth, repositories, services, tests, requirements.txt, .env.example
  docs/         Current guides, testing reports and historical implementation records
```
