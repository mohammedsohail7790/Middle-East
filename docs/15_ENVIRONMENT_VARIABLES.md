# 15 — ENVIRONMENT VARIABLES

## Gateway (Render)

### Required — Core

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment | `production` |
| `PORT` | Server port | `3003` |
| `DATABASE_URL` | Supabase pooler connection string | `postgresql://postgres.[ref]:[pass]@aws-0-us-east-1.pooler.supabase.com:6543/postgres` |
| `GATEWAY_DATABASE_URL` | Same as DATABASE_URL (alias) | Same |
| `PGSSLMODE` | PostgreSQL SSL mode | `require` |
| `REDIS_URL` | Upstash Redis (TLS) | `rediss://default:[pass]@[host].upstash.io:6379` |
| `JWT_SECRET` | JWT signing secret (32+ chars) | Auto-generated |

### Required — Integrations

| Variable | Description | Example |
|----------|-------------|---------|
| `OPENAI_API_KEY` | OpenAI API key | `sk-proj-...` |
| `TWILIO_AUTH_TOKEN` | Twilio auth token | `32-char string` |
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signing | `whsec_...` |

### Required — Stripe Price IDs

| Variable | Description |
|----------|-------------|
| `STRIPE_ESSENTIAL_PRICE_ID` | Essential plan price ID |
| `STRIPE_ESSENTIAL_OVERAGE_ID` | Essential overage price ID |
| `STRIPE_PROFESSIONAL_PRICE_ID` | Professional plan price ID |
| `STRIPE_PROFESSIONAL_OVERAGE_ID` | Professional overage price ID |
| `STRIPE_ENTERPRISE_PRICE_ID` | Enterprise plan price ID |
| `STRIPE_ENTERPRISE_OVERAGE_ID` | Enterprise overage price ID |

### Optional — Voice

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_MODEL` | `gpt-4o-mini` | LLM model for text completions |
| `OPENAI_TIMEOUT_MS` | `5000` | OpenAI API timeout |
| `OPENAI_EMBEDDING_MODEL` | `text-embedding-3-small` | Embedding model |
| `OPENAI_EMBEDDING_TIMEOUT_MS` | `15000` | Embedding timeout |
| `DEEPGRAM_API_KEY` | — | Deepgram STT (fallback) |
| `ELEVENLABS_API_KEY` | — | ElevenLabs TTS (Professional+) |
| `TWILIO_STREAM_WSS_URL` | — | Twilio stream URL override |

### Optional — Voice Limits

| Variable | Default | Description |
|----------|---------|-------------|
| `VOICE_MAX_GLOBAL_CONCURRENT_CALLS` | `300` | System-wide call limit |
| `VOICE_MAX_TENANT_CONCURRENT_CALLS` | `25` | Per-tenant call limit |
| `VOICE_MAX_CALL_DURATION_MS` | `900000` (15 min) | Max call duration |
| `VOICE_MAX_TOKENS_PER_CALL` | `5000` | Token budget per call |
| `VOICE_MAX_SILENCE_PROMPTS` | `3` | Silence prompts before hangup |
| `VOICE_RATE_LIMIT_WINDOW_MS` | `60000` | WS rate limit window |
| `VOICE_RATE_LIMIT_MAX` | `60` | WS rate limit max |
| `VOICE_WS_INACTIVITY_TIMEOUT_MS` | `45000` | WS inactivity timeout |
| `VOICE_CONCURRENCY_KEY_TTL_SECONDS` | `120` | Redis concurrency TTL |
| `VOICE_USAGE_KEY_TTL_SECONDS` | `604800` | Redis usage TTL |

### Optional — Security

| Variable | Default | Description |
|----------|---------|-------------|
| `VOICE_INTERNAL_API_KEY` | Auto-generated | Internal service auth |
| `ADMIN_API_KEY` | Auto-generated | Admin endpoint auth |
| `ALLOWED_ORIGINS` | `http://localhost:3000` | CORS origins (comma-separated) |
| `VOICE_WS_ALLOWED_ORIGINS` | — | WebSocket CORS |
| `VOICE_WS_ALLOWED_IPS` | — | IP whitelist for WS |
| `TWILIO_ALLOWED_IPS` | — | Twilio IP whitelist |
| `RATE_LIMIT_WINDOW_MS` | `900000` | HTTP rate limit window |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | HTTP rate limit max |

### Optional — Calendar

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | Google OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `GOOGLE_REDIRECT_URI` | OAuth redirect URI |

### Optional — Email

| Variable | Description |
|----------|-------------|
| `SMTP_HOST` | SMTP server host |
| `SMTP_PORT` | SMTP port |
| `SMTP_USER` | SMTP username |
| `SMTP_PASS` | SMTP password |

### Optional — Monitoring

| Variable | Description |
|----------|-------------|
| `SENTRY_DSN` | Sentry error tracking |
| `LOG_LEVEL` | Logging level (default: `info`) |
| `ENABLE_KNOWLEDGE_INGESTION` | Enable boot-time KB ingestion (default: `true`) |

### Optional — Alerts

| Variable | Description |
|----------|-------------|
| `VOICE_ALERT_WEBHOOK_URL` | Slack/webhook for alerts |
| `VOICE_ALERT_ERROR_RATE_THRESHOLD` | Error rate alert threshold |
| `VOICE_ALERT_LATENCY_MS_THRESHOLD` | Latency alert threshold |

---

## Dashboard (Vercel)

| Variable | Description | Example |
|----------|-------------|---------|
| `NEXT_PUBLIC_GATEWAY_API_URL` | Gateway URL | `https://calliq-gateway.onrender.com` |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL | `https://[ref].supabase.co` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase anon key | `eyJ...` |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role | `eyJ...` |
| `NEXT_PUBLIC_VOICE_INTERNAL_API_KEY` | Gateway internal key | From Render |
| `JWT_SECRET` | JWT secret (shared with gateway) | From Render |

---

## Security Notes

- Never commit `.env` files
- Use Render's "sync: false" for secrets (manual entry)
- Use `generateValue: true` for auto-generated secrets
- Rotate `JWT_SECRET` and `STRIPE_WEBHOOK_SECRET` periodically
- `DATABASE_URL` must use port 6543 (pooler) not 5432 (direct)
- `REDIS_URL` must use `rediss://` (TLS) in production
