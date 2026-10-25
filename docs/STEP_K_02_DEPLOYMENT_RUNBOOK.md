# Step K2 — Deployment & Production Configuration Runbook

**Document Type:** Production Deployment & Configuration Reference  
**Phase:** Step K (Production Onboarding & Hardening) — PREPARE NOW  
**Platforms:** Vercel (Frontend), Render (Backend), Neon (PostgreSQL & Auth)  
**Execution Posture:** Rehearsal Only (No production merges, pushes, or deployments)  

---

## 1. Hosting Architecture & Network Topology

[ Client Browser ]
│
▼ (HTTPS)
[ Vercel Edge Network ]  (mortgage-marketing-ai.vercel.app)
├── Static Assets / SPA Bundle  (/)
└── Reverse Proxy Rewrite       (/api/:path*)
│
▼ (HTTPS / Public WAN)
[ Render Web Service ]   (mortgage-marketing-ai.onrender.com)
└── Gunicorn WSGI (--timeout 180 --workers 2)
└── Flask Application (server.app:app)
│
├── [ Neon Auth ]  (JWT Verification via JWKS)
├── [ NeonDB ]     (PostgreSQL Transaction Pool)
└── [ Anthropic ]  (Claude API via HTTPS)

### Active Configuration Breakdown
- **Frontend Host:** Vercel (React Vite SPA).
  - Routing configuration: `client/vercel.json` rewrites `/api/:path*` to `https://mortgage-marketing-ai.onrender.com/api/:path*`.
  - Build command: `npm --prefix client run build`. Output directory: `client/dist`.
- **Backend Host:** Render Web Service (Python 3.12).
  - Web server command: `Procfile` (`web: gunicorn server.app:app --timeout 180 --workers 2 --bind 0.0.0.0:$PORT`).
  - CORS posture: `CORS(app)` enabled. Since requests route through Vercel's proxy rewrite, the browser executes same-origin requests; direct calls to Render are accepted across origins.
- **Health Check Status:** No dedicated unauthenticated `/healthz` route exists. External monitoring probes use `GET /api/brand-profile` expecting `HTTP/1.1 401 Unauthorized` as proof of listener availability.

---

## 2. Timeout Budget & Concurrency Analysis

### Anthropic SDK Client Timing
```python
anthropic.Anthropic(max_retries=0, timeout=120.0)
```

Max Retries: 0 (Critical safeguard: prevents automated duplicate dispatches and double-billing on transient network drops).

Per-Call Timeout: 120.0s (Hard client socket limit for Claude completions).

### Request Duration Upper Bounds

Single Generation Turn (Standard Chat / Rewrite): Max 120s. Fits comfortably within the Gunicorn 180s worker timeout.

Compound Campaign Generation (Plan + Copy Draft): Sequential 2-call ceiling is $120\text{s} + 120\text{s} = 240\text{s}$.

Gunicorn Threshold: Gunicorn worker timeout is set to 180s in the root Procfile.

Platform Policy: If a multi-stage campaign generation encounters peak latency exceeding 180s, Gunicorn will terminate the worker. No background task queues (Celery/Redis) will be introduced in Step K. Workflows must remain synchronous, and single-turn completions remain within the 120s limit.

## 3. Environment Variable Inventory & Ownership

Secret Boundary Rule: Never copy development .env connection strings or test API keys into Render production settings. Each environment uses isolated credentials.

| Variable Name | Owning Platform | Scope / Purpose | Required In Dev | Required In Prod |
|---|---|---|---|---|
| `DATABASE_URL` | Neon Console | PostgreSQL connection string (`sslmode=require`) | Yes (Dev Branch) | Yes (Prod Branch) |
| `NEON_AUTH_BASE_URL` | Neon Auth | Base URL for Neon Auth identity service | Yes | Yes |
| `NEON_AUTH_JWKS_URL` | Neon Auth | Well-known JWKS public keys endpoint for RS256 token verification | Yes | Yes |
| `AI_PROVIDER` | Internal Config | Selects provider engine (`claude` in prod, `mock` in test) | Yes (`mock` or `claude`) | Yes (`claude`) |
| `ANTHROPIC_API_KEY` | Anthropic Console | Secret API key for Claude invocations | Optional (if mocking) | Mandatory |
| `ANTHROPIC_MODEL` | Anthropic Console | Target model identifier (default: `claude-haiku-4-5`) | Yes | Yes |
| `PORT` | Render Dynamic | Injected dynamically by Render container environment | No (defaults to 5001) | Yes (injected) |

## 4. Production Release Sequence & Smoke Checklist

### Operator Deployment Steps (Run strictly upon PR approval)

Merge Gate: Merge release PR into main branch.

Vercel Observation: Verify automated Vite build finishes on Vercel (exit code 0).

Render Observation: Verify Gunicorn worker initialization in Render deployment logs:

[INFO] Starting gunicorn ...
[INFO] Listening at: [http://0.0.0.0:10000](http://0.0.0.0:10000)
[INFO] Using worker: sync
[INFO] Booting worker with pid: ...

### Nonproduction Smoke-Test Verification

Run from local terminal to verify live edge routing without credentials:

```powershell
# 1. Probe Vercel -> Render proxy pass-through
curl -I [https://mortgage-marketing-ai.vercel.app/api/brand-profile](https://mortgage-marketing-ai.vercel.app/api/brand-profile)
# Expected: HTTP/1.1 401 Unauthorized

# 2. Probe direct Render origin
curl -I [https://mortgage-marketing-ai.onrender.com/api/brand-profile](https://mortgage-marketing-ai.onrender.com/api/brand-profile)
# Expected: HTTP/1.1 401 Unauthorized
```

## 5. Deployment Rollback & Incident Escalation

### Application Tier Rollback

Frontend (Vercel): Go to Vercel Deployments $\to$ select prior commit $\to$ Promote to Production. (Effective in < 30 seconds).

Backend (Render): Execute git revert -m 1 HEAD on main and push. Render deploys the prior stable build.

### Critical Database Boundary

Application rollbacks do not revert PostgreSQL rows or schema changes.

Any schema recovery must be performed via explicit SQL compensation scripts or Neon Point-in-Time Recovery (PITR).

### Production Logging & Redaction Bounds

Render logs stdout/stderr automatically.

Log Hygiene Guarantee: Server code never prints full JWT headers, prompt payloads, client chat history, or database credentials. Exception handlers emit class names and sanitized error messages.