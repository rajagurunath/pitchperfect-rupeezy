// Remotion explainer for Rupeezy AP Voice Agent — Theme 7.
// 60-second walkthrough at 1920×1080, 30fps. Editorial dark + electric-teal
// palette to match the deck and the landing page.

import {
  AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig,
  spring, Sequence, Easing,
} from "remotion";
import { loadFont as loadFraunces } from "@remotion/google-fonts/Fraunces";
import { loadFont as loadDmSans }   from "@remotion/google-fonts/DMSans";
import { loadFont as loadJetBrains } from "@remotion/google-fonts/JetBrainsMono";

const { fontFamily: SERIF } = loadFraunces();
const { fontFamily: SANS  } = loadDmSans();
const { fontFamily: MONO  } = loadJetBrains();

export const FPS = 30;
export const DURATION_FRAMES = 60 * FPS; // 60 seconds

// ----- Palette ------------------------------------------------------------

const C = {
  bg:        "#0A1428",
  bgMid:     "#13203D",
  bgSoft:    "#1A2A4D",
  accent:    "#5EEAD4",
  accentDim: "rgba(94,234,212,0.16)",
  light:     "#F7F9FC",
  text:      "#E2E8F0",
  mute:      "#94A3B8",
  line:      "#1E3A5F",
  hot:       "#F87171",
  warm:      "#FBBF24",
  cold:      "#60A5FA",
  ok:        "#34D399",
};

// ----- Scene timing (frames) ----------------------------------------------

const T = {
  title:        { from: 0,    duration: 5 * FPS  }, //   0 –  5
  problem:      { from: 5  * FPS, duration: 7 * FPS }, //   5 – 12
  pillars:      { from: 12 * FPS, duration: 7 * FPS }, //  12 – 19
  architecture: { from: 19 * FPS, duration: 8 * FPS }, //  19 – 27
  conversation: { from: 27 * FPS, duration: 13 * FPS}, //  27 – 40
  impact:       { from: 40 * FPS, duration: 10 * FPS}, //  40 – 50
  outro:        { from: 50 * FPS, duration: 10 * FPS}, //  50 – 60
};

// ----- Helpers ------------------------------------------------------------

const ease = Easing.bezier(0.16, 1, 0.3, 1);

function fadeUp(frame: number, start = 0, dur = 18, dist = 24) {
  const t = frame - start;
  const opacity   = interpolate(t, [0, dur], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const translate = interpolate(t, [0, dur], [dist, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  return { opacity, transform: `translateY(${translate}px)` };
}

function fadeOut(frame: number, start: number, dur = 12) {
  const t = frame - start;
  return { opacity: interpolate(t, [0, dur], [1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }) };
}

// ----- Scene shell --------------------------------------------------------

const SceneFrame: React.FC<{ children: React.ReactNode; eyebrow: string }> = ({ children, eyebrow }) => (
  <AbsoluteFill style={{ backgroundColor: C.bg }}>
    <BackgroundHalo />
    <BackgroundGrid />
    {/* Side accent bar */}
    <div style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 6, backgroundColor: C.accent }} />
    {/* Eyebrow + footer */}
    <div style={{
      position: "absolute", top: 60, left: 90, fontFamily: MONO, fontSize: 18,
      letterSpacing: 6, color: C.accent, fontWeight: 600,
    }}>
      {eyebrow}
    </div>
    <div style={{
      position: "absolute", bottom: 50, left: 90, fontFamily: MONO,
      fontSize: 16, letterSpacing: 4, color: C.mute,
    }}>
      RUPEEZY AP VOICE AGENT  ·  THEME 7
    </div>
    {children}
  </AbsoluteFill>
);

const BackgroundHalo: React.FC = () => (
  <AbsoluteFill style={{
    backgroundImage: `
      radial-gradient(60% 50% at 80% 20%, rgba(94,234,212,0.20) 0%, rgba(94,234,212,0) 60%),
      radial-gradient(50% 60% at 10% 80%, rgba(94,234,212,0.10) 0%, rgba(94,234,212,0) 65%),
      radial-gradient(40% 40% at 50% 110%, rgba(96,165,250,0.10) 0%, rgba(96,165,250,0) 60%)
    `,
  }} />
);

const BackgroundGrid: React.FC = () => (
  <AbsoluteFill style={{
    backgroundImage: `
      linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)
    `,
    backgroundSize: "80px 80px",
    opacity: 0.6,
  }} />
);

// =====================================================================
// SCENE 1 — Title
// =====================================================================
const TitleScene: React.FC = () => {
  const frame = useCurrentFrame();

  const eyebrow = fadeUp(frame, 4, 16);
  const headline = fadeUp(frame, 12, 22);
  const sub = fadeUp(frame, 28, 18);
  const stats = fadeUp(frame, 46, 18);

  // Mic disc pulse
  const pulse = (Math.sin(frame * 0.12) * 0.5 + 0.5) * 0.25 + 0.75;

  return (
    <SceneFrame eyebrow="THEME 7  ·  RUPEEZY AP PARTNER PROGRAM">
      {/* Mic + glow on right */}
      <div style={{ position: "absolute", right: 180, top: 220, width: 520, height: 520 }}>
        <div style={{
          position: "absolute", inset: 0, borderRadius: "50%",
          backgroundColor: "rgba(94,234,212,0.10)", transform: `scale(${pulse + 0.05})`,
        }} />
        <div style={{
          position: "absolute", inset: 60, borderRadius: "50%",
          backgroundColor: "rgba(94,234,212,0.18)", transform: `scale(${pulse})`,
        }} />
        <div style={{
          position: "absolute", inset: 140, borderRadius: "50%",
          backgroundColor: "rgba(94,234,212,0.30)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <svg viewBox="0 0 24 24" width="180" height="180" fill={C.light} aria-hidden>
            <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
            <path d="M19 11a1 1 0 1 0-2 0 5 5 0 0 1-10 0 1 1 0 1 0-2 0 7 7 0 0 0 6 6.92V21a1 1 0 1 0 2 0v-3.08A7 7 0 0 0 19 11z" />
          </svg>
        </div>
      </div>

      {/* Eyebrow row sub-line */}
      <div style={{ position: "absolute", top: 200, left: 90, ...eyebrow }}>
        <div style={{
          fontFamily: MONO, fontSize: 18, letterSpacing: 6,
          color: C.mute, fontWeight: 500,
        }}>
          AN AI VOICE AGENT FOR INDIA-FIRST FINTECH
        </div>
      </div>

      {/* Headline */}
      <div style={{ position: "absolute", top: 260, left: 90, width: 1100, ...headline }}>
        <h1 style={{
          fontFamily: SERIF, fontWeight: 600, fontSize: 92,
          color: C.light, lineHeight: 1.02, margin: 0, letterSpacing: -1,
        }}>
          AI that picks up<br/>
          the phone <span style={{ fontStyle: "italic", fontWeight: 400, color: C.accent }}>—</span> in your<br/>
          <span style={{ fontStyle: "italic", fontWeight: 400, color: C.accent }}>partner&apos;s</span> language.
        </h1>
      </div>

      {/* Subtitle */}
      <div style={{ position: "absolute", top: 770, left: 90, width: 1180, ...sub }}>
        <p style={{
          fontFamily: SANS, fontSize: 26, color: C.mute,
          lineHeight: 1.45, margin: 0, fontWeight: 400,
        }}>
          Calls inbound AP partner leads instantly. Speaks 9 Indian languages
          natively. Scores every conversation HOT / WARM / COLD for the human RM.
        </p>
      </div>

      {/* Stat ribbon */}
      <div style={{
        position: "absolute", bottom: 90, left: 90, right: 90, height: 96,
        display: "flex", alignItems: "center", justifyContent: "space-between",
        borderTop: `1px solid ${C.line}`, paddingTop: 28, ...stats,
      }}>
        {[
          { v: "18% → 40%+", l: "AP CONVERSION GOAL" },
          { v: "9",          l: "INDIAN LANGUAGES" },
          { v: "<5s",        l: "TIME TO FIRST DIAL" },
          { v: "100%",       l: "CALLS SCORED + LOGGED" },
        ].map((s) => (
          <div key={s.l}>
            <div style={{ fontFamily: SERIF, fontSize: 36, color: C.accent, fontWeight: 600 }}>{s.v}</div>
            <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 4, color: C.mute, marginTop: 6 }}>{s.l}</div>
          </div>
        ))}
      </div>
    </SceneFrame>
  );
};

// =====================================================================
// SCENE 2 — The Problem
// =====================================================================
const ProblemScene: React.FC = () => {
  const frame = useCurrentFrame();

  const title = fadeUp(frame, 6, 22);
  const cards = [0, 1, 2].map((i) => fadeUp(frame, 28 + i * 12, 22));

  const cardData = [
    { stat: "18%",   l: "today's AP conversion",
      sub: "Best-case under current human-only outreach. Most leads talked to days late." },
    { stat: "<5min", l: "before a hot lead cools",
      sub: "Inbound finance leads decay fast. Human dialers can't beat the clock." },
    { stat: "9",     l: "languages partners speak",
      sub: "Hindi · Hinglish · English · Tamil · Telugu · Marathi · Gujarati · Bengali · Punjabi." },
  ];

  return (
    <SceneFrame eyebrow="THE GAP">
      <div style={{ position: "absolute", top: 160, left: 90, width: 1700, ...title }}>
        <h2 style={{
          fontFamily: SERIF, fontWeight: 500, fontSize: 96,
          color: C.light, lineHeight: 1.0, margin: 0,
        }}>
          Inbound leads leak <em style={{ color: C.accent, fontWeight: 400 }}>before</em> a<br/>
          human can call them.
        </h2>
      </div>

      <div style={{
        position: "absolute", top: 540, left: 90, right: 90,
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32,
      }}>
        {cardData.map((c, i) => (
          <div key={c.l} style={{
            backgroundColor: C.bgMid, borderRadius: 24,
            border: `1px solid ${C.line}`, padding: 44, height: 380, ...cards[i],
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, backgroundColor: C.accent }} />
            <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 4, color: C.mute, marginBottom: 28 }}>PAIN</div>
            <div style={{ fontFamily: SERIF, fontSize: 110, color: C.accent, fontWeight: 500, lineHeight: 1.0 }}>
              {c.stat}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 22, color: C.text, fontWeight: 600, marginTop: 14 }}>
              {c.l}
            </div>
            <div style={{ fontFamily: SANS, fontSize: 17, color: C.mute, lineHeight: 1.5, marginTop: 12 }}>
              {c.sub}
            </div>
          </div>
        ))}
      </div>
    </SceneFrame>
  );
};

// =====================================================================
// SCENE 3 — Pillars
// =====================================================================
const PillarsScene: React.FC = () => {
  const frame = useCurrentFrame();

  const title = fadeUp(frame, 6, 22);
  const cards = [0, 1, 2].map((i) => fadeUp(frame, 26 + i * 14, 22));

  const items = [
    { tag: "INSTANT",      h: "Auto-dial in seconds",
      b: "A new lead lands → Twilio dials before the partner closes the form. Batch fans out to 10+ leads at once." },
    { tag: "MULTILINGUAL", h: "Native in 9 languages",
      b: "ElevenLabs Scribe v2 transcribes any of 9 Indian languages auto-detected. Kimi-K2.6 reasons in-language." },
    { tag: "INTELLIGENT",  h: "Scored & summarised",
      b: "Every call ends with HOT / WARM / COLD score, objection list, next-action — for the RM, not the agent." },
  ];

  return (
    <SceneFrame eyebrow="OUR ANSWER">
      <div style={{ position: "absolute", top: 160, left: 90, width: 1700, ...title }}>
        <h2 style={{
          fontFamily: SERIF, fontWeight: 500, fontSize: 96,
          color: C.light, lineHeight: 1.0, margin: 0,
        }}>
          Three pillars. <em style={{ color: C.accent, fontWeight: 400 }}>One</em> unfair advantage.
        </h2>
      </div>

      <div style={{
        position: "absolute", top: 460, left: 90, right: 90,
        display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 32,
      }}>
        {items.map((it, i) => (
          <div key={it.tag} style={{
            backgroundColor: C.bgMid, borderRadius: 24,
            border: `1px solid ${C.line}`, padding: 44, height: 480, ...cards[i],
          }}>
            <div style={{ fontFamily: MONO, fontSize: 14, letterSpacing: 6, color: C.accent, fontWeight: 600 }}>
              0{i+1}  ·  {it.tag}
            </div>
            <div style={{
              fontFamily: SERIF, fontSize: 52, color: C.light,
              fontWeight: 500, lineHeight: 1.05, marginTop: 32,
            }}>
              {it.h}
            </div>
            <div style={{
              fontFamily: SANS, fontSize: 22, color: C.mute,
              lineHeight: 1.5, marginTop: 28,
            }}>
              {it.b}
            </div>
          </div>
        ))}
      </div>
    </SceneFrame>
  );
};

// =====================================================================
// SCENE 4 — Architecture Pipeline
// =====================================================================
const ArchitectureScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const title = fadeUp(frame, 6, 22);
  const blocks = [0, 1, 2, 3, 4].map((i) =>
    fadeUp(frame, 28 + i * 8, 16)
  );

  const stages = [
    { t: "INGEST",  s: "CSV / form upload\nLeads → SQLite" },
    { t: "DIAL",    s: "Twilio Programmable\nVoice via REST" },
    { t: "AGENT",   s: "Pipecat 1.1\n+ Twilio Stream" },
    { t: "REASON",  s: "Kimi-K2.6 (vLLM)\nthinking off" },
    { t: "SCORE",   s: "Analyzer pass:\nHOT / WARM / COLD" },
  ];

  // Lifecycle pill stagger
  const pills = ["queued", "dialing", "ringing", "picked", "agent_spoke", "user_spoke", "completed"];
  const pillStart = 80; // frames since scene start
  const pillStep  = 6;

  return (
    <SceneFrame eyebrow="HOW IT WORKS">
      <div style={{ position: "absolute", top: 160, left: 90, width: 1700, ...title }}>
        <h2 style={{
          fontFamily: SERIF, fontWeight: 500, fontSize: 80,
          color: C.light, lineHeight: 1.05, margin: 0,
        }}>
          From CSV upload to a <em style={{ color: C.accent, fontWeight: 400 }}>scored</em> conversation in one pass.
        </h2>
      </div>

      {/* 5-stage pipeline */}
      <div style={{
        position: "absolute", top: 440, left: 90, right: 90,
        display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 22,
      }}>
        {stages.map((st, i) => (
          <div key={st.t} style={{
            backgroundColor: C.bgMid, borderRadius: 20,
            border: `1px solid ${C.line}`, padding: 32, position: "relative",
            ...blocks[i], height: 200,
          }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, backgroundColor: C.accent, borderTopLeftRadius: 20, borderTopRightRadius: 20 }} />
            <div style={{
              fontFamily: MONO, fontSize: 13, letterSpacing: 5,
              color: C.mute, fontWeight: 500,
            }}>
              0{i+1}
            </div>
            <div style={{
              fontFamily: MONO, fontSize: 22, letterSpacing: 4,
              color: C.accent, fontWeight: 600, marginTop: 16,
            }}>
              {st.t}
            </div>
            <div style={{
              fontFamily: SANS, fontSize: 17, color: C.mute,
              marginTop: 16, lineHeight: 1.4, whiteSpace: "pre-line",
            }}>
              {st.s}
            </div>
          </div>
        ))}
      </div>

      {/* Caption */}
      <div style={{
        position: "absolute", top: 700, left: 90,
        fontFamily: MONO, fontSize: 16, letterSpacing: 4, color: C.mute,
        opacity: interpolate(frame, [pillStart - 6, pillStart + 6], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }),
      }}>
        CALL LIFECYCLE — recorded as events for the live operations DAG
      </div>

      {/* Pills row */}
      <div style={{ position: "absolute", top: 750, left: 90, right: 90, display: "flex", gap: 14, alignItems: "center", flexWrap: "wrap" }}>
        {pills.map((p, i) => {
          const start = pillStart + i * pillStep;
          const op = interpolate(frame, [start, start + 8], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
          const sc = spring({ frame: frame - start, fps, config: { damping: 18 } });
          return (
            <div key={p} style={{
              opacity: op, transform: `scale(${0.8 + sc * 0.2})`, transformOrigin: "left center",
              fontFamily: MONO, fontSize: 18, letterSpacing: 1,
              color: C.accent, padding: "12px 18px",
              borderRadius: 10, border: `1px solid rgba(94,234,212,0.4)`,
              backgroundColor: "rgba(94,234,212,0.06)", textTransform: "uppercase",
            }}>
              {p}
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
};

// =====================================================================
// SCENE 5 — Live Conversation
// =====================================================================
const ConversationScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const title = fadeUp(frame, 6, 22);

  type Line = { who: "agent" | "user"; lang: string; text: string; gloss: string };
  const lines: Line[] = [
    { who: "agent", lang: "HINDI",
      text: "नमस्ते, मैं Rupeezy की प्रिया बोल रही हूँ।",
      gloss: "Hello, this is Priya from Rupeezy." },
    { who: "user",  lang: "HINDI",
      text: "हाँ बोलिए, क्या बात है?",
      gloss: "Yes, go ahead — what is it?" },
    { who: "agent", lang: "HINGLISH",
      text: "AP partner program ke baare mein call kar rahi hoon.",
      gloss: "I'm calling about the AP partner program." },
    { who: "user",  lang: "HINDI",
      text: "अभी तीन साल हो गए। कमीशन कैसी है?",
      gloss: "Three years now. How is your commission?" },
    { who: "agent", lang: "HINGLISH",
      text: "Industry-best 50–60% lifetime payout, no monthly cap.",
      gloss: "Industry-best 50–60% lifetime payout, no monthly cap." },
  ];

  const lineStartFrames = [40, 80, 130, 180, 230];
  // Right-side score reveal — appears as the last line lands
  const scoreReveal = fadeUp(frame, 230, 22);

  return (
    <SceneFrame eyebrow="LIVE CONVERSATION">
      <div style={{ position: "absolute", top: 160, left: 90, width: 1500, ...title }}>
        <h2 style={{
          fontFamily: SERIF, fontWeight: 500, fontSize: 80,
          color: C.light, lineHeight: 1.05, margin: 0,
        }}>
          The agent <em style={{ color: C.accent, fontWeight: 400 }}>listens</em>, responds, and remembers.
        </h2>
      </div>

      {/* Transcript card */}
      <div style={{
        position: "absolute", top: 360, left: 90, width: 1100, height: 660,
        backgroundColor: C.bgMid, borderRadius: 28, border: `1px solid ${C.line}`,
        padding: 42,
      }}>
        <div style={{
          fontFamily: MONO, fontSize: 14, letterSpacing: 5, color: C.accent,
          fontWeight: 600, marginBottom: 32,
        }}>
          ● LIVE TRANSCRIPT  ·  CALL #4012
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          {lines.map((l, i) => {
            const start = lineStartFrames[i];
            const sp = spring({ frame: frame - start, fps, config: { damping: 16 } });
            const op = interpolate(frame, [start, start + 12], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
            const tx = interpolate(sp, [0, 1], [40, 0]);
            const align = l.who === "agent" ? "flex-start" : "flex-end";
            const bg    = l.who === "agent" ? "rgba(15,30,60,0.55)" : "rgba(94,234,212,0.15)";
            const ring  = l.who === "agent" ? C.line : "rgba(94,234,212,0.30)";
            return (
              <div key={i} style={{ display: "flex", justifyContent: align }}>
                <div style={{
                  backgroundColor: bg, border: `1px solid ${ring}`,
                  borderRadius: 16, padding: "14px 20px", maxWidth: "82%",
                  opacity: op, transform: `translateX(${l.who === "agent" ? -tx : tx}px)`,
                  borderBottomLeftRadius:  l.who === "agent" ? 4 : 16,
                  borderBottomRightRadius: l.who === "agent" ? 16 : 4,
                }}>
                  <div style={{
                    fontFamily: MONO, fontSize: 12, letterSpacing: 3,
                    color: l.who === "agent" ? C.accent : C.mute,
                    fontWeight: 600, marginBottom: 6,
                  }}>
                    {l.who === "agent" ? "AGENT" : "LEAD"}  ·  {l.lang}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 22, color: C.text, lineHeight: 1.35 }}>
                    {l.text}
                  </div>
                  <div style={{ fontFamily: SANS, fontSize: 15, color: C.mute, marginTop: 6, fontStyle: "italic" }}>
                    {l.gloss}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Score panel on the right */}
      <div style={{
        position: "absolute", top: 360, right: 90, width: 600, height: 660,
        backgroundColor: C.bgSoft, borderRadius: 28, border: `1px solid ${C.line}`,
        padding: 42, ...scoreReveal,
      }}>
        <div style={{ fontFamily: MONO, fontSize: 14, letterSpacing: 6, color: C.accent, fontWeight: 600 }}>
          POST-CALL ANALYSIS
        </div>
        <div style={{
          fontFamily: SERIF, fontSize: 130, color: C.hot,
          fontWeight: 600, lineHeight: 1.0, marginTop: 28,
        }}>
          HOT
        </div>
        <div style={{ fontFamily: MONO, fontSize: 13, letterSpacing: 4, color: C.mute, marginTop: 6 }}>
          SCORED BY KIMI ANALYZER
        </div>
        <div style={{ height: 1, backgroundColor: C.line, marginTop: 38, marginBottom: 32 }} />
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 4, color: C.mute, fontWeight: 600 }}>SUMMARY</div>
        <div style={{ fontFamily: SANS, fontSize: 18, color: C.text, lineHeight: 1.5, marginTop: 8 }}>
          Engaged partner, with competitor 3y. Asked about commission. Open to receiving details. Strong fit.
        </div>
        <div style={{ fontFamily: MONO, fontSize: 12, letterSpacing: 4, color: C.mute, fontWeight: 600, marginTop: 28 }}>NEXT ACTION</div>
        <div style={{ fontFamily: SANS, fontSize: 18, color: C.text, lineHeight: 1.5, marginTop: 8 }}>
          Send WhatsApp brochure + RM follow-up within 24h.
        </div>
      </div>
    </SceneFrame>
  );
};

// =====================================================================
// SCENE 6 — Impact + Future
// =====================================================================
const ImpactScene: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  const title = fadeUp(frame, 6, 22);
  const left  = fadeUp(frame, 26, 22);

  // Animated count-up for the projection
  const countT = interpolate(frame, [50, 110], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: ease });
  const projection = Math.round(18 + countT * 22);

  const items = [
    { tag: "Q3",  h: "WhatsApp follow-up after every call",
      b: "Auto-send the call summary + brochure in the partner's language seconds after hang-up." },
    { tag: "Q3",  h: "Realtime supervisor barge-in",
      b: "RM can take over the call mid-flight when the agent flags a HOT signal." },
    { tag: "Q4",  h: "Voice cloning per RM",
      b: "Each RM trains a 30-second clone so reassigned calls feel continuous." },
    { tag: "Q4",  h: "CRM + Salesforce sync",
      b: "Two-way sync of leads, transcripts, and scores. No more spreadsheet exports." },
    { tag: "'27", h: "Multi-tenant for adjacent programs",
      b: "Same engine for any inbound-heavy partner pipeline — insurance, lending, B2B SaaS." },
  ];

  return (
    <SceneFrame eyebrow="WHAT'S NEXT">
      <div style={{ position: "absolute", top: 160, left: 90, width: 1700, ...title }}>
        <h2 style={{
          fontFamily: SERIF, fontWeight: 500, fontSize: 80,
          color: C.light, lineHeight: 1.05, margin: 0,
        }}>
          Built in a hackathon. <em style={{ color: C.accent, fontWeight: 400 }}>Designed</em> to ship.
        </h2>
      </div>

      {/* Big projection card on the left */}
      <div style={{
        position: "absolute", top: 400, left: 90, width: 720, height: 560,
        backgroundColor: C.bgMid, borderRadius: 28, border: `1px solid ${C.line}`,
        padding: 56, overflow: "hidden", ...left,
      }}>
        <div style={{
          position: "absolute", top: -100, right: -100, width: 360, height: 360,
          borderRadius: "50%", backgroundColor: "rgba(94,234,212,0.10)",
          filter: "blur(40px)",
        }} />
        <div style={{ fontFamily: MONO, fontSize: 14, letterSpacing: 6, color: C.accent, fontWeight: 600 }}>
          PROJECTED IMPACT
        </div>
        <div style={{
          marginTop: 64, display: "flex", alignItems: "baseline", gap: 24,
          fontFamily: SERIF, fontWeight: 600, lineHeight: 1.0,
        }}>
          <span style={{ fontSize: 116, color: C.mute }}>18%</span>
          <span style={{ fontSize: 52, color: C.accent }}>→</span>
          <span style={{ fontSize: 116, color: C.accent }}>{projection}%+</span>
        </div>
        <div style={{ fontFamily: SANS, fontSize: 22, color: C.text, lineHeight: 1.5, marginTop: 56 }}>
          AP partner conversion rate target — driven by zero-latency dialing,
          native-language rapport, and a scoring layer the RM team
          <em style={{ color: C.accent, fontWeight: 600, fontStyle: "normal" }}> trusts</em>.
        </div>
      </div>

      {/* Roadmap on the right */}
      <div style={{
        position: "absolute", top: 400, right: 90, width: 880,
        display: "flex", flexDirection: "column", gap: 18,
      }}>
        {items.map((it, i) => {
          const stl = fadeUp(frame, 60 + i * 16, 18);
          return (
            <div key={it.h} style={{
              ...stl, backgroundColor: C.bgMid, border: `1px solid ${C.line}`,
              borderRadius: 18, padding: "20px 28px", display: "flex", gap: 24, alignItems: "center",
            }}>
              <div style={{
                width: 50, height: 50, borderRadius: 12,
                backgroundColor: "rgba(94,234,212,0.12)",
                border: `1px solid rgba(94,234,212,0.4)`,
                display: "flex", alignItems: "center", justifyContent: "center",
                fontFamily: MONO, fontSize: 14, fontWeight: 600, color: C.accent, letterSpacing: 1,
              }}>
                {it.tag}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: SANS, fontSize: 22, fontWeight: 600, color: C.text }}>
                  {it.h}
                </div>
                <div style={{ fontFamily: SANS, fontSize: 16, color: C.mute, marginTop: 4 }}>
                  {it.b}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </SceneFrame>
  );
};

// =====================================================================
// SCENE 7 — Outro
// =====================================================================
const OutroScene: React.FC = () => {
  const frame = useCurrentFrame();
  const tag       = fadeUp(frame, 4,  18);
  const headline  = fadeUp(frame, 16, 26);
  const sub       = fadeUp(frame, 38, 22);
  const cmds      = fadeUp(frame, 60, 24);

  const pulseMore = (Math.sin(frame * 0.16) * 0.5 + 0.5) * 0.2 + 0.85;

  return (
    <AbsoluteFill style={{ backgroundColor: C.bg }}>
      <BackgroundHalo />
      <BackgroundGrid />

      {/* Faint big "R" mark on the right */}
      <div style={{
        position: "absolute", right: 80, top: "30%", width: 600, height: 600,
        borderRadius: "50%", backgroundColor: "rgba(94,234,212,0.08)",
        filter: "blur(20px)", transform: `scale(${pulseMore})`,
      }} />
      <div style={{
        position: "absolute", right: 200, top: "32%",
        fontFamily: SERIF, fontStyle: "italic", fontSize: 480,
        color: "rgba(94,234,212,0.16)", lineHeight: 1, fontWeight: 600,
      }}>
        R
      </div>

      <div style={{ position: "absolute", left: 90, top: 220, ...tag }}>
        <div style={{ fontFamily: MONO, fontSize: 18, letterSpacing: 6, color: C.accent, fontWeight: 600 }}>
          RUPEEZY AP VOICE AGENT
        </div>
      </div>

      <div style={{ position: "absolute", left: 90, top: 290, width: 1300, ...headline }}>
        <h1 style={{
          fontFamily: SERIF, fontWeight: 500, fontSize: 132, color: C.light,
          lineHeight: 0.96, margin: 0, letterSpacing: -1,
        }}>
          Built in a hackathon.<br/>
          <em style={{ color: C.accent, fontWeight: 400 }}>Designed</em> to ship.
        </h1>
      </div>

      <div style={{ position: "absolute", left: 90, top: 660, width: 1100, ...sub }}>
        <p style={{ fontFamily: SANS, fontSize: 28, color: C.mute, lineHeight: 1.45, margin: 0 }}>
          One unified pipeline. Three terminals. A console the RM team can
          actually run on.
        </p>
      </div>

      <div style={{ position: "absolute", left: 90, top: 830, ...cmds }}>
        <div style={{ display: "flex", gap: 18 }}>
          {["uv run api", "ngrok http 8000", "npm run dev"].map((c) => (
            <div key={c} style={{
              fontFamily: MONO, fontSize: 22, color: C.accent,
              padding: "14px 22px", border: `1px solid rgba(94,234,212,0.4)`,
              borderRadius: 10, backgroundColor: "rgba(94,234,212,0.06)",
            }}>
              $ {c}
            </div>
          ))}
        </div>
      </div>

      <div style={{
        position: "absolute", bottom: 50, left: 90,
        fontFamily: MONO, fontSize: 16, letterSpacing: 4, color: C.mute,
      }}>
        THEME 7  ·  RUPEEZY HACKATHON 2026
      </div>
    </AbsoluteFill>
  );
};

// =====================================================================
// Composition root
// =====================================================================
export const Explainer: React.FC = () => {
  return (
    <AbsoluteFill style={{ backgroundColor: C.bg, fontFamily: SANS }}>
      <Sequence from={T.title.from}        durationInFrames={T.title.duration + 8}>        <TitleScene /></Sequence>
      <Sequence from={T.problem.from}      durationInFrames={T.problem.duration + 8}>      <ProblemScene /></Sequence>
      <Sequence from={T.pillars.from}      durationInFrames={T.pillars.duration + 8}>      <PillarsScene /></Sequence>
      <Sequence from={T.architecture.from} durationInFrames={T.architecture.duration + 8}> <ArchitectureScene /></Sequence>
      <Sequence from={T.conversation.from} durationInFrames={T.conversation.duration + 8}> <ConversationScene /></Sequence>
      <Sequence from={T.impact.from}       durationInFrames={T.impact.duration + 8}>       <ImpactScene /></Sequence>
      <Sequence from={T.outro.from}        durationInFrames={T.outro.duration}>            <OutroScene /></Sequence>
    </AbsoluteFill>
  );
};
