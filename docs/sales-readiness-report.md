# Call IQ — Sales Readiness Report

**Generated:** 2026-06-14  
**Method:** Persona-based evaluation of live platform

---

## Persona Evaluations

### 1. Mike Chen — HVAC Company Owner (12 employees, $2.4M revenue)

**Pain:** Misses 30-40 calls/day when technicians are in the field. Each missed call = $200-600 lost job.

**Trial Journey:**
1. Visited calliqlabs.com → Clear value prop ("Never Miss a Call Again")  
2. Pricing: $39/mo Essential for 250 min → **Problem:** 12 techs generate ~600 calls/month. 250 min is too little for a real HVAC shop. Objection raised before clicking.
3. Signed up → 4-field form, no Google sign-in (now fixed) → Friction removed
4. Onboarding: "Configure AI" → Sets industry to HVAC → **Positive:** pre-built HVAC questions appear
5. Phone number setup → Unclear whether to port or buy new number → **Gap:** No "how to forward your calls" wizard during onboarding
6. Made test call → AI answered correctly, booked appointment → **Delight moment**

**Score: 7.5/10**  
**Conversion Blocker:** 250 min/month is too low for a real HVAC shop. Consider 500+ min at $39.  
**Objections:** "Will it understand HVAC terminology?" → Yes but not communicated. "What happens when it can't answer?" → Transfer mode not explained.

---

### 2. Sarah Torres — Plumbing Company Owner (6 employees, $1.1M revenue)

**Pain:** Owner answers all calls while unclogging drains. Emergency calls at 2am.

**Trial Journey:**
1. Features page → "24/7 AI receptionist" — resonates immediately
2. Pricing → $39/mo for 250 min → **Positive:** 6-person shop handles maybe 80 calls/month. Fits perfectly.
3. Setup time: claimed "15 minutes" → Actual: ~25 min with calendar connection
4. Emergency call handling → Wanted "if customer says emergency, call me immediately" → Found it in automation rules but not obvious during onboarding → **Gap**
5. Call transcripts → "I can see exactly what was said" → **Delight**

**Score: 8/10**  
**Conversion Blocker:** ROI is unclear until first call is handled. Free trial starts before first call — no guaranteed "aha moment."  
**Quick Fix:** Add "Make a test call right now" button during onboarding.

---

### 3. Dave Martinez — Roofing Contractor (18 employees, $3.8M revenue)

**Pain:** Storm season creates 200-call days. Current answering service costs $800/month.

**Competitive win:** At $149/mo (Professional), saves $650/month vs answering service.

**Journey:**
1. Pricing → ROI Calculator → "I pay $800/month now, you save me $651 at Professional" → **Immediate conversion signal**
2. CRM integration → HubSpot → found in integrations menu → Worked (via Zapier)
3. Lead scoring → Wants to know if caller is a "storm damage" lead vs. "maintenance" → Current: lead score 1-10 but scoring logic unclear
4. Analytics → Basic metrics present → **Gap:** No "lead source" breakdown. Roofers want to know which calls came from storm-damage campaigns vs Google vs referrals.

**Score: 7/10**  
**Conversion Blocker:** Advanced analytics promised on Enterprise but not clearly described. "5 languages" on Enterprise is confusing — does that mean my AI speaks 5 languages per call or I configure one?

---

### 4. Tom Bradley — Electrical Contractor (9 employees, $2.2M revenue)

**Pain:** NFPA/code questions during calls. Wants AI to know electrical service types.

**Journey:**
1. Knowledge base upload → Uploaded service menu PDF → **Positive:** Ingestion worked
2. AI test call → Asked about "200A panel upgrade" → AI gave correct answer from uploaded doc → **Delight**
3. Business hours → Set up after-hours transfer to emergency line → Worked
4. **Missing:** Wants AI to detect "emergency" (no power, sparks) and immediately transfer → Found in automation but hard to find

**Score: 8/10**  
**Conversion Blocker:** No mention of "emergency escalation" in onboarding. Contractors need this prominently featured.

---

### 5. Jennifer Liu — Healthcare Office Manager (Orthopedics practice, 4 physicians)

**Critical requirement:** HIPAA compliance. Will not sign without BAA.

**Journey:**
1. Pricing → Enterprise plan → "HIPAA BAA" listed as feature → **Positive**
2. Security page → [Now has BAA signing flow] → **Previously missing, now built**
3. BAA signing → New modal flow → Signed agreement → Downloaded PDF link → **Works**
4. HIPAA restrictions → AI must not repeat PHI in voicemail → Setting not visible → **Gap:** No HIPAA mode configuration UI showing what's restricted
5. Call recording → HIPAA requires specific consent → Warning not shown → **Gap**

**Score: 6/10** (up from 3/10 before BAA UI was built)  
**Conversion Blocker:** No HIPAA consent language before recording calls. Healthcare buyers will ask about call recording consent and data residency.

---

### 6. Alex Kim — Enterprise Buyer (IT Director, Regional Property Management, 50 locations)

**Requirements:** SSO, SCIM, audit logs, SLA guarantee, dedicated support, IP restrictions.

**Journey:**
1. Enterprise pricing → "Contact Sales" → Correct flow for this buyer
2. SSO → SSO page exists → Basic settings visible → **Gap:** No SAML configuration UI
3. SCIM → Configured via env var → No UI → **Gap** for enterprise buyers who expect admin UI
4. SLA dashboard → [Now built] → Shows uptime history and credits → **Positive**
5. Audit logs → Full audit trail visible → **Positive**
6. IP allowlist → Works → **Positive**
7. API access → API keys exist → Documentation missing → **Gap:** No public API docs

**Score: 5.5/10**  
**Conversion Blocker:** No API documentation, no SAML UI, no data residency options, no dedicated tenant (shared infrastructure).

---

## Top Conversion Blockers

| # | Blocker | Persona | Impact | Fix Complexity |
|---|---------|---------|--------|---------------|
| 1 | Essential plan 250 min too low for many SMBs | HVAC, Roofing | High | Low (pricing change) |
| 2 | No "emergency escalation" feature during onboarding | Electrical, Plumbing | High | Medium (onboarding step) |
| 3 | Call recording HIPAA consent not shown | Healthcare | High | Low (add disclosure) |
| 4 | No public API documentation | Enterprise | High | High (write docs) |
| 5 | Lead source tracking missing | Roofing | Medium | Medium (analytics update) |
| 6 | ROI not shown during onboarding | Plumbing | Medium | Low (add ROI widget) |
| 7 | SAML SSO no UI | Enterprise | High | High |
| 8 | No data residency options | Enterprise/Healthcare | High | Very High |

---

## Quick Win Recommendations (Implement This Week)

### 1. Increase Essential plan to 400 minutes
- Current: 250 min ($39)
- Recommended: 400 min ($39) 
- Rationale: Average SMB shop has 150-200 inbound calls/month × 2 min avg = 300-400 min. 250 is too tight and leads to first-month overage frustration.

### 2. Add "Emergency Escalation" card to onboarding
- During onboarding step 2 (Configure AI), add a card: "Emergency calls? Set a phone number to receive instant transfer for urgent situations"
- Maps to existing `callHandlingMode: 'transfer'` + automation rules

### 3. Add call recording consent disclosure
- In AI configuration: "Call Recording" toggle with tooltip: "Calls may be recorded for quality and training. In healthcare settings, verbal consent is required per HIPAA."
- Low code change in `settings/page.tsx`

### 4. Add ROI widget to onboarding completion screen
- "At your call volume, Call IQ saves you approximately $X/month vs a traditional answering service"
- Use pricing page ROI calculator logic

### 5. "Make a test call" button in onboarding
- After phone number setup, show: "Your AI is live! Call [number] right now to see it in action"
- Drives immediate aha moment

---

## Competitive Position

| Feature | Call IQ | SkipCalls | SmithAI | Ruby |
|---------|---------|-----------|---------|------|
| AI voice (not just text) | ✅ | ✅ | ❌ | ❌ |
| OpenAI Realtime API | ✅ | Unknown | ❌ | ❌ |
| HIPAA BAA | ✅ | ✅ | ✅ | ✅ |
| Calendar sync | ✅ | ✅ | ✅ | ✅ |
| Custom AI persona | ✅ | Partial | ❌ | ❌ |
| Knowledge base | ✅ | Limited | ❌ | ❌ |
| Pricing (entry) | $39/mo | $39/mo | $140/mo | $235/mo |
| Bilingual | ✅ | ✅ | ❌ | ❌ |
| API access | ✅ Enterprise | ✅ | Limited | ❌ |
| Live dashboard | ✅ | ✅ | Partial | ❌ |

**Competitive advantage:** Price + AI sophistication + real-time dashboard + knowledge base upload. Priced below Ruby and SmithAI while offering equal or better AI capability.
