import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const src = readFileSync(
  join(__dirname, '../../../apps/gateway/src/services/calendar/calendar.service.ts'),
  'utf8'
);
const scopes = src.match(/const scopes = \[([\s\S]*?)\];/)![1];

describe('Google Calendar permissions', () => {
  it('asks only for events, not the full calendar scope', () => {
    expect(scopes).toContain('auth/calendar.events');
    expect(scopes).not.toMatch(/auth\/calendar'/);
  });
});
