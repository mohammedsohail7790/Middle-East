# Dashboard vs marketing: claims and price mismatches

Date: 16 Nov 2026. Report only. No prices or claims were changed.

## Plan names, prices and limits

**Correction (16 Nov 2026, evening).** The first version of this report said the public site prices the receptionist in AED (149 / 549). That was wrong: those figures sit in `src/lib/marketing-content.ts`, which is not what the live pricing page shows. The live pricing copy (`public/marketing-body.html`) says **$39 / $149 / $499 per month**, the same as Billing. So the dashboard and the public page agree on price.

| Item | Live public pricing page | Dashboard | Status |
|---|---|---|---|
| Essential / Professional / Enterprise price | $39 / $149 / $499 per month | Billing: $39 / $149 (Enterprise not on sale) | Matches |
| Minutes | 250 / 750 / 4,000, overage $0.20 / $0.15 / $0.10 | 250 and 750 min/mo | Matches |
| Entry plan name | Essential | Sidebar badge says "Starter" (`dashboard-nav.ts`); Billing says "Essential" | Mismatch inside the dashboard |
| Languages | 7 languages | Essential fallback card says "EN + ES" | Mismatch |
| SEO description | Pricing page and home page meta descriptions say "from AED 150 a month" (`marketing-metadata.ts`) | n/a | Mismatch with the $ prices on the page |
| Stale content | `marketing-content.ts` still holds AED 149 / 549; design-preview pages say "$39/month" | n/a | Not shown on the live page; worth cleaning up |

Enterprise (changed 16 Nov 2026 on Hk's instruction): now "Everything in Professional, plus increased minutes". The 99.9% uptime SLA, dedicated account manager, analytics, 20+ numbers, custom API and data residency claims were removed. UAE hosting is answered in the FAQ ("possible on request").

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

1. Entry plan name: "Essential" or "Starter" (the dashboard uses both)?
2. Fix the SEO descriptions that say "from AED 150 a month" so they match the $ prices?
3. Should Overview get an "always answering / emergency routing on" status strip, and a setup progress card? (Data for these needs checking first.)
