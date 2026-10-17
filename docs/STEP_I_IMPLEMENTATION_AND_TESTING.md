# Step I implementation and testing

## Scope and baseline

2026-10-17: first implementation slice, following the owner's request to proceed
with the context contract, resolver and mocked tests. Step I as a whole remains
incomplete. This document will need updates as the remaining slices ship.

Base: `fix/step-h-finalization`, commit
`8e452cbf71e703b724ac3b759a609788f37d43f0`; clean before work.
Local work branch: `codex/step-i-context-resolver`. Cached
`origin/fix/step-h-finalization` matched the base; cached
`origin/luciev2_newteam` was two commits behind. The local `luciev2_newteam`
branch was 30 commits behind, so it was not used as the integration comparison.
No fetch was performed; remote freshness has not been verified.

The reviewed implementation prompt asks for end-to-end implementation, while
the user's accepted next slice was contract/resolver/tests. This delivery follows
that slice. The prompt includes a small Settings editor; the handoff conditions
expansion on approval. This discrepancy remains for the UI slice and does not
block this resolver work.

## Implemented

- `server/services/generation_context.py`: immutable typed context, bounded
  normalization, existing repository reads, UUID and defensive row scope checks,
  explicit 400/404/configuration-409 errors, existing outage-503 propagation.
- No implicit persona fallback, browser licensing input, cross-request context
  caching, settings export, business-name/licensee substitution, or legacy name.
- An explicit backend-only name-loader seam leaves the identity representation
  decision open. No loader is installed in production; omitted loader fails
  closed. Tests supply synthetic names only.
- `server/tests/test_step_i_context.py`: synthetic mock tests for scope isolation,
  deleted/foreign/malformed selections, absent profile and identifiers,
  normalization and bounds, immutable snapshots and fresh reads after changes,
  missing name source, safe errors, suppressed sensitive repr output and outages.
- `docs/STEP_I_CONTEXT_CONTRACT.md`: exact fields, precedence, errors and pending
  integration requirements.

No route, repository SQL, frontend, schema, live data, membership, seed, or
provider configuration was changed. Database fields are normalized according to
the supplied design; actual live types and records were not inspected. Existing
generation still uses its old implementation until the next integration slice.

## Verification

Fresh preimplementation baseline from the preceding review:

| Command | Result |
| --- | --- |
| `python -m pytest server/tests -q` | PASS: 147 passed; 20 integration tests SKIPPED |
| `npm --prefix client test` | PASS: 25 passed |
| `npm --prefix client run lint` | PASS with three existing Fast Refresh warnings |
| `npm --prefix client run build` | PASS with bundle-size and plugin-timing warnings |

Postimplementation:

| Command | Result |
| --- | --- |
| `python -m pytest server/tests -q` | PASS: 218 passed, including 71 new resolver cases; 20 integration tests SKIPPED |
| Whitespace checks on all added files | PASS |

Frontend checks were not repeated for this backend-only slice. Default pytest
forbids live PostgreSQL access; no integration flag or paid provider request was
used. Skipped integration tests are not live acceptance passes.

## Remaining work and acceptance gates

1. Approve licensed-person name representation, license review ownership,
   required identifiers and disclosure wording. No proposed settings mapping
   has been silently adopted.
2. Add the centralized prompt builder and wire all three routes, including
   campaign clarification/output validators. Test prompt changes, cache boundaries,
   consistent identity/footer, response compatibility, and no provider calls on
   guard/context failures. Resolver tests do not prove those route properties.
3. Add authenticated persona listing/selection and an explicit browser transition.
   Extend Settings with approved fields, validation and `config:write` checks.
4. Review targeted development seed proposals if needed. The attached SQL has
   not been executed or copied as an approved script; its SELECTs should first
   be restricted to the confirmed development workspace. Historical identity
   values and proposed business-name correction remain unverified.
5. Separately authorize and perform browser/database acceptance and paid
   generation if desired. Live acceptance: NOT RUN. No live writes, schema
   migrations or provider calls are part of this slice.

Step G revocation/live Auth and Step H browser/idle-recovery acceptance remain
separate open gates, not resolved by these tests. Step J chat persistence,
history migration and retrieval remain out of scope.

No application servers were started. No commit, push, merge or deployment was
performed. Suggested eventual integration: review the completed Step I slices
and current integration-branch differences, then seek human approval to merge
into `luciev2_newteam` after acceptance gates are addressed.
