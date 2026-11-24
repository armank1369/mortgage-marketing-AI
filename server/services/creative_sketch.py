"""Hand-drawn "creative direction" sketch: one illustration showing every direction field.

Prototype. The image provider is not decided yet, so this module keeps the prompt (which we
own) separate from the provider (which we rent):

- ``CREATIVE_SKETCH_PROVIDER=off`` (default): the route reports the feature as disabled.
- ``CREATIVE_SKETCH_PROVIDER=preview``: no network call and no cost. Returns the exact prompt
  that a provider would receive, so the wording can be reviewed before paying for images.
- ``CREATIVE_SKETCH_PROVIDER=fal``: one synchronous call to fal.ai (needs ``FAL_KEY``). fal
  hosts FLUX, Google's and OpenAI's image models behind one API, so the model can be swapped
  with ``CREATIVE_SKETCH_MODEL`` without code changes.

Paid calls are never retried automatically (see AGENTS.md); the user presses the button again.
"""
import json
import os
import urllib.error
import urllib.request

FIELDS = ("setting", "camera", "lighting", "energy", "background", "clothing")
MAX_FIELD_CHARS = 400
DEFAULT_FAL_MODEL = "fal-ai/flux-2/klein"
FAL_TIMEOUT_SECONDS = 60

# Rough list prices per image at ~1 megapixel, for the cost hint shown to admins only.
# Checked November 2026 from public price pages; confirm on the provider's own page before
# relying on them.
COST_HINTS_USD = {
    "fal-ai/flux/schnell": 0.003,
    "fal-ai/flux-2/klein": 0.015,
    "fal-ai/flux-2": 0.012,
    "fal-ai/nano-banana": 0.039,
}

STYLE = ("Loose hand-drawn storyboard sketch, black ink pen lines with light grey marker shading "
         "and a single soft blue accent, on off-white paper. Simple, friendly, uncluttered, like a "
         "director's pre-production thumbnail. No words, no letters, no logos, no captions, no "
         "watermarks.")

# Fair-housing safety: the person in the frame is always a generic professional, never a
# described demographic, and the frame never shows a "target" family or neighbourhood type.
SUBJECT = ("One mortgage professional (generic, faceless or simply drawn face, no specific age, "
           "ethnicity or gender emphasised) presenting to camera.")


class SketchDisabled(Exception):
    pass


class SketchProviderError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def clean_direction(direction):
    if not isinstance(direction, dict):
        return {}
    cleaned = {}
    for field in FIELDS:
        value = direction.get(field)
        if not isinstance(value, str):
            continue
        value = " ".join(value.split())[:MAX_FIELD_CHARS]
        # The policy prompt writes a plain "N/A" for fields that do not apply to the format.
        if value and value.upper().rstrip(".") not in {"N/A", "NA", "NONE"}:
            cleaned[field] = value
    return cleaned


def build_sketch_prompt(direction, *, format=None, platform=None):
    """Deterministic prompt: no extra LLM call, so the only cost is the image itself."""
    d = clean_direction(direction)
    is_video = (format or "video") == "video"
    frame = "a single storyboard frame for a short social video" if is_video else \
        f"a single concept sketch for a {format.replace('-', ' ')} social post"
    if platform:
        frame += f" on {platform}"
    lines = [f"{STYLE}", f"Draw {frame}, showing all of the following at once in one frame."]
    if is_video:
        lines.append(SUBJECT)
    labels = {
        "setting": "Setting", "camera": "Camera framing", "lighting": "Lighting",
        "energy": "Energy and body language", "background": "Background",
        "clothing": "Clothing",
    }
    for field in FIELDS:
        if field in d:
            lines.append(f"{labels[field]}: {d[field]}")
    if is_video and "camera" in d:
        lines.append("Draw the frame exactly as the camera would see it, including the crop.")
    if is_video and "lighting" in d:
        lines.append("Suggest the light sources with simple sketched shapes and arrows.")
    return "\n".join(lines)


def settings():
    provider = (os.environ.get("CREATIVE_SKETCH_PROVIDER") or "off").strip().lower()
    model = (os.environ.get("CREATIVE_SKETCH_MODEL") or DEFAULT_FAL_MODEL).strip()
    return provider, model


def _call_fal(prompt, model, *, opener=urllib.request.urlopen):
    key = os.environ.get("FAL_KEY")
    if not key:
        raise SketchProviderError("Sketch provider is not configured.", status=503)
    body = json.dumps({"prompt": prompt, "image_size": "landscape_4_3", "num_images": 1,
                       "output_format": "png", "enable_safety_checker": True}).encode()
    req = urllib.request.Request(f"https://fal.run/{model}", data=body, method="POST", headers={
        "Authorization": f"Key {key}", "Content-Type": "application/json"})
    try:
        with opener(req, timeout=FAL_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode())
    except urllib.error.HTTPError as error:
        status = 429 if error.code == 429 else 502
        raise SketchProviderError("The sketch provider rejected the request. Try again later.", status)
    except (urllib.error.URLError, TimeoutError, ValueError):
        raise SketchProviderError("Could not reach the sketch provider.", status=503)
    images = payload.get("images") if isinstance(payload, dict) else None
    url = images[0].get("url") if images and isinstance(images[0], dict) else None
    if not isinstance(url, str) or not url.startswith(("https://", "data:image/")):
        raise SketchProviderError("The sketch provider returned no image.")
    return url


def generate_sketch(data, *, call_fal=_call_fal):
    provider, model = settings()
    if provider == "off":
        raise SketchDisabled()
    direction = clean_direction(data.get("direction"))
    if not direction:
        raise ValueError("direction needs at least one filled-in field.")
    fmt = data.get("format") if isinstance(data.get("format"), str) else None
    platform = data.get("platform") if isinstance(data.get("platform"), str) else None
    prompt = build_sketch_prompt(direction, format=fmt, platform=platform[:40] if platform else None)
    if provider == "preview":
        return {"provider": "preview", "model": None, "prompt": prompt, "image_url": None,
                "estimated_cost_usd": 0}
    if provider == "fal":
        return {"provider": "fal", "model": model, "prompt": prompt,
                "image_url": call_fal(prompt, model),
                "estimated_cost_usd": COST_HINTS_USD.get(model)}
    raise SketchDisabled()
