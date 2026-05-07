"""Seed the demo database with realistic-looking leads, calls, and analytics.

Run before recording a video / running a stakeholder demo so the dashboard
isn't empty. Idempotent-ish: it appends rows, so you can run it once and
move on. To start fresh, delete data/voice_agents.db first.

    uv run python scripts/seed_demo_data.py
    # or
    uv run seed-demo

Generates:
  * 50 leads with Indian names, +91 numbers, mixed language preferences
  * 80 calls spread across the last 14 days, with realistic score split
    (~25% HOT, ~40% WARM, ~25% COLD, ~10% drop-offs)
  * stage events for every call so the operations DAG and stage funnel
    light up
  * sample transcripts for ~12 calls so a few rows have something to open
  * post-call summaries on completed calls
"""

from __future__ import annotations

import random
import sqlite3
import uuid
from datetime import datetime, timedelta, timezone

from voice_agents import db

# Make runs reproducible so the demo numbers feel stable across re-seeds.
random.seed(7)

# -------- Lead corpus -------------------------------------------------------

FIRST_NAMES = [
    "Arjun", "Priya", "Rohan", "Ananya", "Vikram", "Sneha", "Karthik", "Divya",
    "Aditya", "Meera", "Suresh", "Nisha", "Rajesh", "Pooja", "Amit", "Kavya",
    "Manoj", "Lakshmi", "Sandeep", "Reema", "Gaurav", "Swati", "Naveen",
    "Aishwarya", "Pranav", "Riya", "Harsh", "Tanvi", "Akash", "Shruti",
    "Vishal", "Neha", "Mahesh", "Bhavna", "Yash", "Komal", "Nikhil", "Isha",
    "Ravi", "Deepa", "Krishna", "Sangeeta", "Manish", "Pallavi", "Ashwin",
    "Trisha", "Sumit", "Rashmi", "Varun", "Anjali",
]
LAST_NAMES = [
    "Sharma", "Verma", "Gupta", "Iyer", "Reddy", "Patel", "Nair", "Kumar",
    "Singh", "Mehta", "Joshi", "Shah", "Rao", "Pillai", "Banerjee", "Das",
    "Chatterjee", "Khanna", "Kapoor", "Malhotra", "Saxena", "Trivedi", "Menon",
    "Krishnan", "Naidu", "Bhatt", "Agarwal", "Chauhan", "Bhattacharya",
    "Pandey", "Mishra", "Yadav", "Goswami", "Tripathi", "Choudhary",
]
LANGUAGES = ["Hindi", "Hinglish", "English", "Tamil", "Telugu", "Marathi",
             "Gujarati", "Bengali", "Punjabi"]
LANG_WEIGHTS = [22, 20, 18, 12, 10, 7, 5, 4, 2]  # rough share of partner book

VOICE_IDS = [
    "EXAVITQu4vr4xnSDxMaL",  # Bella
    "EkK5I93UQWFDigLMpZcX",  # Sarah
    "AZnzlk1XvdvUeBnXmlld",  # Jessica
    "iP95p4xoKVk53GoZ742B",  # Laura
    "TxGEqnHWrfWFTfGW9XjX",  # Lily
    "JBFqnCBsd6RMkjVDRZzb",  # George
    "IKne3meq5aSn9XLyUdCD",  # Charlie
    "nPczCjzI2devNBz1zQrb",  # Brian
    "GBv7mTt0atIp3Br8iCZE",  # Eric
    "iP95p4xoKVk53GoZ742B",  # Chris
]

NOTES_POOL = [
    "Existing partner with HDFC Securities. Open to switching for better commission.",
    "Inbound from Linkedin ad. Mentioned interest in derivatives desk.",
    "Referred by APR-23-441. Wants to know about onboarding speed.",
    "Tier-2 city sub-broker, 4 yrs in equity markets.",
    "AUM ~₹12 Cr currently. Asked about platform support quality.",
    "Already filled out the broker partnership form on the website.",
    "Friend of an existing AP — second-degree referral.",
    "Independent advisor moving from RIA model. Compliance-conscious.",
    "Has been with current broker for 5+ years. Sticky but unhappy with payout.",
    "POSP candidate. Mostly insurance background, learning equity now.",
    "Runs a coaching centre, looking for second income stream.",
    "Strong client book (~80 active). Wants WhatsApp support for clients.",
    "Sub-broker switching from regional broker, asked about training.",
    "Partner with Zerodha but exploring options.",
]

# -------- Per-call scripts (multilingual snippets used as transcript) -----

CALL_SCRIPTS: dict[str, list[tuple[str, str, str]]] = {
    # speaker, language, text
    "hot": [
        ("agent", "Hindi",    "नमस्ते, मैं Rupeezy की प्रिया बोल रही हूँ। क्या मैं एक मिनट बात कर सकती हूँ?"),
        ("user",  "Hindi",    "हाँ बोलिए, क्या बात है?"),
        ("agent", "Hinglish", "AP partner program ke baare mein call kar rahi hoon. Aap apne current broker ke saath kitne saal se hain?"),
        ("user",  "Hindi",    "अभी तीन साल हो गए। आपकी कमीशन कैसी है?"),
        ("agent", "Hinglish", "Industry-best 50–60% lifetime payout, plus 6 lakh ka monthly cap nahi hai."),
        ("user",  "Hinglish", "Achha. Aur platform support kaisa hai? Main equity aur F&O dono karta hoon."),
        ("agent", "Hinglish", "F&O dedicated support ke saath, AP onboarding 48 ghante mein ho jaata hai. Main details WhatsApp pe bhej dungi?"),
        ("user",  "Hindi",    "हाँ, भेज दीजिए, मैं देखूँगा।"),
    ],
    "warm": [
        ("agent", "Tamil",    "வணக்கம், நான் Rupeezy நிறுவனத்திலிருந்து பிரியா பேசுகிறேன். ஒரு நிமிடம் பேசலாமா?"),
        ("user",  "Tamil",    "சரி, சொல்லுங்க."),
        ("agent", "Tamil",    "AP partner program பற்றி பேசுவதற்காக கூப்பிட்டேன். தற்போதைய broker-ஐ பத்தி எத்தனை வருடமா?"),
        ("user",  "Tamil",    "இரண்டு வருடம். கமிஷன் எப்படி?"),
        ("agent", "Tamil",    "50–60% lifetime payout, பின் monthly cap இல்லை."),
        ("user",  "Tamil",    "சரி, யோசிப்பேன். பிறகு கூப்புடுங்க."),
    ],
    "cold": [
        ("agent", "English",  "Hello, this is Priya from Rupeezy. May I take a minute of your time?"),
        ("user",  "English",  "I'm in a meeting, can you call back later?"),
        ("agent", "English",  "Of course. Is afternoon a better window for you?"),
        ("user",  "English",  "Just send me an email or WhatsApp, I'll look at it."),
    ],
    "dropped_early": [
        ("agent", "Hindi",    "नमस्ते, मैं Rupeezy से बोल रही हूँ —"),
    ],
}

SUMMARIES = {
    "hot":  "Engaged partner, currently with competitor for 3 years. Asked about commission and platform support. Open to receiving details. Strong fit.",
    "warm": "Lead picked up but asked for callback later. Engaged briefly on commission. Worth a follow-up in 48h.",
    "cold": "Lead requested email/WhatsApp follow-up only. No real interest expressed on call.",
}

# -------- Helpers -----------------------------------------------------------

def rand_phone() -> str:
    return "+91" + "".join(str(random.randint(0, 9)) for _ in range(10))

def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()

def mk_lead_id() -> str:    return db.new_id("lead")
def mk_call_id() -> str:    return db.new_id("call")

# -------- Main --------------------------------------------------------------

def run() -> None:
    print(f"Seeding demo data into {db.DB_PATH} …")
    db._ensure_init()  # makes sure schema + migrations are applied

    now = datetime.now(tz=timezone.utc)
    leads: list[tuple[str, str, str, str | None]] = []  # (id, name, phone, lang)

    # ---- 50 leads spread over the last 14 days ----
    for i in range(50):
        first = random.choice(FIRST_NAMES)
        last  = random.choice(LAST_NAMES)
        name  = f"{first} {last}"
        phone = rand_phone()
        lang  = random.choices(LANGUAGES, weights=LANG_WEIGHTS, k=1)[0]
        notes = random.choice(NOTES_POOL)
        voice = random.choice(VOICE_IDS) if random.random() < 0.7 else None

        created = now - timedelta(
            days=random.randint(0, 13),
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59),
        )
        # 80% will be marked done after a call lands; rest stay queued.
        status = "done" if random.random() < 0.8 else "queued"

        lid = mk_lead_id()
        with db.with_conn() as c:
            c.execute(
                "INSERT INTO leads(id,name,phone,language_pref,voice_id,notes,"
                "status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (lid, name, phone, lang, voice, notes, status,
                 iso(created), iso(created)),
            )
        leads.append((lid, name, phone, lang))

    # ---- 80 calls. Realistic score / drop-off split -----
    # outcome buckets, weights tuned to demo well in 14-day window:
    #   hot          25%
    #   warm         35%
    #   cold         20%
    #   dropped_early 8%
    #   no_answer     7%
    #   busy          3%
    #   failed        2%
    OUTCOMES = [
        ("hot",           25),
        ("warm",          35),
        ("cold",          20),
        ("dropped_early",  8),
        ("no_answer",      7),
        ("busy",           3),
        ("failed",         2),
    ]
    outcome_choices = [o for o, _ in OUTCOMES]
    outcome_weights = [w for _, w in OUTCOMES]

    n_calls = 80
    transcripts_remaining = 12  # only seed full transcripts on first 12 calls

    for i in range(n_calls):
        lead_id, lead_name, lead_phone, lead_lang = random.choice(leads)
        outcome = random.choices(outcome_choices, weights=outcome_weights, k=1)[0]

        # Distribute calls across the last 14 days; weight toward recent.
        days_ago = max(0, int(random.triangular(0, 13, 4)))
        call_created = now - timedelta(
            days=days_ago,
            hours=random.randint(0, 23),
            minutes=random.randint(0, 59),
        )
        # Slight delay between created and started.
        call_started = call_created + timedelta(seconds=random.randint(2, 30))

        cid = mk_call_id()
        twilio_sid = "CA" + uuid.uuid4().hex[:30]
        duration   = random.randint(45, 240) if outcome in ("hot","warm") else \
                     random.randint(15, 60)  if outcome == "cold" else \
                     random.randint(2, 12)   # dropped/no-answer/busy/failed
        ended_at   = call_started + timedelta(seconds=duration)

        # Map outcome → status, score, summary
        if outcome == "hot":
            status, score, summary = "completed", "HOT",  SUMMARIES["hot"]
        elif outcome == "warm":
            status, score, summary = "completed", "WARM", SUMMARIES["warm"]
        elif outcome == "cold":
            status, score, summary = "completed", "COLD", SUMMARIES["cold"]
        elif outcome == "dropped_early":
            status, score, summary = "completed", None,   None
        elif outcome == "no_answer":
            status, score, summary = "no-answer", None,  None
        elif outcome == "busy":
            status, score, summary = "failed",    None,  None
        else:  # failed
            status, score, summary = "failed",    None,  None

        with db.with_conn() as c:
            c.execute(
                "INSERT INTO calls(id,lead_id,twilio_sid,status,score,summary,"
                "duration_seconds,started_at,ended_at,created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?)",
                (cid, lead_id, twilio_sid, status, score, summary,
                 duration, iso(call_started), iso(ended_at), iso(call_created)),
            )

        # ---- stage events ----
        # Build a stage path for each outcome.
        path: list[str]
        if outcome in ("hot", "warm"):
            path = ["queued","dialing","ringing","picked","agent_spoke","user_spoke","completed"]
        elif outcome == "cold":
            # Cold calls usually engage briefly then end completed.
            path = ["queued","dialing","ringing","picked","agent_spoke","user_spoke","completed"]
        elif outcome == "dropped_early":
            path = ["queued","dialing","ringing","picked","dropped_early"]
        elif outcome == "no_answer":
            path = ["queued","dialing","ringing","no_answer"]
        elif outcome == "busy":
            path = ["queued","dialing","busy"]
        else:  # failed
            path = ["queued","dialing","failed"]

        # Spread events across the call duration.
        per_step = max(1, duration // max(1, len(path)))
        for step_idx, stage in enumerate(path):
            ts = call_created + timedelta(seconds=step_idx * per_step + random.randint(0, 2))
            with db.with_conn() as c:
                c.execute(
                    "INSERT INTO call_events(call_id,stage,detail,ts) VALUES (?,?,?,?)",
                    (cid, stage, None, iso(ts)),
                )

        # ---- transcripts for the first ~12 (HOT/WARM/COLD only) ----
        if transcripts_remaining > 0 and outcome in ("hot", "warm", "cold"):
            script_key = "hot" if outcome == "hot" else "warm" if outcome == "warm" else "cold"
            script = CALL_SCRIPTS[script_key]
            base = call_started
            for j, (speaker, lang, text) in enumerate(script):
                ts = base + timedelta(seconds=4 + j * 6)
                with db.with_conn() as c:
                    c.execute(
                        "INSERT INTO transcripts(call_id,speaker,text,language,ts) "
                        "VALUES (?,?,?,?,?)",
                        (cid, speaker, text, lang, iso(ts)),
                    )
            transcripts_remaining -= 1
        elif outcome == "dropped_early" and random.random() < 0.5:
            # A short transcript on a few dropped calls makes the dashboard
            # feel real (the agent spoke once, then the lead hung up).
            for j, (speaker, lang, text) in enumerate(CALL_SCRIPTS["dropped_early"]):
                ts = call_started + timedelta(seconds=2 + j * 3)
                with db.with_conn() as c:
                    c.execute(
                        "INSERT INTO transcripts(call_id,speaker,text,language,ts) "
                        "VALUES (?,?,?,?,?)",
                        (cid, speaker, text, lang, iso(ts)),
                    )

    # ---- summary print ----
    with db.with_conn() as c:
        leads_n = c.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
        calls_n = c.execute("SELECT COUNT(*) FROM calls").fetchone()[0]
        hot     = c.execute("SELECT COUNT(*) FROM calls WHERE score='HOT'").fetchone()[0]
        warm    = c.execute("SELECT COUNT(*) FROM calls WHERE score='WARM'").fetchone()[0]
        cold    = c.execute("SELECT COUNT(*) FROM calls WHERE score='COLD'").fetchone()[0]
        events  = c.execute("SELECT COUNT(*) FROM call_events").fetchone()[0]
        turns   = c.execute("SELECT COUNT(*) FROM transcripts").fetchone()[0]

    print(f"  leads:       {leads_n}")
    print(f"  calls:       {calls_n}  (HOT {hot} · WARM {warm} · COLD {cold})")
    print(f"  events:      {events}")
    print(f"  transcripts: {turns}")
    print("Done.")


if __name__ == "__main__":
    run()
