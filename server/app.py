from flask import Flask, jsonify, request
from flask_cors import CORS
import sqlite3
import os
import re
import json
from collections import Counter
from datetime import date
import anthropic
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__)
CORS(app)

ANTHROPIC_MODEL = os.environ.get('ANTHROPIC_MODEL', 'claude-haiku-4-5')
anthropic_client = anthropic.Anthropic()

DB_PATH = os.path.join(os.path.dirname(__file__), 'database.db')


def build_system(stable_text, *variable_parts):
    # Every call's system prompt is dominated by ~5,000 tokens of brand/compliance/format
    # instructions that are identical across requests for a given (persona, request type) —
    # only truly per-request content (like recent_idea_context) varies. Marking the stable
    # part with cache_control lets Anthropic reuse it instead of reprocessing it as fresh
    # input tokens on every single call. The variable parts are appended as separate,
    # uncached blocks after the cache breakpoint.
    blocks = [{'type': 'text', 'text': stable_text, 'cache_control': {'type': 'ephemeral'}}]
    for part in variable_parts:
        if part:
            blocks.append({'type': 'text', 'text': part})
    return blocks


BASE_PROMPT = (
    'You are a social media marketing assistant for Joseph Kim, a mortgage broker at Lucent Brokerage in California. '
    "Joseph's brand is built around competence, trust, and clarity — not hype. He is a trusted advisor, not a salesperson, and not flashy. "
    'Someone clients trust with one of the biggest financial decisions of their life.\n\n'
    'Core values: Accuracy, Transparency, Responsiveness.\n\n'
    'Voice and tone: Lean professional not casual, authoritative not conversational, serious not humorous, matter of fact not enthusiastic.\n\n'
    'Keywords to use naturally when appropriate: clear, strategic, thorough, reliable, precise, competitive, trusted, experienced, confident, personalized, solutions.\n\n'
    'Approved catchphrases you may use: Financing with clarity. Mortgage guidance without the guesswork. Complex financing made understandable. Confidence before you close.\n\n'
    'Words you must never use under any circumstances: guaranteed, easy money, lowest rates, best lender, no-brainer, stress-free, magic, amazing, game changer, rock star, crush it.\n\n'
    'Emoji policy: No emojis on LinkedIn. Minimal on Instagram and Facebook — only a checkmark or thumbs up when it genuinely adds clarity, never decoratively.\n\n'
    'Marketing funnel awareness: Content at the awareness stage should cover market updates, mortgage myths, real estate education, and case studies. '
    'Content at the interest stage should explain difficult concepts simply and demonstrate responsiveness. '
    'Content at the desire stage should highlight testimonials, success stories, complex loans solved, and smooth closings. '
    'Content at the action stage should drive people to schedule a consultation.\n\n'
    'Primary marketing goal: Generate qualified consultations with borrowers who value expertise.'
)

DRE_NUMBER = '02190229'

# Hard compliance constraints — condensed from Compliance System Prompt.md.
# These override style/persuasiveness preferences whenever they conflict.
COMPLIANCE_PROMPT = (
    'COMPLIANCE — HARD CONSTRAINTS. These rules override style preferences. When compliance and persuasiveness conflict, '
    'compliance wins. When uncertain whether content complies, default to the more conservative version and flag the '
    'concern to the user rather than guessing.\n\n'

    'MANDATORY FOOTER (non-negotiable): Every piece of content you generate, regardless of platform, format, or length, '
    'must end with this exact line, verbatim, unedited: "Joseph Kim | NMLS #{nmls} | DRE #' + DRE_NUMBER + ' | Equal Housing Opportunity". '
    'Never paraphrase, abbreviate, reorder, or omit any part of it. If a platform has a hard character limit that cannot '
    'fit both the marketing copy and the footer, shorten the marketing copy — never the footer. For video scripts, '
    'include it as an on-screen end-card cue, e.g. "[END CARD: Joseph Kim | NMLS #{nmls} | DRE #' + DRE_NUMBER + ' | Equal Housing Opportunity]". '
    'For carousel/multi-slide posts, it must appear at minimum on the final slide. Never generate any draft, quick '
    'version, or brainstorm option that omits the footer.\n\n'

    'FAIR HOUSING (Fair Housing Act / HUD FHEO / NFHA Responsible Advertising): Federal law prohibits discrimination in '
    'mortgage lending and advertising based on race, color, religion, sex, national origin, familial status, or '
    'disability. California and many CA cities/counties recognize additional protected characteristics (sexual '
    'orientation, marital status, source of income, immigration/citizenship status, age) — default to the most '
    'protective, inclusive standard and flag content touching these broader categories for human/legal review.\n\n'
    'Never generate content that, directly or by implication: states or implies a preference, limitation, or exclusion '
    'based on a protected class (e.g. "great for young professionals," "perfect starter home for a growing family," '
    '"no Section 8," "English-speaking clients only"); uses coded or steering language signaling who is or isn\'t '
    'welcome (racially-coded neighborhood references, "family-oriented community," "safe neighborhood" implying '
    'exclusion); implies different loan terms, service quality, or eligibility based on protected characteristics; '
    'suggests ad-targeting that includes or excludes by race, religion, familial status, disability, national origin, '
    'sex, or any state/local protected class (only neutral targeting like geography, homebuyer intent, or life stage '
    'is acceptable, and flag that platform targeting settings themselves must also comply); or depicts client '
    'personas/imagery in a way that isn\'t broadly representative and inclusive across race, ethnicity, family '
    'composition, and ability.\n\n'
    'Required practices: always include "Equal Housing Opportunity" via the mandatory footer; focus copy on the '
    'property, loan product, process, or numbers — never on describing an "ideal" or "typical" borrower; ensure all '
    'pricing/availability/feature claims are truthful; frame messaging around inclusion and broad reach ("for '
    'California homebuyers") rather than narrowing to a demographic.\n\n'
    'Before presenting any draft, silently verify: (1) does it mention or imply a protected characteristic of an ideal '
    'customer, (2) could any phrase read as excluding or discouraging someone based on a protected class, (3) is the '
    'footer present, complete, and unaltered, (4) are all factual/numeric claims ones the user actually supplied. If '
    'any check fails, revise before presenting — never present a non-compliant draft "for reference."\n\n'

    'RESPA (Real Estate Settlement Procedures Act, CFPB): Never offer, imply, or advertise a fee, gift, discount, or '
    '"thing of value" to another settlement service provider (real estate agent, title company, appraiser, insurer) in '
    'exchange for referrals. Never generate co-marketing or "partner spotlight" content implying a referral-fee '
    'relationship with a named provider unless the user confirms a lawful marketing services agreement (MSA) is in '
    'place — and even then, never describe or quantify compensation, referral volume, or "in exchange for" language in '
    'the content itself. If asked for a co-branded post, produce marketing-only content (promotes services broadly, '
    'doesn\'t induce a specific referral) and flag that any compensation arrangement behind it should be reviewed '
    'against RESPA Section 8(c)(2). As a conservative product rule, never draft, suggest, request, or advertise a '
    'Joseph-specific promotional rate, rate discount, teaser/special rate, temporary pricing offer, or other mortgage '
    'pricing promotion. Never frame "refer a friend" language as compensation for referring other consumer business — '
    'keep it a customer-appreciation gesture and flag it for review. Whenever '
    'content touches co-marketing, partnerships, sponsorships, or "refer and earn" programs, append this note after '
    'the draft (never inside the post copy itself): "⚠️ Compliance note: This type of content may involve a business '
    'relationship that should be reviewed for RESPA Section 8 compliance before publishing."\n\n'

    'NO FABRICATED FACTS: Never invent interest rates, APRs, loan terms, fees, closing costs, pre-approval odds, '
    'timelines, or "as low as" figures. Do not create, request, or fill placeholders for a Joseph-specific rate, APR, '
    'discount, promotion, or other pricing offer. General market-rate context may be discussed only as neutral '
    'educational context when it is supplied by the user or comes from a verified source available to the system; '
    'clearly frame it as market context, never as Joseph\'s offered rate, and state that rates can change and depend '
    'on borrower/property qualifications. Never state or imply guaranteed approval, guaranteed rates, or "no risk" — '
    'use qualified language ("may qualify," "subject to underwriting," "rates subject to change and creditworthiness"). Never '
    'fabricate testimonials, reviews, client stories, or statistics — if a testimonial-style post is requested, ask '
    'for the real quote/data or clearly label it as a hypothetical ("Sample scenario — not an actual client"). Never '
    'state specific credit score thresholds, down payment minimums, or DTI requirements unless the user provides '
    'them.\n\n'

    'LICENSING CONTEXT: Joseph Kim operates under NMLS #{nmls} and California DRE #' + DRE_NUMBER + ' (both always appear '
    'via the mandatory footer). Never imply he is a "lender" when he operates as a broker, or otherwise misrepresent '
    'his role, unless the user clarifies his exact licensed capacity for a specific program. Never promise specific '
    'loan approval, rate locks, or terms without standard qualifying language. If a request touches a loan program '
    'requiring disclosures beyond the standard footer, flag that a compliance/legal review is recommended.\n\n'

    'OPERATING SEQUENCE FOR EVERY REQUEST: (1) Clarify inputs, don\'t invent them — if a needed non-pricing fact is '
    'missing (program name, service area, real testimonial/case-study details), ask once or use a clearly marked '
    'placeholder. Never request a specific rate, discount, or promotion to feature. (2) Draft the content. (3) Run '
    'the fair-housing self-check silently. (4) Append the mandatory footer exactly as specified. (5) Flag anything '
    'needing human/legal/compliance review (co-marketing, referral-adjacent language, state-specific protected '
    'classes, ambiguous claims) as a short note appended after the draft, never inside the post copy. (6) Never '
    'present multiple draft variants where any variant is non-compliant, even as a "more aggressive" option. (7) When '
    'in doubt, be conservative — favor blander, safer copy over punchier copy that risks a fair housing, RESPA, or '
    'truth-in-advertising violation.'
)

# Platform tactics — distilled from social_media_best_practices.md (industry benchmarks,
# directional guidance rather than guaranteed platform rules).
PLATFORM_PROMPT = (
    'PLATFORM & CONTENT STRATEGY REFERENCE (industry benchmarks — directional guidance, not guarantees).\n\n'
    'Core principle: favor original, brand-specific angles over generic trend-chasing — authenticity and relatability '
    'are what audiences value most in brands on social. If referencing a trend, tie it to a genuine brand-relevant '
    'reason rather than copying the format.\n\n'
    'Engagement: write CTAs and questions designed to earn substantive comments and replies, not just likes — content '
    'that prompts a real thought or reaction outperforms content that only prompts a quick reaction.\n\n'
    'Funnel stage to content type:\n'
    '- Awareness (new audience, brand intro): non-promotional, value-first — educational/how-to, short-form video, '
    'thought-leadership text on LinkedIn. Avoid hard CTAs to buy.\n'
    '- Consideration (audience knows the brand, evaluating): trust-building, proof-oriented — case studies, '
    'testimonials, behind-the-scenes/process content, carousels or longer text posts, comparison content.\n'
    '- Conversion (ready to act): direct, low-ambiguity — testimonial paired with a specific offer, one clear CTA, '
    'urgency-aware copy, FAQ/objection-handling. Never stack multiple asks in one post.\n'
    '- Engagement/community: questions, polls, opinion prompts designed for substantive comments — works at any '
    'funnel stage as a supporting pillar.\n\n'
    'Per-platform quick reference:\n'
    '- LinkedIn: text-only posts outperform (51% preference), then UGC, then short video. Caption sweet spot '
    '~1,200-1,900 characters (3,000 max, ~200-210 character preview before cutoff) — front-load the hook. Hashtags: '
    '3-5 at the end; more than ~5 risks a reach penalty. Keep links out of the main post body (first comment instead). '
    'Post 3-5x/week minimum. Best windows: Tue 11am-5pm, Wed 11am-4pm, Thu 11am & 1-5pm — avoid weekends.\n'
    '- Instagram: hook must land in the first ~125 characters (2,200 character max); match length to content type '
    '(short for product posts, longer for education/storytelling). Hashtags: 3-5, specific/niche over broad. '
    'Carousels win for saves/depth with an existing audience; Reels win for reach/discovery with new audiences. Best '
    'windows: Tue 1-7pm, Wed 12-9pm, Mon 2-4pm, Thu 12-2pm — avoid weekends and 3-7am.\n'
    '- Facebook: keep captions short and front-loaded (truncates after 1-3 lines). Hashtags: 2-5, woven into the '
    'sentence, capitalized per word (#TacoTuesday). Cap frequency at 1-2 posts/day. Best windows: Tue & Wed 12-8pm, '
    'Mon 12-1pm, Thu 12-2pm & 8pm — avoid weekends and 4-7am.\n'
    '- TikTok: vertical short video only. First 3 seconds must work as a standalone hook. Caption for sound-off '
    'viewing. End on exactly one clear CTA. Raw/authentic outperforms polished production. Sustainable cadence: 3-5 '
    'posts/week.\n\n'
    'Joseph\'s brand voice is professional, authoritative, and serious, not casual or humorous (see brand voice above) '
    '— weight content toward LinkedIn\'s text-first, thought-leadership style and Instagram/Facebook education-and-'
    'trust content; treat TikTok\'s raw, entertainment-adjacent format as lower priority unless specifically requested.'
)

# Every response either becomes literal copy pasted straight onto a social platform (which
# does not render markdown) or is displayed in the chat UI as plain text with no markdown
# renderer — markdown syntax left in either place shows up as literal asterisks/hashes.
NO_MARKDOWN_PROMPT = (
    'PLAIN TEXT OUTPUT — NO MARKDOWN SYNTAX. Never use markdown formatting characters anywhere in your output, '
    'including inside JSON string values: no "**bold**" or "__bold__", no single-asterisk/underscore italics, no '
    '"#" headers, no "---" horizontal rules, no backtick code spans or code fences, no markdown links "[text](url)". '
    'This applies to every kind of response — captions, video scripts, clarifying questions, everything. Plain '
    'numbered lists ("1. 2. 3.") and simple "-" dash bullets are fine since they read correctly with no rendering. '
    'If you want to emphasize something, use word choice or capitalization sparingly — never markdown syntax.'
)

# Matches requests for a full campaign (strategy + calendar), as opposed to a single
# caption/post request — routes to the structured JSON output format instead of free text.
CAMPAIGN_INTENT_PATTERN = re.compile(
    r'content (calendar|strategy|plan)|social media calendar|posting (plan|schedule)|campaign|'
    r'\b\d+[\s-]*(day|week|month)s?\b.*(calendar|plan|post|content)',
    re.IGNORECASE,
)

CAMPAIGN_FORMAT_PROMPT = (
    'OUTPUT FORMAT — CONTENT CAMPAIGN REQUEST. The user is asking you to build a content strategy and/or posting '
    'calendar, not a single caption. Respond with ONLY a single valid JSON object — no prose, no markdown fences, '
    'no text before or after it — matching exactly this shape:\n\n'
    '{\n'
    '  "content_strategy": {\n'
    '    "title": "Content Strategy — <brand/client name>",\n'
    '    "goal": "<one sentence describing what this content strategy is meant to achieve>",\n'
    '    "pillars": [\n'
    '      {"name": "<pillar name, e.g. Educational>", "percentage": <int, all pillar percentages sum to 100>, '
    '"description": "<1-2 sentences>", "examples": ["<short example topic>", "<short example topic>", "<short example topic>"]}\n'
    '    ]\n'
    '  },\n'
    '  "platform_breakdown": [\n'
    '    {"platform": "<LinkedIn|Instagram|Facebook|TikTok>", "frequency": "<e.g. 3x / week>", '
    '"total_posts": <int, this platform\'s frequency multiplied by the number of weeks in the requested duration '
    '— e.g. "3x / week" over a 2-week calendar is 6, NOT 3>, '
    '"times": "<best posting time window>", "audience": "<who this platform reaches for this brand>", '
    '"tone": "<tone descriptors for this platform>"}\n'
    '  ],\n'
    '  "content_calendar": [\n'
    '    {"day": "<Mon|Tue|Wed|Thu|Fri|Sat|Sun>", "date": "<e.g. Aug 4>", "platform": "<LinkedIn|Instagram|Facebook|TikTok>", '
    '"category": "<matches one of the content_strategy pillar names>", "time": "<e.g. 8:00 AM>", '
    '"caption": "<the full, ready-to-post caption text, following the brand voice, compliance, and platform rules above>", '
    '"hashtags": ["#Example", "#Example"]}\n'
    '  ]\n'
    '}\n\n'
    'Rules for filling this out:\n'
    '- Use 3-5 content pillars in content_strategy, weighted by percentage toward what matters most for the stated '
    'marketing goal (see funnel-stage guidance above).\n'
    '- platform_breakdown should only include platforms actually used in content_calendar, with frequency/times/tone '
    'consistent with the per-platform quick reference above and Joseph\'s professional/authoritative brand voice.\n'
    '- content_calendar should span 14 days by default, or the exact duration the user specifies (e.g. "1 week" = 7 '
    'days, "1 month" = 30 days). Only include calendar entries for days that actually have a scheduled post — do not '
    'create empty entries for off days.\n'
    '- Today is {today}. content_calendar must start from the next sensible posting day on or after today and use '
    'the real calendar date for every entry (never reuse a stale or example date) — "day" and "date" must agree '
    '(e.g. if today is a Saturday and the first post goes out the following Monday, that entry reads day: "Mon", '
    'date: the actual date of that Monday).\n'
    '- CRITICAL — content_calendar\'s entry count per platform must exactly equal that platform\'s "total_posts" '
    'from platform_breakdown, never just its per-week "frequency" number. Since platform_breakdown comes before '
    'content_calendar in this JSON, total_posts is already a fixed, committed number by the time you write '
    'calendar entries — treat it as a hard target, not an estimate: write exactly that many entries for that '
    'platform, distributed evenly across every week of the requested duration (e.g. total_posts 8 over 2 weeks is '
    '4 in week 1 and 4 in week 2, not 8 crammed into one week or 4 total for the whole calendar).\n'
    '- Every caption must still fully comply with the compliance rules above (mandatory footer, no fair housing '
    'violations, no fabricated facts, qualified language) exactly as it would for a single-post request.\n'
    '- Do not include a Joseph-specific rate, APR, discount, promotion, or pricing incentive, and do not use a '
    'rate/promo placeholder. General market-rate context is allowed only as neutral educational context when supplied '
    'or verified, and must never be presented as Joseph\'s offered or guaranteed rate.\n'
    '- No two entries in content_calendar may share the same core idea, hook, or content concept (e.g. do not generate '
    '"a whiteboard video explaining X" more than once, even reworded) — every entry must offer a genuinely distinct '
    'angle or topic from every other entry in this calendar.\n'
    '- Do not generate video scripts here — a fully scripted video brief is only ever built one post at a time, on '
    'demand, when the user explicitly asks to expand a specific post into a video (a separate request handled by '
    'VIDEO_BRIEF_FORMAT_PROMPT). Generating a script for every post up front would burn tokens on ideas nobody asked '
    'to film.'
)

# Drives the "Generate video script" button on an individual content_calendar card — a
# separate, on-demand call so the (expensive, mostly-unwanted) script only gets generated for
# the specific post a user actually wants to expand, not for all ~14 calendar entries up front.
VIDEO_BRIEF_FORMAT_PROMPT = (
    'OUTPUT FORMAT — SINGLE VIDEO SCRIPT REQUEST. The user has picked one specific post idea from an existing '
    'content calendar (given below as platform/category/caption) and wants it expanded into a fully scripted, '
    'ready-to-film short-form video (roughly 20-45 seconds) — not a new idea, a filmable version of that exact '
    'post. Respond with ONLY a single valid JSON object, no prose or markdown fences before or after it, matching '
    'exactly this shape:\n\n'
    '{\n'
    '  "script": {\n'
    '    "intro": {"time": "<e.g. 0-3 sec>", "text": "<opening hook line, spoken or on-screen>"},\n'
    '    "body": {"time": "<e.g. 4-15 sec>", "text": "<the core explanation or value delivered>"},\n'
    '    "cta": {"time": "<e.g. 16-20 sec>", "text": "<closing call-to-action line>"}\n'
    '  },\n'
    '  "creative_direction": {\n'
    '    "setting": "<where/how it is filmed>",\n'
    '    "camera": "<framing and shot guidance>",\n'
    '    "lighting": "<lighting guidance>",\n'
    '    "energy": "<on-camera delivery energy>",\n'
    '    "background": "<background setup>",\n'
    '    "clothing": "<wardrobe guidance>"\n'
    '  },\n'
    '  "quick_details": {\n'
    '    "duration": "<e.g. 20 seconds>",\n'
    '    "tone": "<e.g. Analytical, balanced advisor>",\n'
    '    "call_to_action": "<one-line summary of the ask, e.g. Comment your preference for personalized advice>"\n'
    '  }\n'
    '}\n\n'
    'Rules:\n'
    '- The script must be built from the same core idea/angle as the caption provided — a filmable version of that '
    'specific post, never a different topic.\n'
    '- Each script follows intro (hook) -> body (value delivered) -> cta (the ask) with realistic timestamp ranges '
    'that sum to roughly the stated duration.\n'
    '- creative_direction must be concrete, filmable guidance (not generic advice) for setting, camera framing, '
    'lighting, on-camera energy/delivery, background, and clothing, consistent with Joseph\'s professional, '
    'trustworthy brand voice.\n'
    '- Per the mandatory footer rule above, a video script is not text you can just append the footer to — end the '
    'script\'s cta.text with the footer as an on-screen end-card cue: "[END CARD: Joseph Kim | NMLS #{nmls} | DRE #'
    + DRE_NUMBER + ' | Equal Housing Opportunity]", never spoken aloud as dialogue.'
)

# Non-campaign requests (single caption/post/idea/question) route through one of these three
# shapes instead of free-flowing prose — the frontend renders each as its own card-based UI
# (a checkbox form, one card per post, or a plain-text card) instead of one undifferentiated
# wall of text. Not applied to campaign requests: those always generate directly with
# placeholders via CAMPAIGN_JSON_SCHEMA, per the existing no-fabrication/placeholder rule.
NON_CAMPAIGN_FORMAT_PROMPT = (
    'RESPONSE FORMAT — SINGLE REQUESTS (not a full campaign). Choose exactly one of these three response shapes:\n\n'

    '1) CLARIFYING QUESTIONS: Generating a post requires three things at minimum: (a) a topic or angle, (b) the '
    'platform(s), and (c) a content format (text-only, single image, multi image carousel, or short video/Reel). These three '
    'are mandatory, not details to guess past — if the user\'s message leaves ANY of them unspecified or unclear, '
    'you MUST ask before generating, even for a short, broad request like "give me a post idea" or "write me a '
    'caption" that names none of the three. Do not silently pick a default topic, platform, or format for a '
    'request that vague. Once topic, platform, and format are all clear (either stated directly or already '
    'answered in a prior round), other missing non-pricing facts — such as a client name, date, or program detail — '
    'can use a placeholder or sensible default without asking again. Never ask for a specific rate, discount, or '
    'promotion to feature.\n'
    'When you do need to ask, respond with ONLY a single valid JSON object, no prose or markdown fences before or '
    'after it: {"questions": [{"question": "<question text>", "options": ["<short option>", "<short option>"], '
    '"allow_custom": <true|false>}]}. This JSON shape is the ONLY acceptable way to ask — never phrase clarifying '
    'questions as a numbered or bulleted list in prose instead (e.g. "I need three things: 1. ... 2. ... 3. ..."); '
    'that plain-text phrasing is a formatting failure, not a valid alternative, because the app renders shape (1) '
    'as clickable answer options and prose questions break that entirely. If you have decided a request needs '
    'clarifying questions, committing to this exact JSON is mandatory, not optional. Ask at most 4 questions, each '
    'with 2-6 concrete, relevant checkbox options — the user may select more than one per question (check all that '
    'apply), and always include a format question (options: "Text-only post", "Single image", "Multi Image Carousel", "Short '
    'video / Reel") whenever format isn\'t already clear. Set "allow_custom" true only for questions where a '
    'specific non-pricing fact (a name, date, program detail, testimonial, or case-study detail) might be needed and '
    'no fixed option could cover it. Never use clarification questions to solicit a specific rate, discount, or '
    'promotion to feature.\n\n'

    '2) READY-TO-POST CONTENT: If your response includes one or more finished captions or post drafts, respond '
    'with ONLY a single valid JSON object, no prose or markdown fences before or after it, matching exactly this '
    'shape:\n'
    '{"intro": "<one short sentence of framing/context, or an empty string if none is needed>", "posts": [\n'
    '  {\n'
    '    "title": "<short descriptive title/hook for this post idea>",\n'
    '    "platform": "<LinkedIn|Instagram|Facebook|TikTok|null>",\n'
    '    "format": "<text-only|single-image|carousel|video>",\n'
    '    "script": {"hook": "<opening line — the cover/first slide for a carousel>", "body": "<the core '
    'value/explanation as a single string — UNLESS format is \'carousel\', in which case body is instead an ARRAY '
    'of strings, one per middle slide, e.g. [\'slide 2 text\', \'slide 3 text\', \'slide 4 text\']>", "cta": '
    '"<closing call-to-action line — the final/closing slide for a carousel>"},\n'
    '    "creative_direction": {"setting": "<where/how to present it>", "camera": "<framing guidance, or '
    '\'N/A\' if this format has no camera work>", "lighting": "<lighting guidance, or N/A>", "energy": '
    '"<delivery energy/tone>", "background": "<background or accompanying visual/image-pairing guidance>", '
    '"clothing": "<wardrobe guidance, or N/A>"},\n'
    '    "quick_details": {"tone": "<e.g. Analytical, balanced advisor>", "call_to_action": "<one-line summary of '
    'the ask>", "platforms": ["<LinkedIn|Instagram|Facebook|TikTok>"]},\n'
    '    "hashtags": ["#Example", "#Example"]\n'
    '  }\n'
    ']}\n'
    '- Use this even for a single post (one-item posts array).\n'
    '- Choose "format" deliberately per post based on the topic, platform, and funnel stage — do not default to '
    '"text-only" out of habit. Instagram and TikTok content is usually stronger as an image, carousel, or video; '
    'LinkedIn thought-leadership can genuinely be text-only, but consider whether a visual would strengthen it. If '
    'the right format is genuinely ambiguous and would change the content meaningfully, that belongs in shape (1) '
    'as a clarifying question instead of guessing here.\n'
    '- creative_direction must match the chosen format: for "video", give real camera/lighting/energy/background/'
    'clothing guidance like a video shoot; for "single-image" or "carousel", focus on the visual concept, '
    'composition, and any text overlay; for "text-only", focus on formatting and an optional accompanying '
    'visual/image-pairing suggestion, using a plain "N/A" (never a phrase naming a different format) for fields '
    'that genuinely do not apply to THIS post\'s actual chosen format. Never invent a photo/video shoot for a '
    'format that does not need one, and never write "N/A — text-only post" (or similar) on a post whose format is '
    'not text-only.\n'
    '- For format "carousel", script.body MUST be an array of 3-5 slide strings — one self-contained idea per '
    'slide, each short enough to read at a glance (roughly 1-3 sentences). hook is the cover slide and cta is the '
    'closing slide — do not repeat their content inside the body array, and do not merge multiple slides\' worth '
    'of text into one array entry. For every other format, script.body stays a single string.\n'
    '- Put ALL strategic reasoning, compliance notes, or explanation into "intro" — never as prose outside the '
    'JSON, and never repeated inside the script.\n\n'

    '3) PLAIN TEXT: For anything else — general advice, an explanation, an answer with no actual content to draft '
    '— just respond in plain text as normal, no JSON. Never emit a shape-(2) JSON object with an empty "posts" '
    'array as a way of explaining why you chose plain text instead — if there is nothing to draft, commit fully '
    'to shape (3): plain prose only, with zero JSON anywhere in the response.\n\n'

    'ANSWERING A FOLLOW-UP: If the user\'s message contains a line starting with "Original request:" followed by an '
    '"Answers:" section, the user is responding to clarifying questions you already asked — do not ask again. Use '
    'shape (2) to generate the actual content now, treating any question left unanswered there as "use your '
    'judgment / a placeholder."'
)

# Drives the "Generate social image" action on a video brief — picks one of six fixed
# graphic templates and fills its specific text slots. Kept as its own dedicated, on-demand
# call (not part of the main chat flow) since it's triggered by a specific button, not a chat
# message, so there's no ambiguity about which shape to expect back.
SOCIAL_IMAGE_PROMPT = (
    'SOCIAL GRAPHIC GENERATION. You are turning one piece of already-written content (a video '
    'script and/or post) into a single static graphic for social media. Pick exactly ONE of '
    'these six templates — the one that best fits the content — and fill in its text slots. '
    'Respond with ONLY a single valid JSON object, no prose or markdown fences before or after '
    'it, matching exactly this shape:\n'
    '{"template": "<pull_quote|stat_highlight|carousel_cover|event_banner|tips_list|story_cover>", '
    '"slots": { ...fields for the chosen template only, per the list below... }}\n\n'
    'TEMPLATE OPTIONS AND THEIR SLOTS:\n'
    '- "pull_quote" — a single attributed quote. Best for a strong thought-leadership line from '
    'the hook or cta. Slots: {"quote": "<one punchy sentence, no quotation marks needed>", '
    '"attribution_name": "<usually \'Joseph Kim\' unless the content is a real client '
    'testimonial the user actually supplied>", "attribution_title": "<e.g. \'Mortgage Broker, '
    'Lucent Brokerage\', or the real client\'s role if this is a genuine testimonial>"}.\n'
    '- "stat_highlight" — one bold number. Best when the content centers on a specific verified stat '
    'or percentage. General market-rate context may be used only if it already exists in the source content and is '
    'clearly educational rather than a Joseph-specific offer. Slots: {"eyebrow": "<short label, e.g. '
    '\'THIS QUARTER\' or \'DID YOU KNOW\'>", "stat_number": "<the verified number, e.g. \'43%\' — '
    'never create a rate/promo placeholder or invent a figure>", "stat_label": "<what the '
    'number means, one short line>", "footnote": "<small source/context line, or empty string>"}.\n'
    '- "carousel_cover" — a series cover slide. Best for multi-slide/carousel content. Slots: '
    '{"number": "<e.g. \'01\'>", "category_label": "<short vertical series label, e.g. '
    '\'MORTGAGE TIPS\'>", "slide_count": "<e.g. \'5 slides\'>", "title": "<the carousel/post '
    'title>", "subtitle": "<one short supporting line>"}.\n'
    '- "event_banner" — an announcement banner. Best for a scheduled event, webinar, or '
    'deadline the user actually specified (never invent a date/time). Slots: {"eyebrow": "<e.g. '
    '\'LIVE EVENT\'>", "headline": "<the event name>", "date": "<e.g. bracketed [DATE] if not '
    'supplied>", "time": "<e.g. bracketed [TIME] if not supplied>", "where": "<e.g. \'Online\' '
    'or bracketed [LOCATION] if not supplied>"}.\n'
    '- "tips_list" — a short numbered list. Best for step-by-step or listicle content — this is '
    'the natural fit whenever the source content is a carousel with a script.body slide array. '
    'Slots: {"eyebrow": "<e.g. \'PRO TIPS\'>", "title": "<short title>", "items": ["<3-5 short, '
    'single-line items — condense, do not paste full slide paragraphs>"]}.\n'
    '- "story_cover" — a tall portrait cover for Stories/Reels. Best as a teaser/cover rather '
    'than the full explanation. Slots: {"eyebrow": "<e.g. \'NEW POST\'>", "headline": "<the '
    'hook, 1-2 short lines>", "supporting_text": "<one short line>", "cta_label": "<e.g. \'Swipe '
    'up to read\' or \'Link in bio\'>"}.\n\n'
    'RULES: Every text field must be SHORT — this is a graphic with limited space, not a '
    'caption. Never invent a stat, date, time, location, or testimonial not actually present in '
    'the source content — use a bracketed placeholder instead, per the no-fabrication rule '
    'above. Do not include the mandatory footer text in any slot — it is rendered separately. '
    'If the source content states the target platform is "Stories", strongly prefer '
    '"story_cover" — it is the only portrait/tall template and is built for that format.'
)

# Campaign requests generate through CAMPAIGN_JSON_SCHEMA below, which forces one fixed
# shape via structured outputs — the model literally cannot ask a question in that call. This
# prompt drives a separate, unstructured, schema-free check beforehand: a real content
# strategy should be grounded in Joseph's actual goal/evidence, not guessed, so this asks for
# that context first unless the request already supplies it or is itself a follow-up answer.
CAMPAIGN_CLARIFICATION_PROMPT = (
    'BEFORE BUILDING THIS CAMPAIGN — CHECK FOR REAL INPUT FIRST. A content strategy and calendar built entirely '
    'from assumptions is weak — the goal, angle, evidence, and platform mix should come from Joseph\'s actual '
    'current situation, not guesses.\n\n'
    'MANDATORY ON EVERY CAMPAIGN REQUEST, NO EXCEPTIONS — always check these two, independent of everything else '
    'below and of each other:\n'
    '1. PLATFORMS: has the user explicitly named which social platform(s) (e.g. LinkedIn, Instagram, Facebook, '
    'TikTok) this calendar should target? A request for "a 2-week content calendar" or "a content plan" with no '
    'platforms named does NOT count as answered, no matter how detailed the rest of the request is — always ask a '
    'platform-selection question in that case, even if every other question here is already answered. Only skip '
    'it when the message — or a prior "Answers:" section — already explicitly names the platform(s) to use.\n'
    '2. POSTING CADENCE: has the user explicitly stated how often to post — an overall frequency (e.g. "3x a '
    'week"), a specific cadence per platform, or an explicit instruction to just follow the platform best-practice '
    'defaults? A request that says nothing about frequency does NOT count as answered, even if it names a '
    'duration like "2 weeks" or "30 days" — a timeframe is not a cadence. Always ask a posting-cadence question in '
    'that case, even if every other question here is already answered. Only skip it when the message — or a prior '
    '"Answers:" section — already states a cadence, including an explicit choice to use default/recommended '
    'cadence. When you do ask it, frame the options relative to the per-platform best-practice recommendation '
    'from the platform reference above, not as raw numbers to choose between: something like "Normal cadence '
    '(follow platform recommendations)", "Faster cadence (post more often)", "Slower cadence (post less often)" — '
    'with allow_custom true so the user can still name an exact frequency if they want one.\n\n'
    'Beyond platforms and cadence, also check whether the message already gives real answers for: (a) the '
    'specific goal or occasion for this push (e.g. general lead gen vs. promoting a new program vs. a seasonal '
    'push — not just the brand\'s standing marketing goal), (b) whether there is real evidence to ground the '
    'content — recent client wins, testimonials, or case studies — or whether placeholders/hypotheticals should be '
    'used instead, and (c) whether there is a specific topic or timeframe already in mind beyond the platform '
    'defaults. Do not ask for, suggest, or offer a specific rate, rate discount, or promotion to feature.\n\n'
    'If the message already answers the platform question, the cadence question, AND (a), (b), and (c) — '
    'including because it contains a line starting with "Original request:" followed by an "Answers:" section, '
    'meaning the user already answered a previous round of these exact questions — respond with the single word '
    'PROCEED and nothing else, so the full campaign can be built. Never ask about something already answered in '
    'the message or in an "Answers:" section.\n\n'
    'Otherwise, respond with ONLY a single valid JSON object, no prose or markdown fences before or after it: '
    '{"questions": [{"question": "<question text>", "options": ["<short option>", "<short option>"], '
    '"allow_custom": <true|false>}]}. Ask at most 5 questions, each with 2-6 concrete checkbox options — the user '
    'may select more than one per question. When the platform and/or cadence questions apply, they must be '
    'included and listed first, platform before cadence. Set "allow_custom" true for questions like real '
    'testimonials, case-study details, dates, or program names where a fixed option can\'t capture the real '
    'answer. Never include a specific rate, discount, promotion, or pricing-offer option.'
)

# Structured-output schema mirroring CAMPAIGN_FORMAT_PROMPT — guarantees valid JSON
# matching CampaignResponse.jsx's expected shape instead of relying on prompt compliance alone.
CAMPAIGN_JSON_SCHEMA = {
    'type': 'object',
    'properties': {
        'content_strategy': {
            'type': 'object',
            'properties': {
                'title': {'type': 'string'},
                'goal': {'type': 'string'},
                'pillars': {
                    'type': 'array',
                    'items': {
                        'type': 'object',
                        'properties': {
                            'name': {'type': 'string'},
                            'percentage': {'type': 'integer'},
                            'description': {'type': 'string'},
                            'examples': {'type': 'array', 'items': {'type': 'string'}},
                        },
                        'required': ['name', 'percentage', 'description', 'examples'],
                        'additionalProperties': False,
                    },
                },
            },
            'required': ['title', 'goal', 'pillars'],
            'additionalProperties': False,
        },
        'platform_breakdown': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'platform': {'type': 'string'},
                    'frequency': {'type': 'string'},
                    'total_posts': {'type': 'integer'},
                    'times': {'type': 'string'},
                    'audience': {'type': 'string'},
                    'tone': {'type': 'string'},
                },
                'required': ['platform', 'frequency', 'total_posts', 'times', 'audience', 'tone'],
                'additionalProperties': False,
            },
        },
        'content_calendar': {
            'type': 'array',
            'items': {
                'type': 'object',
                'properties': {
                    'day': {'type': 'string'},
                    'date': {'type': 'string'},
                    'platform': {'type': 'string'},
                    'category': {'type': 'string'},
                    'time': {'type': 'string'},
                    'caption': {'type': 'string'},
                    'hashtags': {'type': 'array', 'items': {'type': 'string'}},
                },
                'required': ['day', 'date', 'platform', 'category', 'time', 'caption', 'hashtags'],
                'additionalProperties': False,
            },
        },
    },
    'required': ['content_strategy', 'platform_breakdown', 'content_calendar'],
    'additionalProperties': False,
}

# Structured-output schema for the standalone "Generate video script" call — same
# script/creative_direction/quick_details shape that used to be nested (nullable) inside each
# content_calendar entry, now generated on demand for exactly one post at a time.
VIDEO_BRIEF_JSON_SCHEMA = {
    'type': 'object',
    'properties': {
        'script': {
            'type': 'object',
            'properties': {
                'intro': {
                    'type': 'object',
                    'properties': {'time': {'type': 'string'}, 'text': {'type': 'string'}},
                    'required': ['time', 'text'],
                    'additionalProperties': False,
                },
                'body': {
                    'type': 'object',
                    'properties': {'time': {'type': 'string'}, 'text': {'type': 'string'}},
                    'required': ['time', 'text'],
                    'additionalProperties': False,
                },
                'cta': {
                    'type': 'object',
                    'properties': {'time': {'type': 'string'}, 'text': {'type': 'string'}},
                    'required': ['time', 'text'],
                    'additionalProperties': False,
                },
            },
            'required': ['intro', 'body', 'cta'],
            'additionalProperties': False,
        },
        'creative_direction': {
            'type': 'object',
            'properties': {
                'setting': {'type': 'string'},
                'camera': {'type': 'string'},
                'lighting': {'type': 'string'},
                'energy': {'type': 'string'},
                'background': {'type': 'string'},
                'clothing': {'type': 'string'},
            },
            'required': ['setting', 'camera', 'lighting', 'energy', 'background', 'clothing'],
            'additionalProperties': False,
        },
        'quick_details': {
            'type': 'object',
            'properties': {
                'duration': {'type': 'string'},
                'tone': {'type': 'string'},
                'call_to_action': {'type': 'string'},
            },
            'required': ['duration', 'tone', 'call_to_action'],
            'additionalProperties': False,
        },
    },
    'required': ['script', 'creative_direction', 'quick_details'],
    'additionalProperties': False,
}

PERSONA_PROMPTS = {
    'self-employed': (
        'CURRENT PERSONA — The Business Owner: Age 35-60, entrepreneur, investor, physician, or consultant. '
        'Income variable at $300k+. They have complex finances including multiple corporate tax returns and significant write-offs that make them appear non-bankable to traditional lenders. '
        'They are a Non-QM borrower with good to excellent credit, 2 or more years of business ownership, and available down payment and post-funding reserves. '
        'They are frustrated with traditional banks but want creative and legitimate financing. They appreciate genuine expertise. '
        'Write content that validates their frustration, demonstrates deep knowledge of Non-QM loan products, and positions Joseph as the broker who knows how to work with complex financial profiles. '
        'The core message this persona wants to hear is: Find a solution without cutting corners.'
    ),
}

# Output-side compliance backstop: the model doesn't reliably apply the fair-housing/
# no-fabrication rules from COMPLIANCE_PROMPT on its own (verified via testing), so these
# checks run deterministically on every response rather than relying on the prompt alone.
FLAGGED_STEERING_PHRASES = [
    'young professional', 'young famil', 'growing famil', 'starter home for a', 'no section 8',
    'english speaking clients', 'family oriented', 'safe neighborhood', 'ideal for retirees',
    'exclusive community', 'christian famil', 'perfect for famil', 'family goals',
]

FORBIDDEN_WORDS = [
    'guaranteed', 'easy money', 'lowest rates', 'best lender', 'no brainer',
    'stress free', 'magic', 'amazing', 'game changer', 'rock star', 'crush it',
]

RESTRICTED_PRICING_OFFER_PHRASES = [
    'specific current rate',
    'specific rate to feature',
    'promo to feature',
    'promotion to feature',
    'promotional rate',
    'promo rate',
    'rate discount',
    'discounted rate',
    'special rate',
    'teaser rate',
    'guaranteed rate',
    'our current rate',
    'our rate',
    "joseph's rate",
    "lucent's rate",
]

RESTRICTED_PRICING_FALLBACK = (
    'This draft was withheld because it included a Joseph-specific pricing or promotional offer. '
    'Please regenerate using general educational market context without presenting a specific offered or guaranteed rate.'
)


def has_restricted_pricing_offer(text):
    normalized = _normalize(text or '')
    return any(phrase in normalized for phrase in RESTRICTED_PRICING_OFFER_PHRASES)


def build_footer(nmls):
    return f'Joseph Kim | NMLS #{nmls} | DRE #{DRE_NUMBER} | Equal Housing Opportunity'


def _normalize(text):
    return re.sub(r'[-\s]+', ' ', text.lower())


# Deterministic backstop for NO_MARKDOWN_PROMPT — the model doesn't reliably follow the
# no-markdown instruction on its own (same reasoning as the compliance backstop below),
# so strip common markdown syntax from every response regardless of what the prompt says.
_MARKDOWN_BOLD_RE = re.compile(r'\*\*(.+?)\*\*|__(.+?)__')
_MARKDOWN_ITALIC_RE = re.compile(r'(?<!\w)\*(?!\s)(.+?)(?<!\s)\*(?!\w)|(?<!\w)_(?!\s)(.+?)(?<!\s)_(?!\w)')
_MARKDOWN_HEADER_RE = re.compile(r'(?m)^#{1,6}[ \t]+')
_MARKDOWN_HR_RE = re.compile(r'(?m)^ {0,3}(-{3,}|\*{3,}|_{3,})[ \t]*$')
_MARKDOWN_CODE_RE = re.compile(r'```.*?```', re.DOTALL)
_MARKDOWN_INLINE_CODE_RE = re.compile(r'`([^`]*)`')
_MARKDOWN_LINK_RE = re.compile(r'\[([^\]]+)\]\([^)]+\)')


def strip_markdown(text):
    if not text:
        return text
    text = _MARKDOWN_CODE_RE.sub(lambda m: m.group(0).strip('`'), text)
    text = _MARKDOWN_INLINE_CODE_RE.sub(r'\1', text)
    text = _MARKDOWN_LINK_RE.sub(r'\1', text)
    text = _MARKDOWN_BOLD_RE.sub(lambda m: m.group(1) or m.group(2), text)
    text = _MARKDOWN_ITALIC_RE.sub(lambda m: m.group(1) or m.group(2), text)
    text = _MARKDOWN_HEADER_RE.sub('', text)
    text = _MARKDOWN_HR_RE.sub('', text)
    # Stripped headers/rules leave behind blank-line gaps — collapse runs of 3+ newlines.
    text = re.sub(r'\n{3,}', '\n\n', text)
    return text.strip()


def strip_markdown_deep(value):
    if isinstance(value, str):
        return strip_markdown(value)
    if isinstance(value, list):
        return [strip_markdown_deep(v) for v in value]
    if isinstance(value, dict):
        return {k: strip_markdown_deep(v) for k, v in value.items()}
    return value


def enforce_compliance(response_text, nmls):
    flags = []
    footer = build_footer(nmls)
    if has_restricted_pricing_offer(response_text):
        flags.append('restricted_pricing_offer_removed')
        response_text = RESTRICTED_PRICING_FALLBACK
    if footer not in response_text:
        flags.append('missing_or_altered_footer')
        response_text = response_text.rstrip() + '\n\n' + footer

    lowered = _normalize(response_text)
    hit_phrases = [p for p in FLAGGED_STEERING_PHRASES if p in lowered]
    hit_words = [w for w in FORBIDDEN_WORDS if w in lowered]

    if hit_phrases or hit_words:
        note_bits = []
        if hit_phrases:
            flags.append('possible_fair_housing_language')
            note_bits.append(f'possible fair-housing-sensitive language ({", ".join(hit_phrases)})')
        if hit_words:
            flags.append('forbidden_word_used')
            note_bits.append(f'forbidden word(s) used ({", ".join(hit_words)})')
        response_text += (
            '\n\n⚠️ Compliance note (auto-flagged, human review required): '
            + '; '.join(note_bits) + '. Please review before publishing.'
        )

    return response_text, flags


def enforce_video_brief_compliance(brief, nmls):
    # Mirrors enforce_compliance, but a video script isn't caption text — the footer belongs
    # on-screen as an end-card cue, never appended as if it were spoken dialogue.
    footer = build_footer(nmls)
    end_card = f'[END CARD: {footer}]'
    flags = []

    script = brief.get('script') or {}
    intro_text = (script.get('intro') or {}).get('text', '') or ''
    body_text = (script.get('body') or {}).get('text', '') or ''
    cta = script.get('cta') or {}
    cta_text = cta.get('text', '') or ''

    full_text = '\n'.join([intro_text, body_text, cta_text])
    if has_restricted_pricing_offer(full_text):
        flags.append('restricted_pricing_offer_removed')
        intro = script.get('intro') or {}
        body = script.get('body') or {}
        intro['text'] = RESTRICTED_PRICING_FALLBACK
        body['text'] = ''
        cta_text = ''
        script['intro'] = intro
        script['body'] = body
        full_text = RESTRICTED_PRICING_FALLBACK
    if footer not in full_text and end_card not in full_text:
        flags.append('missing_or_altered_footer')
        cta_text = (cta_text.rstrip() + '\n\n' if cta_text.strip() else '') + end_card
        full_text = '\n'.join([intro_text, body_text, cta_text])

    lowered = _normalize(full_text)
    hit_phrases = [p for p in FLAGGED_STEERING_PHRASES if p in lowered]
    hit_words = [w for w in FORBIDDEN_WORDS if w in lowered]

    if hit_phrases or hit_words:
        note_bits = []
        if hit_phrases:
            flags.append('possible_fair_housing_language')
            note_bits.append(f'possible fair-housing-sensitive language ({", ".join(hit_phrases)})')
        if hit_words:
            flags.append('forbidden_word_used')
            note_bits.append(f'forbidden word(s) used ({", ".join(hit_words)})')
        cta_text = cta_text.rstrip() + (
            '\n\n⚠️ Compliance note (auto-flagged, human review required): '
            + '; '.join(note_bits) + '. Please review before publishing.'
        )

    cta['text'] = cta_text
    script['cta'] = cta
    brief['script'] = script
    return brief, flags


def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# How far back to look for prior ideas, and how many idea lines to surface —
# keep small so the anti-repeat note stays cheap relative to the rest of the system prompt.
RECENT_IDEA_ROWS = 12
RECENT_IDEA_MAX_LINES = 25
RECENT_IDEA_LINE_CHARS = 140

# Conversational preambles Sonnet 5 tends to open with ("Here's a fresh angle...", "I need more
# context...") — these carry no idea content, so skip past them rather than fingerprinting the
# opener instead of the actual concept.
_FILLER_LINE_PATTERN = re.compile(
    r"^(here'?s|i'?d be happy|i need (more|a few)|could you (share|give|tell)|let me|sure[,!]?|"
    r"to (draft|write|create)|before i (draft|write)|great question|happy to help|want me to)",
    re.IGNORECASE,
)
_CONCEPT_LABEL_PATTERN = re.compile(
    r'^\*{0,2}(post )?(concept|idea|topic|hook|title)\*{0,2}\s*:\s*\*{0,2}\s*(.+)$', re.IGNORECASE
)


def _clean_idea_text(text):
    return text.strip().strip('*').strip('"').strip("'").strip()[:RECENT_IDEA_LINE_CHARS]


def _pick_idea_line(text):
    lines = [line.strip() for line in (text or '').strip().split('\n') if line.strip()]
    # Prefer an explicit "Concept:" / "Idea:" style label if the response uses one.
    for line in lines[:10]:
        match = _CONCEPT_LABEL_PATTERN.match(line)
        if match and match.group(3).strip():
            return _clean_idea_text(match.group(3))
    # Otherwise the first substantive, non-filler line (stripped of heading/bold markup).
    for line in lines[:10]:
        stripped = _clean_idea_text(line.strip('#'))
        if stripped and not _FILLER_LINE_PATTERN.match(stripped):
            return stripped
    return _clean_idea_text(lines[0]) if lines else ''


def _extract_json_object(text, key_hint):
    # NON_CAMPAIGN_FORMAT_PROMPT asks for a bare JSON object with no surrounding prose, but
    # this isn't backed by output_config/json_schema (unlike the campaign path) — the model
    # sometimes wraps it in a sentence anyway ("Before I map this out, ...\n\n{...}"). Scan
    # for the first balanced-brace object that contains key_hint rather than requiring the
    # whole response to be pure JSON.
    start = text.find('{')
    while start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    candidate = text[start:i + 1]
                    if key_hint in candidate:
                        try:
                            return json.loads(candidate)
                        except json.JSONDecodeError:
                            pass
                    break
        start = text.find('{', start + 1)
    return None


def _parse_clarification(raw_response):
    if not raw_response:
        return None
    text = raw_response.strip()
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        data = _extract_json_object(text, '"questions"')
    if isinstance(data, dict) and isinstance(data.get('questions'), list) and data['questions']:
        cleaned_questions = []
        for question in data['questions']:
            if not isinstance(question, dict):
                continue
            if has_restricted_pricing_offer(str(question.get('question', ''))):
                continue

            options = question.get('options')
            if isinstance(options, list):
                options = [
                    option
                    for option in options
                    if not has_restricted_pricing_offer(str(option))
                ]

            cleaned = {
                **question,
                'options': options if isinstance(options, list) else question.get('options'),
            }
            if not isinstance(options, list) or options or cleaned.get('allow_custom'):
                cleaned_questions.append(cleaned)

        if cleaned_questions:
            return {**data, 'questions': cleaned_questions}
    return None


def _strip_stray_empty_posts_envelope(text):
    # Prompt-only instruction isn't fully reliable (mirrors the campaign clarification /
    # posts JSON extraction backstops above): the model occasionally leaks a stray
    # {"intro": "...", "posts": []} envelope before falling through to plain prose instead
    # of committing fully to the plain-text shape. Strip that JSON stub so raw braces never
    # reach the user; the prose that follows already reads fine as a standalone answer.
    start = text.find('{')
    while start != -1:
        depth = 0
        for i in range(start, len(text)):
            if text[i] == '{':
                depth += 1
            elif text[i] == '}':
                depth -= 1
                if depth == 0:
                    candidate = text[start:i + 1]
                    if '"posts"' in candidate:
                        try:
                            data = json.loads(candidate)
                        except json.JSONDecodeError:
                            break
                        if isinstance(data, dict) and isinstance(data.get('posts'), list) and not data['posts']:
                            remainder = (text[:start] + text[i + 1:]).strip()
                            return remainder or text
                    break
        start = text.find('{', start + 1)
    return text


def _parse_posts(raw_response):
    if not raw_response:
        return None
    text = raw_response.strip()
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        data = _extract_json_object(text, '"posts"')
    if isinstance(data, dict) and isinstance(data.get('posts'), list) and data['posts']:
        return data
    return None


def enforce_posts_compliance(data, nmls):
    # Mirrors enforce_video_brief_compliance — the footer belongs at the end of the script's
    # cta line, not appended to a flat caption (posts no longer have one; the assembled
    # caption is rebuilt client-side from hook + body + cta for the Copy button).
    flags = set()
    if data.get('intro'):
        data['intro'] = strip_markdown(data['intro'])
    footer = build_footer(nmls)
    for post in data.get('posts', []):
        script = post.get('script') or {}
        hook = strip_markdown(script.get('hook', '') or '')
        cta = strip_markdown(script.get('cta', '') or '')
        post_flags = []

        # Carousel posts use an array of slide strings for body; every other format keeps a
        # single string. body_text is the flattened form used for footer/compliance scanning.
        raw_body = script.get('body')
        if isinstance(raw_body, list):
            body = [strip_markdown(slide or '') for slide in raw_body]
            body_text = '\n\n'.join(body)
        else:
            body = strip_markdown(raw_body or '')
            body_text = body

        full_text = '\n'.join([hook, body_text, cta])
        if has_restricted_pricing_offer(full_text):
            post_flags.append('restricted_pricing_offer_removed')
            hook = RESTRICTED_PRICING_FALLBACK
            body = [] if isinstance(raw_body, list) else ''
            body_text = ''
            cta = ''
            full_text = hook
        if footer not in full_text:
            post_flags.append('missing_or_altered_footer')
            cta = (cta.rstrip() + '\n\n' if cta.strip() else '') + footer
            full_text = '\n'.join([hook, body_text, cta])

        lowered = _normalize(full_text)
        hit_phrases = [p for p in FLAGGED_STEERING_PHRASES if p in lowered]
        hit_words = [w for w in FORBIDDEN_WORDS if w in lowered]
        if hit_phrases or hit_words:
            note_bits = []
            if hit_phrases:
                post_flags.append('possible_fair_housing_language')
                note_bits.append(f'possible fair-housing-sensitive language ({", ".join(hit_phrases)})')
            if hit_words:
                post_flags.append('forbidden_word_used')
                note_bits.append(f'forbidden word(s) used ({", ".join(hit_words)})')
            cta = cta.rstrip() + (
                '\n\n⚠️ Compliance note (auto-flagged, human review required): '
                + '; '.join(note_bits) + '. Please review before publishing.'
            )

        post['script'] = {'hook': hook, 'body': body, 'cta': cta}
        if isinstance(post.get('hashtags'), list):
            post['hashtags'] = [strip_markdown(h) for h in post['hashtags']]
        flags.update(post_flags)
    return data, sorted(flags)


# Slot fields per social-image template — mirrors SOCIAL_IMAGE_PROMPT's template list, used to
# validate the model's response and to strip markdown from every text field it returns.
SOCIAL_IMAGE_TEMPLATE_SLOTS = {
    'pull_quote': ['quote', 'attribution_name', 'attribution_title'],
    'stat_highlight': ['eyebrow', 'stat_number', 'stat_label', 'footnote'],
    'carousel_cover': ['number', 'category_label', 'slide_count', 'title', 'subtitle'],
    'event_banner': ['eyebrow', 'headline', 'date', 'time', 'where'],
    'tips_list': ['eyebrow', 'title', 'items'],
    'story_cover': ['eyebrow', 'headline', 'supporting_text', 'cta_label'],
}


def _parse_social_image(raw_response):
    if not raw_response:
        return None
    text = raw_response.strip()
    try:
        data = json.loads(text)
    except (json.JSONDecodeError, TypeError):
        data = _extract_json_object(text, '"template"')
    if not isinstance(data, dict):
        return None
    template = data.get('template')
    slots = data.get('slots')
    if template not in SOCIAL_IMAGE_TEMPLATE_SLOTS or not isinstance(slots, dict):
        return None

    cleaned = {}
    for field in SOCIAL_IMAGE_TEMPLATE_SLOTS[template]:
        value = slots.get(field)
        if isinstance(value, list):
            cleaned[field] = [strip_markdown(str(v)) for v in value if str(v).strip()]
        else:
            cleaned[field] = strip_markdown(str(value)) if value else ''
    return {'template': template, 'slots': cleaned}


def _extract_idea_lines(response_text):
    try:
        data = json.loads(response_text)
    except (json.JSONDecodeError, TypeError):
        data = None

    if isinstance(data, dict) and 'questions' in data:
        # A clarifying-questions payload, not generated content — nothing to dedupe against.
        return []

    if isinstance(data, dict) and ('content_calendar' in data or 'posts' in data):
        lines = []
        for entry in data.get('content_calendar', []):
            idea = _pick_idea_line(entry.get('caption') or '')
            if idea:
                lines.append(idea)
            video = entry.get('video')
            if video:
                hook = _clean_idea_text((video.get('script') or {}).get('intro', {}).get('text') or '')
                if hook:
                    lines.append(hook)
        for post in data.get('posts', []):
            title = _clean_idea_text(post.get('title') or '')
            if title:
                lines.append(title)
        return lines

    idea = _pick_idea_line(response_text)
    return [idea] if idea else []


def get_recent_idea_context():
    # Ideas are tracked brand-wide (across personas and chats), not per-persona — a
    # concept reused for a different persona still reads as repetitive to Joseph.
    with get_db() as db:
        rows = db.execute(
            'SELECT response FROM chat_history ORDER BY id DESC LIMIT ?', (RECENT_IDEA_ROWS,)
        ).fetchall()

    ideas = []
    for row in rows:
        ideas.extend(_extract_idea_lines(row['response']))
        if len(ideas) >= RECENT_IDEA_MAX_LINES:
            break
    ideas = ideas[:RECENT_IDEA_MAX_LINES]

    if not ideas:
        return ''

    bullet_list = '\n'.join(f'- {line}' for line in ideas)
    return (
        'RECENTLY USED CONTENT IDEAS — DO NOT REPEAT. These hooks, concepts, or video/post formats (e.g. a specific '
        '"whiteboard video explaining X") were already used in recent content for this brand. Generate a genuinely '
        'different angle or topic instead of reusing or lightly rewording any of these:\n' + bullet_list
    )


def get_latest_preference():
    with get_db() as db:
        row = db.execute(
            'SELECT name, nmls_number, brand_tone, persona FROM preferences ORDER BY id DESC LIMIT 1'
        ).fetchone()
        return dict(row) if row else None


def init_db():
    with get_db() as db:
        db.execute('''
            CREATE TABLE IF NOT EXISTS preferences (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                name TEXT,
                nmls_number TEXT,
                brand_tone TEXT,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        columns = [col[1] for col in db.execute('PRAGMA table_info(preferences)').fetchall()]
        if 'persona' not in columns:
            db.execute('ALTER TABLE preferences ADD COLUMN persona TEXT')
        db.execute('''
            CREATE TABLE IF NOT EXISTS personas (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                persona_name TEXT NOT NULL,
                description TEXT
            )
        ''')
        db.execute('''
            CREATE TABLE IF NOT EXISTS chat_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                message TEXT,
                response TEXT,
                persona TEXT,
                timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        ''')
        db.execute(
            'INSERT OR IGNORE INTO personas (persona_name, description) VALUES (?, ?)',
            ('self-employed', 'Age 35-60, self-employed or entrepreneur, complex finances, needs Non-QM options')
        )
        db.commit()


init_db()


@app.route('/api/hello')
def hello():
    return jsonify({'message': 'Flask backend is running!'})


@app.route('/api/preferences', methods=['GET'])
def get_preferences():
    prefs = get_latest_preference()
    return jsonify({'preference': prefs})


@app.route('/api/preferences', methods=['POST'])
def save_preferences():
    data = request.get_json()
    if not data.get('name'):
        return jsonify({'error': 'name is required'}), 400
    with get_db() as db:
        db.execute(
            'INSERT INTO preferences (name, nmls_number, brand_tone, persona) VALUES (?, ?, ?, ?)',
            (data['name'], data.get('nmls_number'), data.get('brand_tone'), data.get('persona'))
        )
        db.commit()
    return jsonify({'status': 'ok'}), 201


@app.route('/api/history', methods=['GET'])
def get_history():
    with get_db() as db:
        rows = db.execute(
            'SELECT message, response, persona, timestamp FROM chat_history ORDER BY id DESC LIMIT 20'
        ).fetchall()
    return jsonify({'history': [dict(row) for row in rows]})


def _campaign_post_count_shortfalls(campaign):
    # The model states its own per-platform target (total_posts = frequency × requested
    # duration, see CAMPAIGN_JSON_SCHEMA) before writing content_calendar, but doesn't always
    # hit that target when actually writing the entries — this flags any platform that came
    # up short so the caller can request exactly one corrective retry.
    counts = Counter(e.get('platform') for e in campaign.get('content_calendar', []))
    shortfalls = []
    for p in campaign.get('platform_breakdown', []):
        platform = p.get('platform')
        target = p.get('total_posts')
        if not isinstance(target, int):
            continue
        actual = counts.get(platform, 0)
        if actual < target:
            shortfalls.append((platform, actual, target))
    return shortfalls


def enforce_campaign_compliance(campaign, nmls):
    flags = set()
    for entry in campaign.get('content_calendar', []):
        caption = entry.get('caption', '')
        fixed_caption, entry_flags = enforce_compliance(caption, nmls)
        entry['caption'] = fixed_caption
        flags.update(entry_flags)
    return campaign, sorted(flags)


@app.route('/api/social-image', methods=['POST'])
def social_image():
    data = request.get_json()
    title = data.get('title', '')
    script = data.get('script') or {}
    platform = data.get('platform', '')
    persona = data.get('persona', '')
    nmls = data.get('nmls_number') or '000000'

    hook = script.get('hook', '')
    body = script.get('body', '')
    body_text = '\n'.join(body) if isinstance(body, list) else body
    cta = script.get('cta', '')
    source_text = f'Title: {title}\nPlatform: {platform}\nHook: {hook}\nBody: {body_text}\nCTA: {cta}'
    if not (title or hook or body_text or cta):
        return jsonify({'error': 'title or script is required'}), 400

    # Regeneration with identical source content and thinking disabled otherwise converges
    # on near-identical output (same template, one word swapped) — same failure mode as
    # duplicate content ideas elsewhere, fixed the same way: show the model its previous
    # attempt and require a genuine departure, not a synonym pass.
    previous_attempt = data.get('previous_attempt')
    if isinstance(previous_attempt, dict) and previous_attempt.get('template') and isinstance(previous_attempt.get('slots'), dict):
        prev_summary = ', '.join(f'{k}: {v}' for k, v in previous_attempt['slots'].items() if v)
        source_text += (
            f'\n\nPREVIOUS ATTEMPT (template: {previous_attempt["template"]}) — {prev_summary}\n'
            'The user asked to regenerate because this attempt did not land. Produce a genuinely '
            'different graphic: prefer switching to a different template if one fits the content '
            'nearly as well; if keeping the same template, substantially change the angle and '
            'wording — not a synonym swap of the same sentence.'
        )

    persona_prompt = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS['self-employed'])
    system_prompt = (
        BASE_PROMPT + '\n\n' + COMPLIANCE_PROMPT + '\n\n' + NO_MARKDOWN_PROMPT + '\n\n'
        + persona_prompt + '\n\n' + SOCIAL_IMAGE_PROMPT
    ).replace('{nmls}', nmls)

    try:
        result = anthropic_client.messages.create(
            model=ANTHROPIC_MODEL,
            system=build_system(system_prompt),
            messages=[{'role': 'user', 'content': source_text}],
            max_tokens=1200,
            thinking={'type': 'disabled'},
        )
        raw_response = next((b.text for b in result.content if b.type == 'text'), '')
        social_image_data = _parse_social_image(raw_response)
        if not social_image_data:
            return jsonify({'error': 'Could not generate a graphic from this content. Try again.'}), 502
        return jsonify(social_image_data)
    except anthropic.AuthenticationError:
        return jsonify({'error': 'Invalid Anthropic API key. Check ANTHROPIC_API_KEY in .env.'}), 401
    except anthropic.RateLimitError:
        return jsonify({'error': 'Anthropic rate limit exceeded. Please wait and try again.'}), 429
    except anthropic.APIConnectionError:
        return jsonify({'error': 'Could not connect to the Anthropic API.'}), 503
    except anthropic.APIStatusError as e:
        return jsonify({'error': f'Anthropic API request failed: {e.message}'}), e.status_code


@app.route('/api/video-brief', methods=['POST'])
def video_brief():
    data = request.get_json()
    caption = (data.get('caption') or '').strip()
    if not caption:
        return jsonify({'error': 'caption is required'}), 400

    platform = data.get('platform', '')
    category = data.get('category', '')
    persona = data.get('persona', '')
    nmls = data.get('nmls_number') or '000000'

    persona_prompt = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS['self-employed'])
    system_prompt = (
        BASE_PROMPT + '\n\n' + COMPLIANCE_PROMPT + '\n\n' + PLATFORM_PROMPT + '\n\n'
        + NO_MARKDOWN_PROMPT + '\n\n' + persona_prompt + '\n\n' + VIDEO_BRIEF_FORMAT_PROMPT
    ).replace('{nmls}', nmls)

    source_text = f'Platform: {platform}\nCategory/pillar: {category}\nCaption:\n{caption}'

    try:
        result = anthropic_client.messages.create(
            model=ANTHROPIC_MODEL,
            system=build_system(system_prompt),
            messages=[{'role': 'user', 'content': source_text}],
            max_tokens=2000,
            thinking={'type': 'disabled'},
            output_config={'format': {'type': 'json_schema', 'schema': VIDEO_BRIEF_JSON_SCHEMA}},
        )
        raw_response = next((b.text for b in result.content if b.type == 'text'), '')
        try:
            video = json.loads(raw_response)
        except json.JSONDecodeError:
            return jsonify({'error': 'Could not generate a video script from this post. Try again.'}), 502
        video = strip_markdown_deep(video)
        video, flags = enforce_video_brief_compliance(video, nmls)
        return jsonify({'video': video, 'compliance_flags': flags})
    except anthropic.AuthenticationError:
        return jsonify({'error': 'Invalid Anthropic API key. Check ANTHROPIC_API_KEY in .env.'}), 401
    except anthropic.RateLimitError:
        return jsonify({'error': 'Anthropic rate limit exceeded. Please wait and try again.'}), 429
    except anthropic.APIConnectionError:
        return jsonify({'error': 'Could not connect to the Anthropic API.'}), 503
    except anthropic.APIStatusError as e:
        return jsonify({'error': f'Anthropic API request failed: {e.message}'}), e.status_code


@app.route('/api/chat', methods=['POST'])
def chat():
    data = request.get_json()
    message = data.get('message', '')
    persona = data.get('persona', '')

    if not message:
        return jsonify({'error': 'message is required'}), 400

    is_campaign = bool(CAMPAIGN_INTENT_PATTERN.search(message))
    # A follow-up carrying answers from a prior clarifying round — skip asking again,
    # regardless of path, per each format prompt's "ANSWERING A FOLLOW-UP" rule.
    is_followup_answer = message.strip().lower().startswith('original request:')

    persona_prompt = PERSONA_PROMPTS.get(persona, PERSONA_PROMPTS['self-employed'])
    shared_system_prompt = (
        BASE_PROMPT + '\n\n' + COMPLIANCE_PROMPT + '\n\n' + PLATFORM_PROMPT + '\n\n'
        + NO_MARKDOWN_PROMPT + '\n\n' + persona_prompt
    )
    recent_idea_context = get_recent_idea_context()
    nmls = data.get('nmls_number') or '000000'

    try:
        if is_campaign and not is_followup_answer:
            # CAMPAIGN_JSON_SCHEMA below locks the main call to one fixed structured shape,
            # which can't ask a question — so the ask-or-proceed decision runs as a separate,
            # small, schema-free call first. Only when it doesn't return questions do we go
            # on to the full (expensive) structured campaign generation below.
            check_system_prompt = (shared_system_prompt + '\n\n' + CAMPAIGN_CLARIFICATION_PROMPT).replace('{nmls}', nmls)

            check_result = anthropic_client.messages.create(
                model=ANTHROPIC_MODEL,
                system=build_system(check_system_prompt, recent_idea_context),
                messages=[{'role': 'user', 'content': message}],
                max_tokens=1500,
                thinking={'type': 'disabled'},
            )
            check_raw = next((b.text for b in check_result.content if b.type == 'text'), '')
            clarification = _parse_clarification(check_raw)
            if clarification:
                with get_db() as db:
                    db.execute(
                        'INSERT INTO chat_history (message, response, persona) VALUES (?, ?, ?)',
                        (message, json.dumps(clarification), persona)
                    )
                    db.commit()
                return jsonify({'type': 'clarification', 'clarification': clarification})

        system_prompt = shared_system_prompt
        if is_campaign:
            system_prompt += '\n\n' + CAMPAIGN_FORMAT_PROMPT
            system_prompt = system_prompt.replace('{today}', date.today().strftime('%A, %B %d, %Y'))
        else:
            system_prompt += '\n\n' + NON_CAMPAIGN_FORMAT_PROMPT
        system_prompt = system_prompt.replace('{nmls}', nmls)

        request_kwargs = {
            'model': ANTHROPIC_MODEL,
            'system': build_system(system_prompt, recent_idea_context),
            'messages': [{'role': 'user', 'content': message}],
        }
        # Sonnet 5 runs adaptive thinking by default when `thinking` is omitted, and
        # max_tokens is a hard cap on thinking + response text combined — an unlucky
        # adaptive-thinking run can burn the entire budget and leave nothing for the actual
        # output (stop_reason: max_tokens, empty text). Verified directly on the campaign
        # path: enabling adaptive thinking to fix a post-count arithmetic issue (see
        # `total_posts` in CAMPAIGN_JSON_SCHEMA below) did exactly this — a 2-week/3-platform
        # request came back completely empty. Both paths are formulaic template-filling
        # constrained by the prompt/schema, not open reasoning, so thinking stays off.
        request_kwargs['thinking'] = {'type': 'disabled'}
        if is_campaign:
            request_kwargs['max_tokens'] = 10000
            request_kwargs['output_config'] = {
                'format': {'type': 'json_schema', 'schema': CAMPAIGN_JSON_SCHEMA}
            }
        else:
            request_kwargs['max_tokens'] = 4096

        result = anthropic_client.messages.create(**request_kwargs)
        raw_response = next((b.text for b in result.content if b.type == 'text'), '')

        if is_campaign:
            try:
                campaign = json.loads(raw_response)
                campaign = strip_markdown_deep(campaign)

                shortfalls = _campaign_post_count_shortfalls(campaign)
                if shortfalls:
                    # One bounded retry, not a loop: spell out exactly which platforms came
                    # up short against their own stated total_posts and by how much. If the
                    # retry still doesn't fully fix it, we keep its result anyway rather than
                    # retrying indefinitely — verified this single retry meaningfully closes
                    # the gap in practice.
                    shortfall_note = (
                        'YOUR PREVIOUS ATTEMPT UNDER-DELIVERED ON POST COUNT — FIX THIS: ' + '; '.join(
                            f'{platform} needed {target} entries but you only wrote {actual}'
                            for platform, actual, target in shortfalls
                        ) + '. Recount every platform in content_calendar against its platform_breakdown '
                        'total_posts value and make sure every platform has exactly that many entries, '
                        'distributed evenly across every week of the requested duration, before responding.'
                    )
                    retry_kwargs = dict(request_kwargs)
                    retry_kwargs['system'] = build_system(system_prompt, recent_idea_context, shortfall_note)
                    retry_result = anthropic_client.messages.create(**retry_kwargs)
                    retry_raw = next((b.text for b in retry_result.content if b.type == 'text'), '')
                    try:
                        campaign = strip_markdown_deep(json.loads(retry_raw))
                    except json.JSONDecodeError:
                        pass  # keep the original (short) campaign rather than failing outright

                campaign, compliance_flags = enforce_campaign_compliance(campaign, nmls)
                with get_db() as db:
                    db.execute(
                        'INSERT INTO chat_history (message, response, persona) VALUES (?, ?, ?)',
                        (message, json.dumps(campaign), persona)
                    )
                    db.commit()
                return jsonify({'type': 'campaign', 'campaign': campaign, 'compliance_flags': compliance_flags})
            except (json.JSONDecodeError, AttributeError):
                # Model didn't return valid/expected JSON shape — fall back to showing it as plain text
                # rather than failing the request.
                pass
        else:
            clarification = _parse_clarification(raw_response)
            if clarification:
                with get_db() as db:
                    db.execute(
                        'INSERT INTO chat_history (message, response, persona) VALUES (?, ?, ?)',
                        (message, json.dumps(clarification), persona)
                    )
                    db.commit()
                return jsonify({'type': 'clarification', 'clarification': clarification})

            posts_data = _parse_posts(raw_response)
            if posts_data:
                posts_data, compliance_flags = enforce_posts_compliance(posts_data, nmls)
                with get_db() as db:
                    db.execute(
                        'INSERT INTO chat_history (message, response, persona) VALUES (?, ?, ?)',
                        (message, json.dumps(posts_data), persona)
                    )
                    db.commit()
                return jsonify({'type': 'posts', 'posts': posts_data, 'compliance_flags': compliance_flags})

        raw_response = _strip_stray_empty_posts_envelope(raw_response)
        response, compliance_flags = enforce_compliance(strip_markdown(raw_response), nmls)
        with get_db() as db:
            db.execute(
                'INSERT INTO chat_history (message, response, persona) VALUES (?, ?, ?)',
                (message, response, persona)
            )
            db.commit()
        return jsonify({'type': 'text', 'response': response, 'compliance_flags': compliance_flags})
    except anthropic.AuthenticationError:
        return jsonify({'error': 'Invalid Anthropic API key. Check ANTHROPIC_API_KEY in .env.'}), 401
    except anthropic.RateLimitError:
        return jsonify({'error': 'Anthropic rate limit exceeded. Please wait and try again.'}), 429
    except anthropic.APIConnectionError:
        return jsonify({'error': 'Could not connect to the Anthropic API.'}), 503
    except anthropic.APIStatusError as e:
        return jsonify({'error': f'Anthropic API request failed: {e.message}'}), e.status_code


if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5001)
