import { encryptCredentials, decryptCredentials } from '../integrations/credential-encryption.js';

/**
 * Google Calendar tokens are stored encrypted (AES-256-GCM, the same INTEGRATION_CREDENTIALS_KEY the other integrations use).
 * An encrypted value starts with this marker. A value without it is an older plain-text token and is still read as is,
 * so nothing breaks while old rows are being encrypted. Do not remove the plain-text fallback until the backfill has run.
 */
export const GOOGLE_TOKEN_PREFIX = 'enc:v1:';

export function isEncryptedGoogleToken(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith(GOOGLE_TOKEN_PREFIX);
}

/** Encrypts a token for storage. Empty values become null. Already-encrypted values are returned unchanged (never encrypt twice). */
export function encryptGoogleToken(token: string | null | undefined): string | null {
  const value = (token ?? '').trim();
  if (!value) return null;
  if (isEncryptedGoogleToken(value)) return value;
  return `${GOOGLE_TOKEN_PREFIX}${encryptCredentials({ t: value })}`;
}

/**
 * Returns the usable token. Plain-text (old) values pass through.
 * Throws when an encrypted value cannot be decrypted (wrong or changed key, damaged value).
 */
export function decryptGoogleToken(stored: string | null | undefined): string {
  const value = (stored ?? '').trim();
  if (!value) return '';
  if (!isEncryptedGoogleToken(value)) return value;
  const { t } = decryptCredentials<{ t: string }>(value.slice(GOOGLE_TOKEN_PREFIX.length));
  return typeof t === 'string' ? t : '';
}

/**
 * Like decryptGoogleToken but never throws: an unreadable token gives '' (so the caller treats it as "reconnect Google")
 * and a warning that never includes the value.
 */
export function decryptGoogleTokenOrEmpty(stored: string | null | undefined): string {
  try {
    return decryptGoogleToken(stored);
  } catch (error) {
    console.warn('[Calendar] A stored Google token could not be decrypted; the calendar needs to be reconnected.', error instanceof Error ? error.message : error);
    return '';
  }
}
