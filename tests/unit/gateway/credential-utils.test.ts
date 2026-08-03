import { describe, it, expect } from 'vitest';
import {
    trimCredentialFields,
    connectVerifiedMessage,
    LEGACY_TEST_ON_CONFIGURE,
} from '../../../apps/gateway/src/services/integrations/credential-utils.js';

describe('credential-utils', () => {
    it('trims string credential fields', () => {
        expect(trimCredentialFields({ apiKey: '  abc  ', userEmail: ' a@b.com ' })).toEqual({
            apiKey: 'abc',
            userEmail: 'a@b.com',
        });
    });

    it('detects gateway messages that already verified on configure', () => {
        expect(connectVerifiedMessage('Lead successfully created in Copper')).toBe(true);
        expect(connectVerifiedMessage('Connected to Acuity successfully')).toBe(true);
        expect(connectVerifiedMessage('Invalid API key')).toBe(false);
    });

    it('lists legacy providers that test on configure', () => {
        expect(LEGACY_TEST_ON_CONFIGURE.has('pipedrive')).toBe(true);
        expect(LEGACY_TEST_ON_CONFIGURE.has('copper')).toBe(false);
    });
});
