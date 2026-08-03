import { describe, it, expect, vi, afterEach } from 'vitest';
import { ZohoProvider } from '../../../apps/gateway/src/services/integrations/providers/zoho.provider.js';
import { CopperProvider } from '../../../apps/gateway/src/services/integrations/providers/copper.provider.js';
import { FollowUpBossProvider } from '../../../apps/gateway/src/services/integrations/providers/followupboss.provider.js';
import { AcuityProvider } from '../../../apps/gateway/src/services/integrations/providers/acuity.provider.js';
import { SetmoreProvider } from '../../../apps/gateway/src/services/integrations/providers/setmore.provider.js';
import { SquareAppointmentsProvider } from '../../../apps/gateway/src/services/integrations/providers/square-appointments.provider.js';
import { BuildiumProvider } from '../../../apps/gateway/src/services/integrations/providers/buildium.provider.js';
import { ComingSoonProvider } from '../../../apps/gateway/src/services/integrations/providers/coming-soon.provider.js';

function jsonResponse(ok: boolean, status: number, body: unknown) {
    return { ok, status, json: async () => body } as Response;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('ZohoProvider', () => {
    const config = { dataCenter: 'com', clientId: 'cid', clientSecret: 'secret', refreshToken: 'refresh' };

    it('reports success when the token refresh and CurrentUser call both succeed', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(true, 200, { access_token: 'tok' }))
            .mockResolvedValueOnce(jsonResponse(true, 200, {}));
        vi.stubGlobal('fetch', fetchMock);

        const result = await new ZohoProvider().verifyConnection(config);
        expect(result).toEqual({ success: true, message: 'Connected to Zoho CRM successfully' });
    });

    it('returns a friendly message when Zoho rejects the refresh token', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(true, 200, { access_token: 'tok' }))
            .mockResolvedValueOnce(jsonResponse(false, 401, {}));
        vi.stubGlobal('fetch', fetchMock);

        const result = await new ZohoProvider().verifyConnection(config);
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Zoho rejected those credentials/);
    });

    it('returns a friendly message when the token refresh fails', async () => {
        const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(false, 400, { error: 'invalid_client' }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await new ZohoProvider().verifyConnection(config);
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/check your data center and credentials/);
    });

    it('creates a test lead and returns a record URL', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(true, 200, { access_token: 'tok' }))
            .mockResolvedValueOnce(
                jsonResponse(true, 201, { data: [{ status: 'success', details: { id: 'lead123' } }] })
            );
        vi.stubGlobal('fetch', fetchMock);

        const result = await new ZohoProvider().sendTestLead(config);
        expect(result.success).toBe(true);
        expect(result.recordUrl).toContain('lead123');
    });
});

describe('CopperProvider', () => {
    const config = { userEmail: 'owner@example.com', apiKey: 'key123' };

    it('reports success when /account responds ok', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(true, 200, {})));
        const result = await new CopperProvider().verifyConnection(config);
        expect(result).toEqual({ success: true, message: 'Connected to Copper successfully' });
    });

    it('returns a friendly message on 401/403', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(false, 401, {})));
        const result = await new CopperProvider().verifyConnection(config);
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Copper rejected those credentials|System settings/);
    });

    it('surfaces unexpected HTTP errors with the status code', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(false, 500, {})));
        const result = await new CopperProvider().verifyConnection(config);
        expect(result.success).toBe(false);
        expect(result.message).toContain('500');
    });

    it('creates a test lead and returns a record URL', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(true, 200, {}))
            .mockResolvedValueOnce(jsonResponse(true, 200, { id: 456 }));
        vi.stubGlobal('fetch', fetchMock);
        const result = await new CopperProvider().sendTestLead(config);
        expect(result.success).toBe(true);
        expect(result.recordUrl).toBe('https://app.copper.com/companies/leads/456');
    });
});

describe('FollowUpBossProvider', () => {
    const config = { apiKey: 'fub_key' };

    it('reports success when /identity responds ok', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(true, 200, {})));
        const result = await new FollowUpBossProvider().verifyConnection(config);
        expect(result).toEqual({ success: true, message: 'Connected to Follow Up Boss successfully' });
    });

    it('returns a friendly message on 401', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(false, 401, {})));
        const result = await new FollowUpBossProvider().verifyConnection(config);
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Follow Up Boss rejected that API key/);
    });

    it('creates a test lead and returns a record URL', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(true, 200, { personId: 789 })));
        const result = await new FollowUpBossProvider().sendTestLead(config);
        expect(result.success).toBe(true);
        expect(result.recordUrl).toContain('789');
    });
});

describe('AcuityProvider', () => {
    const config = { userId: 'user1', apiKey: 'acuity_key' };

    it('reports success when /me responds ok', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(true, 200, {})));
        const result = await new AcuityProvider().verifyConnection(config);
        expect(result).toEqual({ success: true, message: 'Connected to Acuity Scheduling successfully' });
    });

    it('returns a friendly message on 401/403', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(false, 403, {})));
        const result = await new AcuityProvider().verifyConnection(config);
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Acuity rejected those credentials/);
    });

    it('reports how many appointment types were found', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(true, 200, [{ id: 1 }, { id: 2 }, { id: 3 }])));
        const result = await new AcuityProvider().sendTest(config);
        expect(result.success).toBe(true);
        expect(result.message).toContain('3 appointment types');
    });
});

describe('SetmoreProvider', () => {
    const config = { apiKey: 'setmore_refresh_token' };

    it('reports success when the token refresh and services call both succeed', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(true, 200, { data: { token: { access_token: 'tok' } } }))
            .mockResolvedValueOnce(jsonResponse(true, 200, {}));
        vi.stubGlobal('fetch', fetchMock);

        const result = await new SetmoreProvider().verifyConnection(config);
        expect(result).toEqual({ success: true, message: 'Connected to Setmore successfully' });
    });

    it('returns a friendly message when the refresh token is rejected', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(false, 401, {})));
        const result = await new SetmoreProvider().verifyConnection(config);
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Setmore rejected that key/);
    });

    it('reports how many services were found', async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(jsonResponse(true, 200, { data: { token: { access_token: 'tok' } } }))
            .mockResolvedValueOnce(jsonResponse(true, 200, { data: { services: [{ id: 1 }, { id: 2 }] } }));
        vi.stubGlobal('fetch', fetchMock);

        const result = await new SetmoreProvider().sendTest(config);
        expect(result.success).toBe(true);
        expect(result.message).toContain('2 services');
    });
});

describe('SquareAppointmentsProvider', () => {
    const config = { accessToken: 'square_token', locationId: 'L123' };

    it('reports success when the location responds ok', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(true, 200, {})));
        const result = await new SquareAppointmentsProvider().verifyConnection(config);
        expect(result).toEqual({ success: true, message: 'Connected to Square Appointments successfully' });
    });

    it('returns a friendly message on 401', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(false, 401, {})));
        const result = await new SquareAppointmentsProvider().verifyConnection(config);
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Square rejected that access token/);
    });

    it('returns a friendly message when the location is not found', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(false, 404, {})));
        const result = await new SquareAppointmentsProvider().verifyConnection(config);
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Location ID not found/);
    });

    it('reports the connected location name', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(true, 200, { location: { name: 'Main St' } })));
        const result = await new SquareAppointmentsProvider().sendTest(config);
        expect(result.success).toBe(true);
        expect(result.message).toContain('Main St');
    });
});

describe('BuildiumProvider', () => {
    const config = { clientId: 'client1', clientSecret: 'secret1' };

    it('reports success when /rentals responds ok', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(true, 200, [])));
        const result = await new BuildiumProvider().verifyConnection(config);
        expect(result).toEqual({ success: true, message: 'Connected to Buildium successfully' });
    });

    it('returns a friendly message on 401', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(false, 401, {})));
        const result = await new BuildiumProvider().verifyConnection(config);
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/Buildium rejected those credentials/);
    });

    it('reports how many properties were found', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(jsonResponse(true, 200, [{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }, { id: 5 }])));
        const result = await new BuildiumProvider().sendTest(config);
        expect(result.success).toBe(true);
        expect(result.message).toContain('5 properties');
    });
});

describe('ComingSoonProvider', () => {
    it('verifyConnection always succeeds with a friendly placeholder message', async () => {
        const result = await new ComingSoonProvider().verifyConnection();
        expect(result.success).toBe(true);
        expect(result.message).toMatch(/we'll let you know/i);
    });

    it('sendTest always reports the integration is not yet available', async () => {
        const result = await new ComingSoonProvider().sendTest();
        expect(result.success).toBe(false);
        expect(result.message).toMatch(/coming soon/i);
    });
});
