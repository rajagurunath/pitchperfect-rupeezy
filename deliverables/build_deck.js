// Rupeezy AP Voice Agent — hackathon deck (Theme 7).
// Premium dark + electric-teal palette matching the product UI.

const pptxgen = require("pptxgenjs");
const React = require("react");
const ReactDOMServer = require("react-dom/server");
const sharp = require("sharp");
const {
  FaMicrophoneAlt, FaLanguage, FaPhoneAlt, FaBrain, FaChartLine,
  FaShieldAlt, FaWaveSquare, FaRocket, FaUsers, FaClock,
  FaCommentDots, FaBolt, FaCheckCircle, FaHeadset, FaServer,
  FaCloudUploadAlt, FaRobot, FaFire, FaSnowflake, FaArrowRight,
} = require("react-icons/fa");

// ---------- Palette --------------------------------------------------------

const C = {
  bg:        "0A1428",   // deep navy
  bgMid:     "13203D",   // card surface
  bgSoft:    "1A2A4D",   // raised card
  accent:    "2DD4BF",   // electric teal — primary accent
  accentDim: "0F766E",   // teal soft
  light:     "F7F9FC",
  text:      "E2E8F0",
  mute:      "94A3B8",
  line:      "1E3A5F",
  hot:       "F87171",
  warm:      "FBBF24",
  cold:      "60A5FA",
  ok:        "34D399",
};

const FONT_HEADER = "Georgia";
const FONT_BODY   = "Calibri";

// ---------- Icon helpers ---------------------------------------------------

function svg(IconComponent, color = "#000000", size = 256) {
  return ReactDOMServer.renderToStaticMarkup(
    React.createElement(IconComponent, { color, size: String(size) })
  );
}
async function ico(IconComponent, hex, size = 256) {
  const png = await sharp(Buffer.from(svg(IconComponent, "#" + hex, size)))
    .png().toBuffer();
  return "image/png;base64," + png.toString("base64");
}

// ---------- Decorative helpers --------------------------------------------

function pageBg(slide) {
  slide.background = { color: C.bg };
  // Subtle accent bar on the left edge
  slide.addShape("rect", {
    x: 0, y: 0, w: 0.08, h: 5.625,
    fill: { color: C.accent }, line: { type: "none" },
  });
}

function footer(slide, label) {
  slide.addText("Rupeezy AP Voice Agent  ·  Theme 7", {
    x: 0.5, y: 5.30, w: 5, h: 0.25,
    fontSize: 9, color: C.mute, fontFace: FONT_BODY, charSpacing: 2,
  });
  slide.addText(label, {
    x: 6.5, y: 5.30, w: 3.2, h: 0.25,
    fontSize: 9, color: C.mute, fontFace: FONT_BODY,
    align: "right", charSpacing: 2, margin: 0,
  });
}

function eyebrow(slide, text, x, y) {
  slide.addText(text, {
    x, y, w: 5, h: 0.3,
    fontSize: 11, color: C.accent, bold: true,
    fontFace: FONT_BODY, charSpacing: 6,
  });
}

function slideTitle(slide, text, y = 0.85) {
  slide.addText(text, {
    x: 0.5, y, w: 9.0, h: 0.7,
    fontSize: 32, bold: true, color: C.light, fontFace: FONT_HEADER,
    margin: 0,
  });
}

// ---------- Build ----------------------------------------------------------

async function build() {
  const pres = new pptxgen();
  pres.layout = "LAYOUT_16x9";   // 10 × 5.625
  pres.title  = "Rupeezy AP Voice Agent — Theme 7";
  pres.author = "Voice Agents Team";

  // Pre-rasterize icons we'll reuse
  const I = {
    mic:    await ico(FaMicrophoneAlt,  C.accent),
    lang:   await ico(FaLanguage,       C.accent),
    phone:  await ico(FaPhoneAlt,       C.accent),
    brain:  await ico(FaBrain,          C.accent),
    chart:  await ico(FaChartLine,      C.accent),
    shield: await ico(FaShieldAlt,      C.accent),
    wave:   await ico(FaWaveSquare,     C.accent),
    rocket: await ico(FaRocket,         C.accent),
    users:  await ico(FaUsers,          C.accent),
    clock:  await ico(FaClock,          C.accent),
    chat:   await ico(FaCommentDots,    C.accent),
    bolt:   await ico(FaBolt,           C.accent),
    check:  await ico(FaCheckCircle,    C.ok),
    head:   await ico(FaHeadset,        C.accent),
    server: await ico(FaServer,         C.accent),
    upload: await ico(FaCloudUploadAlt, C.accent),
    bot:    await ico(FaRobot,          C.accent),
    fire:   await ico(FaFire,           C.hot),
    snow:   await ico(FaSnowflake,      C.cold),
    arrow:  await ico(FaArrowRight,     C.accent),
    micL:   await ico(FaMicrophoneAlt,  C.light),
  };

  // ====================================================================
  // SLIDE 1 — Title
  // ====================================================================
  {
    const s = pres.addSlide();
    s.background = { color: C.bg };

    // Soft glow disc behind the mic
    s.addShape("ellipse", {
      x: 6.6, y: 0.8, w: 3.4, h: 3.4,
      fill: { color: C.accent, transparency: 85 }, line: { type: "none" },
    });
    s.addShape("ellipse", {
      x: 7.0, y: 1.1, w: 2.8, h: 2.8,
      fill: { color: C.accent, transparency: 75 }, line: { type: "none" },
    });
    s.addImage({ data: I.micL, x: 7.55, y: 1.65, w: 1.4, h: 1.4 });

    // Side accent bar
    s.addShape("rect", {
      x: 0, y: 0, w: 0.18, h: 5.625,
      fill: { color: C.accent }, line: { type: "none" },
    });

    s.addText("THEME 7  ·  RUPEEZY AP PARTNER PROGRAM", {
      x: 0.7, y: 0.85, w: 7, h: 0.3,
      fontSize: 10, color: C.accent, bold: true,
      fontFace: FONT_BODY, charSpacing: 4, margin: 0,
    });

    s.addText("AI that picks up\nthe phone — in your\npartner's language.", {
      x: 0.7, y: 1.35, w: 6.5, h: 2.4,
      fontSize: 44, bold: true, color: C.light,
      fontFace: FONT_HEADER, lineSpacingMultiple: 1.0, margin: 0,
    });

    s.addText(
      "A multilingual voice-agent platform that calls inbound AP leads instantly,\n" +
      "speaks 9 Indian languages natively, handles the 5 core objections, and\n" +
      "scores every conversation HOT / WARM / COLD for the human RM.",
      {
        x: 0.7, y: 4.0, w: 6.7, h: 1.0,
        fontSize: 13, color: C.mute, fontFace: FONT_BODY,
        lineSpacingMultiple: 1.3,
      }
    );

    // Stat ribbon
    s.addShape("rect", {
      x: 0, y: 5.15, w: 10, h: 0.475,
      fill: { color: C.bgMid }, line: { type: "none" },
    });
    const stats = [
      { v: "18% → 40%+", l: "AP CONVERSION GOAL" },
      { v: "9",          l: "INDIAN LANGUAGES" },
      { v: "<5s",        l: "TIME TO FIRST DIAL" },
      { v: "100%",       l: "CALLS SCORED + LOGGED" },
    ];
    stats.forEach((st, i) => {
      const x = 0.3 + i * 2.45;
      s.addText(st.v, {
        x, y: 5.20, w: 2.4, h: 0.20,
        fontSize: 12, bold: true, color: C.accent,
        fontFace: FONT_BODY, align: "center", margin: 0,
      });
      s.addText(st.l, {
        x, y: 5.40, w: 2.4, h: 0.18,
        fontSize: 8, color: C.mute, fontFace: FONT_BODY,
        align: "center", charSpacing: 3, margin: 0,
      });
    });
  }

  // ====================================================================
  // SLIDE 2 — The Problem
  // ====================================================================
  {
    const s = pres.addSlide();
    pageBg(s);
    eyebrow(s, "THE GAP", 0.5, 0.45);
    slideTitle(s, "Inbound AP leads leak before a human can call them.", 0.75);

    s.addText(
      "Rupeezy's AP partner program has a top-of-funnel problem: leads come in fast,\n" +
      "but humans pick up the phone slowly — and when they do, half the time they don't\n" +
      "share a language with the partner. We're shipping the agent that closes both gaps.",
      {
        x: 0.5, y: 1.55, w: 9.0, h: 0.85,
        fontSize: 13, color: C.mute, fontFace: FONT_BODY,
        lineSpacingMultiple: 1.35,
      }
    );

    // 3 stat cards
    const cards = [
      { icon: I.users,  big: "18%",  label: "today's AP conversion",
        sub: "Best-case under current human-only outreach. Most leads are talked to days late, if at all." },
      { icon: I.clock,  big: "<5min", label: "before a hot lead cools",
        sub: "Industry data on inbound finance leads. Human dialers can't beat this clock at scale." },
      { icon: I.lang,   big: "9",    label: "languages partners speak",
        sub: "Hindi · Hinglish · English · Tamil · Telugu · Marathi · Gujarati · Bengali · Punjabi." },
    ];
    cards.forEach((c, i) => {
      const x = 0.5 + i * 3.05;
      const y = 2.6;
      s.addShape("rect", {
        x, y, w: 2.85, h: 2.4,
        fill: { color: C.bgMid }, line: { color: C.line, width: 0.75 },
      });
      s.addShape("rect", {
        x, y, w: 2.85, h: 0.05,
        fill: { color: C.accent }, line: { type: "none" },
      });
      s.addImage({ data: c.icon, x: x + 0.25, y: y + 0.30, w: 0.45, h: 0.45 });
      s.addText(c.big, {
        x: x + 0.25, y: y + 0.85, w: 2.4, h: 0.7,
        fontSize: 44, bold: true, color: C.accent, fontFace: FONT_HEADER,
        margin: 0,
      });
      s.addText(c.label, {
        x: x + 0.25, y: y + 1.55, w: 2.5, h: 0.25,
        fontSize: 11, bold: true, color: C.text,
        fontFace: FONT_BODY, charSpacing: 2, margin: 0,
      });
      s.addText(c.sub, {
        x: x + 0.25, y: y + 1.80, w: 2.4, h: 0.55,
        fontSize: 9.5, color: C.mute, fontFace: FONT_BODY,
        lineSpacingMultiple: 1.25, margin: 0,
      });
    });

    footer(s, "01 / 06   ·   The Gap");
  }

  // ====================================================================
  // SLIDE 3 — Our Solution: 3 pillars
  // ====================================================================
  {
    const s = pres.addSlide();
    pageBg(s);
    eyebrow(s, "OUR ANSWER", 0.5, 0.45);
    slideTitle(s, "Three pillars. One unfair advantage.", 0.75);

    const pillars = [
      {
        icon: I.bolt, h: "INSTANT",
        t: "Auto-dial in seconds",
        b: "A new lead lands in the admin → Twilio places the call before the partner closes the form. Batch-dialing fans out to 10+ leads at once.",
      },
      {
        icon: I.lang, h: "MULTILINGUAL",
        t: "Native in 9 languages",
        b: "ElevenLabs Scribe v2 transcribes any of 9 Indian languages auto-detected. Kimi-K2.6 reasons in-language. Turbo TTS replies in matching voice.",
      },
      {
        icon: I.brain, h: "INTELLIGENT",
        t: "Scored & summarised",
        b: "Every call ends with a HOT / WARM / COLD score, an objection list, a next-action recommendation, and a full transcript — for the RM, not the agent.",
      },
    ];
    pillars.forEach((p, i) => {
      const x = 0.5 + i * 3.05;
      const y = 1.85;
      s.addShape("rect", {
        x, y, w: 2.85, h: 2.95,
        fill: { color: C.bgMid }, line: { color: C.line, width: 0.75 },
      });
      // Icon disc
      s.addShape("ellipse", {
        x: x + 0.25, y: y + 0.25, w: 0.65, h: 0.65,
        fill: { color: C.accent, transparency: 80 }, line: { type: "none" },
      });
      s.addImage({ data: p.icon, x: x + 0.34, y: y + 0.34, w: 0.47, h: 0.47 });

      s.addText(p.h, {
        x: x + 1.0, y: y + 0.30, w: 1.85, h: 0.30,
        fontSize: 10.5, bold: true, color: C.accent,
        fontFace: FONT_BODY, charSpacing: 3, margin: 0,
      });
      s.addText(p.t, {
        x: x + 1.0, y: y + 0.55, w: 1.85, h: 0.40,
        fontSize: 13, bold: true, color: C.text,
        fontFace: FONT_BODY, margin: 0,
      });
      s.addText(p.b, {
        x: x + 0.25, y: y + 1.15, w: 2.4, h: 1.7,
        fontSize: 11, color: C.mute, fontFace: FONT_BODY,
        lineSpacingMultiple: 1.4, margin: 0,
      });
    });

    // Tagline strip
    s.addShape("rect", {
      x: 0.5, y: 4.95, w: 9.0, h: 0.32,
      fill: { color: C.bgSoft }, line: { type: "none" },
    });
    s.addText([
      { text: "RESULT  ", options: { color: C.accent, bold: true, charSpacing: 6 } },
      { text: "Every inbound lead gets a real conversation in the right language — before the competitor's WhatsApp arrives.",
        options: { color: C.text } },
    ], {
      x: 0.65, y: 4.95, w: 9.0, h: 0.32,
      fontSize: 11, fontFace: FONT_BODY, valign: "middle", margin: 0,
    });

    footer(s, "02 / 06   ·   The Answer");
  }

  // ====================================================================
  // SLIDE 4 — How It Works (architecture)
  // ====================================================================
  {
    const s = pres.addSlide();
    pageBg(s);
    eyebrow(s, "ARCHITECTURE", 0.5, 0.45);
    slideTitle(s, "From CSV upload to a scored conversation in one pass.", 0.75);

    // Pipeline blocks
    const stages = [
      { icon: I.upload, title: "INGEST",   sub: "CSV / form upload\nLeads → SQLite" },
      { icon: I.phone,  title: "DIAL",     sub: "Twilio Programmable\nVoice via REST" },
      { icon: I.bot,    title: "AGENT",    sub: "Pipecat 1.1\n+ Twilio Media Stream" },
      { icon: I.brain,  title: "REASON",   sub: "Kimi-K2.6 vLLM\nthinking off (low-lat)" },
      { icon: I.chart,  title: "SCORE",    sub: "Analyzer pass:\nHOT / WARM / COLD" },
    ];
    const totalW = 9.0, gap = 0.20, n = stages.length;
    const blockW = (totalW - gap * (n - 1)) / n; // 5 blocks
    const yBlock = 1.70;

    stages.forEach((st, i) => {
      const x = 0.5 + i * (blockW + gap);
      s.addShape("rect", {
        x, y: yBlock, w: blockW, h: 1.55,
        fill: { color: C.bgMid }, line: { color: C.line, width: 0.75 },
      });
      // Top accent line
      s.addShape("rect", {
        x, y: yBlock, w: blockW, h: 0.05,
        fill: { color: C.accent }, line: { type: "none" },
      });
      s.addImage({
        data: st.icon,
        x: x + (blockW - 0.45) / 2, y: yBlock + 0.2,
        w: 0.45, h: 0.45,
      });
      s.addText(st.title, {
        x, y: yBlock + 0.72, w: blockW, h: 0.25,
        fontSize: 11, bold: true, color: C.accent,
        fontFace: FONT_BODY, align: "center", charSpacing: 5, margin: 0,
      });
      s.addText(st.sub, {
        x: x + 0.10, y: yBlock + 0.96, w: blockW - 0.20, h: 0.55,
        fontSize: 9, color: C.mute, fontFace: FONT_BODY,
        align: "center", lineSpacingMultiple: 1.25, margin: 0,
      });

      // Arrow between blocks
      if (i < n - 1) {
        s.addImage({
          data: I.arrow,
          x: x + blockW + (gap - 0.18) / 2, y: yBlock + 0.65,
          w: 0.18, h: 0.18,
        });
      }
    });

    // Lifecycle pill row (mirrors the in-app DAG)
    s.addText("CALL LIFECYCLE — recorded as events for the operations DAG", {
      x: 0.5, y: 3.30, w: 9, h: 0.22,
      fontSize: 9, color: C.mute, charSpacing: 4, fontFace: FONT_BODY,
      bold: true, margin: 0,
    });

    const stages2 = [
      { l: "queued",       c: C.accent },
      { l: "dialing",      c: C.accent },
      { l: "ringing",      c: C.accent },
      { l: "picked",       c: C.accent },
      { l: "agent_spoke",  c: C.accent },
      { l: "user_spoke",   c: C.accent },
      { l: "completed",    c: C.ok },
    ];
    let cx = 0.5;
    const pillY = 3.55;
    stages2.forEach((st, i) => {
      const w = 1.10;
      s.addShape("roundRect", {
        x: cx, y: pillY, w, h: 0.45,
        fill: { color: C.bgMid }, line: { color: st.c, width: 1 },
        rectRadius: 0.08,
      });
      s.addText(st.l, {
        x: cx, y: pillY, w, h: 0.45,
        fontSize: 10, color: st.c, bold: true,
        fontFace: FONT_BODY, align: "center", valign: "middle", margin: 0,
      });
      cx += w;
      if (i < stages2.length - 1) {
        s.addShape("rect", {
          x: cx, y: pillY + 0.21, w: 0.12, h: 0.03,
          fill: { color: C.line }, line: { type: "none" },
        });
        cx += 0.12;
      }
    });

    // Tech-stack chip rows (auto-wrap)
    const stack = [
      "Pipecat 1.1", "Twilio Media Streams", "ngrok",
      "ElevenLabs Scribe v2", "Kimi-K2.6 (vLLM)",
      "ElevenLabs Turbo v2.5", "Silero VAD",
      "FastAPI", "SQLite", "Next.js 15 + React 19",
    ];
    s.addText("STACK", {
      x: 0.5, y: 4.10, w: 9, h: 0.22,
      fontSize: 9, color: C.mute, charSpacing: 4, fontFace: FONT_BODY,
      bold: true, margin: 0,
    });
    const chipH = 0.30;
    const chipGap = 0.10;
    const rowGap = 0.08;
    const xStart = 0.5;
    const xMax = 9.5;
    let cxx = xStart;
    let cyy = 4.32;
    stack.forEach((label) => {
      const w = 0.20 + label.length * 0.085;
      if (cxx + w > xMax) {
        cxx = xStart;
        cyy += chipH + rowGap;
      }
      s.addShape("roundRect", {
        x: cxx, y: cyy, w, h: chipH,
        fill: { color: C.bgSoft }, line: { color: C.line, width: 0.75 },
        rectRadius: 0.06,
      });
      s.addText(label, {
        x: cxx, y: cyy, w, h: chipH,
        fontSize: 9, color: C.text, fontFace: FONT_BODY,
        align: "center", valign: "middle", margin: 0,
      });
      cxx += w + chipGap;
    });

    footer(s, "03 / 06   ·   How It Works");
  }

  // ====================================================================
  // SLIDE 5 — What We Built (Admin Platform features)
  // ====================================================================
  {
    const s = pres.addSlide();
    pageBg(s);
    eyebrow(s, "WHAT'S SHIPPED — MVP", 0.5, 0.45);
    slideTitle(s, "An ops console the RM team can actually run on.", 0.75);

    // 2x3 feature grid (left 6 cols)
    const features = [
      { icon: I.chart,  h: "Live operations DAG",
        t: "Aggregate funnel + per-call mini-DAGs. Drop-off branches surface failed dials in real time." },
      { icon: I.wave,   h: "Call review with waveform",
        t: "WaveSurfer.js audio scrubbing, full transcript, stage timeline, AI summary side-by-side." },
      { icon: I.users,  h: "Bulk lead upload",
        t: "CSV import, voice picker per lead, RM notes flowing straight into the system prompt." },
      { icon: I.head,   h: "Per-lead voice + persona",
        t: "Curated 10-voice ElevenLabs catalogue. Agent name, brand, pronouns all set via .env." },
      { icon: I.chart,  h: "Analytics dashboards",
        t: "Recharts views: stage funnel, calls/day, score split. Refresh-driven, no extra cron." },
      { icon: I.shield, h: "JWT-secured admin",
        t: "Single predefined operator from .env, HS256-signed sessions, 401 auto-redirects to login." },
    ];

    const gridX = 0.5, gridY = 1.65;
    const cellW = 3.1, cellH = 1.10, gx = 0.10, gy = 0.10;
    features.forEach((f, i) => {
      const col = i % 2;
      const row = Math.floor(i / 2);
      const x = gridX + col * (cellW + gx);
      const y = gridY + row * (cellH + gy);
      s.addShape("rect", {
        x, y, w: cellW, h: cellH,
        fill: { color: C.bgMid }, line: { color: C.line, width: 0.75 },
      });
      s.addShape("rect", {
        x, y, w: 0.06, h: cellH,
        fill: { color: C.accent }, line: { type: "none" },
      });
      s.addImage({ data: f.icon, x: x + 0.22, y: y + 0.22, w: 0.32, h: 0.32 });
      s.addText(f.h, {
        x: x + 0.65, y: y + 0.16, w: cellW - 0.75, h: 0.30,
        fontSize: 12, bold: true, color: C.text,
        fontFace: FONT_BODY, margin: 0,
      });
      s.addText(f.t, {
        x: x + 0.65, y: y + 0.45, w: cellW - 0.75, h: 0.62,
        fontSize: 9.5, color: C.mute, fontFace: FONT_BODY,
        lineSpacingMultiple: 1.3, margin: 0,
      });
    });

    // Right column — "what the judges can run today"
    const rx = 7.0, ry = 1.65, rw = 2.5, rh = 3.5;
    s.addShape("rect", {
      x: rx, y: ry, w: rw, h: rh,
      fill: { color: C.bgSoft }, line: { color: C.accent, width: 1 },
    });
    s.addText("RUN IT NOW", {
      x: rx + 0.20, y: ry + 0.18, w: rw - 0.4, h: 0.25,
      fontSize: 10, bold: true, color: C.accent,
      fontFace: FONT_BODY, charSpacing: 6, margin: 0,
    });
    s.addText("Three terminals.\nThree commands.", {
      x: rx + 0.20, y: ry + 0.45, w: rw - 0.4, h: 0.7,
      fontSize: 16, bold: true, color: C.text,
      fontFace: FONT_HEADER, lineSpacingMultiple: 1.05, margin: 0,
    });
    s.addText([
      { text: "uv run api",            options: { color: C.accent, fontFace: "Consolas", bold: true, breakLine: true } },
      { text: "FastAPI + Pipecat /ws", options: { color: C.mute,   fontSize: 9, breakLine: true } },
      { text: " ",                     options: { color: C.mute,   fontSize: 6, breakLine: true } },
      { text: "ngrok http 8000",       options: { color: C.accent, fontFace: "Consolas", bold: true, breakLine: true } },
      { text: "Public WS for Twilio",  options: { color: C.mute,   fontSize: 9, breakLine: true } },
      { text: " ",                     options: { color: C.mute,   fontSize: 6, breakLine: true } },
      { text: "npm run dev",           options: { color: C.accent, fontFace: "Consolas", bold: true, breakLine: true } },
      { text: "Next.js admin :3000",   options: { color: C.mute,   fontSize: 9 } },
    ], {
      x: rx + 0.20, y: ry + 1.50, w: rw - 0.4, h: 1.95,
      fontSize: 11, fontFace: FONT_BODY, lineSpacingMultiple: 1.15, margin: 0,
    });

    footer(s, "04 / 06   ·   What's Shipped");
  }

  // ====================================================================
  // SLIDE 6 — Impact & Future
  // ====================================================================
  {
    const s = pres.addSlide();
    pageBg(s);
    eyebrow(s, "WHAT'S NEXT", 0.5, 0.45);
    slideTitle(s, "From hackathon MVP to revenue infrastructure.", 0.75);

    // Left: Big projection callout
    s.addShape("rect", {
      x: 0.5, y: 1.75, w: 4.0, h: 3.3,
      fill: { color: C.bgMid }, line: { color: C.line, width: 0.75 },
    });
    s.addText("PROJECTED IMPACT", {
      x: 0.7, y: 1.95, w: 3.6, h: 0.25,
      fontSize: 10, bold: true, color: C.accent,
      fontFace: FONT_BODY, charSpacing: 5, margin: 0,
    });
    s.addText("18%", {
      x: 0.65, y: 2.45, w: 1.45, h: 1.0,
      fontSize: 44, bold: true, color: C.mute,
      fontFace: FONT_HEADER, valign: "middle", margin: 0,
    });
    s.addImage({ data: I.arrow, x: 2.05, y: 2.78, w: 0.36, h: 0.36 });
    s.addText("40%+", {
      x: 2.45, y: 2.45, w: 1.95, h: 1.0,
      fontSize: 44, bold: true, color: C.accent,
      fontFace: FONT_HEADER, valign: "middle", margin: 0,
    });
    s.addText("AP partner conversion rate target.\nDriven by zero-latency dialing, native-language\nrapport, and a scoring layer the RM trusts.", {
      x: 0.7, y: 3.50, w: 3.6, h: 1.4,
      fontSize: 11, color: C.text, fontFace: FONT_BODY,
      lineSpacingMultiple: 1.4, margin: 0,
    });

    // Right: roadmap rows
    const roadmap = [
      { icon: I.chat,   h: "WhatsApp follow-up",
        t: "Auto-send the call summary + brochure in the partner's language seconds after hang-up." },
      { icon: I.bolt,   h: "Realtime supervisor barge-in",
        t: "RM can take over the call mid-flight when the agent flags a HOT signal." },
      { icon: I.head,   h: "Voice cloning per RM",
        t: "Each RM can train a 30-second clone so reassigned calls feel continuous." },
      { icon: I.server, h: "CRM + Salesforce sync",
        t: "Two-way sync of leads, transcripts, and scores. No more spreadsheet exports." },
      { icon: I.rocket, h: "Multi-tenant for adjacent programs",
        t: "Same engine for any inbound-heavy partner pipeline — insurance, lending, B2B SaaS." },
    ];

    const rx = 4.85, rwTotal = 4.65;
    roadmap.forEach((r, i) => {
      const y = 1.70 + i * 0.60;
      s.addShape("rect", {
        x: rx, y, w: rwTotal, h: 0.52,
        fill: { color: C.bgMid }, line: { color: C.line, width: 0.5 },
      });
      s.addShape("ellipse", {
        x: rx + 0.10, y: y + 0.12, w: 0.34, h: 0.34,
        fill: { color: C.accent, transparency: 80 }, line: { type: "none" },
      });
      s.addImage({ data: r.icon, x: rx + 0.15, y: y + 0.17, w: 0.24, h: 0.24 });
      s.addText(r.h, {
        x: rx + 0.55, y: y + 0.05, w: rwTotal - 0.65, h: 0.25,
        fontSize: 12, bold: true, color: C.text,
        fontFace: FONT_BODY, margin: 0,
      });
      s.addText(r.t, {
        x: rx + 0.55, y: y + 0.28, w: rwTotal - 0.65, h: 0.30,
        fontSize: 9.5, color: C.mute, fontFace: FONT_BODY,
        margin: 0,
      });
    });

    // Closing line
    s.addText([
      { text: "Built in a hackathon. ",      options: { color: C.mute, italic: true } },
      { text: "Designed to ship.",            options: { color: C.accent, bold: true } },
    ], {
      x: 0.5, y: 5.10, w: 9.0, h: 0.25,
      fontSize: 12, fontFace: FONT_BODY, align: "center", margin: 0,
    });

    footer(s, "05 / 06   ·   What's Next");
  }

  await pres.writeFile({ fileName: "deliverables/rupeezy_voice_agent_deck.pptx" });
  console.log("✓ wrote deliverables/rupeezy_voice_agent_deck.pptx");
}

build().catch((e) => { console.error(e); process.exit(1); });
