"""Seed the demo database with realistic-looking leads, calls, and analytics.

Run before recording a video / running a stakeholder demo so the dashboard
isn't empty. The dataset is shaped to look like a real production deployment:

  * 120 leads across 14 days
  * ~160 calls with a realistic daily trend (growth + weekend dip)
  * Score distribution biased toward engaged outcomes
  * 25+ calls have full multilingual transcripts so opening any HOT call
    shows a real conversation

To start fresh, delete data/voice_agents.db before running:

    rm -f data/voice_agents.db
    uv run python scripts/seed_demo_data.py
"""

from __future__ import annotations

import math
import random
import uuid
from datetime import datetime, timedelta, timezone

from voice_agents import db

random.seed(11)

# -------- Lead corpus -------------------------------------------------------

FIRST_NAMES = [
    "Arjun", "Priya", "Rohan", "Ananya", "Vikram", "Sneha", "Karthik", "Divya",
    "Aditya", "Meera", "Suresh", "Nisha", "Rajesh", "Pooja", "Amit", "Kavya",
    "Manoj", "Lakshmi", "Sandeep", "Reema", "Gaurav", "Swati", "Naveen",
    "Aishwarya", "Pranav", "Riya", "Harsh", "Tanvi", "Akash", "Shruti",
    "Vishal", "Neha", "Mahesh", "Bhavna", "Yash", "Komal", "Nikhil", "Isha",
    "Ravi", "Deepa", "Krishna", "Sangeeta", "Manish", "Pallavi", "Ashwin",
    "Trisha", "Sumit", "Rashmi", "Varun", "Anjali", "Hemant", "Smita",
    "Devang", "Madhuri", "Abhinav", "Kirti", "Tarun", "Ramya", "Ajay",
    "Bhavya", "Indrajit", "Manisha", "Kunal", "Aparna", "Sourav", "Madhu",
    "Saurabh", "Rashi", "Hardik", "Bhumi",
]
LAST_NAMES = [
    "Sharma", "Verma", "Gupta", "Iyer", "Reddy", "Patel", "Nair", "Kumar",
    "Singh", "Mehta", "Joshi", "Shah", "Rao", "Pillai", "Banerjee", "Das",
    "Chatterjee", "Khanna", "Kapoor", "Malhotra", "Saxena", "Trivedi", "Menon",
    "Krishnan", "Naidu", "Bhatt", "Agarwal", "Chauhan", "Bhattacharya",
    "Pandey", "Mishra", "Yadav", "Goswami", "Tripathi", "Choudhary",
    "Subramanian", "Rajan", "Hegde", "Pawar", "Kaur",
]
LANGUAGES = ["Hindi", "Hinglish", "English", "Tamil", "Telugu", "Marathi",
             "Gujarati", "Bengali", "Punjabi"]
LANG_WEIGHTS = [22, 20, 18, 12, 10, 7, 5, 4, 2]

VOICE_IDS = [
    "EXAVITQu4vr4xnSDxMaL", "EkK5I93UQWFDigLMpZcX", "AZnzlk1XvdvUeBnXmlld",
    "iP95p4xoKVk53GoZ742B", "TxGEqnHWrfWFTfGW9XjX", "JBFqnCBsd6RMkjVDRZzb",
    "IKne3meq5aSn9XLyUdCD", "nPczCjzI2devNBz1zQrb", "GBv7mTt0atIp3Br8iCZE",
]

NOTES_POOL = [
    "Existing partner with HDFC Securities. Open to switching for better commission.",
    "Inbound from LinkedIn ad. Mentioned interest in derivatives desk.",
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
    "Heavy F&O trader, asking about API access for partners.",
    "Existing Rupeezy customer wanting to refer their CA network.",
    "Returning lead — partner program inquiry from Q3.",
    "From Mumbai branch referral. Wealth-management focus.",
]

# -------- Per-call scripts --------------------------------------------------

CALL_SCRIPTS: dict[str, list[tuple[str, str, str]]] = {
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
    "hot_tamil": [
        ("agent", "Tamil",    "வணக்கம், நான் Rupeezy நிறுவனத்திலிருந்து பிரியா பேசுகிறேன். ஒரு நிமிடம் பேசலாமா?"),
        ("user",  "Tamil",    "சொல்லுங்க, என்ன விஷயம்?"),
        ("agent", "Tamil",    "AP partner program பற்றி பேசுவதற்காக கூப்பிட்டேன். தற்போதைய broker-ஐ எத்தனை வருடமா பயன்படுத்துறீங்க?"),
        ("user",  "Tamil",    "நான்கு வருடம். கமிஷன் எப்படி? எனக்கு F&O ல dedicated support வேணும்."),
        ("agent", "Tamil",    "50–60% lifetime payout, பின் monthly cap இல்லை. F&O dedicated team உண்டு."),
        ("user",  "Tamil",    "சரி, WhatsApp ல details அனுப்புங்க."),
    ],
    "warm": [
        ("agent", "Hindi",    "नमस्ते, मैं Rupeezy की प्रिया बोल रही हूँ। AP partner program ke baare mein..."),
        ("user",  "Hindi",    "हाँ, सुना है।"),
        ("agent", "Hinglish", "Aap currently kaunse broker ke saath hain?"),
        ("user",  "Hindi",    "Angel One के साथ हूँ।"),
        ("agent", "Hinglish", "Hum 50-60% lifetime payout offer kar rahe hain. Aapko kya important hai — payout ya support?"),
        ("user",  "Hindi",    "अभी busy हूँ, बाद में call करना."),
        ("agent", "Hinglish", "Theek hai, main aapko shaam ko 5 baje WhatsApp pe details bhej dungi."),
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
    "hot":  "Engaged partner currently with competitor for 3+ years. Asked about commission and platform support. Open to receiving details. Strong fit for AP program — recommend RM follow-up within 24h.",
    "hot_tamil": "Tamil-speaking partner, 4 years with current broker. Specifically asked about F&O dedicated support — pitched our F&O desk. Ready for WhatsApp follow-up.",
    "warm": "Lead picked up but busy. Engaged briefly on commission — competitor is Angel One. Requested callback after 5 PM. Worth a follow-up.",
    "cold": "Lead requested email/WhatsApp follow-up only. No real interest expressed on call. Send brochure, no immediate RM action.",
}

# -------- Daily volume curve ------------------------------------------------

def daily_volume(days_ago: int, total_days: int = 14) -> int:
    """Return how many calls to attempt for a given day-ago bucket.

    Models a realistic ramp: gradual growth across 14 days plus a weekend dip
    (Sat/Sun ~30% of weekday volume). Today gets the highest count so the
    chart shows a clear upward trend. Returns 7-16 for weekdays, 2-5 for
    weekend days, weighted toward more recent days.
    """
    # day index 0 = today, 13 = oldest
    growth = (total_days - days_ago) / total_days  # 0..1, increases toward today
    base   = 6 + growth * 9  # 6 to 15

    # Compute weekday: today's weekday minus days_ago, mod 7
    today = datetime.now(tz=timezone.utc)
    that_day = today - timedelta(days=days_ago)
    is_weekend = that_day.weekday() >= 5

    if is_weekend:
        base *= 0.3

    # Add a little jitter
    n = max(1, int(round(base + random.uniform(-1.5, 1.5))))
    return n

# -------- Helpers -----------------------------------------------------------

def rand_phone() -> str:
    return "+91" + "".join(str(random.randint(0, 9)) for _ in range(10))

def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()

def random_business_time(day_ref: datetime) -> datetime:
    """Return a timestamp on `day_ref`'s date, biased toward business hours."""
    # 70% during 10am–7pm, 25% during 7am–10am or 7pm–10pm, 5% other
    r = random.random()
    if r < 0.7:
        hour = random.randint(10, 18)
    elif r < 0.95:
        hour = random.choice([7, 8, 9, 19, 20, 21])
    else:
        hour = random.randint(0, 23)
    minute = random.randint(0, 59)
    return day_ref.replace(hour=hour, minute=minute, second=random.randint(0, 59), microsecond=0)

# -------- Main --------------------------------------------------------------

def run() -> None:
    print(f"Seeding demo data into {db.DB_PATH} …")
    db._ensure_init()

    now = datetime.now(tz=timezone.utc)
    leads: list[tuple[str, str, str, str | None]] = []  # (id, name, phone, lang)

    # ---- 120 leads spread across the 14 days, with growth ----
    # Most recent days have more lead arrivals.
    n_leads = 120
    weights = [(14 - d) ** 1.3 for d in range(14)]
    total_w = sum(weights)

    for i in range(n_leads):
        first = random.choice(FIRST_NAMES)
        last  = random.choice(LAST_NAMES)
        name  = f"{first} {last}"
        phone = rand_phone()
        lang  = random.choices(LANGUAGES, weights=LANG_WEIGHTS, k=1)[0]
        notes = random.choice(NOTES_POOL)
        voice = random.choice(VOICE_IDS) if random.random() < 0.7 else None

        # Pick a day with weighted prob (recent biased)
        days_ago = random.choices(range(14), weights=weights, k=1)[0]
        day_dt = now - timedelta(days=days_ago)
        created = random_business_time(day_dt)

        # 85% of leads get called; the rest stay queued
        status = "done" if random.random() < 0.85 else "queued"

        lid = db.new_id("lead")
        with db.with_conn() as c:
            c.execute(
                "INSERT INTO leads(id,name,phone,language_pref,voice_id,notes,"
                "status,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?)",
                (lid, name, phone, lang, voice, notes, status,
                 iso(created), iso(created)),
            )
        leads.append((lid, name, phone, lang))

    # ---- Calls per day driven by daily_volume() ----
    OUTCOMES = [
        ("hot",            30),
        ("warm",           34),
        ("cold",           18),
        ("dropped_early",   7),
        ("no_answer",       6),
        ("busy",            3),
        ("failed",          2),
    ]
    outcome_choices = [o for o, _ in OUTCOMES]
    outcome_weights = [w for _, w in OUTCOMES]

    transcripts_remaining = 28  # seed full transcripts for first 28 calls
    total_calls = 0

    for days_ago in range(13, -1, -1):  # oldest day first → today
        day_dt = now - timedelta(days=days_ago)
        n = daily_volume(days_ago)

        for _ in range(n):
            lead_id, lead_name, lead_phone, lead_lang = random.choice(leads)
            outcome = random.choices(outcome_choices, weights=outcome_weights, k=1)[0]

            call_created = random_business_time(day_dt)
            call_started = call_created + timedelta(seconds=random.randint(2, 30))

            cid = db.new_id("call")
            twilio_sid = "CA" + uuid.uuid4().hex[:30]

            if outcome in ("hot", "warm"):
                duration = random.randint(75, 240)
            elif outcome == "cold":
                duration = random.randint(20, 70)
            else:
                duration = random.randint(2, 12)

            ended_at = call_started + timedelta(seconds=duration)

            if outcome == "hot":
                # Tamil-speaking subset
                use_tamil = lead_lang == "Tamil" and random.random() < 0.5
                summary_key = "hot_tamil" if use_tamil else "hot"
                status, score, summary = "completed", "HOT",  SUMMARIES[summary_key]
                script_key = summary_key
            elif outcome == "warm":
                status, score, summary = "completed", "WARM", SUMMARIES["warm"]
                script_key = "warm"
            elif outcome == "cold":
                status, score, summary = "completed", "COLD", SUMMARIES["cold"]
                script_key = "cold"
            elif outcome == "dropped_early":
                status, score, summary = "completed", None,   None
                script_key = "dropped_early"
            elif outcome == "no_answer":
                status, score, summary = "no-answer", None,  None
                script_key = None
            elif outcome == "busy":
                status, score, summary = "failed",    None,  None
                script_key = None
            else:
                status, score, summary = "failed",    None,  None
                script_key = None

            with db.with_conn() as c:
                c.execute(
                    "INSERT INTO calls(id,lead_id,twilio_sid,status,score,summary,"
                    "duration_seconds,started_at,ended_at,created_at) "
                    "VALUES (?,?,?,?,?,?,?,?,?,?)",
                    (cid, lead_id, twilio_sid, status, score, summary,
                     duration, iso(call_started), iso(ended_at), iso(call_created)),
                )

            # ---- stage events ----
            if outcome in ("hot", "warm", "cold"):
                path = ["queued","dialing","ringing","picked","agent_spoke","user_spoke","completed"]
            elif outcome == "dropped_early":
                path = ["queued","dialing","ringing","picked","dropped_early"]
            elif outcome == "no_answer":
                path = ["queued","dialing","ringing","no_answer"]
            elif outcome == "busy":
                path = ["queued","dialing","busy"]
            else:
                path = ["queued","dialing","failed"]

            per_step = max(1, duration // max(1, len(path)))
            for step_idx, stage in enumerate(path):
                ts = call_created + timedelta(seconds=step_idx * per_step + random.randint(0, 2))
                with db.with_conn() as c:
                    c.execute(
                        "INSERT INTO call_events(call_id,stage,detail,ts) VALUES (?,?,?,?)",
                        (cid, stage, None, iso(ts)),
                    )

            # ---- transcripts ----
            if transcripts_remaining > 0 and script_key in CALL_SCRIPTS:
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

            total_calls += 1

    # ---- summary ----
    with db.with_conn() as c:
        leads_n = c.execute("SELECT COUNT(*) FROM leads").fetchone()[0]
        calls_n = c.execute("SELECT COUNT(*) FROM calls").fetchone()[0]
        hot     = c.execute("SELECT COUNT(*) FROM calls WHERE score='HOT'").fetchone()[0]
        warm    = c.execute("SELECT COUNT(*) FROM calls WHERE score='WARM'").fetchone()[0]
        cold    = c.execute("SELECT COUNT(*) FROM calls WHERE score='COLD'").fetchone()[0]
        events  = c.execute("SELECT COUNT(*) FROM call_events").fetchone()[0]
        turns   = c.execute("SELECT COUNT(*) FROM transcripts").fetchone()[0]

        # Daily breakdown for sanity check
        rows = c.execute(
            """SELECT substr(created_at,1,10) AS day, COUNT(*) AS n
               FROM calls
               GROUP BY day ORDER BY day ASC"""
        ).fetchall()

    print(f"  leads:       {leads_n}")
    print(f"  calls:       {calls_n}  (HOT {hot} · WARM {warm} · COLD {cold})")
    print(f"  events:      {events}")
    print(f"  transcripts: {turns}")
    print()
    print("  Daily call volume:")
    for r in rows:
        bar = "▇" * min(40, r[1])
        print(f"    {r[0]}  {r[1]:>3}  {bar}")
    print("Done.")


if __name__ == "__main__":
    run()
