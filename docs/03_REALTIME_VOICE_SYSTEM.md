# 03 — REALTIME VOICE SYSTEM

## Overview

Call IQ uses **OpenAI Realtime API** for speech-to-speech AI conversation, bridged through **Twilio Media Streams** for telephony. Audio flows bidirectionally: Caller ↔ Twilio ↔ Gateway ↔ OpenAI.

## Key Files

| File | Purpose |
|------|---------|
| `services/realtime/realtime.gateway.ts` | Main WebSocket handler, Twilio↔OpenAI bridge |
| `services/realtime/realtime.session.ts` | OpenAI session lifecycle management |
| `services/realtime/realtime.types.ts` | TypeScript interfaces for sessions |
| `services/realtime/realtime.tools.ts` | Tool definitions for OpenAI function calling |
| `services/realtime/realtime.events.ts` | Event tracking and analytics |
| `services/realtime/realtime.memory.ts` | Conversation memory management |
| `services/realtime/realtime.audio-diag.ts` | Audio diagnostics (frame counting, silence detection) |
| `services/realtime/realtime.analytics.ts` | Per-call analytics tracking |
| `services/realtime/realtime.health.ts` | Realtime subsystem health checks |
| `services/realtime/realtime.tracing.ts` | Distributed tracing for calls |
| `services/realtime/realtime.twilio.bridge.ts` | Twilio WebSocket protocol handling |
| `services/realtime/heartbeat-manager.ts` | WebSocket keepalive |
| `services/realtime/session-coordinator.ts` | Multi-instance session coordination |
| `services/voice/voice.websocket.ts` | Twilio Media Stream WebSocket server |
| `services/voice/voice.controller.ts` | Voice HTTP endpoints (TwiML) |
| `services/voice/voice-preflight.ts` | Boot-time pipeline validation |
| `services/voice/ai.service.ts` | Tenant config loading, prompt building |
| `services/voice/concurrency.guard.ts` | Per-tenant call concurrency limits |
| `services/voice/production-telemetry.ts` | Runtime metrics collection |

## Session Lifecycle

### 1. Call Initiation
```
Twilio → POST /webhooks/twilio/voice
Gateway → Lookup tenant by phone number (get_tenant_by_phone_number SQL function)
Gateway → Return TwiML: <Connect><Stream url="wss://gateway/ws/voice/:tenantId">
```

### 2. WebSocket Connection
```
Twilio → WebSocket upgrade to /ws/voice/:tenantId?callSid=CA...
Gateway → Rate limit check (IP, burst, reconnect, tenant)
Gateway → Preflight check (voice pipeline healthy?)
Gateway → Accept upgrade
```

### 3. Stream Start
```
Twilio → {"event":"start","streamSid":"MZ...","callSid":"CA..."}
Gateway → Load tenant config (voice, language, industry, services)
Gateway → Check concurrency guard
Gateway → Check usage allowance (billing)
Gateway → Enforce language restrictions (plan-based)
Gateway → Create RealtimeSessionConfig
Gateway → Connect to OpenAI Realtime API (wss://api.openai.com/v1/realtime)
```

### 4. OpenAI Session Configuration
```json
{
  "type": "session.update",
  "session": {
    "instructions": "[system prompt with tenant context]",
    "voice": "alloy",
    "turn_detection": { "type": "server_vad" },
    "input_audio_format": "g711_ulaw",
    "output_audio_format": "g711_ulaw",
    "modalities": ["text", "audio"],
    "temperature": 0.7,
    "tools": [/* appointment booking, transfer, etc. */]
  }
}
```

### 5. Audio Streaming
```
Twilio → {"event":"media","media":{"payload":"base64_audio"}}
Gateway → Forward to OpenAI (input_audio_buffer.append)
OpenAI → response.audio.delta (base64 audio)
Gateway → {"event":"media","streamSid":"...","media":{"payload":"base64_audio"}}
Gateway → Forward to Twilio
```

### 6. Tool Execution
```
OpenAI → response.function_call_arguments.done
Gateway → Execute tool (book appointment, transfer call, etc.)
Gateway → conversation.item.create (tool result)
Gateway → response.create (continue conversation)
```

### 7. Call End
```
Twilio → {"event":"stop"}
Gateway → Close OpenAI WebSocket
Gateway → Release concurrency guard
Gateway → Save call record to database
Gateway → Update usage counters in Redis
Gateway → Queue integration jobs (BullMQ)
Gateway → Clean up session state
```

## Audio Pipeline

- **Format:** g711_ulaw (8kHz, 8-bit μ-law) — Twilio standard
- **Frame size:** 20ms chunks
- **Latency target:** <1.5s speech-to-speech
- **VAD:** Server-side (OpenAI handles voice activity detection)

### Audio Diagnostics (`realtime.audio-diag.ts`)
- Tracks inbound/outbound frame counts
- Measures silence percentage
- Detects dropped frames
- Monitors average audio levels
- Accessible via `GET /debug/audio/:sessionId`

## Interruption Handling

OpenAI Realtime API handles interruptions natively via server VAD:
- When caller speaks during AI response, OpenAI detects and stops output
- Gateway receives `response.cancelled` event
- No manual barge-in logic needed

## Reconnection Logic

```typescript
ws.on('close', (code, reason) => {
  if (session.isActive && code !== 1000) {
    // Attempt reconnection after 1 second
    setTimeout(() => {
      if (session.isActive) {
        this.connectToOpenAI(session).catch(err => {
          session.isActive = false;
        });
      }
    }, 1000);
  }
});
```

## Tool Definitions (Function Calling)

Tools available during calls (defined in `realtime.tools.ts`):
- `schedule_appointment` — Book appointment with name, phone, service, time
- `transfer_call` — Transfer to human with reason
- `take_message` — Record message for callback
- `check_availability` — Query calendar for open slots

## Voice Configuration

Per-tenant voice settings loaded from `voice_tenants` table:
- `voice_id` — OpenAI voice (alloy/echo/fable/onyx/nova/shimmer)
- `default_language` — Primary language code
- `voice_tone` — Prompt tone modifier
- `voice_services` — Services the business offers
- `voice_questions` — Qualification questions to ask

## Preflight Checks (`voice-preflight.ts`)

Run on gateway boot:
1. Database connectivity
2. Redis connectivity
3. OpenAI API key validity
4. Twilio credentials validity
5. Environment variable completeness

If preflight fails, WebSocket upgrades are rejected with 503.

## Concurrency Guard (`concurrency.guard.ts`)

- Per-tenant limit: `VOICE_MAX_TENANT_CONCURRENT_CALLS` (default 25)
- Global limit: `VOICE_MAX_GLOBAL_CONCURRENT_CALLS` (default 300)
- Tracked in Redis with TTL-based cleanup
- Released on call end or session timeout

## Telemetry Endpoints

| Endpoint | Purpose |
|----------|---------|
| `GET /metrics/production` | System metrics (memory, CPU, active sessions) |
| `GET /metrics/realtime` | Realtime subsystem metrics |
| `GET /metrics/audio` | Active audio session diagnostics |
| `GET /debug/audio/:sessionId` | Per-session audio diagnostics |
| `GET /debug/realtime` | Realtime gateway debug info |
| `GET /debug/twilio` | Twilio connection debug info |
| `GET /health/realtime` | Realtime health status |
| `GET /voice-health` | Voice pipeline preflight status |
