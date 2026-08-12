# Halla AI — Production Deployment

**Canonical stack:** `apps/gateway` (API + voice) + `apps/dashboard` (Next.js UI)

Domain: **hallaai.com** | Market: GCC / Middle East

Production stack is only `apps/gateway` + `apps/dashboard`. Legacy Vite/Python/marketing folders were removed from the repo.

## Vercel (dashboard) + Render (gateway)

See **[DEPLOY_VERCEL.md](./DEPLOY_VERCEL.md)** for app.hallaai.com on Vercel.

## Render (gateway)

1. Connect repo to Render and apply `render.yaml`.
2. Set sync=false secrets in the Render dashboard:
   - Gateway: `DATABASE_URL`, `GATEWAY_DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `OPENAI_API_KEY`, Twilio, Stripe, etc.
   - Dashboard: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
3. Confirm `ALLOWED_ORIGINS` on gateway includes your dashboard URL.
4. Set `TWILIO_STREAM_WSS_URL` to `wss://<gateway-host>/ws/realtime`.
5. Health checks: gateway `/health`, dashboard `/`.

## Local production smoke test

```bash
cp apps/gateway/.env.example apps/gateway/.env
cp apps/dashboard/.env.example apps/dashboard/.env.local
# Fill in values, then:
npm install
npm run build
npm run start
```

## Security checklist

- [ ] Rotate any keys that were ever committed in docs or `.env.example` history
- [ ] Never set `NEXT_PUBLIC_*` internal API keys (use Supabase session JWT)
- [ ] `VOICE_INTERNAL_API_KEY` only on gateway (server-side scripts)
- [ ] `/debug/env` disabled in production
- [ ] Twilio webhook signature validation enabled (`NODE_ENV=production`)

## Auth flow

1. User signs in via Supabase on the dashboard.
2. Dashboard sends `Authorization: Bearer <supabase_access_token>` + `x-tenant-id`.
3. Gateway verifies token and tenant via `SUPABASE_SERVICE_ROLE_KEY`.
4. SSE metrics: `GET /api/v1/dashboard/stream?token=<jwt>&tenant_id=<uuid>`.
5. AI config push: `wss://<gateway>/ws/ai-config/<tenantId>`.

## Post-deploy verification

```bash
curl https://<gateway>/health
curl https://<gateway>/ready
# Place test call to Twilio number; confirm lead in dashboard
```
