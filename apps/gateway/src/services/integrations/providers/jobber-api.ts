/**
 * Shared Jobber API constants and GraphQL transport.
 * Docs: https://developer.getjobber.com/docs/
 */

export const JOBBER_GRAPHQL_URL = 'https://api.getjobber.com/api/graphql';
export const JOBBER_OAUTH_AUTHORIZE_URL = 'https://api.getjobber.com/api/oauth/authorize';
export const JOBBER_OAUTH_TOKEN_URL = 'https://api.getjobber.com/api/oauth/token';

/** Latest active GraphQL version — see https://developer.getjobber.com/docs/changelog/ */
export const JOBBER_DEFAULT_API_VERSION = '2025-04-16';

export const JOBBER_API_VERSION_FALLBACKS = [
    JOBBER_DEFAULT_API_VERSION,
    '2025-01-20',
    '2024-11-12',
    '2023-08-18',
] as const;

export function getJobberApiVersion(): string {
    const explicit = process.env.JOBBER_API_VERSION?.trim();
    return explicit || JOBBER_DEFAULT_API_VERSION;
}

function jobberApiVersionsToTry(): string[] {
    const primary = getJobberApiVersion();
    const chain = [primary, ...JOBBER_API_VERSION_FALLBACKS];
    return [...new Set(chain)];
}

export interface JobberGraphqlResult {
    ok: boolean;
    status: number;
    data: {
        errors?: Array<{ message?: string }>;
        data?: Record<string, unknown>;
    } | null;
    rawText: string;
    apiVersion: string;
}

function fetchHttpStatus(response: { status: unknown }): number {
    return (response as unknown as { status: number }).status;
}

/** POST to Jobber GraphQL; retries alternate API versions when the service returns HTTP 404. */
export async function jobberGraphqlRequest(
    apiToken: string,
    query: string,
    variables?: Record<string, unknown>
): Promise<JobberGraphqlResult> {
    const token = apiToken.trim();
    let last: JobberGraphqlResult = {
        ok: false,
        status: 0,
        data: null,
        rawText: '',
        apiVersion: getJobberApiVersion(),
    };

    for (const apiVersion of jobberApiVersionsToTry()) {
        const response = await fetch(JOBBER_GRAPHQL_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${token}`,
                'Content-Type': 'application/json',
                Accept: 'application/json',
                'X-JOBBER-GRAPHQL-VERSION': apiVersion,
            },
            body: JSON.stringify({ query, variables }),
        });

        const rawText = await response.text();
        let data: JobberGraphqlResult['data'] = null;
        try {
            data = rawText ? (JSON.parse(rawText) as JobberGraphqlResult['data']) : null;
        } catch {
            data = null;
        }

        const httpStatus = fetchHttpStatus(response);
        last = {
            ok: response.ok,
            status: httpStatus,
            data,
            rawText,
            apiVersion,
        };

        if (httpStatus !== 404) {
            return last;
        }
    }

    return last;
}

export function jobberHttpErrorMessage(status: number, rawText: string): string {
    if (status === 401) {
        return 'Jobber rejected the connection — click Connect with Jobber and authorize again.';
    }
    if (status === 404) {
        return (
            'Could not reach Jobber (HTTP 404). Confirm your Jobber plan includes API access, ' +
            'and that the OAuth callback URL in the Jobber Developer Center matches Call IQ exactly.'
        );
    }

    const parsed = tryParseJson(rawText);
    const graphqlMsg = parsed?.errors?.[0]?.message || parsed?.message || parsed?.error?.message;
    if (graphqlMsg) return String(graphqlMsg);

    if (rawText.trim()) {
        return `Could not reach Jobber (HTTP ${status}): ${rawText.trim().slice(0, 180)}`;
    }
    return `Could not reach Jobber (HTTP ${status})`;
}

function tryParseJson(raw: string): {
    message?: string;
    error?: { message?: string };
    errors?: Array<{ message?: string }>;
} | null {
    try {
        return JSON.parse(raw) as {
            message?: string;
            error?: { message?: string };
            errors?: Array<{ message?: string }>;
        };
    } catch {
        return null;
    }
}
