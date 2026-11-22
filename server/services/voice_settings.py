"""Per-conversation voice overrides: the four tone scales.

The brand profile (tone) holds the defaults; audience age stays on the persona (folder). A conversation may
override the tone without touching either. Only validated integers are stored or applied.
"""
from dataclasses import replace
import json

from errors import ValidationError

TONE_KEYS = ("professional", "authoritative", "serious", "matterOfFact")
VOICE_KEYS = {"tone"}


def _int(value):
    return type(value) is int


def normalize_voice(data):
    """Return a clean override dict, or raise ValidationError. Empty input clears all overrides."""
    if data is None:
        return {}
    if not isinstance(data, dict) or set(data) - VOICE_KEYS:
        raise ValidationError("Voice settings may only contain tone.")
    result = {}
    tone = data.get("tone")
    if tone is not None:
        if not isinstance(tone, dict) or set(tone) - set(TONE_KEYS):
            raise ValidationError("Tone may only set " + ", ".join(TONE_KEYS) + ".")
        clean = {}
        for key in TONE_KEYS:
            if key in tone:
                if not _int(tone[key]) or not 1 <= tone[key] <= 5:
                    raise ValidationError("Each tone scale must be a whole number from 1 to 5.")
                clean[key] = tone[key]
        if clean:
            result["tone"] = clean
    return result


def _object(text):
    try:
        value = json.loads(text) if text else {}
    except ValueError:
        return {}
    return value if isinstance(value, dict) else {}


def apply_voice_overrides(context, voice):
    """Return a generation context whose brand tone reflects the conversation overrides."""
    voice = normalize_voice(voice) if voice else {}
    if not voice:
        return context
    brand = context.brand
    if "tone" in voice:
        tone = {**_object(brand.tone), **voice["tone"]}
        brand = replace(brand, tone=json.dumps(tone, ensure_ascii=False, sort_keys=True))
    return replace(context, brand=brand)
