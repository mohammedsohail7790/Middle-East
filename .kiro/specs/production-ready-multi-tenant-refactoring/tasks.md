# Implementation Plan: Production-Ready Multi-Tenant AI Voice Agent

## Overview

This implementation plan transforms Call IQ into a production-ready, multi-tenant SaaS platform. The work is broken into 5 sequential phases, each independently testable via real phone calls. Each phase builds on the previous one, ensuring incremental validation and early error detection.

**Implementation Language**: TypeScript (Node.js)

**Testing Strategy**: After each phase, make a real phone call to verify functionality before proceeding to the next phase.

## Phase 1: Tenant Resolution from Twilio Webhook

**Goal**: Establish the entry point for incoming calls and map phone numbers to tenant configurations.

### Tasks

- [ ] 1.1 Create POST /api/voice/incoming-call endpoint
  - Implement Express route handler for Twilio webhook
  - Parse Twilio request body (application/x-www-form-urlencoded)
  - Extract `To` field from request body (E.164 format)
  - _Requirements: 1.1, 1.2_

- [ ] 1.1a Implement Twilio request validation
  - Validate Twilio signature using TWILIO_AUTH_TOKEN
  - Verify request originates from Twilio (check X-Twilio-Signature header)
  - Reject invalid requests with HTTP 403 (not 500)
  - Log rejected requests with IP address and reason
  - _Requirements: 10.6_

- [ ] 1.2 Implement tenant database query
  - Query `voice_tenants` table by `phone_number` field
  - Return tenant record with id, company_name, phone_number
  - Handle case when no tenant found (return null)
  - _Requirements: 1.2, 2.1_

- [ ] 1.3 Generate callId and store call context
  - Generate unique callId using UUID v4
  - Store mapping: `call_context[callId] = { tenantId }`
  - Use in-memory Map or Redis for storage
  - Set TTL of 120 seconds for call context
  - _Requirements: 1.4, 1.5_

- [ ] 1.4 Return TwiML with WebSocket URL
  - Build TwiML response with `<Connect><Stream>` element
  - Include WebSocket URL: `wss://api.calliqlabs.com/ws/voice/${callId}`
  - Set content-type to `text/xml`
  - Return HTTP 200 with valid TwiML
  - _Requirements: 1.6_

- [ ] 1.5 Implement fallback TwiML for missing tenant
  - When tenant not found, return TwiML with `<Say>` message
  - Message: "This phone number is not configured. Please contact support."
  - Include `<Hangup/>` element
  - Never return HTTP 500 to Twilio
  - _Requirements: 1.3, 10.6_

- [ ] 1.6 Add structured logging for tenant resolution
  - Log successful resolution: callId, tenantId, businessName, phoneNumber
  - Log missing tenant: callId, phoneNumber
  - Log errors with stack trace
  - Use JSON format for all logs
  - _Requirements: 14.1_

- [ ]* 1.7 Write unit tests for tenant resolution
  - Test phone number extraction from Twilio payload
  - Test database query with valid/invalid phone numbers
  - Test TwiML generation with/without tenant
  - Test error handling for database timeouts
  - _Requirements: 1.1-1.7_

**Phase 1 Checkpoint**: Call the phone number → Verify TwiML response contains correct WebSocket URL → Verify logs show tenant resolution

---

## Phase 2: WebSocket Connection with Tenant Context

**Goal**: Establish WebSocket connection and load complete tenant configuration into session.

### Tasks

- [ ] 2.1 Create WebSocket endpoint /ws/voice/{callId}
  - Implement WebSocket server using `ws` library
  - Parse URL path to extract callId parameter
  - Validate callId format (UUID)
  - _Requirements: 3.1_

- [ ] 2.2 Retrieve call context and extract tenantId
  - Look up call_context using callId
  - Extract tenantId from stored context
  - Handle missing call context (close socket with 1008)
  - _Requirements: 3.1, 3.2_

- [ ] 2.2a Handle missing or expired call context
  - Check if call_context exists for callId
  - Check if call_context has expired (TTL exceeded)
  - If missing/expired, close socket with 1008 "Call context not found or expired"
  - Log missing context events with callId for debugging
  - Prevent WebSocket connection without valid tenant context
  - _Requirements: 3.2, 10.5_

- [ ] 2.3 Load complete tenant configuration from database
  - Query `voice_tenants` table by tenantId
  - Load all fields: company_name, voice_services, voice_tone, voice_questions, default_language, timezone, diagnostic_fee, transfer_phone_number, call_handling_mode, zapier_webhook_url
  - Apply default values for NULL fields
  - _Requirements: 3.3, 9.1-9.5_

- [ ] 2.4 Attach session data to WebSocket connection
  - Create session object: `{ tenant, context, state, lastAudioAt, buffers }`
  - Attach to WebSocket: `ws.session = sessionData`
  - Initialize state as 'active'
  - _Requirements: 3.4, 3.5_

- [ ] 2.4a Implement global call timeout tracking
  - Initialize call start timestamp on WebSocket connection
  - Track last activity timestamp (updated on each transcript or audio event)
  - Set max call duration: 15 minutes (900 seconds)
  - Set inactivity timeout: 45 seconds (no audio or transcripts)
  - Store timeout values in session state
  - _Requirements: 3.4_

- [ ] 2.4b Implement timeout monitoring and enforcement
  - Create interval timer (check every 5 seconds) for timeout monitoring
  - Check if call duration exceeds max duration (15 minutes)
  - Check if time since last activity exceeds inactivity timeout (45 seconds)
  - If timeout exceeded, send polite closing message via TTS
  - Close WebSocket connection gracefully after timeout
  - Log timeout events with callId, tenantId, timeout type, duration
  - Clean up resources on timeout
  - _Requirements: 3.4_

- [ ] 2.4c Implement basic metrics tracking
  - Initialize metrics object on session: `{ callCount: 0, responseLatencies: [], providerFailures: {} }`
  - Track total call count (increment on connection)
  - Track response latency for each LLM call (start to finish time)
  - Track provider failures: `{ deepgram: 0, openai: 0, elevenlabs: 0 }`
  - Increment failure counters on provider errors
  - Store metrics in memory (per-instance) for basic observability
  - Log metrics summary on call end
  - _Requirements: 3.4_

- [ ] 2.4d Implement circuit breaker for external providers
  - Track consecutive failures per provider (deepgram, openai, elevenlabs)
  - Set failure threshold: 3 consecutive failures triggers circuit open
  - When circuit open, skip provider and use fallback immediately
  - Set circuit half-open timeout: 30 seconds after opening
  - In half-open state, allow 1 test request to check if provider recovered
  - If test succeeds, close circuit; if fails, reopen for another 30 seconds
  - Log circuit state changes with provider name and timestamp
  - _Requirements: 10.2, 10.3, 10.4_

- [ ] 2.4e Pre-initialize AI/STT/TTS clients on startup
  - Initialize OpenAI client on application startup (not per-call)
  - Initialize Deepgram client on application startup
  - Initialize ElevenLabs client on application startup
  - Implement periodic warm-up ping (every 5 minutes) to keep connections alive
  - Send test request to each provider to verify connectivity
  - Log warm-up ping results and any failures
  - Reduce cold start latency on first call
  - _Requirements: 3.4_

- [ ] 2.5 Implement connection error handling
  - Handle missing callId → close socket 1008 "Missing call id"
  - Handle missing tenant config → close socket 1011 "Tenant configuration error"
  - Handle database timeout → close socket 1011 "Configuration load timeout"
  - Never crash on connection errors
  - _Requirements: 10.5, 10.7_

- [ ] 2.6 Add structured logging for WebSocket connection
  - Log "WS connected" with tenant.business_name and callId
  - Log "WS disconnected" with callId and duration
  - Log connection errors with callId and error details
  - _Requirements: 14.2_

- [ ] 2.6a Implement full cleanup on call termination
  - On WebSocket close, clear all session data
  - Clear audio buffers (set to null)
  - Clear conversation history (set to empty array)
  - Clear processed turnIds Set
  - Clear pending transcript queue
  - Stop all interval timers (timeout monitoring, warm-up pings)
  - Close Deepgram connection
  - Log cleanup completion with callId
  - Prevent memory leaks on long-running instances
  - _Requirements: 3.4, 10.5_

- [ ]* 2.7 Write unit tests for WebSocket initialization
  - Test callId extraction from URL path
  - Test tenant config loading success/failure
  - Test session data attachment
  - Test connection rejection scenarios
  - _Requirements: 3.1-3.7_

**Phase 2 Checkpoint**: Connect WebSocket → Verify tenant config loaded → Verify logs show correct tenant business name → Verify timeout monitoring starts

---

## Phase 3: Audio Streaming and Speech-to-Text (Deepgram)

**Goal**: Process incoming audio from Twilio and generate transcripts using Deepgram with interruption detection.

### Tasks

- [ ] 3.1 Parse Twilio WebSocket events
  - Handle `connected` event: initialize audio buffers
  - Handle `start` event: extract streamSid and callSid
  - Handle `media` event: extract base64 audio payload
  - Handle `stop` event: finalize STT stream
  - _Requirements: 4.1, 4.4, 4.5_

- [ ] 3.1b Make WebSocket handling resilient to unexpected events
  - Handle events in any order (don't assume start → media → stop)
  - Gracefully handle duplicate `start` events (idempotent)
  - Gracefully handle `media` events before `start` (buffer until start)
  - Handle missing `stop` event (timeout-based cleanup)
  - Handle unknown event types (log and ignore)
  - Validate event structure before processing
  - Log unexpected event sequences for debugging
  - _Requirements: 4.1_

- [ ] 3.1a Implement audio buffering for real-time stability
  - Create circular buffer for incoming audio chunks (max 5 seconds)
  - Buffer audio before streaming to Deepgram to handle network jitter
  - Implement buffer overflow protection (drop oldest chunks if full)
  - Track buffer fill level for monitoring
  - _Requirements: 4.2, 4.3_

- [ ] 3.1c Implement memory safety limits for audio buffer
  - Set max audio buffer size: 5 seconds = ~40KB (8kHz μ-law)
  - Monitor buffer size in bytes, not just duration
  - If buffer exceeds max size, drop oldest chunks (FIFO)
  - Log buffer overflow events with callId
  - Prevent memory exhaustion on long calls
  - _Requirements: 4.2, 4.3_

- [ ] 3.2 Decode and stream audio to Deepgram
  - Decode base64 audio payload to raw buffer
  - Initialize Deepgram WebSocket connection with tenant.defaultLanguage
  - Stream buffered audio to Deepgram in real-time
  - _Requirements: 4.2, 4.3, 5.1_

- [ ] 3.3 Process Deepgram transcripts with debouncing
  - Receive partial transcripts and debounce for 600ms
  - Only process partial if no new partial received within debounce window
  - Receive final transcripts and process immediately (no debounce)
  - Extract transcript text from Deepgram response
  - Prevent duplicate transcript processing
  - _Requirements: 5.2, 5.3_

- [ ] 3.3e Implement turn idempotency
  - Generate unique turnId for each accepted final transcript (UUID v4)
  - Store processed turnIds in Set on session state (max 50 recent turnIds)
  - Before processing transcript, check if turnId already processed
  - If turnId exists in Set, skip processing (already handled)
  - Add turnId to Set after successful processing
  - Log skipped turns with turnId for debugging
  - _Requirements: 5.3_

- [ ] 3.3f Implement backpressure control
  - Maintain single-item queue for pending transcripts (queue size = 1)
  - When new transcript arrives while processing, replace queued transcript
  - Drop older queued transcript (keep only latest)
  - Log dropped transcripts with count for monitoring
  - Process queued transcript after current processing completes
  - Prevent transcript backlog and stale responses
  - _Requirements: 5.3_

- [ ] 3.3g Implement speech validation
  - Check Deepgram confidence score (if available)
  - Require minimum confidence threshold (e.g., 0.6 or 60%)
  - Check speech duration from Deepgram metadata
  - Require minimum speech duration (e.g., 300ms)
  - Skip transcripts below confidence or duration thresholds
  - Log skipped low-confidence/short-duration transcripts
  - _Requirements: 5.3_

- [ ] 3.3d Filter low-value transcripts
  - Count words in transcript (split by whitespace)
  - Ignore transcripts with less than 2 words (e.g., "um", "uh", "hello")
  - Ignore transcripts shorter than 3 characters
  - Filter common filler words: "um", "uh", "hmm", "ah", "er"
  - Log filtered transcripts for monitoring
  - Prevent AI responses to meaningless input
  - _Requirements: 5.3_

- [ ] 3.3b Implement duplicate transcript detection
  - Track last processed transcript text and timestamp
  - Compare incoming transcript with last processed (case-insensitive, trimmed)
  - If identical and within 2 seconds, skip processing (duplicate)
  - Use Levenshtein distance or simple string match for comparison
  - Log skipped duplicates for monitoring
  - _Requirements: 5.3_

- [ ] 3.3a Implement call state management for transcript processing
  - Track call state: 'idle', 'listening', 'processing', 'speaking'
  - Only process transcripts when state is 'listening'
  - Ignore transcripts when AI is speaking (prevent echo/feedback)
  - Transition states atomically to prevent race conditions
  - _Requirements: 5.2, 5.3_

- [ ] 3.3c Implement interruption detection
  - Detect when user speaks during 'speaking' state (AI is talking)
  - If final transcript received while state is 'speaking', trigger interruption
  - Set interruption flag on session state
  - Log interruption events with callId and tenantId
  - _Requirements: 5.3_

- [ ] 3.4 Implement STT finalization on silence
  - Detect no speech for 3 seconds
  - Finalize current utterance
  - Send finalization signal to Deepgram
  - _Requirements: 5.4_

- [ ] 3.5 Add fail-safe for Deepgram connection failures
  - Wrap Deepgram connection in try-catch
  - Log error if connection fails
  - Attempt reconnection once
  - Continue call even if STT fails (send fallback TTS)
  - _Requirements: 5.5, 10.2_

- [ ] 3.6 Add structured logging for STT events
  - Log final transcripts with callId, tenantId, text, timing
  - Log Deepgram connection events
  - Log STT errors with stack trace
  - _Requirements: 14.4_

- [ ]* 3.7 Write unit tests for audio streaming
  - Test Twilio event parsing
  - Test base64 audio decoding
  - Test Deepgram connection initialization
  - Test transcript processing (partial vs final)
  - _Requirements: 4.1-4.5, 5.1-5.5_

**Phase 3 Checkpoint**: Send audio via WebSocket → Verify transcripts generated → Verify logs show transcript text → Verify duplicate transcripts are skipped → Verify interruption detection works → **Verify filler words ("um", "uh") are filtered** → **Verify turn idempotency works** → **Verify backpressure control drops old transcripts** → **Verify speech validation filters low-confidence/short speech**

---

## Phase 4: AI Response Generation (OpenAI)

**Goal**: Generate contextual AI responses using tenant-specific prompts with retry logic.

### Tasks

- [ ] 4.1 Build LLM prompt with tenant system_prompt
  - Extract tenant.system_prompt from session
  - Format as SYSTEM message for OpenAI API
  - Include tenant configuration: business_name, services, tone, questions, diagnostic_fee
  - _Requirements: 6.1, 9.1_

- [ ] 4.1a Add response length control to system prompt
  - Append instruction to system prompt: "Keep responses to 1-2 short sentences maximum"
  - Add instruction: "Optimize for real-time voice conversation, not written text"
  - Add instruction: "Be concise and conversational, avoid long explanations"
  - Enforce brevity for natural voice interaction
  - _Requirements: 6.1_

- [ ] 4.2 Include conversation history in prompt
  - Retrieve last 10 messages from session state
  - Format as alternating USER/ASSISTANT messages
  - Append current transcript as latest USER message
  - _Requirements: 6.2, 6.3_

- [ ] 4.2a Implement conversation memory management
  - Limit conversation history to last 10 messages (configurable)
  - Implement sliding window: remove oldest message when limit exceeded
  - Calculate token count for conversation history (estimate ~4 chars per token)
  - Ensure total prompt stays under OpenAI model context limit (8k tokens)
  - Trim individual messages if they exceed 500 characters
  - _Requirements: 6.2, 6.3_

- [ ] 4.2b Implement memory safety limits for conversation history
  - Set hard cap: max 10 messages in history (never exceed)
  - Set max message length: 500 characters per message
  - Calculate total memory usage: ~10 messages × 500 chars = ~5KB max
  - Clear conversation history on call end
  - Monitor memory usage per session
  - Log when history limit reached
  - _Requirements: 6.2, 6.3_

- [ ] 4.3 Call OpenAI API with timeout
  - Use OpenAI SDK with 10-second timeout
  - Enforce 500 token max response limit
  - Use streaming for faster response
  - _Requirements: 6.4, 6.5_

- [ ] 4.3b Implement processing lock to prevent concurrent LLM calls
  - Add `isProcessing` flag to session state (initialize as false)
  - Before calling LLM, check if `isProcessing` is true
  - If `isProcessing` is true, skip LLM call and log "Already processing"
  - Set `isProcessing = true` before LLM call
  - Set `isProcessing = false` after LLM completes (success or failure)
  - Ensure flag is reset in finally block to handle errors
  - Prevent duplicate AI responses from concurrent transcripts
  - _Requirements: 6.5_

- [ ] 4.3a Implement retry logic for OpenAI API
  - Wrap OpenAI call with retry mechanism (1 retry max)
  - On first failure, wait 500ms and retry once
  - Use exponential backoff: first attempt immediate, retry after 500ms
  - Only retry on timeout or 5xx errors (not 4xx client errors)
  - Log retry attempts with callId, tenantId, attempt number
  - _Requirements: 6.5_

- [ ] 4.4 Implement fail-safe for LLM failures
  - Wrap OpenAI call in try-catch
  - Handle timeout (>10s) → return fallback text "Could you repeat that?"
  - Handle rate limit → return "Please hold" + retry once
  - Handle API error → return fallback text
  - Never crash on LLM failure
  - _Requirements: 6.6, 10.3_

- [ ] 4.5 Add structured logging for LLM requests
  - Log request timing: callId, tenantId, requestStartMs
  - Log response timing: callId, tenantId, responseMs, tokenCount
  - Log LLM errors with error type and message
  - _Requirements: 14.5_

- [ ] 4.5a Track response latency metrics
  - Calculate latency: responseEndTime - requestStartTime
  - Store latency in session metrics array
  - Calculate average latency on call end
  - Log latency with each LLM response
  - Track p50, p95, p99 latencies (if multiple responses)
  - _Requirements: 14.5_

- [ ]* 4.6 Write unit tests for LLM processing
  - Test prompt construction with tenant config
  - Test conversation history inclusion
  - Test timeout handling
  - Test fallback responses
  - _Requirements: 6.1-6.7_

**Phase 4 Checkpoint**: Speak into phone → Verify AI generates response → Verify fallback works if OpenAI down (simulate by disconnecting API key) → Verify retry logic executes on timeout → **Verify processing lock prevents concurrent calls** → **Verify responses are 1-2 sentences** → **Verify latency tracking works**

---

## Phase 5: Text-to-Speech and Audio Response (ElevenLabs)

**Goal**: Convert AI responses to audio with interruption handling and retry logic.

### Tasks

- [ ] 5.1 Call ElevenLabs API with tenant voice_id
  - Extract tenant.voice_id from session
  - Call ElevenLabs TTS API with voice_id parameter
  - Stream audio response in chunks
  - _Requirements: 7.1, 7.2, 9.2_

- [ ] 5.1a Implement retry logic for ElevenLabs API
  - Wrap ElevenLabs call with retry mechanism (1 retry max)
  - On first failure, wait 500ms and retry once
  - Use exponential backoff: first attempt immediate, retry after 500ms
  - Only retry on timeout or 5xx errors (not 4xx client errors)
  - Log retry attempts with callId, tenantId, attempt number
  - _Requirements: 7.5_

- [ ] 5.2 Convert audio to μ-law 8kHz format
  - Receive audio from ElevenLabs (typically MP3 or PCM)
  - Convert to μ-law encoding at 8kHz sample rate
  - Use ffmpeg or audio processing library
  - _Requirements: 7.3_

- [ ] 5.2a Validate and enforce correct audio format
  - Verify output is exactly μ-law 8kHz mono (Twilio requirement)
  - Validate audio chunk size (160 bytes = 20ms at 8kHz)
  - Resample if ElevenLabs returns different sample rate
  - Log audio format details for debugging (codec, sample rate, channels)
  - Test with actual Twilio connection to verify audio quality
  - _Requirements: 7.3, 8.1_

- [ ] 5.3 Format audio as Twilio media events
  - Encode audio chunks as base64
  - Format as Twilio media event JSON: `{ event: 'media', streamSid, media: { payload: base64 } }`
  - Maintain proper audio pacing to prevent buffer overflow
  - _Requirements: 7.4, 8.1, 8.2_

- [ ] 5.3a Implement audio pacing and state synchronization
  - Send audio chunks at 20ms intervals (matching Twilio's expected rate)
  - Update call state to 'speaking' before sending first audio chunk
  - Update call state to 'listening' after sending last audio chunk
  - Prevent new transcript processing while in 'speaking' state
  - Use setInterval or setTimeout for precise timing control
  - _Requirements: 8.2_

- [ ] 5.3b Implement interruption handling for TTS playback
  - Check interruption flag before sending each audio chunk
  - If interruption detected, immediately stop sending audio chunks
  - Clear any queued audio chunks from buffer
  - Transition state from 'speaking' to 'listening' immediately
  - Send 'clear' event to Twilio to stop audio playback
  - Log interruption handling with callId and tenantId
  - _Requirements: 8.2_

- [ ] 5.3c Implement TTS synchronization on state changes
  - Before sending new audio, always send Twilio 'clear' event first
  - Wait 50ms after 'clear' event before sending new audio chunks
  - Ensure no mixing of old and new audio chunks
  - Clear any in-flight audio chunks from previous response
  - Reset audio chunk counter on new TTS generation
  - Log TTS synchronization events with callId
  - _Requirements: 8.2_

- [ ] 5.4 Send audio via WebSocket to Twilio
  - Send formatted media events through WebSocket connection
  - Track audio delivery timing for latency monitoring
  - _Requirements: 8.3, 8.4_

- [ ] 5.5 Implement fail-safe for TTS failures
  - Wrap ElevenLabs call in try-catch with 8-second timeout
  - Handle timeout → send pre-recorded fallback audio
  - Handle invalid voice_id → fall back to default voice
  - Never crash on TTS failure
  - _Requirements: 7.5, 7.6, 10.4_

- [ ] 5.6 Add structured logging for TTS events
  - Log TTS generation timing: callId, tenantId, generationMs, audioDurationMs
  - Log TTS errors with error type and message
  - _Requirements: 14.6_

- [ ]* 5.7 Write unit tests for TTS processing
  - Test ElevenLabs API call with voice_id
  - Test audio format conversion
  - Test Twilio media event formatting
  - Test timeout and fallback handling
  - _Requirements: 7.1-7.6, 8.1-8.4_

**Phase 5 Checkpoint**: Complete call end-to-end → Verify caller hears AI voice → Verify correct tenant voice used → Verify logs show complete pipeline timing → **Test interruption: speak while AI is talking and verify audio stops immediately** → Verify retry logic for ElevenLabs → **Verify 'clear' event sent before new audio** → **Verify no audio mixing**

---

## Phase 6: Production Deployment and Infrastructure

**Goal**: Deploy the system to production infrastructure with proper configuration and monitoring.

### Tasks

- [ ] 6.1 Set up environment variables
  - Configure DATABASE_URL for Supabase PostgreSQL
  - Configure OPENAI_API_KEY, DEEPGRAM_API_KEY, ELEVENLABS_API_KEY
  - Configure TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN
  - Configure timeouts: OPENAI_TIMEOUT_MS=10000, VOICE_SILENCE_TIMEOUT_MS=6000
  - _Requirements: 16.4_

- [ ] 6.2 Configure deployment platform (Render)
  - Create `render.yaml` in repository root
  - Set build command: `npm install && npm run build`
  - Set start command: `npm run start:prod`
  - Configure health check path: `/health`
  - Set region (e.g., oregon, frankfurt, singapore)
  - Enable auto-deploy from main branch
  - Set plan: starter (dev) or standard/pro (production)
  - _Requirements: 16.1, 16.5_

- [ ] 6.2a Configure custom domain on Render
  - Go to Render Dashboard → Service → Settings → Custom Domains
  - Add custom domain: `api.calliqlabs.com`
  - Copy CNAME target provided by Render
  - Update DNS: Add CNAME record pointing to Render's URL
  - Wait for SSL certificate provisioning (automatic, ~5-10 minutes)
  - Verify HTTPS and WSS endpoints are accessible
  - _Requirements: 16.2, 16.3_

- [ ] 6.3 Implement health check endpoint
  - Create GET /health endpoint
  - Verify database connectivity with `SELECT 1` query
  - Return HTTP 200 with `{ status: 'ok', timestamp, uptime }`
  - Return HTTP 503 if database unavailable
  - _Requirements: 17.1, 17.2, 17.5_

- [ ] 6.4 Configure database connection pooling
  - Use pg Pool with max 20 connections per instance
  - Set idleTimeoutMillis: 30000
  - Set connectionTimeoutMillis: 2000
  - Enable SSL with rejectUnauthorized: false for Supabase
  - _Requirements: 16.6_

- [ ] 6.5 Update Twilio webhook configuration
  - Set webhook URL to production domain: `https://api.calliqlabs.com/api/voice/incoming-call`
  - Verify HTTPS endpoint is accessible
  - Verify WSS endpoint is accessible
  - _Requirements: 16.2, 16.3_

- [ ] 6.6 Configure horizontal scaling
  - Set minimum instances: 2
  - Set maximum instances: 10
  - Configure scaling triggers: CPU > 70% or Memory > 80% for 5 minutes
  - Verify stateless design (no in-memory session sharing)
  - Note: Scaling requires Standard or Pro plan on Render
  - _Requirements: 16.5_

- [ ] 6.6a Configure Render environment variables
  - Go to Render Dashboard → Service → Environment
  - Add all required environment variables (see list in 6.1)
  - Mark sensitive variables as "Secret" (hidden in logs)
  - Verify DATABASE_URL, API keys, and Twilio credentials
  - Save and trigger redeploy
  - _Requirements: 16.4_

- [ ] 6.7 Perform production deployment checklist
  - Verify all environment variables configured
  - Verify database migrations applied (if any)
  - Verify Twilio webhook URL updated
  - Verify SSL certificate valid
  - Verify health check endpoint responding
  - Make test call to production phone number
  - Monitor logs for errors
  - _Requirements: 16.1-16.6_

**Phase 6 Checkpoint**: Make production test call → Verify end-to-end flow → Verify logs in production → Verify health check returns 200

---

## Phase 7: Real-World Validation and Stress Testing

**Goal**: Validate system stability with real-world call scenarios and edge cases.

### Tasks

- [ ] 7.1 Test interruption scenarios
  - Make call and interrupt AI mid-sentence multiple times
  - Verify audio stops immediately on each interruption
  - Verify state transitions correctly (speaking → listening)
  - Verify no audio mixing or overlap
  - Log all interruption events
  - _Requirements: 8.2_

- [ ] 7.2 Test silence handling
  - Make call and stay silent for 10 seconds
  - Verify system continues listening (no premature timeout)
  - Stay silent for 45+ seconds
  - Verify inactivity timeout triggers
  - Verify polite closing message sent
  - _Requirements: 3.4_

- [ ] 7.3 Test background noise handling
  - Make call with background noise (music, traffic, etc.)
  - Verify STT filters noise appropriately
  - Verify low-confidence transcripts are filtered
  - Verify AI doesn't respond to noise
  - Log filtered noise transcripts
  - _Requirements: 5.3_

- [ ] 7.4 Test fast speech scenarios
  - Speak very rapidly (5+ sentences in 10 seconds)
  - Verify backpressure control drops older transcripts
  - Verify only latest transcript processed
  - Verify processing lock prevents concurrent LLM calls
  - Verify system remains stable (no crashes)
  - _Requirements: 5.3_

- [ ] 7.5 Test multiple consecutive calls
  - Make 5 consecutive calls to same phone number
  - Verify each call uses correct tenant config
  - Verify no data leakage between calls
  - Verify memory cleanup between calls
  - Verify metrics tracking across calls
  - Monitor memory usage (should remain stable)
  - _Requirements: 3.4, 9.1_

- [ ] 7.6 Test circuit breaker behavior
  - Simulate OpenAI failures (disconnect API key)
  - Make 3 calls to trigger circuit breaker
  - Verify circuit opens after 3 failures
  - Verify fallback responses used
  - Wait 30 seconds for half-open state
  - Restore API key and verify circuit closes
  - _Requirements: 10.3_

- [ ] 7.7 Test concurrent calls (load test)
  - Simulate 10 concurrent calls to different tenants
  - Verify all calls complete successfully
  - Verify no tenant data mixing
  - Verify response latency remains acceptable (<3s)
  - Monitor CPU and memory usage
  - Verify no memory leaks
  - _Requirements: 16.5_

**Phase 7 Checkpoint**: Complete all real-world validation tests → Verify system stability across all scenarios → Verify no memory leaks → Verify metrics tracking works correctly

---

## Cross-Cutting Implementation Requirements

These requirements apply to ALL phases and should be implemented consistently throughout:

### Call State Management (Production-Critical)
- Implement state machine with states: 'idle', 'listening', 'processing', 'speaking'
- Add `isProcessing` flag to prevent concurrent LLM calls
- Ensure atomic state transitions (use locks or semaphores if needed)
- Only process transcripts when state is 'listening' AND `isProcessing` is false
- Ignore incoming audio/transcripts when state is 'speaking' (prevent echo)
- Support interruption: if user speaks during 'speaking', stop audio and switch to 'listening'
- Log all state transitions with callId and tenantId
- Prevent race conditions between STT, LLM, and TTS operations

### Conversational Stability (Production-Critical)
- **Processing Lock**: Use `isProcessing` flag to prevent concurrent LLM calls
- **Turn Idempotency**: Assign unique turnId to each transcript, track processed turnIds (max 50), skip duplicates
- **Backpressure Control**: Single-item queue for pending transcripts, drop older queued transcripts, keep only latest
- **Speech Validation**: Require minimum confidence (60%) and duration (300ms) before triggering LLM
- **Low-Value Filtering**: Ignore transcripts with <2 words or <3 characters
- **Filler Speech**: Filter common filler words ("um", "uh", "hmm", "ah", "er")
- **Response Length**: Enforce 1-2 sentence responses via system prompt
- **Concise Responses**: Optimize for real-time voice, not written text
- Prevent awkward AI responses to meaningless input
- Log all filtered transcripts and skipped processing

### TTS Synchronization (Production-Critical)
- Always send Twilio 'clear' event before new audio
- Wait 50ms after 'clear' before sending new audio chunks
- Ensure no mixing of old and new audio chunks
- Clear in-flight audio chunks on interruption or new response
- Reset audio chunk counter on new TTS generation
- Log all TTS synchronization events

### Metrics and Observability (Production-Critical)
- Track call count per instance
- Track response latency for each LLM call (p50, p95, p99)
- Track provider failures: deepgram, openai, elevenlabs
- Store metrics in memory per instance
- Log metrics summary on call end
- Enable basic observability without external dependencies

### Interruption Handling (Production-Critical)
- Detect user speech during TTS playback (final transcript while state is 'speaking')
- Immediately stop sending audio chunks to Twilio
- Clear queued audio from buffer
- Send 'clear' event to Twilio to stop playback
- Transition state from 'speaking' to 'listening'
- Process the interrupting transcript as new user input
- Log all interruptions with callId, tenantId, and timing

### Retry Logic (Production-Critical)
- Implement 1 retry for OpenAI API calls (500ms backoff)
- Implement 1 retry for ElevenLabs API calls (500ms backoff)
- Only retry on timeout or 5xx errors (not 4xx client errors)
- After retry failure, use fallback responses
- Log all retry attempts with attempt number and outcome

### Duplicate Detection (Production-Critical)
- Track last processed transcript text and timestamp
- Compare incoming transcripts (case-insensitive, trimmed)
- Skip duplicates within 2-second window
- Prevent repeated AI responses to same user input
- Log skipped duplicates for monitoring

### Global Call Timeouts (Production-Critical)
- Max call duration: 15 minutes (900 seconds)
- Inactivity timeout: 45 seconds (no audio or transcripts)
- Check timeouts every 5 seconds via interval timer
- Send polite closing message before ending call
- Clean up all resources on timeout
- Log timeout events with type and duration

### Error Handling (Requirement 10)
- Wrap all async operations in try-catch blocks
- Never return HTTP 500 to Twilio webhooks
- Never crash WebSocket connections on component failures
- Log all errors with callId, tenantId, component name, error message, stack trace

### Structured Logging (Requirement 14)
- Use JSON format for all log entries
- Include log level (INFO, WARN, ERROR) in all entries
- Include callId and tenantId in all logs (when available)
- Include timestamp in ISO 8601 format

### Configuration-Driven Behavior (Requirement 9)
- Load all behavior from tenant configuration (no hardcoding)
- Use default values when tenant fields are NULL
- Never hardcode prompts, voice IDs, or business logic

### Timeout Enforcement (Requirement 11)
- STT finalization: 5 seconds
- LLM API: 10 seconds
- TTS API: 8 seconds
- Database queries: 2 seconds
- WebSocket inactivity: 45 seconds

### Audio Format Validation (Production-Critical)
- Always verify audio is μ-law 8kHz mono before sending to Twilio
- Validate chunk sizes match expected format (160 bytes = 20ms)
- Log audio format details for debugging
- Test with real Twilio connection to verify quality

### Memory Management (Production-Critical)
- Limit conversation history to last 10 messages (sliding window)
- Set max message length: 500 characters per message
- Implement audio buffer with max size (5 seconds = ~40KB)
- Monitor buffer size in bytes, not just duration
- Clear all session data on WebSocket close
- Stop all timers on call termination
- Clean up resources on WebSocket disconnect
- Monitor memory usage per call session
- Prevent memory leaks on long-running instances

### Circuit Breaker (Production-Critical)
- Track consecutive failures per provider (deepgram, openai, elevenlabs)
- Failure threshold: 3 consecutive failures → circuit open
- Circuit open: skip provider, use fallback immediately
- Half-open timeout: 30 seconds after opening
- Half-open state: allow 1 test request
- Test success → close circuit; test fail → reopen for 30s
- Log all circuit state changes with provider and timestamp

### Cold Start Optimization (Production-Critical)
- Pre-initialize all AI/STT/TTS clients on application startup
- Implement periodic warm-up ping (every 5 minutes)
- Send test requests to verify provider connectivity
- Log warm-up ping results and failures
- Reduce first-call latency

### WebSocket Resilience (Production-Critical)
- Handle events in any order (no assumptions)
- Gracefully handle duplicate events (idempotent)
- Buffer media events before start event
- Handle missing stop event (timeout-based cleanup)
- Validate event structure before processing
- Log unexpected event sequences

---

## Notes

- Tasks marked with `*` are optional unit tests and can be skipped for faster MVP
- Each phase must be tested via real phone call before proceeding to next phase
- All tasks reference specific requirements for traceability
- The system uses TypeScript (Node.js) for implementation
- Database schema already exists (no migrations needed for MUST-HAVE requirements)
- Focus is on MUST-HAVE requirements only (SHOULD-HAVE and NICE-TO-HAVE deferred)

---

## Testing Strategy

### Phase-by-Phase Testing

**After Phase 1**: Call phone number → Expect TwiML response with WebSocket URL
**After Phase 2**: Connect WebSocket → Expect connection established with tenant config → Verify timeout monitoring active
**After Phase 3**: Send audio via WebSocket → Verify transcripts generated → Verify logs show transcript text → Verify duplicate transcripts are skipped → Verify interruption detection works → **Verify filler words ("um", "uh") are filtered and don't trigger AI responses**
**After Phase 4**: Speak into phone → Expect AI response generated → Verify retry logic on simulated failure → **Verify processing lock prevents concurrent LLM calls** → **Verify AI responses are concise (1-2 sentences)**
**After Phase 5**: Complete call → Expect to hear AI voice response → **Test interruption by speaking during AI response** → Verify audio stops immediately
**After Phase 6**: Production test call → Expect full end-to-end flow in production

### Integration Testing

Once all phases are complete, perform comprehensive integration tests:
- Test with multiple tenants (different phone numbers)
- Test error scenarios (disconnect Deepgram, OpenAI, ElevenLabs)
- Test timeout scenarios (simulate slow API responses, verify retry logic)
- Test concurrent calls (multiple calls at same time)
- Verify tenant isolation (no data leakage between tenants)
- **Test interruption behavior**: Speak while AI is talking, verify immediate stop and state transition
- **Test duplicate detection**: Say same phrase twice quickly, verify only one AI response
- **Test turn idempotency**: Process same transcript twice, verify only one AI response
- **Test backpressure control**: Speak rapidly 5+ times, verify only latest transcript processed
- **Test speech validation**: Whisper or speak very briefly, verify low-confidence/short speech filtered
- **Test filler speech filtering**: Say "um", "uh", "hmm" alone, verify no AI response
- **Test low-value transcripts**: Say single words like "hello", verify filtered appropriately
- **Test processing lock**: Speak rapidly multiple times, verify only one LLM call at a time
- **Test response length**: Verify all AI responses are 1-2 sentences maximum
- **Test TTS synchronization**: Interrupt AI, verify 'clear' event sent before new audio
- **Test metrics tracking**: Complete call, verify metrics logged (call count, latency, failures)
- **Test global timeouts**: Let call sit idle for 45+ seconds, verify inactivity timeout triggers
- **Test max duration**: Keep call active for 15+ minutes, verify max duration timeout triggers

---

## Implementation Order

1. **Phase 1**: Tenant Resolution (Entry point)
2. **Phase 2**: WebSocket Connection (Session initialization)
3. **Phase 3**: Audio Streaming + STT (Input processing)
4. **Phase 4**: LLM Processing (AI logic)
5. **Phase 5**: TTS + Audio Response (Output delivery)
6. **Phase 6**: Production Deployment (Infrastructure)
7. **Phase 7**: Real-World Validation (Stress testing and edge cases)

Each phase builds on the previous one. Do not skip phases or combine them.

**IMPORTANT**: Phase 7 is critical for production readiness. Do not deploy to production without completing Phase 7 validation tests.
