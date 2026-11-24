# Compare and combine (beta)

From the V2 feature shortlist (priority 2): send the same prompt to two different
models, show both answers side by side, and have Lucie walk the broker through
combining the best parts of each into one final version. This replaces the 5 to 6
rounds of copying drafts between Lucie and a personal ChatGPT account.
What the broker liked in each draft is stored, so over time the team can see which
model is better at hooks, tone, calls to action and so on.

## How it works

1. When the beta is on, the left menu shows **Compare** (with a **Beta** tag) next to Chat and Calendar. It opens a dedicated page with its own request box and a **Compare** button; the chat composer is unchanged.
2. The server runs the normal chat
   generation (same brand, persona, compliance rules and output formats) once per model,
   in parallel.
3. The two answers appear as **Version A** and **Version B**. Which model is A is
   shuffled on every comparison and model names are hidden until a vote, so the choice is blind.
4. **Step 1, tap what works.** Under each version Joseph taps the parts he likes
   (opening hook, tone and voice, call to action, length, specific details and so on;
   campaigns get theme, post ideas, schedule, platform mix and so on) and can add a note.
5. **Step 2, say what the final needs.** An optional "anything to change?" line. Lucie reads
   the plan back ("I'll keep the opening hook from Version A, and the call to action from
   Version B…") before anything is generated.
6. **Combine into one version.** One call to the merge model (default: model A) with both
   drafts, the liked parts and the change. It uses the same brand, persona, compliance and
   output format as the drafts, and never asks clarifying questions.
7. **Step 3, adjust until it's right.** Quick chips (*Make it shorter*, *Sound more casual*,
   *Stronger call to action*, …) or a typed instruction rework the latest combined version,
   one call each, up to 8 rounds per comparison. Earlier rounds stay viewable. Copy when happy.
8. **Save as new Compare chat.** Under the combined version (or after picking a draft) *Save as
   new Compare chat* always starts a brand-new chat in the chosen persona's folder (never the open
   chat). It carries a violet *Compare* tag in the sidebar and header, derived from the saved
   comparison link, so no database change is needed. The chat holds the original request and the
   chosen version as an ordinary exchange: it appears in history, the chat list preview, and later Lucie replies can build on it;
   Regenerate and Make it shorter work on it. A *How this was made* section under the saved reply
   reopens both drafts, what was liked, every round and the cost. Saving makes no AI call, creates
   the chat if it is still unsent, and is safe to retry (the same save is never added twice).
9. If one draft is already right, *Use Version A/B as is* or *Neither works* records that
   instead. Either way Lucie then reveals the models, tokens, latency and cost of each side.

Scope and limits of this beta:

- Comparison prompts are **single-turn**: earlier messages in the chat are not sent to the
  models. The comparison itself is always stored in `public.model_comparison`; it only enters the
  chat history when the user clicks *Save as new Compare chat*. An unsaved comparison disappears from
  the screen on refresh (the record stays in the database).
- Images and video scripts are not compared; only the chat reply.
- Viewers can read the summary but cannot run comparisons (`ai:generate` is required).
- A failed side shows a friendly error; the other side is still shown and logged.
  Nothing is retried automatically, because every retry is another paid call.

## Turning it on

1. Apply [`database/model_comparison.sql`](database/model_comparison.sql) to the target
   Neon branch (additive: one new table, `public.model_comparison`). This is **not** run
   automatically. If the table is missing, comparisons still work but votes cannot be saved
   and the UI says so.
2. Set these on the Flask server (Render) and restart:

| Variable | Example | Notes |
|---|---|---|
| `LUCIE_COMPARE_BETA` | `true` | Kill switch. Anything else hides the feature and the routes return 404. |
| `COMPARE_MODEL_A` | `anthropic:claude-sonnet-5-5` | Default if unset. |
| `COMPARE_MODEL_B` | `openai:gpt-6.1-sol` | Required. `anthropic:` also works, e.g. Sonnet vs Haiku. |
| `COMPARE_MERGE_MODEL` | `anthropic:claude-sonnet-5-5` | Optional. Model that combines and adjusts. Defaults to model A. |
| `OPENAI_API_KEY` | | Required when either model is `openai:`. |
| `COMPARE_PRICES` | `{"<gpt model id>": [1.25, 10]}` | USD per million input/output tokens, for models not in the built-in table. |
| `COMPARE_OPENAI_REASONING_EFFORT` | `low` | Recommended for GPT-6 models, which reason by default (reasoning tokens are billed as output). |

`GET /api/compare/config` reports `enabled` and, when off, a `reason`
(`beta_disabled`, `models_not_configured`, `models_identical`, `openai_key_missing`).

## Cost

Every comparison is **two full generations instead of one**, so it roughly doubles the
AI cost of that message, plus the second provider's own price. Each *Combine* or *Adjust*
click is one more call on the merge model; its prompt contains both drafts, so it costs a
little more than a normal reply. Campaign requests make two
calls per model (a clarification check and the campaign), so a campaign comparison is
about four calls.

Each side's token usage and estimated cost are stored with the comparison and logged as
`[compare_usage]` lines. Built-in prices (Anthropic list prices, USD per million tokens):

| Model | Input | Output |
|---|---|---|
| `claude-sonnet-5-5` | 2.00 | 10.00 |
| `claude-sonnet-4-6` | 3.00 | 15.00 |
| `claude-haiku-4-5` | 1.00 | 5.00 |
| `claude-haiku-5-5` | 0.10 | 0.50 |
| `claude-opus-5-5` | 4.00 | 20.00 |

Anthropic cache writes are estimated at 2x input (Lucie uses the 1-hour cache) and cache
reads at 0.1x. Built-in OpenAI prices (from third-party trackers, Nov 2026; verify on
OpenAI's pricing page): `gpt-6.1-sol` and `gpt-6-sol` 2.00 / 10.00, `gpt-6-luna` 0.10 / 0.50.
Other models need `COMPARE_PRICES`, or the estimate shows "not priced" (tokens are still recorded).

Rough example: a typical chat reply is about 5,000 input and 400 output tokens. On Sonnet
5.5 that is about $0.014 uncached, or about $0.006 with a warm cache. The second model adds
its own cost on top, so plan on roughly 2x to 3x the cost of a normal message while the beta
is on. Turn it off with `LUCIE_COMPARE_BETA=false` once enough votes are in.

## Reading the results

`GET /api/compare/summary` returns, per model, how often it was shown, wins, ties,
combined, "neither" votes, unvoted comparisons, failures, total estimated cost, and
`liked_aspects` (how often each part of that model's drafts was kept when combining).

## Implementation map

- `server/services/model_compare.py`: config, provider adapters (OpenAI requests are
  translated from the existing Anthropic-shaped calls), blind slot shuffle, cost estimates.
- `server/services/compare_http.py`: `/api/compare/config`, `POST /api/compare`,
  `POST /api/compare/<id>/choice`, `POST /api/compare/<id>/combine` (combine, or
  `refine: true` to adjust the latest combined version), `GET /api/compare/summary`.
- `server/repositories/model_comparison_repository.py`: workspace-scoped storage.
- Saving into a chat: a normal `send` operation carrying `comparison: {id, source}`
  (`source` = `combined`, `A` or `B`). `generation_operations.execute_operation` routes it to
  `chat_persistence_repository.save_comparison_operation`, which claims and completes it in one
  transaction from the stored comparison (no provider call). `GET /api/compare/<id>` reads the
  record back and keeps working if the beta is later switched off.
- `client/src/components/ModelComparison.jsx`, `client/src/lib/modelCompare.js`, and the
  toggle in `client/src/pages/ChatPage.jsx`.
- Tests: `server/tests/test_model_compare.py`, `client/src/lib/modelCompare.test.js`
  (both providers mocked; no paid calls, no database).

Claude Sonnet 5.5 rejects `thinking: {"type": "disabled"}`, which the shared chat
generation sends, so the comparison adapter swaps it for `between_tools` on that model.
The main chat route still uses `ANTHROPIC_MODEL` unchanged.
