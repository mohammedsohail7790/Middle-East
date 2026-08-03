# Bugfix Requirements Document

## Introduction

The voice call system connects successfully via Twilio webhook → ngrok → gateway, but the audio pipeline never starts. Calls disconnect after approximately 10 seconds with no audio transcripts, no AI responses, and immediate Deepgram WebSocket closure. Gateway logs show repeated automation service errors about missing "tenant_id" column in database queries, indicating that required database tables (`automation_rules`, `calendar_events`, and related tables) exist in migration files but are not present in the main schema file or deployed database.

This bug prevents the core voice call functionality from working, making the system unusable for voice interactions despite successful initial connection establishment.

## Bug Analysis

### Current Behavior (Defect)

1.1 WHEN a voice call is initiated through Twilio webhook to the gateway THEN the automation service queries fail with "column 'tenant_id' does not exist" errors

1.2 WHEN the automation service encounters database errors THEN the errors propagate through the call handling pipeline causing the audio pipeline to fail initialization

1.3 WHEN the audio pipeline fails to initialize THEN the Deepgram WebSocket closes immediately without processing any audio

1.4 WHEN the Deepgram WebSocket closes THEN no audio transcripts are generated during the call

1.5 WHEN no transcripts are generated THEN the AI agent cannot generate responses to the caller

1.6 WHEN the audio pipeline is not operational THEN the call disconnects after approximately 10 seconds due to inactivity timeout

1.7 WHEN database tables (`automation_rules`, `calendar_events`, `calendar_connections`, `sms_conversations`, `lead_activities`, `team_members`, `holidays`, `business_hours`, `subscriptions`, `usage_records`, `invoices`) are missing from the main schema THEN services that depend on these tables fail with SQL errors

### Expected Behavior (Correct)

2.1 WHEN a voice call is initiated through Twilio webhook to the gateway THEN all database queries SHALL execute successfully without "column does not exist" errors

2.2 WHEN the automation service is invoked during call processing THEN it SHALL access all required database tables (`automation_rules`, `calendar_events`, etc.) without errors

2.3 WHEN the audio pipeline initializes THEN the Deepgram WebSocket SHALL establish and maintain a stable connection

2.4 WHEN audio data is received from Twilio THEN the Deepgram WebSocket SHALL transcribe the audio in real-time

2.5 WHEN transcripts are generated THEN the AI agent SHALL process them and generate appropriate responses

2.6 WHEN the audio pipeline is operational THEN the call SHALL remain active with bidirectional audio until the caller or system terminates it

2.7 WHEN the main database schema is deployed THEN it SHALL include all tables required by the gateway services (`automation_rules`, `calendar_events`, `calendar_connections`, `sms_conversations`, `lead_activities`, `team_members`, `holidays`, `business_hours`, `subscriptions`, `usage_records`, `invoices`)

### Unchanged Behavior (Regression Prevention)

3.1 WHEN the Twilio webhook receives an incoming call request THEN the system SHALL CONTINUE TO resolve the tenant by phone number correctly

3.2 WHEN a tenant is resolved THEN the system SHALL CONTINUE TO generate valid TwiML with the correct WebSocket stream URL

3.3 WHEN the WebSocket connection is established THEN the system SHALL CONTINUE TO validate the source and enforce security policies

3.4 WHEN tenant configuration is loaded THEN the system SHALL CONTINUE TO retrieve business name, language, voice settings, and other configuration correctly

3.5 WHEN a call completes successfully THEN the system SHALL CONTINUE TO store call records in the `calls` table

3.6 WHEN lead information is captured THEN the system SHALL CONTINUE TO store leads in the `leads` table with proper deduplication

3.7 WHEN existing tables (`voice_tenants`, `calls`, `leads`, `appointments`, `knowledge_base`) are queried THEN they SHALL CONTINUE TO function without modification
