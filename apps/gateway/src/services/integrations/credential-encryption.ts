import { randomBytes, createCipheriv, createDecipheriv } from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const KEY_LENGTH = 32;

let cachedKey: Buffer | null = null;

/** Validates and caches INTEGRATION_CREDENTIALS_KEY (32-byte base64). Call at boot to fail fast. */
export function getIntegrationCredentialsKey(): Buffer {
    if (cachedKey) return cachedKey;

    const raw = process.env.INTEGRATION_CREDENTIALS_KEY?.trim();
    if (!raw) {
        throw new Error(
            'Missing required environment variable: INTEGRATION_CREDENTIALS_KEY (32-byte base64 string, e.g. `openssl rand -base64 32`)'
        );
    }

    let key: Buffer;
    try {
        key = Buffer.from(raw, 'base64');
    } catch {
        throw new Error('INTEGRATION_CREDENTIALS_KEY must be a valid base64 string');
    }

    if (key.length !== KEY_LENGTH) {
        throw new Error(
            `INTEGRATION_CREDENTIALS_KEY must decode to ${KEY_LENGTH} bytes (got ${key.length}). Generate one with: openssl rand -base64 32`
        );
    }

    cachedKey = key;
    return cachedKey;
}

/** Encrypts a credentials object to a string: base64(iv).base64(authTag).base64(ciphertext) */
export function encryptCredentials(credentials: Record<string, unknown>): string {
    const key = getIntegrationCredentialsKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);

    const plaintext = Buffer.from(JSON.stringify(credentials), 'utf8');
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    return `${iv.toString('base64')}.${authTag.toString('base64')}.${ciphertext.toString('base64')}`;
}

/** Decrypts a string produced by encryptCredentials back into the original object. */
export function decryptCredentials<T = Record<string, unknown>>(encrypted: string): T {
    const key = getIntegrationCredentialsKey();
    const parts = encrypted.split('.');
    if (parts.length !== 3) {
        throw new Error('Invalid encrypted credentials format');
    }

    const [ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const ciphertext = Buffer.from(dataB64, 'base64');

    const decipher = createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);

    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    return JSON.parse(plaintext.toString('utf8')) as T;
}
