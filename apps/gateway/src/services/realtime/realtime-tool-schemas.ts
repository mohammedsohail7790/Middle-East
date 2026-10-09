import { PLAN_FEATURES } from '../../config/plan-config.js';
import type { TenantVoiceConfig } from '../voice/ai.service.js';
import { isOrderLookupAvailable } from '../order-lookup/order-lookup.service.js';

/**
 * Builds the OpenAI function-calling tool schema list for a tenant.
 * Pure function — no side effects, no async.
 */
export function buildToolsList(tenantConfig: TenantVoiceConfig, tenantPlan = 'essential'): any[] {
  const caps = tenantConfig.capabilities ?? {};
  const bookingOn = caps.bookAppointments !== false;
  const transferOn = caps.transferCalls !== false && !!tenantConfig.transferPhoneNumber;
  const smsOn = caps.sendSMS !== false;
  const knowledgeOn = caps.accessKnowledge !== false;

  const tools: any[] = [
    // ── Lead Tools (always on) ──
    {
      type: 'function',
      name: 'create_lead',
      description:
        'Capture a new lead with customer information. Only include an email address or a service address if the caller offered it or the business has said it needs one; otherwise capture the lead without them.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Customer full name' },
          phone: { type: 'string', description: 'Customer phone number' },
          email: {
            type: 'string',
            description:
              'Customer email for follow-up. Include it only if the caller offered it or the business requires it; email addresses are easy to mishear over the phone, so read it back once to confirm spelling before submitting. Leave blank otherwise.',
          },
          address: {
            type: 'string',
            description:
              'Service address (street, city). Include it only if the caller gave it or the business requires it for this request; if you ask, read it back once to confirm before submitting.',
          },
          interest: { type: 'string', description: 'Service or product of interest' }
        },
        required: ['name', 'phone']
      }
    },
    {
      type: 'function',
      name: 'lookup_customer',
      description: 'Look up an existing customer by phone, email, or name',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Customer phone number' },
          email: { type: 'string', description: 'Customer email' },
          name: { type: 'string', description: 'Customer name' }
        },
        required: []
      }
    },
    {
      type: 'function',
      name: 'update_customer',
      description: 'Update existing customer information',
      parameters: {
        type: 'object',
        properties: {
          customer_id: { type: 'string', description: 'Customer ID to update' },
          updates: { type: 'object', description: 'Key-value pairs of fields to update' }
        },
        required: ['customer_id', 'updates']
      }
    },
  ];

  if (bookingOn) {
    tools.push(
    {
      type: 'function',
      name: 'check_availability',
      description: 'Check available appointment slots for a service or date',
      parameters: {
        type: 'object',
        properties: {
          service: { type: 'string', description: 'Type of service needed' },
          date: { type: 'string', description: 'Preferred date (YYYY-MM-DD)' }
        },
        required: []
      }
    },
    {
      type: 'function',
      name: 'create_appointment',
      description:
        'Book a new appointment for the customer. Include an email address only if the caller offered it or the business has said it needs one; otherwise book without it.',
      parameters: {
        type: 'object',
        properties: {
          customer_name: { type: 'string', description: 'Customer full name' },
          phone: { type: 'string', description: 'Customer phone number' },
          email: {
            type: 'string',
            description:
              'Customer email address for the confirmation email. Include it only if the caller offered it or the business requires it; email addresses are easy to mishear over the phone, so read it back once to confirm spelling before booking. Omit it otherwise.',
          },
          address: {
            type: 'string',
            description:
              'Service address where the visit will take place (street, city). Needed only for on-site appointments where the business requires it; if you ask, read it back once to confirm.',
          },
          issue: { type: 'string', description: 'Description of the issue or service needed' },
          preferred_time: {
            type: 'string',
            description:
              'Future appointment date/time in ISO 8601 (e.g. 2026-05-30T15:00:00.000Z). Required for booking.',
          },
        },
        required: ['customer_name', 'phone', 'preferred_time'],
      }
    },
    {
      type: 'function',
      name: 'reschedule_appointment',
      description: 'Reschedule an existing booked appointment',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'Appointment UUID if known' },
          phone: { type: 'string', description: 'Phone on the booking if id unknown' },
          new_time: {
            type: 'string',
            description: 'New future date/time in ISO 8601 (e.g. 2026-05-30T15:00:00.000Z)',
          },
        },
        required: ['new_time'],
      }
    },
    {
      type: 'function',
      name: 'cancel_appointment',
      description: 'Cancel an existing appointment',
      parameters: {
        type: 'object',
        properties: {
          appointment_id: { type: 'string', description: 'Appointment ID to cancel' },
          reason: { type: 'string', description: 'Reason for cancellation' }
        },
        required: ['appointment_id']
      }
    }
    );
  }

  if (smsOn) {
    tools.push({
      type: 'function',
      name: 'send_sms',
      description: 'Send an SMS text message to a phone number',
      parameters: {
        type: 'object',
        properties: {
          phone: { type: 'string', description: 'Recipient phone number' },
          message: { type: 'string', description: 'Message content' }
        },
        required: ['phone', 'message']
      }
    });
  }

  if (transferOn) {
    tools.push({
      type: 'function',
      name: 'transfer_call',
      description: 'Transfer the call to a human agent or department',
      parameters: {
        type: 'object',
        properties: {
          reason: { type: 'string', description: 'Reason for transfer' },
          department: { type: 'string', description: 'Target department (e.g. sales, support, billing)' }
        },
        required: ['reason']
      }
    });
  }

  if (knowledgeOn) {
    tools.push({
      type: 'function',
      name: 'search_knowledge_base',
      description: 'Search the business knowledge base for information',
      parameters: {
        type: 'object',
        properties: {
          query: { type: 'string', description: 'Search query' },
          category: { type: 'string', description: 'Category to search within (optional)' }
        },
        required: ['query']
      }
    });
  }

  // Read-only order lookup (F9): never offered while ORDER_LOOKUP is BLOCKED_PENDING_KLAROS_READ_API, and never
  // offered to a tenant that has not opted in (Medical Tourism does not).
  if (caps.orderLookup === true && isOrderLookupAvailable()) {
    tools.push({
      type: 'function',
      name: 'lookup_order',
      description:
        'Read the recorded status of ONE order by its order reference. Read-only: it cannot change an order, take a payment, issue a refund or contact a carrier. State only what it returns; anything it does not return is unknown.',
      parameters: {
        type: 'object',
        properties: {
          order_reference: { type: 'string', description: 'The order reference the caller read out (letters, digits, - and _ only). Do not guess one.' },
        },
        required: ['order_reference'],
      },
    });
  }

  // Explicit consent capture: offered ONLY to a tenant that configured a consent wording version (Medical Tourism opt-in).
  // The model supplies the decision and scopes; the wording version, method and timestamp are set by the server, never by the model.
  if (tenantConfig.consentCapture?.wordingVersion) {
    tools.push({
      type: 'function',
      name: 'record_consent',
      description:
        "Record the caller's explicit answer to a specific consent question you have just asked. Call it ONLY after the caller clearly said yes or no (or took back an earlier yes) to that exact question. Never call it for silence, 'maybe', an unclear or off-topic reply, a keypress, or because the caller is simply continuing the call; in those cases ask again or treat it as no and do not call it. Each scope is independent: record only the scopes the caller was actually asked about and answered. Consent to be contacted is NOT consent to store personal data, and neither is consent to collect or store medical information.",
      parameters: {
        type: 'object',
        properties: {
          decision: { type: 'string', enum: ['granted', 'declined', 'withdrawn'], description: 'granted = clear yes; declined = clear no; withdrawn = the caller took back an earlier yes.' },
          scopes: {
            type: 'array',
            minItems: 1,
            items: { type: 'string', enum: ['contact', 'store_personal_data', 'store_medical_information'] },
            description: 'Only the scopes the caller explicitly answered for. contact = may be contacted about the enquiry; store_personal_data = may keep their contact details and enquiry; store_medical_information = may collect and keep medical information.',
          },
        },
        required: ['decision', 'scopes'],
      },
    });
  }

  if (tenantConfig.serviceArea?.enabled) {
    tools.push({
      type: 'function',
      name: 'check_service_area',
      description:
        "Check whether a service address is inside the business's service area. Call this right after confirming the caller's address and BEFORE booking any on-site visit. If the result says out of area, politely explain, do not book a visit, but still capture their info as a lead.",
      parameters: {
        type: 'object',
        properties: {
          address: {
            type: 'string',
            description: 'The full service address the caller gave (street, city).',
          },
        },
        required: ['address'],
      },
    });
  }

  tools.push({
    type: 'function',
    name: 'end_call',
    description:
      'End the call once you have said your goodbye out loud and the caller has nothing further. Call this right after your sign-off — do not call it before you have actually spoken the goodbye.',
    parameters: {
      type: 'object',
      properties: {
        reason: { type: 'string', description: 'Brief reason, e.g. "booking confirmed", "caller said bye"' },
      },
      required: [],
    },
  });

  if (PLAN_FEATURES[tenantPlan]?.multiLanguageSwitching) {
    tools.push({
      type: 'function',
      name: 'switch_language',
      description: 'Switch the conversation language when the caller clearly changes language',
      parameters: {
        type: 'object',
        properties: {
          language: {
            type: 'string',
            description: 'ISO language code: en, es, fr, ru, zh, hi',
          },
        },
        required: ['language'],
      },
    });
  }

  return tools;
}
