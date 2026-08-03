import { logger } from '../logger.js';
import { integrationService, type IntegrationPayload } from './integration.service.js';

/**
 * Thin facade for lead/appointment delivery to external systems.
 * Delegates to IntegrationService (BullMQ + real CRM providers).
 */

export type { IntegrationPayload };
export type IntegrationProvider =
  | 'zapier'
  | 'hubspot'
  | 'servicetitan'
  | 'jobber'
  | 'housecallpro';

export interface LeadData {
  name?: string;
  phone?: string;
  service?: string;
  preferred_time?: string;
  notes?: string;
}

export interface AppointmentData {
  name?: string;
  phone?: string;
  service?: string;
  time?: string;
}

export interface IntegrationLayerPayload {
  callId: string;
  tenantId: string;
  type: 'lead' | 'appointment' | 'reschedule';
  lead?: LeadData;
  appointment?: AppointmentData;
  timestamp?: string;
}

/**
 * Dispatch lead or appointment data to configured integrations for a tenant.
 */
export async function sendLead(
  data: IntegrationLayerPayload,
  _provider: IntegrationProvider = 'zapier'
): Promise<void> {
  const { tenantId, callId, type, lead, appointment } = data;

  logger.info('Integration layer dispatch', { tenantId, callId, type });

  const payload: IntegrationPayload = {
    callId,
    type,
    lead: lead || {},
    appointment,
  };

  await integrationService.sendRealtime(tenantId, payload);
}
