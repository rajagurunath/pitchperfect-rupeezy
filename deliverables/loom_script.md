# Loom recording script — Rupeezy AP Voice Agent (~5 minutes)

> Speaking pace ~150 wpm, so this is roughly 750–800 words. Pause for a breath
> at each `…`. Bracketed `[ … ]` lines are screen-direction notes — don't read
> them aloud.

---

## 0 :00 — Hook (≈30 sec)
*[Show the landing page hero. Let the rotating language switcher cycle once or twice.]*

> Hi — I'm Gurunath, and I want to show you something we built for one of
> the messiest parts of fintech distribution: getting human RMs to call
> inbound partner leads, fast, in the right language… every single time.
>
> Today, that's a manual job. Inbound leads sit in a queue, RMs slowly
> work through them, and most go cold before anyone says hello.
>
> So we built a voice agent that does the first call, in any of nine
> Indian languages, the moment a lead lands. Let me show you how it works.

---

## 0 :30 — Product positioning (≈45 sec)
*[Scroll slowly down the landing — past the hero, the languages strip, the problem stats. Stop on the "Three steps from lead to a qualified conversation" section.]*

> The product is called Rupeezy AP Agent. It's voice AI for partner
> programs. Three things make it different:
>
> One — it's *instant*. A new lead lands, the agent dials within seconds.
> No queue, no after-hours backlog.
>
> Two — it's *multilingual by default*. Hindi, Hinglish, English, Tamil,
> Telugu, Marathi, Gujarati, Bengali, Punjabi. The agent auto-detects the
> language mid-call and matches the lead.
>
> And three — it's *intelligent*. Every call ends with a HOT, WARM, or
> COLD score, an objection list, and a recommended next action — so your
> RM team only opens the conversations that matter.

---

## 1 :15 — Live conversation demo (≈45 sec)
*[Scroll to the "Live conversation" section. Pause on the transcript bubbles. Hover briefly over the score panel on the right.]*

> Here's what a real call looks like — translated for clarity. The lead
> spoke Hindi. The agent answered in Hindi, switched to Hinglish to
> handle the commission objection, and closed by offering a WhatsApp
> follow-up.
>
> When the call ends, our analyzer scores it: HOT — engaged partner,
> three years with a competitor, asked about commission, open to next
> steps. The summary, objections, and next action are sitting in the
> RM's queue before the lead has even hung up.

---

## 2 :00 — Inside the console: Operations + Analytics (≈90 sec)
*[Click "Sign in" → land on the operations dashboard. Let it breathe for a second.]*

> Now let me sign in and show you the operator console. This is what
> your sales ops or RM lead actually uses every day.
>
> *[Show the top metric strip: 54 leads, 43 contacted, 23 HOT, etc.]*
>
> Top of the page — live funnel: total leads, how many were contacted,
> and the score split. Refreshes every five seconds.
>
> *[Scroll to the call pipeline DAG.]*
>
> Below that, the call lifecycle DAG. Every call moves through these
> seven stages — queued, dialing, ringing, picked up, agent spoke, lead
> spoke, completed. Drop-off branches show calls that never engaged. So
> if you suddenly see ten calls dying at "ringing" — your telephony's
> broken. If they're dying at "picked" — your script is failing.
>
> *[Scroll to recent calls table.]*
>
> Each row in the recent-calls table has a per-call mini-DAG, a score
> badge, duration, and timestamp.
>
> *[Click on a HOT call → /calls/[id].]*
>
> Open any call and you get the full record: stage timeline at the top,
> waveform with playback, the transcript with speaker turns and language,
> and the AI summary with the recommended next step.
>
> *[Navigate to /analytics.]*
>
> And the analytics page rolls everything up: stage funnel as a bar
> chart, calls per day with HOT/WARM/COLD broken out, and overall score
> distribution. Last fourteen days, sliding window.

---

## 3 :30 — Why this matters (≈45 sec)
*[Back to the landing page, scroll to the "Use cases" section.]*

> The reason we're showing this for an AP partner program is because
> that's the toughest version of this problem — but the same engine works
> for anyone running partner-led acquisition.
>
> Stockbroking AP and sub-broker outreach. Wealth and PMS partners.
> Insurance POSP recruitment. DSA and channel partner activation in
> lending.
>
> Anywhere the bottleneck is "we can't dial fast enough, in the right
> language, at scale" — this replaces the manual queue.

---

## 4 :15 — Roadmap + close (≈45 sec)
*[Scroll to the "Built for India. Designed to scale." section.]*

> Right now we ship voice in nine Indian languages, the operator
> console, scoring, and full transcripts. Next up — WhatsApp follow-up
> auto-fired after every call, supervisor barge-in for live takeover,
> and native CRM connectors for Salesforce and LeadSquared.
>
> *[Scroll to the final "Stop losing partners to slow callbacks" CTA.]*
>
> If this looks like something that'd help your team, the easiest next
> step is a thirty-minute walkthrough where we run a sample lead set
> through the agent live — in your script, your voice, your language
> mix.
>
> Drop a note at hello@rupeezy.com or just hit the *Book a demo* button.
> Thanks for watching.

---

## Recording checklist (do this before you hit record)

- [ ] Backend running: `uv run api`
- [ ] Frontend running: `cd ui && npm run dev`
- [ ] Demo data seeded: `uv run python scripts/seed_demo_data.py`
- [ ] Sign in as admin once so the console is hot-cached
- [ ] Open two browser tabs:
  - **Tab 1**: `http://localhost:3000/` (landing page, scrolled to top)
  - **Tab 2**: `http://localhost:3000/operations` (already signed in)
- [ ] Hide the Loom toolbar and bookmarks bar for a clean shot
- [ ] Window at 1440×900 or larger so layouts don't squish
