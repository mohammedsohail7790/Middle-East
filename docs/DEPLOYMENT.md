# Deployment Guide

This guide covers production deployment for **Call IQ** — the AI voice agent platform.

## Table of Contents

- [Production Stack](#production-stack)
- [Environment Setup](#environment-setup)
- [Deploy to Render (Gateway)](#deploy-to-render-gateway)
- [Deploy to Vercel (Dashboard)](#deploy-to-vercel-dashboard)
- [Deploy with Docker](#deploy-with-docker)
- [Database Setup](#database-setup)
- [Backup & Recovery](#backup--recovery)
- [Post-Deployment](#post-deployment)

## Production Stack

| Component | Platform | Notes |
|-----------|----------|-------|
| Gateway (API + Voice WebSocket) | [Render](https://render.com) | Defined in `render.yaml` |
| Dashboard (Next.js) | [Vercel](https://vercel.com) | Auto-deploys from `apps/dashboard` |
| Database | [Supabase](https://supabase.com) | PostgreSQL + RLS + pgvector |
| Cache / Sessions | Render Redis | Defined in `render.yaml` |
| Error tracking | Sentry | Set `SENTRY_DSN` in Render dashboard |
| Voice STT | Deepgram | `DEEPGRAM_API_KEY` |
| Voice TTS | ElevenLabs | `ELEVENLABS_API_KEY` |

## Deploy to Render (Gateway)

1. Connect your repo in the Render Dashboard → New → Blueprint
2. Render reads `render.yaml` and creates `calliq-gateway` + `calliq-redis`
3. Set secret env vars in Render Dashboard (all marked `sync: false` in render.yaml):
   - `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`
   - `OPENAI_API_KEY`, `DEEPGRAM_API_KEY`, `ELEVENLABS_API_KEY`
   - `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`
   - `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
   - `SENTRY_DSN` (required for production error tracking)
   - `INTEGRATION_CREDENTIALS_KEY` (32-byte base64: `openssl rand -base64 32`)
4. Run the pre-launch validator before going live:
   ```bash
   node -r ts-node/register apps/gateway/src/validation/pre-launch-validator.ts
   ```

## Deploy to Vercel (Dashboard)

## Environment Setup

### Required Environment Variables

```bash
# Database
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# AI Provider
ANTHROPIC_API_KEY=

# Authentication
JWT_SECRET=

# Billing
POLAR_PRO_PRODUCT_ID=
POLAR_BUSINESS_PRODUCT_ID=

# Application URLs
APP_URL=https://your-domain.com
GATEWAY_URL=https://api.your-domain.com
```

See `.env.example` for all available options.

## Deploy to Vercel

### Dashboard Deployment

1. **Connect GitHub Repository**
   - Go to [Vercel Dashboard](https://vercel.com/dashboard)
   - Click "Import Project"
   - Select your GitHub repository

2. **Configure Build Settings**
   ```bash
   Framework Preset: Next.js
   Root Directory: apps/dashboard
   Build Command: npm run build
   Output Directory: .next
   Install Command: npm install
   ```

3. **Add Environment Variables**
   - Go to Project Settings → Environment Variables
   - Add all required variables from `.env.example`

4. **Deploy**
   - Click "Deploy"
   - Your dashboard will be live at `https://your-project.vercel.app`

### Custom Domain

1. Go to Project Settings → Domains
2. Add your custom domain
3. Configure DNS records as instructed
4. Enable HTTPS (automatic)

## Deploy to Railway

### Gateway Deployment

1. **Create New Project**
   - Go to [Railway](https://railway.app)
   - Click "New Project"
   - Choose "Deploy from GitHub repo"

2. **Configure Service**
   ```bash
   Root Directory: apps/gateway
   Build Command: npm run build -w @gravity/gateway
   Start Command: npm run start -w @gravity/gateway
   ```

3. **Add Environment Variables**
   - Click on service → Variables
   - Add all required variables

4. **Add Redis (Optional)**
   - Click "New" → "Database" → "Redis"
   - Copy the Redis URL to your environment variables

5. **Deploy**
   - Railway will automatically deploy on push to main

## Deploy with Docker

### Prerequisites

- Docker 20.10+
- Docker Compose 2.0+

### Single Server Deployment

1. **Clone and Configure**
   ```bash
   git clone https://github.com/YOUR_USERNAME/Gravity-SaaS-Agent.git
   cd Gravity-SaaS-Agent
   cp .env.example .env
   # Edit .env with your values
   ```

2. **Build and Run**
   ```bash
   docker-compose up -d
   ```

3. **Access Services**
   - Dashboard: `http://localhost:3000`
   - Gateway: `http://localhost:3003`

### Production Docker Setup

1. **Use Production Compose File**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

2. **Enable SSL**
   - Use nginx-proxy or Traefik
   - Configure Let's Encrypt for automatic SSL

3. **Monitoring**
   ```bash
   docker-compose logs -f
   docker stats
   ```

## Deploy to AWS

### Architecture

```
┌─────────────────────────────────────────┐
│  CloudFront (CDN)                       │
└───────────┬─────────────────────────────┘
            │
┌───────────▼─────────────────────────────┐
│  S3 (Static Assets)                     │
└─────────────────────────────────────────┘
            
┌─────────────────────────────────────────┐
│  ECS Fargate (Dashboard)                │
└───────────┬─────────────────────────────┘
            │
┌───────────▼─────────────────────────────┐
│  Application Load Balancer              │
└───────────┬─────────────────────────────┘
            │
┌───────────▼─────────────────────────────┐
│  ECS Fargate (Gateway)                  │
└───────────┬─────────────────────────────┘
            │
┌───────────▼─────────────────────────────┐
│  ElastiCache Redis                      │
└─────────────────────────────────────────┘
```

### Steps

1. **Create ECR Repositories**
   ```bash
   aws ecr create-repository --repository-name gravity-dashboard
   aws ecr create-repository --repository-name gravity-gateway
   ```

2. **Build and Push Images**
   ```bash
   # Login to ECR
   aws ecr get-login-password --region us-east-1 | \
     docker login --username AWS --password-stdin YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com

   # Build and push dashboard
   docker build -t gravity-dashboard apps/dashboard
   docker tag gravity-dashboard:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/gravity-dashboard:latest
   docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/gravity-dashboard:latest

   # Build and push gateway
   docker build -t gravity-gateway apps/gateway
   docker tag gravity-gateway:latest YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/gravity-gateway:latest
   docker push YOUR_ACCOUNT.dkr.ecr.us-east-1.amazonaws.com/gravity-gateway:latest
   ```

3. **Create ECS Cluster**
   ```bash
   aws ecs create-cluster --cluster-name gravity-cluster
   ```

4. **Create Task Definitions**
   - Use the provided `task-definition.json` templates
   - Update with your ECR image URIs
   - Add environment variables

5. **Create Services**
   ```bash
   aws ecs create-service \
     --cluster gravity-cluster \
     --service-name dashboard \
     --task-definition gravity-dashboard \
     --desired-count 2 \
     --launch-type FARGATE
   ```

6. **Configure Load Balancer**
   - Create Application Load Balancer
   - Add target groups for dashboard and gateway
   - Configure health checks

## Database Setup

### Supabase Setup

1. **Create Project**
   - Go to [Supabase Dashboard](https://app.supabase.com)
   - Click "New Project"
   - Choose your organization and region

2. **Run Schema**
   - Go to SQL Editor
   - Copy contents of `supabase/schema.sql`
   - Execute the script

3. **Enable RLS**
   - Go to Authentication → Policies
   - Enable Row Level Security on all tables
   - Policies are included in schema.sql

4. **Get Credentials**
   - Go to Project Settings → API
   - Copy `URL` and `anon/public` key
   - Copy `service_role` key (keep secret!)

### Backup & Recovery

**RTO target: 30 minutes | RPO target: 1 hour**

#### Supabase Point-in-Time Recovery (PITR)
Enable PITR in Supabase Dashboard → Project Settings → Database → Point in Time Recovery.
Supabase Pro includes 7-day PITR. This is your primary recovery mechanism.

#### Migration Rollback
There are no down-migrations. Rollback procedure:
1. Identify the PITR timestamp just before the bad migration ran
2. Restore from that snapshot in Supabase Dashboard → Backups
3. Roll back the gateway image to the previous Render deploy
4. Re-run the app — the schema will match the restored DB

#### Manual Backup
```bash
pg_dump "$DATABASE_URL" --format=custom --no-acl --no-owner \
  -f "calliq-backup-$(date +%Y%m%d-%H%M%S).dump"
```

#### Render Redis
Render Redis Starter does not persist data across restarts (in-memory only). Sessions and rate-limit state will reset on Redis restart — this is acceptable as calls auto-reconnect. If persistence is required, upgrade to a Redis plan with AOF/RDB or use Redis Cloud.

## Post-Deployment

### Verify Deployment

1. **Health Checks**
   ```bash
   curl https://your-domain.com/health
   curl https://api.your-domain.com/health
   ```

2. **Test Authentication**
   - Visit your dashboard
   - Sign up for a new account
   - Verify email delivery

3. **Test Agent Creation**
   - Create a test agent
   - Send test messages
   - Check analytics

### Configure DNS

```bash
# A Records
your-domain.com         → Vercel IP or ALB
api.your-domain.com     → Railway IP or ALB

# CNAME Records
www.your-domain.com     → your-domain.com
```

### SSL/TLS

- Vercel: Automatic SSL
- Railway: Automatic SSL
- AWS: Use ACM certificates
- Docker: Use Let's Encrypt

### Monitoring

1. **Application Monitoring**
   - Set up Sentry for error tracking
   - Configure Plausible for analytics

2. **Infrastructure Monitoring**
   - CloudWatch (AWS)
   - Vercel Analytics
   - Railway Metrics

3. **Alerts**
   - Set up alerts for:
     - High error rates
     - Slow response times
     - High resource usage
     - Failed deployments

### Performance Optimization

1. **CDN Configuration**
   - Enable CloudFront for static assets
   - Configure cache headers
   - Enable compression

2. **Database Optimization**
   - Enable connection pooling
   - Add indexes for frequent queries
   - Monitor slow queries

3. **Caching Strategy**
   - Redis for session storage
   - Application-level caching
   - CDN caching for static content

### Security Checklist

- [ ] Enable HTTPS everywhere
- [ ] Configure CORS properly
- [ ] Set up rate limiting
- [ ] Enable security headers
- [ ] Rotate secrets regularly
- [ ] Set up firewall rules
- [ ] Enable DDoS protection
- [ ] Configure backup strategy

## Troubleshooting

### Common Issues

1. **Build Failures**
   ```bash
   # Clear cache and rebuild
   npm run clean
   npm install
   npm run build
   ```

2. **Database Connection**
   - Verify Supabase credentials
   - Check network connectivity
   - Ensure RLS policies are correct

3. **Environment Variables**
   - Verify all required vars are set
   - Check for typos
   - Ensure no trailing spaces

### Getting Help

- GitHub Issues: [github.com/YOUR_USERNAME/Gravity-SaaS-Agent/issues](https://github.com/YOUR_USERNAME/Gravity-SaaS-Agent/issues)
- Discord Community: [your-discord-link]
- Email Support: support@gravity.ai

---

Need help with deployment? [Open an issue](https://github.com/YOUR_USERNAME/Gravity-SaaS-Agent/issues/new) or reach out to our team!
