# Lucie Authorization Matrix

Updated 2026-10-18 for Steps G–I. Step I basic development acceptance and shared configuration persistence are user-reported; the full multi-account/role and revocation lifecycle gates remain separate.
See [current Step I report](STEP_I_IMPLEMENTATION_AND_TESTING.md) and [Step G gates](STEP_G_IMPLEMENTATION_AND_TESTING.md).

## Request boundaries

Flask reuses the existing JWT verifier and resolves current membership on each workspace
request. Client identity, role, creator, and author fields cannot establish authority.
Stored workspace selection is a preference, not permission.

| Route | Authentication | Required capability | Additional boundary |
|---|---|---|---|
| GET /api/auth/me | JWT | None | Authenticated identity only |
| GET /api/workspaces | JWT | None | Current recognized memberships; zero returns an empty list |
| GET /api/brand-profile | JWT + membership | workspace:read | Selected authorized workspace |
| PUT /api/brand-profile | JWT + membership | config:write | Selected workspace; existing profile only; approved brand/licensing patch; name merges only settings.licensed_person_name |
| GET /api/personas | JWT + membership | workspace:read | Selected workspace; active rows only; safe field projection |
| POST /api/personas | JWT + membership | config:write | Selected workspace from server; validated fields; server-owned starter flag |
| PUT /api/personas/<persona_id> | JWT + membership | config:write | UUID + selected workspace + non-deleted row; otherwise 404 |
| GET /api/chat/sessions | JWT + membership | chat:read | Creator's unarchived sessions only |
| GET /api/chat/sessions/<id> | JWT + membership | chat:read | Selected workspace and creator; otherwise 404 |
| POST /api/chat/sessions | JWT + membership | chat:create | Trusted member attribution; persona must belong to workspace |
| POST /api/chat | JWT + membership | ai:generate | Active persona UUID and required identity from selected workspace; no global history/preferences |
| POST /api/video-brief | JWT + membership | ai:generate | Same scoped persona/identity resolution before provider invocation |
| POST /api/social-image | JWT + membership | ai:generate | Same scoped persona/identity resolution before provider invocation |
| GET /api/history; GET/POST /api/preferences | JWT + membership | workspace:read | Retired: 410 after authorization |

Missing/invalid JWT returns 401; missing or unauthorized membership returns 403.
Multiple memberships without selection return 409. One membership resolves automatically.
Malformed UUIDs, conflicting header/query selections, and duplicate workspace query
parameters return 400. A missing brand profile GET returns 200 with an empty business
name and `exists=false` (Step H compatibility); PUT returns 404 and cannot create a profile. Database failures return a
sanitized 503. Unknown roles are excluded from authorized membership discovery.

## Step C Policy v1 capabilities

| Role | Workspace/private chat read | Create own chat | AI generation | Configuration write policy |
|---|---|---|---|---|
| owner | Yes | Yes | Yes | Yes |
| admin | Yes | Yes | Yes | Yes |
| developer | Yes | Yes | Yes | Development/test only |
| member | Yes | Yes | Yes | No |
| viewer | Yes | No | No | No |

Step I brand PUT and persona POST/PUT enforce `config:write`; read-only UI controls
mirror that capability, with the server authoritative on every request. Missing
required generation configuration returns sanitized 409; missing/malformed persona
selectors return 400; foreign/deleted/nonexistent persona rows return 404. None
of those failures invoke the provider.
Client licensing/name/role/workspace fields cannot override trusted generation
context. Provider authentication failures are sanitized 502, distinct from user 401.

Workspace creation, invitations, membership/role management and provisioning UI
remain unimplemented. A second workspace needs separately approved provisioning
of workspace, membership and brand-profile records. One authorized workspace is
automatically selected; multiple memberships expose the Workspace dropdown.
No role bypasses chat ownership.

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

Brand profile/persona definitions persist in Neon; normal React chats and each chat's `generationPersonaId` persist locally under user/workspace-scoped browser keys. This is not Step J conversation synchronization.
Old unscoped browser records remain untouched and hidden pending an approved migration.
Browser namespacing is not encryption or protection from someone controlling the device.

## Remaining acceptance

Local synthetic tests cover route guards, signed JWT rejection, capabilities, selection,
private repository predicates, attribution, generation response compatibility, and browser
storage isolation. The developer confirmed basic signed-in use and shared brand/persona persistence across browsers on the same account after the hotfix. This does not establish the entire live role matrix, multi-workspace isolation or revocation lifecycle. Those checks, deployment review, invitations, historical migration and cross-device chat persistence remain separately tracked. See the Step I acceptance matrix for precise evidence.
