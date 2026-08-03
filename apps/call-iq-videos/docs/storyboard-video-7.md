# Storyboard — Video 7: CRM & Integrations

**Composition ID:** `CRMIntegrations`  
**Goal:** Show how Call IQ connects to CRMs, calendars, and custom systems — covering HubSpot, Salesforce, Zoho, Google Calendar, Outlook, and webhooks.  
**Target audience:** Sales ops, CRM admins, and integration-minded business owners.  
**Demo tenant:** Northline Home Services (Denver)  
**Length:** 6:00 (10,800 frames @ 30 fps)  
**Scenes:** 6

---

## Scene-by-Scene Breakdown

| Scene # | Title | Duration | Dashboard Route | Screen Recording Plan | Camera Movement | Animation | Voiceover (full script) | Captions (burned-in) |
|---------|-------|----------|-----------------|----------------------|-----------------|-----------|-------------------------|----------------------|
| 1 | HubSpot | 59s | `/dashboard/integrations` | **Live:** Integrations grid — HubSpot tile Connected (green). Click into detail: 412 contacts synced this month. Activity log: Maria Gonzalez created, David Chen call logged with transcript. **Remotion:** `IntegrationsScreen` HubSpot highlighted. | Focus on HubSpot tile → expand connection detail drawer | HubSpot orange logo pulse; sync counter 0→412 | Connect HubSpot — 412 contacts synced this month. Maria Gonzalez created automatically; David Chen's call logged with transcript. | **HubSpot connected · 412 contacts synced** |
| 2 | Salesforce | 59s | `/dashboard/integrations` | **Live:** Salesforce tile — show field mapping: Call IQ Lead → Contact, Transcript → Activity, Lead Score → Custom Field, Service Type → Custom Field. Connect flow or connected state. | Pan from HubSpot to Salesforce tile; open mapping modal | Field mapping lines draw between columns; Salesforce blue accent | Salesforce maps Call IQ leads to Contacts and Opportunities with custom fields for transcript, lead score, and service type. | **Salesforce — custom field mapping** |
| 3 | Zoho | 59s | `/dashboard/integrations` | **Live:** Zoho CRM tile connected. Example lead: James Okonkwo maintenance plan inquiry synced from inbound call. | Static on Zoho tile; lead card popover | Zoho red badge slide-in; lead card flip reveal | Zoho CRM syncs SMB leads like James Okonkwo's maintenance plan inquiry — ideal for teams already on Zoho One. | **Zoho CRM — SMB lead sync** |
| 4 | Google Calendar | 59s | `/dashboard/integrations` + `/dashboard/calendar` | **Live:** Google Calendar connected. Show live events: David's 3:30 PM AC diagnostic, Maria's 2:30 PM plumbing — both created during calls. | Split: integration tile + calendar with today's events | Google Calendar multicolor icon spin; events pop onto grid | Google Calendar sync creates events in real time — David's 3:30 PM diagnostic and Maria's 2:30 PM plumbing visit booked during calls. | **Google Calendar — real-time booking** |
| 5 | Outlook | 59s | `/dashboard/integrations` | **Live:** Microsoft Outlook tile — connected for commercial dispatch scheduling. Show availability check during commercial job booking. | Outlook blue tile highlight; calendar peek overlay | Outlook icon connect animation; availability slot highlight | Microsoft Outlook integration checks dispatch calendar availability for commercial jobs and team scheduling. | **Outlook — commercial dispatch scheduling** |
| 6 | Webhooks | 59s | `/dashboard/integrations` (webhooks) | **Live:** Webhooks section — 2 active endpoints: (1) ServiceTitan job creation, (2) Slack #dispatch-alerts. Delivery log: 1,847 events this month, 3 failures (99.8% success). **Remotion:** full integration grid + lower third. | Pull back to show full integration ecosystem | Webhook endpoint cards stack; delivery counter animate; Slack/ServiceTitan logos | Two active webhook endpoints — ServiceTitan job creation and Slack #dispatch-alerts — delivered 1,847 events this month with 3 failures. | **2 webhooks · 1,847 deliveries · 99.8% success** |

---

## Production Notes

- Each scene ~59s (1,774 frames) — consistent with Video 4 pacing.
- HubSpot should show Connected state before recording; other CRMs can show Connect or Connected depending on demo seed.
- James Okonkwo lead referenced in Scene 3 — verify in `sample-leads.json` or `sample-crm-records.json`.
- Scene 6 lower third: "Webhooks · 2 Active Endpoints · 1,847 deliveries"

## Key Demo Data References

| Integration | Status / metric | Source |
|-------------|-----------------|--------|
| HubSpot | 412 contacts synced | `sample-crm-records.json` |
| Maria Gonzalez | Auto-created contact | `sample-leads.json` → lead_001 |
| David Chen | Call logged w/ transcript | `sample-leads.json` → lead_002 |
| James Okonkwo | Zoho maintenance lead | `sample-leads.json` |
| Webhooks | ServiceTitan + Slack, 1,847 events | `sample-crm-records.json` |
| Appointments | Maria 2:30 PM, David 3:30 PM | `sample-appointments.json` |

## Integration Grid Component

Remotion renders via `IntegrationsScreen` + `IntegrationGrid.tsx`. Live recordings should match tile layout in `apps/dashboard/src/app/dashboard/integrations/page.tsx`.
