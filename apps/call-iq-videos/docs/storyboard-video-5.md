# Storyboard — Video 5: Call Flow Builder

**Composition ID:** `CallFlowBuilder`  
**Goal:** Demonstrate end-to-end call automation — from inbound call through qualification, booking, CRM sync, SMS confirmation, and calendar creation with zero manual steps.  
**Target audience:** Dispatch managers and operations leads optimizing post-call workflows.  
**Demo tenant:** Northline Home Services — Maria Gonzalez kitchen leak scenario  
**Inbound line:** +1 (720) 555-0188  
**Length:** 12:00 (21,600 frames @ 30 fps)  
**Scenes:** 6

---

## Scene-by-Scene Breakdown

| Scene # | Title | Duration | Dashboard Route | Screen Recording Plan | Camera Movement | Animation | Voiceover (full script) | Captions (burned-in) |
|---------|-------|----------|-----------------|----------------------|-----------------|-----------|-------------------------|----------------------|
| 1 | Lead Qualification | 2:00 | `/dashboard/automation` | **Live:** Automation canvas — Lead Qualification node highlighted. **Side panel:** Maria Gonzalez call transcript snippet (kitchen leak, Tennyson St). **Remotion:** `WorkflowScreen` node 1 active. | Start wide on canvas; zoom to Qualification node | Node pulse glow; transcript text fade-in beside canvas | Maria calls about a kitchen leak. Sarah qualifies urgency, captures her address on Tennyson Street, and tags the lead as emergency plumbing. | **Lead Qualification** · Maria Gonzalez · Emergency plumbing |
| 2 | Appointment Booking | 2:00 | `/dashboard/calendar` | **Live:** Calendar availability check → book 2:30 PM today, assign Carlos V. **Remotion:** Workflow nodes 1–2, node 2 active. | Pan from automation canvas to calendar booking modal | Calendar slot highlight; arrow animate node 1→2 | Sarah checks Carlos's availability and books Maria for 2:30 PM today — no hold music, no callback queue. | **Booked 2:30 PM today** · Tech: Carlos V. |
| 3 | CRM Update | 2:00 | `/dashboard/integrations` + `/dashboard/leads` | **Live:** HubSpot sync log — contact Maria Gonzalez created, transcript logged, deal stage Appointment Scheduled. **Remotion:** nodes 1–3, node 3 active. | Split: HubSpot activity feed + leads kanban card move | HubSpot logo connect pulse; kanban card slide to Appointment column | HubSpot creates Maria Gonzalez as a contact, logs the full transcript, and sets deal stage to Appointment Scheduled. | **HubSpot synced** · Deal: Appointment Scheduled |
| 4 | SMS Confirmation | 2:00 | `/dashboard/sms` | **Live:** Outbound SMS thread: "Northline Home Services — plumbing visit confirmed today 2:30 PM. Tech: Carlos V. Reply RESCHEDULE to change." **Remotion:** nodes 1–4, node 4 active. | Mobile-style SMS bubble center frame | Message bubble slide-up; delivery checkmark | Maria receives an SMS: Northline Home Services — plumbing visit confirmed today 2:30 PM. Tech: Carlos V. Reply RESCHEDULE to change. | **SMS confirmation sent** |
| 5 | Calendar Event | 2:00 | `/dashboard/calendar` | **Live:** Google Calendar event on dispatch calendar — address, service type, HubSpot link. **Remotion:** all 5 nodes visible, node 5 active. | Calendar week view → day view → event detail popover | Event block materialize on grid; link icon to HubSpot | A Google Calendar event appears on dispatch's calendar with address, service type, and linked HubSpot contact. | **Calendar event created** · Linked to HubSpot |
| 6 | Full Workflow | 2:00 | `/dashboard/automation` | **Live:** Full 5-node workflow visible — Qualify → Book → CRM → SMS → Calendar. All nodes connected. **Remotion:** full `WorkflowScreen` with all nodes lit. | Slow pull-back revealing complete automation graph | All nodes illuminate sequentially 1→5; "0 manual steps" badge fade-in | Five automated steps — qualify, book, sync CRM, confirm via SMS, create calendar event — zero manual data entry from call to dispatch. | **End-to-end automation** · 0 manual steps |

---

## Production Notes

- Longest scene duration in series (~2:00 / 3,574 frames each) — use for detailed canvas interactions.
- Maria Gonzalez lead must exist in demo tenant before recording (`sample-leads.json` → lead_001).
- Workflow canvas component: `src/training/WorkflowCanvas.tsx` — node positions defined in composition.
- Optional B-roll: actual call recording audio (redacted) under Scene 1 qualification.

## Key Demo Data References

| Entity | Detail | Source |
|--------|--------|--------|
| Caller | Maria Gonzalez, kitchen leak | `sample-leads.json` → lead_001 |
| Address | Tennyson Street, Denver | Lead notes |
| Appointment | Today 2:30 PM, Carlos V. | `sample-appointments.json` |
| Inbound number | +1 (720) 555-0188 | `demo-data.json` |
| CRM | HubSpot contact + deal stage | `sample-crm-records.json` |
