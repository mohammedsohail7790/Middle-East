import { randomUUID } from 'crypto';
import { voiceDb } from '../voice/tenant-scope.js';
import { logger } from '../logger.js';

export interface CallQualityResult {
  overallScore: number;
  bookingQuality: number;
  sentimentScore: number;
  interruptionRate: number;
  escalationDetected: boolean;
  failureClass: string;
}

function estimateSentiment(transcript: string): number {
  const t = transcript.toLowerCase();
  const negative = ['angry', 'frustrated', 'upset', 'terrible', 'cancel'].filter((w) =>
    t.includes(w)
  ).length;
  const positive = ['thank', 'great', 'perfect', 'appreciate'].filter((w) => t.includes(w)).length;
  return Math.max(0, Math.min(1, 0.5 + (positive - negative) * 0.15));
}

function detectEscalation(transcript: string): boolean {
  const t = transcript.toLowerCase();
  return ['manager', 'supervisor', 'human', 'transfer', 'speak to someone'].some((p) =>
    t.includes(p)
  );
}

/** Inbound call QA scoring — replay-safe, no outbound coaching. */
export async function scoreInboundCall(args: {
  tenantId: string;
  callId?: string;
  callSid?: string;
  transcript: string;
  hadAppointment?: boolean;
  durationMs?: number;
}): Promise<CallQualityResult> {
  const lines = args.transcript.split('\n').filter(Boolean);
  const assistantLines = lines.filter((l) => l.startsWith('assistant:')).length;
  const callerLines = lines.filter((l) => l.startsWith('caller:')).length;
  const interruptionRate =
    callerLines > 0 ? Math.min(1, assistantLines / (callerLines + assistantLines)) : 0;

  const sentimentScore = estimateSentiment(args.transcript);
  const escalationDetected = detectEscalation(args.transcript);
  const bookingQuality = args.hadAppointment ? 0.85 : lines.length > 4 ? 0.45 : 0.2;
  const durationFactor =
    args.durationMs && args.durationMs > 120_000 ? 0.9 : args.durationMs && args.durationMs < 15_000 ? 0.4 : 0.7;
  const failureClass =
    lines.length < 2
      ? 'no_conversation'
      : escalationDetected
        ? 'escalation'
        : sentimentScore < 0.35
          ? 'negative_sentiment'
          : 'ok';

  const overallScore = Math.round(
    (bookingQuality * 0.4 + sentimentScore * 0.3 + durationFactor * 0.2 + (1 - interruptionRate) * 0.1) *
      100
  );

  const result: CallQualityResult = {
    overallScore,
    bookingQuality: Math.round(bookingQuality * 100),
    sentimentScore: Math.round(sentimentScore * 100),
    interruptionRate: Math.round(interruptionRate * 100) / 100,
    escalationDetected,
    failureClass,
  };

  try {
    await voiceDb.query(
      `INSERT INTO public.call_quality_scores
        (id, tenant_id, call_id, call_sid, overall_score, booking_quality, sentiment_score,
         interruption_rate, escalation_detected, failure_class, payload)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::jsonb)`,
      [
        randomUUID(),
        args.tenantId,
        args.callId || null,
        args.callSid || null,
        result.overallScore,
        result.bookingQuality,
        result.sentimentScore,
        result.interruptionRate,
        result.escalationDetected,
        result.failureClass,
        JSON.stringify({ durationMs: args.durationMs }),
      ]
    );
  } catch (err) {
    logger.debug('CALL_QUALITY_PERSIST_SKIP', { error: String(err) });
  }

  void import('../../events/event-publisher.js')
    .then(async ({ publishPlatformEvent }) => {
      const { PlatformEventTypes } = await import('../../events/event-types.js');
      publishPlatformEvent(
        PlatformEventTypes.CALL_SUMMARY_GENERATED,
        { ...result, callSid: args.callSid },
        { tenantId: args.tenantId, callSid: args.callSid }
      );
    })
    .catch(() => {});

  return result;
}

export async function listQualityScores(tenantId: string, limit = 50) {
  try {
    const r = await voiceDb.query(
      `SELECT * FROM public.call_quality_scores
       WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT $2`,
      [tenantId, limit]
    );
    return r.rows;
  } catch (err) {
    logger.debug('CALL_QUALITY_LIST_SKIP', { tenantId, error: String(err) });
    return [];
  }
}
