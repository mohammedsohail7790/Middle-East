import type { ExecutorContext, ExecutorResult } from '../types.js';
import { requireApproval, text } from './util.js';

/** Whether the business has a CRM connected: through the connection hub (a CRM-category integration that is connected) or the older HubSpot/Salesforce switches. */
export async function hasConnectedCrm(tenantId: string): Promise<boolean> {
  try {
    const { connectionStore } = await import('../../integrations/connection-store.service.js');
    const { getIntegrationCatalogEntry } = await import('../../integrations/integration-catalog.js');
    const rows = await connectionStore.listConnections(tenantId);
    if (rows.some((r) => r.status === 'connected' && getIntegrationCatalogEntry(r.integration_id)?.category === 'crm')) return true;
  } catch {
    /* fall through to the older switches */
  }
  try {
    const { voiceDb } = await import('../../voice/tenant-scope.js');
    const r = await voiceDb.query(
      `SELECT (COALESCE(hubspot_enabled, false) OR COALESCE(salesforce_enabled, false)) AS connected FROM public.voice_tenants WHERE id = $1 LIMIT 1`,
      [tenantId],
    );
    return r.rows[0]?.connected === true;
  } catch {
    return false;
  }
}

/** crm.push_lead: sends the lead to the business's connected CRM through the same dispatcher the post-call code uses. */
export async function crmPushLead(ctx: ExecutorContext): Promise<ExecutorResult> {
  requireApproval(ctx);
  const p = ctx.params;
  const name = text(p.name, 200);
  const phone = text(p.phone, 40);
  const email = text(p.email, 200);
  if (!name && !phone && !email) return { summary: 'There was no lead information to send', skipped: true };
  if (!(await hasConnectedCrm(ctx.tenantId))) return { summary: 'No CRM is connected', skipped: true };

  const bits = [text(p.source) && `Source: ${text(p.source, 100)}`, text(p.score) && `Score: ${text(p.score, 10)}`, text(p.tag) && `Tag: ${text(p.tag, 60)}`].filter(Boolean);
  const { integrationService } = await import('../../integrations/integration.service.js');
  await integrationService.sendRealtime(ctx.tenantId, {
    callId: `automation-${ctx.runId}`,
    type: 'lead',
    lead: { name: name || undefined, phone: phone || undefined, email: email || undefined, notes: bits.length ? bits.join('. ') : undefined },
  });
  return { summary: 'Sent the lead to your connected CRM', output: { sent: true } };
}
