# Lucie authorization matrix — implemented vs planned

This is a **scope/status reference**, not a promise that all UI permissions
are implemented. See [Step F guide](STEP_F_DATA_LAYER_AND_TESTING.md).

| Capability | Current implementation | Notes |
|---|---|---|
| Neon Auth login + JWT verification | Step E implemented | `/api/auth/me` verifies a bearer JWT |
| Read workspace brand profile | Step F backend endpoint | Requires valid JWT and `public.workspace_member` row |
| List/create/read workspace chat sessions | Step F backend endpoints | Does not yet persist normal ChatPage sessions |
| Persona read/update repository | Step F backend functions | Not fully wired to frontend routes |
| Distinguish normal users from workspace admins | Membership role is read | Fine-grained role-based privileges **not** implemented |
| View or modify all users / other users | **Not implemented** | No approved admin API or policy validated |
| Legacy chat & calendar UI | Existing app behavior | Do not claim all legacy endpoints enforce Step F |

**Rules now enforced on new workspace routes:** a verified Neon Auth JWT
identifies the requester, a database membership determines their workspace,
and a requested foreign workspace is denied. No automatic developer admin
membership and no client-supplied user-ID bypass.

The original table's permissions (including admin access to all users) were
aspirational and should not be treated as authorization guarantees.
