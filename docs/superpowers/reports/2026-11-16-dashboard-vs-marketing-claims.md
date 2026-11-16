# Dashboard vs marketing: claims and price mismatches

Date: 16 Nov 2026. Report only. No prices or claims were changed.

## Plan names, prices and limits

| Item | Public site (`src/lib/marketing-content.ts`) | Dashboard | Mismatch |
|---|---|---|---|
| Entry plan name | Essential | Sidebar badge says "Starter" (`dashboard-nav.ts` PLAN_LABEL); Billing says "Essential" | Name differs inside the dashboard itself |
| Essential price | AED 149 / month | Billing fallback list: $39 / month ($390 / year) | Currency and amount |
| Professional price | AED 549 / month | Billing fallback list: $149 / month ($1,490 / year) | Currency and amount |
| Essential minutes | 250 min, AED 0.75/min overage | 250 min/mo | Matches (overage not shown) |
| Professional minutes | 750 min, AED 0.55/min overage | 750 min/mo | Matches (overage not shown) |
| Languages | Arabic + English | Essential fallback card says "EN + ES" | Wrong language (Spanish) |
| Phone numbers | Essential: one; Professional: 3 | 1 and 3 | Matches |
| Stale draft | `design-preview` pages say "$39/month" | n/a | Old reverted draft, not live |

Note: the Billing page builds its plan cards from the gateway when it loads and uses the hard-coded list above only as a fallback. The $149 seen live earlier suggests either the gateway returns USD amounts or the fallback was shown. This needs a look at what the gateway/Stripe actually return before any edit.

## Marketing claims against dashboard

| Claim | Where the dashboard shows it | Status |
|---|---|---|
| Answers every call 24/7 | Overview call counts, Calls list | Shown as numbers; no "always answering" status |
| Books appointments | Calendar page, appointment counts | Shown |
| Captures leads | Leads page, Overview | Shown |
| Routes emergencies | Agent settings page mentions emergency | Setting exists; no emergency-routing status on Overview |
| Blocks spam, never billed for it | Settings > Spam page, spam filter in Calls | Shown |
| Bilingual Arabic + English | Language options in Agent settings, Arabic dashboard | Shown |
| Setup in 5 to 15 minutes | Onboarding wizard | Shown during signup; no progress card afterwards |
| Custom AI voice (Professional) | Agent page | Not verified in this pass |

## Decisions needed from you and Hk

1. Which price list is right for the receptionist: AED 149 / AED 549 (public) or $39 / $149 (Billing fallback)?
2. Entry plan name: "Essential" or "Starter" (the dashboard uses both)?
3. Should Overview get an "always answering / emergency routing on" status strip, and a setup progress card? (Data for these needs checking first.)

Nothing is edited until these are answered.
