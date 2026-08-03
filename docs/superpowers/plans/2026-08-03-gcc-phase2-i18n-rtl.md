# GCC Phase 2: i18n/RTL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** URL-based locale routing (`/dashboard` English, `/ar/dashboard` Arabic) for the dashboard product surface, with correct RTL layout, an Arabic-capable font, and every internal dashboard link/redirect locale-aware — without changing any marketing/auth URL or translating marketing content.

**Architecture:** Two independently-rooted Next.js layout trees (`app/(marketing)/**` keeps English-only `<html lang="en">`; new `app/[locale]/**` gets dynamic `<html lang dir>`), connected by next-intl's routing/middleware/navigation APIs. Marketing/auth pages relocate structurally (route group, URL-neutral); dashboard pages relocate into `[locale]`; every dashboard-only file importing `next/link` or locale-relevant `next/navigation` hooks swaps to next-intl's drop-in replacements.

**Tech Stack:** next-intl ^3.x (App Router), Next.js 15 (async `params`), existing Tailwind token system + `rtl:` variant (no config changes needed), `next/font/google` for `IBM Plex Sans Arabic`.

## Global Constraints

- No database or API changes.
- Marketing/auth URLs (`/about`, `/login`, `/pricing`, etc.) are byte-identical before and after — this is a route-group relocation, not a URL change.
- English dashboard URLs (`/dashboard/**`) are byte-identical (`localePrefix: 'as-needed'`).
- Do NOT swap the navigation import in: `components/marketing/**`, `components/auth/AuthPageShell.tsx`, `components/onboarding/OnboardingShell.tsx`, `components/brand/CallIqLogo.tsx` (shared between dashboard and onboarding — handled via a prop, not a blanket swap), or the confirmed-dead `components/Sidebar.tsx`, `components/DashboardShell.tsx`, `components/premium/QuickActions.tsx`, top-level `components/MarketingNav.tsx` (verified zero live importers — do not touch, do not delete, out of scope).
- `npm run lint` / `npm run typecheck` must pass; additionally this plan's structural tasks are verified with `npm run build -w @call-iq/dashboard` (a full Next.js build), since routing/layout-nesting errors are Next.js-specific and won't surface from `tsc` alone.
- Cannot run the app live in this session (no gateway credentials) — verification is typecheck + lint + full build, documented as the ceiling of what's checkable here.
- The current root layout (`apps/dashboard/src/app/layout.tsx`) contains an inline `<script>` tag that sets the theme class from `localStorage` before hydration (to avoid a flash of the wrong theme). When copying this layout's content into the two new root layouts (Tasks 3 and 4), preserve that script tag byte-for-byte from the source file — don't retype it from memory.

---

### Task 1: Install next-intl and create core i18n config

**Files:**
- Modify: `apps/dashboard/package.json` (add dependency)
- Create: `apps/dashboard/src/i18n/routing.ts`
- Create: `apps/dashboard/src/i18n/navigation.ts`
- Create: `apps/dashboard/src/i18n/request.ts`
- Create: `apps/dashboard/middleware.ts`

**Interfaces:**
- Produces: `routing` (exported from `routing.ts`, consumed by `navigation.ts`, `request.ts`, and `middleware.ts`); `{Link, redirect, usePathname, useRouter, getPathname}` from `navigation.ts` (consumed by every file in Task 5); `locales`/`defaultLocale` values `['en','ar']` / `'en'` used consistently across this whole plan.

- [ ] **Step 1: Install the package**

Run: `npm install next-intl -w @call-iq/dashboard`
Expected: `apps/dashboard/package.json` gains a `"next-intl": "^3.x"` dependency, `package-lock.json` updates.

- [ ] **Step 2: Create the routing config**

```typescript
// apps/dashboard/src/i18n/routing.ts
import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ar"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});
```

- [ ] **Step 3: Create the navigation helpers**

```typescript
// apps/dashboard/src/i18n/navigation.ts
import { createNavigation } from "next-intl/navigation";
import { routing } from "./routing";

export const { Link, redirect, usePathname, useRouter, getPathname } =
  createNavigation(routing);
```

- [ ] **Step 4: Create the request config**

```typescript
// apps/dashboard/src/i18n/request.ts
import { getRequestConfig } from "next-intl/server";
import { routing } from "./routing";

export default getRequestConfig(async ({ requestLocale }) => {
  let locale = await requestLocale;
  if (!locale || !routing.locales.includes(locale as "en" | "ar")) {
    locale = routing.defaultLocale;
  }
  return {
    locale,
    messages: (await import(`../messages/${locale}.json`)).default,
  };
});
```

- [ ] **Step 5: Create the middleware**

```typescript
// apps/dashboard/middleware.ts
import createMiddleware from "next-intl/middleware";
import { routing } from "./src/i18n/routing";

export default createMiddleware(routing);

export const config = {
  matcher: ["/", "/dashboard", "/dashboard/:path*", "/ar", "/ar/:path*"],
};
```

- [ ] **Step 6: Register the request config in Next.js config**

Read `apps/dashboard/next.config.js` (or `.mjs`/`.ts`, whichever exists) first to see its current export shape, then wrap it with next-intl's plugin:

```javascript
// apps/dashboard/next.config.js (or matching extension) — add at the top:
const createNextIntlPlugin = require("next-intl/plugin");
const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

// ...find the existing `module.exports = <config>` (or `export default <config>`)
// and wrap it: module.exports = withNextIntl(<existing config object>);
```

(If the file uses ESM `export default`, use `import createNextIntlPlugin from "next-intl/plugin";` and `export default withNextIntl(<existing config>);` instead — match the file's existing module style exactly, don't mix.)

- [ ] **Step 7: Commit**

```bash
git add apps/dashboard/package.json package-lock.json apps/dashboard/src/i18n apps/dashboard/middleware.ts apps/dashboard/next.config.js
git commit -m "Add next-intl core config (routing, navigation, request, middleware)"
```

---

### Task 2: Message catalogs

**Files:**
- Create: `apps/dashboard/src/messages/en.json`
- Create: `apps/dashboard/src/messages/ar.json`

**Interfaces:**
- Produces: translation keys under `nav.*` (one per `dashboard-nav.ts` item, keyed by a slug derived from href, e.g. `nav.dashboard`, `nav.leads`, `nav.voiceAgents`, `nav.calendar`, `nav.analytics`, `nav.quality`, `nav.calls`, `nav.sms`, `nav.whatsapp`, `nav.webChat`, `nav.instagram`, `nav.facebook`, `nav.crmPipeline`, `nav.crmContacts`, `nav.crmCompanies`, `nav.crmDeals`, `nav.integrations`, `nav.automations`, `nav.knowledgeBase`, `nav.phoneNumbers`, `nav.compliance`, `nav.billing`, `nav.spamProtection`, `nav.support`) and `nav.*Subtitle` for each item's subtitle; `shell.*` for common chrome strings (`shell.loading`, `shell.retry`, `shell.couldNotLoad`, `shell.tryAgain`). Consumed by Task 6.

- [ ] **Step 1: Write `en.json`**

```json
{
  "nav": {
    "dashboard": "Dashboard",
    "dashboardSubtitle": "Performance, volume, and recent activity",
    "leads": "Leads",
    "leadsSubtitle": "Pipeline stages and conversion",
    "voiceAgents": "Voice Agents",
    "voiceAgentsSubtitle": "Voice, tone, and routing rules",
    "calendar": "Calendar",
    "calendarSubtitle": "Appointments and availability",
    "analytics": "Analytics",
    "analyticsSubtitle": "Trends, funnels, and KPIs",
    "quality": "Quality",
    "qualitySubtitle": "Call scoring, sentiment, and lead quality",
    "calls": "Calls",
    "callsSubtitle": "Transcripts, outcomes, and call history",
    "sms": "SMS",
    "smsSubtitle": "Text conversations and templates",
    "whatsapp": "WhatsApp",
    "whatsappSubtitle": "WhatsApp Business conversations",
    "webChat": "Web Chat",
    "webChatSubtitle": "Website chat widget conversations",
    "instagram": "Instagram",
    "instagramSubtitle": "Instagram Direct conversations",
    "facebook": "Facebook",
    "facebookSubtitle": "Facebook Messenger conversations",
    "crmPipeline": "Pipeline",
    "crmPipelineSubtitle": "Deal stages and pipeline value",
    "crmContacts": "Contacts",
    "crmContactsSubtitle": "People associated with your business",
    "crmCompanies": "Companies",
    "crmCompaniesSubtitle": "Organizations you do business with",
    "crmDeals": "Deals",
    "crmDealsSubtitle": "Open and closed opportunities",
    "integrations": "Integrations",
    "integrationsSubtitle": "CRMs, calendars, and automations",
    "automations": "Automations",
    "automationsSubtitle": "Trigger-based rules and workflows",
    "knowledgeBase": "Knowledge Base",
    "knowledgeBaseSubtitle": "Company details, service area, and AI training content",
    "phoneNumbers": "Phone Numbers",
    "phoneNumbersSubtitle": "Inbound numbers and routing",
    "compliance": "Compliance",
    "complianceSubtitle": "AI disclosure, call recording, retention, and audit log",
    "billing": "Billing",
    "billingSubtitle": "Plan, usage, and invoices",
    "spamProtection": "Spam Protection",
    "spamProtectionSubtitle": "Block robocalls and unwanted callers",
    "support": "Support",
    "supportSubtitle": "Help, docs, and contact"
  },
  "shell": {
    "loading": "Loading…",
    "retry": "Try again",
    "couldNotLoad": "Could not load data",
    "language": "Language",
    "english": "English",
    "arabic": "العربية"
  }
}
```

- [ ] **Step 2: Write `ar.json`**

```json
{
  "nav": {
    "dashboard": "لوحة التحكم",
    "dashboardSubtitle": "الأداء والحجم والنشاط الأخير",
    "leads": "العملاء المحتملون",
    "leadsSubtitle": "مراحل خط الأنابيب والتحويل",
    "voiceAgents": "الوكلاء الصوتيون",
    "voiceAgentsSubtitle": "الصوت والنبرة وقواعد التوجيه",
    "calendar": "التقويم",
    "calendarSubtitle": "المواعيد والتوفر",
    "analytics": "التحليلات",
    "analyticsSubtitle": "الاتجاهات ومسارات التحويل ومؤشرات الأداء",
    "quality": "الجودة",
    "qualitySubtitle": "تقييم المكالمات وتحليل المشاعر وجودة العملاء المحتملين",
    "calls": "المكالمات",
    "callsSubtitle": "النصوص والنتائج وسجل المكالمات",
    "sms": "الرسائل النصية",
    "smsSubtitle": "محادثات نصية وقوالب",
    "whatsapp": "واتساب",
    "whatsappSubtitle": "محادثات واتساب للأعمال",
    "webChat": "الدردشة عبر الموقع",
    "webChatSubtitle": "محادثات أداة الدردشة على الموقع",
    "instagram": "إنستغرام",
    "instagramSubtitle": "محادثات إنستغرام المباشرة",
    "facebook": "فيسبوك",
    "facebookSubtitle": "محادثات فيسبوك ماسنجر",
    "crmPipeline": "خط الأنابيب",
    "crmPipelineSubtitle": "مراحل الصفقات وقيمة خط الأنابيب",
    "crmContacts": "جهات الاتصال",
    "crmContactsSubtitle": "الأشخاص المرتبطون بعملك",
    "crmCompanies": "الشركات",
    "crmCompaniesSubtitle": "المؤسسات التي تتعامل معها",
    "crmDeals": "الصفقات",
    "crmDealsSubtitle": "الفرص المفتوحة والمغلقة",
    "integrations": "التكاملات",
    "integrationsSubtitle": "أنظمة إدارة العملاء والتقويمات والأتمتة",
    "automations": "الأتمتة",
    "automationsSubtitle": "قواعد وسير عمل قائمة على المحفزات",
    "knowledgeBase": "قاعدة المعرفة",
    "knowledgeBaseSubtitle": "تفاصيل الشركة ومنطقة الخدمة ومحتوى تدريب الذكاء الاصطناعي",
    "phoneNumbers": "أرقام الهاتف",
    "phoneNumbersSubtitle": "أرقام الاتصال الواردة والتوجيه",
    "compliance": "الامتثال",
    "complianceSubtitle": "إفصاح الذكاء الاصطناعي وتسجيل المكالمات والاحتفاظ بالبيانات وسجل التدقيق",
    "billing": "الفوترة",
    "billingSubtitle": "الخطة والاستخدام والفواتير",
    "spamProtection": "الحماية من الرسائل المزعجة",
    "spamProtectionSubtitle": "حظر المكالمات الآلية والمتصلين غير المرغوب فيهم",
    "support": "الدعم",
    "supportSubtitle": "المساعدة والوثائق والتواصل"
  },
  "shell": {
    "loading": "جارٍ التحميل…",
    "retry": "أعد المحاولة",
    "couldNotLoad": "تعذر تحميل البيانات",
    "language": "اللغة",
    "english": "English",
    "arabic": "العربية"
  }
}
```

- [ ] **Step 3: Verify valid JSON**

Run: `node -e "JSON.parse(require('fs').readFileSync('apps/dashboard/src/messages/en.json','utf8')); JSON.parse(require('fs').readFileSync('apps/dashboard/src/messages/ar.json','utf8')); console.log('valid')"`
Expected: `valid`

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/messages
git commit -m "Add en/ar message catalogs for nav and shell chrome"
```

---

### Task 3: Relocate marketing/auth routes into their own root layout

**Files:**
- Move (via `git mv`, URL-neutral): `apps/dashboard/src/app/{about,ai-vs-human,alternatives,auth,blog,contact,docs,faq,features,forgot-password,forwarding,how-it-works,industries,integrations,login,onboarding,pricing,privacy,roi,security,signup,solutions,support,terms,vs-ruby,vs-smith}` → `apps/dashboard/src/app/(marketing)/<same-name>`
- Modify: `apps/dashboard/src/app/(marketing)/layout.tsx` (promote from dead passthrough to real root layout)
- Read (do not delete yet): `apps/dashboard/src/app/layout.tsx` — its content is copied into the two new root layouts; Task 4 Step 4 deletes it once both halves exist.

**Interfaces:**
- Consumes: the current `apps/dashboard/src/app/layout.tsx` content (read in Step 1, needed verbatim for Step 3).
- Produces: `apps/dashboard/src/app/(marketing)/layout.tsx` as a real root layout — the boundary Next.js's "multiple root layouts" feature requires for these pages to keep `<html lang="en">` independent of `[locale]`.

- [ ] **Step 1: Read the current root layout in full**

Read `apps/dashboard/src/app/layout.tsx` in full immediately before Step 3 (don't rely on memory of its contents from earlier in this session — re-read to catch any drift).

- [ ] **Step 2: Move the 26 route folders**

```bash
cd apps/dashboard/src/app
for d in about ai-vs-human alternatives auth blog contact docs faq features forgot-password forwarding how-it-works industries integrations login onboarding pricing privacy roi security signup solutions support terms vs-ruby vs-smith; do
  git mv "$d" "(marketing)/$d"
done
cd -
```

Expected: `git status` shows 26 renames (`R`), zero content diffs — pure moves.

- [ ] **Step 3: Promote `(marketing)/layout.tsx` to a real root layout**

Replace its content (currently just `export default function MarketingLayout({ children }: { children: React.ReactNode }) { return children; }`) with a full root layout matching the structure of the file read in Step 1: the same `metadata` export, `viewport` export, the same inline theme-init `<script>` tag (copied byte-for-byte from the source file per the Global Constraints note — don't retype it), the same `Inter` font setup, and the same `<html lang="en" suppressHydrationWarning>` / `<body>` / `<Providers>` structure — keeping `lang` hardcoded to `"en"` (no locale switching for marketing, it's English-only this phase). Update the relative CSS import from `"./globals.css"` to `"../globals.css"` since this file is now one directory deeper. Rename the default export function from `RootLayout` to `MarketingRootLayout` to avoid confusion with Task 4's new layout.

- [ ] **Step 4: Do NOT delete `app/layout.tsx` yet**

It's still required for `app/dashboard/**` until Task 4 relocates those pages. Leave it in place; Task 4 Step 4 deletes it.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/app
git commit -m "Relocate marketing/auth routes into (marketing) route group with independent root layout"
```

---

### Task 4: Relocate dashboard routes under `[locale]`

**Files:**
- Move (via `git mv`): `apps/dashboard/src/app/dashboard` → `apps/dashboard/src/app/[locale]/dashboard`
- Create: `apps/dashboard/src/app/[locale]/layout.tsx`
- Delete: `apps/dashboard/src/app/layout.tsx` (now fully superseded — Task 3 covered marketing, this covers dashboard)

**Interfaces:**
- Consumes: `routing` from `@/i18n/routing` (Task 1); `NextIntlClientProvider`/`hasLocale` from `next-intl`.
- Produces: `app/[locale]/dashboard/**` as the new home for all 30 dashboard pages — Task 5 and Task 6 operate on files at this new path.

- [ ] **Step 1: Move the dashboard directory**

```bash
cd apps/dashboard/src/app
git mv dashboard "[locale]/dashboard"
cd -
```

Expected: `git status` shows one clean directory rename covering all 38 dashboard files (30 pages + 8 supporting files), zero content diffs.

- [ ] **Step 2: Create the `[locale]` root layout**

Build `apps/dashboard/src/app/[locale]/layout.tsx` as an async server component with signature `LocaleLayout({ children, params }: { children: React.ReactNode; params: Promise<{ locale: string }> })` (Next.js 15 async params). Inside: `const { locale } = await params;`, then `if (!hasLocale(routing.locales, locale)) notFound();` (import `hasLocale` from `next-intl`, `notFound` from `next/navigation`, `routing` from `@/i18n/routing`). Compute `const dir = locale === "ar" ? "rtl" : "ltr";`.

Set up two fonts via `next/font/google`: `Inter` (subsets `["latin"]`, variable `--font-sans`, matching the existing marketing layout) and `IBM_Plex_Sans_Arabic` (subsets `["arabic"]`, weights `["400","500","600","700"]`, variable `--font-arabic`).

Include the same `metadata`/`viewport` exports and the same inline theme-init `<script>` tag as Task 3 Step 3 (copied byte-for-byte from the original `app/layout.tsx`, per the Global Constraints note).

Render: `<html lang={locale} dir={dir} suppressHydrationWarning>` containing the theme-init script in `<head>`, and a `<body>` with `className` combining both font variables plus a conditional `locale === "ar" ? "font-arabic" : "font-sans"`, wrapping `children` in `<NextIntlClientProvider>` (no explicit `locale`/`messages` props needed — it reads them from the request config context automatically) which itself wraps the existing `<Providers>` component.

Add a `generateStaticParams` export returning `routing.locales.map((locale) => ({ locale }))`.

- [ ] **Step 3: Add the `font-arabic` Tailwind utility**

In `apps/dashboard/tailwind.config.js`, inside `theme.extend.fontFamily`, add a sibling to the existing `sans`/`display` entries:

```javascript
        arabic: ["var(--font-arabic)", "var(--font-sans)", "Inter", "system-ui", "sans-serif"],
```

(Exact placement: inside the `fontFamily: { sans: [...], display: [...], }` block from the existing config, add `arabic: [...]` as a third key.)

- [ ] **Step 4: Delete the now-fully-superseded old root layout**

```bash
git rm apps/dashboard/src/app/layout.tsx
```

- [ ] **Step 5: Verify with a full Next.js build**

Run: `npm run build -w @call-iq/dashboard`
Expected: build succeeds. This is the authoritative check for the multi-root-layout restructuring — Next.js will error clearly here (not just warn) if the route-group/layout nesting is invalid, e.g. "You cannot have two parallel pages that resolve to the same path" or root-layout conflicts. If it fails, the error message names the exact conflicting route — fix before proceeding to Task 5 rather than layering more changes on a broken structure.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src/app apps/dashboard/tailwind.config.js
git commit -m "Relocate dashboard routes under [locale], add locale-aware root layout and Arabic font"
```

---

### Task 5: Swap navigation imports to locale-aware equivalents

**Files:** (all paths now under the Task 4 relocation, i.e. prefixed with `app/[locale]/dashboard/` where applicable)

`next/link` → `@/i18n/navigation` `Link` (exact same one-line transformation in each):
`app/[locale]/dashboard/analytics/error.tsx`, `app/[locale]/dashboard/analytics/page.tsx`, `app/[locale]/dashboard/billing/error.tsx`, `app/[locale]/dashboard/calls/error.tsx`, `app/[locale]/dashboard/calls/page.tsx`, `app/[locale]/dashboard/calls/[id]/page.tsx`, `app/[locale]/dashboard/compliance/page.tsx`, `app/[locale]/dashboard/error.tsx`, `app/[locale]/dashboard/integrations/page.tsx`, `app/[locale]/dashboard/leads/error.tsx`, `app/[locale]/dashboard/page.tsx`, `app/[locale]/dashboard/settings/error.tsx`, `app/[locale]/dashboard/settings/page.tsx`, `app/[locale]/dashboard/settings/spam/page.tsx`, `app/[locale]/dashboard/support/page.tsx`, `components/agent/AdditionalAgentsPanel.tsx`, `components/billing/TrialLockedOverlay.tsx`, `components/billing/TrialUsageBanner.tsx`, `components/calliq/app-shell.tsx`, `components/calliq/MobileBottomNav.tsx`, `components/dashboard/DashboardTopbar.tsx`, `components/dashboard/NotificationsCenter.tsx`, `components/GlobalSearch.tsx`.

`next/navigation` hooks → `@/i18n/navigation` (per-file, since imports differ):
`app/[locale]/dashboard/agents/page.tsx` (`redirect`), `app/[locale]/dashboard/billing/page.tsx` (`useRouter` swaps, `useSearchParams` stays on `next/navigation` — split into two import lines), `app/[locale]/dashboard/compliance/center/page.tsx` (`redirect`), `app/[locale]/dashboard/integrations/setup/page.tsx` (`useRouter` swaps, `useSearchParams` stays — split), `app/[locale]/dashboard/layout.tsx` (`useRouter, usePathname`), `app/[locale]/dashboard/leads/page.tsx` (`usePathname`), `app/[locale]/dashboard/team/page.tsx` (`redirect`), `components/assistant/DashboardAssistant.tsx` (`usePathname`), `components/calliq/app-shell.tsx` (`usePathname`), `components/calliq/MobileBottomNav.tsx` (`usePathname`), `components/dashboard/DashboardTopbar.tsx` (`usePathname`).

`app/[locale]/dashboard/calls/[id]/page.tsx` imports `useParams` from `next/navigation` — **do not touch this import**, `useParams` isn't locale-relevant and next-intl doesn't re-export it. This file needs only its `next/link` import swapped (already listed above), not its `next/navigation` import.

**Interfaces:**
- Consumes: `Link, redirect, usePathname, useRouter` from `@/i18n/navigation` (Task 1).
- Produces: nothing new — this task's output is "every dashboard-internal navigation is locale-aware," verified by Task 5 Step 5's build.

- [ ] **Step 1: Swap all `next/link` imports**

For each file in the `next/link` list above: change the line `import Link from "next/link";` (or the single-quote variant, whichever the file actually uses — check before editing) to `import { Link } from "@/i18n/navigation";`. No other changes in these files — component usage (`<Link href="...">`) stays identical since the API shape matches.

- [ ] **Step 2: Swap `next/navigation` imports (simple cases)**

For `app/[locale]/dashboard/agents/page.tsx`, `app/[locale]/dashboard/compliance/center/page.tsx`, `app/[locale]/dashboard/team/page.tsx`: change `import { redirect } from "next/navigation";` to `import { redirect } from "@/i18n/navigation";`.

For `app/[locale]/dashboard/layout.tsx`: change `import { useRouter, usePathname } from "next/navigation";` to `import { useRouter, usePathname } from "@/i18n/navigation";`.

For `app/[locale]/dashboard/leads/page.tsx`, `components/assistant/DashboardAssistant.tsx`, `components/calliq/app-shell.tsx`, `components/calliq/MobileBottomNav.tsx`, `components/dashboard/DashboardTopbar.tsx`: change `import { usePathname } from "next/navigation";` to `import { usePathname } from "@/i18n/navigation";`.

- [ ] **Step 3: Split the two mixed-import files**

For `app/[locale]/dashboard/billing/page.tsx` and `app/[locale]/dashboard/integrations/setup/page.tsx`, change:
```typescript
import { useRouter, useSearchParams } from "next/navigation";
```
to two lines:
```typescript
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
```

- [ ] **Step 4: Handle the shared `CallIqLogo` component without a blanket swap**

`components/brand/CallIqLogo.tsx` is used both by `app-shell.tsx` (now under `[locale]`, needs locale-aware links) and `OnboardingShell.tsx` (stays in `(marketing)`, needs plain links) — it cannot import `@/i18n/navigation`'s `Link` unconditionally. Add an optional prop instead.

Read the current file first, then add an optional `linkAs` prop to `CallIqLogoProps`:
```tsx
  linkAs?: typeof import("next/link").default;
```

In `CallIqLogo`'s body, where it currently renders `<Link href={href} className={cn(wrapperClass, className)}>{content}</Link>` guarded by `if (href)`, introduce `const LinkComponent = linkAs ?? Link;` and use `<LinkComponent ...>` instead of the hardcoded `<Link ...>`.

Apply the equivalent change to `CallIqMark` (add `linkAs` param, default to the module-level `Link`, use `LinkComponent` in its render). The existing `import Link from "next/link";` at the top of this file stays — it's still the default fallback.

Then, in `components/calliq/app-shell.tsx` (already being edited in Step 1 for its own `next/link` import), find every `<CallIqLogo` and `<CallIqMark` usage and add `linkAs={Link}` (referring to the `Link` now imported from `@/i18n/navigation` in that same file per Step 1).

`OnboardingShell.tsx` needs no change — it doesn't pass `linkAs`, so `CallIqLogo`/`CallIqMark` fall back to plain `next/link`, correct for its non-locale context.

- [ ] **Step 5: Verify with typecheck, lint, and build**

Run: `npm run typecheck -w @call-iq/dashboard && npm run lint -w @call-iq/dashboard && npm run build -w @call-iq/dashboard`
Expected: all three pass. A missed or incorrect import swap surfaces as a type error (wrong hook signature) or build error (broken route), not a silent runtime bug — this is why the build step matters here.

- [ ] **Step 6: Commit**

```bash
git add apps/dashboard/src
git commit -m "Swap dashboard navigation imports to locale-aware equivalents (next-intl)"
```

---

### Task 6: Wire translated nav labels

**Files:**
- Modify: `apps/dashboard/src/lib/dashboard-nav.ts`
- Modify: `apps/dashboard/src/components/calliq/app-shell.tsx`

**Interfaces:**
- Consumes: `useTranslations` from `next-intl` (client-side hook); message keys from Task 2's catalogs.
- Produces: `DashboardNavItem` gains `labelKey`/`subtitleKey` fields (translation keys) alongside the existing `label`/`subtitle` (kept as English fallback for any non-translated consumer — e.g. server-side breadcrumb helpers that don't have hook access); the sidebar-rendering code in `app-shell.tsx` resolves labels via `useTranslations()` instead of reading `item.label` directly.

- [ ] **Step 1: Add translation keys to `DashboardNavItem`**

In `apps/dashboard/src/lib/dashboard-nav.ts`, add to the `DashboardNavItem` interface:
```typescript
  labelKey: string;
  subtitleKey?: string;
```

Add a `labelKey`/`subtitleKey` pair to every item in `DASHBOARD_NAV_GROUPS`, matching the keys written in Task 2 (e.g. the `/dashboard` item gets `labelKey: "nav.dashboard", subtitleKey: "nav.dashboardSubtitle"`; the `/dashboard/leads` item gets `labelKey: "nav.leads", subtitleKey: "nav.leadsSubtitle"`; continue this mapping 1:1 for all 23 items using the exact key names defined in Task 2's `en.json`/`ar.json`). Keep the existing `label`/`subtitle` string fields unchanged as-is (English fallback, still used by `navPageTitle`/`navPageSubtitle` for any non-component context like `<title>` metadata generation that runs outside React hook context).

- [ ] **Step 2: Resolve translated labels in the sidebar**

In `components/calliq/app-shell.tsx`, add the import:
```typescript
import { useTranslations } from "next-intl";
```

In the component that renders `DASHBOARD_NAV_GROUPS` (the one using `NAV_ICONS` and mapping over groups/items — locate the render loop from the existing `{DASHBOARD_NAV_GROUPS.map((group) => (` line), add `const t = useTranslations();` near the top of that component, and change the item label/subtitle rendering from `{item.label}` / `{item.subtitle}` to `{t(item.labelKey)}` / `{item.subtitleKey ? t(item.subtitleKey) : null}`.

- [ ] **Step 3: Verify**

Run: `npm run typecheck -w @call-iq/dashboard && npm run lint -w @call-iq/dashboard`
Expected: no errors. (A missing `labelKey` on any nav item is a TypeScript error since the interface now requires it — this catches incomplete key mapping at compile time rather than a silent blank label at runtime.)

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/lib/dashboard-nav.ts apps/dashboard/src/components/calliq/app-shell.tsx
git commit -m "Wire translated nav labels via next-intl useTranslations"
```

---

### Task 7: Language switcher

**Files:**
- Create: `apps/dashboard/src/components/dashboard/LanguageSwitcher.tsx`
- Modify: `apps/dashboard/src/components/dashboard/DashboardTopbar.tsx`

**Interfaces:**
- Consumes: `usePathname, useRouter` from `@/i18n/navigation`; `useLocale, useTranslations` from `next-intl`.
- Produces: `LanguageSwitcher` component, rendered inside `DashboardTopbar`.

- [ ] **Step 1: Create the switcher**

```tsx
// apps/dashboard/src/components/dashboard/LanguageSwitcher.tsx
"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("shell");
  const pathname = usePathname();
  const router = useRouter();

  const nextLocale = locale === "ar" ? "en" : "ar";

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: nextLocale })}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-background-hover"
      aria-label={t("language")}
    >
      <Globe className="size-4" strokeWidth={ICON_STROKE} />
      <span className={cn(locale === "ar" && "font-arabic")}>
        {nextLocale === "ar" ? t("arabic") : t("english")}
      </span>
    </button>
  );
}
```

- [ ] **Step 2: Add it to the topbar**

Read `components/dashboard/DashboardTopbar.tsx` first to find where existing action buttons (e.g. near `GlobalSearch`/`NotificationsCenter`) are rendered, then import and render `<LanguageSwitcher />` alongside them, following the file's existing spacing/layout convention for that button row.

- [ ] **Step 3: Verify**

Run: `npm run typecheck -w @call-iq/dashboard && npm run lint -w @call-iq/dashboard`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/components/dashboard/LanguageSwitcher.tsx apps/dashboard/src/components/dashboard/DashboardTopbar.tsx
git commit -m "Add language switcher to dashboard topbar"
```

---

### Task 8: Final verification and e2e route coverage

**Files:**
- Modify: `e2e/journeys/dashboard.spec.ts`

**Interfaces:**
- Consumes: existing `DASHBOARD_ROUTES` array (same pattern as Phase 1 Task 7).

- [ ] **Step 1: Add Arabic route coverage**

In `e2e/journeys/dashboard.spec.ts`, add a second array mirroring `DASHBOARD_ROUTES` with an `/ar` prefix on each dashboard-only entry (skip `/dashboard/team`, `/dashboard/settings` if those redirect in ways not yet locale-verified — start with the core set: `/ar`, `/ar/dashboard`, `/ar/dashboard/calls`, `/ar/dashboard/leads`, `/ar/dashboard/agent`), and a loop identical in structure to the existing one, asserting the same conditions (status < 400, `main` visible, `h1` visible, zero console errors) plus one Arabic-specific assertion: `await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');`.

- [ ] **Step 2: Full workspace verification**

Run: `npm run typecheck -w @call-iq/dashboard && npm run lint -w @call-iq/dashboard && npm run build -w @call-iq/dashboard`
Expected: all pass. (Running the actual Playwright suite requires the gateway, which needs credentials not available in this session — documented as a follow-up, same as Phase 1's migration-apply step.)

- [ ] **Step 3: Commit**

```bash
git add e2e/journeys/dashboard.spec.ts
git commit -m "Add Arabic route e2e smoke coverage"
```

---

## Post-plan state

`/dashboard/**` unchanged for English users. `/ar/dashboard/**` now exists, fully navigable (every internal link/redirect locale-aware), RTL-correct at the `<html>` level, with an Arabic-capable font and a working language switcher. Nav labels and shell chrome strings are translated; deep page-body content remains English (explicitly out of scope, follow-up work page-by-page). Marketing/auth URLs are unchanged. Full Next.js build passes; live browser/e2e verification is a documented follow-up requiring real API credentials.
