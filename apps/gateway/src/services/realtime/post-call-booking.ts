import type { VoiceLeadPayload } from '../voice/ai.service.js';

export interface PostCallLeadFields {
  name?: string;
  phone?: string;
  service?: string;
  preferred_time?: string;
}

/** Assistant verbally confirmed a booking without necessarily calling create_appointment. */
export function detectVerbalBookingConfirmation(transcript: string): boolean {
  const text = transcript.toLowerCase();
  const confirmed =
    /\b(you'?re booked|you are booked|appointment is confirmed|you'?re all set|we'?ll see you|see you then)\b/.test(
      text
    );
  const scheduling =
    /\b(tomorrow|today|monday|tuesday|wednesday|thursday|friday|saturday|sunday|\d{1,2}\s*(am|pm)|morning|afternoon|appointment|scheduled)\b/.test(
      text
    );
  return confirmed && scheduling;
}

function digitCount(value?: string): number {
  return (value || '').replace(/\D/g, '').length;
}

/** Prefer transcript-extracted caller details over Twilio From when the model collected a real number. */
export function mergePostCallLeadFields(
  memory: PostCallLeadFields,
  extracted: VoiceLeadPayload,
  callerPhone?: string
): PostCallLeadFields {
  const extractedPhone = extracted.phone?.trim();
  const memoryPhone = memory.phone?.trim();
  const fromPhone = callerPhone?.trim();

  let phone = memoryPhone || fromPhone;
  if (extractedPhone && digitCount(extractedPhone) >= 10) {
    phone = extractedPhone;
  } else if (!phone && extractedPhone) {
    phone = extractedPhone;
  }

  const name =
    extracted.name?.trim() ||
    (memory.name && memory.name !== 'Caller' ? memory.name : undefined) ||
    undefined;

  const service =
    extracted.service?.trim() ||
    (memory.service && memory.service !== 'Appointment' ? memory.service : undefined) ||
    memory.service;

  const preferred_time = extracted.preferred_time?.trim() || memory.preferred_time?.trim();

  return { name, phone, service, preferred_time };
}
