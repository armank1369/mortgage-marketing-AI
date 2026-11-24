# Creative direction visuals (prototype)

V2 shortlist, priority 2: show the creative direction (setting, camera, lighting, energy,
background, clothing) as one picture instead of six text boxes.

User input (Joseph, usability test 2026-11-17): wants ring light placement, camera angle and
tripod setup shown as a simple stick-figure or animated illustration. Prefers that over
realistic AI images of a person, which feel like someone else and were not useful when ChatGPT
tried them.

## What is in this prototype

Both parts are hidden unless `VITE_CREATIVE_SKETCH_ENABLED=true` on the client.

1. **Filming-setup diagram** (`client/src/components/FilmingSetupDiagram.jsx`). Free. An
   animated SVG with a top view (presenter, phone and tripod, camera field of view, ring or
   key light, window) and a "what the camera sees" phone frame cropped to the shot with an
   eye line. It is built from the existing creative direction text with keyword matching
   (`client/src/lib/filmingSetup.js`), so there is no extra AI call. Shown for video briefs.
2. **Hand-drawn sketch** (`POST /api/creative-sketch`, `server/services/creative_sketch.py`).
   On demand only, behind a "Sketch this scene" button. The server builds one deterministic
   prompt from all six fields (no extra Claude call, no demographics, no text in the image)
   and sends it to an image model. Provider is set by `CREATIVE_SKETCH_PROVIDER`:
   `off` (default, route returns 404), `preview` (returns the prompt, no network, no cost) or
   `fal` (one call to fal.ai with `FAL_KEY`, model from `CREATIVE_SKETCH_MODEL`). Paid calls are
   never retried automatically. Requires `ai:generate`.

## How the picture maps to the descriptions

The visuals complement the six text cards instead of replacing them. When the flag is on, each
card (Setting, Camera, Lighting, Energy, Background, Clothing) gets a number 1 to 6, and the
same number marks the matching part of the diagram: 1 the room, 2 phone and tripod, 3 ring
light / key light / window, 4 the presenter, 5 the back wall and shelf, 6 the collar and tie.
Hovering or focusing a card highlights its marker. Fields the model wrote as "N/A" get no
number and no marker. The picture sits in a collapsed "See it as a picture" panel, closed by
default so cards stay compact, and the paid sketch button lives inside that panel.

## Image model options (prices checked November 2026, confirm before enabling)

| Option | Approx. cost per image | Notes |
|---|---|---|
| Stick-figure SVG diagram (this PR) | $0 | Exact, labelled, animatable, neutral. Only covers the physical setup |
| FLUX.1 schnell via fal | ~$0.003 | Cheapest. Good loose sketch style, weaker at following six details at once |
| FLUX.2 klein via fal (default) | ~$0.015 | Better prompt adherence, still cheap |
| Gemini 2.5 Flash Image ("Nano Banana") via fal or Google | ~$0.039 | Strongest at multi-detail scenes |
| OpenAI GPT Image (mini / 2, low quality) | ~$0.005 to $0.02 | Older gpt-image-1 models are being deprecated; check the current model first |

fal.ai hosts all of the paid options behind one API, so the model is an environment variable.

## Next steps

- Have the video brief prompt emit a structured `setup` object (shot, angle, light positions,
  window side) so the diagram does not depend on keyword matching.
- Pick a paid model only if the free diagram is not enough after Joseph sees it.
