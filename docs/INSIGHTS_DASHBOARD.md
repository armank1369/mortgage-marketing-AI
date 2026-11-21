# Insights dashboard

The **Insights** page (sidebar, owners and admins only) shows KPIs for the selected workspace and a short written review by Lucie. It is V2 shortlist item "Dashboard (KPI with analysis/summary)".

## What it measures

**Content pipeline** (works today, from existing tables):

| KPI | Source |
|---|---|
| Posts scheduled, posts per week, change vs. previous period | `calendar_entry` (not cancelled), local day in the entry's timezone |
| Longest gap without a scheduled post | same |
| Next 14 days: planned posts and empty days | same |
| Platform, format, persona and weekday mix | `calendar_entry` + `content_item` + `persona` |
| Drafts Lucie wrote, and share that reached the calendar | assistant `chat_message` rows of type `posts`/`campaign`, and whether a `content_item` cites them |
| Compliance flags on scheduled posts | `display_data.details.compliance_flags` |
| Campaign progress | `campaign` with linked calendar entries |

Lucie has no "mark as posted" action yet, so "scheduled" means a calendar slot, not a confirmed post.

**Results** (needs the migration below and an import): reach, engagements (likes + comments + shares + saves), engagement rate (engagements / reach, falling back to impressions then views), clicks, follows, rate by platform / persona / weekday, top posts, and Lucie-scheduled posts vs. everything else.

## Importing results

Owners upload the post-level CSV export from:

- **Meta Business Suite** (Instagram and Facebook): Insights → Content → Export data → posts, CSV.
- **LinkedIn Page analytics**: Analytics → Content → Export. LinkedIn downloads a spreadsheet; save the "All posts" sheet as CSV.

The server finds the header row, detects the platform (or uses the one chosen in the form), and upserts one `post_metric` row per post keyed by `(workspace, platform, post id or permalink)`, so re-importing updates numbers instead of duplicating. Dates without an offset are read in the uploader's device timezone. Each post is linked to a not-yet-linked calendar slot on the same platform and local day, closest in time. Parsing is in `server/services/insights_import.py`.

## Lucie's review

`POST /api/insights/analysis` sends only the computed KPI JSON (no chat text; captions are cut to 140 characters for top posts) to the configured `ANTHROPIC_MODEL`, with a JSON schema for headline / working / concerns / next steps / missing data. The prompt forbids figures that are not in the data, benchmarks and rate or pricing advice. The review runs only when someone clicks the button, and is stored in `insight_report` per workspace, period and day; the page shows it on later visits and marks it "numbers have changed since" when the KPI fingerprint differs.

## Database update (required for results and saved reviews)

Apply [`database/insights.sql`](database/insights.sql) on the target Neon branch after review. It only adds `post_metric` and `insight_report`. Until it is applied, the pipeline KPIs still work, the import returns `insights_storage_missing` (409), and reviews are generated but not saved.

## Testing

- `server/tests/test_insights.py`: KPI math, Meta/LinkedIn parsing, route permissions, import and review routes with a mocked model.
- `client/src/lib/insights.test.js`: formatting, role gate and file checks.
- The SQL in `insights_repository.py` and the migration were exercised against a local PostgreSQL 16 with synthetic rows (not Neon).
