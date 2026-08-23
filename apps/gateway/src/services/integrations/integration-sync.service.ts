import { logger } from '../logger.js';
import { voiceDb } from '../voice/tenant-scope.js';
import { calendarService } from '../calendar/calendar.service.js';
import { outlookCalendarService } from '../calendar/outlook.calendar.service.js';
import { resolveHubSpotAccessToken } from './hubspot-token.service.js';
import { recordIntegrationSync } from './integration-sync-state.js';
import { publishIntegrationsUpdated } from './integrations-notify.js';

function normalizePhone(raw: string | undefined | null): string | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.length === 10 ? `+1${digits}` : `+${digits}`;
}

async function upsertInboundLead(
  tenantId: string,
  source: string,
  contact: { name?: string; phone?: string; email?: string; externalId?: string }
): Promise<boolean> {
  const phone = normalizePhone(contact.phone);
  if (!phone) return false;

  const { leadsService } = await import('../leads/leads.service.js');
  const existing = await voiceDb.query(
    `SELECT id, custom_fields FROM public.leads WHERE tenant_id = $1 AND phone = $2 LIMIT 1`,
    [tenantId, phone]
  );

  const externalKey = contact.externalId ? `${source}:${contact.externalId}` : null;
  if (existing.rows.length > 0 && externalKey) {
    const fields = (existing.rows[0].custom_fields as Record<string, unknown>) || {};
    if (fields.crm_external_id === externalKey) {
      return false;
    }
  }

  await leadsService.createLead(tenantId, phone, source, {
    name: contact.name,
    metadata: {
      email: contact.email,
      crm_external_id: externalKey,
      synced_at: new Date().toISOString(),
    },
  });
  return true;
}

async function syncHubSpotInbound(tenantId: string): Promise<number> {
  const auth = await resolveHubSpotAccessToken(tenantId);
  if (!auth) return 0;

  const since = new Date(Date.now() - 20 * 60 * 1000).toISOString();
  const response = await fetch('https://api.hubapi.com/crm/v3/objects/contacts/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${auth.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      filterGroups: [
        {
          filters: [
            {
              propertyName: 'lastmodifieddate',
              operator: 'GTE',
              value: since,
            },
          ],
        },
      ],
      properties: ['firstname', 'lastname', 'phone', 'email'],
      limit: 100,
    }),
  });

  if (!response.ok) {
    throw new Error(`HubSpot sync failed (${response.status})`);
  }

  const body = (await response.json()) as {
    results?: Array<{ id: string; properties: Record<string, string> }>;
  };

  let imported = 0;
  for (const item of body.results || []) {
    const p = item.properties || {};
    const name = [p.firstname, p.lastname].filter(Boolean).join(' ').trim() || undefined;
    const added = await upsertInboundLead(tenantId, 'hubspot_inbound', {
      name,
      phone: p.phone,
      email: p.email,
      externalId: item.id,
    });
    if (added) imported += 1;
  }
  return imported;
}

export class IntegrationSyncService {
  async syncTenant(tenantId: string, providers?: string[]): Promise<Record<string, number>> {
    const want = providers?.length ? new Set(providers) : null;
    const counts: Record<string, number> = {};

    const run = async (provider: string, fn: () => Promise<number>) => {
      if (want && !want.has(provider)) return;
      try {
        const n = await fn();
        counts[provider] = n;
        await recordIntegrationSync(tenantId, provider, n);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        logger.warn('Integration sync provider failed', { tenantId, provider, error: msg });
        await recordIntegrationSync(tenantId, provider, 0, msg);
        counts[provider] = 0;
      }
    };

    await run('google-calendar', () => calendarService.syncExternalEventsCache(tenantId));
    await run('outlook', () => outlookCalendarService.syncExternalEventsCache(tenantId));
    await run('hubspot', () => syncHubSpotInbound(tenantId));

    const { publishDashboardPushType } = await import('../dashboard/dashboard-events.js');
    publishDashboardPushType(tenantId, 'calendar.updated', [], { source: 'integration_sync' });
    publishDashboardPushType(tenantId, 'lead.updated', [], { source: 'integration_sync' });
    publishIntegrationsUpdated(tenantId, 'sync');

    return counts;
  }

  async syncAllTenants(): Promise<void> {
    const result = await voiceDb.query(
      `SELECT DISTINCT tenant_id::text AS tenant_id FROM (
         SELECT tenant_id FROM public.calendar_connections
         WHERE COALESCE(status, 'active') = 'active' AND access_token IS NOT NULL
         UNION
         SELECT id AS tenant_id FROM public.voice_tenants
         WHERE hubspot_enabled = true
       ) t`
    );

    for (const row of result.rows) {
      const tenantId = row.tenant_id as string;
      try {
        await this.syncTenant(tenantId);
      } catch (error) {
        logger.error('Integration sync tenant failed', { tenantId, error: String(error) });
      }
    }
  }
}

export const integrationSyncService = new IntegrationSyncService();

export function scheduleIntegrationSyncForProvider(
  tenantId: string,
  provider: string
): void {
  const map: Record<string, string> = {
    'google-calendar': 'google-calendar',
    google: 'google-calendar',
    outlook: 'outlook',
    hubspot: 'hubspot',
  };
  const key = map[provider] || provider;
  void integrationSyncService.syncTenant(tenantId, [key]).catch((err) => {
    logger.warn('Post-connect integration sync failed', { tenantId, provider, error: String(err) });
  });
}
