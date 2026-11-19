/**
 * Rules for the sign-up test call, kept apart from the Twilio code so they can be tested.
 * The call goes to a number the client types, so it is limited: a valid international number only, one call a minute, three an hour.
 */

export const TEST_CALL_COOLDOWN_MS = 60_000;
export const TEST_CALL_HOURLY_LIMIT = 3;
const HOUR_MS = 60 * 60 * 1000;

/** International format only: "+" then 8 to 15 digits, not starting with 0. Returns null when it is not a number we will ring. */
export function normalizeTestCallNumber(input: unknown): string | null {
  const raw = String(input ?? '').trim();
  if (!raw) return null;
  let cleaned = raw.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('00')) cleaned = `+${cleaned.slice(2)}`;
  if (!cleaned.startsWith('+')) return null;
  const digits = cleaned.slice(1).replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15 || digits.startsWith('0')) return null;
  return `+${digits}`;
}

/** Times (ms) of this tenant's earlier test calls in, then says whether another is allowed now and how long to wait if not. */
export function checkTestCallAllowed(
  history: readonly number[],
  now: number,
): { allowed: boolean; message?: string } {
  const recent = history.filter((t) => now - t < HOUR_MS);
  const last = recent.length ? Math.max(...recent) : 0;
  if (last && now - last < TEST_CALL_COOLDOWN_MS) {
    const wait = Math.ceil((TEST_CALL_COOLDOWN_MS - (now - last)) / 1000);
    return { allowed: false, message: `Please wait ${wait} seconds between test calls` };
  }
  if (recent.length >= TEST_CALL_HOURLY_LIMIT) {
    const oldest = Math.min(...recent);
    const wait = Math.ceil((HOUR_MS - (now - oldest)) / 60_000);
    return { allowed: false, message: `You have used ${TEST_CALL_HOURLY_LIMIT} test calls this hour. Try again in about ${wait} minutes.` };
  }
  return { allowed: true };
}
