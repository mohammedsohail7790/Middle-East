# 08 — DASHBOARD SYSTEM

## Framework

- **Next.js 15** with App Router
- **Tailwind CSS** for styling
- **Supabase Auth** for authentication
- **Path:** `apps/dashboard/`

## Page Routes

All authenticated pages live under `src/app/(app)/`:

| Route | File | Purpose |
|-------|------|---------|
| `/dashboard` | `dashboard/page.tsx` | Main dashboard — call stats, recent activity |
| `/calls` | `calls/page.tsx` | Call history with filtering |
| `/calls/:callId` | `calls/[callId]/page.tsx` | Call detail + transcript |
| `/leads` | `leads/page.tsx` | Lead management (kanban/list) |
| `/appointments` | `appointments/page.tsx` | Appointment calendar |
| `/analytics` | `analytics/page.tsx` | Call analytics, performance charts |
| `/billing` | `billing/page.tsx` | Subscription, usage, invoices |
| `/agent` | `agent/page.tsx` | AI agent configuration |
| `/knowledge` | `knowledge/page.tsx` | Knowledge base upload/manage |
| `/integrations` | `integrations/page.tsx` | CRM and tool connections |
| `/calendar` | `calendar/page.tsx` | Calendar view |
| `/automation` | `automation/page.tsx` | Workflow automation rules |
| `/sms` | `sms/page.tsx` | SMS messaging |
| `/team` | `team/page.tsx` | Team member management |
| `/settings` | `settings/page.tsx` | General settings |
| `/settings/business-hours` | Business hours config |
| `/settings/phone-numbers` | Phone number management |
| `/settings/integrations` | Integration settings |
| `/settings/slack` | Slack notification config |
| `/settings/enterprise` | Enterprise features |
| `/demo` | `demo/page.tsx` | Demo/playground |
| `/call-iq` | `call-iq/page.tsx` | Call IQ main view |
| `/call-iq/tenants` | Tenant management (admin) |

## Authentication

- Supabase Auth (email/password, OAuth)
- Session managed via `@supabase/ssr`
- Protected by layout-level auth check

## API Communication

**File:** `src/lib/api.ts` / `src/lib/callIqClient.ts`

- Gateway API calls use `NEXT_PUBLIC_GATEWAY_API_URL`
- Tenant ID passed via `x-tenant-id` header
- Internal API key via `x-internal-api-key` header

## Key Libraries

| Library | Purpose |
|---------|---------|
| `@supabase/supabase-js` | Database + Auth client |
| `tailwindcss` | Styling |
| `lucide-react` | Icons |
| `recharts` | Charts (analytics) |
| `date-fns` | Date formatting |

## Feature Gating in UI

Dashboard reads plan config from `/api/v1/billing/plan-config` and conditionally shows:
- Upgrade prompts for locked features
- Usage bars with plan limits
- Feature badges (Professional/Enterprise)

## Billing Page

Shows:
- Current plan and status
- Usage meters (minutes used / included)
- Plan comparison with upgrade buttons
- Invoice history
- Payment method management

Plans displayed: Essential ($39), Professional ($149), Enterprise ($499)
