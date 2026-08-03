import { describe, it, expect, vi, afterEach } from 'vitest';
import { JobberProvider } from '../../../apps/gateway/src/services/integrations/providers/jobber.provider.js';

describe('JobberProvider', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
        global.fetch = originalFetch;
        vi.restoreAllMocks();
    });

    it('uses Jobber GraphQL input argument for create mutations', async () => {
        const bodies: string[] = [];
        const fetchMock = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
            bodies.push(String(init?.body || ''));
            const body = bodies[bodies.length - 1];
            if (body.includes('clientCreate')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () =>
                        JSON.stringify({
                            data: { clientCreate: { client: { id: 'client-1' }, userErrors: [] } },
                        }),
                };
            }
            if (body.includes('requestCreate')) {
                return {
                    ok: true,
                    status: 200,
                    text: async () =>
                        JSON.stringify({
                            data: { requestCreate: { request: { id: 'req-1' }, userErrors: [] } },
                        }),
                };
            }
            return {
                ok: true,
                status: 200,
                text: async () => JSON.stringify({ data: { account: { id: 'acct-1', name: 'Acme' } } }),
            };
        });
        global.fetch = fetchMock as typeof fetch;

        const provider = new JobberProvider();
        const result = await provider.sendTestLead({ apiToken: 'token', accountId: '' });

        expect(result.success).toBe(true);
        const clientBody = bodies.find((b) => b.includes('clientCreate')) || '';
        const requestBody = bodies.find((b) => b.includes('requestCreate')) || '';
        expect(clientBody).toContain('clientCreate(input:');
        expect(requestBody).toContain('requestCreate(input:');
        expect(requestBody).not.toContain('"source"');
    });
});
