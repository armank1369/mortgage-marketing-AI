# Lucie Authorization Matrix

Status: Step G implemented locally; real Neon Auth and database acceptance remains pending.
See [implementation and testing](STEP_G_IMPLEMENTATION_AND_TESTING.md).

## Request boundaries

Flask reuses the existing JWT verifier and resolves current membership on each workspace
request. Client identity, role, creator, and author fields cannot establish authority.
Stored workspace selection is a preference, not permission.

| Route | Authentication | Required capability | Additional boundary |
|---|---|---|---|
| GET /api/auth/me | JWT | None | Authenticated identity only |
| GET /api/workspaces | JWT | None | Current recognized memberships; zero returns an empty list |
| GET /api/brand-profile | JWT + membership | workspace:read | Selected authorized workspace |
| GET /api/chat/sessions | JWT + membership | chat:read | Creator's unarchived sessions only |
| GET /api/chat/sessions/<id> | JWT + membership | chat:read | Selected workspace and creator; otherwise 404 |
| POST /api/chat/sessions | JWT + membership | chat:create | Trusted member attribution; persona must belong to workspace |
| POST /api/chat | JWT + membership | ai:generate | No global SQLite history or preferences |
| POST /api/video-brief | JWT + membership | ai:generate | Same generation boundary |
| POST /api/social-image | JWT + membership | ai:generate | Same generation boundary |
| GET /api/history; GET/POST /api/preferences | JWT + membership | workspace:read | Retired: 410 after authorization |

Missing/invalid JWT returns 401; missing or unauthorized membership returns 403.
Multiple memberships without selection return 409. One membership resolves automatically.
Malformed UUIDs, conflicting header/query selections, and duplicate workspace query
parameters return 400. Missing brand profiles return 404. Database failures return a
sanitized 503. Unknown roles are excluded from authorized membership discovery.

## Step C Policy v1 capabilities

| Role | Workspace/private chat read | Create own chat | AI generation | Configuration write policy |
|---|---|---|---|---|
| owner | Yes | Yes | Yes | Yes |
| admin | Yes | Yes | Yes | Yes |
| developer | Yes | Yes | Yes | Development/test only |
| member | Yes | Yes | Yes | No |
| viewer | Yes | No | No | No |

Configuration capability is defined and tested for later integration; Step G does not
add a configuration-write endpoint or administrative UI. No role bypasses chat ownership.

## Privacy and revocation

Session queries require both workspace ID and the authenticated member's creator ID.
Message reads first authorize that parent session. Unattributed and archived sessions
remain stored and hidden. New session/message authors come from verified backend context.
No historical ownership backfill occurs.

Deleted memberships cannot authorize subsequent requests. If `revoked_at` exists, a
non-null value excludes membership from discovery, resolution, and chat creation checks.
The optional JSONB lookup tolerates the historical schema without that field; it does
not provide soft revocation when no lifecycle mechanism exists. Live inspection and any
migration execution remain outstanding. See [approved design](STEP_G_REVOCATION_PROPOSAL.md).
Already-authorized in-flight requests are not automatically canceled.

The normal React chat UI still persists locally, now under user/workspace-scoped keys.
Old unscoped browser records remain untouched and hidden pending an approved migration.
Browser namespacing is not encryption or protection from someone controlling the device.

## Remaining acceptance

Local synthetic tests cover route guards, signed JWT rejection, capabilities, selection,
private repository predicates, attribution, generation response compatibility, and browser
storage isolation. They do not establish live database schema or real Auth integration.
Live multi-account tests, schema/lifecycle verification, deployment review, invitations,
historical migration, and cross-device persistence remain separate work.
