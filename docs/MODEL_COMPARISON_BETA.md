# Two-model comparison (beta)

From the V2 feature shortlist (priority 2): send the same prompt to two different
models, show both answers side by side, and have Lucie ask the broker which one is
better. Votes are stored so the team can see, over time, which model Joseph prefers.

## How it works

1. When the beta is on, the chat composer shows a **Compare two models (beta)** checkbox.
2. With it ticked, **Send** becomes **Compare**. The server runs the normal chat
   generation (same brand, persona, compliance rules and output formats) once per model,
   in parallel.
3. The two answers appear as **Version A** and **Version B**. Which model is A is
   shuffled on every comparison and model names are hidden until a vote, so the choice is blind.
4. Joseph picks *Version A is better*, *Version B is better*, *Both are good* or
   *Neither works*, with an optional reason. After the vote Lucie reveals the models,
   tokens, latency and estimated cost of each side.

Scope and limits of this beta:

- Comparison prompts are **single-turn**: earlier messages in the chat are not sent, and
  neither version is saved into the conversation. Use Copy to keep a version.
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
| `COMPARE_MODEL_B` | `openai:<gpt model id>` | Required. `anthropic:` also works, e.g. Sonnet vs Haiku. |
| `OPENAI_API_KEY` | | Required when either model is `openai:`. |
| `COMPARE_PRICES` | `{"<gpt model id>": [1.25, 10]}` | USD per million input/output tokens, for models not in the built-in table. |
| `COMPARE_OPENAI_REASONING_EFFORT` | `low` | Optional, for OpenAI reasoning models. |

`GET /api/compare/config` reports `enabled` and, when off, a `reason`
(`beta_disabled`, `models_not_configured`, `models_identical`, `openai_key_missing`).

## Cost

Every comparison is **two full generations instead of one**, so it roughly doubles the
AI cost of that message, plus the second provider's own price. Campaign requests make two
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
reads at 0.1x. OpenAI models have no built-in price: add one with `COMPARE_PRICES`, or the
estimate shows "not priced" (tokens are still recorded).

Rough example: a typical chat reply is about 5,000 input and 400 output tokens. On Sonnet
5.5 that is about $0.014 uncached, or about $0.006 with a warm cache. The second model adds
its own cost on top, so plan on roughly 2x to 3x the cost of a normal message while the beta
is on. Turn it off with `LUCIE_COMPARE_BETA=false` once enough votes are in.

## Reading the results

`GET /api/compare/summary` returns, per model, how often it was shown, wins, ties,
"neither" votes, unvoted comparisons, failures and total estimated cost for the workspace.

## Implementation map

- `server/services/model_compare.py`: config, provider adapters (OpenAI requests are
  translated from the existing Anthropic-shaped calls), blind slot shuffle, cost estimates.
- `server/services/compare_http.py`: `/api/compare/config`, `POST /api/compare`,
  `POST /api/compare/<id>/choice`, `GET /api/compare/summary`.
- `server/repositories/model_comparison_repository.py`: workspace-scoped storage.
- `client/src/components/ModelComparison.jsx`, `client/src/lib/modelCompare.js`, and the
  toggle in `client/src/pages/ChatPage.jsx`.
- Tests: `server/tests/test_model_compare.py`, `client/src/lib/modelCompare.test.js`
  (both providers mocked; no paid calls, no database).

Claude Sonnet 5.5 rejects `thinking: {"type": "disabled"}`, which the shared chat
generation sends, so the comparison adapter swaps it for `between_tools` on that model.
The main chat route still uses `ANTHROPIC_MODEL` unchanged.
