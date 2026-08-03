import { pool } from '../db/pool.js';
import { logger } from '../logger.js';
import { billingService } from '../billing/billing.service.js';

const BAA_VERSION = '1.0';

export interface HipaaStatus {
  hipaaEnabled: boolean;
  baaSigned: boolean;
  baaSignedAt?: string;
  baaSignedBy?: string;
  documentUrl?: string;
  canEnable: boolean;
  plan: string;
}

export async function getHipaaStatus(tenantId: string): Promise<HipaaStatus> {
  const sub = await billingService.getSubscription(tenantId);
  const plan = sub?.status === 'trialing' ? 'trial' : (sub?.plan || 'essential');
  const canEnable = false; // HIPAA not available on any current plan

  const tenantRow = await pool.query(
    `SELECT hipaa_enabled FROM public.voice_tenants WHERE id = $1`,
    [tenantId]
  );
  const baaRow = await pool.query(
    `SELECT signed_by, signed_at, document_url FROM public.baa_agreements
     WHERE tenant_id = $1 ORDER BY signed_at DESC LIMIT 1`,
    [tenantId]
  );

  const baa = baaRow.rows[0];

  // Resolve download URL — storage:// paths are refreshed to a signed URL on every status call
  let documentUrl: string | undefined = baa?.document_url;
  if (documentUrl?.startsWith('storage://')) {
    const storagePath = documentUrl.replace('storage://', '');
    try {
      const { refreshBaaSignedUrl } = await import('./baa-pdf.service.js');
      documentUrl = await refreshBaaSignedUrl(storagePath);
    } catch (err) {
      logger.warn('BAA_SIGNED_URL_REFRESH_FAILED', { tenantId, error: String(err) });
      documentUrl = undefined; // don't expose broken path
    }
  }

  return {
    hipaaEnabled: Boolean(tenantRow.rows[0]?.hipaa_enabled),
    baaSigned: Boolean(baa),
    baaSignedAt: baa?.signed_at,
    baaSignedBy: baa?.signed_by,
    documentUrl,
    canEnable,
    plan,
  };
}

export async function signBaa(input: {
  tenantId: string;
  signedBy: string;
  signedByEmail: string;
  signedByTitle?: string;
  tenantName?: string;
  ipAddress?: string;
}): Promise<{ documentUrl: string; signedAt: string; storagePath: string }> {
  const _sub = await billingService.getSubscription(input.tenantId);
  // BAA signing is not currently available on any plan
  throw new Error('BAA signing is not currently available on any plan');

  // Resolve the business name for the PDF
  let tenantName = input.tenantName || 'Covered Entity';
  if (!input.tenantName) {
    try {
      const row = await pool.query(
        `SELECT company_name FROM public.voice_tenants WHERE id = $1 LIMIT 1`,
        [input.tenantId]
      );
      if (row.rows[0]?.company_name) tenantName = String(row.rows[0].company_name);
    } catch { /* non-fatal — use default */ }
  }

  const signedAt = new Date().toISOString();

  // ── Generate real PDF ──────────────────────────────────────────────────────
  const { generateBaaPdf, storeBaaPdf, hashPdfBytes } = await import('./baa-pdf.service.js');

  const pdfBytes = await generateBaaPdf({
    tenantId: input.tenantId,
    tenantName,
    signedBy: input.signedBy,
    signedByEmail: input.signedByEmail,
    signedByTitle: input.signedByTitle,
    ipAddress: input.ipAddress,
    version: BAA_VERSION,
  });

  const sha256 = await hashPdfBytes(pdfBytes);
  const { storagePath } = await storeBaaPdf(input.tenantId, BAA_VERSION, pdfBytes);

  // Store canonical storage path (not the signed URL which expires)
  const documentUrl = `storage://${storagePath}`;

  await pool.query(
    `INSERT INTO public.baa_agreements
       (tenant_id, signed_by, signed_by_email, ip_address, document_url, version)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [
      input.tenantId,
      input.signedBy,
      input.signedByEmail,
      input.ipAddress || null,
      documentUrl,
      BAA_VERSION,
    ]
  );

  try {
    await pool.query(
      `INSERT INTO public.enterprise_audit_events
         (tenant_id, event_type, actor_id, resource_type, resource_id, payload)
       VALUES ($1, 'baa_signed', $2, 'baa_agreement', $3, $4::jsonb)`,
      [
        input.tenantId,
        input.signedByEmail,
        input.tenantId,
        JSON.stringify({
          version: BAA_VERSION,
          storagePath,
          sha256,
          signedBy: input.signedBy,
          signedByEmail: input.signedByEmail,
          ipAddress: input.ipAddress || 'unknown',
        }),
      ]
    );
  } catch (err) {
    logger.warn('BAA audit event insert failed', { tenantId: input.tenantId, error: String(err) });
  }

  logger.info('BAA_SIGNED', {
    tenantId: input.tenantId,
    signedByEmail: input.signedByEmail,
    storagePath,
    sha256: sha256.slice(0, 16) + '…',
  });

  return { documentUrl, signedAt, storagePath };
}

export async function enableHipaaMode(tenantId: string): Promise<void> {
  const status = await getHipaaStatus(tenantId);
  if (!status.canEnable) throw new Error('HIPAA mode is not currently available on any plan');
  if (!status.baaSigned) throw new Error('Sign the BAA before enabling HIPAA mode');

  // Validate that all required sub-processor BAAs have been acknowledged.
  await assertSubprocessorBaas(tenantId);

  await pool.query(`UPDATE public.voice_tenants SET hipaa_enabled = true WHERE id = $1`, [tenantId]);

  try {
    await pool.query(
      `INSERT INTO public.data_retention_policies (tenant_id, resource_type, retention_days, compliance_requirement)
       VALUES ($1, 'call_transcript', 2555, 'HIPAA')
       ON CONFLICT (tenant_id, resource_type) DO UPDATE SET retention_days = 2555, compliance_requirement = 'HIPAA'`,
      [tenantId]
    );
  } catch {
    /* retention table optional on older DBs */
  }
}

/**
 * Required sub-processors that must have a signed BAA before PHI can be
 * transmitted. Operators acknowledge these in the HIPAA settings UI.
 */
const REQUIRED_SUBPROCESSORS = ['openai', 'deepgram', 'elevenlabs', 'twilio'] as const;

/**
 * Validate that the operator has acknowledged HIPAA BAAs for all required
 * sub-processors. Throws if any are missing.
 */
export async function assertSubprocessorBaas(tenantId: string): Promise<void> {
  let rows: Array<{ processor: string; acknowledged: boolean }> = [];
  try {
    const r = await pool.query(
      `SELECT processor, acknowledged FROM public.hipaa_subprocessor_baa
       WHERE tenant_id = $1`,
      [tenantId]
    );
    rows = r.rows;
  } catch {
    // Table may not exist on older deployments — skip validation with a warning.
    logger.warn('HIPAA_SUBPROCESSOR_TABLE_MISSING', {
      tenantId,
      hint: 'Apply supabase/migrations/044_hipaa_compliance_hardening.sql',
    });
    return;
  }

  const acknowledged = new Set(
    rows.filter((r) => r.acknowledged).map((r) => r.processor)
  );
  const missing = REQUIRED_SUBPROCESSORS.filter((p) => !acknowledged.has(p));

  if (missing.length > 0) {
    throw new Error(
      `HIPAA mode requires BAA acknowledgment for all sub-processors. ` +
      `Missing: ${missing.join(', ')}. ` +
      `Update these in Settings → Compliance → Sub-processor BAAs.`
    );
  }
}

/**
 * Get sub-processor BAA status for a tenant.
 */
export async function getSubprocessorBaaStatus(
  tenantId: string
): Promise<Array<{ processor: string; acknowledged: boolean; acknowledgedAt?: string }>> {
  try {
    const r = await pool.query(
      `SELECT processor, acknowledged, acknowledged_at
       FROM public.hipaa_subprocessor_baa
       WHERE tenant_id = $1
       ORDER BY processor`,
      [tenantId]
    );
    const found = r.rows.map((row: any) => ({
      processor: row.processor as string,
      acknowledged: Boolean(row.acknowledged),
      acknowledgedAt: (row.acknowledged_at as string | null) ?? undefined,
    }));
    // Ensure all required processors appear in the response (even if not yet saved)
    const map = new Map<string, { processor: string; acknowledged: boolean; acknowledgedAt?: string }>(
      found.map((f) => [f.processor, f])
    );
    return REQUIRED_SUBPROCESSORS.map((p) => map.get(p) ?? { processor: p, acknowledged: false });
  } catch {
    return REQUIRED_SUBPROCESSORS.map((p) => ({ processor: p, acknowledged: false }));
  }
}

/**
 * Acknowledge a sub-processor BAA.
 */
export async function acknowledgeSubprocessorBaa(
  tenantId: string,
  processor: string,
  acknowledgedBy: string
): Promise<void> {
  await pool.query(
    `INSERT INTO public.hipaa_subprocessor_baa
       (tenant_id, processor, acknowledged, acknowledged_by, acknowledged_at)
     VALUES ($1, $2, true, $3, NOW())
     ON CONFLICT (tenant_id, processor) DO UPDATE
       SET acknowledged = true,
           acknowledged_by = EXCLUDED.acknowledged_by,
           acknowledged_at = NOW(),
           updated_at = NOW()`,
    [tenantId, processor, acknowledgedBy]
  );
  logger.info('HIPAA_SUBPROCESSOR_BAA_ACKNOWLEDGED', { tenantId, processor, acknowledgedBy });
}

export async function disableHipaaMode(tenantId: string): Promise<void> {
  await pool.query(`UPDATE public.voice_tenants SET hipaa_enabled = false WHERE id = $1`, [tenantId]);
}

export async function assertHipaaTenant(tenantId: string): Promise<boolean> {
  const { rows } = await pool.query(
    `SELECT hipaa_enabled FROM public.voice_tenants WHERE id = $1`,
    [tenantId]
  );
  return Boolean(rows[0]?.hipaa_enabled);
}

export async function validateIndustryForHipaa(tenantId: string, industry: string): Promise<void> {
  const hipaaIndustries = new Set(['clinic', 'dental', 'chiropractic', 'veterinary']);
  if (!hipaaIndustries.has(industry)) return;

  const status = await getHipaaStatus(tenantId);
  if (!status.canEnable || !status.baaSigned || !status.hipaaEnabled) {
    throw new Error('Medical industries require a signed BAA and HIPAA mode enabled, which are not currently available on any plan');
  }
}
