# Step K7 — Pre-Joseph Master Checkpoint & Gap Report

**Audit Completed:** October 24, 2026  
**Repository Branch:** `feature/amogh-login-security-addon` (tracking release candidate)  
**Target Release Branch:** `main`  
**Database Footprint:** 10 MB (logical schema size on NeonDB)  
**Security Clearance:** Least privilege, soft deletion, and RBAC verified  

---

## 1. Master Subtask Status Matrix

| Subtask | Status | Evidence / Verification Method | Next Action |
|---|---|---|---|
| **K0: Baseline & Test Audit** | **VERIFIED** | Clean working tree; 554/554 tests passing (0 failing, 37 opt-in live skips); base DB footprint recorded at 10 MB. | Freeze commit baseline. |
| **K1: Security & RBAC Audit** | **VERIFIED** | `@require_capability("config:write")` and `@require_workspace` active on brand/persona routes; soft deletion via `deleted_at` preserved; no ambient staff access. | Security policies locked. |
| **K2: Hosting & Worker Timeouts** | **VERIFIED** | Root `Procfile` created with `--timeout 180 --workers 2` to accommodate 120s Anthropic Claude calls; `client/vercel.json` edge rewrites verified. | Stage in release PR. |
| **K3: Legacy Chat Importer Tooling** | **VERIFIED** | `server/scripts/import_legacy_chats.py` and `synthetic_lucie_export.json` created; dry-run validation verified with zero DB side effects. | Await Joseph's full Lucie chat export. |
| **K4: ChatGPT Preference Pipeline** | **VERIFIED** | `STEP_K_04_JOSEPH_PREFERENCES_SPEC.md` and offline extractor `extract_chatgpt_preferences.py` created; redaction rules set; zero RAG/vector bloat. | Await Joseph's complete ChatGPT files. |
| **K5: Intake Template & Provisioning Runbook** | **VERIFIED** | `STEP_K_05_JOSEPH_INTAKE_TEMPLATE.md` (blank) and `STEP_K_05_ONBOARDING_RUNBOOK.md` delivered; manual workspace provisioning documented. | Hand intake template to Joseph. |
| **K6: Release Gates & Minimal Safeguards** | **VERIFIED** | `.github/workflows/pr_checks.yml` created; frontend Vite build (0 errors) and Oxlint (0 errors) rehearsed; rollback runbook documented. | Gated on owner approval. |

---

## 2. Technical Safeguards & Architecture Decisions Frozen

1. **Database Multi-Tenancy**: All future chat sessions and personas require strict `workspace_id` foreign-key mapping. No floating or global records.
2. **Deterministic Deduplication**: Legacy chat importer uses `SHA-256(session_id + role + text + created_at)` and defaults to dry-run mode.
3. **Rollback Independence**: Application rollback on Vercel/Render is strictly isolated from PostgreSQL state; database cleanup runbooks are prepared for point-in-time recovery.
4. **Model Abuse Controls**: Anthropic invocations are guarded by worker timeout extensions (180s) and capability restrictions (`chat:write`).

---

## 3. Strict Execution Gates (WAIT: JOSEPH)

The following actions are **FROZEN** and will not execute until Joseph supplies his complete information bundle and the project owner grants sign-off:

- [ ] **K-J1: Real Production Identity & Membership**: No account provisioning in `auth.users` or `public.workspace_members` until Joseph confirms his production sign-in email.
- [ ] **K-J2: Live Business Settings**: No writing to `public.brand_profile` until Joseph returns the completed `STEP_K_05_JOSEPH_INTAKE_TEMPLATE.md` with official NMLS/DRE numbers and compliance footers.
- [ ] **K-J3: Live Historical Chat Migration**: No execution of `import_legacy_chats.py --execute` until Joseph provides his full Lucie chat logs and confirms shared workspace visibility.
- [ ] **K-J4: ChatGPT Preference Synthesis**: No final tone or prompt adjustments until Joseph submits his full ChatGPT export and approves the derived style diff.
- [ ] **K-J5: Live Model Smoke Calls**: No paid Anthropic generation calls against production without owner-approved smoke-test budget.
- [ ] **K-J6: PR Merge to `main` & Deployment**: No merge into `main` until K-J1 through K-J5 pass inspection.