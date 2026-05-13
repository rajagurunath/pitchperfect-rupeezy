Theme 7
AI Voice Agent for Partner Lead Conversion    

Context

Rupeezy runs a partner program where external partners — Mutual Fund Distributors(MFDs), financial advisors, insurance agents, and finance influencers — onboard retailclients under Rupeezy's broker license as Authorized Persons (APs). The growth of thispartner network depends on converting incoming leads into active partners. RelationshipManagers (RMs) are the human layer responsible for this conversion: they call new leads,pitch the program, handle objections, qualify interest, and guide sign-ups.    

Today, only 18% of leads convert. The failure is not the product — Rupeezy's AP programoffers zero joining fee, 100% brokerage share (vs. the industry-standard 60–70%), and dailypayouts via the RISE Portal. The failure is structural, rooted in three limitations of the RMdriven process:    

Timing. Leads arriving after hours or on weekends sit untouched until the next businessday. Industry data shows that contacting a lead within 5 minutes yields 9x higherconversion than waiting 30 minutes. Most of Rupeezy's leads go cold before an RM everpicks up the phone.
Language. India has 20+ major languages. A Hindi-speaking lead who receives a formalEnglish pitch disconnects in 15 seconds. RMs typically speak 1–2 languages. The partnerprogram's addressable market extends well beyond the English-speaking population,but the RM team cannot cover it.
Capacity. One RM handles one call at a time. When a marketing campaign generateshundreds of leads overnight, the queue backs up for days. By the time the RM reacheslead #200, the lead has forgotten they expressed interest.    
These are not edge cases — they are the default mode of operation. The 82% of leads thatdo not convert are largely lost to delay, language mismatch, and queue overflow, not to aweak value proposition.    

The Problem

Build an AI voice agent that pitches Rupeezy's partner program to new leads in theirlanguage, handles the top 5 objections, qualifies interest, and hands off hot leads to a humanRM — lifting conversion from 18% toward 40%+.  

The agent must:

Run a structured sales call following the script provided in Appendix A: open with aconcise hook, pitch the key benefits (zero joining fee, 100% brokerage share, dailypayouts), handle objections, and close with a clear call to action.    
Be multilingual — Hindi, English, and Hinglish at minimum. Regional languages (Tamil,Telugu, Marathi, Gujarati, Bengali) are bonus.    
Handle the 5 core objections naturally, not robotically: "I'm already with anotherbroker," "I don't have enough contacts," "What if my clients face issues — who handlessupport?", "Is Rupeezy trustworthy?", and "I'll think about it / call me later." Eachobjection has a scripted rebuttal in Appendix A, but the agent must adapt contextuallybased on what the lead actually says.    
Qualify the lead with a scoring model based on interest level, readiness to sign up, andnetwork size. Classify each lead as Hot, Warm, or Cold.    
Hand off qualified leads to a human RM. A simulated warm transfer is acceptable, ordirect the lead to sign up with a WhatsApp fallback. The RM must receive fullconversation context — not just a name and number.    
Produce a post-call summary for every conversation: duration, topics covered,objections raised, interest score (Hot / Warm / Cold), and recommended next action.    
 

Non-Negotiables

No live telephony is required. Any of the following is acceptable: browser voice interface(Web Speech API, WebRTC), text chat simulation with a clear telephony integration path,or anything creative that demonstrates real-time, two-way, contextual conversation.    
Judges care about conversation quality, multilingual handling, qualification logic, andhandoff design — not telephony plumbing.    
The agent must use the Appendix A telecalling script and FAQ as its base knowledge. Thescript covers: opening the call, key benefits, eligibility and getting started, handling the 5objections, and closing the call.    
All code must be written during the hackathon — no pre-built solutions.    
Team size: 2–4 members.    
 

What Success Looks Like

A working solution should eventually make the following behaviours possible:    

An RM uploads a batch of leads. The AI agent contacts each one immediately — no afterhours gap, no language mismatch, no queue backlog.    
The agent opens naturally in the lead's language, pitches the AP program's key benefits(zero joining fee, 100% brokerage share, daily payouts via RISE Portal), and handlesobjections contextually — adapting its responses based on what the lead actually says,not reading from a static script.    
At the end of each call, a post-call summary appears: duration, objections raised, interestscore, and recommended next action. Hot leads are handed off to a human RM with fullconversation context. Warm leads receive a WhatsApp follow-up link. Cold leads arelogged for later nurture
A dashboard shows the conversion funnel — contacted → qualified → handed to RM —with Hot / Warm / Cold breakdowns, call summaries, and transcripts.    
Sample Scenario

To help you visualise the problem, consider a representative scenario:    Rupeezy runs a weekend social media campaign that generates 50 new partner leads. Underthe current process, these leads sit untouched until Monday morning, when an RM beginsworking through the queue one call at a time. By Wednesday, only 30 have been contacted;by then, most have gone cold.    

With the AI agent, all 50 leads are contacted within minutes of arriving. The agent opens inHindi for 32 leads, English for 12, and Hinglish for 6 — matching each lead's preferredlanguage within the first exchange. It pitches the AP program's benefits and handlesobjections for the 38 leads who engage beyond the opener. A lead says "I'm already withanother broker" and the agent responds: "That's great — you already understand thebusiness. My question is: are you getting 100% brokerage share and daily payouts? Mostbrokers cap you at 60–70% and pay monthly." The conversation continues naturally.    The agent classifies 8 leads as Hot (high interest, ready to sign up), 14 as Warm (interestedbut need follow-up), and 28 as Cold. The 8 Hot leads are handed off to the RM queue withfull conversation context — the RM sees a summary of what was discussed, whichobjections were raised and how they were resolved, and a recommended next step.WhatsApp sign-up links go out to the 14 Warm leads. Post-call summaries are generated forall 50 conversations.  

An RM reviews the dashboard Monday morning, sees the funnel, picks up the 8 Hot leadswith full context, and closes 5 sign-ups before noon — a result that would have taken 3 daysof manual calling under the old process.

What Your Solution Should Cover

Round 1 of this hackathon is a written solution submission. Your solution document shouldmake clear how you would build this agent. At minimum, it should cover:    

Your understanding of the problem and the structural failures in RM-driven lead conversion, in your own words.    
Your approach to multilingual conversation — how the agent detects languagepreference, switches mid-conversation if needed, and handles code-mixing (Hinglishand regional variants).    
Your approach to objection handling — how the agent responds naturally to each of the5 core objections without sounding scripted, and how it adapts its pitch based on whatthe lead has said earlier in the conversation.
Your lead qualification model — what signals the agent uses to score interest (verbalcues, engagement duration, objection patterns, stated intent), and how the Hot / Warm /Cold thresholds are calibrated. Also, remember context across calls to the same lead-Multi-turn memory.
Your handoff design — how context is transferred to a human RM, what the RM seeswhen they pick up a qualified lead, and how the WhatsApp fallback works for Warmleads. Also WhatsApp follow-up — auto-send sign-up link after the call to the EndCustomer.    
A clear architecture overview covering the voice/text interface, LLM layer, conversationmanagement, knowledge base (Appendix A ingestion), and analytics pipeline.    
The key technology and model choices you would make (LLM, STT/TTS, backend,frontend), and the reasons behind them.    
The main risks and trade-offs you see, and how you would handle them.    
A rough implementation plan for Round 2, assuming Appendix A and sample lead dataare provided.   