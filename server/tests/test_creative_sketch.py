"""Creative direction sketch prototype: prompt building, provider switch and route guards.
No real image provider is ever called."""
import io
import json
import urllib.error

import pytest

from services import creative_sketch as sketch
from tests.test_step_g_routes import client  # noqa: F401  (fixture)

DIRECTION = {
    "setting": "Home office with a tidy desk and a window to the left",
    "camera": "Medium close-up, eye level, phone on a tripod",
    "lighting": "Soft daylight from the window plus a small key light",
    "energy": "Warm, upbeat, leaning slightly toward camera",
    "background": "Bookshelf with a plant, slightly out of focus",
    "clothing": "N/A",
}


def test_prompt_includes_every_filled_field_and_skips_na():
    prompt = sketch.build_sketch_prompt(DIRECTION, format="video", platform="Instagram")
    for field in ("Home office", "Medium close-up", "Soft daylight", "leaning slightly", "Bookshelf"):
        assert field in prompt
    assert "Clothing" not in prompt
    assert "storyboard frame" in prompt and "on Instagram" in prompt
    assert "No words" in prompt  # image models render text badly; keep it out


def test_prompt_never_describes_demographics():
    prompt = sketch.build_sketch_prompt(DIRECTION)
    assert "no specific age, ethnicity or gender" in prompt


def test_non_video_format_drops_presenter():
    prompt = sketch.build_sketch_prompt({"background": "Pastel gradient"}, format="single-image")
    assert "single image social post" in prompt
    assert "presenting to camera" not in prompt


def test_clean_direction_trims_and_ignores_junk():
    cleaned = sketch.clean_direction({"setting": "  a   b ", "camera": 5, "x": "y", "energy": "x" * 900})
    assert cleaned == {"setting": "a b", "energy": "x" * sketch.MAX_FIELD_CHARS}


def test_off_by_default(monkeypatch):
    monkeypatch.delenv("CREATIVE_SKETCH_PROVIDER", raising=False)
    with pytest.raises(sketch.SketchDisabled):
        sketch.generate_sketch({"direction": DIRECTION})


def test_preview_returns_prompt_without_network(monkeypatch):
    monkeypatch.setenv("CREATIVE_SKETCH_PROVIDER", "preview")
    called = []
    result = sketch.generate_sketch({"direction": DIRECTION}, call_fal=lambda *a: called.append(a))
    assert result["image_url"] is None and result["estimated_cost_usd"] == 0
    assert "Home office" in result["prompt"] and not called


def test_fal_provider_makes_exactly_one_call(monkeypatch):
    monkeypatch.setenv("CREATIVE_SKETCH_PROVIDER", "fal")
    monkeypatch.setenv("CREATIVE_SKETCH_MODEL", "fal-ai/flux/schnell")
    calls = []

    def fake(prompt, model):
        calls.append(model)
        return "https://cdn.example/sketch.png"
    result = sketch.generate_sketch({"direction": DIRECTION}, call_fal=fake)
    assert calls == ["fal-ai/flux/schnell"]
    assert result["image_url"] == "https://cdn.example/sketch.png"
    assert result["estimated_cost_usd"] == 0.003


class _Response(io.BytesIO):
    def __enter__(self): return self
    def __exit__(self, *a): return False


def test_call_fal_sends_key_and_parses_image(monkeypatch):
    monkeypatch.setenv("FAL_KEY", "synthetic-key")
    seen = {}

    def opener(req, timeout):
        seen.update(url=req.full_url, auth=req.get_header("Authorization"), body=json.loads(req.data))
        return _Response(json.dumps({"images": [{"url": "https://cdn.example/a.png"}]}).encode())
    assert sketch._call_fal("draw", "fal-ai/flux-2/klein", opener=opener) == "https://cdn.example/a.png"
    assert seen["url"] == "https://fal.run/fal-ai/flux-2/klein"
    assert seen["auth"] == "Key synthetic-key" and seen["body"]["prompt"] == "draw"


def test_call_fal_without_key_is_503(monkeypatch):
    monkeypatch.delenv("FAL_KEY", raising=False)
    with pytest.raises(sketch.SketchProviderError) as error:
        sketch._call_fal("draw", "m", opener=lambda *a, **k: pytest.fail("network"))
    assert error.value.status == 503


def test_call_fal_maps_errors_and_bad_payloads(monkeypatch):
    monkeypatch.setenv("FAL_KEY", "synthetic-key")

    def rate_limited(req, timeout):
        raise urllib.error.HTTPError(req.full_url, 429, "busy", {}, None)
    with pytest.raises(sketch.SketchProviderError) as error:
        sketch._call_fal("draw", "m", opener=rate_limited)
    assert error.value.status == 429
    with pytest.raises(sketch.SketchProviderError):
        sketch._call_fal("draw", "m", opener=lambda req, timeout: _Response(b'{"images": [{"url": "javascript:x"}]}'))


def test_route_disabled_by_default(client, monkeypatch):  # noqa: F811
    monkeypatch.delenv("CREATIVE_SKETCH_PROVIDER", raising=False)
    response = client.post("/api/creative-sketch", headers=client.headers(), json={"direction": DIRECTION})
    assert response.status_code == 404
    assert response.get_json()["error"] == "feature_disabled"


def test_route_preview(client, monkeypatch):  # noqa: F811
    monkeypatch.setenv("CREATIVE_SKETCH_PROVIDER", "preview")
    response = client.post("/api/creative-sketch", headers=client.headers(),
                           json={"direction": DIRECTION, "format": "video", "platform": "TikTok"})
    assert response.status_code == 200
    body = response.get_json()
    assert body["provider"] == "preview" and "on TikTok" in body["prompt"]
    client.ai.messages.create.assert_not_called()


def test_route_rejects_empty_direction(client, monkeypatch):  # noqa: F811
    monkeypatch.setenv("CREATIVE_SKETCH_PROVIDER", "preview")
    response = client.post("/api/creative-sketch", headers=client.headers(), json={"direction": {"setting": "N/A"}})
    assert response.status_code == 400


@pytest.mark.parametrize("failure,status", [("jwt", 401), ("viewer", 403)])
def test_route_guards(client, monkeypatch, failure, status):  # noqa: F811
    monkeypatch.setenv("CREATIVE_SKETCH_PROVIDER", "preview")
    headers = client.headers()
    if failure == "jwt": headers = {}
    if failure == "viewer": client.context["role"] = "viewer"
    response = client.post("/api/creative-sketch", headers=headers, json={"direction": DIRECTION})
    assert response.status_code == status
