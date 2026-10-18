# Step I implementation and testing

Updated 2026-10-17 (America/Los_Angeles).

## Delivery status

The Step I application implementation is complete and ready for comprehensive
local user acceptance testing. Automated/mock/SSR checks pass. Live browser,
Neon, real Auth and Anthropic acceptance are **NOT RUN**, not implied passes.
Production deployment or merge readiness is not claimed.

The owner explicitly authorized the full remaining implementation, the licensed
name setting, brand editor expansion, and small database persona editor in the
pasted request supplied after the resolver review. No further product decision
blocks the application code. Configured names, licenses and disclosure wording
still require owner verification before publishing.

## Branch and baseline

Continue on `codex/step-i-context-resolver`. At the start of this session the tree
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
new `components/PersonaManager.jsx`, `context/WorkspaceData.js`,
`context/WorkspaceDataProvider.jsx`, `lib/workspaceConfiguration.js`,
`lib/workspaceConfiguration.test.js` and `lib/stepIComponents.test.js`.

Documentation:
this report, `STEP_I_CONTEXT_CONTRACT.md`, and new
`STEP_I_DEV_SEED_REVIEW.sql`.

No package/lockfile, environment, schema, membership or hosting changes.

## Automated verification

Earlier pre-Step-I baseline: 147 backend passed / 20 skipped, 25 client passed.
First resolver slice: 218 backend passed / 20 skipped.

Final checks for this implementation:

| Check | Status/result |
| --- | --- |
| `python -m pytest server/tests -q` | PASS: **343 passed, 20 skipped** |
| `npm --prefix client test` | PASS: **56 passed**, none skipped |
| `npm --prefix client run lint` | PASS using configured Oxlint; three existing Fast Refresh warnings |
| `npm --prefix client run build` | PASS; existing large-bundle warning (~1.40 MB minified JS) |
| `npm exec --offline --no -- eslint .` from client | NOT RUN successfully: ESLint is not installed/configured; offline resolution returned `ENOTCACHED`. No dependency was installed |
| Git whitespace checks, including new files | PASS |
| Live Neon/Auth/browser checks | NOT RUN |
| Paid Anthropic generation | NOT RUN |

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

No live database query or write was executed. The exact Neon development branch,
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
7. Switch account/workspace while configuration is loading or a save is pending.
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

No known automated test failures remain. Live compatibility with the actual
profile JSON/types, persona uniqueness/defaults, real role membership, idle DB
recovery, model behavior and visual export layout remain acceptance items.
A missing profile requires separately authorized provisioning; this implementation
preserves the Step H missing-row error instead of silently creating one.

The configured linter is Oxlint, not ESLint. No lint-tool migration or unrelated
bundle optimization was introduced. Existing Step G revocation/live Auth and
Step H real-browser/idle-recovery gates remain separate. Step J chat persistence,
historical migration, RAG, embeddings and production deployment remain out of scope.

No application servers or background services were started by this session. All
commands/tests completed and test middleware was closed. No live writes, paid
calls, database branch creation, schema changes, commits, pushes or merges occurred.

Suggested human-approved integration: review the diff on this branch, complete
local acceptance, refresh comparison against the actual `luciev2_newteam`, and
then choose the commit/PR/merge process. Do not auto-merge or deploy from this report.
