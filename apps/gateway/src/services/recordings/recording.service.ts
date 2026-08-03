import { pool } from '../db/pool.js';
import { assertHipaaTenant } from '../compliance/hipaa.service.js';

/**
 * Recording Service
 * Handles call recording storage, retrieval, and transcript management
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const supabase = createClient(supabaseUrl, supabaseKey);

// ─── PII redaction helpers ────────────────────────────────────────────────────
const PII_PATTERNS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\b\d{3}-\d{2}-\d{4}\b/g, label: '[SSN]' },
  { pattern: /\b\d{4}[- ]?\d{4}[- ]?\d{4}[- ]?\d{4}\b/g, label: '[CARD]' },
  { pattern: /\b\d{3}[-.·]?\d{3}[-.·]?\d{4}\b/g, label: '[PHONE]' },
  { pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g, label: '[EMAIL]' },
];

/**
 * Redact common PII patterns from a transcript string before persistence.
 * This is a best-effort scan — not a substitute for proper de-identification
 * on HIPAA-enabled tenants.
 */
function redactTranscriptPii(text: string): string {
  let result = text;
  for (const { pattern, label } of PII_PATTERNS) {
    result = result.replace(pattern, label);
  }
  return result;
}

/**
 * Return a short-lived signed URL for a recording file instead of a public URL.
 * Signed URLs expire after RECORDING_URL_TTL_SECONDS (default 3600 s / 1 hour).
 */
async function getSignedRecordingUrl(fileName: string): Promise<string> {
  const ttl = Number(process.env.RECORDING_URL_TTL_SECONDS || 3600);
  const { data, error } = await supabase.storage
    .from('call-recordings')
    .createSignedUrl(fileName, ttl);
  if (error || !data?.signedUrl) {
    throw new Error(`Failed to create signed URL: ${error?.message ?? 'unknown'}`);
  }
  return data.signedUrl;
}

export interface CallRecording {
  id: string;
  callId: string;
  recordingUrl: string;
  duration: number;
  transcript?: string;
  transcriptSummary?: string;
  sentiment?: 'positive' | 'neutral' | 'negative';
  sentimentScore?: number;
  createdAt: Date;
}

export interface TranscriptSearchResult {
  callId: string;
  transcript: string;
  snippet: string;
  relevance: number;
  createdAt: Date;
}

export class RecordingService {
  /**
   * Store call recording
   */
  async storeRecording(
    callId: string,
    audioBuffer: Buffer,
    format: string = 'mp3'
  ): Promise<string> {
    try {
      const fileName = `recordings/${callId}.${format}`;
      
      const { error } = await supabase.storage
        .from('call-recordings')
        .upload(fileName, audioBuffer, {
          contentType: `audio/${format}`,
          upsert: true,
        });

      if (error) {
        throw new Error(`Failed to upload recording: ${error instanceof Error ? error.message : String(error)}`);
      }

      // Determine whether this call belongs to a HIPAA tenant.
      // For HIPAA tenants we never store a long-lived public URL — only the
      // storage path so we can generate signed URLs on demand.
      const callRow = await pool.query(
        `SELECT tenant_id FROM public.calls WHERE id = $1 LIMIT 1`,
        [callId]
      );
      const tenantId: string | undefined = callRow.rows[0]?.tenant_id;
      const isHipaa = tenantId ? await assertHipaaTenant(tenantId) : false;

      let recordingUrl: string;
      if (isHipaa) {
        // Store only the storage path — a signed URL is generated at read time.
        recordingUrl = `storage://call-recordings/${fileName}`;
      } else {
        // Non-HIPAA tenants: generate a signed URL (still better than public).
        recordingUrl = await getSignedRecordingUrl(fileName);
      }

      // Update call record with recording URL
      await pool.query(
        `UPDATE public.calls 
         SET recording_url = $1, recording_duration = $2, updated_at = NOW()
         WHERE id = $3`,
        [recordingUrl, 0, callId]
      );

      console.log(`[Recording] Stored recording for call ${callId}`);
      return recordingUrl;
    } catch (error) {
      console.error('[Recording] Error storing recording:', error);
      throw error;
    }
  }

  /**
   * Store call transcript.
   * PII patterns (SSN, credit card, phone, email) are redacted before persistence.
   * On HIPAA-enabled tenants the full redaction pass is always applied.
   */
  async storeTranscript(
    callId: string,
    transcript: string,
    summary?: string
  ): Promise<void> {
    try {
      const safeTranscript = redactTranscriptPii(transcript);
      const safeSummary = summary ? redactTranscriptPii(summary) : summary;

      await pool.query(
        `UPDATE public.calls 
         SET transcript = $1, transcript_summary = $2, updated_at = NOW()
         WHERE id = $3`,
        [safeTranscript, safeSummary, callId]
      );

      console.log(`[Recording] Stored transcript for call ${callId}`);
    } catch (error) {
      console.error('[Recording] Error storing transcript:', error);
      throw error;
    }
  }

  /**
   * Analyze sentiment of call transcript
   */
  async analyzeSentiment(
    callId: string,
    transcript: string
  ): Promise<{ sentiment: string; score: number }> {
    try {
      // Use OpenAI to analyze sentiment
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: 'Analyze the sentiment of this call transcript. Respond with JSON: {"sentiment": "positive|neutral|negative", "score": 0.0-1.0, "reason": "brief explanation"}',
            },
            {
              role: 'user',
              content: transcript,
            },
          ],
          temperature: 0.3,
        }),
      });

      const data = await response.json() as any;
      const result = JSON.parse(data.choices[0].message.content) as any;

      // Store sentiment
      await pool.query(
        `UPDATE public.calls 
         SET sentiment = $1, sentiment_score = $2, updated_at = NOW()
         WHERE id = $3`,
        [result.sentiment, result.score, callId]
      );

      console.log(`[Recording] Analyzed sentiment for call ${callId}: ${result.sentiment}`);
      return { sentiment: result.sentiment, score: result.score };
    } catch (error) {
      console.error('[Recording] Error analyzing sentiment:', error);
      // Don't throw - sentiment is optional
      return { sentiment: 'neutral', score: 0.5 };
    }
  }

  /**
   * Get call recording details.
   * For HIPAA storage paths (`storage://`) a short-lived signed URL is
   * generated on the fly so recordings are never publicly accessible.
   */
  async getRecording(callId: string, tenantId: string): Promise<CallRecording | null> {
    try {
      const result = await pool.query(
        `SELECT
          id,
          recording_url,
          recording_duration as duration,
          transcript,
          transcript_summary,
          sentiment,
          sentiment_score,
          created_at
         FROM public.calls
         WHERE id = $1 AND tenant_id = $2`,
        [callId, tenantId]
      );

      if (result.rows.length === 0) {
        return null;
      }

      const row = result.rows[0];
      let recordingUrl: string | undefined = row.recording_url;

      // Resolve HIPAA storage path → signed URL on the fly
      if (recordingUrl?.startsWith('storage://call-recordings/')) {
        const filePath = recordingUrl.replace('storage://call-recordings/', '');
        try {
          recordingUrl = await getSignedRecordingUrl(filePath);
        } catch (err) {
          console.error('[Recording] Failed to generate signed URL:', err);
          recordingUrl = undefined;
        }
      }

      return {
        id: row.id,
        callId: row.id,
        recordingUrl: recordingUrl ?? row.recording_url,
        duration: row.duration || 0,
        transcript: row.transcript,
        transcriptSummary: row.transcript_summary,
        sentiment: row.sentiment,
        sentimentScore: row.sentiment_score,
        createdAt: row.created_at,
      };
    } catch (error) {
      console.error('[Recording] Error getting recording:', error);
      throw error;
    }
  }

  /**
   * Search transcripts
   */
  async searchTranscripts(
    tenantId: string,
    query: string,
    limit: number = 20
  ): Promise<TranscriptSearchResult[]> {
    try {
      const result = await pool.query(
        `SELECT 
          id as call_id,
          transcript,
          ts_headline('english', transcript, plainto_tsquery('english', $2)) as snippet,
          ts_rank(to_tsvector('english', transcript), plainto_tsquery('english', $2)) as relevance,
          created_at
         FROM public.calls
         WHERE tenant_id = $1
           AND transcript IS NOT NULL
           AND to_tsvector('english', transcript) @@ plainto_tsquery('english', $2)
         ORDER BY relevance DESC, created_at DESC
         LIMIT $3`,
        [tenantId, query, limit]
      );

      return result.rows.map((row: any) => ({
        callId: row.call_id,
        transcript: row.transcript,
        snippet: row.snippet,
        relevance: parseFloat(row.relevance),
        createdAt: row.created_at,
      }));
    } catch (error) {
      console.error('[Recording] Error searching transcripts:', error);
      throw error;
    }
  }

  /**
   * Get recent calls with transcripts.
   * Recording URLs that use HIPAA storage paths are resolved to signed URLs.
   */
  async getRecentCallsWithTranscripts(
    tenantId: string,
    limit: number = 50
  ): Promise<CallRecording[]> {
    try {
      const result = await pool.query(
        `SELECT 
          id,
          recording_url,
          recording_duration as duration,
          transcript,
          transcript_summary,
          sentiment,
          sentiment_score,
          created_at
         FROM public.calls
         WHERE tenant_id = $1
           AND (recording_url IS NOT NULL OR transcript IS NOT NULL)
         ORDER BY created_at DESC
         LIMIT $2`,
        [tenantId, limit]
      );

      return await Promise.all(
        result.rows.map(async (row: any) => {
          let recordingUrl: string | undefined = row.recording_url;
          if (recordingUrl?.startsWith('storage://call-recordings/')) {
            const filePath = recordingUrl.replace('storage://call-recordings/', '');
            try {
              recordingUrl = await getSignedRecordingUrl(filePath);
            } catch (err) {
              console.error(`[Recording] Failed to generate signed URL for ${row.id}:`, err);
              recordingUrl = undefined;
            }
          }
          return {
            id: row.id,
            callId: row.id,
            recordingUrl: recordingUrl ?? row.recording_url,
            duration: row.duration || 0,
            transcript: row.transcript,
            transcriptSummary: row.transcript_summary,
            sentiment: row.sentiment,
            sentimentScore: row.sentiment_score,
            createdAt: row.created_at,
          };
        })
      );
    } catch (error) {
      console.error('[Recording] Error getting recent calls:', error);
      throw error;
    }
  }

  /**
   * Add tags to call
   */
  async addCallTags(callId: string, tags: string[], tenantId: string): Promise<void> {
    try {
      const existing = await pool.query(
        `SELECT call_tags FROM public.calls WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [callId, tenantId]
      );
      const prior: string[] = existing.rows[0]?.call_tags || [];
      const merged = [...new Set([...prior, ...tags])];

      await pool.query(
        `UPDATE public.calls
         SET call_tags = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [merged, callId, tenantId]
      );

      console.log(`[Recording] Added tags to call ${callId}:`, merged);
    } catch (error) {
      console.error('[Recording] Error adding tags:', error);
      throw error;
    }
  }

  async removeCallTag(callId: string, tag: string, tenantId: string): Promise<void> {
    try {
      const existing = await pool.query(
        `SELECT call_tags FROM public.calls WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [callId, tenantId]
      );
      const prior: string[] = existing.rows[0]?.call_tags || [];
      const next = prior.filter((t) => t !== tag);

      await pool.query(
        `UPDATE public.calls
         SET call_tags = $1, updated_at = NOW()
         WHERE id = $2 AND tenant_id = $3`,
        [next, callId, tenantId]
      );
    } catch (error) {
      console.error('[Recording] Error removing tag:', error);
      throw error;
    }
  }

  /**
   * Set call disposition
   */
  async setCallDisposition(
    callId: string,
    disposition: string,
    notes: string | undefined,
    tenantId: string
  ): Promise<void> {
    try {
      await pool.query(
        `UPDATE public.calls
         SET call_disposition = $1, notes = $2, updated_at = NOW()
         WHERE id = $3 AND tenant_id = $4`,
        [disposition, notes, callId, tenantId]
      );

      console.log(`[Recording] Set disposition for call ${callId}: ${disposition}`);
    } catch (error) {
      console.error('[Recording] Error setting disposition:', error);
      throw error;
    }
  }

  /**
   * Delete recording (GDPR / retention compliance).
   * Handles both plain HTTPS URLs and HIPAA storage:// paths.
   */
  async deleteRecording(callId: string, tenantId: string): Promise<void> {
    try {
      // Get recording URL
      const result = await pool.query(
        'SELECT recording_url FROM public.calls WHERE id = $1 AND tenant_id = $2',
        [callId, tenantId]
      );

      if (result.rows.length === 0 || !result.rows[0].recording_url) {
        return;
      }

      const recordingUrl: string = result.rows[0].recording_url;
      let storagePath: string | null = null;

      if (recordingUrl.startsWith('storage://call-recordings/')) {
        storagePath = recordingUrl.replace('storage://call-recordings/', '');
      } else if (recordingUrl.includes('/call-recordings/')) {
        // Legacy public URL — extract path after bucket name
        const idx = recordingUrl.indexOf('/call-recordings/');
        storagePath = recordingUrl.slice(idx + '/call-recordings/'.length);
      }

      if (storagePath) {
        await supabase.storage
          .from('call-recordings')
          .remove([storagePath]);
      }

      // Remove URL from database
      await pool.query(
        `UPDATE public.calls
         SET recording_url = NULL, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2`,
        [callId, tenantId]
      );

      console.log(`[Recording] Deleted recording for call ${callId}`);
    } catch (error) {
      console.error('[Recording] Error deleting recording:', error);
      throw error;
    }
  }
}

export const recordingService = new RecordingService();

