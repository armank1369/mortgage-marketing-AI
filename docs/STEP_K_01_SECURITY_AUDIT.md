# Step K1 — Security Assessment & Nonproduction Safeguards Audit

**Date of Audit:** October 24, 2026  
**Phase:** Step K (Production Onboarding & Hardening) — PREPARE NOW  
**Target Release Branch:** `main`  
**Execution Status:** Complete (Static audit, negative tests verified, architectural decisions documented)  

---

## 1. Security Audit Matrix

| Domain | Implemented Controls | Gaps Identified | Decision / Architecture Stance | Verification / Test Evidence |
|---|---|---|---|---|
| **Auth & Token Verification** | `jwt.PyJWKClient` validates RS256 signatures via `NEON_AUTH_JWKS_URL`. HTTP 401 on missing/invalid JWT; HTTP 403 on unauthorized workspace. | Neon Auth edge endpoints cannot be protected by Flask middleware. | Rely on Neon's managed infrastructure for login edge protection. Flask enforces signature and claims. | `server/auth.py`; verified against PyJWT error types. |
| **Workspace Isolation & RBAC** | `@require_workspace` and `@require_capability("config:write")` active. Soft-delete preserved on personas. | Ambient staff cross-workspace access risk if provisioning is automated. | Manual provisioning only via `STEP_K_05_ONBOARDING_RUNBOOK.md`. No automatic membership on signup. | `pytest server/tests/ -k "auth or workspace or permission or role or forbidden"` (88 passed). |
| **Database Roles & RLS** | Isolation enforced via parameterized queries with explicit `workspace_id = %s` predicates. | RLS is currently disabled in PostgreSQL schema. Application connects with default schema role. | **Explicit Decision:** Do not enable RLS blindly in Step K. PostgreSQL predicates are audited and tested. RLS migration deferred to Step L. | Tested via 554-test regression battery. |
| **Abuse & Cost Controls** | Downstream catch for `anthropic.RateLimitError` returning HTTP 429. | No pre-dispatch per-workspace or per-user rate limiting in Flask. | Document proposed rate limits (Section 3). Concurrency keys required before paid generation dispatch. | `server/app.py:308-309` handles provider 429. |
| **Username & Impersonation** | Identity keyed to immutable Neon Auth UUID (`sub`) and verified email. | No username normalization rules exist. | **Finding:** No user-selectable username column exists. Do not invent a username column. Profile identity uses `business_name`. | Schema review of `workspace_members` and `brand_profile`. |
| **Debug & Payloads** | Gunicorn used in production via `Procfile` (`debug=False`). `.gitignore` excludes `.env`. | `MAX_CONTENT_LENGTH` not explicitly set in Flask config. | Production execution uses Gunicorn; Vercel/Render enforce 10MB/32MB proxy payload caps. Add explicit Flask cap in Step L. | `Select-String` audit of `server/app.py` and `Procfile`. |

---

## 2. Proposed Least-Privilege Role Map

Neon Auth identities are mapped to permissions through `public.workspace_members`:

Neon Auth Identity (sub UUID)
│
▼
public.workspace_members
├── role: 'admin'     ──► config:write, workspace:read, chat:write, chat:read
├── role: 'member'    ──► workspace:read, chat:write, chat:read (config:write DENIED)
└── role: 'viewer'    ──► workspace:read, chat:read (chat:write & config:write DENIED)

- **Joseph's Role:** Assigned `admin` in his dedicated workspace.
- **Collaborator Roles:** Assigned `member` or `viewer` depending on whether content modification is approved.
- **Staff Access Policy:** Zero ambient staff access. Support staff must not be added to `workspace_members` unless explicitly authorized in writing.

---

## 3. Rate-Limit Policy (Proposed Thresholds Awaiting Owner Review)

Because Render can run across multi-instance containers, rate limiting should operate at two layers:

### Layer A: Managed Service Boundary (Neon Auth)
- Login attempts, password resets, and token refreshes occur directly against Neon Auth (`https://YOUR_BRANCH.neonauth...`).
- These endpoints are rate-limited on Neon's edge infrastructure; Flask cannot rate-limit requests it never receives.

### Layer B: Application Backend Boundary (Render / Flask)
Recommended thresholds to prevent Anthropic credit exhaustion:
- **Standard Read Endpoints (`/api/brand-profile`, `/api/personas`):** 60 requests / minute per IP / workspace.
- **Chat History & Session Creation (`/api/chat/sessions`):** 30 requests / minute per workspace.
- **Paid Generation (`/api/generate`, `/api/chat/message`):**
  - **Burst Limit:** Max 3 concurrent in-flight generation requests per workspace.
  - **Daily Quota:** 100 successful model generations / workspace / day.
  - **Response on Exceeded:** HTTP 429 Too Many Requests with JSON payload:
    ```json
    { "error": "Workspace generation limit reached. Please wait before issuing additional prompts.", "retry_after": 60 }
    ```

---

## 4. Username & Identity Finding

- **Investigation Result:** The application does **not** feature a user-selectable `@username` or public account handle.
- **Identity Architecture:**
  - Primary identity is the immutable Neon Auth `user_id` (`UUID`).
  - Account communication is tied to verified `email`.
  - Content branding uses `business_name` inside `brand_profile`.
- **Recommendation:** No Unicode normalization (NFKC) or reserved username checks (`admin`, `root`, `system`) are necessary because usernames are not part of the domain model. Never introduce a `username` string for authorization.

---

## 5. Automated Negative Test Evidence

Executed on local candidate branch (`HEAD: d3ad5c9`):
```powershell
pytest server/tests/ -k "auth or workspace or permission or role or forbidden" -q
```

Result: 88 passed, 9 skipped in 4.68s

Coverage: Verifies unauthorized token rejection (401), missing workspace rejection (403), role capability denials (config:write), and foreign workspace session isolation.