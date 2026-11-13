import { createHash } from 'node:crypto';
import express, { Router } from 'express';
import { asyncHandler } from '../../middleware/index.js';
import { getTenantId, type CallIqAuthenticatedRequest } from '../auth/tenant-context.js';
import { extractKnowledgeText } from '../knowledge/knowledge-file-parser.js';
import { getTemplate } from './registry.js';
import * as store from './store.js';
import { emitTrigger } from './engine.js';
import { MAX_INPUT_CHARS } from './executors/document-extract.js';
import type { TriggerKind } from './types.js';

/**
 * POST /api/v1/automations/documents (mounted from automation.router.ts): upload a document for an automation that listens for "document.received".
 * multipart/form-data with `file` (PDF, PNG, JPG or plain text, at most 8 MB) and an optional `automation` (default "document-intake"). Needs ops:write.
 * The file is read in memory and handed to the engine as text (or an image data URL); it is NOT stored anywhere.
 * The run id is the file's SHA-256, so the same file uploaded twice runs once. The run itself shows up in the run log.
 */
export const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_BODY_BYTES = MAX_FILE_BYTES + 512 * 1024;

type Kind = 'pdf' | 'png' | 'jpg' | 'text';
const BY_EXTENSION: Record<string, Kind> = { pdf: 'pdf', png: 'png', jpg: 'jpg', jpeg: 'jpg', txt: 'text', csv: 'text', md: 'text' };

export interface DocumentRouterDeps {
  db: () => Promise<store.Db>;
  canWrite: (tenantId: string, userId: string | undefined) => Promise<boolean>;
  getAutomation?: typeof store.getAutomation;
  emit?: typeof emitTrigger;
}

/** The real signature of the bytes, whatever the name or declared type says. */
export function sniffKind(buf: Buffer): Kind | null {
  if (buf.length >= 5 && buf.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.length > 0 && !buf.subarray(0, 8192).includes(0)) return 'text';
  return null;
}

interface Part { name: string; filename?: string; data: Buffer }

/** A small multipart/form-data reader (the gateway has no upload library). Binary safe. */
export function parseMultipart(body: Buffer, contentType: string): Part[] | null {
  const m = /boundary=(?:"([^"]+)"|([^;\s]+))/i.exec(contentType);
  const boundary = m?.[1] ?? m?.[2];
  if (!boundary || boundary.length > 200) return null;
  const delim = Buffer.from(`--${boundary}`);
  const parts: Part[] = [];
  let pos = body.indexOf(delim);
  if (pos < 0) return null;
  for (;;) {
    pos += delim.length;
    if (body.subarray(pos, pos + 2).toString() === '--') break;
    if (body.subarray(pos, pos + 2).toString() === '\r\n') pos += 2;
    const next = body.indexOf(Buffer.from(`\r\n--${boundary}`), pos);
    if (next < 0) return null;
    const chunk = body.subarray(pos, next);
    const headEnd = chunk.indexOf('\r\n\r\n');
    if (headEnd >= 0) {
      const head = chunk.subarray(0, headEnd).toString('utf8');
      const disp = /content-disposition:[^\r\n]*/i.exec(head)?.[0] ?? '';
      const name = /\bname="([^"]*)"/i.exec(disp)?.[1];
      const filename = /\bfilename="([^"]*)"/i.exec(disp)?.[1];
      if (name !== undefined) parts.push({ name, filename, data: chunk.subarray(headEnd + 4) });
    }
    pos = next + 2;
  }
  return parts;
}

export function createDocumentRouter(deps: DocumentRouterDeps): Router {
  const router = Router();
  const getAutomation = deps.getAutomation ?? store.getAutomation;
  const emit = deps.emit ?? emitTrigger;
  const fail = (res: any, code: number, error: string) => res.status(code).json({ success: false, error });

  const rawBody = express.raw({ type: () => true, limit: MAX_BODY_BYTES });

  router.post('/', (req: any, res: any, next: any) => {
    // Permission and the automation's state are checked before the file is even read.
    (async () => {
      let tenantId: string;
      try {
        tenantId = getTenantId(req);
      } catch {
        return fail(res, 400, 'Tenant required');
      }
      const ok = await deps.canWrite(tenantId, (req as CallIqAuthenticatedRequest).tenant?.userId).catch(() => false);
      if (!ok) return fail(res, 403, 'You do not have permission to change automations');
      (req as any).docTenantId = tenantId;
      next();
    })().catch(next);
  }, (req: any, res: any, next: any) => {
    const ct = String(req.headers['content-type'] ?? '');
    if (!/^multipart\/form-data/i.test(ct)) return fail(res, 415, 'Send the document as a form upload (multipart/form-data) in a field called "file"');
    rawBody(req, res, (err?: any) => {
      if (err?.type === 'entity.too.large' || err?.status === 413) return fail(res, 413, 'The file is too large (at most 8 MB)');
      if (err) return fail(res, 400, 'The upload could not be read');
      next();
    });
  }, asyncHandler(async (req: any, res: any) => {
    const tenantId = (req as any).docTenantId as string;
    const body: unknown = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) return fail(res, 400, 'No file was received');
    const parts = parseMultipart(body, String(req.headers['content-type']));
    if (!parts) return fail(res, 400, 'The upload could not be read');

    const field = parts.find((p) => p.name === 'automation' && p.filename === undefined);
    const key = field ? field.data.toString('utf8').trim() : 'document-intake';
    const template = getTemplate(key || 'document-intake');
    if (!template || (template.trigger as TriggerKind) !== 'document.received') return fail(res, 400, 'That automation does not read documents');
    const automation = await getAutomation(await deps.db(), tenantId, template.key);
    if (!automation || !automation.enabled) return fail(res, 409, 'Switch this automation on before uploading documents');

    const file = parts.find((p) => p.name === 'file' && p.filename !== undefined);
    if (!file || file.data.length === 0) return fail(res, 400, 'Choose a file to upload');
    if (file.data.length > MAX_FILE_BYTES) return fail(res, 413, 'The file is too large (at most 8 MB)');
    const fileName = file.filename!.replace(/[\u0000-\u001f\\/]/g, '_').slice(0, 200) || 'document';
    const ext = fileName.includes('.') ? fileName.split('.').pop()!.toLowerCase() : '';
    const expected = BY_EXTENSION[ext];
    if (!expected) return fail(res, 415, 'Upload a PDF, PNG, JPG or plain text file');
    const actual = sniffKind(file.data);
    if (actual !== expected) return fail(res, 415, 'The file does not look like what its name says. Upload a real PDF, PNG, JPG or plain text file');

    const payload: Record<string, unknown> = { fileName };
    if (actual === 'png' || actual === 'jpg') {
      payload.imageDataUrl = `data:image/${actual === 'png' ? 'png' : 'jpeg'};base64,${file.data.toString('base64')}`;
    } else {
      try {
        const text = actual === 'pdf'
          ? await extractKnowledgeText(fileName, 'pdf', file.data.toString('base64'), 'base64')
          : file.data.toString('utf8');
        payload.text = text.trim().slice(0, MAX_INPUT_CHARS);
      } catch {
        return fail(res, 422, 'No readable text was found in that file. Try a text-based PDF or a photo of the document');
      }
      if (!payload.text) return fail(res, 422, 'No readable text was found in that file');
    }

    const ref = createHash('sha256').update(file.data).digest('hex');
    await emit(tenantId, 'document.received', ref, payload);
    res.json({ success: true, data: { ref } });
  }));

  return router;
}
