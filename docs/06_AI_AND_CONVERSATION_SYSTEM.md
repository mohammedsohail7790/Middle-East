# 06 — AI AND CONVERSATION SYSTEM

## Architecture

The AI system operates at two levels:
1. **OpenAI Realtime API** — Speech-to-speech during live calls (primary)
2. **OpenAI Chat Completions** — Text-based tasks (lead extraction, evaluation)

## Prompt Building

**File:** `apps/gateway/src/services/voice/ai.service.ts`

System prompt is constructed per-tenant from:
- Business name and industry
- Services offered
- Voice tone and personality
- Qualification questions
- Business hours
- Call handling mode (message/transfer/both)
- Knowledge base context (RAG)
- Industry-specific templates

### Industry Templates

**File:** `apps/gateway/src/services/industry/templates.ts`

Pre-built configurations for:
- HVAC
- Plumbing
- Electrical
- General home services
- Medical
- Legal
- Real estate

Each template provides: services list, qualification questions, terminology, scheduling rules.

## Conversation Intelligence

### Structured Memory (`services/realtime/realtime.memory.ts`)
- Tracks conversation state across turns
- Maintains extracted entities (name, phone, service, time)
- Manages context window for long conversations

### Tool Orchestration (`services/realtime/realtime.tools.ts`)
Tools available during OpenAI Realtime sessions:
- `schedule_appointment` — Book with name, phone, service, datetime
- `transfer_call` — Hand off to human with reason
- `take_message` — Record callback request
- `check_availability` — Query calendar

### Call Evaluation
Post-call analysis extracts:
- Sentiment (positive/neutral/negative)
- Frustration level
- Call success (boolean)
- Lead quality (high/medium/low)
- Summary

## Per-Tenant AI Configuration

**File:** `apps/gateway/src/services/ai-config/ai-config.service.ts`

Configurable per tenant:
- `agentName` — AI persona name (default: "Sarah")
- `personality` — friendly/professional/technical
- `tone` — speaking style
- `greetingMessage` — Custom greeting
- `qualificationQuestions` — Questions to ask callers
- `doInstructions` / `dontInstructions` — Behavioral rules
- `systemInstructions` — Custom system prompt additions
- `language` — Primary language
- `voiceId` — OpenAI voice selection
- `speechRate` — Speaking speed

## Multilingual Support

**Supported languages:** English, Spanish, French, Arabic, Mandarin, Hindi

**Language modes:**
- `strict` — Only respond in configured language
- `adaptive` — Detect caller language and switch (Enterprise only)

**Enforcement:** Language validated against plan at session creation time.

## Voice Configuration

**Centralized:** `apps/gateway/src/config/plan-config.ts`

| Plan | Voices | Providers |
|------|--------|-----------|
| Essential | OpenAI presets (alloy, echo, fable, onyx, nova, shimmer) | OpenAI only |
| Professional | Same + custom selection | OpenAI + ElevenLabs |
| Enterprise | Same + cloned voices + department routing | OpenAI + ElevenLabs + Custom |

## Knowledge Retrieval During Calls

1. Caller asks a question
2. OpenAI Realtime triggers tool call or gateway intercepts
3. Gateway generates embedding for the question
4. Vector similarity search against `knowledge_base` table
5. Top-K results (default 5) injected as context
6. AI responds with knowledge-informed answer

**Caching:** Knowledge queries cached in Redis to avoid repeated embedding generation.

## Interruption Behavior

Handled natively by OpenAI Realtime API's server-side VAD:
- Caller speaks → AI output cancelled immediately
- No manual barge-in detection needed
- Gateway receives `response.cancelled` event

## Escalation / Transfer

When AI determines transfer is needed:
1. AI says "Let me connect you with our team"
2. Tool call: `transfer_call` with reason
3. Gateway generates TwiML `<Dial>` to transfer number
4. Call transferred to configured `transfer_phone_number`

Triggers for transfer:
- Caller explicitly requests human
- Complex issue beyond AI capability
- Emergency situation detected
- `autoTransferEnabled` + `transferConditions` met
