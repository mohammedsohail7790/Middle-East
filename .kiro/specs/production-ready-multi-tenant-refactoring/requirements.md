# Requirements Document

## Introduction

This document specifies requirements for refactoring Call IQ into a production-ready, multi-tenant AI voice agent platform. The system transforms an existing AI voice agent platform that uses Twilio for phone calls, WebSocket for real-time communication, and integrates with Deepgram (STT), OpenAI (LLM), and ElevenLabs (TTS) into a stable, production-ready SaaS where ONE core AI engine dynamically adapts per client using Twilio phone numbers.

The refactoring preserves the working Twilio + WebSocket flow while adding reliability, proper multi-tenancy, and production safety features.

## Priority Tiers

This section categorizes all requirements into three priority tiers to guide implementation and production launch planning.

### MUST-HAVE (Critical Path for Initial Production Launch)

These requirements are essential for a minimal production-ready system that handles real calls end-to-end with multi-tenant support and basic reliability.

- **Requirement 1**: Tenant Resolution
- **Requirement 2**: Database Schema for Multi-Tenancy
- **Requirement 3**: WebSocket Session Initialization
- **Requirement 4**: Real-Time Voice Pipeline - Incoming Audio
- **Requirement 5**: Real-Time Voice Pipeline - Speech-to-Text
- **Requirement 6**: Real-Time Voice Pipeline - Language Model Processing
- **Requirement 7**: Real-Time Voice Pipeline - Text-to-Speech
- **Requirement 8**: Real-Time Voice Pipeline - Audio Response Delivery
- **Requirement 9**: Configuration-Driven Behavior
- **Requirement 10**: Reliability and Fail-Safe Behavior
- **Requirement 16**: Production Deployment Infrastructure

### SHOULD-HAVE (Stability and Reliability)

These requirements enhance system stability, debugging capabilities, and data persistence. They should be implemented after the MUST-HAVE tier is complete and tested.

- **Requirement 11**: Timeout Handling
- **Requirement 14**: Structured Logging
- **Requirement 17**: Health Monitoring and Metrics
- **Requirement 19**: Call Data Persistence

### NICE-TO-HAVE (Future Scaling)

These requirements add advanced features for scaling, analytics, and integrations. They can be deferred to post-launch iterations.

- **Requirement 12**: Silence and Inactivity Handling
- **Requirement 13**: Rate Limiting
- **Requirement 15**: Multi-Tenant Validation Testing
- **Requirement 18**: Integration Service Delivery
- **Requirement 20**: Lead Data Extraction and Storage

## Glossary

- **System**: The Call IQ AI voice agent platform
- **Tenant**: A client business using the platform with their own configuration
- **Voice_Pipeline**: The real-time audio processing flow (STT → LLM → TTS)
- **Call_Context**: Session data containing tenant configuration and conversation state
- **Tenant_Resolver**: Component that maps Twilio phone numbers to tenant configurations
- **STT_Service**: Speech-to-Text service (Deepgram)
- **LLM_Service**: Large Language Model service (OpenAI)
- **TTS_Service**: Text-to-Speech service (ElevenLabs)
- **WebSocket_Handler**: Component managing real-time bidirectional communication
- **Integration_Service**: Component delivering lead data to external systems
- **Fail_Safe_Handler**: Component ensuring graceful degradation on errors

## Requirements

### Requirement 1: Tenant Resolution [MUST-HAVE]

**User Story:** As a platform operator, I want incoming calls to be mapped to the correct tenant configuration, so that each client receives personalized AI behavior.

#### Acceptance Criteria

1. WHEN a POST request arrives at /api/voice/incoming-call, THE Tenant_Resolver SHALL extract the To field from req.body in E.164 format
2. WHEN the To field is extracted, THE Tenant_Resolver SHALL query the database for a tenant record matching the twilio_number field
3. IF no tenant record is found for the phone number, THEN THE System SHALL return valid TwiML containing a <Say> element with a fallback message and exit without error
4. WHEN a tenant record is found, THE System SHALL generate a unique callId
5. WHEN a callId is generated, THE System SHALL store the mapping call_context[callId] = { tenantId } in memory or cache
6. WHEN the call context is stored, THE System SHALL respond immediately with TwiML containing WebSocket connection instructions
7. THE System SHALL complete tenant resolution within 200 milliseconds

### Requirement 2: Database Schema for Multi-Tenancy [MUST-HAVE]

**User Story:** As a platform operator, I want all data properly isolated by tenant, so that client data remains secure and separate.

#### Acceptance Criteria

1. THE System SHALL maintain a tenants table with columns: id, business_name, twilio_number (UNIQUE), system_prompt, voice_id, language, settings (JSONB), zapier_webhook
2. THE System SHALL maintain a calls table with columns: id, tenant_id, from, to, status, created_at, updated_at
3. THE System SHALL maintain a messages table with columns: id, tenant_id, call_id, role, content, created_at
4. THE System SHALL maintain a leads table with columns: id, tenant_id, name, phone, metadata, created_at
5. THE System SHALL include tenant_id as a foreign key in all tables except tenants
6. THE System SHALL enforce database-level foreign key constraints for tenant_id references
7. THE System SHALL create database indexes on tenant_id columns for query performance

### Requirement 3: WebSocket Session Initialization [MUST-HAVE]

**User Story:** As a system component, I want WebSocket connections to load tenant configuration immediately, so that real-time voice processing uses correct settings.

#### Acceptance Criteria

1. WHEN a WebSocket connection request arrives at /ws/voice/{callId}, THE WebSocket_Handler SHALL retrieve the call_context using the callId
2. WHEN call_context is retrieved, THE WebSocket_Handler SHALL extract the tenantId
3. WHEN tenantId is extracted, THE WebSocket_Handler SHALL load the complete tenant configuration from the database
4. WHEN tenant configuration is loaded, THE WebSocket_Handler SHALL attach session data to the connection: ws.session = { tenant, context, lastAudioAt, buffers, state }
5. WHEN session data is attached, THE WebSocket_Handler SHALL build tenant-specific context using buildTenantContext(tenant)
6. WHEN the WebSocket connection is established, THE System SHALL log "WS connected" with tenant.business_name and callId
7. THE System SHALL complete WebSocket initialization within 500 milliseconds

### Requirement 4: Real-Time Voice Pipeline - Incoming Audio [MUST-HAVE]

**User Story:** As the voice pipeline, I want to process incoming Twilio audio events correctly, so that customer speech is transcribed accurately.

#### Acceptance Criteria

1. WHEN a WebSocket message is received, THE Voice_Pipeline SHALL parse the message to identify Twilio event types: connected, start, media, stop
2. WHEN a media event is received, THE Voice_Pipeline SHALL decode the base64-encoded audio payload
3. WHEN audio is decoded, THE Voice_Pipeline SHALL stream the audio data to the STT_Service
4. WHEN a connected event is received, THE Voice_Pipeline SHALL initialize audio buffers and state
5. WHEN a stop event is received, THE Voice_Pipeline SHALL finalize the STT stream and close connections gracefully

### Requirement 5: Real-Time Voice Pipeline - Speech-to-Text [MUST-HAVE]

**User Story:** As the voice pipeline, I want to maintain a streaming STT connection, so that transcripts are generated with minimal latency.

#### Acceptance Criteria

1. THE STT_Service SHALL maintain a persistent streaming connection to Deepgram for each active call
2. WHEN the STT_Service receives a partial transcript, THE STT_Service SHALL ignore or debounce the partial result
3. WHEN the STT_Service receives a final transcript, THE STT_Service SHALL send the transcript text to the LLM_Service
4. WHEN no speech is detected for 3 seconds, THE STT_Service SHALL finalize the current utterance
5. IF the STT_Service connection fails, THEN THE Fail_Safe_Handler SHALL attempt reconnection once before falling back

### Requirement 6: Real-Time Voice Pipeline - Language Model Processing [MUST-HAVE]

**User Story:** As the voice pipeline, I want to generate contextual responses using tenant-specific prompts, so that each client's AI behaves according to their business needs.

#### Acceptance Criteria

1. WHEN a final transcript is received, THE LLM_Service SHALL build a prompt with SYSTEM = tenant.system_prompt
2. WHEN building the prompt, THE LLM_Service SHALL include CONTEXT = recent conversation history (last 10 messages)
3. WHEN building the prompt, THE LLM_Service SHALL include USER = current transcript text
4. THE LLM_Service SHALL enforce a maximum token limit of 500 tokens for responses
5. THE LLM_Service SHALL enforce a timeout of 10 seconds for LLM API calls
6. IF the LLM API call exceeds the timeout, THEN THE Fail_Safe_Handler SHALL return a fallback response
7. THE LLM_Service SHALL NOT generate booking confirmations unless tenant.settings.booking_enabled is true

### Requirement 7: Real-Time Voice Pipeline - Text-to-Speech [MUST-HAVE]

**User Story:** As the voice pipeline, I want to convert LLM responses to audio using tenant-specific voice settings, so that customers hear the correct voice for each business.

#### Acceptance Criteria

1. WHEN an LLM response is generated, THE TTS_Service SHALL use the tenant.voice_id for voice selection
2. THE TTS_Service SHALL stream audio response in chunks to minimize latency
3. WHEN audio is generated, THE TTS_Service SHALL convert audio to μ-law encoding at 8kHz sample rate
4. WHEN audio is converted, THE TTS_Service SHALL format the audio as Twilio media events
5. THE TTS_Service SHALL enforce a timeout of 8 seconds for TTS API calls
6. IF the TTS API call exceeds the timeout, THEN THE Fail_Safe_Handler SHALL send a pre-recorded fallback audio message

### Requirement 8: Real-Time Voice Pipeline - Audio Response Delivery [MUST-HAVE]

**User Story:** As the voice pipeline, I want to send generated audio back to Twilio correctly, so that customers hear AI responses without distortion.

#### Acceptance Criteria

1. WHEN TTS audio chunks are ready, THE Voice_Pipeline SHALL format each chunk as a Twilio media event
2. THE Voice_Pipeline SHALL maintain proper audio pacing to prevent buffer overflow
3. THE Voice_Pipeline SHALL send media events through the WebSocket connection to Twilio
4. THE Voice_Pipeline SHALL track audio delivery timing for latency monitoring

### Requirement 9: Configuration-Driven Behavior [MUST-HAVE]

**User Story:** As a platform operator, I want all AI behavior to be driven by tenant configuration, so that no client-specific logic is hardcoded.

#### Acceptance Criteria

1. THE System SHALL load system_prompt from tenant.system_prompt for LLM requests
2. THE System SHALL load voice_id from tenant.voice_id for TTS requests
3. THE System SHALL load language from tenant.language for STT configuration
4. THE System SHALL load custom behavior flags from tenant.settings JSONB field
5. WHERE a tenant record is missing optional configuration fields, THE System SHALL use default values from application configuration
6. THE System SHALL NOT contain hardcoded prompts, voice IDs, or behavior rules in application code

### Requirement 10: Reliability and Fail-Safe Behavior [MUST-HAVE]

**User Story:** As a platform operator, I want the system to handle errors gracefully, so that failures in one component do not crash the entire call.

#### Acceptance Criteria

1. THE System SHALL wrap all asynchronous operations in try-catch blocks
2. IF an STT operation fails, THEN THE Fail_Safe_Handler SHALL send a fallback TTS message and continue the call
3. IF an LLM operation fails, THEN THE Fail_Safe_Handler SHALL send a fallback TTS message and continue the call
4. IF a TTS operation fails, THEN THE Fail_Safe_Handler SHALL send a pre-recorded fallback audio and continue the call
5. IF a WebSocket connection error occurs, THEN THE System SHALL log the error and close the connection gracefully
6. THE System SHALL NOT return HTTP 500 errors to Twilio webhook endpoints
7. THE System SHALL NOT crash the WebSocket connection on component failures

### Requirement 11: Timeout Handling [SHOULD-HAVE]

**User Story:** As a platform operator, I want operations to have timeouts, so that slow external services do not block calls indefinitely.

#### Acceptance Criteria

1. THE STT_Service SHALL enforce a timeout of 5 seconds for transcript finalization
2. THE LLM_Service SHALL enforce a timeout of 10 seconds for API responses
3. THE TTS_Service SHALL enforce a timeout of 8 seconds for audio generation
4. THE Integration_Service SHALL enforce a timeout of 5 seconds for webhook delivery
5. IF any timeout is exceeded, THEN THE Fail_Safe_Handler SHALL execute fallback behavior
6. THE System SHALL log timeout events with component name, callId, and tenantId

### Requirement 12: Silence and Inactivity Handling [NICE-TO-HAVE]

**User Story:** As the system, I want to detect caller silence and end inactive calls, so that resources are not wasted on abandoned calls.

#### Acceptance Criteria

1. WHEN no speech is detected for 15 seconds, THE System SHALL send a prompt "Are you still there?"
2. WHEN the first silence prompt is sent, THE System SHALL increment a silence counter
3. IF no speech is detected for 15 seconds after the first prompt, THEN THE System SHALL send a second prompt "I didn't hear you. Are you still there?"
4. IF no speech is detected for 15 seconds after the second prompt, THEN THE System SHALL send a closing message and end the call politely
5. WHEN speech is detected, THE System SHALL reset the silence counter to zero
6. THE System SHALL log silence timeout events with callId and tenantId

### Requirement 13: Rate Limiting [NICE-TO-HAVE]

**User Story:** As a platform operator, I want to prevent abuse through rate limiting, so that the system remains available for legitimate users.

#### Acceptance Criteria

1. THE System SHALL enforce a rate limit of 100 requests per minute per IP address on webhook endpoints
2. THE System SHALL enforce a rate limit of 50 WebSocket connections per minute per tenant
3. IF a rate limit is exceeded, THEN THE System SHALL return HTTP 429 Too Many Requests
4. THE System SHALL log rate limit violations with IP address, tenantId, and timestamp
5. THE System SHALL use a sliding window algorithm for rate limit calculation

### Requirement 14: Structured Logging [SHOULD-HAVE]

**User Story:** As a platform operator, I want comprehensive structured logs, so that I can debug issues and monitor system health.

#### Acceptance Criteria

1. THE System SHALL log tenant resolution events with: callId, tenantId, tenant.business_name, timestamp
2. THE System SHALL log WebSocket connection events with: callId, tenantId, event type (connected/disconnected), timestamp
3. THE System SHALL log Twilio events with: callId, tenantId, event type, timestamp
4. THE System SHALL log final STT transcripts with: callId, tenantId, transcript text, timing
5. THE System SHALL log LLM requests with: callId, tenantId, request timing, response timing, token count
6. THE System SHALL log TTS generation with: callId, tenantId, generation timing, audio duration
7. THE System SHALL log errors with: callId, tenantId, component name, error message, stack trace
8. THE System SHALL use JSON format for all log entries
9. THE System SHALL include log level (INFO, WARN, ERROR) in all log entries

### Requirement 15: Multi-Tenant Validation Testing [NICE-TO-HAVE]

**User Story:** As a platform operator, I want to verify multi-tenant isolation, so that I can ensure clients receive correct configurations.

#### Acceptance Criteria

1. THE System SHALL support test scenarios with two tenants having different system_prompt values
2. THE System SHALL support test scenarios with two tenants having different voice_id values
3. WHEN Tenant A's phone number receives a call, THE System SHALL use Tenant A's system_prompt and voice_id
4. WHEN Tenant B's phone number receives a call, THE System SHALL use Tenant B's system_prompt and voice_id
5. THE System SHALL store call data with the correct tenant_id for each tenant
6. THE System SHALL store lead data with the correct tenant_id for each tenant
7. THE System SHALL NOT mix data between tenants in any scenario

### Requirement 16: Production Deployment Infrastructure [MUST-HAVE]

**User Story:** As a platform operator, I want the system deployed on reliable infrastructure, so that it can handle production traffic.

#### Acceptance Criteria

1. THE System SHALL be deployed on a platform supporting HTTPS and WSS protocols (Render or Railway)
2. THE System SHALL expose a public HTTPS endpoint for Twilio webhooks
3. THE System SHALL expose a public WSS endpoint for WebSocket connections
4. THE System SHALL use environment variables for all configuration (no hardcoded secrets)
5. THE System SHALL support horizontal scaling for WebSocket connections
6. THE System SHALL use a managed PostgreSQL database (Supabase)

### Requirement 17: Health Monitoring and Metrics [SHOULD-HAVE]

**User Story:** As a platform operator, I want health check endpoints, so that I can monitor system status and external service availability.

#### Acceptance Criteria

1. THE System SHALL expose a GET /health endpoint returning HTTP 200 when healthy
2. WHEN the /health endpoint is called, THE System SHALL verify database connectivity
3. WHEN the /health endpoint is called, THE System SHALL verify Redis connectivity (if Redis is used)
4. WHEN the /health endpoint is called, THE System SHALL return status of external providers (Deepgram, OpenAI, ElevenLabs)
5. IF any critical component is unavailable, THEN THE System SHALL return HTTP 503 Service Unavailable
6. THE System SHALL return health check responses within 2 seconds
7. THE System SHALL include response time metrics in health check responses

### Requirement 18: Integration Service Delivery [NICE-TO-HAVE]

**User Story:** As a business owner, I want lead data delivered to my external systems, so that I can follow up with customers.

#### Acceptance Criteria

1. WHEN a call is completed, THE Integration_Service SHALL extract lead data from the conversation
2. WHEN lead data is extracted, THE Integration_Service SHALL format the payload according to tenant.integrations configuration
3. WHEN the payload is formatted, THE Integration_Service SHALL deliver the payload to the configured webhook URL
4. THE Integration_Service SHALL support Zapier webhook delivery
5. THE Integration_Service SHALL support ServiceTitan API delivery
6. THE Integration_Service SHALL support Jobber API delivery
7. THE Integration_Service SHALL support HouseCallPro API delivery
8. IF webhook delivery fails, THEN THE Integration_Service SHALL retry up to 3 times with exponential backoff
9. THE Integration_Service SHALL log delivery success or failure with callId, tenantId, and provider name

### Requirement 19: Call Data Persistence [SHOULD-HAVE]

**User Story:** As a business owner, I want call transcripts and metadata stored, so that I can review past conversations.

#### Acceptance Criteria

1. WHEN a call starts, THE System SHALL create a call record with: tenant_id, call_sid, status = "active", created_at
2. WHEN a transcript is generated, THE System SHALL create a message record with: tenant_id, call_id, role, content, created_at
3. WHEN a call ends, THE System SHALL update the call record with: status = "completed", duration_ms, outcome
4. THE System SHALL store the complete conversation transcript in the messages table
5. THE System SHALL calculate and store call latency metrics in the calls table
6. THE System SHALL store recording URLs in the calls table when available

### Requirement 20: Lead Data Extraction and Storage [NICE-TO-HAVE]

**User Story:** As a business owner, I want customer information extracted from conversations, so that I can contact them for service.

#### Acceptance Criteria

1. WHEN a call is completed, THE System SHALL extract customer name from the transcript
2. WHEN a call is completed, THE System SHALL extract customer phone number from the transcript
3. WHEN a call is completed, THE System SHALL extract requested service from the transcript
4. WHEN a call is completed, THE System SHALL extract preferred appointment time from the transcript
5. WHEN lead data is extracted, THE System SHALL create a lead record with: tenant_id, call_id, name, phone, service, notes, preferred_time
6. THE System SHALL use LLM-based extraction for unstructured conversation data
7. THE System SHALL handle missing fields gracefully by storing NULL values
