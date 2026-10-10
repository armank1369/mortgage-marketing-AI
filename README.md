
# Lucie — Mortgage Marketing AI Assistant

Lucie is an AI-powered mortgage marketing assistant developed for Lucent Brokerage.

The application helps with social media content creation, campaign planning, and marketing-related workflows while incorporating mortgage-industry compliance considerations.

The project is being upgraded from a browser-focused prototype into an application with authenticated accounts, persistent backend storage, and eventually cross-device access and long-term AI memory.

## 1. Start Here

If you are joining the project or testing the recent backend changes, read:

**[Step F — Data Layer, Testing, and Handoff Guide](docs/STEP_F_DATA_LAYER_AND_TESTING.md)**

This document includes:

- A beginner-friendly explanation of Steps D, E, and F.
- What the database layer actually does.
- Instructions for setting up the project on Windows.
- A complete list of backend tests.
- Instructions for connecting a Neon Auth account to a workspace.
- Browser-based API tests.
- Expected results and troubleshooting.
- Known limitations and remaining work.

Other important documentation:

- [Environment Configuration](docs/ENVIRONMENT.md)
- [Authorization Matrix](docs/AUTHORIZATION_MATRIX.md)
- [Step E — Neon Auth and Session Identity Recap](docs/Lucie_Step_E_Neon_Auth_and_Session_Identity_Recap.md)
- [Technical Audit and Risk Assessment](docs/Lucie_Technical_Audit_Whitepaper.pdf)
- [End-User Manual](docs/Lucie_User_Manual.pdf)
- [Prototype UI Changes](docs/PROTOTYPE_UI_CHANGES.md)

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

### Current Limitations

- The normal ChatPage still uses browser localStorage.
- Existing chats do not automatically synchronize between devices.
- Joseph's historical data has not yet been migrated.
- The legacy SQLite history mechanism remains.
- Some older Flask endpoints still require server-side authorization.
- User invitation and automatic workspace provisioning are not implemented.
- Fine-grained role permissions are not implemented.
- Long-term AI memory and RAG are not implemented.

---

## 4. Understanding the Current Architecture

The normal application currently has two different data paths.

### Existing Chat Experience

```text
React ChatPage
    |
    +-- Browser localStorage for chat history
    |
    +-- Legacy Flask /api/chat for AI generation
```

### New Step F Backend Data Layer

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

The normal ChatPage still needs to be integrated with it.

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
git switch --track origin/fix/step-f10-finalization
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

The backend includes tests under `server/tests/`.

### Workspace Authorization Tests

From `server/`, using the installed Python environment:

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_workspace_context.py -v
```

### Database Connection Check

```powershell
.\.venv\Scripts\python.exe scripts/db_smoke_test.py
```

### Chat Repository Tests

```powershell
.\.venv\Scripts\python.exe -m pytest tests/test_chat_repository.py -v
```

Some tests create or modify development database records.

Do not run database write tests against production, and avoid modifying shared development data without coordination.

A complete testing sequence, expected results, and live browser integration checks are documented in:

[Step F Data Layer and Testing Guide](docs/STEP_F_DATA_LAYER_AND_TESTING.md)

---

## 8. Application Usage

For the existing prototype workflow:

1. Open the local React application.
2. Sign in using Neon Auth.
3. Complete the local preferences/persona setup if required.
4. Create marketing content through the chat interface.
5. Review generated content before copying or using it.

The prototype requires human review of AI-generated mortgage marketing content.

**Important:** The normal chat UI is not yet connected to the Step F PostgreSQL chat repositories.

Signing in on another browser does not automatically synchronize existing chat data.

---

## 9. Known Security and Privacy Limitations

Step F introduced verified workspace authorization for selected new database endpoints.

It did not secure every legacy Flask endpoint.

Before public production deployment, the team must:

- Review authentication on existing API routes.
- Enforce proper authorization on sensitive operations.
- Define workspace versus per-user chat visibility.
- Implement safe workspace onboarding/provisioning.
- Review deployment secrets, CORS, debug settings, rate limits, and access controls.
- Test privacy boundaries using multiple accounts.
- Complete migration and frontend synchronization testing.

Sensitive client and mortgage-related information should not be used as synthetic test data.

---

## 10. Next Development Priorities

Recommended next phases:

1. Secure and standardize remaining backend authentication and authorization.
2. Design workspace invitation/onboarding and user data privacy.
3. Connect the React UI to authenticated Neon database APIs.
4. Prepare and validate Joseph's existing-data migration.
5. Test cross-device access and synchronization.
6. Implement additional long-term memory and retrieval features.

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

For team handoff and acceptance testing, follow the Step F testing guide rather than relying only on this README.
