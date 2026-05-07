# Hackathon deliverables — Rupeezy AP Voice Agent

Three artifacts shipped together for Theme 7 judging.

| File | What it is | How to open |
|---|---|---|
| `rupeezy_voice_agent_deck.pptx` | 6-slide hackathon presentation (16:9) | PowerPoint, Keynote, Google Slides |
| `rupeezy_voice_agent_deck.pdf`  | PDF export of the same deck | any PDF viewer |
| `rupeezy_voice_agent_explainer.mp4` | 60-second explainer video, 1920×1080, 30 fps | any video player |
| `../ui/app/page.tsx`             | Landing page — public route at `/` | `cd ui && npm run dev` then [localhost:3000](http://localhost:3000/) |

## Deck — 6 slides

1. **Title** — "AI that picks up the phone — in your partner's language."
2. **The Gap** — three stat cards (18% conversion, <5min lead decay, 9 languages)
3. **Three Pillars** — Instant · Multilingual · Intelligent
4. **How It Works** — 5-stage architecture pipeline + lifecycle DAG + tech stack
5. **What's Shipped** — 6-feature MVP grid + "Run It Now" panel
6. **What's Next** — 18% → 40%+ projection + 5-row roadmap

Built with `pptxgenjs` — see `build_deck.js`. To regenerate:

```bash
cd deliverables
node build_deck.js
soffice --headless --convert-to pdf rupeezy_voice_agent_deck.pptx
```

## Landing page

Public route at `/`, full-bleed editorial layout. Auth-gated app pages live
under `/operations`, `/leads`, `/calls`, `/analytics`. Sign-in CTA in the
top nav routes to `/login`; once signed in, the same CTA opens the console.

Highlights:
- Hero with rotating Indian-language greeting + live-call dial card
- Marquee strip of 9 supported scripts
- Editorial sections (problem · architecture · live transcript · features · roadmap · CTA)
- Fraunces (display) + DM Sans (body) + JetBrains Mono (labels) via `next/font`

## Explainer video

60-second walkthrough at 1080p, 30 fps, ~7 MB.

Scene timeline:

| Scene | Time | What it shows |
|---|---|---|
| Title | 0:00 – 0:05 | Headline, mic disc, stat ribbon |
| The Gap | 0:05 – 0:12 | Three pain stats reveal |
| Three Pillars | 0:12 – 0:19 | Instant / Multilingual / Intelligent cards |
| Architecture | 0:19 – 0:27 | 5-stage pipeline + lifecycle pills cascading in |
| Live Conversation | 0:27 – 0:40 | Hindi/Hinglish transcript bubbles + HOT score reveal |
| Impact + Future | 0:40 – 0:50 | 18% → 40%+ animated count-up + roadmap |
| Outro | 0:50 – 1:00 | "Built in a hackathon. Designed to ship." + commands |

Built with Remotion — see `remotion-explainer/src/Explainer.tsx`. To
regenerate or preview interactively:

```bash
cd deliverables/remotion-explainer
npx remotion studio                      # interactive preview
npx remotion render Explainer ../rupeezy_voice_agent_explainer.mp4
```
