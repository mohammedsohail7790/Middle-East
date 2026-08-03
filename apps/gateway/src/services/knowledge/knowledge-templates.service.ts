/**
 * Structured business templates for the Knowledge Base dashboard.
 * Syncs office hours → business_hours API, services → ai-config, pricing → tenant metadata,
 * and formatted text → knowledge_base (for RAG on calls).
 */
import { voiceDb } from '../voice/tenant-scope.js';
import { businessHoursService } from '../business-hours/business-hours.service.js';
import { aiConfigService } from '../ai-config/ai-config.service.js';
import { knowledgeService } from './knowledge.service.js';
import { knowledgeCache } from './knowledge.cache.js';
import { publishDashboardPushType } from '../dashboard/dashboard-events.js';

export const TEMPLATE_SOURCES = {
  officeHours: 'template:office_hours',
  services: 'template:services',
  pricing: 'template:pricing',
} as const;

export interface DayHoursTemplate {
  dayOfWeek: number;
  isOpen: boolean;
  startTime: string;
  endTime: string;
}

export interface ServiceRowTemplate {
  name: string;
}

export interface PricingRowTemplate {
  service: string;
  price: string;
}

export interface KnowledgeTemplatesPayload {
  timezone: string;
  officeHours: DayHoursTemplate[];
  services: ServiceRowTemplate[];
  pricing: PricingRowTemplate[];
}

const DAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
];

function defaultOfficeHours(): DayHoursTemplate[] {
  return DAY_NAMES.map((_, dayOfWeek) => ({
    dayOfWeek,
    isOpen: dayOfWeek >= 1 && dayOfWeek <= 5,
    startTime: '09:00',
    endTime: '17:00',
  }));
}

function normalizeTime(value: string | undefined, fallback: string): string {
  const raw = String(value || fallback).trim().slice(0, 5);
  if (/^\d{1,2}:\d{2}$/.test(raw)) {
    const [h, m] = raw.split(':');
    return `${h.padStart(2, '0')}:${m}`;
  }
  return fallback;
}

function formatTime12h(hhmm: string): string {
  const [hStr, mStr] = hhmm.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 || 12;
  return `${hour12}:${String(m).padStart(2, '0')} ${period}`;
}

export function formatOfficeHoursText(hours: DayHoursTemplate[]): string {
  const lines = hours
    .slice()
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
    .map((day) => {
      const label = DAY_NAMES[day.dayOfWeek] ?? `Day ${day.dayOfWeek}`;
      if (!day.isOpen) return `${label}: Closed`;
      const start = normalizeTime(day.startTime, '09:00');
      const end = normalizeTime(day.endTime, '17:00');
      return `${label}: ${formatTime12h(start)} – ${formatTime12h(end)}`;
    });
  return `OFFICE HOURS:\n${lines.join('\n')}`;
}

export function formatServicesText(services: ServiceRowTemplate[]): string {
  const names = services.map((s) => s.name.trim()).filter(Boolean);
  if (!names.length) return '';
  return `SERVICES OFFERED:\n${names.map((n) => `- ${n}`).join('\n')}`;
}

export function formatPricingText(pricing: PricingRowTemplate[]): string {
  const rows = pricing
    .map((p) => ({ service: p.service.trim(), price: p.price.trim() }))
    .filter((p) => p.service && p.price);
  if (!rows.length) return '';
  return `PRICING:\n${rows.map((p) => `- ${p.service}: ${p.price}`).join('\n')}`;
}

function parsePricingFromMetadata(metadata: unknown): PricingRowTemplate[] {
  if (!metadata || typeof metadata !== 'object') return [{ service: '', price: '' }];
  const meta = metadata as Record<string, unknown>;
  const raw = meta.knowledge_pricing ?? meta.knowledgePricing;
  if (!Array.isArray(raw)) return [{ service: '', price: '' }];
  const rows = raw
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const r = row as Record<string, unknown>;
      return {
        service: String(r.service ?? r.name ?? '').trim(),
        price: String(r.price ?? r.fee ?? '').trim(),
      };
    })
    .filter((r): r is PricingRowTemplate => Boolean(r && (r.service || r.price)));
  return rows.length ? rows : [{ service: '', price: '' }];
}

export async function getKnowledgeTemplates(tenantId: string): Promise<KnowledgeTemplatesPayload> {
  let hours = await businessHoursService.getBusinessHours(tenantId);
  if (hours.length === 0) {
    try {
      await businessHoursService.initializeDefaultHours(tenantId);
      hours = await businessHoursService.getBusinessHours(tenantId);
    } catch {
      /* use defaults below */
    }
  }

  const officeHours =
    hours.length > 0
      ? hours.map((h) => ({
          dayOfWeek: h.dayOfWeek,
          isOpen: h.isOpen,
          startTime: normalizeTime(h.startTime, '09:00'),
          endTime: normalizeTime(h.endTime, '17:00'),
        }))
      : defaultOfficeHours();

  const timezone = hours[0]?.timezone || 'America/New_York';

  const aiConfig = await aiConfigService.getConfig(tenantId);
  const serviceNames = (aiConfig.servicesOffered || []).map(String).filter(Boolean);
  const services: ServiceRowTemplate[] = serviceNames.length
    ? serviceNames.map((name) => ({ name }))
    : [{ name: '' }];

  const tenantRow = await voiceDb.query(
    `select metadata, timezone from public.voice_tenants where id = $1 limit 1`,
    [tenantId]
  );
  const metadata = tenantRow.rows[0]?.metadata;
  const tenantTz = tenantRow.rows[0]?.timezone;

  const pricing = parsePricingFromMetadata(metadata);

  return {
    timezone: String(tenantTz || timezone),
    officeHours,
    services,
    pricing,
  };
}

export async function saveKnowledgeTemplates(
  tenantId: string,
  payload: KnowledgeTemplatesPayload
): Promise<void> {
  const timezone = payload.timezone?.trim() || 'America/New_York';

  const officeHours = (payload.officeHours?.length ? payload.officeHours : defaultOfficeHours())
    .slice()
    .sort((a, b) => a.dayOfWeek - b.dayOfWeek);

  for (const day of officeHours) {
    if (day.dayOfWeek < 0 || day.dayOfWeek > 6) continue;
    await businessHoursService.updateBusinessHours(
      tenantId,
      day.dayOfWeek,
      normalizeTime(day.startTime, '09:00'),
      normalizeTime(day.endTime, '17:00'),
      Boolean(day.isOpen),
      timezone
    );
  }

  const serviceNames = (payload.services || [])
    .map((s) => s.name.trim())
    .filter(Boolean);

  const pricingRows = (payload.pricing || [])
    .map((p) => ({ service: p.service.trim(), price: p.price.trim() }))
    .filter((p) => p.service && p.price);

  const hoursText = formatOfficeHoursText(officeHours);
  const servicesText = formatServicesText(payload.services || []);
  const pricingText = formatPricingText(payload.pricing || []);

  await aiConfigService.upsertConfig(tenantId, {
    servicesOffered: serviceNames,
    businessHoursDescription: hoursText.replace(/^OFFICE HOURS:\n?/, '').trim(),
  });

  await voiceDb.query(
    `update public.voice_tenants
     set metadata = coalesce(metadata, '{}'::jsonb) || $2::jsonb,
         timezone = coalesce($3, timezone),
         updated_at = now()
     where id = $1`,
    [
      tenantId,
      JSON.stringify({ knowledge_pricing: pricingRows }),
      timezone,
    ]
  );

  await knowledgeService.syncTemplateKnowledge(
    tenantId,
    TEMPLATE_SOURCES.officeHours,
    hoursText,
    'general'
  );
  await knowledgeService.syncTemplateKnowledge(
    tenantId,
    TEMPLATE_SOURCES.services,
    servicesText,
    'general'
  );
  await knowledgeService.syncTemplateKnowledge(
    tenantId,
    TEMPLATE_SOURCES.pricing,
    pricingText,
    'general'
  );

  await knowledgeCache.invalidate(tenantId);
  publishDashboardPushType(tenantId, 'knowledge.updated');
  publishDashboardPushType(tenantId, 'config.updated');
}

/** Re-sync RAG template chunks (and AI hours text) from current DB state — e.g. after Settings save. */
export async function syncKnowledgeTemplatesFromCurrentState(
  tenantId: string,
  opts?: { hoursNote?: string }
): Promise<void> {
  const payload = await getKnowledgeTemplates(tenantId);
  const officeHours = payload.officeHours;
  const hoursText = formatOfficeHoursText(officeHours);
  const servicesText = formatServicesText(payload.services);
  const pricingText = formatPricingText(payload.pricing);

  const serviceNames = payload.services.map((s) => s.name.trim()).filter(Boolean);
  const hoursNote = opts?.hoursNote?.trim() || '';
  let hoursDescription = hoursText.replace(/^OFFICE HOURS:\n?/, '').trim();
  if (hoursNote) {
    hoursDescription = hoursDescription ? `${hoursDescription}\n\n${hoursNote}` : hoursNote;
  }

  await aiConfigService.upsertConfig(tenantId, {
    servicesOffered: serviceNames,
    businessHoursDescription: hoursDescription || undefined,
  });

  const hoursForRag = hoursNote ? `${hoursText}\n\n${hoursNote}` : hoursText;

  await knowledgeService.syncTemplateKnowledge(
    tenantId,
    TEMPLATE_SOURCES.officeHours,
    hoursForRag,
    'general'
  );
  await knowledgeService.syncTemplateKnowledge(
    tenantId,
    TEMPLATE_SOURCES.services,
    servicesText,
    'general'
  );
  await knowledgeService.syncTemplateKnowledge(
    tenantId,
    TEMPLATE_SOURCES.pricing,
    pricingText,
    'general'
  );

  await knowledgeCache.invalidate(tenantId);
  publishDashboardPushType(tenantId, 'knowledge.updated');
  publishDashboardPushType(tenantId, 'config.updated');
}
