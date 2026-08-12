# Halla AI System Architecture

> Formerly Call IQ — rebranded for the GCC / Middle East market.
> Domain: hallaai.com | Primary languages: Arabic (ar), English (en)
> Default timezone: Asia/Dubai (UTC+4) | Default currency: AED

## 🏗️ High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        HALLA AI SYSTEM                          │
└─────────────────────────────────────────────────────────────────┘

┌──────────────┐         ┌──────────────┐         ┌──────────────┐
│   Caller     │────────▶│    Twilio    │────────▶│   Gateway    │
│  (Phone)     │         │  (Telephony) │         │  (Node.js)   │
└──────────────┘         └──────────────┘         └──────────────┘
                                │                         │
                                │                         ▼
                                │                  ┌──────────────┐
                                │                  │  Audio       │
                                │                  │  Pipeline    │
                                │                  └──────────────┘
                                │                    │    │    │
                    ┌───────────┴───────────┐       │    │    │
                    ▼                       ▼       ▼    ▼    ▼
            ┌──────────────┐       ┌──────────────┐ ┌────┐ ┌────┐
            │  Recording   │       │   WebSocket  │ │STT │ │TTS │
            │   Storage    │       │   (Stream)   │ │    │ │    │
            └──────────────┘       └──────────────┘ └────┘ └────┘
                                                      │      │
                                                      ▼      ▼
                                              ┌──────────────────┐
                                              │   AI Services    │
                                              │   (OpenAI GPT)   │
                                              └──────────────────┘
                                                      │
                                                      ▼
                                              ┌──────────────────┐
                                              │    Database      │
                                              │   (Supabase)     │
                                              └──────────────────┘
                                                      │
                                                      ▼
                                              ┌──────────────────┐
                                              │  Integrations    │
                                              │ (Zapier, CRMs)   │
                                              └──────────────────┘
```

---

## 🔄 Call Flow Sequence

### 1. **Incoming Call**
```
Caller → Twilio Phone Number (+1 919-371-5609)
```

### 2. **Twilio Webhook**
```
Twilio → POST /api/v1/voice/incoming-call
       → Returns TwiML with <Connect><Stream>
```

### 3. **WebSocket Connection**
```
Twilio → WSS /ws/voice/{tenantId}
       → Establishes bidirectional audio stream
```

### 4. **Audio Pipeline Initialization** (FIXED)
```
Gateway → Load tenant config from database
        → Initialize TTS (ElevenLabs)
        → Warm TTS cache
        → Synthesize greeting
        → Connect to STT (Deepgram)
        → Start audio processing
```

### 5. **Conversation Loop**
```
Caller speaks → Twilio → Gateway → Deepgram (STT)
                                  → OpenAI (AI)
                                  → ElevenLabs (TTS)
                                  → Gateway → Twilio → Caller hears
```

### 6. **Data Extraction**
```
During conversation:
  → Extract lead info (name, phone, service)
  → Detect appointment requests
  → Monitor for emergency keywords
  → Track conversation context
```

### 7. **Call End**
```
Call ends → Store call record
          → Store lead record
          → Send to integrations (Zapier, CRMs)
          → Release resources
```

---

## 🧩 Component Details

### Gateway Service (Node.js + TypeScript)
**Location**: `apps/gateway/`
**Port**: 3003
**Responsibilities**:
- Handle Twilio webhooks
- Manage WebSocket connections
- Orchestrate audio pipeline
- Process voice conversations
- Store call/lead data
- Send integration webhooks

**Key Files**:
- `src/services/voice/voice.websocket.ts` - WebSocket handler
- `src/services/voice/audio.pipeline.ts` - Audio processing
- `src/services/voice/stt.service.ts` - Speech-to-text (Deepgram)
- `src/services/voice/tts.service.ts` - Text-to-speech (ElevenLabs)
- `src/services/voice/ai.service.ts` - AI conversation (OpenAI)

### Dashboard (Next.js + React)
**Location**: `apps/dashboard/`
**Port**: 3000
**Responsibilities**:
- Admin interface
- Tenant management
- Call history viewing
- Lead management
- Analytics dashboard
- Integration configuration

### Database (Supabase PostgreSQL)
**Tables**:
- `voice_tenants` - Client configurations
- `calls` - Call records with transcripts
- `leads` - Extracted lead information
- `appointments` - Scheduled appointments
- `integrations` - Integration configurations

### External Services

#### Twilio (Telephony)
- **Purpose**: Phone number, call routing, audio streaming
- **Phone**: +1 (919) 371-5609
- **Webhook**: `/api/v1/voice/incoming-call`
- **Stream**: WebSocket bidirectional audio (mulaw, 8kHz)

#### OpenAI (AI Conversation)
- **Purpose**: Natural language understanding and generation
- **Model**: GPT-4o-mini
- **Functions**: 
  - Generate conversational responses
  - Extract lead information
  - Detect intent and sentiment
  - Multi-language support

#### ElevenLabs (Text-to-Speech)
- **Purpose**: Convert AI text to natural voice
- **Voice**: Rachel (Natural American Female)
- **Format**: mulaw 8kHz (Twilio compatible)
- **Features**: Low latency, natural prosody

#### Deepgram (Speech-to-Text)
- **Purpose**: Convert caller speech to text
- **Features**: 
  - Real-time streaming
  - Interim results
  - Multi-language support
  - High accuracy

#### Redis (Upstash)
- **Purpose**: 
  - Session management
  - Rate limiting
  - Concurrency control
  - Job queues (BullMQ)

---

## 🔐 Security Layers

### 1. **API Authentication**
- JWT tokens for dashboard API
- Internal API key for service-to-service
- Twilio signature validation (webhook)

### 2. **WebSocket Security**
- Origin validation
- IP whitelisting
- Tenant ID verification
- Connection timeout

### 3. **Rate Limiting**
- Global: 300 concurrent calls
- Per tenant: 25 concurrent calls
- API: 100 requests/minute
- Voice: 60 calls/minute

### 4. **Data Protection**
- Encrypted database connections (SSL)
- Secure Redis (TLS)
- API keys in environment variables
- No sensitive data in logs

---

## 📊 Data Flow

### Lead Extraction Flow
```
Conversation → AI Analysis → Lead Data
                           ↓
                    ┌──────┴──────┐
                    ▼             ▼
              Database      Integrations
              (Supabase)    (Zapier, CRMs)
```

### Lead Data Structure
```json
{
  "name": "John Smith",
  "phone": "+1-555-123-4567",
  "service": "Plumbing repair",
  "preferred_time": "Tomorrow afternoon",
  "notes": "Leaking pipe in kitchen",
  "language": "en",
  "sentiment": "urgent"
}
```

---

## 🎯 Performance Metrics

### Latency Targets
- **STT Latency**: <100ms (Deepgram)
- **AI Latency**: <1000ms (OpenAI)
- **TTS Latency**: <500ms (ElevenLabs)
- **Total Response Time**: <2000ms

### Concurrency Limits
- **Global**: 300 concurrent calls
- **Per Tenant**: 25 concurrent calls
- **WebSocket Connections**: Unlimited (within server capacity)

### Resource Usage
- **Memory**: ~100MB per active call
- **CPU**: ~5% per active call
- **Network**: ~64 kbps per call (audio stream)

---

## 🔧 Configuration

### Environment Variables (Gateway)
```bash
# Database
DATABASE_URL=postgresql://...
SUPABASE_SERVICE_ROLE_KEY=...

# AI Services
OPENAI_API_KEY=sk-proj-...
ELEVENLABS_API_KEY=...
DEEPGRAM_API_KEY=...

# Twilio
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1...
TWILIO_STREAM_WSS_URL=wss://...

# Redis
REDIS_URL=rediss://...

# Security
JWT_SECRET=...
VOICE_INTERNAL_API_KEY=...
```

---

## 🚨 Error Handling

### Error Categories
1. **Pipeline Errors** (FIXED)
   - STT connection failures
   - TTS synthesis failures
   - AI API errors

2. **Call Errors**
   - Timeout (45s inactivity)
   - Cost limit exceeded
   - Concurrency limit reached

3. **Integration Errors**
   - Webhook delivery failures
   - CRM API errors
   - Database connection issues

### Error Recovery
- Automatic retry (3 attempts)
- Graceful degradation
- Fallback messages
- Error logging and alerting

---

## 📈 Scalability

### Horizontal Scaling
- Stateless Gateway instances
- Load balancer (Nginx/AWS ALB)
- Shared Redis for state
- Database connection pooling

### Vertical Scaling
- Increase server resources
- Optimize database queries
- Cache frequently accessed data
- Use CDN for static assets

---

## 🔍 Monitoring

### Key Metrics
- Call success rate
- Average latency
- Error rate
- Integration success rate
- Concurrent calls
- API usage/costs

### Logging
- Structured JSON logs
- Log levels: DEBUG, INFO, WARN, ERROR
- Correlation IDs for tracing
- Sensitive data redaction

---

## 📚 Related Documentation
- `VOICE_CALL_FIX_SUMMARY.md` - Recent bug fix details
- `PRODUCTION_READINESS_CHECKLIST.md` - Deployment guide
- `IMMEDIATE_NEXT_STEPS.md` - Testing instructions
- `README.md` - Project overview
- `ADMIN_CLIENT_ONBOARDING.md` - Client setup guide

---

**Last Updated**: May 1, 2026
**System Status**: ✅ Operational (Development)
