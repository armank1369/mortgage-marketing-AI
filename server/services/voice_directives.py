"""Turn saved tone-scale and audience-age settings into explicit, graded writing directives.

The persona/brand settings screen stores four 1-5 tone scales on the brand profile and an
``ageRange`` pair on each persona's audience profile. Previously those numbers only reached
the model inside an escaped JSON blob with a one-line legend, so moving a slider changed
little. This module maps each validated value to concrete, observable instructions.

Only integers in range are used; every other stored value is ignored here (it still reaches
the model as untrusted business context). No stored text is copied into these directives,
so they cannot carry injected instructions.
"""
import json

# key: (left label, right label, {level: directive})
TONE_DIRECTIVES = {
    "professional": ("Professional", "Casual", {
        1: "Fully professional register. No slang, no contractions, complete sentences, "
           "polished business vocabulary, no emoji.",
        2: "Mostly professional. Occasional contractions are fine, but avoid slang and keep "
           "sentences complete. At most one emoji per post, only where the platform expects it.",
        3: "Balanced register: friendly but businesslike. Use contractions naturally; light, "
           "everyday wording; emoji used sparingly.",
        4: "Relaxed and casual. Use contractions, everyday phrases and short sentences; "
           "fragments are fine. A few emoji are welcome on social platforms.",
        5: "Very casual, like texting a friend. Plain everyday words, short punchy sentences "
           "and fragments, informal openers (\"Okay, real talk:\"). Emoji encouraged on social platforms.",
    }),
    "authoritative": ("Authoritative", "Conversational", {
        1: "Speak as the expert. Confident declarative statements, third person or \"we\" voice, "
           "cite how the process works; do not ask the reader questions.",
        2: "Expert-led with a little warmth. Lead with clear guidance; at most one direct "
           "question to the reader.",
        3: "Mix guidance with dialogue: give clear direction, address the reader as \"you\", "
           "and ask one or two engaging questions.",
        4: "Conversational. Write in first and second person (\"I\", \"you\"), ask the reader "
           "questions, and explain things as you would across a table.",
        5: "Fully conversational, like a one-on-one chat. Open with a question or a relatable moment, "
           "speak directly to \"you\" throughout, and invite replies or comments.",
    }),
    "serious": ("Serious", "Humorous", {
        1: "Strictly serious. No jokes, puns, wordplay or playful asides.",
        2: "Mostly serious. A single light, warm touch is allowed; no jokes.",
        3: "Balanced. Include one light, good-natured line or relatable observation per piece.",
        4: "Noticeably humorous. Use a pun, playful hook or witty aside in most pieces, while the "
           "facts stay accurate.",
        5: "Lead with humor. Open with a joke, pun or funny relatable scenario and keep a playful "
           "voice throughout, while the facts stay accurate.",
    }),
    "matterOfFact": ("Matter of Fact", "Enthusiastic", {
        1: "Plain and matter-of-fact. Neutral wording, no exclamation marks, no hype words "
           "(amazing, exciting, incredible).",
        2: "Calm and steady. At most one exclamation mark per piece; positive but understated.",
        3: "Moderately upbeat. Positive framing; one or two exclamation marks are fine.",
        4: "Enthusiastic. Energetic verbs, upbeat framing, several exclamation marks where natural.",
        5: "High energy and excited. Celebrate the reader's goals, use vivid upbeat language and "
           "exclamation marks freely, and close with an energetic call to action.",
    }),
}

AGE_BANDS = (
    (17, "teens", "first exposure to money topics: define every term and keep examples basic"),
    (24, "Gen Z", "first apartments, credit building and starter savings; short-form, visual, plain language"),
    (40, "Millennial", "first-time buying, rent versus own, student debt and growing families"),
    (56, "Gen X", "move-up homes, refinancing, college costs and equity"),
    (75, "Baby Boomer", "downsizing, retirement income, equity and helping adult children buy"),
    (120, "older adults", "aging in place, fixed income and estate considerations; clear, respectful pacing"),
)


def _load(value):
    if isinstance(value, dict):
        return value
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except (TypeError, ValueError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _level(value):
    return value if type(value) is int and 1 <= value <= 5 else None


def tone_directives(tone):
    """Return one directive line per configured scale, in a stable order."""
    tone = _load(tone)
    lines = []
    for key, (left, right, levels) in TONE_DIRECTIVES.items():
        level = _level(tone.get(key))
        if level is not None:
            lines.append(f"- {left} to {right}: {level}/5. {levels[level]}")
    return lines


def age_range(audience):
    value = _load(audience).get("ageRange")
    if (isinstance(value, list) and len(value) == 2
            and all(type(n) is int and 1 <= n <= 100 for n in value) and value[0] <= value[1]):
        return value
    return None


def audience_directive(audience):
    selected = age_range(audience)
    if selected is None:
        return None
    low, high = selected
    names, concerns, floor = [], [], 0
    for ceiling, name, concern in AGE_BANDS:
        if low <= ceiling and high > floor:
            names.append(name)
            concerns.append(concern)
        floor = ceiling
    return (f"- Target audience age: {low} to {high} ({', '.join(names)}). Choose examples, life stages, "
            f"references and platforms that fit this age group: {'; '.join(concerns)}.")


def build_voice_block(context):
    lines = tone_directives(context.brand.tone)
    audience = audience_directive(context.persona.audience_profile)
    if audience:
        lines.append(audience)
    if not lines:
        return ""
    return ("\n\nVOICE SETTINGS (chosen by the workspace on the persona settings screen). Apply each one "
            "clearly and consistently to every caption, script, blog and reply, so a reader could tell "
            "which setting was chosen. These override generic tone examples elsewhere in this prompt "
            "but never the compliance, disclosure, accuracy or output-format rules:\n" + "\n".join(lines))
