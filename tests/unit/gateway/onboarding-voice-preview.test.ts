import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../apps/gateway/src/services/voice/security.js', () => ({ requireVoiceApiAccess: vi.fn() }));
vi.mock('../../../apps/gateway/src/services/auth/tenant-context.js', () => ({ getTenantId: vi.fn() }));
vi.mock('../../../apps/gateway/src/services/auth/jwt-tenant-verifier.js', () => ({ verifySupabaseAuthOnly: vi.fn() }));
vi.mock('../../../apps/gateway/src/services/onboarding/onboarding.service.js', () => ({ onboardingService: {} }));
vi.mock('../../../apps/gateway/src/security/tiered-rate-limit.js', () => ({ checkLimit: vi.fn(), respond429: vi.fn() }));

import { PREVIEW_VOICES, resolvePreviewRequest } from '../../../apps/gateway/src/services/onboarding/onboarding.controller.js';

describe('voice preview request', () => {
  it('keeps the old behaviour when only a personality is asked for', () => {
    const r = resolvePreviewRequest({ tone: 'warm', agentName: 'Maya' });
    expect(r).toMatchObject({ tone: 'warm', agentName: 'Maya', text: null });
    expect(typeof r.voice).toBe('string');
  });

  it('uses the chosen voice only if it is one the receptionist supports', () => {
    expect(resolvePreviewRequest({ voice: 'cedar' }).voice).toBe('cedar');
    expect(resolvePreviewRequest({ voice: 'CEDAR' }).voice).toBe('cedar');
    expect(PREVIEW_VOICES.has(resolvePreviewRequest({ voice: 'evil-voice' }).voice)).toBe(true);
    expect(resolvePreviewRequest({ voice: 'evil-voice' }).voice).not.toBe('evil-voice');
  });

  it('reads the client\'s greeting aloud, cut to 300 characters and tidied', () => {
    expect(resolvePreviewRequest({ text: '  Hello   there\n friend  ' }).text).toBe('Hello there friend');
    expect(resolvePreviewRequest({ text: 'x'.repeat(2000) }).text).toHaveLength(300);
  });

  it('ignores text that is not a string or is empty', () => {
    expect(resolvePreviewRequest({ text: 42 }).text).toBeNull();
    expect(resolvePreviewRequest({ text: '   ' }).text).toBeNull();
    expect(resolvePreviewRequest(undefined).text).toBeNull();
  });

  it('falls back to a safe personality and name', () => {
    expect(resolvePreviewRequest({ tone: 'angry', agentName: '   ' })).toMatchObject({ tone: 'professional', agentName: 'Sarah' });
  });
});
