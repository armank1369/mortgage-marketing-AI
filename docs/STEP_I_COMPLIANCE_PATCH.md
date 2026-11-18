# Step I compliance patch — independent review issues 1 and 2

Prepared 2026-10-18. Base: `f4eed9330d84e99e3fb9965301e87dacb2f9327b`,
branch `codex/step-i-context-resolver`. No merge,
commit, deployment, schema change or live service call was performed for this fix.

The independent review supplied by the developer identified two inherited gaps:
review warnings could enter publication copy, and campaign enforcement examined
captions without inspecting carousel slides/hashtags. Both are addressed here.
Issue 3 (legacy presentation branding) and long-disclosure image layout are
outside this patch. Step J work is not included.

## Review and resulting behavior

Before edits, the agent inspected the context/footer builder, fixed compliance
policy, post/video/campaign enforcement, API response/flag handling, post/campaign
clipboard assembly, chat persistence, calendar save/detail paths and current Step
I contract/test documentation. The changes reuse existing rules and authorization;
no new provider request or database query is required.

- Generated warnings now stay in `compliance_flags`, rather than being appended
  to text replies, post CTAs, campaign captions or video scripts. Existing
  fair-housing/forbidden-word/pricing flags remain; referral/partnership review
  uses `possible_respa_review`. Recognized model-inserted review-note paragraphs
  are removed with `embedded_compliance_note_removed` retained as advisory metadata.
- The trusted **complete** disclosure block ends text/captions/CTAs; video CTAs
  end with the complete `[END CARD: ...]`. Existing disclosures found earlier in
  the field are moved to the end instead of allowing trailing commentary.
- Campaign enforcement scans caption, every slide and all hashtags, including
  CamelCase/underscore hashtags. If any field contains a restricted pricing offer,
  the entire entry's publication packet is replaced by the existing conservative
  withholding message; tags are cleared and any existing slide packet becomes one
  withholding slide with disclosure. Scheduling and strategy metadata remain.
- Fair-housing-sensitive/forbidden-word matches continue to require human review;
  they are flagged, not described as legally certified or automatically corrected.
  Campaign final slides and post carousel final body slides receive disclosure,
  in addition to accompanying caption/CTA disclosure.
- API/provider output envelopes, authorization and prompt caching remain intact.
  No new model response schema field is required. The fixed prompt no longer asks
  the model to append review notes to publication copy.
- Chat retains flags on new assistant messages and renders a separate
  `ComplianceNotice`. Nested video results and newly saved calendar details retain
  warning metadata; calendar detail modals display it outside copyable content.
  Mechanical `missing_or_altered_footer` repairs alone do not show a review alarm.
- Clipboard assembly explicitly selects content fields, includes campaign slides,
  and places hashtags/brief details before the final disclosure. It excludes
  advisory metadata. Recognized old inline review notes are filtered when copying
  without rewriting saved history or inventing a historical identity. This is a
  labeled-note backstop, not a semantic classifier of all possible advisory prose.

## Files

Backend: `server/app.py`; new `server/tests/test_step_i_compliance.py`.

Frontend: new `client/src/components/ComplianceNotice.jsx`,
`client/src/lib/publicationCopy.js`, `client/src/lib/publicationCopy.test.js`;
updated `ChatPage.jsx`, `CalendarPage.jsx`, `CampaignResponse.jsx`,
`PostsResponse.jsx`, `ContentBriefCard.jsx`, and `stepIComponents.test.js`.

Docs: this note, `STEP_I_CONTEXT_CONTRACT.md` and
`STEP_I_IMPLEMENTATION_AND_TESTING.md`. No dependency/lockfile, database,
environment, membership or storage migration changes.

## Focused verification

| Check | Result |
| --- | --- |
| `python -m pytest server/tests/test_step_i_compliance.py server/tests/test_step_i_routes.py -q` | PASS: **81 passed** |
| `node --test src/lib/publicationCopy.test.js src/lib/stepIComponents.test.js` (from client) | PASS: **11 passed** |
| `npm --prefix client run lint` | PASS: configured Oxlint, three existing Fast Refresh warnings |
| `npm --prefix client run build` | PASS: existing large-chunk/plugin-timing warnings |
| Whitespace and local doc file links | PASS |
| Patch applicability | PASS: checked against the unchanged base index and in reverse against this patched tree, without applying or staging changes |

The focused backend set contains 20 new regressions plus existing Step I generation
routes: separate flags, plain text/posts/video/campaign footers, known model notes,
caption-clean but slide/tag-sensitive cases, pricing in each campaign field,
unaffected adjacent entries, final-slide disclosures, idempotence, separate referral
review and the real mocked campaign route. Frontend checks cover content-only copy,
carousel/hashtags, supplemental disclosures, nested video briefs, visible separate
notices, and chat/calendar metadata storage. Existing SSR editor/template cases
also run in that focused command.

The complete historical 343-backend/63-frontend suite was not rerun or claimed as
the current full-suite count for this patch. Paid/live tests and interactive
clipboard/export acceptance were not run. All API/DB/provider behavior in tests
is synthetic/mocked; no production-readiness certification is implied.

## Patch application

The accompanying `STEP_I_ISSUES_1_2_FIX.patch` contains application code,
regression tests and these documentation updates. The fixes are **already applied
in this working tree**; do not apply the patch there a second time.

For another clean checkout at the reviewed base, from the repository root:

```powershell
git status --short
git apply --check C:\Users\Jaime\Downloads\STEP_I_ISSUES_1_2_FIX.patch
git apply C:\Users\Jaime\Downloads\STEP_I_ISSUES_1_2_FIX.patch
```

Preserve unrelated local work. Do not force an application if `--check` fails;
compare the actual base/diff first. No commit, push or merge is part of applying
this review artifact. The independent review's claim that integration refs match
was not treated as permission to merge or as fresh remote verification.

## Manual acceptance

After separately approved test-provider usage, inspect a synthetic draft that
triggers a review flag. The warning should appear in an amber advisory outside
the draft; Copy should omit that warning and retain the complete disclosure last.
For a campaign carousel, check that sensitive text confined to a slide or hashtag
is flagged; restricted pricing anywhere should withhold the whole entry's copy.
Inspect the final slide and a generated video's end-card cue, then save to Calendar
and confirm the review notice remains visible there without entering copied text.
Use only synthetic examples and do not publish them as real marketing material.

Previously reported developer acceptance of database-backed brand/persona saves
and the persona-selection hotfix remains recorded separately; this follow-up does
not retroactively claim new live compliance/export acceptance.
