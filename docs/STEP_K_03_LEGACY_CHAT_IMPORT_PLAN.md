# Step K3 — Historical Lucie Chat Import Plan & Migration Specification

**Document Version:** 1.0.0  
**Phase:** Step K (Production Onboarding & Hardening) — PREPARE NOW, DATA WAIT  
**Target Tables:** `public.chat_session`, `public.chat_message`  
**Execution Posture:** Gated (Dry-Run Tooling Verified; Live Execution Awaiting Joseph's Full Export)  

---

## 1. Discovery & Source Artifact Inventory

Legacy browser/local exports can contain diverse data structures. This pipeline defines an explicit classification between supported and unsupported fields:

### A. Supported & Preserved Representations
- **Sessions (`chat_session`):** Session title, original creation timestamp, workspace association, and soft metadata tags.
- **Messages (`chat_message`):** Sequence order, role (`user` vs `assistant`), raw message text, turn timestamps, and structured JSON payloads.
- **Persona Context:** Legacy persona names attached to export sessions are preserved inside the message/session metadata as historical read-only snapshots.
- **Campaign & Graphic Specs:** Carousel slides and layout specs are preserved inside `payload` (`jsonb`), presenting them as read-only historical outputs without simulating Step J runtime operations.

### B. Unsupported Fields & Read-Only Handling
- **No Fabricated Operation IDs:** Legacy records will NOT have synthesized Step J operation keys or artificial `ai_run` rows.
- **No Retroactive AI Provider Calls:** No Anthropic API invocations will occur during or after import.
- **Local File Paths / Blobs:** External local image references or disk file links that cannot be resolved in PostgreSQL are flagged and omitted from the database, retaining only text prompts and layout specifications.

---

## 2. Workspace Isolation & Privacy Consent Gate

- **Shared Visibility Invariant:** Under the current platform security architecture, all authorized members belonging to a workspace have visibility into shared chat sessions.
- **Joseph Review Gate:** Before executing live migration into production, Joseph must:
  1. Review the export bundle to ensure no personal, non-mortgage, or sensitive client borrower records are included.
  2. Formally acknowledge in writing that imported sessions will be accessible to all members assigned to his workspace.
- **No Automatic Staff Access:** Engineering and support accounts must not have ambient access to Joseph's imported sessions.

---

## 3. Idempotency, Deduplication & Atomic Rollback Strategy

1. **Content Hashing:** Every imported message is fingerprinted using a SHA-256 hash:

   `hash = SHA-256(session_id + role + text + created_at)`
   
   Re-running the import tool checks for existing identical messages and skips insertion, preventing duplicate bubble rendering.
2. **Transaction Integrity:** All writes run within an explicit ACID transaction block (`get_db_transaction()`). If any foreign key violation, payload parse error, or database timeout occurs, the entire transaction rolls back with 0 rows committed.
3. **Targeted Cleanup SQL:**
   If a migration run must be manually purged from Joseph's workspace, cascading foreign keys allow targeted cleanup:
   ```sql
   DELETE FROM public.chat_session 
   WHERE workspace_id = 'JOSEPH_WORKSPACE_UUID' 
     AND title LIKE 'Synthetic%';
     ```

## 4. Source-to-Destination Schema Mapping

| Legacy Export Field | Target PostgreSQL Column | Transform / Handling Policy |
|---|---|---|
| `session.title` | `chat_session.title` | Text preserved (falls back to timestamp if missing). |
| `session.created_at` | `chat_session.created_at` | ISO-8601 string parsed to `TIMESTAMPTZ`. |
| `session.persona_snapshot` | `chat_session.metadata` | Stored as `{ "historical_persona": ... }`. |
| `message.role` | `chat_message.role` | Strictly validated against `'user'`, `'assistant'`, `'system'`. |
| `message.text` | `chat_message.content` | Exact text preserved; unicode normalized. |
| `message.payload` | `chat_message.payload` | JSON object preserved as `jsonb`. |
| `message.created_at` | `chat_message.created_at` | Preserves original turn timestamp. |

## 5. Synthetic Footprint & Database Sizing Evaluation

Testing against a synthetic multi-session fixture verifies:

Logical Data Size: A 50-turn chat session with complex payload cards occupies approximately $25\text{ KB}$ in PostgreSQL.
Projected Footprint: Importing 100 historical sessions will consume approximately $2.5\text{ MB}$ to $5.0\text{ MB}$, well within NeonDB storage bounds without exceeding free/starter compute tiers.

## 6. Execution Protocol & Operator Checklist

[x] Dry-run parsing utility created (server/scripts/import_legacy_chats.py).

[x] Complex multi-artifact synthetic fixture verified (synthetic_lucie_export.json).

[ ] Joseph account created and verified on production Neon Auth (auth.users).

[ ] Joseph production workspace created and ID recorded.

[ ] Joseph confirmed export bundle is scrubbed of client PII.

[ ] Joseph signed shared workspace visibility consent.

[ ] Dry-run executed on real files with 0 errors before live flag --execute is supplied.