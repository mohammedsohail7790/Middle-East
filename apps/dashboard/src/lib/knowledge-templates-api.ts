/**
 * Load/save knowledge templates — prefers GET/PUT /knowledge/templates,
 * falls back to legacy APIs when the gateway has not been redeployed yet.
 */
import { api, asArray, resolveTenantId } from "./api";
import {
  defaultTemplates,
  formatOfficeHoursText,
  formatPricingText,
  formatServicesText,
  isTemplatesRouteMissingError,
  normalizeTemplates,
  type KnowledgeTemplates,
} from "./knowledge-templates";

interface BusinessHourApiRow {
  dayOfWeek?: number;
  day_of_week?: number;
  startTime?: string;
  start_time?: string;
  endTime?: string;
  end_time?: string;
  isOpen?: boolean;
  is_open?: boolean;
  timezone?: string;
}

function mapBusinessHours(rows: BusinessHourApiRow[]): KnowledgeTemplates["officeHours"] {
  const base = defaultTemplates().officeHours;
  if (!rows.length) return base;
  return base.map((defaultDay) => {
    const row = rows.find(
      (r) => Number(r.dayOfWeek ?? r.day_of_week) === defaultDay.dayOfWeek
    );
    if (!row) return defaultDay;
    return {
      dayOfWeek: defaultDay.dayOfWeek,
      isOpen: row.isOpen ?? row.is_open ?? false,
      startTime: String(row.startTime ?? row.start_time ?? "09:00").slice(0, 5),
      endTime: String(row.endTime ?? row.end_time ?? "17:00").slice(0, 5),
    };
  });
}

async function loadTemplatesLegacy(): Promise<KnowledgeTemplates> {
  const [hoursRes, aiRes, tenantRes] = await Promise.allSettled([
    api.get<unknown>("/business-hours"),
    api.get<Record<string, unknown>>("/ai-config"),
    api.get<Record<string, unknown>>("/tenants/me"),
  ]);

  const hoursRows =
    hoursRes.status === "fulfilled" ? asArray<BusinessHourApiRow>(hoursRes.value) : [];
  const ai = aiRes.status === "fulfilled" ? aiRes.value : {};
  const tenant = tenantRes.status === "fulfilled" ? tenantRes.value : {};

  const serviceNames = Array.isArray(ai.servicesOffered)
    ? (ai.servicesOffered as string[])
    : Array.isArray(ai.services_offered)
      ? (ai.services_offered as string[])
      : [];

  const meta =
    tenant.metadata && typeof tenant.metadata === "object"
      ? (tenant.metadata as Record<string, unknown>)
      : {};
  const pricingRaw = meta.knowledge_pricing ?? meta.knowledgePricing;
  const pricing = Array.isArray(pricingRaw)
    ? (pricingRaw as Record<string, unknown>[])
        .map((p) => ({
          service: String(p.service ?? p.name ?? "").trim(),
          price: String(p.price ?? p.fee ?? "").trim(),
        }))
        .filter((p) => p.service || p.price)
    : [];

  const timezone = String(
    tenant.timezone ?? hoursRows[0]?.timezone ?? "America/New_York"
  );

  return normalizeTemplates({
    timezone,
    officeHours: mapBusinessHours(hoursRows),
    services: serviceNames.length ? serviceNames.map((name) => ({ name })) : [{ name: "" }],
    pricing: pricing.length ? pricing : [{ service: "", price: "" }],
  });
}

async function saveTemplatesLegacy(payload: KnowledgeTemplates): Promise<KnowledgeTemplates> {
  const tenantId = await resolveTenantId();
  const timezone = payload.timezone || "America/New_York";

  await Promise.all(
    payload.officeHours.map((day) =>
      api.put(`/business-hours/${day.dayOfWeek}`, {
        startTime: day.startTime,
        endTime: day.endTime,
        isOpen: day.isOpen,
        timezone,
      })
    )
  );

  const hoursText = formatOfficeHoursText(payload.officeHours);
  const serviceNames = payload.services.map((s) => s.name.trim()).filter(Boolean);
  const pricingRows = payload.pricing
    .map((p) => ({ service: p.service.trim(), price: p.price.trim() }))
    .filter((p) => p.service && p.price);

  await api.put("/ai-config", {
    servicesOffered: serviceNames,
    businessHoursDescription: hoursText.replace(/^OFFICE HOURS:\n?/, "").trim(),
  });

  await api.put(`/tenants/${tenantId}`, {
    metadata: { knowledge_pricing: pricingRows },
    timezone,
  });

  try {
    const synced = await api.post<unknown>("/knowledge/templates/sync", {});
    return normalizeTemplates(synced);
  } catch (syncErr) {
    if (!isTemplatesRouteMissingError(syncErr)) throw syncErr;
  }

  const knowledgeBlob = [
    hoursText,
    formatServicesText(payload.services),
    formatPricingText(payload.pricing),
  ]
    .filter(Boolean)
    .join("\n\n");

  if (knowledgeBlob.trim()) {
    await api.post("/knowledge", { text: knowledgeBlob, category: "general" });
  }

  return loadTemplatesLegacy();
}

export async function loadKnowledgeTemplates(): Promise<KnowledgeTemplates> {
  try {
    const data = await api.get<unknown>("/knowledge/templates");
    return normalizeTemplates(data);
  } catch (err) {
    if (!isTemplatesRouteMissingError(err)) throw err;
    return loadTemplatesLegacy();
  }
}

export async function saveKnowledgeTemplates(
  payload: KnowledgeTemplates
): Promise<KnowledgeTemplates> {
  try {
    const saved = await api.put<unknown>("/knowledge/templates", payload);
    return normalizeTemplates(saved);
  } catch (err) {
    if (!isTemplatesRouteMissingError(err)) throw err;
    return saveTemplatesLegacy(payload);
  }
}
