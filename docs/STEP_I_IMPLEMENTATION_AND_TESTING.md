# Step I implementation and testing

Updated 2026-10-18 (America/Los_Angeles).

## 2026-10-18 final review and current acceptance record

This section supersedes the original implementation-time “NOT RUN” entries for
user-reported checks. Older sections retain their historical automated results.
Review started with a clean tree at `bdbe22f3fe9ef93e779078123a79ea535d81a747`
(`Saving selected persona in old chats hotifx`) on
`codex/step-i-context-resolver`. Commits `c7ca604` and `bdbe22f` already existed
when this review began; the agent did not create or amend them.

The developer subsequently confirmed that saved brand/persona configuration
appears across multiple browsers signed into the same account, while the chats
remain separate in each browser. The developer reported basic behavior working
after the persona-selection hotfix and then requested final code/documentation
review. This is **user-reported development smoke acceptance**, not an
agent-operated live test or proof of every scenario below.

| Acceptance area | Current evidence/status |
| --- | --- |
| Brand/profile and persona definitions persist across browsers on the same account | PASS — explicitly confirmed by the developer |
| Basic use after the older-chat generation-persona fix | PASS — developer reported the updated behavior working; six automated regressions cover selection/reload/switching |
| Chats stay browser-local | EXPECTED — developer confirmed; Step J persistence is not implemented |
| Per-chat generation choice persists in the same browser | Implemented in `generationPersonaId`, using the existing scoped browser chat record; not cross-browser preference synchronization |
| General text generation | Developer supplied screenshots of generated responses; no provider/cost audit was performed by the agent |
| Live campaign clarification, video, all image exports and long-disclosure layout | Automated/mock/SSR coverage passes; detailed live scenario results not individually recorded |
| Live member/viewer/developer restrictions and revoked membership | Automated coverage; complete live role/revocation matrix not individually confirmed |
| Live switching/isolation between two workspaces | NOT RUN — the team has used only one workspace; automated isolation tests pass |
| Live schema constraints, outage/idle recovery, provider cache hits, production readiness | Not established by the above smoke tests; keep earlier Step G/H and release gates separate |

A single authorized workspace is selected automatically; the Workspace dropdown
appears only for multiple memberships or an unresolved selection. Sidebar items
such as “Test 2” are chats within a workspace. Workspace creation, invitations and
membership/role management are not available in the UI. Another workspace would
require separately approved provisioning of workspace, membership and brand
profile; a second workspace is not an automatic prerequisite or migration for
Step I. Brand/persona records can then be configured in Settings.

The final review refreshed README navigation/status/usage, the authorization
matrix, environment notes, this report and the context contract. It reconciled
shared configuration versus browser-local chats/selections, the hotfix, single-
workspace testing and the exact scope of user-reported acceptance. Historical
Step F/G/H handoffs remain historical, with their outstanding gates linked.

One additional UI edge case was corrected: tone is extensible JSON and a stored
`voice` value can be structured data. Passing that object directly to the Brand
Summary's React text node could crash the modal. The editor and summary now use
one safe text accessor, with a regression test; structured tone data is preserved
and no database value is rewritten. No further blocking application issue was
identified in this scoped review. This is not a production-security certification.

Final review checks (2026-10-18):

| Check | Result |
| --- | --- |
| `python -m pytest server/tests -q` | PASS: **343 passed, 20 integration tests skipped** |
| `npm --prefix client test` | PASS: **63 passed**, including the six hotfix cases and the new tone-display case |
| `npm --prefix client run lint` | PASS: configured Oxlint, three existing Fast Refresh warnings |
| `npm --prefix client run build` | PASS: existing large-chunk/plugin-timing warnings |
| Documentation links and Git whitespace | PASS: all relative file links in the five reviewed current Markdown documents resolve; no added whitespace errors |

ESLint was not rerun or installed; the original unavailable-tool result is
retained below, and Oxlint remains the configured linter. No live DB query/write,
paid provider call, schema/environment change, workspace/member provisioning,
commit, push, merge or deployment was performed by this review. Test middleware
was closed and no application servers were started. The current branch is ready
for human diff review and development finalization; use the acceptance matrix to
carry unverified live/production scenarios forward rather than marking them passed.

## 2026-10-18 follow-up: remember generation persona on existing chats

The user reported that a pre-Step-I chat forgot its generation-persona selection,
while a newly created database-persona chat restored its default. The dropdown
was writing only a temporary `personaOverrides` React map, never the saved chat
record. Reload/remount discarded that map, leaving the older chat's original
non-UUID persona. New chats already held a database UUID in their original
persona snapshot, which explains their different behavior.

The dropdown now updates `generationPersonaId` on the selected chat using the
existing account/workspace-scoped chat persistence. Header/sidebar selection
labels resolve from that saved ID and the current workspace persona list.
Original persona snapshots, titles, timestamps and historical message UUIDs are
preserved. No browser records are automatically mapped to database personas.
An explicit empty selection remains empty; a deleted/foreign/unavailable persona
does not silently fall back. Onboarding explicitly resets the selection when
assigning a persona to a chat slot.

Changed `client/src/pages/ChatPage.jsx`; added `client/src/lib/chatPersonas.js`
and six regression cases in `chatPersonas.test.js`; updated this report and the
context contract. Tests cover independent chat switching, real storage/reload,
legacy message preservation, explicit clearing, unavailable selections and
account/workspace storage separation.

Validation: **62 frontend tests passed**, configured Oxlint passed with its three
existing Fast Refresh warnings, and production build passed with existing
large-chunk/plugin-timing warnings. Whitespace checks passed. Backend code was
unchanged, so backend tests were not rerun for this follow-up. No database writes,
paid model calls, commits or pushes were performed. Interactive browser acceptance
of this fix was subsequently reported successful at a basic level by the developer;
see the current acceptance record above. The reproducible check is to select a
persona in the older chat, switch to Test 2 and back, then refresh without sending
a new message.

## Delivery status

The Step I application implementation is complete, with automated coverage and
developer-reported basic development acceptance after the hotfix. Shared brand/
persona persistence has been confirmed across browsers on one account/workspace.
Detailed live cases beyond those observations remain individually unverified;
see the current acceptance matrix. Production deployment readiness is not claimed.

The owner explicitly authorized the full remaining implementation, the licensed
name setting, brand editor expansion, and small database persona editor in the
pasted request supplied after the resolver review. No further product decision
blocks the application code. Configured names, licenses and disclosure wording
still require owner verification before publishing.

## Branch and baseline

Continue on `codex/step-i-context-resolver`. At the start of the original full implementation the tree
was clean and HEAD was `443c250b4725ffa0af713857c495e98225f30489`
(`Step I setup`), containing the first resolver slice. That work was preserved.
The original Step H base is `8e452cbf71e703b724ac3b759a609788f37d43f0`.
The earlier review found cached `origin/luciev2_newteam` two commits behind the
Step H base, while the local `luciev2_newteam` was stale by 30 commits. No fetch
was performed, so current remote freshness is not asserted. No commit, push,
merge, deployment or destructive Git operation was performed in this session.

## Architecture and approved field mapping

See [STEP_I_CONTEXT_CONTRACT.md](STEP_I_CONTEXT_CONTRACT.md) for exact fields,
limits, precedence, failure statuses and compatibility rules.

Generation follows existing JWT/current membership/workspace/capability guards,
then reads the selected active persona and profile in the authorized workspace.
The resolver requires `business_name`, `nmls_id`, `dre_number` and the approved
JSONB key `settings.licensed_person_name`. Licensing request-body fields cannot
override these values. Unknown/foreign/deleted personas fail instead of falling
back. Missing/malformed configuration returns sanitized 409
`generation_configuration_required` before a provider call.

The centralized prompt builder combines fixed policies and feature templates
with bounded, delimited JSON brand/persona data. All Joseph-specific base voice
and hardcoded audience instructions were removed from active generation. Empty
optional voice defaults to clear, professional educational language. Arbitrary
settings are excluded. Configured strings are data, not permission to override
safety rules; construction tests do not prove immunity to model-level injection.

Every generation request reloads context. Campaign clarification and generation
share one context without duplicate repository queries. Existing structured
output schemas, token budgets, disabled thinking, parsing and response types are
retained. `build_system` keeps its one-hour ephemeral cache breakpoint; scoped
context and revision changes alter the prefix. Request content remains in user
messages; variable context follows the cache breakpoint.

One footer builder supplies name/NMLS/DRE/Equal Housing Opportunity plus bounded
supplemental text. Chat, posts, campaign captions and video end cards use it.
Social-image responses retain `template`/`slots` and add server disclosure,
business name and compliance flags. All six image templates render the complete
server-provided disclosure and brokerage name. Image quote attribution is
server-controlled. Existing deterministic pricing/fair-housing/forbidden-word
checks remain; configured brand banned words add checks, never disable fixed ones.
Video end cards and post CTAs receive the footer in the correct output location.

Provider authentication failures now return sanitized 502
`ai_provider_unavailable`, distinct from a user-session 401. No automatic paid
retry, global history scan, cross-user context cache or Step J retrieval was added.

## Configuration APIs and UI

- GET/PUT `/api/brand-profile` expose approved fields and `exists`/`can_write`.
  GET requires `workspace:read`; every PUT requires `config:write`.
  Legacy business-name-only writes remain supported. Missing profile GET remains
  200 with `exists=false`; PUT remains 404 and never reports a false save.
- The Settings brand editor includes business name, licensed-person name,
  NMLS, DRE, tone voice, values, keywords, catchphrases, banned words, writing
  examples, supplemental disclosure and equal-housing text. Tone is a plain
  textarea preserving other existing tone keys; arrays use one item per line.
  Optional structured examples use JSON. Only changed top-level fields are sent.
  Name writes merge only the approved settings key atomically. Other settings
  and omitted profile fields are preserved; supplied JSON/arrays replace that
  field. Draft empty identity is allowed to save, but generation remains blocked.
- GET `/api/personas` returns only active authorized workspace personas and safe
  fields. POST and PUT `/api/personas/<persona_id>` implement creation/editing of
  name, slug, description, audience JSON and guidance. Create has server-owned
  `is_starter=false`; no delete endpoint or broad management suite was added.
- Owner/admin may edit configuration; developer may do so only in development/
  test; member/viewer controls are read-only. Server guards remain authoritative
  even if UI permission state becomes stale.
- Onboarding retains pick/review/use stages with the shared database persona
  manager. Settings uses the same editor. Reviewed business-owner and first-time
  homebuyer draft starters are available; neither is saved automatically.
- Existing browser personas are never mapped by arbitrary old IDs. A legacy
  persona is labeled local and requires an explicit database selection. An
  optional review/copy action prefills name/description/pain points into a draft;
  it does not silently import the complete old persona. Save is explicit.
- Explicit selection preserves complete legacy snapshots in scoped preferences;
  preference storage retains unknown/historical fields and has no read-time
  migration. Existing unscoped keys, chats and calendars are not moved/deleted.
- Chat sends selected database `persona_id` and records it on each new assistant
  message for nested video/image requests. Historical messages without a UUID
  require explicit current selection; no fallback persona is invented.
- Workspace/account remounts abort loads/saves/generation. Shared scoped transport
  verifies expected scope before dispatch and rejects late workspace responses.
  Configuration errors point users to Settings. Local shortening preserves the
  existing disclosure instead of synthesizing a hardcoded Joseph footer.

## Changed/new file inventory

Backend application:
`server/app.py`, `server/logging_utils.py`,
`server/repositories/brand_profile_repository.py`,
`server/repositories/persona_repository.py`,
`server/services/generation_context.py`,
new `server/services/configuration.py` and `server/services/prompt_builder.py`.

Backend tests:
updated `server/tests/test_step_g_routes.py`, `test_step_h_routes.py`,
`test_step_i_context.py`; new `test_step_i_routes.py` and
`test_step_i_configuration.py`.

Frontend:
`client/src/App.jsx`, `pages/PreferenceSetup.jsx`, `pages/SettingsPage.jsx`,
`pages/ChatPage.jsx`, `components/BrandProfileEditor.jsx`,
`components/CampaignResponse.jsx`, `components/ContentBriefCard.jsx`,
`components/socialImage/SocialImageGenerator.jsx`, `templates.jsx`, `theme.jsx`,
`lib/authenticatedApi.js`, `lib/brandProfile.js`, `utils/storage.js`, `constants.js`;
new `components/PersonaManager.jsx`, `lib/chatPersonas.js`, `lib/chatPersonas.test.js`, `context/WorkspaceData.js`,
`context/WorkspaceDataProvider.jsx`, `lib/workspaceConfiguration.js`,
`lib/workspaceConfiguration.test.js` and `lib/stepIComponents.test.js`.

Documentation:
this report, `STEP_I_CONTEXT_CONTRACT.md`, new `STEP_I_DEV_SEED_REVIEW.sql`,
and current README, `AUTHORIZATION_MATRIX.md` and `ENVIRONMENT.md` updates.

No package/lockfile, environment, schema, membership or hosting changes.

## Automated verification

Earlier pre-Step-I baseline: 147 backend passed / 20 skipped, 25 client passed.
First resolver slice: 218 backend passed / 20 skipped.

Original full-implementation checks (2026-10-17; current review results appear above):

| Check | Status/result |
| --- | --- |
| `python -m pytest server/tests -q` | PASS: **343 passed, 20 skipped** |
| `npm --prefix client test` | PASS: **56 passed**, none skipped |
| `npm --prefix client run lint` | PASS using configured Oxlint; three existing Fast Refresh warnings |
| `npm --prefix client run build` | PASS; existing large-bundle warning (~1.40 MB minified JS) |
| `npm exec --offline --no -- eslint .` from client | NOT RUN successfully: ESLint is not installed/configured; offline resolution returned `ENOTCACHED`. No dependency was installed |
| Git whitespace checks, including new files | PASS |
| Agent-operated live Neon/Auth/browser checks | NOT RUN; subsequent developer smoke results are recorded above |
| Agent-operated paid Anthropic generation | NOT RUN; developer-provided response screenshots are separate evidence |

The full backend suite includes focused Step I tests for scope/UUID selection,
foreign/deleted/malformed/missing personas, missing identity, denied access before
context/provider calls, all role policies, partial field writes, full safe field
projection, mocked outages/conflicts, SQL parameterization and commit behavior,
JSON/text limits, fresh prompts after config changes, two-workspace isolation,
client licensing spoofing, all three generation endpoints, post/carousel/video/
image/campaign formatting, campaign clarification/two-call reuse, deterministic
pricing checks, cache-control placement, private settings exclusion and safe
provider authentication errors. Existing Step F/G/H regressions remain included.

Frontend tests exercise actual request helpers and validators for all exposed
fields and persona CRUD; expected account/workspace headers; abort and stale
transport responses; explicit legacy selection and persisted snapshots; unknown
preference preservation; safe configuration/permission messages. Additional tests
render actual JSX through installed Vite SSR with a synthetic transport and verify
read-only/editable controls, missing-profile errors, persona selection/legacy UI,
and all six image templates' complete disclosure and business name.

SSR tests do not simulate interactive browser clicks, layout/export clipping,
real Auth or database persistence. Default pytest blocks live DB connections;
the 20 skipped integration tests are explicitly not passes. No provider requests
were made. Vite's test middleware is closed after SSR tests and opens no application
listener.

## Database/seed decisions

No agent-operated live database query or write was executed. Developer-reported
manual configuration saves are recorded separately above. The exact Neon development branch,
target workspace and current values were not independently confirmed; credentials
or a connection-string name alone would not establish that target safely.

`STEP_I_DEV_SEED_REVIEW.sql` is a nonexecuted review template. Its narrow read-only
SELECTs use a NULL target and return no records until a confirmed UUID is supplied.
All writes are commented, development-only, transactional, guarded to fill empty
brand fields or insert absent workspace/slug personas, and end with ROLLBACK.
They do not seed identity, overwrite nonempty data, revive deleted personas,
create branches, alter schema or modify membership. Before enabling writes,
confirm the branch/target and relevant types/constraints, review actual records,
and obtain approval for exact statements. The UI offers manual configuration as
an alternative after the owner confirms the development target.

Brand voice proposals derive from the former BASE_PROMPT and business-owner
persona. The first-time homebuyer idea derives from the supplied handoff's
interview summary; the original interview was not independently accessed. The
historical Joseph/NMLS/DRE values and proposed Lucent Brokerage correction are
reference information, not verified facts or authorization to overwrite a row.

## Manual user acceptance checklist

1. Confirm privately that the configured database connection targets the existing
   Neon development branch and the intended workspace. Do not paste credentials.
   Use a pre-existing authorized test account. If the profile is absent, report
   `exists=false`; provisioning remains a separately approved data operation.
2. If local services are not already running, open two terminals in the repository:
   run `python server/app.py` for Flask on port 5001, and
   `npm --prefix client run dev` for Vite on port 3000. Reuse existing services
   when appropriate; never stop unrelated processes.
3. Open `http://localhost:3000`, sign in, select the intended development workspace,
   then open Settings. Expected: stored brand fields and active personas load;
   reads alone do not create or migrate records.
4. With a configuration-writing role, review the identity privately and enter only
   independently verified name/NMLS/DRE/business details. Save a small approved
   brand change, reload Settings, and confirm it persists. Saving changes live
   development data; perform only changes the owner chooses to authorize.
5. Review/create a persona or edit an existing one using a neutral audience. Save,
   reload, and confirm the same database selection appears. For a legacy persona,
   verify the warning and explicit selection/review-copy path; check prior chats
   and unscoped local keys remain preserved.
6. With member/viewer accounts, confirm no configuration Save/create/edit controls;
   backend writes must return 403. Member may generate; viewer generation must
   return 403. Test developer config edits only in development/test, never by
   changing real membership/roles for this check.
7. Using existing authorized accounts, switch account/workspace while configuration
   is loading or a save is pending. Workspace switching can be deferred when only
   one workspace exists; do not create another without separate provisioning approval.
   Expected: no stale profile/personas/result displayed in the new scope. A request
   already committed server-side is not undone by browser cancellation; do not
   automatically retry writes or paid calls after ambiguous connection failure.
8. After **separate approval for paid Claude calls**, explicitly select a saved
   persona and test an educational post, campaign plus clarification/follow-up,
   generated video, and social image. Verify correct voice/audience and the exact
   configured name/NMLS/DRE/EHO footer. Change tone/guidance through an approved
   save and confirm the next request reflects it.
9. Inspect downloaded graphics at full size (including long supplemental disclosures),
   video end cards, carousel/post CTAs and human-review flags. Report any clipping
   or missing disclosure. Validate live cache hit behavior from token-count logs,
   not assumed from mocked `cache_control` assertions.
10. Report pass/fail per scenario, role/workspace used, a synthetic prompt, and a
    sanitized error if needed. Never send tokens, connection strings, private
    customer content or environment-file contents. Stop only services you started
    with Ctrl+C when finished.

## Open gates, limitations and integration

No known automated test failures remain. Basic configuration persistence works
in the developer's reported environment. This does not prove every live profile
type/constraint, persona uniqueness/default, role boundary, idle DB recovery path,
model behavior or export layout; unconfirmed coverage remains tracked above.
A missing profile requires separately authorized provisioning; this implementation
preserves the Step H missing-row error instead of silently creating one.

The configured linter is Oxlint, not ESLint. No lint-tool migration or unrelated
bundle optimization was introduced. Existing Step G revocation/live Auth and
Step H real-browser/idle-recovery gates remain separate. Step J chat persistence,
historical migration, RAG, embeddings and production deployment remain out of scope.

No application servers or background services were started by this session. All
commands/tests completed and test middleware was closed. The agent performed no live writes, paid calls, database branch creation, schema
changes, commits, pushes or merges. Developer actions and pre-existing commits
are distinguished from agent actions in the current acceptance record.

Suggested human-approved integration: review the diff on this branch, complete
local acceptance, refresh comparison against the actual `luciev2_newteam`, and
then choose the commit/PR/merge process. Do not auto-merge or deploy from this report.
