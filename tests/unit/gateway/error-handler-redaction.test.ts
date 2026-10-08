/**
 * The global error handler used to log the whole request body and query of every failed request (names, phone numbers,
 * emails, notes — and, for the pilot verticals, medical or payment details). It now logs only the structure.
 */
import { describe, it, expect, vi } from 'vitest';

const logged: unknown[][] = [];
vi.mock('../../../apps/gateway/src/services/logger.js', () => ({
  logger: {
    info: (...a: unknown[]) => logged.push(a), warn: (...a: unknown[]) => logged.push(a),
    error: (...a: unknown[]) => logged.push(a), debug: (...a: unknown[]) => logged.push(a),
  },
  getRequestContext: () => ({ requestId: 'req-1' }),
}));

import { errorHandler } from '../../../apps/gateway/src/middleware/error-handler.js';

const SENSITIVE = ['Jane Q. Patient', '+971501234567', 'jane.patient@example.com', '12 Palm Street', 'chest pain and diabetes', '4111 1111 1111 1111', 'sk_live_abcdef1234567890ABCDEF'];

describe('error handler', () => {
  it('logs the structure of a failed request, never the caller-supplied values (body and query)', () => {
    logged.length = 0;
    const req = {
      requestId: 'req-1', path: '/api/v1/leads', method: 'POST',
      body: { name: SENSITIVE[0], phoneNumber: SENSITIVE[1], email: SENSITIVE[2], address: SENSITIVE[3], notes: SENSITIVE[4], card: SENSITIVE[5], api_key: SENSITIVE[6], source: 'klaros' },
      query: { email: SENSITIVE[2], search: SENSITIVE[0] },
    };
    const res = { status: vi.fn().mockReturnThis(), json: vi.fn().mockReturnThis(), headersSent: false } as never;
    errorHandler(new Error('boom'), req as never, res, vi.fn());

    const blob = JSON.stringify(logged);
    for (const v of SENSITIVE) expect(blob, `leaked: ${v}`).not.toContain(v);
    expect(blob).toContain('/api/v1/leads'); // operational context is kept
    expect(blob).toContain('[REDACTED_PHONE]');
    expect(blob).toContain('phoneNumber'); // the field names are kept, so the failure is still diagnosable
    expect(blob).toContain('req-1');
  });

  it('still answers the client normally', () => {
    const status = vi.fn().mockReturnThis();
    const json = vi.fn().mockReturnThis();
    errorHandler(new Error('boom'), { path: '/x', method: 'GET', body: undefined, query: {} } as never, { status, json, headersSent: false } as never, vi.fn());
    expect(status).toHaveBeenCalled();
    expect(json).toHaveBeenCalled();
  });
});
