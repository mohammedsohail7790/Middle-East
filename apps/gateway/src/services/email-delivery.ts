/**
 * Resend's SDK (v2 and later) does not throw when Resend refuses an email (unverified sender domain, bad recipient, invalid key, quota). `emails.send()` resolves with
 * `{ data, error }` instead, so code that only has a try/catch reports success for an email that was never sent. Call this on every result so a refusal is thrown and the
 * existing catch blocks log it and tell the visitor, instead of showing "Thank you" and sending nothing.
 */
export function throwIfRejected(result: unknown): void {
  const error = (result as { error?: { name?: string; message?: string; statusCode?: number | null } | null } | null | undefined)?.error;
  if (!error) return;
  throw new Error(`Resend refused the email: ${error.name ?? 'error'}${error.statusCode ? ` (${error.statusCode})` : ''}: ${error.message ?? 'no message'}`);
}
