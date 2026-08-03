import type { WebSocket } from 'ws';
import { logger } from '../logger.js';
import { RealtimeSession } from './realtime.types.js';
import { AiService, TenantVoiceConfig } from '../voice/ai.service.js';
import { RealtimeEventManager } from './realtime.events.js';
import { RealtimeMemoryManager } from './realtime.memory.js';
import { RealtimeAnalyticsManager } from './realtime.analytics.js';
import { billingService } from '../billing/billing.service.js';
import { integrationService } from '../integrations/integration.service.js';
import { voiceRedis } from '../voice/redis.client.js';
import { concurrencyGuard } from '../voice/concurrency.guard.js';
import { sessionCoordinator } from './session-coordinator.js';
import { heartbeatManager } from './heartbeat-manager.js';
import { wsRateLimiter } from '../ws-rate-limiter.js';

export interface PostCallState {
  sessionId: string;
  tenantId: string;
  callSid: string | null;
  callerPhone: string | null;
  tenantConfig: TenantVoiceConfig | null;
  inactivityTimeout?: ReturnType<typeof setTimeout>;
  sessionManager: {
    getSession(id: string): RealtimeSession | undefined;
    closeSession(session: RealtimeSession): void;
  };
  /** Caller declined the consent prompt — call proceeded normally but must
   *  not have a transcript persisted (recording is already skipped via
   *  shouldRecord at the consent-response stage). */
  consentDeclined?: boolean;
}

interface PostCallDeps {
  eventManager: RealtimeEventManager;
  memoryManager: RealtimeMemoryManager;
  analyticsManager: RealtimeAnalyticsManager;
  aiService: AiService;
}

/**
 * Post-call processing: store call, extract leads, book appointments,
 * run QA evaluation, sync CRM, and clean up Redis state.
 *
 * Extracted from RealtimeGateway.finalizeRuntimeSession to reduce
 * the gateway's responsibilities.
 */
export async function finalizeRuntimeSession(
  state: PostCallState,
  socket: WebSocket,
  deps: PostCallDeps
): Promise<void> {
  // Clear inactivity timeout
  if (state.inactivityTimeout) {
    clearTimeout(state.inactivityTimeout);
    state.inactivityTimeout = undefined;
  }

  // Close realtime session if exists
  if (state.sessionId) {
    const session = state.sessionManager.getSession(state.sessionId);
    if (session) {
      state.sessionManager.closeSession(session);

      // ─── CRITICAL: Save call record to Postgres ───────────────────────
      if (state.tenantId && state.callSid) {
        const sessionMetrics = deps.eventManager.getSessionMetrics(state.sessionId);
        const memories = await deps.memoryManager.getAllSessionMemory(state.sessionId);
        const durationMs = sessionMetrics?.startTime ? Date.now() - sessionMetrics.startTime.getTime() : 0;

        const { formatSessionTranscript } = await import('./realtime.transcript.js');
        let transcript = formatSessionTranscript(session);
        if (!transcript.trim()) {
          const name = memories.find((m) => m.type === 'customer_info' && m.key === 'name')?.value;
          transcript =
            memories
              .filter((m) => m.type === 'entity')
              .map((m) => JSON.stringify(m.value))
              .join(' | ') ||
            `Call with ${name || state.callerPhone || 'unknown caller'} — ${Math.round(durationMs / 1000)}s`;
        }

        // Store call in database (so it shows in dashboard)
        const { storeCall } = await import('../voice/voice.controller.js');
        const { createHash } = await import('crypto');
        const configHash = session.config?.instructions
          ? createHash('sha256').update(session.config.instructions).digest('hex').slice(0, 12)
          : null;
        const callOutcome =
          session.callOutcome ||
          (sessionMetrics?.toolCallCount && memories.some((m) => String(m.value).includes('transfer'))
            ? 'transferred'
            : 'completed');

        const customerName = memories.find((m) => m.type === 'customer_info' && m.key === 'name')?.value;
        const customerPhone = memories.find((m) => m.type === 'customer_info' && m.key === 'phone')?.value;
        const primaryIntent = memories.find((m) => m.type === 'intent' && m.key === 'primary')?.value?.intent;

        // Caller declined the consent prompt — the call still went through
        // normally, but nothing gets archived: no recording (already skipped
        // at the consent-response stage) and no persisted transcript text.
        const storedTranscript = state.consentDeclined
          ? '[Not recorded — caller did not consent to recording/transcription.]'
          : transcript;

        await storeCall({
          tenantId: state.tenantId,
          callSid: state.callSid,
          transcript: storedTranscript,
          language: session.config?.language || 'en',
          latency: 0,
          durationMs,
          outcome: callOutcome,
          recordingUrl: null,
          configHash,
        }).catch(err => {
          logger.error('REALTIME_STORE_CALL_FAILED', { tenantId: state.tenantId, callSid: state.callSid, error: String(err) });
        });

        const { storeLead, resolveCallIdForLead } = await import('../voice/voice.controller.js');
        const persistedCallId = await resolveCallIdForLead(state.tenantId, state.callSid);
        const bookedAppointment = memories.find(
          (m) => m.type === 'entity' && String(m.key || '').includes('appointment')
        );
        const transcriptTurns = (session.transcriptLines || []).map((line) => ({
          role:
            line.role === 'caller'
              ? ('user' as const)
              : line.role === 'assistant'
                ? ('assistant' as const)
                : ('system' as const),
          text: line.text,
          timestamp: new Date().toISOString(),
        }));

        let resolvedName =
          typeof customerName === 'string' && customerName !== 'Caller' ? customerName : undefined;
        let resolvedPhone =
          (typeof customerPhone === 'string' ? customerPhone : undefined) ||
          state.callerPhone ||
          undefined;
        let resolvedService =
          typeof primaryIntent === 'string' && primaryIntent !== 'Appointment'
            ? primaryIntent
            : undefined;
        let resolvedAppointmentTime = bookedAppointment
          ? String(bookedAppointment.value ?? '').trim()
          : undefined;

        if (state.tenantConfig && transcriptTurns.length > 0) {
          const { mergePostCallLeadFields } = await import('./post-call-booking.js');
          const extracted = await deps.aiService.validateLeadExtraction(
            state.tenantConfig,
            {
              name: resolvedName,
              phone: resolvedPhone,
              service: resolvedService,
              preferred_time: resolvedAppointmentTime,
            },
            transcriptTurns
          );
          const merged = mergePostCallLeadFields(
            {
              name: resolvedName,
              phone: resolvedPhone,
              service: resolvedService,
              preferred_time: resolvedAppointmentTime,
            },
            extracted,
            state.callerPhone
          );
          resolvedName = merged.name || resolvedName;
          resolvedPhone = merged.phone || resolvedPhone;
          resolvedService = merged.service || resolvedService;
          resolvedAppointmentTime = merged.preferred_time || resolvedAppointmentTime;
        }

        let shouldBackfillAppointment = Boolean(bookedAppointment);
        if (state.tenantConfig && transcriptTurns.length > 0) {
          const { detectVerbalBookingConfirmation } = await import('./post-call-booking.js');
          if (detectVerbalBookingConfirmation(transcript)) {
            shouldBackfillAppointment = true;
          }
        }

        if (persistedCallId && state.tenantConfig && transcriptTurns.length > 0) {
          const leadForEval = {
            name: resolvedName,
            phone: resolvedPhone,
            service: resolvedService,
          };
          const hasAppointment = Boolean(bookedAppointment);
          deps.aiService
            .evaluateCall(state.tenantConfig, transcriptTurns, leadForEval, hasAppointment)
            .then(async (evaluation) => {
              const { qaService } = await import('../qa/qa.service.js');
              await qaService.recordAiEvaluation({
                callId: persistedCallId,
                tenantId: state.tenantId!,
                sentiment: evaluation.sentiment,
                sentimentScore: evaluation.sentimentScore,
                frustrationLevel: evaluation.frustrationLevel,
                callSuccess: evaluation.callSuccess,
                leadQuality: evaluation.leadQuality,
                summary: evaluation.summary,
              });
              import('../slack/slack.service.js').then(({ slackService }) => {
                slackService
                  .sendNewCallNotification(state.tenantId!, {
                    from: leadForEval.phone || 'Unknown',
                    duration: durationMs,
                    disposition: callOutcome,
                    sentiment: evaluation.sentiment,
                  })
                  .catch(() => {});
              }).catch(() => {});
            })
            .catch((err) => {
              logger.warn('REALTIME_CALL_EVALUATION_FAILED', {
                tenantId: state.tenantId,
                callSid: state.callSid,
                error: String(err),
              });
            });
        } else {
          import('../slack/slack.service.js').then(({ slackService }) => {
            slackService
              .sendNewCallNotification(state.tenantId!, {
                from:
                  (typeof customerPhone === 'string' ? customerPhone : undefined) ||
                  state.callerPhone ||
                  'Unknown',
                duration: durationMs,
                disposition: callOutcome,
                sentiment: 'neutral',
              })
              .catch(() => {});
          }).catch(() => {});
        }

        await storeLead({
          tenantId: state.tenantId,
          callId: persistedCallId ?? undefined,
          name: resolvedName,
          phone: resolvedPhone,
          service: resolvedService,
          notes: bookedAppointment || resolvedAppointmentTime
            ? `Appointment discussed — ${Math.round(durationMs / 1000)}s call`
            : `Inbound AI call — ${Math.round(durationMs / 1000)}s`,
          preferred_time: resolvedAppointmentTime || undefined,
        }).catch((err) => {
          logger.warn('REALTIME_STORE_LEAD_FAILED', {
            tenantId: state.tenantId,
            callSid: state.callSid,
            error: String(err),
          });
        });

        let appointmentSyncedViaBooking = false;
        if (shouldBackfillAppointment && persistedCallId) {
          const { getBookingForCall, backfillAppointmentFromCall } = await import(
            '../appointments/appointment.service.js'
          );
          const bookingCtx = await getBookingForCall(state.tenantId, persistedCallId);
          if (bookingCtx.appointment) {
            appointmentSyncedViaBooking = true;
          } else {
            const backfill = await backfillAppointmentFromCall(state.tenantId, {
              name: resolvedName,
              phone: resolvedPhone,
              service: resolvedService,
              preferredTime: resolvedAppointmentTime,
              useDefaultTimeIfInvalid: true,
              callSid: state.callSid,
            });
            if (backfill?.success) {
              appointmentSyncedViaBooking = true;
              logger.info('POST_CALL_APPOINTMENT_BACKFILL_OK', {
                tenantId: state.tenantId,
                callSid: state.callSid,
                appointmentId: backfill.appointmentId,
                source: bookedAppointment ? 'tool_memory' : 'verbal_booking',
              });
            } else if (backfill && !backfill.success) {
              logger.warn('POST_CALL_APPOINTMENT_BACKFILL_SKIPPED', {
                tenantId: state.tenantId,
                callSid: state.callSid,
                message: backfill.message,
                source: bookedAppointment ? 'tool_memory' : 'verbal_booking',
              });
            }
          }
        }

        // Track call minutes for billing
        await billingService.trackCallMinutes(state.tenantId, state.callSid, durationMs).catch(err => {
          logger.error('REALTIME_TRACK_MINUTES_FAILED', { tenantId: state.tenantId, error: String(err) });
        });

        void import('../../events/event-publisher.js')
          .then(async ({ publishPlatformEvent }) => {
            const { PlatformEventTypes } = await import('../../events/event-types.js');
            publishPlatformEvent(
              PlatformEventTypes.CALL_ENDED,
              {
                callSid: state.callSid,
                durationMs,
                callerPhone: state.callerPhone,
                hasTranscript: !!transcript,
              },
              {
                tenantId: state.tenantId!,
                callSid: state.callSid,
                sessionId: state.sessionId,
              }
            );
          })
          .catch(() => {});

        // Post-call CRM — skip when live tools or backfill already synced CRM/calendars
        const leadToolRan = state.sessionId
          ? deps.eventManager.sessionHadToolCall(state.sessionId, 'create_lead')
          : false;
        const appointmentToolRan = state.sessionId
          ? deps.eventManager.sessionHadToolCall(state.sessionId, 'create_appointment')
          : false;
        if (appointmentToolRan) {
          appointmentSyncedViaBooking = true;
        }

        const shouldSendPostCallCrm =
          !appointmentSyncedViaBooking &&
          !leadToolRan &&
          (resolvedName || resolvedPhone || state.callerPhone);
        if (shouldSendPostCallCrm) {
          const crmPayload = {
            callId: state.callSid,
            type:
              shouldBackfillAppointment || resolvedAppointmentTime
                ? ('appointment' as const)
                : ('lead' as const),
            lead: {
              name: resolvedName,
              phone: resolvedPhone || state.callerPhone,
              service: resolvedService,
              preferred_time: resolvedAppointmentTime,
              notes: `AI call - ${Math.round(durationMs / 1000)}s`,
            },
            appointment:
              shouldBackfillAppointment || resolvedAppointmentTime
                ? {
                    name: resolvedName,
                    phone: resolvedPhone || state.callerPhone,
                    service: resolvedService,
                    time: resolvedAppointmentTime,
                  }
                : undefined,
          };
          void import('../../events/event-publisher.js')
            .then(async ({ publishPlatformEvent }) => {
              const { PlatformEventTypes } = await import('../../events/event-types.js');
              publishPlatformEvent(
                PlatformEventTypes.CRM_SYNC_REQUESTED,
                crmPayload,
                {
                  tenantId: state.tenantId!,
                  callSid: state.callSid,
                  sessionId: state.sessionId,
                }
              );
            })
            .catch(() => {});

          const { isP2AsyncIntegrationsEnabled } = await import(
            '../../events/platform-event-bus.js'
          );
          const { logShadowSyncBaseline, isP2ShadowVerificationEnabled } = await import(
            '../../events/shadow-verification.js'
          );
          if (isP2ShadowVerificationEnabled()) {
            logShadowSyncBaseline('crm_sync', state.tenantId!, crmPayload, {
              callSid: state.callSid,
            });
          }
          if (!isP2AsyncIntegrationsEnabled()) {
            integrationService.sendRealtime(state.tenantId, crmPayload).catch(err => {
              logger.warn('REALTIME_POST_CALL_INTEGRATION_FAILED', { error: String(err) });
            });
          }
        }

        logger.info('REALTIME_CALL_STORED', {
          tenantId: state.tenantId,
          callSid: state.callSid,
          durationMs,
          hasTranscript: !!transcript,
        });

        // Clean up live call state from Redis
        voiceRedis.del(`live_call:${state.tenantId}:${state.callSid}`).catch(() => {});
      }
      // ─── END CRITICAL SECTION ─────────────────────────────────────────

      // Save conversation summary (Redis-based, for quick lookups)
      if (state.tenantId) {
        saveSummary(state, deps).catch(err => {
          logger.error('REALTIME_SUMMARY_SAVE_FAILED', {
            tenantId: state.tenantId,
            sessionId: state.sessionId,
            error: String(err),
          });
        });

        // Trigger automation: call ended follow-up
        import('../automation/automation.service.js').then(({ automationService }) => {
          automationService.sendCallFollowUp(
            state.tenantId!,
            state.callSid || state.sessionId || '',
            state.callerPhone || ''
          ).catch(err => {
            logger.warn('AUTOMATION_CALL_FOLLOWUP_FAILED', { error: String(err) });
          });
        }).catch(() => {});
      }
    }

    // Unregister from distributed session coordinator
    await sessionCoordinator.unregisterSession(state.sessionId, 'connection-cleanup');

    // Clean up Redis
    if (state.tenantId) {
      await voiceRedis.srem(`active_calls:${state.tenantId}`, state.sessionId);
      await concurrencyGuard.release(state.tenantId);
      void import('../dashboard/dashboard-events.js').then(({ publishDashboardPushType }) => {
        publishDashboardPushType(state.tenantId!, 'call.ended', [], { callSid: state.callSid });
      }).catch(() => {});
    }
  }

  // Untrack from heartbeat manager
  heartbeatManager.untrackSocket(socket);

  // Untrack from rate limiter
  wsRateLimiter.unregisterConnection(socket);
}

async function saveSummary(
  state: PostCallState,
  deps: PostCallDeps
): Promise<void> {
  if (!state.sessionId || !state.tenantId) return;

  const sessionMetrics = deps.eventManager.getSessionMetrics(state.sessionId);
  const memories = await deps.memoryManager.getAllSessionMemory(state.sessionId);

  const customerName = memories.find(m => m.type === 'customer_info' && m.key === 'name')?.value;
  const customerPhone = memories.find(m => m.type === 'customer_info' && m.key === 'phone')?.value;
  const primaryIntent = memories.find(m => m.type === 'intent' && m.key === 'primary')?.value?.intent;

  const summary = {
    sessionId: state.sessionId,
    tenantId: state.tenantId,
    callSid: state.callSid || '',
    customerName: customerName || undefined,
    customerPhone: customerPhone || undefined,
    primaryIntent: primaryIntent || undefined,
    topics: memories.filter(m => m.type === 'entity').map(m => m.value),
    sentiment: 'neutral' as const,
    outcome: 'completed' as const,
    duration: sessionMetrics?.startTime ? Date.now() - sessionMetrics.startTime.getTime() : 0,
    transcript: '',
    summary: primaryIntent
      ? `Caller ${customerName || 'unknown'} contacted regarding ${primaryIntent}.`
      : `Call completed with ${customerName || 'unknown caller'}.`,
    createdAt: new Date(),
  };

  await deps.memoryManager.saveConversationSummary(summary);
  await deps.analyticsManager.trackEvent({
    sessionId: state.sessionId,
    tenantId: state.tenantId,
    callSid: state.callSid || '',
    eventType: 'call_end',
    timestamp: new Date(),
    data: {
      duration: summary.duration,
      outcome: summary.outcome,
    },
  });
}
