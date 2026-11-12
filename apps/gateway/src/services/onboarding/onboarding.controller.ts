import { requireVoiceApiAccess } from '../voice/security.js';
import { getTenantId } from '../auth/tenant-context.js';
import { verifySupabaseAuthOnly } from '../auth/jwt-tenant-verifier.js';
import { onboardingService } from './onboarding.service.js';
import { logger } from '../logger.js';
import express from 'express';
import {
  buildTonePreviewSampleText,
  synthesizeOpenAiTtsMp3,
  TONE_PREVIEW_VOICE,
  ttsInstructionsFor,
} from '../realtime/receptionist-voice.js';
import { checkLimit, respond429 } from '../../security/tiered-rate-limit.js';

const VOICE_PREVIEW_WINDOW_MS = 60_000;

/** The voices the live receptionist can use. A preview may ask for one of these, never anything else. */
export const PREVIEW_VOICES: ReadonlySet<string> = new Set(['marin', 'coral', 'shimmer', 'cedar', 'ash', 'sage']);
const PREVIEW_TEXT_MAX = 300;

/**
 * What a voice preview request asks for. The setup wizard can ask to hear its own greeting in a chosen voice; without those fields the old behaviour (a sample for the chosen
 * personality) is unchanged. The text is cut to 300 characters and the voice must be on the list, because every preview costs a text-to-speech call.
 */
export function resolvePreviewRequest(body: any): { tone: string; agentName: string; voice: string; text: string | null; language: string | null } {
    const tone = String(body?.tone || 'professional').toLowerCase();
    const agentName = String(body?.agentName || 'Sarah').trim() || 'Sarah';
    const allowed = new Set(['professional', 'friendly', 'warm', 'casual', 'formal']);
    const resolvedTone = allowed.has(tone) ? tone : 'professional';
    const asked = String(body?.voice || '').toLowerCase();
    const voice = PREVIEW_VOICES.has(asked) ? asked : TONE_PREVIEW_VOICE[resolvedTone] || 'coral';
    const raw = typeof body?.text === 'string' ? body.text.replace(/\s+/g, ' ').trim().slice(0, PREVIEW_TEXT_MAX) : '';
    const lang = typeof body?.language === 'string' && /^[a-z]{2}(-[A-Za-z]{2})?$/.test(body.language.trim()) ? body.language.trim() : null;
    return { tone: resolvedTone, agentName, voice, text: raw || null, language: lang };
}
const VOICE_PREVIEW_MAX = Number(process.env.RATE_LIMIT_VOICE_PREVIEW_PER_MIN || 5);

export function createOnboardingRouter(): express.Router {
    const router = express.Router();

    /** Personality voice samples during setup (auth only — tenant not created yet) */
    router.post('/voice-preview', async (req: any, res: any) => {
        try {
            const authHeader = String(req.headers.authorization || '');
            if (!authHeader.startsWith('Bearer ')) {
                return res.status(401).json({ success: false, error: 'Unauthorized' });
            }

            const verified = await verifySupabaseAuthOnly(authHeader.slice(7));
            if ('error' in verified) {
                return res.status(verified.status).json({ success: false, error: verified.error });
            }

            // Rate limit: 5 voice previews per minute per user (TTS is expensive)
            const userKey = `voice-preview:${verified.userId || 'unknown'}`;
            const limit = await checkLimit(userKey, VOICE_PREVIEW_MAX, VOICE_PREVIEW_WINDOW_MS);
            if (!limit.allowed) {
                respond429(res, limit.retryAfterSec || 60);
                return;
            }

            const asked = resolvePreviewRequest(req.body);
            const voice = asked.voice;
            const sampleText = asked.text ?? buildTonePreviewSampleText(asked.tone, asked.agentName);
            const buffer = await synthesizeOpenAiTtsMp3(sampleText, voice, { instructions: ttsInstructionsFor(asked.language ?? undefined) });

            res.set('Content-Type', 'audio/mpeg');
            res.set('Content-Length', String(buffer.length));
            res.set('Cache-Control', 'no-store');
            return res.send(buffer);
        } catch (error) {
            logger.error('Onboarding voice preview failed', { error: String(error) });
            return res.status(500).json({
                success: false,
                error: error instanceof Error ? error.message : 'Voice preview failed',
            });
        }
    });

    router.use(requireVoiceApiAccess);

    router.get('/progress', async (req: any, res: any) => {
        try {
            const tenantId = getTenantId(req);

            const progress = await onboardingService.getProgress(tenantId);
            res.json({ success: true, data: progress });
        } catch (error) {
            logger.error('Failed to get onboarding progress', { error: String(error) });
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });

    router.post('/progress', async (req: any, res: any) => {
        try {
            const tenantId = getTenantId(req);

            const { step, completed, twilioProvisioned, knowledgeUploaded, crmConnected, calendarConnected, testCallCompleted, skippedSteps } = req.body;

            await onboardingService.updateProgress(tenantId, {
                ...(step && { step }),
                ...(completed !== undefined && { completed }),
                ...(twilioProvisioned !== undefined && { twilioProvisioned }),
                ...(knowledgeUploaded !== undefined && { knowledgeUploaded }),
                ...(crmConnected !== undefined && { crmConnected }),
                ...(calendarConnected !== undefined && { calendarConnected }),
                ...(testCallCompleted !== undefined && { testCallCompleted }),
                ...(skippedSteps && { skippedSteps }),
            });

            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to update onboarding progress', { error: String(error) });
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });

    router.post('/provision-phone', async (req: any, res: any) => {
        try {
            const tenantId = getTenantId(req);

            const { areaCode } = req.body;
            const result = await onboardingService.provisionPhoneNumber(tenantId, areaCode);

            if (result.success) {
                await onboardingService.updateProgress(tenantId, {
                    twilioProvisioned: true,
                    step: 'twilio',
                });
                return res.json({ success: true, data: { phoneNumber: result.phoneNumber } });
            }

            const status = /not configured|Twilio/i.test(result.error || '') ? 503 : 400;
            return res.status(status).json({ success: false, error: result.error || 'Failed to provision phone number' });
        } catch (error) {
            logger.error('Failed to provision phone', { error: String(error) });
            res.status(500).json({ success: false, error: 'Failed to provision phone number' });
        }
    });

    router.get('/twilio-status', async (req: any, res: any) => {
        try {
            const tenantId = getTenantId(req);

            const status = await onboardingService.checkTwilioSetup(tenantId);
            res.json({ success: true, data: status });
        } catch (error) {
            logger.error('Failed to check Twilio status', { error: String(error) });
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });

    router.post('/test-call', async (req: any, res: any) => {
        try {
            const tenantId = getTenantId(req);
            const phoneNumber: string | undefined = req.body?.phoneNumber?.trim();

            const result = await onboardingService.runTestCall(tenantId, phoneNumber);

            if (result.success) {
                await onboardingService.updateProgress(tenantId, {
                    testCallCompleted: true,
                });
            }

            res.json(result);
        } catch (error) {
            logger.error('Failed to run test call', { error: String(error) });
            res.status(500).json({ success: false, error: 'Failed to initiate test call' });
        }
    });

    router.post('/skip-step', async (req: any, res: any) => {
        try {
            const tenantId = getTenantId(req);

            const { step } = req.body;
            if (!step) return res.status(400).json({ success: false, error: 'Step name required' });

            await onboardingService.skipStep(tenantId, step);
            res.json({ success: true });
        } catch (error) {
            logger.error('Failed to skip step', { error: String(error) });
            res.status(500).json({ success: false, error: 'Internal server error' });
        }
    });

    return router;
}
