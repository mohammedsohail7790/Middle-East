# Deploy dashboard on Vercel (app.hallaai.com)

## Migrating from the old static site (HTML + CSS + JS)

Previously the landing may have served three static files (`index.html`, `hallaai_styles.css`, `hallaai_main.js`) from the repo root. That setup is **replaced** by the Next.js app in **`apps/dashboard`**, which includes:

| Old static | New app |
|------------|---------|
| `index.html` | `https://www.hallaai.com/` → `apps/dashboard/src/app/page.tsx` (marketing home) |
| `hallaai_styles.css` | `apps/dashboard/public/hallaai-marketing.css` (same design system) |
| `hallaai_main.js` (routing) | Next.js routes: `/login`, `/signup`, `/pricing`, `/dashboard`, etc. |

**Do not** deploy static files from the repo root anymore. Update the **same** Vercel project:

1. **Settings → General → Root Directory:** `apps/dashboard` (not `.` or empty).
2. **Include source files outside the Root Directory:** **On** (monorepo).
3. **Framework:** Next.js (auto)
4. **Build Command** (should match `apps/dashboard/vercel.json`):  
   `cd ../.. && npm run build:dashboard` (syncs marketing + builds Next)
5. **Production Branch:** `main`
6. **Redeploy** from the Deployments tab (or push to `main`).

### Wrong Vercel project got the deploy?

If git pushes show up on `something.vercel.app` but **app.hallaai.com** looks unchanged:

1. [vercel.com/dashboard](https://vercel.com/dashboard) → open the project that lists **app.hallaai.com** under **Domains**.
2. **Settings → Git → Production Branch** → set to **`main`**.
3. **Settings → General → Root Directory** → **`apps/dashboard`**.
4. **Deployments** → find the latest **`main`** deployment → **⋯ → Promote to Production**.
5. Hard-refresh `https://app.hallaai.com` (Ctrl+Shift+R).

Remove **app.hallaai.com** from any other Vercel project (only one project may own a domain).

---

**Architecture**

| Component | Host | URL |
|-----------|------|-----|
| Gateway (API + Twilio + WebSockets) | Render | `https://gateway.hallaai.com` |
| Dashboard (marketing + app) | Vercel | `https://app.hallaai.com` |
| Marketing site | Netlify | `https://www.hallaai.com` |
| Auth + DB | Supabase | — |
| Realtime cache | Render Redis | via `REDIS_URL` on gateway |

---

## 1. Vercel project setup

1. [vercel.com](https://vercel.com) → **Add New Project** → import this Git repo.
2. **Root Directory:** `apps/dashboard`
3. **Framework:** Next.js (auto)
4. **Include files outside root:** enabled (monorepo).
5. **Production branch:** `main`

`apps/dashboard/vercel.json` already defines install/build and redirects `hallaai.com` → `www.hallaai.com`.

---

## Build failed?

| Symptom | Fix |
|---------|-----|
| `Your project's URL and API key are required` | Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel → Environment Variables (Production), then **Redeploy**. |
| Log shows build building **gateway + dashboard** | Set **Root Directory** to `apps/dashboard`. |
| Dashboard says **Cannot reach the Halla AI backend** | Set `NEXT_PUBLIC_GATEWAY_API_URL=https://gateway.hallaai.com` on Vercel. On **Render**, set `ALLOWED_ORIGINS` to include `https://app.hallaai.com` and preview `*.vercel.app` URLs. Redeploy both. |
| AI Agent save / voice preview fails | Redeploy **Render gateway** (needs `OPENAI_API_KEY` for preview + `REDIS_URL` for CSRF). |

---

## 2. Vercel environment variables (Production)

Set in **Project → Settings → Environment Variables** (Production + Preview).

| Variable | Example / notes |
|----------|-----------------|
| `NEXT_PUBLIC_GATEWAY_API_URL` | `https://gateway.hallaai.com` |
| `NEXT_PUBLIC_GATEWAY_WS_URL` | `wss://gateway.hallaai.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_SITE_URL` | `https://www.hallaai.com` |
| `JWT_SECRET` | Same value as Render gateway |

On Vercel, `next.config.js` proxies `/api/v1/*` → gateway using `NEXT_PUBLIC_GATEWAY_API_URL`.

**Required for AI Agent live sync:** set `NEXT_PUBLIC_GATEWAY_WS_URL` to `wss://gateway.hallaai.com` (Next.js does not proxy WebSockets).

**After dashboard deploy:** redeploy the **Render gateway** too if you changed `apps/gateway`.

Optional Preview: add each `https://your-project-*.vercel.app` origin to Render `ALLOWED_ORIGINS`.

---

## 3. Custom domains (Vercel)

1. **Domains** → add `app.hallaai.com` (primary for the SaaS app).
2. Optionally add `www.hallaai.com` if using Vercel for the marketing site (otherwise use Netlify).
3. DNS (at your registrar):

| Type | Name | Value |
|------|------|--------|
| CNAME | `app` | `cname.vercel-dns.com` (use exact target Vercel shows) |
| A / ALIAS | `@` | Vercel apex records (or redirect `@` → `www.hallaai.com`) |

---

## 4. Render gateway (update after Vercel is live)

In **halla-ai-gateway** on Render, set or confirm:

```env
DASHBOARD_URL=https://app.hallaai.com

ALLOWED_ORIGINS=https://www.hallaai.com,https://hallaai.com,https://app.hallaai.com

VOICE_WS_ALLOWED_ORIGINS=https://www.hallaai.com,https://app.hallaai.com

GATEWAY_PUBLIC_URL=https://gateway.hallaai.com
TWILIO_STREAM_WSS_URL=wss://gateway.hallaai.com
```

Health check: `/ready`.

---

## 5. Supabase Auth URLs

**Authentication → URL configuration**

| Field | Value |
|-------|--------|
| Site URL | `https://app.hallaai.com` |
| Redirect URLs | `https://app.hallaai.com/auth/callback` |
| | `https://www.hallaai.com/auth/callback` |
| | `http://localhost:3000/auth/callback` |
| | `https://*.vercel.app/auth/callback` (for preview deploys) |

**Email signup confirmation** — if the confirm link opens `localhost` and fails, Supabase **Site URL** is still set to `http://localhost:3000`. Change it to `https://app.hallaai.com` and save.

**Google sign-in (Supabase)**:

| Where | URI |
|-------|-----|
| Google Cloud → Authorized redirect URIs | `https://<project-ref>.supabase.co/auth/v1/callback` |
| Supabase → Redirect URLs | `https://app.hallaai.com/auth/callback`, `http://localhost:3000/auth/callback` |

---

## 6. Integration OAuth (gateway)

CRM + calendar OAuth callbacks stay on **Render gateway**:

| Integration | Add to provider console |
|-------------|-------------------------|
| Google Calendar | `https://gateway.hallaai.com/api/v1/calendar/google/callback` |
| Outlook | `https://gateway.hallaai.com/api/v1/calendar/outlook/callback` |
| HubSpot / Slack / etc. | `https://gateway.hallaai.com/api/v1/integrations/<provider>/callback` |
| WhatsApp Business (META) | `https://gateway.hallaai.com/api/v1/channels/whatsapp/webhook` |

On Render, set `GOOGLE_REDIRECT_URI` to the same URI as in Google Cloud (or omit — gateway derives from `GATEWAY_PUBLIC_URL`).  
After OAuth connect, users return to `https://app.hallaai.com/dashboard/integrations` via `DASHBOARD_URL`.

---

## 7. Verify deployment

```bash
# Gateway
npm run smoke:prod

# Or with login + SSE
SMOKE_TEST_EMAIL=you@hallaai.com SMOKE_TEST_PASSWORD=*** npm run smoke:prod
```

Manual:

1. Open `https://app.hallaai.com` → Sign up / Log in.
2. Complete onboarding → dashboard loads.
3. Browser DevTools → Network: API calls go to `gateway.hallaai.com`, SSE `/api/v1/dashboard/stream`, WS `wss://gateway.hallaai.com/ws/ai-config/...`.

---

## 7b. Render gateway — required env

| Variable | Notes |
|----------|--------|
| `VOICE_INTERNAL_API_KEY` | Long random string (e.g. `openssl rand -hex 32`). |
| `JWT_SECRET` | Random secret for API tokens |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud → Web client |
| `GOOGLE_REDIRECT_URI` | `https://gateway.hallaai.com/api/v1/calendar/google/callback` |
| `DASHBOARD_URL` | `https://app.hallaai.com` |
| `ALLOWED_ORIGINS` | `https://www.hallaai.com,https://app.hallaai.com` |
| `DEFAULT_TIMEZONE` | `Asia/Dubai` |
| `DEFAULT_CURRENCY` | `AED` |
| `DEFAULT_LANGUAGE` | `ar` |

After changing env vars, **Manual Deploy** the gateway.

---

## 8. Local dev

```bash
npm run dev:gateway   # :3003
npm run dev:dashboard # :3000 with proxy in next.config when GATEWAY_PROXY_URL set
```

Copy `apps/dashboard/.env.local` from `.env.example`.
