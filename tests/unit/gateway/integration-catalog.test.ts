import { describe, it, expect } from 'vitest';
import {
    INTEGRATION_CATALOG,
    GENERIC_CONNECTION_PROVIDERS,
    OAUTH_FALLTHROUGH_PROVIDERS,
    COMING_SOON_PROVIDERS,
    getIntegrationCatalogEntry,
} from '../../../apps/gateway/src/services/integrations/integration-catalog.js';
import { getProviderAdapter } from '../../../apps/gateway/src/services/integrations/provider-registry.js';

describe('integration-catalog', () => {
    it('keeps the 6 legacy API-key providers off the generic connection-store path', () => {
        for (const id of ['servicetitan', 'jobber', 'housecallpro', 'hubspot', 'freshsales', 'insightly']) {
            expect(GENERIC_CONNECTION_PROVIDERS.has(id)).toBe(false);
        }
    });

    it('keeps zapier off the generic connection-store path', () => {
        expect(GENERIC_CONNECTION_PROVIDERS.has('zapier')).toBe(false);
    });

    it('excludes all oauth providers from the generic connection-store path', () => {
        for (const id of OAUTH_FALLTHROUGH_PROVIDERS) {
            expect(GENERIC_CONNECTION_PROVIDERS.has(id)).toBe(false);
        }
    });

    it('routes every Group A and Group B api_credentials provider through the generic path', () => {
        const groupA = ['zoho', 'copper', 'followupboss', 'setmore', 'buildium'];
        const groupB = ['mycase', 'vagaro', 'mindbody', 'appfolio', 'yardi'];
        for (const id of [...groupA, ...groupB]) {
            expect(GENERIC_CONNECTION_PROVIDERS.has(id)).toBe(true);
        }
    });

    it('every generic-path provider has a live adapter and is marked ready', () => {
        for (const id of GENERIC_CONNECTION_PROVIDERS) {
            const entry = getIntegrationCatalogEntry(id);
            expect(entry).toBeDefined();
            if (!entry) continue;

            expect(entry.ready).toBe(true);
            expect(entry.providerKey).toBeDefined();
            expect(entry.providerKey).not.toBe('coming-soon');

            const adapter = getProviderAdapter(entry.providerKey || '');
            expect(adapter).toBeDefined();
        }
    });

    it('every catalog entry has a unique id', () => {
        const ids = INTEGRATION_CATALOG.map((e) => e.id);
        expect(new Set(ids).size).toBe(ids.length);
    });

    it('every api_credentials entry that is ready declares required fields, unless it is Zapier-only', () => {
        for (const entry of INTEGRATION_CATALOG) {
            if (entry.authType === 'api_credentials' && entry.ready && !entry.zapierOnly) {
                expect(entry.requiredFields.length).toBeGreaterThan(0);
            }
        }
    });

    it('every zapierOnly entry declares zero required fields (no direct credential path)', () => {
        for (const entry of INTEGRATION_CATALOG) {
            if (entry.zapierOnly) {
                expect(entry.requiredFields.length).toBe(0);
            }
        }
    });

    it('has no coming-soon providers', () => {
        expect(COMING_SOON_PROVIDERS.size).toBe(0);
    });
});
