import { describe, expect, it, beforeEach } from 'vitest';
import { getBusinessHoursColumnSet, resetBusinessHoursColumnCache } from '../../../apps/gateway/src/services/business-hours/business-hours-schema';

function poolWith(columns: string[]) {
  return { query: async () => ({ rows: columns.map((column_name) => ({ column_name })) }) } as never;
}

describe('business hours column detection', () => {
  beforeEach(() => resetBusinessHoursColumnCache());

  it('also reports the old required columns when both layouts exist (migrations 004 and 009)', async () => {
    const set = await getBusinessHoursColumnSet(poolWith(['id', 'tenant_id', 'day_of_week', 'open_time', 'close_time', 'is_closed', 'start_time', 'end_time', 'timezone']));
    expect(set.startCol).toBe('start_time');
    expect(set.endCol).toBe('end_time');
    expect(set.legacyStartCol).toBe('open_time');
    expect(set.legacyEndCol).toBe('close_time');
  });

  it('reports no extra columns on the modern layout', async () => {
    const set = await getBusinessHoursColumnSet(poolWith(['id', 'tenant_id', 'day_of_week', 'start_time', 'end_time', 'is_open', 'timezone']));
    expect(set.legacyStartCol).toBeUndefined();
    expect(set.legacyEndCol).toBeUndefined();
    expect(set.openCol).toBe('is_open');
  });

  it('reports no extra columns on the old layout', async () => {
    const set = await getBusinessHoursColumnSet(poolWith(['id', 'tenant_id', 'day_of_week', 'open_time', 'close_time', 'is_closed']));
    expect(set.startCol).toBe('open_time');
    expect(set.legacyStartCol).toBeUndefined();
  });
});
