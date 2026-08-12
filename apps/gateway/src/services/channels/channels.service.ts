/**
 * Channels Service
 * Tenant-scoped channel connection status backed by `channel_connections`.
 * Structural home for later WhatsApp/Web Chat/Instagram/Facebook wiring.
 */

import { voiceDb } from '../voice/tenant-scope.js';

export const CHANNEL_TYPES = ['whatsapp', 'web_chat', 'instagram', 'facebook'] as const;
export const CHANNEL_STATUSES = ['not_connected', 'connected', 'error'] as const;

export type ChannelType = (typeof CHANNEL_TYPES)[number];
export type ChannelStatus = (typeof CHANNEL_STATUSES)[number];

export interface ChannelConnection {
  id: string;
  tenantId: string;
  channel: ChannelType;
  status: ChannelStatus;
  config: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

const COLUMNS = 'id, tenant_id, channel, status, config, created_at, updated_at';

export class ChannelsService {
  async listConnections(tenantId: string): Promise<ChannelConnection[]> {
    const result = await voiceDb.query(
      `SELECT ${COLUMNS} FROM public.channel_connections
       WHERE tenant_id = $1 ORDER BY channel ASC`,
      [tenantId]
    );
    return result.rows.map((row: any) => this.map(row));
  }

  async getConnection(tenantId: string, channel: ChannelType): Promise<ChannelConnection | null> {
    const result = await voiceDb.query(
      `SELECT ${COLUMNS} FROM public.channel_connections
       WHERE tenant_id = $1 AND channel = $2`,
      [tenantId, channel]
    );
    return result.rows[0] ? this.map(result.rows[0]) : null;
  }

  async upsertConnection(
    tenantId: string,
    channel: ChannelType,
    fields: { status?: ChannelStatus; config?: Record<string, unknown> }
  ): Promise<ChannelConnection> {
    const status = fields.status ?? 'not_connected';
    const config = fields.config ?? {};
    const result = await voiceDb.query(
      `INSERT INTO public.channel_connections (tenant_id, channel, status, config)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (tenant_id, channel)
       DO UPDATE SET status = EXCLUDED.status, config = EXCLUDED.config, updated_at = NOW()
       RETURNING ${COLUMNS}`,
      [tenantId, channel, status, config]
    );
    return this.map(result.rows[0]);
  }

  async deleteConnection(tenantId: string, channel: ChannelType): Promise<boolean> {
    const result = await voiceDb.query(
      'DELETE FROM public.channel_connections WHERE tenant_id = $1 AND channel = $2',
      [tenantId, channel]
    );
    return (result.rowCount ?? 0) > 0;
  }

  private map(row: any): ChannelConnection {
    return {
      id: row.id,
      tenantId: row.tenant_id,
      channel: row.channel,
      status: row.status,
      config: row.config ?? {},
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }
}

export const channelsService = new ChannelsService();
