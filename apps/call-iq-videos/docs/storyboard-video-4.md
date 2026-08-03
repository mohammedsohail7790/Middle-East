# Storyboard — Video 4: Phone Number Setup

**Composition ID:** `PhoneNumberSetup`  
**Goal:** Show how to purchase local/toll-free numbers, assign them to AI agents, configure routing rules, and validate with test calls.  
**Target audience:** Office admins and IT setup during initial deployment or expansion.  
**Demo tenant:** Northline Home Services (Denver)  
**Length:** 4:00 (7,200 frames @ 30 fps)  
**Scenes:** 4

---

## Scene-by-Scene Breakdown

| Scene # | Title | Duration | Dashboard Route | Screen Recording Plan | Camera Movement | Animation | Voiceover (full script) | Captions (burned-in) |
|---------|-------|----------|-----------------|----------------------|-----------------|-----------|-------------------------|----------------------|
| 1 | Buy a Number | 59s | `/dashboard/phone-numbers` | **Live:** Phone Numbers page → search area code 720 → show Denver results. Also preview 303 (Boulder) and 800 toll-free available. **Remotion:** `PhoneSetupScreen` number list. | Pan across available numbers table; hover first 720 number | Rows slide in from right; area code filter chip highlight | Search Denver area code 720 or Boulder 303. Purchase a local number in minutes — no carrier contracts or porting delays. | **Buy a number** · Denver 720 · Boulder 303 · Toll-free 800 |
| 2 | Assign to Agent | 59s | `/dashboard/phone-numbers` | **Live:** Assign +1 (720) 555-0188 → Main Receptionist (Sarah). Assign +1 (720) 555-0199 → Sales Agent (Alex). Show Assigned badges. | Split view: number left, agent dropdown right | Assignment dropdown expand; green Assigned pill animate | Assign +1 (720) 555-0188 to Main Receptionist and +1 (720) 555-0199 to Sales Agent. Each number loads its agent's knowledge base and personality. | **+1 (720) 555-0188 → Sarah** · **+1 (720) 555-0199 → Alex** |
| 3 | Routing Rules | 59s | `/dashboard/phone-numbers` (routing) | **Live:** Configure 4 rules: (1) Business hours → AI Sarah, (2) After hours → AI + emergency line, (3) Manager request → transfer +1 (720) 555-0100, (4) No answer 30s → voicemail + SMS alert. | Vertical scroll through routing rule cards | Rule cards stack in with 15-frame stagger; condition→action arrows draw | Configure business-hours routing to AI, after-hours emergency dispatch, manager transfers, and voicemail fallback with SMS alerts. | **4 routing rules configured** |
| 4 | Test Calls | 59s | `/dashboard/simulator` or live test | **Live:** Test panel results — (1) Inbound AI answered 1.2s ✓, (2) Sales transfer connected ✓, (3) After-hours SMS alert ✓. **Remotion:** test results list. | Static on results summary; checkmarks appear sequentially | Pass badges scale-in green; 3/3 counter animate | Place three test calls: AI answered in 1.2 seconds, sales transfer connected, after-hours SMS alert delivered. All passed — go live. | **3 of 3 tests passed — Go live!** |

---

## Production Notes

- Shortest training video — keep pacing brisk; each scene ~59s (1,755 frames).
- For Scene 4 live test, use simulator if physical phone test unavailable; document "simulated" in metadata.
- Toll-free +1 (800) 555-0142 shown as available but unassigned — do not purchase on camera unless resetting demo.

## Key Demo Data References

| Number | Agent | Region | Source |
|--------|-------|--------|--------|
| +1 (720) 555-0188 | Main Receptionist (Sarah) | Denver | `demo-data.json` → phoneNumbers[0] |
| +1 (720) 555-0199 | Sales Agent (Alex) | Denver | `demo-data.json` → phoneNumbers[1] |
| +1 (303) 555-0147 | HVAC Receptionist (Morgan) | Boulder | Summit — reference only |
| +1 (800) 555-0142 | Available (toll-free) | Toll-Free | `demo-data.json` → phoneNumbers[3] |
| Routing rules (×4) | Business/after-hours/transfer/VM | — | `demo-data.json` → routingRules |
