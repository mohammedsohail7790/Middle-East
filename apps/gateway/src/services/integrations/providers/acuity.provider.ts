export interface AcuityConfig {
    userId: string;
    apiKey: string;
}

const BASE_URL = 'https://acuityscheduling.com/api/v1';

function authHeaders(config: AcuityConfig): Record<string, string> {
    const token = Buffer.from(`${config.userId}:${config.apiKey}`).toString('base64');
    return { Authorization: `Basic ${token}` };
}

export class AcuityProvider {
    async verifyConnection(config: AcuityConfig): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${BASE_URL}/me`, { headers: authHeaders(config) });
            if (response.ok) return { success: true, message: 'Connected to Acuity Scheduling successfully' };
            const status = (response as unknown as { status: number }).status;
            if (status === 401 || status === 403) {
                return { success: false, message: 'Acuity rejected those credentials — double-check your User ID and API Key.' };
            }
            return { success: false, message: `Could not reach Acuity Scheduling (HTTP ${status})` };
        } catch {
            return { success: false, message: 'Could not reach Acuity Scheduling — check your credentials and try again.' };
        }
    }

    async sendTest(config: AcuityConfig): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${BASE_URL}/appointment-types`, { headers: authHeaders(config) });
            if (!response.ok) {
                const status = (response as unknown as { status: number }).status;
                return {
                    success: false,
                    message:
                        status === 401 || status === 403
                            ? 'Acuity rejected those credentials — double-check your User ID and API Key.'
                            : `Could not reach Acuity Scheduling (HTTP ${status})`,
                };
            }
            const types = (await response.json()) as unknown[];
            return {
                success: true,
                message: `Test successful — found ${types.length} appointment type${types.length === 1 ? '' : 's'} in your Acuity account.`,
            };
        } catch {
            return { success: false, message: 'Could not reach Acuity Scheduling — check your credentials and try again.' };
        }
    }
}
