/**
 * BAA PDF Generator
 *
 * Generates a real, attorney-template Business Associate Agreement PDF for
 * Halla AI Enterprise tenants. The document is stored in Supabase Storage
 * under the private `baa-documents` bucket and a signed URL is returned.
 *
 * The legal text follows the HHS model BAA language (42 CFR §164.504(e))
 * and is parameterised with the signing party's details.
 *
 * NOTE: This is a template document. Have your attorney review the final
 * text before using it in production with healthcare clients.
 */

import PDFDocument from 'pdfkit';
import { createClient } from '@supabase/supabase-js';
import { logger } from '../logger.js';

// ─── Supabase storage client (service-role) ───────────────────────────────────

function getStorageClient() {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
  return createClient(url, key);
}

const BAA_BUCKET = 'baa-documents';
const SIGNED_URL_TTL_SEC = 60 * 60 * 24 * 7; // 7 days — client has a week to download

// ─── Input / output types ─────────────────────────────────────────────────────

export interface BaaSigningInput {
  tenantId: string;
  tenantName: string;        // Business / covered entity name
  signedBy: string;          // Full name of signer
  signedByEmail: string;
  signedByTitle?: string;    // e.g. "Chief Compliance Officer"
  ipAddress?: string;
  version: string;           // BAA document version e.g. "1.0"
}

export interface BaaDocumentResult {
  storagePath: string;       // path inside the bucket
  signedUrl: string;         // 7-day pre-signed download URL
  generatedAt: string;       // ISO timestamp
  sha256: string;            // hex digest of the PDF bytes (tamper-evidence)
}

// ─── BAA legal text ───────────────────────────────────────────────────────────
// Based on the HHS model Business Associate Agreement (updated 2013 Omnibus Rule).

const RECITALS = `\
RECITALS

Covered Entity is a "covered entity" as that term is defined in 45 CFR § 160.103.

Business Associate provides services to Covered Entity that involve the Use and/or Disclosure of Protected Health Information ("PHI") within the meaning of the Health Insurance Portability and Accountability Act of 1996 and implementing regulations (collectively "HIPAA"), as amended by the Health Information Technology for Economic and Clinical Health Act of 2009 ("HITECH Act") and its implementing regulations.

The parties wish to enter into this Agreement in order to satisfy the requirements of 45 CFR § 164.504(e) and to protect the privacy, security, and confidentiality of PHI.`;

const DEFINITIONS = `\
1. DEFINITIONS

1.1 "Breach" has the meaning given in 45 CFR § 164.402.

1.2 "Business Associate" means Halla AI Labs, Inc., a provider of AI-powered voice receptionist and call management services.

1.3 "Covered Entity" means the healthcare provider or plan identified in the signature block of this Agreement.

1.4 "Data Aggregation" has the meaning given in 45 CFR § 164.501.

1.5 "Designated Record Set" has the meaning given in 45 CFR § 164.501.

1.6 "Disclosure" has the meaning given in 45 CFR § 160.103.

1.7 "Electronic Protected Health Information" or "ePHI" means Protected Health Information that is transmitted by, or maintained in, electronic media.

1.8 "HIPAA Rules" means the Privacy, Security, Breach Notification, and Enforcement Rules at 45 CFR Parts 160 and 164.

1.9 "Protected Health Information" or "PHI" has the meaning given in 45 CFR § 160.103.

1.10 "Security Incident" has the meaning given in 45 CFR § 164.304.

1.11 "Subcontractor" has the meaning given in 45 CFR § 160.103.

1.12 "Unsecured Protected Health Information" has the meaning given in 45 CFR § 164.402.

1.13 "Use" has the meaning given in 45 CFR § 160.103.`;

const OBLIGATIONS_BA = `\
2. OBLIGATIONS AND ACTIVITIES OF BUSINESS ASSOCIATE

2.1 Use and Disclosure. Business Associate agrees not to Use or Disclose PHI other than as permitted or required by this Agreement or as Required by Law.

2.2 Appropriate Safeguards. Business Associate agrees to use appropriate safeguards, and to comply with Subpart C of 45 CFR Part 164 with respect to ePHI, to prevent Use or Disclosure of PHI other than as provided for by this Agreement.

2.3 Reporting. Business Associate agrees to report to Covered Entity any Use or Disclosure of PHI not provided for by this Agreement of which it becomes aware, including Breaches of Unsecured PHI as required by 45 CFR § 164.410, and any Security Incident of which it becomes aware.

2.4 Subcontractors. Business Associate agrees to ensure that any Subcontractors that create, receive, maintain, or transmit PHI on behalf of Business Associate agree to the same restrictions, conditions, and requirements that apply to Business Associate with respect to such information.

2.5 Access to PHI. Within fifteen (15) days of receipt of a written request from Covered Entity, Business Associate agrees to provide access to PHI in a Designated Record Set to Covered Entity.

2.6 Amendment of PHI. Within fifteen (15) days of receipt of a written request from Covered Entity, Business Associate agrees to make available PHI for amendment and to incorporate any amendments to PHI in a Designated Record Set.

2.7 Accounting of Disclosures. Within fifteen (15) days of receipt of a written request from Covered Entity, Business Associate agrees to make available information required to provide an accounting of Disclosures.

2.8 HIPAA Rules Compliance. To the extent Business Associate carries out obligations of Covered Entity under the HIPAA Rules, Business Associate agrees to comply with the requirements of the HIPAA Rules that apply to Covered Entity in the performance of such obligations.

2.9 Availability of Books and Records. Business Associate agrees to make its internal practices, books, and records available to the Secretary of the Department of Health and Human Services for purposes of determining compliance with the HIPAA Rules.`;

const PERMITTED_USES = `\
3. PERMITTED USES AND DISCLOSURES BY BUSINESS ASSOCIATE

3.1 Business Associate may Use or Disclose PHI only:

   (a) As necessary to perform the services described in the underlying services agreement between the parties;

   (b) As required by law;

   (c) For the proper management and administration of Business Associate, provided that Disclosures are Required by Law, or Business Associate obtains reasonable assurances that the PHI will be held confidentially and used only for the purpose for which it was disclosed;

   (d) To provide Data Aggregation services to Covered Entity, if applicable.

3.2 Business Associate shall not directly or indirectly receive remuneration in exchange for PHI without valid authorisation from the individual, except as permitted under 45 CFR § 164.502(a)(5)(ii).`;

const OBLIGATIONS_CE = `\
4. OBLIGATIONS OF COVERED ENTITY

4.1 Covered Entity shall notify Business Associate of any limitation in its notice of privacy practices, to the extent such limitation may affect Business Associate's Use or Disclosure of PHI.

4.2 Covered Entity shall notify Business Associate of any changes in, or revocation of, permission by individuals to use or disclose PHI, to the extent such change may affect Business Associate's Use or Disclosure.

4.3 Covered Entity shall not request Business Associate to Use or Disclose PHI in any manner that would not be permissible under the HIPAA Rules if done by Covered Entity.`;

const TERM_TERMINATION = `\
5. TERM AND TERMINATION

5.1 Term. This Agreement shall be effective as of the date of electronic acceptance and shall terminate when all PHI provided by Covered Entity to Business Associate, or created, maintained, or received by Business Associate on behalf of Covered Entity, is destroyed or returned to Covered Entity, or, if it is not feasible to return or destroy PHI, protections are extended to such information, in accordance with the termination provisions in this Section.

5.2 Termination for Cause. If either party knows of a material breach by the other party, the non-breaching party may terminate this Agreement upon thirty (30) days written notice if the breach is not cured within that period.

5.3 Effect of Termination. Upon termination of this Agreement for any reason, Business Associate agrees to return or destroy all PHI received from, or created or received by Business Associate on behalf of, Covered Entity. This provision shall apply to PHI in the possession of Subcontractors. Business Associate shall retain no copies of PHI after termination.

5.4 Survival. The obligations of Business Associate under this Section shall survive termination of this Agreement.`;

const MISCELLANEOUS = `\
6. MISCELLANEOUS

6.1 Regulatory References. A reference in this Agreement to a section in the HIPAA Rules means the section as in effect or as amended.

6.2 Amendment. The parties agree to take such action as is necessary to amend this Agreement from time to time as is necessary for compliance with the requirements of the HIPAA Rules and any other applicable law.

6.3 Interpretation. Any ambiguity in this Agreement shall be resolved in favour of a meaning that permits Covered Entity and Business Associate to comply with the HIPAA Rules.

6.4 No Third-Party Beneficiaries. Nothing in this Agreement shall create or be deemed to create any third-party beneficiary rights.

6.5 Entire Agreement. This Agreement constitutes the entire agreement between the parties relating to the privacy and security of PHI and supersedes all prior agreements, written or oral, relating thereto.

6.6 Governing Law. This Agreement shall be governed by and construed in accordance with the federal laws of the United States of America applicable to contracts made and to be performed therein.`;

// ─── PDF generation ───────────────────────────────────────────────────────────

export async function generateBaaPdf(input: BaaSigningInput): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: 72, bottom: 72, left: 72, right: 72 },
      info: {
        Title: 'Business Associate Agreement — Halla AI',
        Author: 'Halla AI Labs, Inc.',
        Subject: 'HIPAA Business Associate Agreement',
        Keywords: 'HIPAA, BAA, Business Associate Agreement, PHI',
        CreationDate: new Date(),
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
    const ACCENT   = '#1a3a6e'; // dark navy
    const LIGHT    = '#f0f4fa';
    const GRAY     = '#555555';
    const BLACK    = '#111111';

    // ── Header bar ──────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 90).fill(ACCENT);
    doc.fillColor('#ffffff')
       .fontSize(20).font('Helvetica-Bold')
       .text('CALL IQ', doc.page.margins.left, 28, { align: 'left' });
    doc.fontSize(10).font('Helvetica')
       .text('BUSINESS ASSOCIATE AGREEMENT', doc.page.margins.left, 54, { align: 'left' });
    doc.fontSize(9)
       .text(`Document Version ${input.version}  ·  HIPAA 45 CFR §164.504(e)`,
             doc.page.margins.left, 68, { align: 'left' });

    doc.moveDown(3.5);

    // ── Parties banner ───────────────────────────────────────────────────────
    doc.rect(doc.page.margins.left, doc.y, pageWidth, 54).fill(LIGHT);
    doc.fillColor(ACCENT).fontSize(9).font('Helvetica-Bold')
       .text('PARTIES', doc.page.margins.left + 12, doc.y + 8);
    doc.fillColor(BLACK).fontSize(9).font('Helvetica')
       .text(
         `Covered Entity: ${input.tenantName}   |   Business Associate: Halla AI Labs, Inc.`,
         doc.page.margins.left + 12, doc.y + 2
       );
    doc.fontSize(8).fillColor(GRAY)
       .text(
         `Effective date: ${new Date(input.version === '1.0' ? Date.now() : Date.now()).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}`,
         doc.page.margins.left + 12, doc.y + 2
       );
    doc.moveDown(2);

    // ── Helper: section heading ──────────────────────────────────────────────
    const section = (title: string) => {
      doc.moveDown(0.6);
      doc.fillColor(ACCENT).fontSize(10).font('Helvetica-Bold').text(title);
      doc.moveTo(doc.page.margins.left, doc.y + 2)
         .lineTo(doc.page.margins.left + pageWidth, doc.y + 2)
         .strokeColor(ACCENT).lineWidth(0.5).stroke();
      doc.moveDown(0.4);
    };

    // ── Helper: body text ────────────────────────────────────────────────────
    const body = (text: string) => {
      doc.fillColor(BLACK).fontSize(9).font('Helvetica')
         .text(text, { align: 'justify', lineGap: 2 });
    };

    // ── Content ──────────────────────────────────────────────────────────────
    section('RECITALS');
    body(RECITALS.replace('RECITALS\n\n', ''));

    section('1. DEFINITIONS');
    body(DEFINITIONS.replace('1. DEFINITIONS\n\n', ''));

    section('2. OBLIGATIONS AND ACTIVITIES OF BUSINESS ASSOCIATE');
    body(OBLIGATIONS_BA.replace('2. OBLIGATIONS AND ACTIVITIES OF BUSINESS ASSOCIATE\n\n', ''));

    section('3. PERMITTED USES AND DISCLOSURES BY BUSINESS ASSOCIATE');
    body(PERMITTED_USES.replace('3. PERMITTED USES AND DISCLOSURES BY BUSINESS ASSOCIATE\n\n', ''));

    section('4. OBLIGATIONS OF COVERED ENTITY');
    body(OBLIGATIONS_CE.replace('4. OBLIGATIONS OF COVERED ENTITY\n\n', ''));

    section('5. TERM AND TERMINATION');
    body(TERM_TERMINATION.replace('5. TERM AND TERMINATION\n\n', ''));

    section('6. MISCELLANEOUS');
    body(MISCELLANEOUS.replace('6. MISCELLANEOUS\n\n', ''));

    // ── Signature block ──────────────────────────────────────────────────────
    doc.addPage();

    // Top of signature page header
    doc.rect(0, 0, doc.page.width, 46).fill(ACCENT);
    doc.fillColor('#ffffff').fontSize(10).font('Helvetica-Bold')
       .text('SIGNATURE PAGE — BUSINESS ASSOCIATE AGREEMENT', doc.page.margins.left, 16);

    doc.moveDown(3);

    const sigY = doc.y;
    const colW = (pageWidth - 24) / 2;

    // Left column — Covered Entity
    doc.rect(doc.page.margins.left, sigY, colW, 200).fill(LIGHT);
    doc.fillColor(ACCENT).fontSize(9).font('Helvetica-Bold')
       .text('COVERED ENTITY', doc.page.margins.left + 12, sigY + 12);
    doc.fillColor(BLACK).fontSize(9).font('Helvetica');

    const ceLines = [
      ['Legal name:', input.tenantName],
      ['Signed by:', input.signedBy],
      ['Title:', input.signedByTitle || 'Authorized Representative'],
      ['Email:', input.signedByEmail],
      ['Date:', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
      ['IP address:', input.ipAddress || 'not recorded'],
      ['Method:', 'Electronic acceptance via Halla AI dashboard'],
    ];

    let lineY = sigY + 32;
    for (const [label, value] of ceLines) {
      doc.font('Helvetica-Bold').text(label, doc.page.margins.left + 12, lineY, { continued: true, width: 90 });
      doc.font('Helvetica').text(` ${value}`, { width: colW - 115 });
      lineY += 18;
    }

    // Signature line
    doc.moveTo(doc.page.margins.left + 12, sigY + 165)
       .lineTo(doc.page.margins.left + colW - 12, sigY + 165)
       .strokeColor('#999999').lineWidth(0.75).stroke();
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text('Electronic signature — see metadata above', doc.page.margins.left + 12, sigY + 170);

    // Right column — Business Associate (Halla AI)
    const rightX = doc.page.margins.left + colW + 24;
    doc.rect(rightX, sigY, colW, 200).fill(LIGHT);
    doc.fillColor(ACCENT).fontSize(9).font('Helvetica-Bold')
       .text('BUSINESS ASSOCIATE', rightX + 12, sigY + 12);
    doc.fillColor(BLACK).fontSize(9).font('Helvetica');

    const baLines = [
      ['Legal name:', 'Halla AI Labs, Inc.'],
      ['Signed by:', 'Authorized Officer'],
      ['Title:', 'Chief Executive Officer'],
      ['Email:', 'legal@calliqlabs.ai'],
      ['Date:', new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })],
      ['Version:', input.version],
    ];

    lineY = sigY + 32;
    for (const [label, value] of baLines) {
      doc.font('Helvetica-Bold').text(label, rightX + 12, lineY, { continued: true, width: 90 });
      doc.font('Helvetica').text(` ${value}`, { width: colW - 115 });
      lineY += 18;
    }

    doc.moveTo(rightX + 12, sigY + 165)
       .lineTo(rightX + colW - 12, sigY + 165)
       .strokeColor('#999999').lineWidth(0.75).stroke();
    doc.fillColor(GRAY).fontSize(8).font('Helvetica')
       .text('Authorized by Halla AI Terms of Service', rightX + 12, sigY + 170);

    // ── Verification footer ──────────────────────────────────────────────────
    doc.moveDown(14);
    doc.rect(doc.page.margins.left, doc.y, pageWidth, 64).fill('#fff8e1');
    const verifyY = doc.y + 8;
    doc.fillColor('#7c5a00').fontSize(8).font('Helvetica-Bold')
       .text('DOCUMENT VERIFICATION', doc.page.margins.left + 12, verifyY);
    doc.font('Helvetica').fillColor('#555')
       .text(
         'This document was electronically generated and signed via the Halla AI Enterprise dashboard. ' +
         'The SHA-256 hash of this PDF is recorded in Halla AI\'s immutable audit log alongside the ' +
         'signer\'s IP address, email, and timestamp. This record constitutes a valid electronic ' +
         'signature pursuant to the Electronic Signatures in Global and National Commerce Act (E-SIGN), ' +
         '15 U.S.C. § 7001 et seq.',
         doc.page.margins.left + 12, verifyY + 14,
         { width: pageWidth - 24, lineGap: 1.5 }
       );

    // ── Page numbers ─────────────────────────────────────────────────────────
    const totalPages = (doc.bufferedPageRange().start + doc.bufferedPageRange().count);
    for (let i = 0; i < totalPages; i++) {
      doc.switchToPage(i);
      doc.fillColor(GRAY).fontSize(7).font('Helvetica')
         .text(
           `Halla AI BAA v${input.version}  ·  Tenant: ${input.tenantId}  ·  Page ${i + 1} of ${totalPages}  ·  Confidential`,
           doc.page.margins.left,
           doc.page.height - 40,
           { align: 'center', width: pageWidth }
         );
    }

    doc.end();
  });
}

// ─── Storage helpers ──────────────────────────────────────────────────────────

/**
 * Upload BAA PDF bytes to Supabase Storage and return a signed download URL.
 * Storage path: baa-documents/{tenantId}/{version}/{timestamp}.pdf
 */
export async function storeBaaPdf(
  tenantId: string,
  version: string,
  pdfBytes: Buffer
): Promise<{ storagePath: string; signedUrl: string }> {
  const supabase = getStorageClient();
  const timestamp = Date.now();
  const storagePath = `${tenantId}/${version}/${timestamp}.pdf`;

  const { error: uploadError } = await supabase.storage
    .from(BAA_BUCKET)
    .upload(storagePath, pdfBytes, {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '3600',
    });

  if (uploadError) {
    // Bucket might not exist yet — try creating it then retry
    if (uploadError.message?.includes('Bucket not found') ||
        uploadError.message?.includes('bucket') ) {
      logger.warn('BAA_BUCKET_NOT_FOUND — attempting to create', { bucket: BAA_BUCKET });
      const { error: createErr } = await supabase.storage.createBucket(BAA_BUCKET, {
        public: false,
        fileSizeLimit: 10 * 1024 * 1024, // 10 MB
      });
      if (createErr && !createErr.message?.includes('already exists')) {
        throw new Error(`Cannot create BAA storage bucket: ${createErr.message}`);
      }
      const { error: retryErr } = await supabase.storage
        .from(BAA_BUCKET)
        .upload(storagePath, pdfBytes, { contentType: 'application/pdf', upsert: false });
      if (retryErr) throw new Error(`BAA upload failed after bucket create: ${retryErr.message}`);
    } else {
      throw new Error(`BAA PDF upload failed: ${uploadError.message}`);
    }
  }

  const { data: urlData, error: urlError } = await supabase.storage
    .from(BAA_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);

  if (urlError || !urlData?.signedUrl) {
    throw new Error(`Failed to create signed URL for BAA: ${urlError?.message ?? 'unknown'}`);
  }

  return { storagePath, signedUrl: urlData.signedUrl };
}

/**
 * Generate a fresh signed download URL for an existing BAA document.
 * Used by the download endpoint so URLs stay valid on-demand.
 */
export async function refreshBaaSignedUrl(storagePath: string): Promise<string> {
  const supabase = getStorageClient();
  const { data, error } = await supabase.storage
    .from(BAA_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL_SEC);
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to refresh BAA signed URL: ${error?.message ?? 'unknown'}`);
  }
  return data.signedUrl;
}

/**
 * Compute SHA-256 hex digest of PDF bytes for tamper-evidence audit record.
 */
export async function hashPdfBytes(bytes: Buffer): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(bytes).digest('hex');
}
