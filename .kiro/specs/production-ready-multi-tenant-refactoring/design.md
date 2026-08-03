# Design Document: Production-Ready Multi-Tenant AI Voice Agent

## Overview

This design transforms the existing Call IQ voice agent platform into a production-ready, multi-tenant SaaS system. The system handles real-time voice calls through Twilio, processes audio through a streaming pipeline (Deepgram STT → OpenAI LLM → ElevenLabs TTS), and dynamically adapts AI behavior per tenant using phone number-based resolution.

**Core Architecture**: Single unified voice gateway that resolves tenant configuration at call initiation and maintains tenant context throughout the real-time voice pipeline.

**Key Design Principles**:
- Preserve existing working Twilio + WebSocket flow
- Add reliability through fail-safe error handling
- Ensure multi-tenant isolation at every layer
- Minimize latency in real-time voice processing
- Deploy as a monolithic service for simplicity

## Architecture

### System Components

```
┌─────────────┐
│   Twilio    │
│  (Phone)    │
└──────┬──────┘
       │ HTTP POST /api/voice/incoming-call
       ▼
┌─────────────────────────────────────────┐
│         Voice Gateway Service           │
│  ┌───────────────────────────────────┐  │
│  │  1. Tenant Resolver               │  │
│  │     - Phone → Tenant Lookup       │  │
│  │     - Config Loading              │  │
│  └───────────────────────────────────┘  │
│                                          │
│  ┌───────────────────────────────────┐  │
│  │  2. WebSocket Handler             │  │
│  │     - Session Initialization      │  │
│  │     - Tenant Context Injection    │  │
│  └───────────────────────────────────┘  │
│                                          │
│  ┌───────────────────────────────────┐  │
│  │  3. Audio Pipeline                │  │
│  │     ┌─────────────────────────┐   │  │
│  │     │ STT (Deepgram)          │   │  │
│  │     └──────────┬──────────────┘   │  │
│  │                ▼                   │  │
│  │     ┌─────────────────────────┐   │  │
│  │     │ LLM (OpenAI)            │   │  │
│  │     │ + Tenant Prompt         │   │  │
│  │     └──────────┬──────────────┘   │  │
│  │                ▼                   │  │
│  │     ┌─────────────────────────┐   │  │
│  │     │ TTS (ElevenLabs)        │   │  │
│  │     │ + Tenant Voice          │   │  │
│  │     └─────────────────────────┘   │  │
│  └───────────────────────────────────┘  │
│                                          │
│  ┌───────────────────────────────────┐  │
│  │  4. Fail-Safe Handler             │  │
│  │     - Error Recovery              │  │
│  │     - Fallback Responses          │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
       │
       ▼
┌─────────────────┐
│   Supabase      │
│   PostgreSQL    │
│   - voice_tenants
│   - calls       │
│   - leads       │
└─────────────────┘
```

### Deployment Architecture

**Monolithic Service Deployment**:
- Single Node.js/TypeScript application
- Deployed on Render or Railway
- HTTPS endpoint for Twilio webhooks
- WSS endpoint for WebSocket connections
- Horizontal scaling via multiple instances (stateless design)

**Database**:
- Managed PostgreSQL (Supabase)
- Connection pooling via pg Pool
- Row-level security for tenant isolation

**External Services**:
- Deepgram (STT): WebSocket streaming connection
- OpenAI (LLM): REST API with 10s timeout
- ElevenLabs (TTS): REST API with 8s timeout
- Twilio (Phone): WebSocket for audio streaming

## Components and Interfaces

### 1. Tenant Resolver

**Purpose**: Map incoming Twilio phone numbers to tenant configurations

**Interface**:
```typescript
interface TenantResolver {
  getTenantByPhone(phoneNumber: string): Promise<TenantInfo | null>
}

interface TenantInfo {
  id: string
  businessName: string
  phoneNumber: string
}
```

**Implementation**:
- Extract `To` field from Twilio webhook request body (E.164 format)
- Query `voice_tenants` table: `SELECT id, company_name, phone_number WHERE phone_number = $1`
- Return null if no tenant found (triggers fallback TwiML)
- Cache tenant lookups in Redis (120s TTL) for performance

**Error Handling**:
- Database connection failure → Return fallback TwiML (never 500)
- No tenant found → Return "not configured" TwiML message
- Invalid phone format → Normalize and retry once

### 2. WebSocket Session Initialization

**Purpose**: Load tenant configuration and initialize call session when WebSocket connects

**Interface**:
```typescript
interface WebSocketHandler {
  onConnection(socket: WebSocket, request: IncomingMessage): Promise<void>
  loadTenantConfig(tenantId: string): Promise<TenantVoiceConfig>
}

interface TenantVoiceConfig {
  tenantId: string
  businessName: string
  systemPrompt: string
  voiceId: string
  defaultLanguage: string
  services: string[]
  tone: string
  questions: string[]
  diagnosticFee: number
  transferPhoneNumber?: string
  callHandlingMode: 'message' | 'transfer' | 'both'
}
```

**Implementation Flow**:
1. Parse WebSocket URL: `/ws/voice/{tenantId}`
2. Extract `tenantId` from URL path
3. Query database for complete tenant configuration
4. Attach session data to WebSocket connection:
   ```typescript
   ws.session = {
     tenant: TenantVoiceConfig,
     callSession: CallSession,
     pipeline: AudioPipeline,
     lastAudioAt: Date.now(),
     state: 'active'
   }
   ```
5. Initialize AudioPipeline with tenant config
6. Log connection with tenant business name

**Error Handling**:
- Missing tenantId in URL → Close socket with 1008 "Missing tenant id"
- Tenant config not found → Close socket with 1011 "Tenant configuration error"
- Database timeout → Close socket with 1011 "Configuration load timeout"

### 3. Real-Time Voice Pipeline

**Purpose**: Process audio through STT → LLM → TTS with tenant-specific configuration

**Interface**:
```typescript
interface AudioPipeline {
  start(): Promise<void>
  onTwilioMedia(base64Audio: string): void
  processTranscript(text: string, isFinal: boolean): Promise<void>
  close(): Promise<void>
}

interface STTService {
  connect(onTranscript: TranscriptCallback, language: string): Promise<void>
  sendAudio(base64Audio: string): void
  close(): Promise<void>
}

interface LLMService {
  generateReply(
    tenantConfig: TenantVoiceConfig,
    transcript: TranscriptTurn[],
    language: string
  ): Promise<AIResponse>
}

interface TTSService {
  setVoiceId(voiceId: string): void
  synthesizeToTwilio(text: string): Promise<string | null>
}
```

**Data Flow**:

```
Twilio Audio (μ-law 8kHz)
    │
    ▼
[WebSocket] media event
    │
    ▼
[STT Service] Deepgram WebSocket
    │ (streaming transcription)
    ▼
Partial Transcript (debounced 600ms)
Final Transcript
    │
    ▼
[LLM Service] OpenAI API
    │ Input: system_prompt + conversation history + current transcript
    │ Output: reply text + extracted lead data
    ▼
AI Response Text
    │
    ▼
[TTS Service] ElevenLabs API
    │ Input: text + tenant voice_id
    │ Output: μ-law 8kHz audio
    ▼
Base64 Audio Chunks
    │
    ▼
[WebSocket] media event back to Twilio
    │
    ▼
Caller hears response
```

**Tenant Context Injection Points**:

1. **STT Configuration**:
   - Language: `tenant.defaultLanguage` (en, hi, ur)
   - Deepgram URL: `wss://api.deepgram.com/v1/listen?language={tenant.defaultLanguage}`

2. **LLM Prompt Construction**:
   ```typescript
   const systemPrompt = `
   You are an AI phone receptionist.
   Business: ${tenant.businessName}
   Services: ${tenant.services.join(', ')}
   Tone: ${tenant.tone}
   Language: ${language}
   Diagnostic Fee: $${tenant.diagnosticFee}
   Questions: ${tenant.questions.join('\n')}
   
   Keep responses under 2 short sentences.
   Respond ONLY in this language.
   `
   ```

3. **TTS Voice Selection**:
   - Voice ID: `tenant.voiceId` (ElevenLabs voice identifier)
   - Language: Detected from first transcript or `tenant.defaultLanguage`

**Audio Format Conversions**:
- Twilio → STT: Base64 decode → raw μ-law 8kHz buffer
- TTS → Twilio: ElevenLabs returns μ-law 8kHz → Base64 encode

### 4. Configuration-Driven Behavior

**Purpose**: All AI behavior driven by database configuration, no hardcoded logic

**Configuration Loading**:
```sql
SELECT
  id as tenant_id,
  company_name as business_name,
  voice_services as services,
  voice_tone as tone,
  voice_questions as questions,
  default_language,
  timezone,
  diagnostic_fee,
  transfer_phone_number,
  call_handling_mode,
  zapier_webhook_url
FROM voice_tenants
WHERE id = $1
```

**Default Values** (when tenant fields are NULL):
```typescript
const defaults = {
  tone: 'friendly, concise, and professional',
  services: [],
  questions: ['Collect customer name, phone, requested service, and preferred time'],
  defaultLanguage: 'en',
  diagnosticFee: 125,
  callHandlingMode: 'message'
}
```

**Configuration Cache**:
- Redis key: `voice:tenant:{tenantId}`
- TTL: 120 seconds
- Invalidation: Manual via cache tag `voice-tenant:{tenantId}`

### 5. Fail-Safe and Fallback Handling

**Purpose**: Graceful degradation when external services fail

**Error Handling Strategy**:

| Component | Failure Scenario | Fallback Action | User Impact |
|-----------|------------------|-----------------|-------------|
| Tenant Resolution | DB timeout | Return "try again later" TwiML | Call ends gracefully |
| Tenant Resolution | No tenant found | Return "not configured" TwiML | Call ends gracefully |
| WebSocket Init | Config load fails | Close socket 1011 | Call ends before audio |
| STT Connection | Deepgram down | Send fallback TTS, continue | AI responds without hearing |
| STT Transcript | Parse error | Log and skip | Continue with next audio |
| LLM API | Timeout (>10s) | Return "Could you repeat that?" | Caller repeats |
| LLM API | Rate limit | Return "Please hold" + retry once | Brief delay |
| TTS API | Timeout (>8s) | Send pre-recorded fallback audio | Generic voice response |
| TTS API | Voice ID invalid | Fall back to default voice | Different voice |
| WebSocket | Connection lost | Close pipeline, store call data | Call ends |

**Implementation Pattern**:
```typescript
try {
  const aiResponse = await llmService.generateReply(...)
} catch (error) {
  logger.error('LLM failure', { error, callId, tenantId })
  voiceMetrics.callFailed(tenantId, 'llm_timeout')
  
  // Fallback response
  const fallbackText = 'Could you repeat that for me?'
  await ttsService.synthesizeToTwilio(fallbackText)
  
  // Continue call (don't crash)
  return
}
```

**Critical Rule**: NEVER return HTTP 500 to Twilio webhooks. Always return valid TwiML.

```typescript
router.post('/incoming-call', async (req, res) => {
  try {
    // ... tenant resolution logic
  } catch (error) {
    logger.error('Unhandled error', { error })
    
    // Always return valid TwiML
    return res.type('text/xml').send(`<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say>We're experiencing technical difficulties. Please try again later.</Say>
  <Hangup/>
</Response>`)
  }
})
```

## Data Models

### Database Schema

**voice_tenants** (existing, no changes needed):
```sql
CREATE TABLE voice_tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES auth.users(id) NOT NULL,
  company_name TEXT NOT NULL,
  phone_number TEXT NOT NULL UNIQUE,
  default_language TEXT DEFAULT 'en' NOT NULL,
  timezone TEXT DEFAULT 'UTC' NOT NULL,
  diagnostic_fee NUMERIC DEFAULT 125 NOT NULL,
  transfer_phone_number TEXT,
  call_handling_mode TEXT DEFAULT 'message' NOT NULL,
  
  -- Voice AI configuration
  voice_services JSONB DEFAULT '[]'::jsonb NOT NULL,
  voice_tone TEXT DEFAULT 'friendly, concise, and professional' NOT NULL,
  voice_questions JSONB DEFAULT '[]'::jsonb NOT NULL,
  
  -- Integration webhooks
  zapier_webhook_url TEXT,
  
  metadata JSONB DEFAULT '{}'::jsonb NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
)
```

**calls** (existing, no changes needed):
```sql
CREATE TABLE calls (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES voice_tenants(id) NOT NULL,
  call_sid TEXT NOT NULL UNIQUE,
  transcript TEXT,
  recording_url TEXT,
  language TEXT,
  latency INTEGER DEFAULT 0 NOT NULL,
  duration_ms INTEGER DEFAULT 0 NOT NULL,
  outcome TEXT,
  missed_reason TEXT,
  transfer_target TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
)

CREATE INDEX idx_calls_tenant_id ON calls(tenant_id);
CREATE INDEX idx_calls_created_at ON calls(created_at DESC);
```

**leads** (existing, no changes needed):
```sql
CREATE TABLE leads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES voice_tenants(id) NOT NULL,
  call_id UUID,
  name TEXT,
  phone TEXT,
  service TEXT,
  notes TEXT,
  preferred_time TEXT,
  fingerprint TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
)

CREATE INDEX idx_leads_tenant_id ON leads(tenant_id);
CREATE INDEX idx_leads_call_id ON leads(call_id);
CREATE UNIQUE INDEX idx_leads_tenant_fingerprint_unique 
  ON leads(tenant_id, fingerprint) WHERE fingerprint IS NOT NULL;
```

### Call Context Storage

**In-Memory Session State** (per WebSocket connection):
```typescript
interface CallSessionState {
  // Identity
  callId: string
  callSid: string
  tenantId: string
  
  // Tenant Configuration (loaded once at connection)
  tenant: TenantVoiceConfig
  
  // Conversation State
  transcript: TranscriptTurn[]
  extractedLead: VoiceLeadPayload
  language: string
  
  // Pipeline State
  isSpeaking: boolean
  wasInterrupted: boolean
  lastAudioAt: number
  
  // Metrics
  startedAt: number
  latencyMs: number[]
  estimatedTokens: number
}
```

**Redis Session Tracking** (for concurrency limits):
```
Key: active_calls:{tenantId}
Type: SET
Members: [callId1, callId2, ...]
TTL: 120 seconds
```

## Error Handling

### Error Categories and Responses

**1. Tenant Resolution Errors**:
- **Database Connection Failure**: Return TwiML with "technical difficulties" message
- **Tenant Not Found**: Return TwiML with "not configured" message
- **Invalid Phone Format**: Normalize (remove non-digits except +) and retry once

**2. WebSocket Initialization Errors**:
- **Missing Tenant ID**: Close socket 1008 "Missing tenant id"
- **Config Load Failure**: Close socket 1011 "Tenant configuration error"
- **Duplicate Call Session**: Close socket 1008 "Duplicate call session"

**3. Audio Pipeline Errors**:
- **STT Connection Failure**: Log error, send fallback TTS, continue call
- **STT Transcript Parse Error**: Log warning, skip transcript, continue
- **LLM Timeout (>10s)**: Send "Could you repeat that?", continue
- **LLM Rate Limit**: Send "Please hold", retry once with exponential backoff
- **TTS Timeout (>8s)**: Send pre-recorded fallback audio, continue
- **TTS Voice ID Invalid**: Fall back to default voice for language

**4. WebSocket Connection Errors**:
- **Connection Lost**: Close pipeline gracefully, store call data, release resources
- **Message Parse Error**: Log error, send error event to client, continue
- **Inactivity Timeout (45s)**: Close connection, store call data

### Timeout Configuration

```typescript
const timeouts = {
  tenantResolution: 200,      // ms - database query
  websocketInit: 500,         // ms - config loading
  sttFinalization: 5000,      // ms - transcript finalization
  llmApi: 10000,              // ms - OpenAI API call
  ttsApi: 8000,               // ms - ElevenLabs API call
  websocketInactivity: 45000, // ms - no audio received
  maxCallDuration: 900000,    // ms - 15 minutes
}
```

### Logging Strategy

**Structured JSON Logs** with fields:
```typescript
interface LogEntry {
  level: 'INFO' | 'WARN' | 'ERROR'
  timestamp: string
  message: string
  callId?: string
  tenantId?: string
  businessName?: string
  component: string
  error?: string
  stack?: string
  metadata?: Record<string, any>
}
```

**Key Log Points**:
1. Tenant resolution: `{ callId, tenantId, businessName, phoneNumber }`
2. WebSocket connection: `{ callId, tenantId, event: 'connected' }`
3. Call start: `{ callId, callSid, tenantId, language }`
4. STT transcript: `{ callId, tenantId, text, isFinal, timing }`
5. LLM request: `{ callId, tenantId, requestTiming, responseTiming, tokens }`
6. TTS generation: `{ callId, tenantId, timing, audioDuration }`
7. Call end: `{ callId, tenantId, durationMs, latencyAvg, outcome }`
8. Errors: `{ callId, tenantId, component, error, stack }`

## Testing Strategy

### Unit Tests

**Tenant Resolver**:
- Test phone number normalization (E.164 format)
- Test database query with valid/invalid phone numbers
- Test fallback when tenant not found
- Test error handling for database timeouts

**WebSocket Handler**:
- Test tenant ID extraction from URL
- Test config loading success/failure
- Test session initialization
- Test connection rejection for invalid sources

**Audio Pipeline**:
- Test audio format conversions (base64 ↔ buffer)
- Test transcript processing (partial vs final)
- Test LLM prompt construction with tenant config
- Test TTS voice ID injection
- Test error recovery for each service failure

**Fail-Safe Handler**:
- Test fallback responses for each error type
- Test that errors never crash the WebSocket
- Test that Twilio webhooks never return 500

### Integration Tests

**End-to-End Call Flow**:
1. POST to `/api/voice/incoming-call` with Twilio payload
2. Verify TwiML response contains correct WebSocket URL
3. Connect WebSocket to `/ws/voice/{tenantId}`
4. Send Twilio `start` event
5. Send Twilio `media` events (base64 audio)
6. Verify STT transcripts are processed
7. Verify LLM responses are generated
8. Verify TTS audio is sent back
9. Send Twilio `stop` event
10. Verify call data is stored in database

**Multi-Tenant Isolation**:
1. Create two test tenants with different configs
2. Initiate calls to both phone numbers
3. Verify each call uses correct tenant config
4. Verify call data is stored with correct tenant_id
5. Verify no data leakage between tenants

**Failure Scenarios**:
- Test STT service unavailable
- Test LLM API timeout
- Test TTS API timeout
- Test database connection failure
- Test WebSocket disconnection mid-call

### Load Testing

**Concurrency Test**:
- Simulate 50 concurrent calls
- Verify all calls complete successfully
- Verify latency remains under 3 seconds
- Verify no memory leaks

**Stress Test**:
- Simulate 100 concurrent calls
- Verify graceful degradation
- Verify error rates stay under 5%
- Verify system recovers after load drops

## Production Deployment Infrastructure

### Hosting Platform: Render

**Service Configuration**:
```yaml
# render.yaml
services:
  - type: web
    name: calliq-voice-gateway
    env: node
    region: oregon  # or your preferred region
    plan: starter  # upgrade to standard/pro for production
    buildCommand: npm install && npm run build
    startCommand: npm run start:prod
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000  # Render default
      - key: DOMAIN
        value: api.calliqlabs.com
    healthCheckPath: /health
    autoDeploy: true
    branch: main
```

**Custom Domain Setup on Render**:
1. Go to Render Dashboard → Your Service → Settings
2. Add custom domain: `api.calliqlabs.com`
3. Render provides SSL certificate automatically (Let's Encrypt)
4. Update DNS: Add CNAME record pointing to Render's URL
5. Wait for DNS propagation (~5-10 minutes)

**Scaling Configuration**:
```yaml
# For production, upgrade plan and configure:
services:
  - type: web
    name: calliq-voice-gateway
    plan: standard  # or pro
    numInstances: 2  # minimum instances
    scaling:
      minInstances: 2
      maxInstances: 10
      targetMemoryPercent: 80
      targetCPUPercent: 70
```

**Environment Variables** (required):
```bash
# Database
DATABASE_URL=postgresql://...

# AI Providers
OPENAI_API_KEY=sk-...
DEEPGRAM_API_KEY=...
ELEVENLABS_API_KEY=...

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_STREAM_WSS_URL=wss://api.calliqlabs.com

# Redis (optional, for caching)
REDIS_URL=redis://...

# Security
VOICE_INTERNAL_API_KEY=...
JWT_SECRET=...

# Timeouts
OPENAI_TIMEOUT_MS=10000
VOICE_SILENCE_TIMEOUT_MS=6000
VOICE_WS_INACTIVITY_TIMEOUT_MS=45000
VOICE_MAX_CALL_DURATION_MS=900000
```

### HTTPS/WSS Endpoints

**Twilio Webhook Endpoint**:
- URL: `https://api.calliqlabs.com/api/voice/incoming-call`
- Method: POST
- Content-Type: application/x-www-form-urlencoded
- Response: text/xml (TwiML)

**WebSocket Endpoint**:
- URL: `wss://api.calliqlabs.com/ws/voice/{tenantId}`
- Protocol: WebSocket (RFC 6455)
- Origin Validation: Twilio IPs only

**Health Check Endpoint**:
- URL: `https://api.calliqlabs.com/health`
- Method: GET
- Response: JSON `{ "status": "ok", "timestamp": "..." }`

### Horizontal Scaling

**Stateless Design**:
- No in-memory session sharing between instances
- Each WebSocket connection handled by single instance
- Database and Redis provide shared state

**Load Balancing**:
- Render handles load balancing automatically
- WebSocket connections use sticky sessions (automatic)
- HTTP requests distributed round-robin

**Scaling Triggers**:
- CPU > 70% for 5 minutes → Scale up
- Memory > 80% for 5 minutes → Scale up
- Active connections > 80% capacity → Scale up
- CPU < 30% for 10 minutes → Scale down

**Render-Specific Features**:
- Automatic SSL/TLS certificates (Let's Encrypt)
- Built-in DDoS protection
- Automatic health checks
- Zero-downtime deploys
- Persistent disk storage (if needed)

### Database Connection Pooling

```typescript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 20,                    // Max connections per instance
  idleTimeoutMillis: 30000,   // Close idle connections after 30s
  connectionTimeoutMillis: 2000, // Fail fast on connection timeout
})
```

**Connection Limits**:
- Supabase free tier: 60 connections
- 2 Render instances × 20 connections = 40 connections
- Reserve 20 connections for dashboard/admin

**Render PostgreSQL Alternative**:
- If using Render's managed PostgreSQL instead of Supabase:
  - Starter plan: 97 connections
  - Standard plan: 197 connections
  - Pro plan: 397 connections

### Monitoring and Alerts

**Health Check**:
```typescript
app.get('/health', async (req, res) => {
  try {
    // Check database
    await pool.query('SELECT 1')
    
    // Check Redis (if used)
    if (redis) await redis.ping()
    
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    })
  } catch (error) {
    res.status(503).json({
      status: 'error',
      error: String(error),
    })
  }
})
```

**Metrics to Track**:
- Active WebSocket connections
- Average call duration
- Average latency (STT, LLM, TTS)
- Error rates by component
- Database connection pool usage

**Render Built-in Metrics**:
- CPU usage (%)
- Memory usage (MB)
- Request count
- Response time (ms)
- HTTP status codes

**Alert Thresholds**:
- Error rate > 20% for 5 minutes
- Average latency > 3 seconds for 5 minutes
- Database connection pool > 90% for 2 minutes
- Health check failures > 3 consecutive
- Memory usage > 90% for 5 minutes

### Deployment Checklist

**Pre-Deployment**:
- [ ] All environment variables configured
- [ ] Database migrations applied
- [ ] Twilio webhook URL updated to production domain
- [ ] SSL certificate valid
- [ ] Health check endpoint responding

**Post-Deployment**:
- [ ] Test call to production phone number
- [ ] Verify tenant resolution works
- [ ] Verify WebSocket connection establishes
- [ ] Verify audio pipeline processes correctly
- [ ] Verify call data stored in database
- [ ] Monitor logs for errors
- [ ] Check metrics dashboard

**Rollback Plan**:
- Keep previous deployment active
- Update Twilio webhook URL back to previous domain
- Database schema is backward compatible (no breaking changes)

## Summary

This design provides a production-ready, multi-tenant AI voice agent platform that:

1. **Resolves tenants** by phone number at call initiation
2. **Loads configuration** dynamically from database
3. **Processes audio** through real-time STT → LLM → TTS pipeline
4. **Injects tenant context** at every stage (language, prompts, voice)
5. **Handles failures gracefully** with fallback responses
6. **Stores call data** with proper tenant isolation
7. **Deploys as monolith** on Render/Railway with horizontal scaling
8. **Maintains reliability** through timeouts, error handling, and health checks

The system preserves the existing working Twilio + WebSocket flow while adding production-grade reliability, multi-tenancy, and fail-safe behavior. All AI behavior is configuration-driven with no hardcoded tenant-specific logic.

