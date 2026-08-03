import { describe, expect, it } from 'vitest';
import {
  detectVerbalBookingConfirmation,
  mergePostCallLeadFields,
} from '../../../apps/gateway/src/services/realtime/post-call-booking.js';

describe('post-call-booking', () => {
  it('detects verbal booking confirmation', () => {
    const transcript =
      "assistant: I've got an opening tomorrow at 8 AM. Does that work for you?\nassistant: Alright, you're booked for tomorrow at 8 AM. We'll see you then.";
    expect(detectVerbalBookingConfirmation(transcript)).toBe(true);
  });

  it('ignores generic assistant replies without booking', () => {
    expect(detectVerbalBookingConfirmation('assistant: How can I help you today?')).toBe(false);
  });

  it('prefers extracted customer phone over Twilio From', () => {
    const merged = mergePostCallLeadFields(
      { phone: '+546554266661', name: 'Caller', service: 'Appointment' },
      { name: 'Mohammed Sohail', phone: '8618957790', service: 'AC not cooling' },
      '+546554266661'
    );
    expect(merged.name).toBe('Mohammed Sohail');
    expect(merged.phone).toBe('8618957790');
    expect(merged.service).toBe('AC not cooling');
  });
});
