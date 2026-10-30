# Step G membership revocation — proposal only

Status: **design approved October 10, 2026; not executed. Live schema inspection and separate execution approval required**.

The current implementation reloads membership for every request. A deleted membership
immediately stops authorizing subsequent requests. It does not cache memberships or
accept stored browser selections as permission.

That is not a complete offboarding mechanism. The supplied historical schema has
member foreign keys with SET NULL, CASCADE, and RESTRICT behaviors. Hard deletion
can erase creator attribution, delete preferences, or fail when feedback references
the member. No membership deletion is performed by Step G.

## Recommended focused change

After confirming the actual development schema and checking for an existing equivalent
lifecycle mechanism, add one nullable timestamp:

```sql
ALTER TABLE public.workspace_member
    ADD COLUMN revoked_at timestamptz;
```

This statement is a design proposal, not an executable migration bundled into startup.
Do not run it if the live schema already has an equivalent field or policy.

Step G now reads the approved optional field through `to_jsonb(wm)->>'revoked_at'`,
so the code supports the field without assuming it exists. Discovery/resolution and
member validation reject a non-null value. An absent field does not provide a
soft-revocation mechanism; that still requires the verified migration. Approved trusted administration would mark a membership revoked
without deleting it. React's stored workspace ID would then be denied on its next
request. Existing creator references remain intact and private records stay stored.

No admin UI, automatic membership assignment, ownership backfill, or Auth-table change
is proposed. Reinstatement is a separate explicit administrative decision. Requests
already authorized and in progress at revocation time are not automatically canceled.

## Execution gates

1. Restore read-only development connectivity and inspect columns, constraints,
   inbound member FKs, existing RLS, and the current application database role.
2. Confirm no existing supported soft-revocation mechanism should be reused.
3. Design approval is recorded. After inspection, review the concrete migration/backout plan.
4. Separately approve migration execution against a specifically verified environment.
5. Verify the lifecycle mechanism before accepting soft revocation as complete.
   Compatibility code permits existing memberships when the optional column is absent;
   it does not claim that those memberships support soft revocation.
6. Verify two real synthetic identities: a previously allowed membership becomes denied
   for discovery, reads, writes, and generation while its private history is preserved.

Until these gates are satisfied, **soft revocation and complete Step G live validation
remain outstanding**. Do not interpret passing mocked tests as completed offboarding.
