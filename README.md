
# Lucie — Mortgage Marketing AI Assistant

Lucie is an AI-powered mortgage marketing assistant developed for Lucent Brokerage.

The application helps with social media content creation, campaign planning, and marketing-related workflows while incorporating mortgage-industry compliance considerations.

The application now supports authenticated accounts, creator-private persistent conversations, cross-browser reopening and bounded same-conversation context. Long-term memory remains outside the implemented scope.

## 1. Start Here

For current features, architecture decisions, API/recovery behavior and limitations, read:

**[Step J — Feature and Operations Guide](docs/STEP_J_FEATURE_AND_OPERATIONS_GUIDE.md)**

See [Step J finalization](docs/STEP_J_FINALIZATION.md) for acceptance/results and
[Step J testing](docs/STEP_J_TESTING_GUIDE.md) for reproducible checks. The owner
reported successful UI use after J.4 and J.5; deployment/live-matrix gates remain
explicit. UI appearance refinements are separately planned with the owner's team.

For the underlying brand/persona generation work, read:

**[Step I — Current Implementation, Testing and Acceptance](docs/STEP_I_IMPLEMENTATION_AND_TESTING.md)**

Read the [context/API contract](docs/STEP_I_CONTEXT_CONTRACT.md) for field validation, licensing identity, persona selection and compatibility. Earlier [Step G authorization gates](docs/STEP_G_IMPLEMENTATION_AND_TESTING.md) remain tracked separately.

For historical setup and the Step F foundation, see [Step F guide](docs/STEP_F_DATA_LAYER_AND_TESTING.md). The following guide contents describe that historical foundation:

This document includes:

- A beginner-friendly explanation of Steps D, E, and F.
- What the database layer actually does.
- Instructions for setting up the project on Windows.
- Historical backend test examples; current suites/results are in the phase guides.
- Instructions for connecting a Neon Auth account to a workspace.
- Browser-based API tests.
- Expected results and troubleshooting.
- Known limitations and remaining work.

Other important documentation:

- [Environment Configuration](docs/ENVIRONMENT.md)
- [Authorization Matrix](docs/AUTHORIZATION_MATRIX.md)
- [Step I Context and API Contract](docs/STEP_I_CONTEXT_CONTRACT.md)
- [Step I Development Seed Review — Not Executed](docs/STEP_I_DEV_SEED_REVIEW.sql)
- [Step H Finalization — Historical Baseline](docs/STEP_H_HOTFIX_FINALIZATION.md)
- [Step E — Neon Auth and Session Identity Recap](docs/Lucie_Step_E_Neon_Auth_and_Session_Identity_Recap.md)
- [Historical Technical Audit and Risk Assessment](docs/Lucie_Technical_Audit_Whitepaper.pdf)
- [Historical Prototype End-User Manual — Predates Step J](docs/Lucie_User_Manual.pdf)
- [Historical Prototype UI Changes](docs/PROTOTYPE_UI_CHANGES.md)

---

## 2. Project Technology

| Component | Technology | Purpose |
|---|---|---|
| Frontend | React + Vite | User interface |
| Backend | Python + Flask | API and application logic |
| AI provider | Anthropic Claude | Content generation |
| Database | Neon PostgreSQL | Structured persistent storage |
| Authentication | Neon Auth / Better Auth | User accounts and sessions |
| Authorization | Flask + `workspace_member` | Workspace access control |
| Legacy local data | Browser localStorage and backend SQLite | Existing prototype persistence |

React and Flask are application technologies.

Neon provides database and authentication infrastructure.

Vercel and other deployment platforms concern hosting, rather than the underlying React or Flask application code.

---

## 3. Current Development Status

### Step D — Database Connectivity

Established and tested communication between Flask and the intended Neon database branch.

### Step E — Authentication

Implemented Neon Auth login, session handling, and backend JWT verification.

### Step F — Backend Data Layer

Implemented:

- PostgreSQL connection pooling.
- Workspace-scoped brand profile repositories.
- Workspace-scoped persona repositories.
- Chat session and message repositories.
- Atomic database transactions.
- Parameterized SQL queries.
- Error handling and logging infrastructure.
- Automated repository and authorization tests.
- JWT-to-workspace authorization.
- Selected authenticated Flask database endpoints.

**Step F's backend foundation has been locally validated.**

A successful development test does not mean the entire application is ready for production.

### Step G — Authorization and Creator Privacy

Implemented locally on `codex/step-g-workspace-authorization`: explicit role capabilities, refreshed workspace membership checks, creator-private chat APIs, authenticated React generation, and scoped browser storage. Global SQLite history/preferences access is retired without deleting data. Cross-chat duplicate-idea suppression is temporarily unavailable. Real Neon Auth/database acceptance remains pending; no migration or deployment occurred.

### Steps H and I — Database-Driven Brand and Persona Context

Step H introduced the brand editor foundation. Step I on
`codex/step-i-context-resolver` connects chat, campaigns/clarification, video briefs
and social images to authorized Neon brand/persona context. Settings supports
brand/licensing fields and a small persona create/edit flow. Generation uses
workspace-owned persona UUIDs and server-side identity, preserving fixed
compliance rules and response formatting.

On 2026-10-18 the developer reported successful brand/persona configuration
persistence across browsers using the same account, and successful basic use
after the older-chat persona-selection hotfix. The automated suite and the exact
scope of manual acceptance are recorded in the Step I report; these observations
do not establish every role, output format or production deployment gate.

### Step J — Durable Conversations and Bounded Context

Implemented on `codex/step-j-chat-persistence`: creator-private session/operation
APIs, paginated conversations/history, explicit persona selection, archive/restore,
immutable revisions, saved clarification answers and linked image/video specifications.
Same-conversation context is bounded and captured on the server; unknown outcomes
never trigger automatic repeat provider calls. Existing local history remains read-only;
Calendar remains local. Save Draft is deferred. See the current Step J guide for all
contracts, recovery paths, schema mapping, decisions and remaining release gates.

### Current Limitations

- On the Step J feature branch, ChatPage uses durable creator-private Neon conversations, linked revisions/media, pagination and archive/restore. Live Auth/two-browser acceptance remains pending; this is not a deployment claim.
- Scoped legacy chats remain in a read-only Local history view. Calendar and unsent input remain local; no historical import or calendar synchronization is implemented.
- Joseph's historical data has not yet been migrated.
- Existing SQLite data remains stored; authenticated V2 no longer uses it.
- Live integration acceptance for the new authorization boundaries remains pending.
- User invitation and automatic workspace provisioning are not implemented.
- Explicit role capabilities are implemented locally; invitations and administrative UI remain deferred.
- Long-term AI memory and RAG are not implemented.

---

## 4. Understanding the Current Architecture

The Step J feature branch combines shared workspace configuration with creator-private durable chat history. See [Step J evidence](docs/STEP_J_IMPLEMENTATION_AND_TESTING.md) for tested and unverified boundaries.

### Existing Chat Experience

```text
React ChatPage
    |
    +-- Scoped browser pending-operation recovery and read-only local history
    |
    +-- Authenticated, capability/creator-protected Flask session/operation APIs
            |
            +-- Neon sessions/messages and linked media specifications
            |
            +-- Authorized workspace brand profile and selected active persona from Neon
```

### Authenticated Neon Data Layer (Steps F–I)

```text
Neon Auth signed-in account
            |
            v
Verified JWT in Flask
            |
            v
Authorized workspace membership
            |
            v
Flask repository functions
            |
            v
Neon PostgreSQL
```

The second path has been implemented and tested.

Brand/persona Settings and generation context use this data layer. Step J.2–J.5 connect normal ChatPage persistence and bounded same-conversation context on the feature branch. Context uses at most six completed exchanges and 16 KiB of historical projection; media uses its explicit source. Remaining live acceptance gates and separately approved historical migration remain outstanding; Save Draft is deferred. See [Step J finalization](docs/STEP_J_FINALIZATION.md).

---

## 5. Critical Requirement — Workspace Membership

**Creating a Neon Auth account is not enough to access Lucie's database-backed workspace features.**

Neon Auth handles user registration and login.

Lucie uses `public.workspace_member` to decide which workspace the authenticated person can access.

For example:

```text
Neon Auth user
    |
    v
public.workspace_member
    |
    v
Lucie Development Workspace
    |
    v
Brand profiles, personas, and chats
```

A valid login may succeed while the workspace API returns 403 if no membership has been provisioned.

For development, authorized team members can assign an approved test account to the development workspace through a controlled SQL procedure.

See the [Step F Testing Guide](docs/STEP_F_DATA_LAYER_AND_TESTING.md) for exact instructions.

The final user experience should eventually provide a secure onboarding or invitation workflow rather than requiring manual SQL.

Do not automatically grant every new account access to Joseph's workspace.

---

## 6. Local Setup — Quick Reference

These examples use Windows PowerShell.

For complete instructions and safety checks, use the Step F guide.

### Prerequisites

- Git
- Python and pip
- Node.js and npm
- Valid development environment configuration
- Neon project access
- Anthropic API credentials

Python 3.11 or 3.12 is recommended for a consistent local backend environment.

### Step 1 — Clone and Select Branch

```powershell
git clone https://github.com/armank1369/mortgage-marketing-AI.git
cd mortgage-marketing-AI
git fetch origin
git switch --track origin/luciev2_newteam
```

If the repository or local branch already exists, update the correct branch instead of cloning again.

### Step 2 — Backend Dependencies

```powershell
cd server
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

If Python 3.11 is not installed, use another compatible version.

### Step 3 — Backend Configuration

Create `server/.env` from `server/.env.example` if this is a new setup.

Configure:

- `DATABASE_URL`
- `NEON_AUTH_BASE_URL`
- Optional `NEON_AUTH_JWKS_URL`
- `ANTHROPIC_API_KEY`
- `ANTHROPIC_MODEL`

Use the correct Neon development branch.

Do not overwrite working local environment files unnecessarily.

Do not commit secrets.

### Step 4 — Start Backend

From `server/`:

```powershell
.\.venv\Scripts\python.exe app.py
```

Expected address:

`http://localhost:5001`

### Step 5 — Frontend Setup

In another terminal, from `client/`:

```powershell
npm ci
```

Create `client/.env` from `client/.env.example` if necessary.

Configure:

```dotenv
VITE_NEON_AUTH_URL=https://YOUR_DEVELOPMENT_AUTH_URL
```

Then start React:

```powershell
npm run dev
```

Expected address:

`http://localhost:3000`

---

## 7. Testing

Run the current offline/mock regression checks from the repository root:

```powershell
python -m pytest server/tests -q
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
```

The configured linter is Oxlint; ESLint is not installed/configured. Default pytest
blocks live database connections and skips opt-in integration tests. Paid model
calls and live data writes require separate authorization. See the
[Step I report](docs/STEP_I_IMPLEMENTATION_AND_TESTING.md) for current results,
user-reported cross-browser checks and remaining acceptance coverage.

The following focused checks are retained from the Step F/G setup guide:

### Workspace Authorization Tests

From `server/`, using the installed Python environment:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_workspace_context.py -v
```

### Optional Live Database Connection Check (Confirm Development Target First)

```powershell
.\.venv\Scripts\python.exe scripts/db_smoke_test.py
```

### Chat Repository Tests

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_chat_repository.py -v
```

Default tests block live database access and skip integration tests. Live repository tests require `--run-integration` and an explicit `LUCIE_TEST_DATABASE_URL` for an approved disposable database. Those tests create and delete synthetic records.

Do not run database write tests against production, and avoid modifying shared development data without coordination.

A complete testing sequence, expected results, and live browser integration checks are documented in:

[Step I implementation/testing report](docs/STEP_I_IMPLEMENTATION_AND_TESTING.md). The [Step F guide](docs/STEP_F_DATA_LAYER_AND_TESTING.md) provides historical repository setup detail.

---

## 8. Application Usage

For the current development workflow:

1. Open the local React application.
2. Sign in using Neon Auth.
3. In Settings, an authorized configuration editor can review saved business and verified licensing details, brand voice and workspace personas. Missing required identity blocks generation.
4. Choose a saved database persona during onboarding or in the chat's Generation persona dropdown. Choices persist per chat in this browser, including older chats; original records/messages remain preserved.
5. Create marketing content and review output/disclosures before copying or using it.

The Workspace dropdown appears only for accounts with more than one authorized
workspace (or when selection is required). One workspace is automatically selected.
The development team has tested one workspace; creating another workspace, its
membership and profile requires separately approved provisioning/SQL. There is
no workspace-creation or invitation UI. Named sidebar conversations are chats,
not separate workspaces.

The prototype requires human review of AI-generated mortgage marketing content.

**Important:** The normal chat UI is not yet connected to the Step F PostgreSQL chat repositories.

Signing in on another browser does not automatically synchronize existing chat data.

---

## 9. Known Security and Privacy Limitations

Step F introduced verified workspace authorization for selected new database endpoints.

Step G now protects all generation routes and retires the global SQLite endpoints. Its local tests passed, but live acceptance is still outstanding.

Before public production deployment, the team must:

- Review authentication on existing API routes.
- Enforce proper authorization on sensitive operations.
- Verify the implemented creator-private policy with real accounts.
- Implement safe workspace onboarding/provisioning.
- Review deployment secrets, CORS, debug settings, rate limits, and access controls.
- Test privacy boundaries using multiple accounts.
- Complete migration and frontend synchronization testing.

Sensitive client and mortgage-related information should not be used as synthetic test data.

---

## 10. Next Development Priorities

Recommended next phases:

1. Complete Step G live schema, revocation, Auth, and browser acceptance.
2. Plan workspace invitation/onboarding under the approved creator-private policy.
3. Review/finalize the Step I branch using its current acceptance report; brand/persona UI integration is implemented.
4. Review Step J finalization and the separately tracked UI refinements; plan any historical-data migration separately.
5. Complete remaining J.7 live identity/provider/runtime gates; the owner reported successful multiple-browser chat use after J.4.
6. Consider long-term memory/retrieval only under a separately scoped phase.

Step F is the foundation that supports these improvements.

---

## 11. Repository Structure

```text
mortgage-marketing-AI/
├── client/
│   ├── src/
│   └── .env.example
├── server/
│   ├── auth/
│   ├── db/
│   ├── repositories/
│   ├── scripts/
│   ├── tests/
│   ├── app.py
│   ├── auth_utils.py
│   ├── requirements.txt
│   └── .env.example
├── docs/
│   ├── STEP_F_DATA_LAYER_AND_TESTING.md
│   ├── ENVIRONMENT.md
│   ├── AUTHORIZATION_MATRIX.md
│   └── ...
├── .gitignore
└── README.md
```

---

## Final Note

The current backend database foundation has been demonstrated in local development, including valid authentication, workspace authorization, chat persistence, and rejection of unauthorized requests.

That is an important technical milestone, but it is distinct from finishing the user-facing migration to Neon.

For current handoff and acceptance, use the [Step I implementation/testing report](docs/STEP_I_IMPLEMENTATION_AND_TESTING.md). Earlier Step F/G/H documents are historical context; their separate security and live acceptance gates are not automatically closed by Step I.
