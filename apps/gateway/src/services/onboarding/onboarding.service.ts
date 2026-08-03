import { logger } from '../logger.js';
import { voiceDb } from '../voice/tenant-scope.js';
import { phoneProvisioningService } from '../phone-provisioning/phoneProvisioning.service.js';
import { getGatewayPublicHttpsBase } from '../env.js';

const lastTestCallAt = new Map<string, number>();
const TEST_CALL_COOLDOWN_MS = 60_000;

interface OnboardingProgress {
    tenantId: string;
    step: 'company' | 'twilio' | 'knowledge' | 'crm' | 'calendar' | 'test_call' | 'complete';
    completed: boolean;
    twilioProvisioned: boolean;
    knowledgeUploaded: boolean;
    crmConnected: boolean;
    calendarConnected: boolean;
    testCallCompleted: boolean;
    skippedSteps: string[];
}

interface ProvisioningResult {
    success: boolean;
    phoneNumber?: string;
    error?: string;
}

export class OnboardingService {
    async getProgress(tenantId: string): Promise<OnboardingProgress> {
        try {
            const result = await voiceDb.query(
                `SELECT * FROM public.onboarding_progress WHERE tenant_id = $1`,
                [tenantId]
            );

            if (result.rows.length === 0) {
                return this.createDefaultProgress(tenantId);
            }

            return this.mapProgress(result.rows[0]);
        } catch (err) {
            logger.error('ONBOARDING_GET_PROGRESS_ERROR', {
                tenantId,
                error: String(err),
            });
            return this.createDefaultProgress(tenantId);
        }
    }

    private createDefaultProgress(tenantId: string): OnboardingProgress {
        return {
            tenantId,
            step: 'company',
            completed: false,
            twilioProvisioned: false,
            knowledgeUploaded: false,
            crmConnected: false,
            calendarConnected: false,
            testCallCompleted: false,
            skippedSteps: [],
        };
    }

    async updateProgress(tenantId: string, updates: Partial<OnboardingProgress>): Promise<void> {
        try {
            const current = await this.getProgress(tenantId);

            const merged = {
                ...current,
                ...updates,
                tenantId,
            };

            await voiceDb.query(
                `INSERT INTO public.onboarding_progress
                 (tenant_id, step, completed, twilio_provisioned, knowledge_uploaded,
                  crm_connected, calendar_connected, test_call_completed, skipped_steps)
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 ON CONFLICT (tenant_id) DO UPDATE SET
                 step = EXCLUDED.step,
                 completed = EXCLUDED.completed,
                 twilio_provisioned = EXCLUDED.twilio_provisioned,
                 knowledge_uploaded = EXCLUDED.knowledge_uploaded,
                 crm_connected = EXCLUDED.crm_connected,
                 calendar_connected = EXCLUDED.calendar_connected,
                 test_call_completed = EXCLUDED.test_call_completed,
                 skipped_steps = EXCLUDED.skipped_steps,
                 updated_at = NOW()`,
                [
                    merged.tenantId, merged.step, merged.completed, merged.twilioProvisioned,
                    merged.knowledgeUploaded, merged.crmConnected, merged.calendarConnected,
                    merged.testCallCompleted,
                    merged.skippedSteps,
                ]
            );

            logger.info('ONBOARDING_PROGRESS_UPDATED', {
                tenantId,
                step: merged.step,
                completed: merged.completed,
            });
        } catch (err) {
            logger.error('ONBOARDING_UPDATE_PROGRESS_ERROR', {
                tenantId,
                error: String(err),
            });
        }
    }

    async provisionPhoneNumber(tenantId: string, areaCode?: string): Promise<ProvisioningResult> {
        try {
            if (!process.env.TWILIO_ACCOUNT_SID || !process.env.TWILIO_AUTH_TOKEN) {
                return { success: false, error: 'Twilio not configured' };
            }

            const ac = String(areaCode ?? '')
                .replace(/\D/g, '')
                .slice(0, 3);
            if (ac.length !== 3) {
                return { success: false, error: 'Area code must be exactly 3 digits' };
            }

            const available = await phoneProvisioningService.searchAvailable(ac, 5);
            if (available.length === 0) {
                return { success: false, error: 'No phone numbers available for this area code' };
            }

            const purchased = await phoneProvisioningService.purchaseNumber(tenantId, available[0].phoneNumber);

            await voiceDb.query(
                `UPDATE public.voice_tenants
                 SET phone_number = CASE
                       WHEN phone_number IS NULL OR phone_number LIKE '+1000%' THEN $1
                       ELSE phone_number
                     END
                 WHERE id = $2`,
                [purchased.phoneNumber, tenantId]
            );

            logger.info('ONBOARDING_PHONE_PROVISIONED', {
                tenantId,
                phoneNumber: purchased.phoneNumber,
                twilioSid: purchased.twilioSid,
            });

            void import('../dashboard/dashboard-events.js').then(({ publishDashboardPushType }) => {
                publishDashboardPushType(tenantId, 'phone.updated', [], {
                    phoneNumber: purchased.phoneNumber,
                    source: 'onboarding',
                });
            });

            return { success: true, phoneNumber: purchased.phoneNumber };
        } catch (err) {
            logger.error('ONBOARDING_PHONE_PROVISION_FAILED', {
                tenantId,
                error: String(err),
            });
            return { success: false, error: String(err) };
        }
    }

    async checkTwilioSetup(tenantId: string): Promise<{ configured: boolean; phoneNumber?: string; error?: string }> {
        try {
            const listed = await phoneProvisioningService.listNumbers(tenantId);
            if (listed.length > 0) {
                return { configured: true, phoneNumber: listed[0].phoneNumber };
            }

            const result = await voiceDb.query(
                `SELECT phone_number FROM public.voice_tenants WHERE id = $1`,
                [tenantId]
            );

            if (result.rows.length === 0) {
                return { configured: false };
            }

            const row = result.rows[0] as { phone_number?: string };
            const line = row.phone_number;
            if (!line || line.startsWith('+1000')) {
                return { configured: false };
            }

            return { configured: true, phoneNumber: line };
        } catch (err) {
            return { configured: false, error: String(err) };
        }
    }

    async runTestCall(tenantId: string, phoneNumber?: string): Promise<{ success: boolean; message: string }> {
        try {
            const lastCall = lastTestCallAt.get(tenantId);
            if (lastCall && Date.now() - lastCall < TEST_CALL_COOLDOWN_MS) {
                const waitSeconds = Math.ceil((TEST_CALL_COOLDOWN_MS - (Date.now() - lastCall)) / 1000);
                return { success: false, message: `Please wait ${waitSeconds} seconds between test calls` };
            }

            const toNumber = phoneNumber || process.env.TEST_CALL_NUMBER || undefined;

            if (!toNumber) {
                return { success: false, message: 'No destination phone number provided. Enter a number or set TEST_CALL_NUMBER.' };
            }

            const listed = await phoneProvisioningService.listNumbers(tenantId);
            let fromNumber: string | undefined = listed[0]?.phoneNumber;

            if (!fromNumber) {
                const tenantResult = await voiceDb.query(
                    `SELECT phone_number FROM public.voice_tenants WHERE id = $1`,
                    [tenantId]
                );
                fromNumber = tenantResult.rows[0]?.phone_number as string | undefined;
            }

            if (!fromNumber) {
                return { success: false, message: 'No phone number provisioned. Add a number first.' };
            }

            const baseUrl = getGatewayPublicHttpsBase();
            if (!baseUrl) {
                return {
                    success: false,
                    message:
                        'Gateway public URL is not configured. Set RENDER_EXTERNAL_URL, GATEWAY_PUBLIC_URL, or TWILIO_STREAM_WSS_URL so Twilio can fetch call instructions.',
                };
            }

            const twimlUrl = `${baseUrl}/api/v1/voice/test-outbound-twiml`;
            const statusCallback = `${baseUrl}/api/v1/voice/stream-status`;

            const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Calls.json`, {
                method: 'POST',
                headers: {
                    'Authorization': `Basic ${Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString('base64')}`,
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: new URLSearchParams({
                    To: toNumber,
                    From: fromNumber,
                    Url: twimlUrl,
                    StatusCallback: statusCallback,
                    StatusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'].join(' '),
                }).toString(),
            });

            const data = await response.json();
            if (data.sid) {
                lastTestCallAt.set(tenantId, Date.now());
                logger.info('ONBOARDING_TEST_CALL_INITIATED', {
                    tenantId,
                    callSid: data.sid,
                });
                return { success: true, message: `Test call initiated (SID: ${data.sid})` };
            }

            return { success: false, message: data.message || 'Failed to initiate test call' };
        } catch (err) {
            logger.error('ONBOARDING_TEST_CALL_FAILED', {
                tenantId,
                error: String(err),
            });
            return { success: false, message: String(err) };
        }
    }

    async skipStep(tenantId: string, step: string): Promise<void> {
        const progress = await this.getProgress(tenantId);
        if (!progress.skippedSteps.includes(step)) {
            progress.skippedSteps.push(step);
            await this.updateProgress(tenantId, { skippedSteps: progress.skippedSteps });
        }
    }

    private mapProgress(row: any): OnboardingProgress {
        return {
            tenantId: row.tenant_id,
            step: row.step,
            completed: row.completed || false,
            twilioProvisioned: row.twilio_provisioned || false,
            knowledgeUploaded: row.knowledge_uploaded || false,
            crmConnected: row.crm_connected || false,
            calendarConnected: row.calendar_connected || false,
            testCallCompleted: row.test_call_completed || false,
            skippedSteps: row.skipped_steps || [],
        };
    }
}

export const onboardingService = new OnboardingService();
