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

1. **Deterministic UUIDv5 Generation:**
   To guarantee idempotency across repeated import executions, session and message UUIDs are derived deterministically using RFC 4122 UUIDv5 scoped under a dedicated Lucie namespace (`urn:lucie:legacy:import`):
   - `session_id = UUIDv5(NAMESPACE_LUCIE, "session:" + workspace_id + ":" + title + ":" + started_at)`
   - `msg_id = UUIDv5(NAMESPACE_LUCIE, "message:" + session_id + ":" + sequence_index + ":" + role + ":" + created_at)`

   Re-executing the importer on the exact same export file produces identical primary keys, allowing repeated imports without duplicating rows.

2. **Stable Content Hashing:**
   Every imported message is fingerprinted using a SHA-256 hash independent of runtime variables:

  **content_hash = SHA-256(role + ":" + content.strip() + ":" + created_at)**

3. **Batch Identification & Audit Metadata:**
Each import execution records a unique or deterministic `batch_id` embedded inside `chat_message.structured_data['_import_metadata']`:
```json
{
  "_import_metadata": {
    "batch_id": "batch_a1b2c3d4",
    "content_hash": "...",
    "imported_at": "2026-10-25T17:00:00Z",
    "source": "lucie_legacy_export"
  }
}
```

Multi-Tier Deduplication & Database Safety:

The importer performs an existence lookup on primary keys before attempting insertion (SELECT id FROM ... WHERE id = %s).

Insertion queries use ON CONFLICT (id) DO NOTHING as a defense-in-depth safety guard.

Atomic Rollback & Batch Cleanup SQL:

Because all records carry batch_id in their _import_metadata, an import can be rolled back cleanly without affecting other workspace conversations:

```sql
-- Roll back a specific import batch
DELETE FROM public.chat_session
WHERE id IN (
    SELECT DISTINCT session_id
    FROM public.chat_message
    WHERE structured_data->'_import_metadata'->>'batch_id' = 'BATCH_ID_TO_ROLLBACK'
);
```

## 4. Source-to-Destination Schema Mapping

| Legacy Export Field | Target PostgreSQL Column | Transform / Handling Policy |
|---|---|---|
| `session.title` | `chat_session.title` | Preserved as session title. |
| `session.created_at` | `chat_session.started_at` | ISO-8601 string parsed to `TIMESTAMPTZ` (maps to `started_at`). |
| `session.persona_snapshot` | `chat_session.default_persona_id` / metadata | Retained in audit logs or session metadata. |
| `message.role` | `chat_message.role` | Strictly validated against `'user'`, `'assistant'`, `'system'`. |
| `message.text` / `message.content` | `chat_message.content` | Exact text preserved (`content` column). |
| `message.payload` | `chat_message.structured_data` | Preserved as `jsonb` with embedded `_import_metadata`. |
| `content_hash` | `structured_data['_import_metadata']` | Embedded inside JSONB (no separate table column). |
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