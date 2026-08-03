# Deploy dashboard on Vercel (www.calliqlabs.com)

## Migrating from the old static site (HTML + CSS + JS)

Previously **www.calliqlabs.com** may have served three static files (`index.html`, `calliq_styles.css`, `calliq_main.js`) from the repo root or `marketing/`. That setup is **replaced** by the Next.js app in **`apps/dashboard`**, which includes:

| Old static | New app |
|------------|---------|
| `index.html` | `https://www.calliqlabs.com/` → `apps/dashboard/src/app/page.tsx` (marketing home) |
| `calliq_styles.css` | `apps/dashboard/public/calliq-marketing.css` (same design system) |
| `calliq_main.js` (routing) | Next.js routes: `/login`, `/signup`, `/pricing`, `/dashboard`, etc. |

**Do not** deploy static files from the repo root anymore. Update the **same** Vercel project:

1. **Settings → General → Root Directory:** `apps/dashboard` (not `.` or empty).
2. **Include source files outside the Root Directory:** **On** (monorepo).
3. **Framework:** Next.js (clear any “Other” / static-only override).
4. **Build Command** (should match `apps/dashboard/vercel.json`):  
   `cd ../.. && npm run build:dashboard` (syncs marketing + builds Next)
5. **Production Branch:** `main` (must match the branch you push to; preview deploys use other `*.vercel.app` URLs).
6. **Redeploy** from the Deployments tab (or push to `main`).

### Wrong Vercel project got the deploy?

If git pushes show up on `something.vercel.app` but **www.calliqlabs.com** looks unchanged:

1. [vercel.com/dashboard](https://vercel.com/dashboard) → open the project that lists **www.calliqlabs.com** under **Domains** (not a duplicate import of the same repo).
2. **Settings → Git → Production Branch** → set to **`main`**.
3. **Settings → General → Root Directory** → **`apps/dashboard`**.
4. **Deployments** → find the latest **`main`** deployment → **⋯ → Promote to Production**.
5. Hard-refresh `https://www.calliqlabs.com` (Ctrl+Shift+R). The homepage iframe now cache-busts with each deploy (`/index.html?v=<commit>`).

Remove **www.calliqlabs.com** from any other Vercel project (only one project may own a domain).

Your domain **www.calliqlabs.com** stays attached to this project; only what gets built changes from static HTML to the full app.

---

**Architecture**

| Component | Host | URL |
|-----------|------|-----|
| Gateway (API + Twilio + WebSockets) | Render | `https://call-iq-gateway.onrender.com` |
| Dashboard (marketing + app) | Vercel | `https://www.calliqlabs.com` |
| Auth + DB | Supabase | — |
| Realtime cache | Render Redis | via `REDIS_URL` on gateway |

---

## 1. Vercel project setup

1. [vercel.com](https://vercel.com) → **Add New Project** → import this Git repo.
2. **Root Directory:** `apps/dashboard`
3. **Framework:** Next.js (auto)
4. **Include files outside root:** enabled (monorepo; uses `vercel.json` install/build from repo root).
5. **Production branch:** `main` (or your default).

`apps/dashboard/vercel.json` already defines install/build and redirects `calliqlabs.com` → `www.calliqlabs.com`.

---

## Build failed: Supabase env / wrong build command?

| Symptom | Fix |
|---------|-----|
| `Your project's URL and API key are required` on `/forgot-password` | Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in Vercel → Environment Variables (Production), then **Redeploy**. |
| Log shows `call-iq@1.0.0 build` building **gateway + dashboard** | Set **Root Directory** to `apps/dashboard`, or use repo-root `vercel.json` (`buildCommand`: dashboard only). |
| Dashboard says **Cannot reach Call IQ API** | Set `NEXT_PUBLIC_GATEWAY_API_URL=https://call-iq-gateway.onrender.com` on Vercel. On **Render**, set `ALLOWED_ORIGINS` to include `https://www.calliqlabs.com` and preview `*.vercel.app` URLs. Redeploy both. |
| AI Agent save / voice preview fails | Redeploy **Render gateway** (needs `OPENAI_API_KEY` for preview + `REDIS_URL` for CSRF). Check Network tab: `PUT` and `POST /ai-config/test-voice` should return 200 (via `www` proxy or Render). |

Auth will not work in production until real Supabase keys are set — placeholders only unblock the compile.

---

## 2. Vercel environment variables (Production)

Set in **Project → Settings → Environment Variables** (Production + Preview).

| Variable | Example / notes |
|----------|-----------------|
| `NEXT_PUBLIC_GATEWAY_API_URL` | `https://call-iq-gateway.onrender.com` |
| `NEXT_PUBLIC_GATEWAY_WS_URL` | `wss://call-iq-gateway.onrender.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxx.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key |
| `NEXT_PUBLIC_SITE_URL` | `https://www.calliqlabs.com` |
| `JWT_SECRET` | Same value as Render gateway (if server actions need it) |

Do **not** set `GATEWAY_PROXY_URL` or `NEXT_PUBLIC_USE_SAME_ORIGIN_API` manually on Vercel.  
On Vercel, `next.config.js` already proxies `/api/v1/*` → Render using `NEXT_PUBLIC_GATEWAY_API_URL` (same-origin in the browser, no CORS).

**Required for AI Agent live sync:** set `NEXT_PUBLIC_GATEWAY_WS_URL` to `wss://call-iq-gateway.onrender.com` (Next.js does not proxy WebSockets).

**After dashboard deploy:** redeploy the **Render gateway** too if you changed `apps/gateway` (CSRF, `/ai-config`, voice preview). Vercel only ships the Next.js app.

Optional Preview: add each `https://your-project-*.vercel.app` origin to Render `ALLOWED_ORIGINS` and `VOICE_WS_ALLOWED_ORIGINS`.

---

## 3. Custom domains (Vercel)

1. **Domains** → add `www.calliqlabs.com` (primary).
2. Add `calliqlabs.com` → redirect to `www` (also handled in `vercel.json`).
3. DNS (at your registrar):

| Type | Name | Value |
|------|------|--------|
| CNAME | `www` | `cname.vercel-dns.com` (use exact target Vercel shows) |
| A / ALIAS | `@` | Vercel apex records (or redirect `@` → `www`) |

---

## 4. Render gateway (update after Vercel is live)

In **calliq-gateway** on Render, set or confirm:

```env
DASHBOARD_URL=https://www.calliqlabs.com

ALLOWED_ORIGINS=https://www.calliqlabs.com,https://calliqlabs.com,https://call-iq-gateway.onrender.com

VOICE_WS_ALLOWED_ORIGINS=https://www.calliqlabs.com,https://calliqlabs.com

GATEWAY_PUBLIC_URL=https://call-iq-gateway.onrender.com
TWILIO_STREAM_WSS_URL=wss://call-iq-gateway.onrender.com
```

Remove the old **calliq-dashboard** Render web service if still running (dashboard is on Vercel only).

Health check: `/ready` (not `/health`).

---

## 5. Supabase Auth URLs

**Authentication → URL configuration**

| Field | Value |
|-------|--------|
| Site URL | `https://www.calliqlabs.com` |
| Redirect URLs | `https://www.calliqlabs.com/auth/callback` |
| | `https://calliqlabs.com/auth/callback` |
| | `http://localhost:3000/auth/callback` |
| | `https://*.vercel.app/auth/callback` (for preview deploys) |

**Email signup confirmation** — if the confirm link opens `localhost` and fails, Supabase **Site URL** is still set to `http://localhost:3000`. Change it to `https://www.calliqlabs.com` and save. New signups after the app deploy use `emailRedirectTo` → `/auth/callback` on production. For an account already created, use **Authentication → Users → Resend confirmation** or sign up again.

**Google sign-in (Supabase)** — use the **Supabase** Google provider client, not the calendar client:

| Where | URI |
|-------|-----|
| Google Cloud → Authorized redirect URIs | `https://<project-ref>.supabase.co/auth/v1/callback` |
| Supabase → Redirect URLs | `https://www.calliqlabs.com/auth/callback`, `https://calliqlabs.com/auth/callback`, `http://localhost:3000/auth/callback` |

`redirect_uri_mismatch` on login almost always means the **Supabase** callback is missing in Google Cloud, or you opened the site on `calliqlabs.com` without that apex URL in Supabase Redirect URLs.

**GitHub** — same pattern with GitHub OAuth app callback `https://<project-ref>.supabase.co/auth/v1/callback`.

---

## 6. Integration OAuth (gateway)

CRM + calendar OAuth callbacks stay on **Render**:

| Integration | Add to provider console |
|-------------|-------------------------|
| Google Calendar | `https://call-iq-gateway.onrender.com/api/v1/calendar/google/callback` |
| Outlook | `https://call-iq-gateway.onrender.com/api/v1/calendar/outlook/callback` |
| HubSpot / Slack / etc. | `https://call-iq-gateway.onrender.com/api/v1/integrations/<provider>/callback` |

On Render, set `GOOGLE_REDIRECT_URI` to the **same** URI as in Google Cloud (or omit it — gateway derives from `GATEWAY_PUBLIC_URL`).  
After connect, users return to `https://www.calliqlabs.com/dashboard/integrations` via `DASHBOARD_URL`.

---

## 7. Verify deployment

```bash
# Gateway
npm run smoke:prod

# Or with login + SSE
SMOKE_TEST_EMAIL=you@company.com SMOKE_TEST_PASSWORD=*** npm run smoke:prod
```

Manual:

1. Open `https://www.calliqlabs.com` → Sign up / Log in.
2. Complete onboarding → dashboard loads.
3. Browser DevTools → Network: API calls go to `call-iq-gateway.onrender.com`, SSE `/api/v1/dashboard/stream`, WS `wss://call-iq-gateway.onrender.com/ws/ai-config/...`.

---

## 7b. Render gateway — required env (if deploy crashes or calendar OAuth fails)

In **Render → calliq-gateway → Environment**, set at least:

| Variable | Notes |
|----------|--------|
| `VOICE_INTERNAL_API_KEY` | Long random string (e.g. `openssl rand -hex 32`). Required for internal routes; gateway will start without it but logs a warning. |
| `JWT_SECRET` | Random secret for API tokens |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Google Cloud → Web client |
| `GOOGLE_REDIRECT_URI` | `https://call-iq-gateway.onrender.com/api/v1/calendar/google/callback` |
| `DASHBOARD_URL` | `https://www.calliqlabs.com` |
| `ALLOWED_ORIGINS` | `https://www.calliqlabs.com,https://calliqlabs.com` |

After changing env vars, **Manual Deploy** the gateway.

---

## 8. Local dev (unchanged)

```bash
npm run dev:gateway   # :3003
npm run dev:dashboard # :3000 with proxy in next.config when GATEWAY_PROXY_URL set
```

Copy `apps/dashboard/.env.local` from `.env.example`.
