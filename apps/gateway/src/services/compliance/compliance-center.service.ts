/**
 * Compliance Center Service
 *
 * Manages per-tenant call compliance settings:
 *   - AI disclosure announcement
 *   - Call recording on/off
 *   - Recording announcement
 *   - Caller consent gate
 *   - Data retention period
 *   - Industry compliance profile (real_estate, general)
 *
 * Industry profiles provide safe defaults but every setting is individually
 * overridable by the tenant — Call IQ provides the tools, not legal advice.
 *
 * Healthcare and Legal are not launch verticals — HIPAA/BAA and attorney-client
 * privilege obligations need dedicated evaluation before we support them, so
 * those profiles are intentionally not exposed. The 'healthcare' | 'legal'
 * union members are kept so any pre-existing tenant rows still type-check and
 * load (via the 'general' fallback in _defaultsForProfile), but they're no
 * longer offered as a choice.
 */

import { pool } from '../db/pool.js';
import { logger } from '../logger.js';
import { recordEnterpriseAuditEvent } from '../enterprise/enterprise-audit.service.js';

// ─── Types ────────────────────────────────────────────────────────────────────

export type IndustryProfile = 'healthcare' | 'legal' | 'real_estate' | 'general';
type SelectableIndustryProfile = 'real_estate' | 'general';

export interface ComplianceSettings {
  tenantId: string;

  // AI Disclosure
  aiDisclosureEnabled: boolean;
  aiDisclosureMessage: string;

  // Call Recording
  recordingEnabled: boolean;

  // Recording Announcement
  recordingAnnouncementEnabled: boolean;
  recordingAnnouncementMessage: string;

  // Consent Gate
  consentRequired: boolean;
  consentMessage: string;

  // Optional: instead of a simple "press 1 to continue" gate, offer callers a
  // choice — press 1 to consent to recording, press 2 to continue without it.
  consentOffersRecordingChoice: boolean;
  consentRecordingChoiceMessage: string;

  // Data Retention (null = keep indefinitely)
  dataRetentionDays: number | null;

  // Industry Profile
  industryProfile: IndustryProfile;

  updatedAt: Date;
}

// ─── Industry defaults ────────────────────────────────────────────────────────

export interface IndustryProfileDefaults {
  id: IndustryProfile;
  label: string;
  description: string;
  strictness: 'strict' | 'standard';
  defaults: Omit<ComplianceSettings, 'tenantId' | 'industryProfile' | 'updatedAt'>;
}

export const INDUSTRY_PROFILES: Record<IndustryProfile, IndustryProfileDefaults> = {
  healthcare: {
    id: 'healthcare',
    label: 'Healthcare',
    description: 'Stricter defaults for HIPAA-regulated environments: clinics, dental, chiropractic, veterinary.',
    strictness: 'strict',
    defaults: {
      aiDisclosureEnabled: true,
      aiDisclosureMessage: 'This call is handled by an AI assistant on behalf of our practice.',
      recordingEnabled: false,
      recordingAnnouncementEnabled: true,
      recordingAnnouncementMessage: 'This call may be recorded for quality and training purposes.',
      consentRequired: true,
      consentMessage: 'Press 1 to speak with our AI assistant, or press 2 to leave a message.',
      consentOffersRecordingChoice: false,
      consentRecordingChoiceMessage:
        'If you consent to this call being recorded and transcribed, press 1. To continue without recording, press 2.',
      dataRetentionDays: 2555, // 7 years — HIPAA minimum
    },
  },
  legal: {
    id: 'legal',
    label: 'Legal',
    description: 'Stricter defaults for law offices and legal services. Supports attorney-client privilege awareness.',
    strictness: 'strict',
    defaults: {
      aiDisclosureEnabled: true,
      aiDisclosureMessage: 'This call is handled by an AI assistant. For confidential matters, please request a callback.',
      recordingEnabled: false,
      recordingAnnouncementEnabled: true,
      recordingAnnouncementMessage: 'This call may be recorded for quality and training purposes.',
      consentRequired: true,
      consentMessage: 'Press 1 to continue with our AI assistant, or press 2 to leave a message for an attorney.',
      consentOffersRecordingChoice: false,
      consentRecordingChoiceMessage:
        'If you consent to this call being recorded and transcribed, press 1. To continue without recording, press 2.',
      dataRetentionDays: 2555, // 7 years
    },
  },
  real_estate: {
    id: 'real_estate',
    label: 'Real Estate',
    description: 'Standard defaults for real estate agencies and property management.',
    strictness: 'standard',
    defaults: {
      aiDisclosureEnabled: true,
      aiDisclosureMessage: 'Hi, you have reached our AI assistant.',
      recordingEnabled: false,
      recordingAnnouncementEnabled: true,
      recordingAnnouncementMessage: 'This call may be recorded for quality and training purposes.',
      consentRequired: false,
      consentMessage: 'Press 1 to continue.',
      consentOffersRecordingChoice: false,
      consentRecordingChoiceMessage:
        'If you consent to this call being recorded and transcribed, press 1. To continue without recording, press 2.',
      dataRetentionDays: 365,
    },
  },
  general: {
    id: 'general',
    label: 'General Business',
    description: 'Standard defaults suitable for most industries.',
    strictness: 'standard',
    defaults: {
      aiDisclosureEnabled: true,
      aiDisclosureMessage: 'This call is handled by an AI assistant.',
      recordingEnabled: false,
      recordingAnnouncementEnabled: true,
      recordingAnnouncementMessage: 'This call may be recorded for quality and training purposes.',
      consentRequired: false,
      consentMessage: 'Press 1 to continue.',
      consentOffersRecordingChoice: false,
      consentRecordingChoiceMessage:
        'If you consent to this call being recorded and transcribed, press 1. To continue without recording, press 2.',
      dataRetentionDays: 90,
    },
  },
};

// ─── DB row mapping ───────────────────────────────────────────────────────────

function mapRow(row: Record<string, unknown>): ComplianceSettings {
  return {
    tenantId: String(row.tenant_id),
    aiDisclosureEnabled: Boolean(row.ai_disclosure_enabled),
    aiDisclosureMessage: String(row.ai_disclosure_message ?? ''),
    recordingEnabled: Boolean(row.recording_enabled),
    recordingAnnouncementEnabled: Boolean(row.recording_announcement_enabled),
    recordingAnnouncementMessage: String(row.recording_announcement_message ?? ''),
    consentRequired: Boolean(row.consent_required),
    consentMessage: String(row.consent_message ?? ''),
    consentOffersRecordingChoice: Boolean(row.consent_offers_recording_choice),
    consentRecordingChoiceMessage: String(row.consent_recording_choice_message ?? ''),
    dataRetentionDays: row.data_retention_days != null ? Number(row.data_retention_days) : null,
    industryProfile: (row.industry_profile as IndustryProfile) ?? 'general',
    updatedAt: row.updated_at ? new Date(String(row.updated_at)) : new Date(),
  };
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class ComplianceCenterService {
  /**
   * Get compliance settings for a tenant.
   * Returns industry defaults merged with any stored overrides (or pure
   * defaults for the general profile if no row exists yet).
   */
  async getSettings(tenantId: string): Promise<ComplianceSettings> {
    try {
      const r = await pool.query(
        `SELECT * FROM public.compliance_settings WHERE tenant_id = $1 LIMIT 1`,
        [tenantId]
      );
      if (r.rows.length > 0) {
        return mapRow(r.rows[0] as Record<string, unknown>);
      }
    } catch (err) {
      logger.warn('COMPLIANCE_CENTER_READ_ERROR', { tenantId, error: String(err) });
    }
    // Return general defaults when no row exists
    return this._defaultsForProfile('general', tenantId);
  }

  /**
   * Save compliance settings. Runs a full upsert so the first save creates the row.
   * Also syncs the `data_retention_policies` table when `dataRetentionDays` changes
   * so the retention worker picks it up automatically.
   */
  async upsertSettings(
    tenantId: string,
    patch: Partial<Omit<ComplianceSettings, 'tenantId' | 'updatedAt'>>,
    actorId?: string
  ): Promise<ComplianceSettings> {
    const current = await this.getSettings(tenantId);
    const next: ComplianceSettings = {
      ...current,
      ...patch,
      tenantId,
      updatedAt: new Date(),
    };

    await pool.query(
      `INSERT INTO public.compliance_settings (
         tenant_id,
         ai_disclosure_enabled, ai_disclosure_message,
         recording_enabled,
         recording_announcement_enabled, recording_announcement_message,
         consent_required, consent_message,
         consent_offers_recording_choice, consent_recording_choice_message,
         data_retention_days,
         industry_profile,
         updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,NOW())
       ON CONFLICT (tenant_id) DO UPDATE SET
         ai_disclosure_enabled      = EXCLUDED.ai_disclosure_enabled,
         ai_disclosure_message      = EXCLUDED.ai_disclosure_message,
         recording_enabled          = EXCLUDED.recording_enabled,
         recording_announcement_enabled  = EXCLUDED.recording_announcement_enabled,
         recording_announcement_message  = EXCLUDED.recording_announcement_message,
         consent_required           = EXCLUDED.consent_required,
         consent_message            = EXCLUDED.consent_message,
         consent_offers_recording_choice  = EXCLUDED.consent_offers_recording_choice,
         consent_recording_choice_message = EXCLUDED.consent_recording_choice_message,
         data_retention_days        = EXCLUDED.data_retention_days,
         industry_profile           = EXCLUDED.industry_profile,
         updated_at                 = NOW()`,
      [
        tenantId,
        next.aiDisclosureEnabled,
        next.aiDisclosureMessage,
        next.recordingEnabled,
        next.recordingAnnouncementEnabled,
        next.recordingAnnouncementMessage,
        next.consentRequired,
        next.consentMessage,
        next.consentOffersRecordingChoice,
        next.consentRecordingChoiceMessage,
        next.dataRetentionDays,
        next.industryProfile,
      ]
    );

    // Mark the tenant as compliance-configured so voice gateway reads settings
    await pool.query(
      `UPDATE public.voice_tenants SET compliance_enabled = true WHERE id = $1`,
      [tenantId]
    ).catch(() => { /* column may not exist on older DBs */ });

    // Sync data retention policy so the cleanup worker respects the setting
    if (patch.dataRetentionDays !== undefined) {
      await this._syncRetentionPolicy(tenantId, next.dataRetentionDays).catch((err) => {
        logger.warn('COMPLIANCE_RETENTION_SYNC_ERROR', { tenantId, error: String(err) });
      });
    }

    // Audit trail
    await recordEnterpriseAuditEvent({
      tenantId,
      eventType: 'compliance_settings_updated',
      actorId,
      resourceType: 'compliance_settings',
      resourceId: tenantId,
      payload: patch as Record<string, unknown>,
    }).catch(() => { /* non-fatal */ });

    logger.info('COMPLIANCE_SETTINGS_SAVED', {
      tenantId,
      industryProfile: next.industryProfile,
      recordingEnabled: next.recordingEnabled,
      consentRequired: next.consentRequired,
    });

    return next;
  }

  /**
   * Apply an industry profile's defaults, then save.
   * Overwrites all settings with profile defaults — any custom values are lost.
   * This is the "reset to profile defaults" action.
   */
  async applyIndustryProfile(
    tenantId: string,
    profile: IndustryProfile,
    actorId?: string
  ): Promise<ComplianceSettings> {
    const defaults = this._defaultsForProfile(profile, tenantId);
    return this.upsertSettings(tenantId, { ...defaults, industryProfile: profile }, actorId);
  }

  /**
   * Return the industry profiles currently offered at launch.
   * Healthcare and Legal are excluded — see the module header comment.
   */
  getIndustryProfiles(): IndustryProfileDefaults[] {
    const selectable: SelectableIndustryProfile[] = ['general', 'real_estate'];
    return selectable.map((id) => INDUSTRY_PROFILES[id]);
  }

  /**
   * Build the TwiML <Say> text to play at call start based on compliance settings.
   * Returns null if nothing should be played.
   */
  async buildCallOpeningTwiml(tenantId: string): Promise<{
    aiDisclosure: string | null;
    recordingAnnouncement: string | null;
    consentGate: string | null;
    consentOffersRecordingChoice: boolean;
  }> {
    const s = await this.getSettings(tenantId);
    const offersChoice = s.consentRequired && s.consentOffersRecordingChoice;
    return {
      aiDisclosure: s.aiDisclosureEnabled ? s.aiDisclosureMessage : null,
      // Recording announcement is redundant when the consent-choice prompt
      // already tells the caller recording depends on their input.
      recordingAnnouncement: (s.recordingEnabled && s.recordingAnnouncementEnabled && !offersChoice)
        ? s.recordingAnnouncementMessage
        : null,
      consentGate: s.consentRequired
        ? (offersChoice ? s.consentRecordingChoiceMessage : s.consentMessage)
        : null,
      consentOffersRecordingChoice: offersChoice,
    };
  }

  // ─── Private helpers ────────────────────────────────────────────────────────

  private _defaultsForProfile(profile: IndustryProfile, tenantId: string): ComplianceSettings {
    const p = INDUSTRY_PROFILES[profile] ?? INDUSTRY_PROFILES.general;
    return {
      tenantId,
      ...p.defaults,
      industryProfile: profile,
      updatedAt: new Date(),
    };
  }

  private async _syncRetentionPolicy(
    tenantId: string,
    retentionDays: number | null
  ): Promise<void> {
    if (retentionDays === null) return; // "keep indefinitely" — leave existing policy alone
    await pool.query(
      `INSERT INTO public.data_retention_policies
         (tenant_id, call_recordings_days, call_transcripts_days, lead_data_days,
          sms_messages_days, analytics_days, enabled)
       VALUES ($1, $2, $2, $3, $2, $4, true)
       ON CONFLICT (tenant_id) DO UPDATE SET
         call_recordings_days  = EXCLUDED.call_recordings_days,
         call_transcripts_days = EXCLUDED.call_transcripts_days,
         sms_messages_days     = EXCLUDED.sms_messages_days,
         updated_at            = NOW()`,
      [
        tenantId,
        retentionDays,
        retentionDays * 3,   // lead data: 3× the call window
        retentionDays * 8,   // analytics: 8× the call window
      ]
    );
  }
}

export const complianceCenterService = new ComplianceCenterService();
