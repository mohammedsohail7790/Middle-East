/**
 * READ-ONLY order lookup for the Dropshipping workforce (F9).
 *
 * STATE TODAY:  ORDER_LOOKUP = BLOCKED_PENDING_KLAROS_READ_API
 *
 * Halla holds no order, payment, refund, shipment or tracking data, and it has no authenticated read channel into
 * Klaros: the only Halla <-> Klaros paths are Klaros -> Halla (workforce, leads, calls) and Halla -> Klaros signed
 * webhooks. Klaros publishes no order read API (its dropshipping design is conceptual). Nothing here fakes one.
 * What this module provides is the SAFE SHAPE the capability must take, so that when a read API exists a provider
 * can be plugged in without reopening the safety questions:
 *
 *   - tenant-scoped: the tenant comes from the authenticated session/key, never from the caller's input, and a
 *     record that does not belong to that tenant is rejected, never returned;
 *   - read-only: the provider interface has exactly one method, `lookup`; there is no way to modify an order,
 *     process a payment, issue a refund or contact a carrier through it;
 *   - safe identifier: a short opaque order reference (letters, digits, `_`, `-`), validated before any provider
 *     is called — no URLs, no SQL, no free text;
 *   - allow-listed output: only the fields below leave the module. Internal cost, supplier credentials, supplier
 *     identity and other customers' data are not representable in the result;
 *   - honest when unavailable: with no provider the answer is a structured "blocked" outcome, and the agents
 *     escalate instead of inventing a status.
 */
import { logger } from '../logger.js';

export const ORDER_LOOKUP_BLOCKED = 'BLOCKED_PENDING_KLAROS_READ_API' as const;

export const ORDER_STATUSES = ['unknown', 'pending', 'confirmed', 'processing', 'completed', 'cancelled'] as const;
export const PAYMENT_STATUSES = ['unknown', 'unpaid', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed'] as const;
export const FULFILLMENT_STATUSES = ['unknown', 'unfulfilled', 'partially_fulfilled', 'fulfilled', 'failed'] as const;
export const SHIPMENT_STATUSES = ['unknown', 'not_shipped', 'label_created', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned'] as const;
export const RETURN_STATUSES = ['unknown', 'none', 'requested', 'approved', 'received', 'rejected'] as const;
export const REFUND_STATUSES = ['unknown', 'none', 'pending', 'issued', 'rejected'] as const;

type Enum<T extends readonly string[]> = T[number];

/** The ONLY fields that can leave this module. */
export interface PublicOrderView {
  reference: string;
  orderStatus: Enum<typeof ORDER_STATUSES>;
  paymentStatus: Enum<typeof PAYMENT_STATUSES>;
  fulfillmentStatus: Enum<typeof FULFILLMENT_STATUSES>;
  shipmentStatus: Enum<typeof SHIPMENT_STATUSES>;
  trackingNumber: string | null;
  returnStatus: Enum<typeof RETURN_STATUSES>;
  refundStatus: Enum<typeof REFUND_STATUSES>;
  updatedAt: string | null;
}

/** What a provider returns. It may carry more than the public view; everything beyond the view is dropped. */
export interface ProviderOrderRecord extends Record<string, unknown> {
  tenantId: string;
  reference: string;
}

/** A provider can only READ. This interface is deliberately a single method. */
export interface OrderLookupProvider {
  readonly name: string;
  lookup(request: { tenantId: string; reference: string }): Promise<ProviderOrderRecord | null>;
}

/** Optional-undefined members let callers read `code`/`message` on a failure without relying on union narrowing. */
export type OrderLookupOutcome =
  | { ok: true; order: PublicOrderView; code?: undefined; message?: undefined }
  | { ok: false; order?: undefined; code: typeof ORDER_LOOKUP_BLOCKED | 'INVALID_REFERENCE' | 'NOT_FOUND' | 'PROVIDER_ERROR'; message: string };

const REFERENCE_RE = /^[A-Za-z0-9][A-Za-z0-9_-]{2,39}$/;
const TRACKING_RE = /^[A-Za-z0-9-]{4,40}$/;
const PROVIDER_TIMEOUT_MS = 5_000;

let provider: OrderLookupProvider | null = null;

/** Registers the single read-only provider (tests, and — once Klaros publishes a read API — the Klaros adapter). */
export function registerOrderLookupProvider(next: OrderLookupProvider): void {
  provider = next;
}
export function clearOrderLookupProvider(): void {
  provider = null;
}
export function isOrderLookupAvailable(): boolean {
  return provider !== null;
}
/** The capability state, for readiness reporting. */
export function orderLookupCapability(): typeof ORDER_LOOKUP_BLOCKED | 'READY' {
  return provider ? 'READY' : ORDER_LOOKUP_BLOCKED;
}

export function isValidOrderReference(value: unknown): value is string {
  return typeof value === 'string' && REFERENCE_RE.test(value);
}

function pick<T extends readonly string[]>(allowed: T, value: unknown): Enum<T> {
  return (typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value : 'unknown') as Enum<T>;
}

/** Allow-list projection: the record's other keys (costs, supplier details, customer data, credentials) are never read. */
function toPublicView(record: ProviderOrderRecord): PublicOrderView {
  const tracking = typeof record.trackingNumber === 'string' && TRACKING_RE.test(record.trackingNumber) ? record.trackingNumber : null;
  const updated = typeof record.updatedAt === 'string' && !Number.isNaN(Date.parse(record.updatedAt)) ? new Date(record.updatedAt).toISOString() : null;
  return {
    reference: record.reference,
    orderStatus: pick(ORDER_STATUSES, record.orderStatus),
    paymentStatus: pick(PAYMENT_STATUSES, record.paymentStatus),
    fulfillmentStatus: pick(FULFILLMENT_STATUSES, record.fulfillmentStatus),
    shipmentStatus: pick(SHIPMENT_STATUSES, record.shipmentStatus),
    trackingNumber: tracking,
    returnStatus: pick(RETURN_STATUSES, record.returnStatus),
    refundStatus: pick(REFUND_STATUSES, record.refundStatus),
    updatedAt: updated,
  };
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('provider timeout')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * Looks up ONE order for ONE tenant. `tenantId` must come from the authenticated context (the session or the API
 * key), never from anything the caller said or sent.
 */
export async function lookupOrder(tenantId: string, reference: unknown): Promise<OrderLookupOutcome> {
  if (!isValidOrderReference(reference)) {
    return { ok: false, code: 'INVALID_REFERENCE', message: 'The order reference is not in a valid format.' };
  }
  if (!provider) {
    return {
      ok: false,
      code: ORDER_LOOKUP_BLOCKED,
      message: 'Order records are not available. A team member must check the order.',
    };
  }
  try {
    const record = await withTimeout(provider.lookup({ tenantId, reference }), PROVIDER_TIMEOUT_MS);
    if (!record) return { ok: false, code: 'NOT_FOUND', message: 'No order was found for that reference.' };
    if (record.tenantId !== tenantId) {
      // A provider returned another tenant's order. Never return it, and never reveal that it exists.
      logger.warn('ORDER_LOOKUP_TENANT_MISMATCH_REJECTED', { tenantId, provider: provider.name });
      return { ok: false, code: 'NOT_FOUND', message: 'No order was found for that reference.' };
    }
    return { ok: true, order: toPublicView({ ...record, reference }) };
  } catch {
    // No detail: a provider error can echo the reference, the customer or an internal URL.
    logger.warn('ORDER_LOOKUP_PROVIDER_ERROR', { tenantId, provider: provider.name });
    return { ok: false, code: 'PROVIDER_ERROR', message: 'Order records could not be read right now.' };
  }
}
