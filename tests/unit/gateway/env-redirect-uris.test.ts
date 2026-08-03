import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { getAcuityRedirectUri, getOutlookCalendarRedirectUri } from '../../../apps/gateway/src/services/env.js';

const ENV_KEYS = [
    'ACUITY_REDIRECT_URI',
    'MS_REDIRECT_URI',
    'GATEWAY_PUBLIC_URL',
    'RENDER_EXTERNAL_URL',
    'TWILIO_STREAM_WSS_URL',
] as const;

describe('getAcuityRedirectUri', () => {
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const key of ENV_KEYS) {
            saved[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    });

    it('derives from GATEWAY_PUBLIC_URL when ACUITY_REDIRECT_URI is unset', () => {
        process.env.GATEWAY_PUBLIC_URL = 'https://call-iq-gateway.onrender.com';
        expect(getAcuityRedirectUri()).toBe(
            'https://call-iq-gateway.onrender.com/api/v1/calendar/acuity/callback'
        );
    });

    it('rejects mis-copied Google redirect URI', () => {
        process.env.GATEWAY_PUBLIC_URL = 'https://call-iq-gateway.onrender.com';
        process.env.ACUITY_REDIRECT_URI =
            'https://call-iq-gateway.onrender.com/api/v1/calendar/google/callback';
        expect(getAcuityRedirectUri()).toBe(
            'https://call-iq-gateway.onrender.com/api/v1/calendar/acuity/callback'
        );
    });

    it('rejects wrong host when acuity path is otherwise correct', () => {
        process.env.GATEWAY_PUBLIC_URL = 'https://call-iq-gateway.onrender.com';
        process.env.ACUITY_REDIRECT_URI =
            'https://calliq-gateway.onrender.com/api/v1/calendar/acuity/callback';
        expect(getAcuityRedirectUri()).toBe(
            'https://call-iq-gateway.onrender.com/api/v1/calendar/acuity/callback'
        );
    });

    it('accepts explicit URI when host and path match gateway base', () => {
        process.env.GATEWAY_PUBLIC_URL = 'https://call-iq-gateway.onrender.com';
        process.env.ACUITY_REDIRECT_URI =
            'https://call-iq-gateway.onrender.com/api/v1/calendar/acuity/callback';
        expect(getAcuityRedirectUri()).toBe(
            'https://call-iq-gateway.onrender.com/api/v1/calendar/acuity/callback'
        );
    });

    it('rejects calendly and integrations paths', () => {
        process.env.GATEWAY_PUBLIC_URL = 'https://call-iq-gateway.onrender.com';

        process.env.ACUITY_REDIRECT_URI =
            'https://call-iq-gateway.onrender.com/api/v1/calendar/calendly/callback';
        expect(getAcuityRedirectUri()).toBe(
            'https://call-iq-gateway.onrender.com/api/v1/calendar/acuity/callback'
        );

        process.env.ACUITY_REDIRECT_URI =
            'https://call-iq-gateway.onrender.com/api/v1/integrations/acuity/callback';
        expect(getAcuityRedirectUri()).toBe(
            'https://call-iq-gateway.onrender.com/api/v1/calendar/acuity/callback'
        );
    });
});

describe('getOutlookCalendarRedirectUri', () => {
    const saved: Record<string, string | undefined> = {};

    beforeEach(() => {
        for (const key of ENV_KEYS) {
            saved[key] = process.env[key];
            delete process.env[key];
        }
    });

    afterEach(() => {
        for (const key of ENV_KEYS) {
            if (saved[key] === undefined) delete process.env[key];
            else process.env[key] = saved[key];
        }
    });

    it('derives from GATEWAY_PUBLIC_URL when MS_REDIRECT_URI is unset', () => {
        process.env.GATEWAY_PUBLIC_URL = 'https://call-iq-gateway.onrender.com';
        expect(getOutlookCalendarRedirectUri()).toBe(
            'https://call-iq-gateway.onrender.com/api/v1/calendar/outlook/callback'
        );
    });

    it('rejects Supabase auth callback (login app, not calendar integration)', () => {
        process.env.GATEWAY_PUBLIC_URL = 'https://call-iq-gateway.onrender.com';
        process.env.MS_REDIRECT_URI =
            'https://btgwgfphgdgnoaqtopwy.supabase.co/auth/v1/callback';
        expect(getOutlookCalendarRedirectUri()).toBe(
            'https://call-iq-gateway.onrender.com/api/v1/calendar/outlook/callback'
        );
    });

    it('rejects wrong host when outlook path is otherwise correct', () => {
        process.env.GATEWAY_PUBLIC_URL = 'https://call-iq-gateway.onrender.com';
        process.env.MS_REDIRECT_URI =
            'https://calliq-gateway.onrender.com/api/v1/calendar/outlook/callback';
        expect(getOutlookCalendarRedirectUri()).toBe(
            'https://call-iq-gateway.onrender.com/api/v1/calendar/outlook/callback'
        );
    });

    it('accepts explicit URI when host and path match gateway base', () => {
        process.env.GATEWAY_PUBLIC_URL = 'https://call-iq-gateway.onrender.com';
        process.env.MS_REDIRECT_URI =
            'https://call-iq-gateway.onrender.com/api/v1/calendar/outlook/callback';
        expect(getOutlookCalendarRedirectUri()).toBe(
            'https://call-iq-gateway.onrender.com/api/v1/calendar/outlook/callback'
        );
    });
});
