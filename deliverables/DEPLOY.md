# Deploy the marketing site to Vercel

The Next.js app at `ui/` doubles as a marketing-only build when
`NEXT_PUBLIC_DEMO_MODE=1`. In that mode:

- `/`, `/pricing`, `/contact`, `/login` are public and fully styled
- `/login` shows a polished "by invitation only" state and bounces the
  Sign-in CTA to `/contact?from=login`
- `/operations`, `/leads`, `/calls`, `/analytics`, `/profile` redirect
  back to `/` (the backend isn't deployed)
- `/api/*` rewrites are dropped so requests don't hang on a missing API

## One-time Vercel setup

1. Push this repo to GitHub (already done — `rajagurunath/rupeezy-voice-agents`).
2. Go to https://vercel.com/new and import the repo.
3. **Root Directory**: `ui` ← critical. Click **Edit**, type `ui`, save.
4. **Framework Preset**: Next.js (auto-detected once root is set).
5. **Build & Development Settings**: leave defaults (`npm run build`).
6. **Environment Variables** — add these:

   | Name | Value | Environment |
   |---|---|---|
   | `NEXT_PUBLIC_DEMO_MODE` | `1` | Production, Preview |

   Optionally:

   | Name | Value | What it does |
   |---|---|---|
   | `NEXT_PUBLIC_DEFAULT_USERNAME` | (leave empty) | Pre-fills the sign-in form |
   | `NEXT_PUBLIC_DEFAULT_PASSWORD` | (leave empty) | Pre-fills the sign-in form |

   In demo mode the sign-in submit goes to `/contact` regardless, so leave
   these blank.

7. Click **Deploy**. First build takes ~2 minutes.

## Custom domain

After the first deploy succeeds:

- Go to **Settings → Domains** in your Vercel project
- Add `rupeezy.com` (or whatever subdomain you'd like, e.g. `try.rupeezy.com`)
- Vercel will give you DNS records to add at your registrar

## What ships and what doesn't

Vercel only builds from `ui/` (because Root Directory = `ui`), so the
Python backend (`api/`, `src/`, `pyproject.toml`, `data/`) is not
deployed. The `.gitignore` already excludes `data/` and `logs/` from the
repo entirely. Vercel pulls the whole repo but only builds the subfolder
you point it at.

## Re-deploying

Every push to `main` triggers a new Vercel deploy automatically. Push to
any other branch creates a Preview deploy with its own URL.

## Local dry-run of the demo build

To preview the exact same build Vercel will produce:

```bash
cd ui
NEXT_PUBLIC_DEMO_MODE=1 npm run build
NEXT_PUBLIC_DEMO_MODE=1 npm run start   # serves on :3000
```

In this mode signing in just bounces to `/contact`, and `/operations`
etc. redirect to `/`.

## Switching back to full-app mode

To run with the real backend (locally or on a host that has the API
deployed), simply omit `NEXT_PUBLIC_DEMO_MODE` (or set it to `0`). The
API rewrites turn back on and the login form posts to
`/api/auth/login` again.
