import { describe, it, expect, afterEach, vi } from 'vitest';
import { randomBytes } from 'crypto';

const MODULE_PATH = '../../../apps/gateway/src/services/integrations/credential-encryption.js';
const ORIGINAL_KEY = process.env.INTEGRATION_CREDENTIALS_KEY;

describe('credential-encryption', () => {
    afterEach(() => {
        if (ORIGINAL_KEY === undefined) {
            delete process.env.INTEGRATION_CREDENTIALS_KEY;
        } else {
            process.env.INTEGRATION_CREDENTIALS_KEY = ORIGINAL_KEY;
        }
        vi.resetModules();
    });

    it('round-trips a credentials object', async () => {
        process.env.INTEGRATION_CREDENTIALS_KEY = randomBytes(32).toString('base64');
        const { encryptCredentials, decryptCredentials } = await import(
            '../../../apps/gateway/src/services/integrations/credential-encryption.js'
        );

        const credentials = { apiKey: 'sk_live_12345', accountId: 'acct_abc', nested: { ok: true } };
        const encrypted = encryptCredentials(credentials);

        expect(encrypted.split('.')).toHaveLength(3);
        expect(decryptCredentials(encrypted)).toEqual(credentials);
    });

    it('throws when ciphertext is tampered with', async () => {
        process.env.INTEGRATION_CREDENTIALS_KEY = randomBytes(32).toString('base64');
        const { encryptCredentials, decryptCredentials } = await import(
            '../../../apps/gateway/src/services/integrations/credential-encryption.js'
        );

        const encrypted = encryptCredentials({ apiKey: 'sk_live_12345' });
        const [iv, tag, data] = encrypted.split('.');
        const tamperedData = Buffer.from(data, 'base64');
        tamperedData[0] ^= 0xff;
        const tampered = `${iv}.${tag}.${tamperedData.toString('base64')}`;

        expect(() => decryptCredentials(tampered)).toThrow();
    });

    it('throws when decrypting with the wrong key', async () => {
        process.env.INTEGRATION_CREDENTIALS_KEY = randomBytes(32).toString('base64');
        const encryption = await import(MODULE_PATH);
        const encrypted = encryption.encryptCredentials({ apiKey: 'sk_live_12345' });

        process.env.INTEGRATION_CREDENTIALS_KEY = randomBytes(32).toString('base64');
        vi.resetModules();
        const reimported = await import(MODULE_PATH);

        expect(() => reimported.decryptCredentials(encrypted)).toThrow();
    });

    it('throws a clear error when the key is missing', async () => {
        delete process.env.INTEGRATION_CREDENTIALS_KEY;
        vi.resetModules();
        const encryption = await import(MODULE_PATH);

        expect(() => encryption.encryptCredentials({ apiKey: 'x' })).toThrow(/INTEGRATION_CREDENTIALS_KEY/);
    });

    it('throws when the key is not 32 bytes', async () => {
        process.env.INTEGRATION_CREDENTIALS_KEY = randomBytes(16).toString('base64');
        vi.resetModules();
        const encryption = await import(MODULE_PATH);

        expect(() => encryption.encryptCredentials({ apiKey: 'x' })).toThrow(/32 bytes/);
    });
});
