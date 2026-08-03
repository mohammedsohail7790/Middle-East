import { describe, it, expect } from 'vitest';
import {
    PROVIDER_REGISTRY,
    SYNC_CAPABLE_PROVIDER_KEYS,
    getProviderAdapter,
} from '../../../apps/gateway/src/services/integrations/provider-registry.js';

const GROUP_A_PROVIDER_KEYS = [
    'zoho',
    'copper',
    'followupboss',
    'acuity',
    'setmore',
    'square-appointments',
    'buildium',
] as const;

const CALENDAR_AND_PROPERTY_KEYS = [
    'acuity',
    'setmore',
    'square-appointments',
    'buildium',
] as const;

describe('provider-registry', () => {
    it('registers an adapter for every Group A provider', () => {
        for (const key of GROUP_A_PROVIDER_KEYS) {
            const adapter = getProviderAdapter(key);
            expect(adapter).toBeDefined();
            expect(typeof adapter?.verifyConnection).toBe('function');
            expect(typeof adapter?.sendTest).toBe('function');
        }
    });

    it('returns undefined for unknown provider keys', () => {
        expect(getProviderAdapter('not-a-real-provider')).toBeUndefined();
    });

    it('only marks CRM providers with a sendLead implementation as sync-capable', () => {
        expect(new Set(SYNC_CAPABLE_PROVIDER_KEYS)).toEqual(
            new Set(['zoho', 'copper', 'followupboss', 'clio', 'mycase', 'mindbody', 'vagaro', 'appfolio', 'yardi']),
        );
        for (const key of SYNC_CAPABLE_PROVIDER_KEYS) {
            expect(typeof PROVIDER_REGISTRY[key].sendLead).toBe('function');
        }
    });

    it('calendar and property-management adapters do not implement sendLead', () => {
        for (const key of CALENDAR_AND_PROPERTY_KEYS) {
            expect(PROVIDER_REGISTRY[key].sendLead).toBeUndefined();
        }
    });
});
