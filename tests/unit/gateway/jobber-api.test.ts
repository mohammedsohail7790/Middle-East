import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    JOBBER_DEFAULT_API_VERSION,
    jobberGraphqlRequest,
    jobberHttpErrorMessage,
} from '../../../apps/gateway/src/services/integrations/providers/jobber-api.js';

describe('jobber-api', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
        delete process.env.JOBBER_API_VERSION;
    });

    it('uses latest default API version', () => {
        expect(JOBBER_DEFAULT_API_VERSION).toBe('2025-04-16');
    });

    it('retries alternate API versions when GraphQL returns 404', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce({
                ok: false,
                status: 404,
                text: async () => 'not found',
            })
            .mockResolvedValueOnce({
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ data: { account: { id: '1', name: 'Acme' } } }),
            });
        global.fetch = fetchMock as typeof fetch;

        const result = await jobberGraphqlRequest('token', '{ account { id name } }');
        expect(result.ok).toBe(true);
        expect(result.data?.data?.account).toEqual({ id: '1', name: 'Acme' });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('maps 404 to actionable guidance', () => {
        expect(jobberHttpErrorMessage(404, '')).toContain('HTTP 404');
        expect(jobberHttpErrorMessage(404, '')).toContain('Developer Center');
    });

    it('maps 401 to reconnect guidance', () => {
        expect(jobberHttpErrorMessage(401, '')).toContain('authorize again');
    });
});
