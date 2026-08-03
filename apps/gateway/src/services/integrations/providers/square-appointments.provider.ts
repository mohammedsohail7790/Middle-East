export interface SquareAppointmentsConfig {
    accessToken: string;
    locationId: string;
}

const BASE_URL = 'https://connect.squareup.com/v2';
const SQUARE_VERSION = '2024-01-18';

function authHeaders(config: SquareAppointmentsConfig): Record<string, string> {
    return {
        Authorization: `Bearer ${config.accessToken}`,
        'Square-Version': SQUARE_VERSION,
        'Content-Type': 'application/json',
    };
}

export class SquareAppointmentsProvider {
    async verifyConnection(config: SquareAppointmentsConfig): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${BASE_URL}/locations/${encodeURIComponent(config.locationId)}`, {
                headers: authHeaders(config),
            });
            if (response.ok) return { success: true, message: 'Connected to Square Appointments successfully' };
            const status = (response as unknown as { status: number }).status;
            if (status === 401) {
                return {
                    success: false,
                    message: 'Square rejected that access token — generate a new one from the Square Developer Dashboard.',
                };
            }
            if (status === 404) {
                return {
                    success: false,
                    message: 'Location ID not found — double-check it in your Square Dashboard under Locations.',
                };
            }
            return { success: false, message: `Could not reach Square Appointments (HTTP ${status})` };
        } catch {
            return { success: false, message: 'Could not reach Square Appointments — check your credentials and try again.' };
        }
    }

    async sendTest(config: SquareAppointmentsConfig): Promise<{ success: boolean; message: string }> {
        try {
            const response = await fetch(`${BASE_URL}/locations/${encodeURIComponent(config.locationId)}`, {
                headers: authHeaders(config),
            });
            if (!response.ok) {
                const status = (response as unknown as { status: number }).status;
                return {
                    success: false,
                    message:
                        status === 401
                            ? 'Square rejected that access token — generate a new one from the Square Developer Dashboard.'
                            : `Could not reach Square Appointments (HTTP ${status})`,
                };
            }
            const data = (await response.json()) as { location?: { name?: string } };
            const name = data.location?.name || 'your location';
            return { success: true, message: `Test successful — connected to ${name} in Square.` };
        } catch {
            return { success: false, message: 'Could not reach Square Appointments — check your credentials and try again.' };
        }
    }
}
