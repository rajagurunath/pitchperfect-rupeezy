# Rupeezy AP Agent — Admin UI

Next.js 15 + Tailwind admin console for the voice agent backend.

## Run

```bash
cd ui
npm install
npm run dev          # → http://localhost:3000
```

The dev server proxies `/api/*` to the FastAPI server at
`http://localhost:8000` (override with `NEXT_PUBLIC_API_URL` env var).

## Pages

- `/`            — funnel dashboard (5s polling)
- `/leads`       — add / upload leads, trigger single or batch calls
- `/calls`       — list of all calls with score filter
- `/calls/[id]`  — transcript, recording, summary, re-analyze button

Aesthetic is dark-first, LiveKit-inspired ink + teal accent + hot/warm/cold
signal colors. No third-party UI kits beyond a few Radix primitives — every
component lives in `components/ui.tsx`.
