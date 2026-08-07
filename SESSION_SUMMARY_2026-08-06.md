# Session Summary — 2026-08-06

Recap of the Claude Code session that took the app from an Ollama-based prototype to a Claude-powered v1 ready to hand to the client.

## 1. Switched the backend from Ollama to the Claude API

- `server/app.py` now calls `anthropic.Anthropic()` instead of a local Ollama HTTP endpoint.
- Model is read from `ANTHROPIC_MODEL` in `.env` (started on `claude-haiku-4-5`, later moved to `claude-sonnet-5` for better quality on compliance-sensitive marketing copy).
- Campaign generation uses Claude's **structured outputs** (`output_config.format` + a JSON schema) instead of Ollama's `format: 'json'` mode, for reliable JSON every time.
- Added typed error handling for auth/rate-limit/connection/status errors instead of Ollama-specific messages.

## 2. Duplicate content prevention

- Added `get_recent_idea_context()` — pulls the last ~12 responses from the `chat_history` table, extracts each one's core concept (heuristic: labeled "Concept:" lines, or the first substantive non-filler line), and injects up to 25 of them into the system prompt as "already used — don't repeat."
- Tracked brand-wide (across personas/chats), not per-persona, since a reused idea reads as repetitive regardless of which chat it came from.

## 3. Video Content Briefs section (campaign output)

- Extended `CAMPAIGN_JSON_SCHEMA` with a `video_briefs` array: title, pillar, script (intro/body/cta with timestamps), creative_direction (setting/camera/lighting/energy/background/clothing), quick_details (duration/tone/CTA/platforms).
- Added `enforce_video_brief_compliance` — footer goes on the script as an `[END CARD: ...]` cue, not raw dialogue.
- **Bug caught & fixed:** Sonnet 5 runs adaptive thinking by default. With `thinking` unset, it was silently burning the entire `max_tokens` budget on thinking and leaving zero tokens for actual output (`stop_reason: max_tokens`, empty response). Fixed by explicitly setting `thinking: {type: 'disabled'}` for this formulaic generation task and raising `max_tokens`.

## 4. No-markdown output + unified card UI

- Added `NO_MARKDOWN_PROMPT` instruction plus a deterministic regex-based `strip_markdown()` / `strip_markdown_deep()` backstop (prompting alone wasn't reliable), so responses never show literal `**bold**`, `#headers`, or `---` rules.
- Extracted a shared `Section` component (`client/src/components/Section.jsx`) and used it for **every** assistant reply, not just campaigns — plain-text answers now render in the same white bordered card chrome as the four-pillar sections instead of a chat bubble.

## 5. Structured "posts" response type for single/multi post requests

- `NON_CAMPAIGN_FORMAT_PROMPT` now routes every non-campaign request into one of three shapes: clarifying questions, ready-to-post content (one or more posts), or plain text.
- Since this path isn't schema-enforced, added a forgiving JSON extractor (`_extract_json_object`) that finds a balanced-brace JSON object even if the model wraps it in a sentence — fixes real failures seen in testing.
- Built `ClarificationResponse.jsx` (checkbox-based follow-up questions, multi-select, optional free-text) and `PostsResponse.jsx` (one card per generated post).

## 6. Post card redesign — creative brief depth + polished header/footer

- Built a shared `ContentBriefCard.jsx` combining a post-preview header (avatar, platform badge, platform-colored gradient bar) with the Script / Creative Direction / Quick Details breakdown, plus a Copy/"Draft ready" footer.
- Refactored the Video Brief cards to reuse the same component — one visual system across campaigns and single posts.

## 7. Content format screening (text / image / carousel / video)

- Model was silently defaulting to text-only posts. Made topic, platform, **and format** mandatory dimensions in the clarifying-questions logic — if any is unclear, it must ask (with an explicit anchor example for maximally vague requests like "give me a post idea").
- `creative_direction` now genuinely adapts to the chosen format (real camera/lighting for video, N/A for text-only).

## 8. Carousel slide support

- For `format: "carousel"`, `script.body` becomes an array of slide strings instead of one paragraph (hook = cover slide, cta = closing slide).
- Built `SlideCarousel` — a real prev/next navigable slide viewer with dot indicators — instead of one flat block of text.

## 9. UX cleanup on the clarification flow

- Removed the redundant "Answers:" chat bubble that echoed back checkbox selections after submitting — now goes straight from the (locked) checkbox card to the generated output.

## 10. Campaign requests now ask clarifying questions too

- Campaign generation is schema-locked (can't ask a question in that call), so added a small, fast, schema-free **pre-check call** (`CAMPAIGN_CLARIFICATION_PROMPT`) that runs first for fresh campaign requests only — asks about real goal/evidence/topic/timeframe, or returns `PROCEED`. Skipped entirely for follow-up answers, so there's no added latency once you're answering.
- Fixes campaigns being generated from guesses with no grounding in Joseph's actual situation.

## 11. Simplified to one persona for the client demo

- Removed "The Busy Professional" and "The Serious Home Buyer," keeping only "The Business Owner" (self-employed) across `server/app.py` (`PERSONA_PROMPTS`, defaults, DB seed) and the client (`PreferenceSetup.jsx`, `ChatPage.jsx`).

## 12. Sidebar chat list fixes

- Deleted chats no longer linger in the sidebar as "Chat N — Empty" — the list now filters to only chats with a persona set.
- Chat labels now renumber based on visible position (`Chat 1`, `Chat 2`, ...) instead of a fixed underlying slot id, so deleting Chat 1 doesn't leave a gap like "Chat 2, Chat 3."

---

## Key files touched

**Backend**
- `server/app.py` — model client, all prompt constants, structured-output schemas, compliance enforcement, clarification/posts parsing, persona config
- `server/requirements.txt` — `anthropic`, `python-dotenv`

**Frontend**
- `client/src/pages/ChatPage.jsx` — message routing, persona defaults, sidebar list
- `client/src/pages/PreferenceSetup.jsx` — persona list
- `client/src/components/CampaignResponse.jsx` — four-pillar campaign output
- `client/src/components/ClarificationResponse.jsx` — checkbox follow-up UI
- `client/src/components/PostsResponse.jsx` — single/multi post cards
- `client/src/components/ContentBriefCard.jsx` — shared script/creative-direction/quick-details card (+ `SlideCarousel`)
- `client/src/components/Section.jsx` — shared collapsible card chrome
- `client/src/components/platformBadge.js` — platform badge + gradient helpers

## Known follow-ups not yet done

- RAG vs. web search was discussed conceptually (for grounding content in current rates/news) but not implemented — recommended path was Claude's server-side web search tool, not RAG.
- Non-streaming campaign generation can take 60-90+ seconds with no progress feedback; discussed but not changed (would need streaming + incremental UI, or splitting calendar/video-brief generation into separate calls).
