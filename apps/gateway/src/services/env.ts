import { logger } from './logger.js';
import { assertProductionSafety } from '../security/production-safety.js';

function requireEnv(name: string): string {
    const value = process.env[name];
    if (!value || !value.trim()) {
        throw new Error(`Missing required environment variable: ${name}`);
    }
    return value;
}

function hostFromUrl(url: string): string | null {
    try {
        const normalized = url.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:');
        return new URL(normalized).hostname.toLowerCase();
    } catch {
        return null;
    }
}

/** Hostnames that 404 on Render (no-server) — common typo or legacy hostname */
const INACTIVE_STREAM_HOSTS = new Set(['calliq-gateway.onrender.com', 'call-iq-gateway.onrender.com']);

function httpsToWss(httpsUrl: string): string {
    return httpsUrl
        .replace(/^https:/i, 'wss:')
        .replace(/^http:/i, 'ws:')
        .replace(/\/$/, '');
}

function isActiveStreamHost(wssOrHttpsUrl: string): boolean {
    const host = hostFromUrl(wssOrHttpsUrl);
    return Boolean(host && !INACTIVE_STREAM_HOSTS.has(host));
}

function wssToHttps(wssUrl: string): string {
    return wssUrl.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:').replace(/\/$/, '');
}

/** WSS base for Twilio Media Streams (no path). Skips dead hosts (e.g. calliq-gateway without hyphen). */
export function getTwilioStreamWssBase(): string {
    configureRenderEnvironment();

    const explicit = process.env.TWILIO_STREAM_WSS_URL?.trim().replace(/\/$/, '') || '';
    if (explicit && isActiveStreamHost(explicit)) {
        return explicit;
    }

    const gatewayHttps =
        process.env.GATEWAY_PUBLIC_URL?.trim() ||
        process.env.RENDER_EXTERNAL_URL?.trim() ||
        '';

    if (gatewayHttps && isActiveStreamHost(gatewayHttps)) {
        return httpsToWss(gatewayHttps);
    }

    return explicit;
}

/** Auto-configure Render production URLs when explicit vars are omitted. */
export function configureRenderEnvironment(): void {
    const explicitStream = process.env.TWILIO_STREAM_WSS_URL?.trim().replace(/\/$/, '') || '';
    const explicitActive = Boolean(explicitStream && isActiveStreamHost(explicitStream));

    const gatewayPublic = process.env.GATEWAY_PUBLIC_URL?.trim().replace(/\/$/, '') || '';
    const renderHttps = process.env.RENDER_EXTERNAL_URL?.trim().replace(/\/$/, '') || '';

    // Legacy Render hostname calliq-gateway → RENDER_EXTERNAL_URL without hyphen (404).
    // Never clobber a valid TWILIO_STREAM_WSS_URL (gateway.hallaai.com) with that hostname.
    if (explicitActive) {
        const renderInactive = Boolean(renderHttps && !isActiveStreamHost(renderHttps));
        const publicInactive = Boolean(gatewayPublic && !isActiveStreamHost(gatewayPublic));

        if (renderInactive || publicInactive) {
            const publicHttps = wssToHttps(explicitStream);
            // Not actionable on every boot — this is corrected automatically below.
            // The stale GATEWAY_PUBLIC_URL env var (calliq-gateway, no hyphen) should
            // still be removed/updated on Render when convenient.
            logger.info('Using TWILIO_STREAM_WSS_URL for gateway public URL (Render hostname is not live)', {
                twilioStreamHost: hostFromUrl(explicitStream),
                renderHost: renderHttps ? hostFromUrl(renderHttps) : undefined,
                gatewayPublicHost: gatewayPublic ? hostFromUrl(gatewayPublic) : undefined,
            });
            process.env.GATEWAY_PUBLIC_URL = publicHttps;
        }
        return;
    }

    const gatewayHttps =
        gatewayPublic ||
        (renderHttps && isActiveStreamHost(renderHttps) ? renderHttps : '');

    const derivedWss = gatewayHttps ? httpsToWss(gatewayHttps) : '';

    if (derivedWss && isActiveStreamHost(derivedWss)) {
        if (!explicitStream || !isActiveStreamHost(explicitStream)) {
            process.env.TWILIO_STREAM_WSS_URL = derivedWss;
        }
    }

    if (gatewayHttps && isActiveStreamHost(gatewayHttps) && !gatewayPublic) {
        process.env.GATEWAY_PUBLIC_URL = gatewayHttps;
    }
}

/** HTTPS base URL for Twilio webhooks and outbound TwiML (no trailing slash). */
export function getGatewayPublicHttpsBase(): string {
    configureRenderEnvironment();
    const wss = getTwilioStreamWssBase();
    if (wss) {
        return wss.replace(/^wss:/i, 'https:').replace(/^ws:/i, 'http:').replace(/\/$/, '');
    }
    return (
        (process.env.GATEWAY_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '')
            .trim()
            .replace(/\/$/, '')
    );
}

const DEFAULT_GATEWAY_HTTPS = 'https://gateway.hallaai.com';

/** Google Calendar OAuth redirect — must match Google Cloud Console exactly. */
export function getGoogleCalendarRedirectUri(): string {
    const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
    if (explicit) return explicit.replace(/\/$/, '');
    const base = getGatewayPublicHttpsBase() || DEFAULT_GATEWAY_HTTPS;
    return `${base}/api/v1/calendar/google/callback`;
}

/** Outlook Calendar OAuth redirect — must match Azure app registration (Web platform). */
export function getOutlookCalendarRedirectUri(): string {
    const base = getGatewayPublicHttpsBase() || DEFAULT_GATEWAY_HTTPS;
    const fallback = `${base}/api/v1/calendar/outlook/callback`;
    const explicit = process.env.MS_REDIRECT_URI?.trim();
    if (explicit) {
        const uri = explicit.replace(/\/$/, '');
        if (
            uri.includes('/calendar/google/') ||
            uri.includes('/integrations/') ||
            uri.includes('supabase.co/auth/') ||
            !uri.endsWith('/calendar/outlook/callback')
        ) {
            return fallback;
        }
        const expectedHost = hostFromUrl(base);
        const explicitHost = hostFromUrl(uri);
        if (!expectedHost || !explicitHost || explicitHost !== expectedHost) {
            return fallback;
        }
        return uri;
    }
    return fallback;
}

/** Calendly OAuth redirect — must match Calendly developer app redirect URI. */
export function getCalendlyRedirectUri(): string {
    const explicit = process.env.CALENDLY_REDIRECT_URI?.trim();
    if (explicit) return explicit.replace(/\/$/, '');
    const base = getGatewayPublicHttpsBase() || DEFAULT_GATEWAY_HTTPS;
    return `${base}/api/v1/calendar/calendly/callback`;
}

/** Public HTTPS base for Calendly webhook deliveries (append ?tenant_id= per workspace). */
export function getCalendlyWebhookBaseUrl(): string {
    return `${getCalendlyRedirectUri().replace(/\/callback$/, '/webhook')}`;
}

/** Acuity Scheduling OAuth redirect — must match Acuity developer app redirect URI. */
export function getAcuityRedirectUri(): string {
    const base = getGatewayPublicHttpsBase() || DEFAULT_GATEWAY_HTTPS;
    const fallback = `${base}/api/v1/calendar/acuity/callback`;
    const explicit = process.env.ACUITY_REDIRECT_URI?.trim();
    if (explicit) {
        const uri = explicit.replace(/\/$/, '');
        // Render env sometimes copies another provider's redirect URI — reject wrong paths.
        if (
            uri.includes('/integrations/') ||
            uri.includes('/calendar/google/') ||
            uri.includes('/calendar/calendly/') ||
            uri.includes('/calendar/outlook/') ||
            !uri.endsWith('/calendar/acuity/callback')
        ) {
            return fallback;
        }
        const expectedHost = hostFromUrl(base);
        const explicitHost = hostFromUrl(uri);
        if (!expectedHost || !explicitHost || explicitHost !== expectedHost) {
            return fallback;
        }
        return uri;
    }
    return fallback;
}

/** Jobber OAuth redirect — must match Jobber Developer Center callback URL. */
export function getJobberRedirectUri(): string {
    const base = getGatewayPublicHttpsBase() || DEFAULT_GATEWAY_HTTPS;
    const fallback = `${base}/api/v1/integrations/jobber/callback`;
    const explicit = process.env.JOBBER_REDIRECT_URI?.trim();
    if (explicit) {
        const uri = explicit.replace(/\/$/, '');
        if (
            uri.includes('/calendar/') ||
            !uri.endsWith('/integrations/jobber/callback')
        ) {
            return fallback;
        }
        const expectedHost = hostFromUrl(base);
        const explicitHost = hostFromUrl(uri);
        if (!expectedHost || !explicitHost || explicitHost !== expectedHost) {
            return fallback;
        }
        return uri;
    }
    return fallback;
}

/** Square Appointments OAuth redirect — must match Square developer app redirect URI. */
export function getSquareRedirectUri(): string {
    const base = getGatewayPublicHttpsBase() || DEFAULT_GATEWAY_HTTPS;
    const fallback = `${base}/api/v1/calendar/square-appointments/callback`;
    const explicit = process.env.SQUARE_REDIRECT_URI?.trim();
    if (explicit) {
        const uri = explicit.replace(/\/$/, '');
        if (!uri.includes('/calendar/square-appointments/callback')) {
            return fallback;
        }
        return uri;
    }
    return fallback;
}

/** Slack OAuth redirect — must match api.slack.com → OAuth & Permissions → Redirect URLs. */
export function getSlackRedirectUri(): string {
    const base = getGatewayPublicHttpsBase() || DEFAULT_GATEWAY_HTTPS;
    const fallback = `${base}/api/v1/integrations/slack/callback`;
    const explicit = process.env.SLACK_REDIRECT_URI?.trim();
    if (explicit) {
        const uri = explicit.replace(/\/$/, '');
        if (!uri.endsWith('/integrations/slack/callback')) {
            return fallback;
        }
        const expectedHost = hostFromUrl(base);
        const explicitHost = hostFromUrl(uri);
        if (!expectedHost || !explicitHost || explicitHost !== expectedHost) {
            return fallback;
        }
        return uri;
    }
    return fallback;
}

export function getAllowedOrigins(): string[] {
    const origins = new Set<string>();
    const configured = process.env.ALLOWED_ORIGINS?.trim();
    if (configured) {
        for (const entry of configured.split(',')) {
            const o = entry.trim();
            if (!o || o === '*') {
                if (process.env.NODE_ENV === 'production') {
                    throw new Error('ALLOWED_ORIGINS must not contain wildcard (*) in production');
                }
                continue;
            }
            origins.add(o.replace(/\/$/, ''));
        }
    }
    if (process.env.DASHBOARD_URL?.trim()) {
        origins.add(process.env.DASHBOARD_URL.trim().replace(/\/$/, ''));
    }
    return [...origins];
}

/** Vercel preview deployments (branch builds) — not listed in ALLOWED_ORIGINS. */
export function isVercelDashboardPreviewOrigin(origin: string): boolean {
    if ((process.env.ALLOW_VERCEL_PREVIEW_CORS || 'true').toLowerCase() === 'false') {
        return false;
    }
    try {
        const u = new URL(origin);
        if (u.protocol !== 'https:') return false;
        const host = u.hostname.toLowerCase();
        return (
            host.endsWith('.vercel.app') &&
            (host.includes('call-iq-dashboard') || host.includes('calliqlabs'))
        );
    } catch {
        return false;
    }
}

export function isAllowedCorsOrigin(origin: string): boolean {
    const normalized = origin.replace(/\/$/, '');
    if (getAllowedOrigins().includes(normalized)) return true;
    return isVercelDashboardPreviewOrigin(origin);
}

export function validateEnvironment(): void {
    configureRenderEnvironment();
    assertProductionSafety();

    requireEnv('REDIS_URL');
    requireEnv('JWT_SECRET');

    const voiceEnabled = (process.env.ENABLE_VOICE_AGENT || 'true').toLowerCase() !== 'false';
    if (voiceEnabled) {
        // Accept GATEWAY_DATABASE_URL (plain postgresql://) or DATABASE_URL
        const dbUrl = process.env.GATEWAY_DATABASE_URL || process.env.DATABASE_URL || '';
        if (!dbUrl.trim()) {
            throw new Error('Missing required environment variable: GATEWAY_DATABASE_URL (or DATABASE_URL)');
        }
        // Normalise: gateway uses node-postgres which needs postgresql:// not postgresql+asyncpg://
        const normalised = dbUrl.replace(/^postgresql\+asyncpg:\/\//, 'postgresql://');
        process.env.DATABASE_URL = normalised;

        // Surface PGSSLMODE for pg client (node-postgres reads this env var automatically)
        if (!process.env.PGSSLMODE) {
            process.env.PGSSLMODE = 'require';
        }

        requireEnv('OPENAI_API_KEY');
        requireEnv('TWILIO_AUTH_TOKEN');
        requireEnv('TWILIO_STREAM_WSS_URL');

        if (process.env.NODE_ENV === 'production') {
            requireEnv('SUPABASE_URL');
            requireEnv('SUPABASE_SERVICE_ROLE_KEY');
            if (!process.env.INTERNAL_API_KEY?.trim() && !process.env.VOICE_INTERNAL_API_KEY?.trim()) {
                logger.warn(
                    'VOICE_INTERNAL_API_KEY (or INTERNAL_API_KEY) is not set — add it in Render → Environment. ' +
                        'Internal/admin routes and server-to-server calls will fail until set.'
                );
            }
            const credKey = process.env.INTEGRATION_CREDENTIALS_KEY?.trim();
            if (!credKey) {
                throw new Error(
                    'Missing required environment variable: INTEGRATION_CREDENTIALS_KEY (32-byte base64 string, e.g. `openssl rand -base64 32`)'
                );
            }
            if (Buffer.from(credKey, 'base64').length !== 32) {
                throw new Error('INTEGRATION_CREDENTIALS_KEY must decode to 32 bytes. Generate one with: openssl rand -base64 32');
            }
            if (!process.env.TWILIO_ACCOUNT_SID?.trim()) {
                throw new Error('Missing required environment variable: TWILIO_ACCOUNT_SID');
            }
            if (!getAllowedOrigins().length) {
                throw new Error('Set ALLOWED_ORIGINS or DASHBOARD_URL for CORS in production');
            }
        }
    }

    const streamWss = getTwilioStreamWssBase();
    const streamHost = streamWss ? hostFromUrl(streamWss) : null;
    if (streamHost && INACTIVE_STREAM_HOSTS.has(streamHost)) {
        throw new Error(
            `Stream URL host "${streamHost}" is not reachable. ` +
                'Set TWILIO_STREAM_WSS_URL=wss://gateway.hallaai.com and GATEWAY_PUBLIC_URL=https://gateway.hallaai.com ' +
                '(Render may set RENDER_EXTERNAL_URL to calliq-gateway without hyphen — ignore it).'
        );
    }

    logger.info('Environment validation passed', {
        voiceEnabled,
        databaseUrl: (process.env.DATABASE_URL || '').replace(/\/\/.*@/, '//***@'), // sanitise
        pgSslMode: process.env.PGSSLMODE,
        twilioStreamWss: streamWss,
        renderExternalUrl: process.env.RENDER_EXTERNAL_URL || undefined,
    });
}
