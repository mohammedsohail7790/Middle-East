export interface SetmoreConfig {
    /** Setmore "Refresh Token" from Setmore → API & Apps */
    apiKey: string;
}

const TOKEN_URL = 'https://developer.setmore.com/api/v1/o/oauth2/token';
const BASE_URL = 'https://developer.setmore.com/api/v1';

async function getAccessToken(config: SetmoreConfig): Promise<string> {
    const response = await fetch(`${TOKEN_URL}?refreshToken=${encodeURIComponent(config.apiKey)}`, { method: 'POST' });
    const data = (await response.json()) as { data?: { token?: { access_token?: string } } };
    const token = data?.data?.token?.access_token;
    if (!response.ok || !token) {
        throw new Error('Could not refresh Setmore access token');
    }
    return token;
}

export class SetmoreProvider {
    async verifyConnection(config: SetmoreConfig): Promise<{ success: boolean; message: string }> {
        try {
            const token = await getAccessToken(config);
            const response = await fetch(`${BASE_URL}/o/services`, { headers: { Authorization: `Bearer ${token}` } });
            if (response.ok) return { success: true, message: 'Connected to Setmore successfully' };
            return { success: false, message: `Could not reach Setmore (HTTP ${response.status})` };
        } catch {
            return {
                success: false,
                message: 'Setmore rejected that key — copy your Refresh Token again from Setmore → API & Apps.',
            };
        }
    }

    async sendTest(config: SetmoreConfig): Promise<{ success: boolean; message: string }> {
        try {
            const token = await getAccessToken(config);
            const response = await fetch(`${BASE_URL}/o/services`, { headers: { Authorization: `Bearer ${token}` } });
            if (!response.ok) {
                return { success: false, message: `Could not reach Setmore (HTTP ${response.status})` };
            }
            const data = (await response.json()) as { data?: { services?: unknown[] } };
            const count = data?.data?.services?.length ?? 0;
            return {
                success: true,
                message: `Test successful — found ${count} service${count === 1 ? '' : 's'} in your Setmore account.`,
            };
        } catch {
            return {
                success: false,
                message: 'Setmore rejected that key — copy your Refresh Token again from Setmore → API & Apps.',
            };
        }
    }
}
