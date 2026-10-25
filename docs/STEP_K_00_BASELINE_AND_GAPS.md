# Step K0 — Release-Candidate Baseline, Environment & Gap Audit

**Date of Audit:** October 24, 2026  
**Auditor:** Engineering Team  
**Scope:** Read-only inspection of repository refs, hotfix integration, hosting topology, database environments, and deployment gates.  
**Production Status:** Zero production actions performed. All live writes gated on Joseph intake completion.

---

## 1. Git Repository Refs, Branches & Commit Lineage

### Active Git State
- **Active Working Branch:** `feature/amogh-login-security-addon`
- **Head Commit:** `d3ad5c9` — *Incorporate Step J hotfixes and database docs*
- **Upstream Tracking Ref:** `origin/luciev2_newteam`
- **Candidate Release Target:** `main` (`remotes/origin/main`)

### Key Commit History (HEAD Lineage)
1. `d3ad5c9` (HEAD, origin/luciev2_newteam): Incorporate Step J hotfixes and database docs
2. `7bf7c01`: Document Step J history-contamination incident and new tests
3. `d60099c`: Fix history contamination causing malformed 'Saved clarification:' replies
4. `2708c18`: Restore loading bubble, remove persona flash, add conversation skeleton
5. `dbd85e7` (origin/codex/step-j-chat-persistence): documentation fix

### Relevant Remote Branches Evaluated
- `origin/main`: Production baseline (presentation release).
- `origin/luciev2_newteam`: Active team integration stream containing Step J persistence and Step K prep.
- `origin/codex/step-j-chat-persistence`: Step J durable conversation persistence branch.
- Feature branches (`arman-*`, `jaime-*`, `ken-*`): UI tweaks and exploratory branches preserved on origin.

---

## 2. Output-Format Hotfix Verification

- **Incident Root Cause:** Prior model generation runs suffered from history contamination, causing subsequent turns to echo malformed `Saved clarification:` prefixes.
- **Commit Verification:** Commits `d60099c` and `7bf7c01` are integrated into `HEAD` (`d3ad5c9`).
- **Focused Test Execution:**
  ```powershell
  pytest server/tests/ -k "format" -q
  # Result: 1 passed, 590 deselected in 20.31s (Exit Code 0)
  ```

Finding: The output format hotfix is merged and passing; no reimplementation or branch cherry-picking is required.

## 3. Hosting Platforms, Rewrites & Runtime Configuration

**Frontend Hosting (Vercel)**

Host Platform: Vercel

Configuration File: client/vercel.json

Edge Routing / Proxy Rewrite:

Route: /api/:path*

Upstream Destination: https://mortgage-marketing-ai.onrender.com/api/:path*

Client Build Command: npm --prefix client run build (Vite, outputs to client/dist)

Lint Command: npm --prefix client run lint (Oxlint, 0 errors)

**Backend Hosting (Render)**

Host Platform: Render (Web Service)

Configuration File: Procfile (repository root)

Web Server Command: web: gunicorn server.app:app --timeout 180 --workers 2 --bind 0.0.0.0:$PORT

Timeout Rationale: Standard Gunicorn worker timeout (30s) aborts long-form Anthropic model completions (up to 120s limit). Explicit --timeout 180 prevents HTTP 502 Bad Gateway responses.

## 4. Database Environments & Secret Hygiene

**Secret Isolation & .gitignore Validation**

Inspection of .gitignore verifies that credentials cannot be accidentally committed:

Lines 16–17: venv, .venv/

Lines 22–24: .env, .env.*, with exception !.env.example

**Environment Variables Inventory (Scoped Names Only)**

The application defines variables in server/.env.example:

DATABASE_URL: Connection string to Neon PostgreSQL branch (sslmode=require).

NEON_AUTH_BASE_URL: Regional Neon Auth endpoint for JWT verification.

NEON_AUTH_JWKS_URL: Specific JWKS key URL.

AI_PROVIDER: Model provider identifier (claude in production, mock in CI).

ANTHROPIC_API_KEY: API credential for Claude models.

ANTHROPIC_MODEL: Model identifier string.

**Neon Branching & Authentication Policy**

Branch Identity Caveat: Database name neondb is shared across all Neon branches. Isolation is strictly maintained by distinct connection host endpoints (ep-...neon.tech).

JWT Authorization Policy: A valid Neon Auth JWT provides user identity (sub), but does NOT automatically grant workspace membership. Access is authorized solely via rows in public.workspace_members.

Development vs. Production Rule: Local development must point only to the development branch; development credentials will never be copied to production.

## 5. Schema Baseline & Migrations

Database Size Baseline: Initial schema footprint recorded at 10 MB logical size.

Durable Persistence Tables: public.workspace, public.workspace_members, public.brand_profile, public.persona, public.chat_session, public.chat_message.

Soft Deletion: Supported on public.persona via deleted_at timestamp.

Rollback Invariant: Database migrations and table writes are independent of Git commits. Application rollbacks do NOT revert database state.

## 6. Pre-Joseph Blocker Matrix

| Area | Current State | Intended Production State | Blocker / Gating Condition |
|---|---|---|---|
| **Release Branch** | `feature/amogh-login-security-addon` (HEAD: `d3ad5c9`) | Merged into `main` via PR | Non-credentialed CI preflight checks and Joseph intake sign-off. |
| **Auth Account** | Local dev identity UUIDs | Joseph's real Neon Auth user UUID | Gated on Joseph creating production account at `/auth/sign-up`. |
| **Workspace** | Local dev workspace (`8bab9643-...`) | Joseph's dedicated production workspace | Gated on manual provisioning via `STEP_K_05_ONBOARDING_RUNBOOK.md`. |
| **Brand Profile** | Test dev values | Legal business name, NMLS/DRE credentials, and compliance footer | Gated on signed `STEP_K_05_JOSEPH_INTAKE_TEMPLATE.md`. |
| **Historical Chats** | Synthetic fixtures verified in dry-run | Joseph's actual Lucie chats imported into `chat_session`/`chat_message` | Gated on receiving complete chat export bundle from Joseph. |
| **ChatGPT Prefs** | Extraction spec & test scripts ready | Joseph's refined voice/tone preferences populated | Gated on receiving Joseph's selected ChatGPT export folder/ZIP. |
| **Hosting Deployment** | `Procfile` and `vercel.json` staged locally | Deployed to Render and Vercel production | Gated on opening PR and merging to `main`. |