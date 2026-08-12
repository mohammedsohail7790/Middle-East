/**
 * Service-area checking for on-site visits.
 *
 * Businesses set a base address plus a limit — either straight-line miles or
 * driving minutes — and the AI verifies a caller's service address against it
 * mid-call via the check_service_area tool.
 *
 * Uses keyless public APIs so tenants don't need their own map accounts:
 *  - Geocoding: OpenStreetMap Nominatim (1 req/sec fair-use; we cache hard)
 *  - Driving time: OSRM public demo server
 * Both calls are timeboxed — a slow map API must never stall a live call.
 */

import { logger } from '../logger.js';

export interface ServiceAreaSettings {
    enabled: boolean;
    /** 'miles' = straight-line radius; 'minutes' = driving time */
    mode: 'miles' | 'minutes';
    limit: number;
    /** Base address the area is measured from (shop/office) */
    address: string;
}

export interface ServiceAreaResult {
    /** null = could not determine (geocode/routing failed) — treat as unknown, not out-of-area */
    inArea: boolean | null;
    distanceMiles?: number;
    driveMinutes?: number;
    /** Ready-to-speak summary for the AI */
    message: string;
}

const GEOCODE_TIMEOUT_MS = 5000;
const ROUTE_TIMEOUT_MS = 5000;
const USER_AGENT = 'HallaAI/1.0 (https://www.hallaai.com; service-area-check)';

type Coords = { lat: number; lng: number };

/** Address → coords cache. Base addresses repeat every call; caller addresses may repeat too. */
const geocodeCache = new Map<string, Coords | null>();
const GEOCODE_CACHE_MAX = 500;

async function fetchWithTimeout(url: string, timeoutMs: number): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, {
            headers: { 'User-Agent': USER_AGENT },
            signal: controller.signal,
        });
    } finally {
        clearTimeout(timer);
    }
}

export async function geocodeAddress(address: string): Promise<Coords | null> {
    const key = address.trim().toLowerCase();
    if (!key) return null;
    if (geocodeCache.has(key)) return geocodeCache.get(key) ?? null;

    try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(address)}`;
        const res = await fetchWithTimeout(url, GEOCODE_TIMEOUT_MS);
        if (!res.ok) throw new Error(`Nominatim HTTP ${res.status}`);
        const data = (await res.json()) as Array<{ lat: string; lon: string }>;
        const coords = data?.[0]
            ? { lat: Number(data[0].lat), lng: Number(data[0].lon) }
            : null;
        if (geocodeCache.size >= GEOCODE_CACHE_MAX) geocodeCache.clear();
        geocodeCache.set(key, coords);
        return coords;
    } catch (err) {
        logger.warn('SERVICE_AREA_GEOCODE_FAILED', { address: address.slice(0, 80), error: String(err) });
        return null;
    }
}

export function haversineMiles(a: Coords, b: Coords): number {
    const R = 3958.8; // Earth radius in miles
    const toRad = (deg: number) => (deg * Math.PI) / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const h =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

export async function drivingMinutes(from: Coords, to: Coords): Promise<number | null> {
    try {
        const url = `https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;
        const res = await fetchWithTimeout(url, ROUTE_TIMEOUT_MS);
        if (!res.ok) throw new Error(`OSRM HTTP ${res.status}`);
        const data = (await res.json()) as { routes?: Array<{ duration: number }> };
        const seconds = data.routes?.[0]?.duration;
        return typeof seconds === 'number' ? Math.round(seconds / 60) : null;
    } catch (err) {
        logger.warn('SERVICE_AREA_ROUTE_FAILED', { error: String(err) });
        return null;
    }
}

export function parseServiceAreaSettings(raw: unknown): ServiceAreaSettings | null {
    if (!raw || typeof raw !== 'object') return null;
    const o = raw as Record<string, unknown>;
    const limit = Number(o.limit);
    const address = typeof o.address === 'string' ? o.address.trim() : '';
    if (o.enabled !== true || !address || !Number.isFinite(limit) || limit <= 0) return null;
    return {
        enabled: true,
        mode: o.mode === 'minutes' ? 'minutes' : 'miles',
        limit,
        address,
    };
}

export async function checkServiceArea(
    area: ServiceAreaSettings,
    callerAddress: string
): Promise<ServiceAreaResult> {
    const unknown = (why: string): ServiceAreaResult => ({
        inArea: null,
        message: `Could not verify the address automatically (${why}). Take the caller's full address and let them know the team will confirm coverage when following up. Do not tell the caller anything failed.`,
    });

    const base = await geocodeAddress(area.address);
    if (!base) return unknown('business base address not found on the map');

    const caller = await geocodeAddress(callerAddress);
    if (!caller) return unknown('caller address not found on the map — it may be misspelled or incomplete');

    const distanceMiles = Math.round(haversineMiles(base, caller) * 10) / 10;

    if (area.mode === 'minutes') {
        const minutes = await drivingMinutes(base, caller);
        if (minutes === null) {
            // Routing down — fall back to a rough miles equivalent (~1 mile ≈ 2 min local driving)
            const approxMinutes = Math.round(distanceMiles * 2);
            const inArea = approxMinutes <= area.limit;
            return {
                inArea,
                distanceMiles,
                driveMinutes: approxMinutes,
                message: inArea
                    ? `The address is roughly ${approxMinutes} minutes' drive away — inside the ${area.limit}-minute service area. Proceed with booking.`
                    : `The address is roughly ${approxMinutes} minutes' drive away — outside the ${area.limit}-minute service area.`,
            };
        }
        const inArea = minutes <= area.limit;
        return {
            inArea,
            distanceMiles,
            driveMinutes: minutes,
            message: inArea
                ? `The address is about ${minutes} minutes' drive from the shop — inside the ${area.limit}-minute service area. Proceed with booking.`
                : `The address is about ${minutes} minutes' drive from the shop — outside the ${area.limit}-minute service area.`,
        };
    }

    const inArea = distanceMiles <= area.limit;
    return {
        inArea,
        distanceMiles,
        message: inArea
            ? `The address is about ${distanceMiles} miles from the shop — inside the ${area.limit}-mile service area. Proceed with booking.`
            : `The address is about ${distanceMiles} miles from the shop — outside the ${area.limit}-mile service area.`,
    };
}
