# GCC Phase 1 Skeleton Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the structural foundation (DB schema, industry templates, navigation/IA, and channel/CRM skeleton pages) for the GCC AI Customer Experience Platform, without touching any existing live functionality and without wiring any new third-party APIs.

**Architecture:** One additive Supabase migration; extend the existing code-based industry template system; rebuild `dashboard-nav.ts` (single source of truth for the sidebar) to re-link two orphaned-but-real pages and add new nav groups; add one real page (SMS, backed by an already-live gateway API) and eight skeleton pages (4 CRM, 4 channels) that render honest empty states with no backend calls yet.

**Tech Stack:** Next.js 15 App Router, TypeScript, Tailwind (existing token system, no new tokens needed), Supabase Postgres (existing RLS pattern via `team_members`), existing `apps/dashboard/src/lib/api.ts` client, existing `ui-kit` components (`DashboardPage`, `DashboardPageSection`, `StatCard`, `EmptyState`, `IconBox`).

**Scope note:** This is Plan 1 of the Phase 1 spec (`docs/superpowers/specs/2026-08-03-gcc-phase1-skeleton-design.md`). It covers spec sections C (nav/IA) and D (DB schema), plus the industry-template extension the spec's audit surfaced. It deliberately does **not** cover spec section A (i18n/RTL — a large, invasive cross-cutting restructure of every route under `[locale]`, too big and too different in risk profile to bundle here), the remaining sliver of section B (Arabic-capable font, which depends on the i18n layout work), or section E (revenue/sentiment/top-agents dashboard widgets, which depend on new backend aggregation work). Those become their own plans, written after this one ships and is verified working.

## Global Constraints

- Every new DB object is additive (`CREATE TABLE IF NOT EXISTS`, `ADD COLUMN IF NOT EXISTS`) — no existing column, table, or type is altered or dropped.
- No existing API route signature changes.
- No existing page is removed. `knowledge` nav label changes from "Business Profile" to "Knowledge Base"; no other relabels.
- New RLS policies follow the `ai_agents` table's exact pattern (migration `012_enterprise_features.sql`): `tenant_id IN (SELECT tenant_id FROM public.team_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin'))`.
- No new external API integrations (WhatsApp/Instagram/Facebook Graph APIs) — those pages ship as structural skeletons with a "not connected" empty state and zero network calls.
- `npm run lint` and `npm run typecheck` (workspace-wide, via husky pre-commit) must pass before every commit — do not use `--no-verify`.
- This repo's dashboard has no React component unit-test harness (no jsdom/testing-library configured in `vitest.config.ts`); UI correctness is verified via Playwright e2e (`e2e/journeys/*.spec.ts`) and manual dev-server checks, not new unit tests. Follow that existing convention rather than introducing a new test harness.
- The DB migration cannot be applied to a live Supabase project from this session (no `DATABASE_URL` access, by design). Task 1's verification step is SQL review + `npm run typecheck` on any TS touched by later tasks that reference new columns; actually running the migration against a real database is the developer's follow-up step, documented explicitly in Task 1.

---

### Task 1: Database migration 064 — GCC skeleton schema

**Files:**
- Create: `supabase/migrations/064_gcc_phase1_skeleton.sql`

**Interfaces:**
- Produces: tables `crm_pipeline_stages(id, tenant_id, name, position, created_at)`, `crm_companies(id, tenant_id, name, website, industry, notes, created_at, updated_at)`, `crm_contacts(id, tenant_id, company_id, name, phone, email, notes, created_at, updated_at)`, `crm_deals(id, tenant_id, stage_id, contact_id, company_id, title, value, currency, notes, created_at, updated_at)`, `channel_connections(id, tenant_id, channel, status, config, created_at, updated_at)`; new columns `ai_agents.industry`, `ai_agents.business_hours`, `ai_agents.escalation_rules`, `ai_agents.greeting`, `ai_agents.fallback_message`; new column `voice_tenants.currency`. Later tasks (and later phases) consume these by name exactly as listed.

- [ ] **Step 1: Write the migration file**

```sql
-- 064_gcc_phase1_skeleton.sql
-- Phase 1 GCC platform skeleton: additive schema only.
-- Adds per-agent config columns, tenant currency, CRM tables, and the
-- channel-connection status table. No existing table/column is modified.

-- 1. Per-agent GCC config (ai_agents already exists, migration 012/021)
ALTER TABLE public.ai_agents
  ADD COLUMN IF NOT EXISTS industry TEXT,
  ADD COLUMN IF NOT EXISTS business_hours JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS escalation_rules JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS greeting TEXT,
  ADD COLUMN IF NOT EXISTS fallback_message TEXT;

-- 2. Tenant currency (voice_tenants.industry/timezone already exist, migration 014/008)
ALTER TABLE public.voice_tenants
  ADD COLUMN IF NOT EXISTS currency TEXT DEFAULT 'USD';

-- 3. CRM skeleton tables
CREATE TABLE IF NOT EXISTS public.crm_pipeline_stages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  position INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_pipeline_stages_tenant ON public.crm_pipeline_stages(tenant_id);
ALTER TABLE public.crm_pipeline_stages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage pipeline stages"
  ON public.crm_pipeline_stages FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ));

CREATE TABLE IF NOT EXISTS public.crm_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  website TEXT,
  industry TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_companies_tenant ON public.crm_companies(tenant_id);
ALTER TABLE public.crm_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage companies"
  ON public.crm_companies FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ));

CREATE TABLE IF NOT EXISTS public.crm_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  phone TEXT,
  email TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_tenant ON public.crm_contacts(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_contacts_company ON public.crm_contacts(company_id);
ALTER TABLE public.crm_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage contacts"
  ON public.crm_contacts FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ));

CREATE TABLE IF NOT EXISTS public.crm_deals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  stage_id UUID REFERENCES public.crm_pipeline_stages(id) ON DELETE SET NULL,
  contact_id UUID REFERENCES public.crm_contacts(id) ON DELETE SET NULL,
  company_id UUID REFERENCES public.crm_companies(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  value NUMERIC(12, 2) DEFAULT 0,
  currency TEXT DEFAULT 'USD',
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_crm_deals_tenant ON public.crm_deals(tenant_id);
CREATE INDEX IF NOT EXISTS idx_crm_deals_stage ON public.crm_deals(stage_id);
ALTER TABLE public.crm_deals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage deals"
  ON public.crm_deals FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ));

-- 4. Channel connection status (structural home for later WhatsApp/IG/FB wiring)
CREATE TABLE IF NOT EXISTS public.channel_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.voice_tenants(id) ON DELETE CASCADE NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('whatsapp', 'web_chat', 'instagram', 'facebook')),
  status TEXT NOT NULL DEFAULT 'not_connected' CHECK (status IN ('not_connected', 'connected', 'error')),
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (tenant_id, channel)
);
CREATE INDEX IF NOT EXISTS idx_channel_connections_tenant ON public.channel_connections(tenant_id);
ALTER TABLE public.channel_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can manage channel connections"
  ON public.channel_connections FOR ALL
  USING (tenant_id IN (
    SELECT tenant_id FROM public.team_members
    WHERE user_id = auth.uid()
    AND role IN ('owner', 'admin')
  ));
```

- [ ] **Step 2: Review for syntax correctness**

Read the file back and check every `CREATE TABLE`/`ALTER TABLE`/`CREATE POLICY` statement terminates with `;`, every `REFERENCES` target table already exists (`voice_tenants`, `crm_companies`, `crm_contacts`, `crm_pipeline_stages` — note `crm_deals` references tables defined earlier in the same file, so ordering matters and is already correct above).

- [ ] **Step 3: Document the manual apply step (cannot run from this session — no DB credentials here)**

Add this exact note as a comment at the top of a NEW file `supabase/migrations/README_064.md`:

```markdown
# Applying migration 064

This migration was written and reviewed but not applied to any live database
from the authoring session (no DATABASE_URL was available there by design).

To apply:

    DATABASE_URL="postgresql://postgres:<password>@<host>:5432/postgres" node run-migration.js

(`run-migration.js` currently points at migration 008 by filename — update the
`fs.readFileSync(...)` path in that script to `supabase/migrations/064_gcc_phase1_skeleton.sql`
before running, or pass the path as an argument if the script has been
generalized by then.)

Verify with:

    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name LIKE 'crm_%' OR table_name = 'channel_connections';
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/064_gcc_phase1_skeleton.sql supabase/migrations/README_064.md
git commit -m "Add GCC phase 1 skeleton migration (CRM tables, channel connections, per-agent config columns)"
```

---

### Task 2: Extend industry templates with GCC verticals

**Files:**
- Modify: `apps/gateway/src/services/industry/extended-templates.ts:56-98` (the `SEEDS` array)

**Interfaces:**
- Consumes: `IndustrySeed` type and `buildTemplate()` function already defined in this file (lines 6-54) — unchanged.
- Produces: nothing new consumed elsewhere by name; the existing `buildExtendedIndustryTemplates()` (line 101) and `EXTENDED_INDUSTRY_COUNT` (line 109) automatically pick up new entries since they iterate `SEEDS`.

- [ ] **Step 1: Add new seeds to the SEEDS array**

Insert these entries into the `SEEDS` array in `apps/gateway/src/services/industry/extended-templates.ts`, immediately before the closing `];` on line 99 (after the existing `solar` entry):

```typescript
  { id: 'hospital', name: 'Hospital', description: 'Multi-department hospital patient services', icon: '🏥', services: ['Appointment booking', 'Department transfer', 'Billing inquiry', 'Emergency triage info', 'Visiting hours'], trade: 'hospital' },
  { id: 'beauty_clinic', name: 'Beauty Clinic', description: 'Aesthetic and cosmetic treatments', icon: '💅', services: ['Consultation booking', 'Treatment inquiry', 'Package pricing', 'Follow-up scheduling'], trade: 'beauty clinic' },
  { id: 'plastic_surgery', name: 'Plastic Surgery Practice', description: 'Cosmetic and reconstructive surgery', icon: '🩺', services: ['Consultation booking', 'Procedure inquiry', 'Pre-op instructions', 'Post-op follow-up'], trade: 'plastic surgery practice' },
  { id: 'hotel', name: 'Hotel', description: 'Hospitality reservations and guest services', icon: '🏨', services: ['Reservation', 'Room inquiry', 'Concierge request', 'Amenities info', 'Group booking'], trade: 'hotel' },
  { id: 'car_dealer', name: 'Car Dealership', description: 'New and used vehicle sales', icon: '🚙', services: ['Test drive booking', 'Inventory inquiry', 'Financing info', 'Trade-in estimate'], trade: 'car dealership' },
  { id: 'finance', name: 'Financial Services', description: 'Personal and business financial advisory', icon: '💵', services: ['Consultation booking', 'Account inquiry', 'Product info', 'Advisor callback'], trade: 'financial services' },
  { id: 'consulting', name: 'Consulting Firm', description: 'Business and management consulting', icon: '💼', services: ['Discovery call', 'Proposal request', 'Engagement scheduling'], trade: 'consulting firm' },
  { id: 'ecommerce', name: 'Ecommerce Business', description: 'Online store customer service', icon: '🛒', services: ['Order status', 'Returns', 'Product questions', 'Shipping inquiry'], trade: 'ecommerce business' },
  { id: 'travel_agency', name: 'Travel Agency', description: 'Trip planning and booking services', icon: '✈️', services: ['Booking inquiry', 'Itinerary change', 'Visa/documents info', 'Group travel'], trade: 'travel agency' },
  { id: 'government_services', name: 'Government Services', description: 'Public sector citizen services', icon: '🏛️', services: ['Service inquiry', 'Appointment booking', 'Document status', 'Department transfer'], trade: 'government services office' },
```

- [ ] **Step 2: Verify the file still typechecks**

Run: `npm run typecheck -w @call-iq/gateway`
Expected: no errors (the new entries match the existing `IndustrySeed` shape exactly — same keys, same types).

- [ ] **Step 3: Manually verify the endpoint picks up the new count**

Run: `npm run dev:gateway` (in one terminal), then in another:
`curl -s http://127.0.0.1:3003/tenants/industries | node -e "const d=JSON.parse(require('fs').readFileSync(0,'utf8'));console.log(d.data.length, d.data.map(i=>i.id).includes('hospital'))"`
Expected output: `58 true` (48 previous + 10 new; confirms `hospital` is present). Stop the dev server after.

- [ ] **Step 4: Commit**

```bash
git add apps/gateway/src/services/industry/extended-templates.ts
git commit -m "Add GCC industry verticals (hospital, beauty clinic, plastic surgery, hotel, car dealer, finance, consulting, ecommerce, travel agency, government services)"
```

---

### Task 3: Rebuild dashboard navigation

**Files:**
- Modify: `apps/dashboard/src/lib/dashboard-nav.ts` (entire `DASHBOARD_NAV_GROUPS` array)
- Modify: `apps/dashboard/src/components/calliq/app-shell.tsx:27-41` (the `NAV_ICONS` map)

**Interfaces:**
- Consumes: existing `DashboardNavItem`/`DashboardNavGroup` types in `dashboard-nav.ts` (unchanged) and existing helper functions (`navItemByPath`, `navRouteKey`, `navPageTitle`, `navPageSubtitle`, `navLockedTitle`, `allNavHrefs` — unchanged, they operate generically over `DASHBOARD_NAV_GROUPS`).
- Produces: routes referenced here (`/dashboard/automation`, `/dashboard/quality`, `/dashboard/crm/pipeline`, `/dashboard/crm/contacts`, `/dashboard/crm/companies`, `/dashboard/crm/deals`, `/dashboard/channels/sms`, `/dashboard/channels/whatsapp`, `/dashboard/channels/web-chat`, `/dashboard/channels/instagram`, `/dashboard/channels/facebook`) must exist as real page files — built in Tasks 4-6.

- [ ] **Step 1: Replace `DASHBOARD_NAV_GROUPS` in `dashboard-nav.ts`**

Replace the existing `export const DASHBOARD_NAV_GROUPS: DashboardNavGroup[] = [...]` block with:

```typescript
export const DASHBOARD_NAV_GROUPS: DashboardNavGroup[] = [
  {
    label: "Overview",
    items: [
      { href: "/dashboard", label: "Dashboard", subtitle: "Performance, volume, and recent activity" },
    ],
  },
  {
    label: "Operations",
    items: [
      { href: "/dashboard/leads", label: "Leads", subtitle: "Pipeline stages and conversion" },
      { href: "/dashboard/agent", label: "Voice Agents", subtitle: "Voice, tone, and routing rules" },
      { href: "/dashboard/calendar", label: "Calendar", subtitle: "Appointments and availability" },
      { href: "/dashboard/analytics", label: "Analytics", plan: "professional", subtitle: "Trends, funnels, and KPIs" },
      { href: "/dashboard/quality", label: "Quality", subtitle: "Call scoring, sentiment, and lead quality" },
    ],
  },
  {
    label: "Channels",
    items: [
      { href: "/dashboard/calls", label: "Calls", subtitle: "Transcripts, outcomes, and call history" },
      { href: "/dashboard/channels/sms", label: "SMS", subtitle: "Text conversations and templates" },
      { href: "/dashboard/channels/whatsapp", label: "WhatsApp", subtitle: "WhatsApp Business conversations" },
      { href: "/dashboard/channels/web-chat", label: "Web Chat", subtitle: "Website chat widget conversations" },
      { href: "/dashboard/channels/instagram", label: "Instagram", subtitle: "Instagram Direct conversations" },
      { href: "/dashboard/channels/facebook", label: "Facebook", subtitle: "Facebook Messenger conversations" },
    ],
  },
  {
    label: "CRM",
    items: [
      { href: "/dashboard/crm/pipeline", label: "Pipeline", subtitle: "Deal stages and pipeline value" },
      { href: "/dashboard/crm/contacts", label: "Contacts", subtitle: "People associated with your business" },
      { href: "/dashboard/crm/companies", label: "Companies", subtitle: "Organizations you do business with" },
      { href: "/dashboard/crm/deals", label: "Deals", subtitle: "Open and closed opportunities" },
    ],
  },
  {
    label: "Platform",
    items: [
      { href: "/dashboard/integrations", label: "Integrations", subtitle: "CRMs, calendars, and automations" },
      { href: "/dashboard/automation", label: "Automations", subtitle: "Trigger-based rules and workflows" },
      { href: "/dashboard/knowledge", label: "Knowledge Base", subtitle: "Company details, service area, and AI training content" },
      { href: "/dashboard/phone-numbers", label: "Phone Numbers", subtitle: "Inbound numbers and routing" },
      { href: "/dashboard/compliance", label: "Compliance", subtitle: "AI disclosure, call recording, retention, and audit log" },
      { href: "/dashboard/billing", label: "Billing", subtitle: "Plan, usage, and invoices" },
      { href: "/dashboard/settings/spam", label: "Spam Protection", subtitle: "Block robocalls and unwanted callers" },
      { href: "/dashboard/support", label: "Support", subtitle: "Help, docs, and contact" },
    ],
  },
];
```

- [ ] **Step 2: Add matching icons in `app-shell.tsx`**

In `apps/dashboard/src/components/calliq/app-shell.tsx`, change the import on lines 6-10 to add the new icons:

```typescript
import {
  LayoutDashboard, Phone, Users, Bot, Calendar, MessageSquare, BarChart3,
  Puzzle, BookOpen, Lock, CreditCard, Hash, LogOut, Shield,
  PanelLeftClose, PanelLeft, X, LifeBuoy, type LucideIcon,
  Star, Workflow, MessagesSquare, Instagram, Facebook, Building2, Contact, Handshake, KanbanSquare,
} from "lucide-react";
```

Replace the `NAV_ICONS` map (lines 27-41) with:

```typescript
const NAV_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/dashboard/calls": Phone,
  "/dashboard/leads": Users,
  "/dashboard/agent": Bot,
  "/dashboard/calendar": Calendar,
  "/dashboard/analytics": BarChart3,
  "/dashboard/quality": Star,
  "/dashboard/channels/sms": MessageSquare,
  "/dashboard/channels/whatsapp": MessagesSquare,
  "/dashboard/channels/web-chat": MessageSquare,
  "/dashboard/channels/instagram": Instagram,
  "/dashboard/channels/facebook": Facebook,
  "/dashboard/crm/pipeline": KanbanSquare,
  "/dashboard/crm/contacts": Contact,
  "/dashboard/crm/companies": Building2,
  "/dashboard/crm/deals": Handshake,
  "/dashboard/integrations": Puzzle,
  "/dashboard/automation": Workflow,
  "/dashboard/knowledge": BookOpen,
  "/dashboard/phone-numbers": Hash,
  "/dashboard/compliance": Lock,
  "/dashboard/billing": CreditCard,
  "/dashboard/settings/spam": Shield,
  "/dashboard/support": LifeBuoy,
};
```

(This removes `/dashboard/integrations/setup` — not present before either; unaffected. `LogOut` and `X` remain used elsewhere in the file — do not remove those imports.)

- [ ] **Step 3: Verify typecheck and lint**

Run: `npm run typecheck -w @call-iq/dashboard && npm run lint -w @call-iq/dashboard`
Expected: no errors. (This will fail until Tasks 4-6 create the new page files, since Next.js typechecks route existence for typed `Link` usage in some configs — if it fails only on missing routes, that's expected at this point; re-run after Task 6.)

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/lib/dashboard-nav.ts apps/dashboard/src/components/calliq/app-shell.tsx
git commit -m "Rebuild dashboard nav: relink Automations and Quality, add Channels and CRM groups"
```

---

### Task 4: SMS channel page (real — wired to the existing `/sms` API)

**Files:**
- Create: `apps/dashboard/src/app/dashboard/channels/sms/page.tsx`
- Delete: `apps/dashboard/src/app/dashboard/sms/page.tsx` (the dead 5-line redirect — superseded by the new route)

**Interfaces:**
- Consumes: `api.get<T>(path)` from `@/lib/api`; `DashboardPage`, `DashboardPageSection`, `StatCard`, `EmptyState` from `@/components/ui-kit/*`; `useRealtimeQuery` from `@/lib/use-realtime-query` with existing `"sms"` scope from `DashboardSyncScope`; existing gateway routes `GET /sms/conversations` (returns array of conversations) confirmed live in `apps/gateway/src/services/sms/sms.controller.ts:28-29`.

- [ ] **Step 1: Create the SMS conversations page**

```tsx
"use client";

import { useCallback, useState } from "react";
import { MessageSquare, Phone } from "lucide-react";
import { api, asArray } from "@/lib/api";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { DashboardPageSection } from "@/components/ui-kit/DashboardPageSection";
import { StatCard } from "@/components/ui-kit/StatCard";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { cn, timeAgo } from "@/lib/utils";
import { useRealtimeQuery } from "@/lib/use-realtime-query";
import { DASHBOARD_POLL_MS } from "@/lib/dashboard-sync";

interface SmsConversation {
  phoneNumber: string;
  lastMessage: string;
  lastMessageAt: string;
  unreadCount: number;
  messageCount: number;
}

export default function SmsChannelPage() {
  const [conversations, setConversations] = useState<SmsConversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const loadConversations = useCallback((opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    api
      .get<SmsConversation[]>("/sms/conversations")
      .then((data) => { setConversations(asArray<SmsConversation>(data)); setError(""); })
      .catch((e) => setError(e instanceof Error ? e.message : String(e)))
      .finally(() => setLoading(false));
  }, []);

  useRealtimeQuery(["sms"], loadConversations, "", {
    pollMs: DASHBOARD_POLL_MS,
    pollOnlyWhenDisconnected: true,
  });

  const unreadTotal = conversations.reduce((sum, c) => sum + c.unreadCount, 0);

  return (
    <DashboardPage
      title="SMS"
      description="Text message conversations with your customers."
      loading={loading && conversations.length === 0}
      error={error || undefined}
    >
      <div className="dashboard-stat-grid dashboard-stat-grid--three">
        <StatCard label="Conversations" value={conversations.length} icon={MessageSquare} iconVariant="accent" index={0} />
        <StatCard label="Unread" value={unreadTotal} icon={MessageSquare} iconVariant="warning" index={1} />
        <StatCard label="Total messages" value={conversations.reduce((sum, c) => sum + c.messageCount, 0)} icon={Phone} iconVariant="muted" index={2} />
      </div>

      <DashboardPageSection title="Conversations" icon={MessageSquare} iconVariant="accent">
        {conversations.length === 0 && !loading ? (
          <EmptyState
            icon={MessageSquare}
            title="No SMS conversations yet"
            description="Text messages from your customers will appear here."
          />
        ) : (
          <div className="divide-y divide-border">
            {conversations.map((conv) => (
              <div key={conv.phoneNumber} className="py-4 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-sm font-medium text-foreground">{conv.phoneNumber}</span>
                    {conv.unreadCount > 0 && (
                      <span className="px-2 py-0.5 text-[10px] rounded-full bg-accent/10 text-accent-dark font-semibold">
                        {conv.unreadCount} new
                      </span>
                    )}
                  </div>
                  <p className={cn("text-sm line-clamp-1", conv.unreadCount > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                    {conv.lastMessage}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground shrink-0">{timeAgo(conv.lastMessageAt)}</span>
              </div>
            ))}
          </div>
        )}
      </DashboardPageSection>
    </DashboardPage>
  );
}
```

- [ ] **Step 2: Delete the dead redirect**

```bash
git rm apps/dashboard/src/app/dashboard/sms/page.tsx
```

- [ ] **Step 3: Manual verification**

Run: `npm run dev:dashboard` (gateway must also be running — `npm run dev:gateway` in another terminal, or `npm run dev` for both).
Navigate to `http://127.0.0.1:3000/dashboard/channels/sms` while logged in.
Expected: page renders with 3 stat cards and either a conversation list or the "No SMS conversations yet" empty state — no console errors, no 404.
Also check the old `/dashboard/sms` URL now 404s (expected — it's a deleted route with no redirect, since `/dashboard/channels/sms` is the discoverable replacement via nav).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/app/dashboard/channels/sms/page.tsx
git commit -m "Add real SMS channel page wired to the existing /sms conversations API"
```

---

### Task 5: Channel skeleton pages (WhatsApp, Web Chat, Instagram, Facebook)

**Files:**
- Create: `apps/dashboard/src/components/dashboard/ChannelNotConnected.tsx` (shared component)
- Create: `apps/dashboard/src/app/dashboard/channels/whatsapp/page.tsx`
- Create: `apps/dashboard/src/app/dashboard/channels/web-chat/page.tsx`
- Create: `apps/dashboard/src/app/dashboard/channels/instagram/page.tsx`
- Create: `apps/dashboard/src/app/dashboard/channels/facebook/page.tsx`

**Interfaces:**
- Consumes: `DashboardPage` from `@/components/ui-kit/DashboardPage`; `EmptyState` from `@/components/ui-kit/EmptyState`; a `LucideIcon` per channel.
- Produces: `ChannelNotConnected({ icon, channelName }: { icon: LucideIcon; channelName: string })` — a React component, consumed by all four page files below and reusable by later phases that wire real connections.

- [ ] **Step 1: Create the shared `ChannelNotConnected` component**

```tsx
"use client";

import type { LucideIcon } from "lucide-react";
import { PlugZap } from "lucide-react";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { EmptyState } from "@/components/ui-kit/EmptyState";

export function ChannelNotConnected({
  icon: Icon,
  channelName,
}: {
  icon: LucideIcon;
  channelName: string;
}) {
  return (
    <DashboardPage
      title={channelName}
      description={`Connect ${channelName} to start receiving and replying to conversations here.`}
    >
      <EmptyState
        icon={Icon}
        title={`${channelName} isn't connected yet`}
        description={`Once ${channelName} is connected, conversations will appear here alongside your other channels.`}
        action={
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <PlugZap className="size-4" />
            Connection setup is coming in a future update
          </span>
        }
      />
    </DashboardPage>
  );
}
```

- [ ] **Step 2: Create the four thin page files**

`apps/dashboard/src/app/dashboard/channels/whatsapp/page.tsx`:
```tsx
"use client";

import { MessagesSquare } from "lucide-react";
import { ChannelNotConnected } from "@/components/dashboard/ChannelNotConnected";

export default function WhatsAppChannelPage() {
  return <ChannelNotConnected icon={MessagesSquare} channelName="WhatsApp" />;
}
```

`apps/dashboard/src/app/dashboard/channels/web-chat/page.tsx`:
```tsx
"use client";

import { MessageSquare } from "lucide-react";
import { ChannelNotConnected } from "@/components/dashboard/ChannelNotConnected";

export default function WebChatChannelPage() {
  return <ChannelNotConnected icon={MessageSquare} channelName="Web Chat" />;
}
```

`apps/dashboard/src/app/dashboard/channels/instagram/page.tsx`:
```tsx
"use client";

import { Instagram } from "lucide-react";
import { ChannelNotConnected } from "@/components/dashboard/ChannelNotConnected";

export default function InstagramChannelPage() {
  return <ChannelNotConnected icon={Instagram} channelName="Instagram" />;
}
```

`apps/dashboard/src/app/dashboard/channels/facebook/page.tsx`:
```tsx
"use client";

import { Facebook } from "lucide-react";
import { ChannelNotConnected } from "@/components/dashboard/ChannelNotConnected";

export default function FacebookChannelPage() {
  return <ChannelNotConnected icon={Facebook} channelName="Facebook" />;
}
```

- [ ] **Step 3: Manual verification**

With `npm run dev:dashboard` running, visit `/dashboard/channels/whatsapp`, `/dashboard/channels/web-chat`, `/dashboard/channels/instagram`, `/dashboard/channels/facebook`.
Expected: each renders the page title, description, and a centered empty-state card with the right icon and "isn't connected yet" message — no console errors, no network calls in the browser Network tab (these pages make zero API requests).

- [ ] **Step 4: Commit**

```bash
git add apps/dashboard/src/components/dashboard/ChannelNotConnected.tsx apps/dashboard/src/app/dashboard/channels/whatsapp apps/dashboard/src/app/dashboard/channels/web-chat apps/dashboard/src/app/dashboard/channels/instagram apps/dashboard/src/app/dashboard/channels/facebook
git commit -m "Add WhatsApp, Web Chat, Instagram, Facebook channel skeleton pages"
```

---

### Task 6: CRM skeleton pages (Pipeline, Contacts, Companies, Deals)

**Files:**
- Create: `apps/dashboard/src/components/dashboard/CrmNotBuilt.tsx` (shared component)
- Create: `apps/dashboard/src/app/dashboard/crm/pipeline/page.tsx`
- Create: `apps/dashboard/src/app/dashboard/crm/contacts/page.tsx`
- Create: `apps/dashboard/src/app/dashboard/crm/companies/page.tsx`
- Create: `apps/dashboard/src/app/dashboard/crm/deals/page.tsx`

**Interfaces:**
- Consumes: `DashboardPage`, `EmptyState` from `@/components/ui-kit/*`.
- Produces: `CrmNotBuilt({ icon, entityName, entityNamePlural }: { icon: LucideIcon; entityName: string; entityNamePlural: string })`, consumed by all four page files below.

- [ ] **Step 1: Create the shared `CrmNotBuilt` component**

```tsx
"use client";

import type { LucideIcon } from "lucide-react";
import { Hammer } from "lucide-react";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { EmptyState } from "@/components/ui-kit/EmptyState";

export function CrmNotBuilt({
  icon: Icon,
  entityName,
  entityNamePlural,
}: {
  icon: LucideIcon;
  entityName: string;
  entityNamePlural: string;
}) {
  return (
    <DashboardPage
      title={entityNamePlural}
      description={`Manage your ${entityNamePlural.toLowerCase()} in one place.`}
    >
      <EmptyState
        icon={Icon}
        title={`No ${entityNamePlural.toLowerCase()} yet`}
        description={`${entityName} management is being built. The database is ready — this page will let you create and manage ${entityNamePlural.toLowerCase()} once it ships.`}
        action={
          <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
            <Hammer className="size-4" />
            Coming in a future update
          </span>
        }
      />
    </DashboardPage>
  );
}
```

- [ ] **Step 2: Create the four thin page files**

`apps/dashboard/src/app/dashboard/crm/pipeline/page.tsx`:
```tsx
"use client";

import { KanbanSquare } from "lucide-react";
import { CrmNotBuilt } from "@/components/dashboard/CrmNotBuilt";

export default function CrmPipelinePage() {
  return <CrmNotBuilt icon={KanbanSquare} entityName="Pipeline stage" entityNamePlural="Pipeline" />;
}
```

`apps/dashboard/src/app/dashboard/crm/contacts/page.tsx`:
```tsx
"use client";

import { Contact } from "lucide-react";
import { CrmNotBuilt } from "@/components/dashboard/CrmNotBuilt";

export default function CrmContactsPage() {
  return <CrmNotBuilt icon={Contact} entityName="Contact" entityNamePlural="Contacts" />;
}
```

`apps/dashboard/src/app/dashboard/crm/companies/page.tsx`:
```tsx
"use client";

import { Building2 } from "lucide-react";
import { CrmNotBuilt } from "@/components/dashboard/CrmNotBuilt";

export default function CrmCompaniesPage() {
  return <CrmNotBuilt icon={Building2} entityName="Company" entityNamePlural="Companies" />;
}
```

`apps/dashboard/src/app/dashboard/crm/deals/page.tsx`:
```tsx
"use client";

import { Handshake } from "lucide-react";
import { CrmNotBuilt } from "@/components/dashboard/CrmNotBuilt";

export default function CrmDealsPage() {
  return <CrmNotBuilt icon={Handshake} entityName="Deal" entityNamePlural="Deals" />;
}
```

- [ ] **Step 3: Manual verification**

With `npm run dev:dashboard` running, visit `/dashboard/crm/pipeline`, `/dashboard/crm/contacts`, `/dashboard/crm/companies`, `/dashboard/crm/deals`.
Expected: each renders title, description, and an empty-state card with the right icon/copy — no console errors, no network calls.

- [ ] **Step 4: Run full typecheck/lint now that all new routes exist**

Run: `npm run typecheck -w @call-iq/dashboard && npm run lint -w @call-iq/dashboard`
Expected: no errors. This confirms Task 3's nav config now resolves cleanly against real routes.

- [ ] **Step 5: Commit**

```bash
git add apps/dashboard/src/components/dashboard/CrmNotBuilt.tsx apps/dashboard/src/app/dashboard/crm
git commit -m "Add CRM skeleton pages (Pipeline, Contacts, Companies, Deals)"
```

---

### Task 7: E2E smoke coverage for new nav routes

**Files:**
- Modify: `e2e/journeys/dashboard.spec.ts:5-20` (the `DASHBOARD_ROUTES` array)

**Interfaces:**
- Consumes: nothing new — the existing `DASHBOARD_ROUTES` array (lines 5-20) is a flat list of route strings, iterated by the existing test loop at lines 23-33 which already asserts: HTTP status < 400, `main` visible, `h1` visible, zero console errors, zero hard API failures. No new test logic needed, only new entries in this data array — the existing loop covers them automatically.

- [ ] **Step 1: Update `DASHBOARD_ROUTES`**

Replace the array (currently `e2e/journeys/dashboard.spec.ts:5-20`) with:

```typescript
const DASHBOARD_ROUTES = [
  '/dashboard',
  '/dashboard/calls',
  '/dashboard/leads',
  '/dashboard/agent',
  '/dashboard/calendar',
  '/dashboard/channels/sms',
  '/dashboard/channels/whatsapp',
  '/dashboard/channels/web-chat',
  '/dashboard/channels/instagram',
  '/dashboard/channels/facebook',
  '/dashboard/analytics',
  '/dashboard/quality',
  '/dashboard/automation',
  '/dashboard/crm/pipeline',
  '/dashboard/crm/contacts',
  '/dashboard/crm/companies',
  '/dashboard/crm/deals',
  '/dashboard/team',
  '/dashboard/integrations',
  '/dashboard/phone-numbers',
  '/dashboard/knowledge',
  '/dashboard/billing',
  '/dashboard/settings',
] as const;
```

(`/dashboard/sms` is replaced by `/dashboard/channels/sms` since Task 4 deletes the old route. `/dashboard/team` stays — it's an existing dead redirect to `/dashboard/settings`, out of scope for this plan, and the existing loop already tolerates redirects since it only checks the final status/`h1`.)

- [ ] **Step 2: Run the updated test file**

Run: `npx playwright test e2e/journeys/dashboard.spec.ts`
Expected: all cases pass, including the pre-existing `sidebar navigation` and `axe: dashboard home` tests (no regression) and all new route entries.

- [ ] **Step 3: Commit**

```bash
git add e2e/journeys/dashboard.spec.ts
git commit -m "Add e2e smoke coverage for new Channels and CRM skeleton routes"
```

---

## Post-plan state

After Task 7: one new additive migration file (not yet applied to any live database — Task 1 documents the manual apply step), 10 new industry verticals live via the existing API, a rebuilt nav surfacing 2 previously-orphaned real pages (Automations, Quality) plus 9 new routes (1 real — SMS; 8 structural skeletons — 4 channels, 4 CRM), and e2e smoke coverage for all of it. Nothing existing was removed, renamed (beyond the one label change), or had its API contract changed.
