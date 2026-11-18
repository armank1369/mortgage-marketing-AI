# Lucie Authorization Matrix

Updated 2026-10-19 for workspace-shared chat collaboration. See [sharing implementation and testing](WORKSPACE_CHAT_SHARING.md), which supersedes the original creator-private policy. Step I shared configuration and Step J normal UI/multiple-browser behavior are user-reported; the full multi-account/role and revocation lifecycle gates remain separate.
See the [current Step J guide](STEP_J_FEATURE_AND_OPERATIONS_GUIDE.md), [Step I report](STEP_I_IMPLEMENTATION_AND_TESTING.md) and [Step G gates](STEP_G_IMPLEMENTATION_AND_TESTING.md).

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
| GET /api/chat/sessions | JWT + membership | chat:read | Selected workspace's unarchived sessions |
| GET /api/chat/sessions/<id> | JWT + membership | chat:read | Selected authorized workspace; otherwise 404 |
| POST /api/chat/sessions | JWT + membership | chat:create | Trusted member attribution; persona must belong to workspace |
| PUT /api/chat/sessions/<id> | JWT + membership | chat:create | Idempotent empty creation, workspace-scoped replay; no overwrite |
| GET /api/chat/sessions?version=2 | JWT + membership | chat:read | Paginated active/archive list for selected workspace |
| GET /api/chat/sessions/<id>?version=2 | JWT + membership | chat:read | Workspace active or archived session, full typed fields, bounded message page |
| PATCH /api/chat/sessions/<id> | JWT + membership | chat:write | Workspace session; If-Match required; archive blocked while unresolved |
| POST /api/chat/sessions/<id>/operations | JWT + membership | chat:write; also ai:generate for provider actions | J.3 durable generation/replay: same-session source projection, Step I context, committed claim/run before call, atomic response/final-run completion. Shortening remains deterministic. |
| GET /api/chat/sessions/<id>/operations/<key> | JWT + membership | chat:read | Workspace session status; never dispatches or exposes claim tokens |
| POST /api/chat/sessions/<id>/operations/<key>/abandon | JWT + membership | chat:write | Workspace uncertain operation; explicit boolean acknowledgement; old completion fenced |
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

| Role | Workspace/chat read | Create workspace chat | AI generation | Configuration write policy |
|---|---|---|---|---|
| owner | Yes | Yes | Yes | Yes |
| admin | Yes | Yes | Yes | Yes |
| developer | Yes | Yes | Yes | Development/test only |
| member | Yes | Yes | Yes | No |
| viewer | Yes | No | No | No |

Step J.2 adds `chat:write` for owner/admin/developer/member, and not viewer.
It permits shared workspace metadata/revisions/archive/recovery; it does not
grant configuration edits or access to other workspaces. All J.2 repository writes
refresh membership/role under a short membership lock before locking the session.
Legacy initial-message creation now also refreshes its `chat:create` permission.
Authenticated chat responses, including errors, use `Cache-Control: no-store`.
J.3 rechecks current capabilities and claim fencing before every provider stage and
completion. Same-key replay precedes generation configuration lookup. Responses use
200 for success, 202 for already-running, 429 for known provider rate-limit failure,
502 for other known generation failures, 503 for uncertain outcomes, and 409 for an
abandoned operation. GET status stays read-only/200. Uncertain outcomes require a new
explicitly acknowledged attempt; SDK retries are disabled. Old stateless endpoints
keep their capability/response contracts and do not persist conversation output.

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
No role bypasses workspace membership. Creator identity is attribution, not an access boundary.

## Privacy and revocation

Session queries require the selected workspace ID after checking current membership and capabilities.
Message reads first authorize that parent session. Sessions with no creator are also
visible within their workspace; their attribution is preserved. Legacy reads hide archives;
v2 supports shared archived history and restore. New session/message authors come
from verified backend context. No historical ownership backfill occurs.

Deleted memberships cannot authorize subsequent requests. If `revoked_at` exists, a
non-null value excludes membership from discovery, resolution, and chat creation checks.
The optional JSONB lookup tolerates the historical schema without that field; it does
not provide soft revocation when no lifecycle mechanism exists. Live inspection and any
migration execution remain outstanding. See [approved design](STEP_G_REVOCATION_PROPOSAL.md).
Already-authorized in-flight requests are not automatically canceled.

On the Step J feature branch, normal React chats use workspace-shared session/operation APIs. The sidebar role controls are advisory; every request still verifies membership, capabilities and workspace scope on the server. Account/workspace changes abort local waiting and reject stale responses.
Scoped legacy chats have a separate read-only Local history view. Old scoped/unscoped keys remain untouched; unscoped records remain hidden. Pending operation identifiers/input use a new account/workspace namespace, with no automatic POST replay or historical import. Calendar remains browser-local.
J.5 snapshots history only after membership/capability/workspace/source authorization,
inside the session claim lock. All history query joins repeat session equality.
The browser cannot supply history, generation_input or conversation_context. Only
completed results enter bounded user/assistant projections; operational commands,
foreign conversations, failed/pending results and obsolete alternatives are excluded.
Current brand/persona/compliance remain authoritative. Media uses its stored source,
and compatibility stateless endpoints do not gain implicit conversation access.
Stale parent media submissions are rejected before dispatch once a saved artifact
exists for that source/type/target; subsequent attempts must use its current revision.
Browser namespacing is not encryption or protection from someone controlling the device.

## Remaining acceptance

Local synthetic tests cover route guards, signed JWT rejection, capabilities, selection,
workspace repository predicates, attribution, generation response compatibility, and browser
storage isolation. J.4 adds real Chrome UI checks against a synthetic transport, including account changes and viewer controls; these do not establish live Auth isolation. The owner reported positive normal UI/multiple-browser chat behavior after J.4 and positive follow-up testing after J.5. The full live role matrix, multi-workspace isolation, revocation lifecycle, deployment review, invitations and historical migration remain separately tracked. See Step J finalization for precise evidence and remaining gates.
