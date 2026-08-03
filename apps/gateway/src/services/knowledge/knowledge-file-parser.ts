import { logger } from '../logger.js';

export type KnowledgeUploadEncoding = 'utf8' | 'base64';

/**
 * Extract plain text from uploaded knowledge files (txt/csv/md/pdf/docx).
 */
export async function extractKnowledgeText(
  fileName: string,
  fileType: string,
  content: string,
  encoding: KnowledgeUploadEncoding = 'utf8'
): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  let normalizedType = String(fileType || ext).toLowerCase();
  if (normalizedType === 'md') normalizedType = 'txt';

  if (normalizedType === 'pdf' || ext === 'pdf') {
    return extractPdfText(content, encoding);
  }
  if (normalizedType === 'docx' || ext === 'docx') {
    return extractDocxText(content, encoding);
  }

  if (encoding === 'base64') {
    return Buffer.from(content, 'base64').toString('utf8');
  }
  return content;
}

async function extractPdfText(content: string, encoding: KnowledgeUploadEncoding): Promise<string> {
  const buffer =
    encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
  const { PDFParse } = await import('pdf-parse');
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    const text = String(parsed.text || '').trim();
    if (!text) {
      throw new Error('No readable text found in PDF. Try a text-based PDF or paste content manually.');
    }
    return text;
  } catch (err) {
    logger.warn('PDF_PARSE_FAILED', { error: String(err) });
    throw new Error(
      err instanceof Error ? err.message : 'Could not read PDF. Export as .txt or paste the text.'
    );
  } finally {
    await parser.destroy().catch(() => {});
  }
}

async function extractDocxText(content: string, encoding: KnowledgeUploadEncoding): Promise<string> {
  const buffer =
    encoding === 'base64' ? Buffer.from(content, 'base64') : Buffer.from(content, 'utf8');
  try {
    const mammoth = await import('mammoth');
    const result = await mammoth.extractRawText({ buffer });
    const text = String(result.value || '').trim();
    if (!text) {
      throw new Error('No readable text found in Word document.');
    }
    return text;
  } catch (err) {
    logger.warn('DOCX_PARSE_FAILED', { error: String(err) });
    throw new Error(
      err instanceof Error ? err.message : 'Could not read Word file. Save as .txt or paste the text.'
    );
  }
}
