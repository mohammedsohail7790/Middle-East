/** Shared helpers for API-key integration connect flows. */

export function trimCredentialFields(raw: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(raw)) {
        if (typeof value === 'string') {
            out[key] = value.trim();
        } else if (value != null) {
            out[key] = value;
        }
    }
    return out;
}

export async function readHttpErrorDetail(response: { json(): Promise<unknown> }): Promise<string | undefined> {
    try {
        const body = (await response.json()) as { message?: string; error?: string };
        const detail = body.message || body.error;
        return typeof detail === 'string' && detail.trim() ? detail.trim() : undefined;
    } catch {
        return undefined;
    }
}

export function formatAuthFailure(
    appName: string,
    status: number,
    detail?: string,
    extraHint?: string
): string {
    if (detail) {
        if (extraHint && !detail.toLowerCase().includes(extraHint.slice(0, 20).toLowerCase())) {
            return `${detail} ${extraHint}`;
        }
        return detail;
    }
    if (status === 401 || status === 403) {
        const hint = extraHint ? ` ${extraHint}` : '';
        return `${appName} rejected those credentials — check your API key and account permissions.${hint}`;
    }
    return `Could not reach ${appName} (HTTP ${status})`;
}

/** Legacy + generic API integrations that must pass a live test before we save credentials. */
export const LEGACY_TEST_ON_CONFIGURE = new Set([
    'freshsales',
    'insightly',
    'pipedrive',
    'servicetitan',
    'jobber',
    'housecallpro',
]);

export function connectVerifiedMessage(message: string): boolean {
    return /successfully|test successful|connected to|verified|connection test/i.test(message);
}
