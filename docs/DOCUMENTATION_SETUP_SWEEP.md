# Documentation and setup sweep

Reviewed October 19, 2026, against `3babfa8` (workspace sharing), `ef8a57e`
(tag/sample inputs), `9d730ac` (legacy controls/sidebar) and `ec244d8` (workflow recovery).
This is a local review and installation check, not a deployment or live acceptance claim.

## Documentation corrections

- README now leads with the current feature branch, actual clone/switch commands,
  prerequisites, virtual environment creation, complete backend requirements install,
  lockfile-based frontend install, non-overwriting environment-file copies, separate
  server commands, ports, tests and troubleshooting.
- New setup consistently uses `server/.venv` and its Python executable. Activation
  and execution-policy changes are unnecessary; an older `server/venv` can be used
  by substituting that path consistently.
- New [UI/workflow guide](CURRENT_UI_GUIDE.md) covers persona review/locking, number
  buttons, the optional slider/dropdowns, tags, writing examples, supplemental text,
  starter proposals, the empty-only voice draft, sidebar, export and shared chats.
- The feature/API guide now describes workspace-shared reads/writes, immutable
  persona metadata, session presentation fields, shared archive/restore, idle refresh
  and bounded workspace idea avoidance directly, instead of requiring a banner to
  override contradictory private-chat behavior.
- Environment configuration no longer claims the normal chat is browser-only or
  disconnected from PostgreSQL. The recovery parity table now includes shared-workspace
  idea retrieval. The testing guide uses the new environment path and current UI checks.
- Historical plan/finalization reports and their old counts remain labeled evidence;
  current workflow and setup links take precedence. Old SQL/seeds are not install steps.

## Verification

Verified on Windows with Python 3.14, Node 24.11.0 and npm 11.6.1.

| Check | Result |
|---|---|
| Fresh temporary Python venv + `pip install -r server/requirements.txt` | Passed; no pre-existing site packages reused |
| `pip check` in fresh venv | Passed; no broken requirements |
| Full backend suite from fresh venv | 532 passed, 37 opt-in live integration tests skipped |
| `npm --prefix client ci` | Passed; 408 packages installed using the committed lockfile |
| `npm --prefix client test` after reinstall | 113 passed |
| `npm --prefix client run lint` | Passed; 3 existing Fast Refresh warnings |
| `npm --prefix client run build` | Passed; existing large-bundle advisory and plugin timing notice |
| `npm --prefix client run test:chat-browser` | Passed; current UI, export, recovery, sharing, viewer and mobile checks |
| Local Markdown file/heading targets in the 7 edited/new guides | 48 checked; no missing targets |
| `git diff --check` | Passed |

The first npm attempt encountered `UNABLE_TO_VERIFY_LEAF_SIGNATURE`. Retrying with
Node 24's `--use-system-ca` enabled the Windows certificate store and succeeded;
TLS verification stayed enabled. The process-local Node option was restored afterward.
The README documents this managed-network troubleshooting path.

The existing lockfile emits Better Auth peer-override and deprecated React Email
package notices. Read-only `npm audit` reported **9 findings: 7 high, 2 moderate**.
Affected package entries include direct Axios and Tailwind, and transitive braces,
chokidar, fast-glob, micromatch, postcss-nested, postcss-selector-parser and source-map-js.
These are audit classifications, not demonstrated application exploits. The audit's
suggested Tailwind resolution includes a major upgrade to 4.3.3. No automatic
`npm audit fix --force`, dependency upgrade or lockfile rewrite was applied during
this documentation review. Dependency remediation needs its own compatibility
review, including real Auth and restored UI coverage. To reproduce the report:

```powershell
npm --prefix client audit
```

That command queries the registry and returns a nonzero status when findings exist;
it is not the offline regression suite. Installation success and passing tests do
not mean the dependency audit is clean.

No live database changes, provider generation, commits, pushes or deployment are part
of this review. Existing credentials were neither displayed nor overwritten.

## Remaining live checks

A fresh dependency installation does not create a Neon schema, provision memberships,
prove real multi-account Auth/RLS isolation or validate paid generation and deployed
runtime timeouts. Use approved development configuration and existing test memberships
for the [sharing checklist](WORKSPACE_CHAT_SHARING.md#return-to-computer-checklist).
