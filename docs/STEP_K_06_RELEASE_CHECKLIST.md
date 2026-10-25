# Step K6 — Release Gates, Integration Plan & Safeguards Runbook

**Document Type:** Production Release & Safeguard Runbook  
**Phase:** Step K (Production Onboarding & Hardening) — PREPARE NOW  
**Target Release Branch:** `main`  
**Execution Status:** Gated (No automatic merge; wait for Joseph intake sign-off)  

---

## 1. Release Path & Integration Strategy (Candidate to `main`)

### A. Context & Branch State
- Remote `main` currently reflects the presentation-era baseline.
- The active release candidate branch incorporates the full Step J durable conversation persistence, workspace sharing model, soft-deletion persona lifecycle, and the response formatting hotfix.
- **Rule:** Do NOT execute a direct `git merge` or fast-forward push to `main`. Integration must occur through a reviewed Pull Request with full branch diff inspection to prevent reviving discarded presentation UI elements or committing unvetted changes.

### B. Merge Conflict & Legacy UI Difference Audit
Before opening the release PR, the operator must inspect the diff between `main` and HEAD:
```bash
git fetch origin main
git diff --stat origin/main...HEAD
UI Parity Check: Verify that persona managers, brand profile editors, and settings views remain mounted inside <WorkspaceGate> / <WorkspaceDataProvider>.   

No Presentation Relics: Ensure old browser-only local storage adapters from the presentation release are not accidentally restored.   

Zero Secret Exposure: Confirm no .env files, actual API keys, or private client transcripts appear in the staged diff.
```

## 2. Automated Preflight Release Gates

Every gate below must pass locally prior to submitting the release PR:

### A. Backend Regression Suite
- **Execution Command:** `pytest server/tests -q`
- **Expected Threshold:** `554 passed, 0 failed, 37 skipped` (the 37 skips are documented, opt-in live database tests requiring real Neon credentials rather than mock memory).
- **Status:** **Verified**

### B. Frontend Unit Tests
- **Execution Command:** `npm --prefix client test -- --run`
- **Expected Threshold:** All client component, hook, and context test suites pass cleanly with 0 failing assertions.
- **Status:** **Pending Local Rehearsal**

### C. Frontend Linter & Static Analysis
- **Execution Command:** `npm --prefix client run lint`
- **Expected Threshold:** 0 syntax, unreachable code, or unresolved component/variable errors.
- **Status:** **Pending Local Rehearsal**

### D. Frontend Production Build & Bundle Verification
- **Execution Command:** `npm --prefix client run build`
- **Expected Threshold:** Exit code 0; Vite production distribution bundle cleanly emitted in `client/dist` with zero JSX/TypeScript compilation errors.
- **Status:** **Pending Local Rehearsal**

### E. Gunicorn Worker Timeout Gate
- **Inspection Command:** `Get-Content Procfile`
- **Expected Threshold:** Root `Procfile` exists and contains `--timeout 180 --workers 2 --bind 0.0.0.0:$PORT` to ensure long-running model generations do not hit 30s worker termination.
- **Status:** **Verified**

### F. Reverse Proxy & Edge Routing Gate
- **Inspection Command:** `Get-Content client\vercel.json`
- **Expected Threshold:** Edge rewrite rule maps `/api/:path*` directly to `https://mortgage-marketing-ai.onrender.com/api/:path*`.
- **Status:** **Verified**

## 3. Production Health & Error-Logging Protocol

To ensure minimal runtime observability before Step L's full monitoring dashboards:   

### A. Non-Destructive Health ProbeOnce deployed to Render, check the service health:

```bash
curl -f -I [https://mortgage-marketing-ai.onrender.com/api/brand-profile](https://mortgage-marketing-ai.onrender.com/api/brand-profile)
```

Expected Unauthenticated Response: HTTP/1.1 401 Unauthorized (confirms proxy routing, Gunicorn responsiveness, and active JWT middleware without disclosing data).

### B. Error-Logging & Privacy Invariant

Render backend logs must be configured to log structured error codes and trace IDs.
Strict Prohibition: Never log raw user prompts, model completion texts, borrower data, or Authorization headers in server stdout.   

## 4. Rollback Plan & Database Independence

CRITICAL POSTURE: Application Rollback != Database Rollback
Rolling back code via Git, Vercel, or Render does not undo database migrations, row updates, or imported chats. Database changes and application code must be handled as independent operational vectors.

### A. Frontend Application Rollback (Vercel)
SLA: Under 1 minute.

Navigate to Vercel Dashboard > mortgage-marketing-ai > Deployments.

Locate the previous production deployment commit prior to the release PR.

Select Promote to Production / Instant Rollback.

### B. Backend Application Rollback (Render)
SLA: 2–3 minutes.

On the local command line, revert the merge commit on main:

```bash
git checkout main
git pull origin main
git revert -m 1 HEAD -m "Rollback Step K production release"
git push origin main
```
Render detects the push to main and automatically deploys the previous container.

### C. Database Restoration & Recovery
Transaction Abort: Importers and migrations operate inside explicit ACID transactions (get_db_transaction()); syntax or integrity errors automatically roll back without partial data commits.   
Targeted Workspace Cleanup: If an import must be undone after commit, clean strictly within Joseph's workspace boundaries:

```sql
DELETE FROM public.chat_session WHERE workspace_id = 'JOSEPH_WORKSPACE_UUID';
```
Neon Point-in-Time Recovery (PITR): In the event of schema corruption, use the Neon console to branch off the database state as of a timestamp immediately preceding the release.

5. Formal Pre-Release Sign-Off Gate
All boxes must be checked before merging to main:   
[x] All non-credentialed automated backend tests pass (554 passed, 0 failed).  

[x] Known test skips documented (37 opt-in live database tests requiring real Neon credentials).   

[x] Security audit signed: @require_capability("config:write") and @require_workspace verified[cite: 2].

[x] Deployed hosting timeouts configured via root Procfile (--timeout 180).

[X] Frontend unit tests, lint, and production build rehearsed cleanly.

[ ] Joseph signed intake form (STEP_K_05_JOSEPH_INTAKE_TEMPLATE.md) received[cite: 2].

[ ] Joseph production Neon Auth user ID verified and mapped[cite: 2].

[ ] Production workspace provisioned via controlled script (not auto-signup)[cite: 2].