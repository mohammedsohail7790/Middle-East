# 01 — PLATFORM OVERVIEW

## What is Call IQ

Call IQ is a multi-tenant AI voice receptionist SaaS platform built for home service businesses (HVAC, plumbing, electrical, and more). It answers inbound phone calls using OpenAI's Realtime API, books appointments, captures leads, and integrates with industry CRMs — all without human intervention.

## Business Model

- **Subscription SaaS** with three tiers: Essential ($39/mo), Professional ($149/mo), Enterprise ($499/mo)
- **Usage-based overage** billing per minute beyond plan limits
- **14-day free trial** with 60-minute cap, unlocking Professional features
- Revenue from monthly subscriptions + per-minute overage charges

## Multi-Tenant SaaS Structure

- Each customer (home service business) is a **tenant** identified by `voice_tenants.id`
- Tenant isolation enforced via Supabase Row Level Security (RLS)
- Per-tenant configuration: AI personality, voice, language, business hours, integrations
- Per-tenant phone numbers provisioned via Twilio
- Per-tenant knowledge base with vector embeddings

## Supported Industries

- HVAC (heating, ventilation, air conditioning)
- Plumbing
- Electrical
- General home services
- Medical (with HIPAA on Enterprise)
- Legal
- Real estate

Industry-specific prompt templates and knowledge are built in via `apps/gateway/src/services/industry/`.

## Core Value Proposition

1. **Never miss a call** — AI answers 24/7
2. **Book appointments automatically** — Calendar integration
3. **Capture every lead** — Structured data extraction
4. **Sound professional** — Natural voice with OpenAI Realtime
5. **Integrate with existing tools** — CRM, calendar, Zapier

## Production Readiness Level

| Component | Status |
|-----------|--------|
| Gateway (voice + API) | Production-ready, deployed on Render |
| Dashboard (Next.js) | Production-ready, deployed on Vercel |
| Database (Supabase) | Production, RLS enabled |
| Redis (Upstash) | Production |
| Billing (Stripe) | Configured, webhooks ready |
| Voice (OpenAI Realtime) | Production, preflight checks |
| Telephony (Twilio) | Production, media streams |

## Deployment Topology

```
┌─────────────────────────────────────────────────────────────┐
│                        INTERNET                              │
└─────────────┬───────────────────────────────┬───────────────┘
              │                               │
    ┌─────────▼─────────┐          ┌─────────▼─────────┐
    │   Render.com       │          │    Vercel          │
    │   calliq-gateway   │          │  calliq-dashboard  │
    │   (Node.js + WS)   │          │  (Next.js 15)      │
    └────┬────┬────┬─────┘          └────────────────────┘
         │    │    │
    ┌────▼┐ ┌▼────▼────┐  ┌──────────────┐
    │Redis│ │ Supabase  │  │   Twilio     │
    │(Up- │ │ PostgreSQL│  │ Media Streams│
    │stash)│ │ + pgvector│  └──────┬───────┘
    └─────┘ └───────────┘         │
                                   │ WebSocket
                            ┌──────▼───────┐
                            │ OpenAI       │
                            │ Realtime API │
                            └──────────────┘
```

## Repository Structure

```
Call_IQ/                          # Monorepo root
├── apps/
│   ├── gateway/                  # Node.js + Express + WebSocket server
│   │   ├── src/
│   │   │   ├── config/          # Centralized plan configuration
│   │   │   ├── middleware/      # Auth, rate limiting, plan gating
│   │   │   ├── services/       # 30+ service modules
│   │   │   └── index.ts        # Entry point
│   │   ├── tests/              # Synthetic callers, integration, load, chaos
│   │   └── package.json
│   ├── dashboard/               # Next.js 15 frontend
│   │   ├── src/app/(app)/      # 16 page routes
│   │   ├── src/components/     # UI components
│   │   └── src/lib/            # Client utilities
├── packages/
│   ├── types/                   # Shared TypeScript types
│   ├── db/                      # Database utilities
│   ├── memory/                  # Conversation memory
│   └── mcp-client/             # MCP client
├── supabase/
│   ├── schema.sql              # Base database schema
│   └── migrations/             # 19 migration files
├── infrastructure/             # Disaster recovery, deployment configs
├── render.yaml                 # Render deployment manifest
├── docker-compose.yml          # Local development
└── package.json                # Monorepo workspace config
```
