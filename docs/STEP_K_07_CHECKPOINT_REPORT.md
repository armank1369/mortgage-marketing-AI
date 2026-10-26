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
| **K0: Baseline & Test Audit** | **VERIFIED** | Clean working tree; 558/558 tests passing (0 failing, 37 opt-in live skips). Baseline includes 554 legacy/Step J tests plus 4 dedicated Step K importer integration & schema tests (`test_legacy_importer_schema.py`); base DB footprint recorded at 10 MB. | Freeze commit baseline. |
| **K1: Security & RBAC Audit** | **VERIFIED** | `@require_capability("config:write")` and `@require_workspace` active on brand/persona routes; soft deletion via `deleted_at` preserved; no ambient staff access. | Security policies locked. |
| **K2: Hosting & Worker Timeouts** | **VERIFIED** | Root `Procfile` created with `--timeout 180 --workers 2` to accommodate 120s Anthropic Claude calls; `client/vercel.json` edge rewrites verified. | Stage in release PR. |
| **K3: Legacy Chat Importer Tooling** | **VERIFIED** | `server/scripts/import_legacy_chats.py` featuring deterministic UUIDv5 IDs, stable SHA-256 hashing, batch tracking, and `persona_snapshot` ingestion. Tested via 4 dedicated tests in `server/tests/test_legacy_importer_schema.py` (schema alignment, UUIDv5 stability, duplicate skipping, and persona snapshot preservation). | Await Joseph's full Lucie chat export. |
| **K4: ChatGPT Preference Pipeline** | **SPECIFIED / JCRC** | ``STEP_K_04_JOSEPH_PREFERENCES_SPEC.md` updated to JCRC curation model; phantom standalone extractor replaced by intake template curation; redaction rules set; zero RAG/vector bloat. | Await Joseph's completed intake template. |
| **K5: Intake Template & Provisioning Runbook** | **VERIFIED** | `STEP_K_05_JOSEPH_INTAKE_TEMPLATE.md` (blank) and `STEP_K_05_ONBOARDING_RUNBOOK.md` delivered; manual workspace provisioning documented. | Hand intake template to Joseph. |
| **K6: Release Gates & Minimal Safeguards** | **VERIFIED** | `.github/workflows/pr_checks.yml` created. Frontend preflight empirically verified locally: 113 unit tests passed (0 failures), Oxlint static analysis completed with 0 errors across 74 files, and Vite production bundle emitted in 2.78s (exit code 0). Batch-scoped rollback query documented. | Gated on owner approval and intake sign-off. |

### Implementation Status Categorization

1. **Implemented and Tested:**
   - **K3 Legacy Chat Importer:** `server/scripts/import_legacy_chats.py` featuring deterministic RFC 4122 UUIDv5 IDs, stable SHA-256 content hashing, `batch_id` tagging, `persona_snapshot` ingestion, duplicate skip logic, and rollback capability. Verified with unit and schema tests (`server/tests/test_legacy_importer_schema.py`).
   - **Step J Repository Integration:** Fully aligned with `SCHEMA.md` across `chat_session` (`started_at`) and `chat_message` (`content`, `structured_data`). Monotonic tick test-harness clock verified with 558 passing tests.

2. **Implemented but Awaiting Validation:**
   - **K5 Production Provisioning Runbook:** `docs/STEP_K_05_ONBOARDING_RUNBOOK.md` updated with exact `public.workspace_member`, `public.workspace`, `public.brand_profile`, and `public.persona` schema definitions. Awaiting Joseph's signed intake form for live production execution.

3. **Planned Only / Superceded by Process:**
   - **Standalone Preference Extractor:** Standalone script (`extract_chatgpt_preferences.py`) deprecated in favor of the human-in-the-loop JCRC workflow in `STEP_K_05_JOSEPH_INTAKE_TEMPLATE.md` to prevent unverified factual hallucinations and duplicate tooling.

---

## 2. Technical Safeguards & Architecture Decisions Frozen

1. **Database Multi-Tenancy**: All future chat sessions and personas require strict `workspace_id` foreign-key mapping. No floating or global records.
2. **Deterministic Deduplication & Audit Hashing**: Legacy chat importer uses deterministic RFC 4122 UUIDv5 identifiers for sessions and messages, pure content hashing `SHA-256(role + ":" + content.strip() + ":" + created_at)`, embeds historical `persona_snapshot` into `_import_metadata`, and defaults to dry-run mode.
3. **Rollback Independence & Surgical Batch Deletion**: Application rollback on Vercel/Render is strictly isolated from PostgreSQL state. If an import must be undone, rollback SQL targets strictly the specific migration batch using the query below rather than unbounded workspace deletions that risk destroying active user chats:

```sql
DELETE FROM public.chat_session
WHERE id IN (
    SELECT DISTINCT session_id
    FROM public.chat_message
    WHERE structured_data->'_import_metadata'->>'batch_id' = 'TARGET_BATCH_ID'
      AND session_id IN (
          SELECT id FROM public.chat_session WHERE workspace_id = 'JOSEPH_WORKSPACE_UUID'
      )
);
```

4. **Model Abuse Controls**: Anthropic invocations are guarded by worker timeout extensions (180s) and capability restrictions (`chat:write`).
5. **Frontend Automated Verification**:
   - **Unit Tests:** `npm --prefix client test -- --run` -> **113 passed, 0 failed, 0 skipped** across all component and context test suites (node `--test` runner).
   - **Static Analysis / Linter:** `npm --prefix client run lint` -> **0 errors** (3 fast-refresh warnings) across 74 files with 92 rules evaluated via Oxlint.
   - **Production Build:** `npm --prefix client run build` -> **Exit code 0**; Vite production distribution bundle cleanly emitted in `client/dist` in 2.78s.

---

## 3. Strict Execution Gates (WAIT: JOSEPH)

The following actions are **FROZEN** and will not execute until Joseph supplies his complete information bundle and the project owner grants sign-off:

- [ ] **K-J1: Real Production Identity & Membership**: No account provisioning in `auth.users` or `public.workspace_members` until Joseph confirms his production sign-in email.
- [ ] **K-J2: Live Business Settings**: No writing to `public.brand_profile` until Joseph returns the completed `STEP_K_05_JOSEPH_INTAKE_TEMPLATE.md` with official NMLS/DRE numbers and compliance footers.
- [ ] **K-J3: Live Historical Chat Migration**: No execution of `import_legacy_chats.py --execute` until Joseph provides his full Lucie chat logs and confirms shared workspace visibility.
- [ ] **K-J4: ChatGPT Preference Synthesis**: No final tone or prompt adjustments until Joseph submits his full ChatGPT export and approves the derived style diff.
- [ ] **K-J5: Live Model Smoke Calls**: No paid Anthropic generation calls against production without owner-approved smoke-test budget.
- [ ] **K-J6: PR Merge to `main` & Deployment**: No merge into `main` until K-J1 through K-J5 pass inspection.