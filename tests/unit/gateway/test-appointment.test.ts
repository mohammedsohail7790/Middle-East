/**
 * The owner-only "Add test appointment" tool, used to show Google (and anyone checking the integration) how a booking
 * reaches the connected calendar. It books through the same path the AI receptionist uses, on a free slot at 2 PM local time.
 */
import { describe, it, expect, vi } from 'vitest';
import {
  testSlotCandidates,
  createTestAppointment,
  TEST_APPOINTMENT_NAME,
  TEST_APPOINTMENT_SERVICE,
} from '../../../apps/gateway/src/services/appointments/test-appointment.js';

describe('test appointment slots', () => {
  it('start two days out at 2 PM in the workspace time zone (Dubai)', () => {
    const slots = testSlotCandidates(new Date('2026-11-27T12:00:00Z'), 'Asia/Dubai');
    expect(slots[0]).toBe('2026-11-29T10:00:00.000Z');
    expect(slots[1]).toBe('2026-11-30T10:00:00.000Z');
  });

  it('follow the time zone (New York, winter)', () => {
    expect(testSlotCandidates(new Date('2026-11-27T12:00:00Z'), 'America/New_York')[0]).toBe('2026-11-29T19:00:00.000Z');
  });

  it('follow daylight saving time (New York, the day clocks go forward)', () => {
    // 14 March 2027 is the first day of summer time: 2 PM is UTC-4 there, not UTC-5.
    expect(testSlotCandidates(new Date('2027-03-12T12:00:00Z'), 'America/New_York')[0]).toBe('2027-03-14T18:00:00.000Z');
  });

  it('give eight days of choices, in order', () => {
    const slots = testSlotCandidates(new Date('2026-11-27T12:00:00Z'), 'Asia/Dubai');
    expect(slots).toHaveLength(8);
    expect([...slots].sort()).toEqual(slots);
  });

  it('fall back to UTC for an unknown time zone instead of failing', () => {
    expect(testSlotCandidates(new Date('2026-11-27T12:00:00Z'), 'Not/AZone')[0]).toBe('2026-11-29T14:00:00.000Z');
  });
});

describe('creating the test appointment', () => {
  const now = new Date('2026-11-27T12:00:00Z');

  it('books a clearly labelled appointment through the normal booking path, on the first free slot', async () => {
    const create = vi
      .fn()
      .mockResolvedValueOnce({ success: false, message: 'That slot is unavailable.' })
      .mockResolvedValueOnce({ success: false, message: 'That slot is unavailable.' })
      .mockResolvedValueOnce({ success: true, message: 'Booked', appointmentId: 'a1', scheduledTime: '2026-12-01T10:00:00.000Z' });
    const out = await createTestAppointment('t1', { timeZone: 'Asia/Dubai', create, hasGoogle: async () => true, now });
    expect(out).toEqual({ success: true, id: 'a1', scheduledTime: '2026-12-01T10:00:00.000Z', googleConnected: true });
    expect(create).toHaveBeenCalledTimes(3);
    expect(create.mock.calls[0][0]).toMatchObject({ tenantId: 't1', name: TEST_APPOINTMENT_NAME, service: TEST_APPOINTMENT_SERVICE, time: '2026-11-29T10:00:00.000Z' });
    expect(TEST_APPOINTMENT_NAME).toMatch(/test/i);
  });

  it('says so when Google is not connected', async () => {
    const create = vi.fn().mockResolvedValue({ success: true, message: 'Booked', appointmentId: 'a2', scheduledTime: '2026-11-29T10:00:00.000Z' });
    const out = await createTestAppointment('t1', { timeZone: 'Asia/Dubai', create, hasGoogle: async () => false, now });
    expect(out).toMatchObject({ success: true, googleConnected: false });
  });

  it('gives up with a clear message when no slot is free, after trying each day once', async () => {
    const create = vi.fn().mockResolvedValue({ success: false, message: 'That slot is unavailable.' });
    const out = await createTestAppointment('t1', { timeZone: 'Asia/Dubai', create, hasGoogle: async () => true, now });
    expect(out.success).toBe(false);
    expect((out as { message: string }).message).toMatch(/no free/i);
    expect(create).toHaveBeenCalledTimes(8);
  });

  it('a failure of the booking itself is reported, not thrown', async () => {
    const create = vi.fn().mockRejectedValue(new Error('db down'));
    const out = await createTestAppointment('t1', { timeZone: 'Asia/Dubai', create, hasGoogle: async () => true, now });
    expect(out.success).toBe(false);
  });
});
