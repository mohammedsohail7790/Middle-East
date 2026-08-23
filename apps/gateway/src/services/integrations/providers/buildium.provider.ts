export interface BuildiumConfig {
    clientId: string;
    clientSecret: string;
}

const BASE_URL = 'https://api.buildium.com/v1';

function authHeaders(config: BuildiumConfig): Record<string, string> {
    return {
        'x-buildium-client-id': config.clientId,
        'x-buildium-client-secret': config.clientSecret,
        'Content-Type': 'application/json',
    };
}

export class BuildiumProvider {
    async verifyConnection(config: BuildiumConfig): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${BASE_URL}/rentals?limit=1`, { headers: authHeaders(config) });
            if (response.ok) return { success: true, message: 'Connected to Buildium successfully' };
            const status = (response as unknown as { status: number }).status;
            if (status === 401) {
                return { success: false, message: 'Buildium rejected those credentials — double-check your Client ID and Client Secret.' };
            }
            return { success: false, message: `Could not reach Buildium (HTTP ${status})` };
        } catch {
            return { success: false, message: 'Could not reach Buildium — check your credentials and try again.' };
        }
    }

    async sendTest(config: BuildiumConfig): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${BASE_URL}/rentals?limit=1`, { headers: authHeaders(config) });
            if (!response.ok) {
                const status = (response as unknown as { status: number }).status;
                return {
                    success: false,
                    message:
                        status === 401
                            ? 'Buildium rejected those credentials — double-check your Client ID and Client Secret.'
                            : `Could not reach Buildium (HTTP ${status})`,
                };
            }
            const data = (await response.json()) as unknown[];
            return {
                success: true,
                message: `Test successful — found ${data.length} propert${data.length === 1 ? 'y' : 'ies'} in your Buildium account.`,
            };
        } catch {
            return { success: false, message: 'Could not reach Buildium — check your credentials and try again.' };
        }
    }
}
