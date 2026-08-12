/**
 * Voice Cloning Service
 * Manages Professional Voice Cloning via ElevenLabs.
 */

import { pool } from '../db/pool.js';

export interface VoiceClone {
  id: string;
  tenantId: string;
  name: string;
  elevenlabsVoiceId: string | null;
  status: string;
  samplesUploaded: number;
  sampleDurationSeconds: number;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export class VoiceCloningService {
  private readonly elevenLabsApiKey = process.env.ELEVENLABS_API_KEY;

  async list(tenantId: string): Promise<VoiceClone[]> {
    const result = await pool.query(
      `SELECT id, tenant_id, elevenlabs_voice_id, name, status, samples_uploaded, sample_duration_seconds, description, created_at, updated_at
       FROM public.voice_clones WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId]
    );
    return result.rows.map((row: any) => this.mapRow(row));
  }

  async create(tenantId: string, data: { name: string; description?: string }): Promise<VoiceClone> {
    const result = await pool.query(
      `INSERT INTO public.voice_clones (tenant_id, name, description) VALUES ($1, $2, $3)
       RETURNING id, tenant_id, elevenlabs_voice_id, name, status, samples_uploaded, sample_duration_seconds, description, created_at, updated_at`,
      [tenantId, data.name, data.description || null]
    );
    return this.mapRow(result.rows[0]);
  }

  /**
   * Upload audio samples for voice cloning.
   * Accepts base64-encoded audio files.
   */
  async uploadSamples(tenantId: string, cloneId: string, samples: Array<{ fileName: string; audioBase64: string }>): Promise<VoiceClone> {
    if (!this.elevenLabsApiKey) throw new Error('ElevenLabs API key not configured');

    // Get the clone record
    const cloneResult = await pool.query(
      `SELECT id, elevenlabs_voice_id FROM public.voice_clones WHERE id = $1 AND tenant_id = $2`,
      [cloneId, tenantId]
    );
    if (cloneResult.rows.length === 0) throw new Error('Voice clone not found');

    const existingVoiceId = cloneResult.rows[0].elevenlabs_voice_id;

    try {
      if (existingVoiceId) {
        // Add samples to existing voice
        for (const sample of samples) {
          const audioBuffer = Buffer.from(sample.audioBase64, 'base64');
          const formData = new FormData();
          formData.append('audio', new Blob([audioBuffer]), sample.fileName);
          formData.append('text', `Sample recording for voice clone`);

          await fetch(`https://api.elevenlabs.io/v1/voices/${existingVoiceId}/add-samples`, {
            method: 'POST',
            headers: { 'xi-api-key': this.elevenLabsApiKey! },
            body: formData,
          });
        }

        // Update sample count
        const duration = samples.reduce((acc, s) => acc + this.getAudioDuration(s.audioBase64), 0);
        await pool.query(
          `UPDATE public.voice_clones SET samples_uploaded = samples_uploaded + $1, sample_duration_seconds = sample_duration_seconds + $2, updated_at = NOW() WHERE id = $3`,
          [samples.length, duration, cloneId]
        );
      } else {
        // Create new professional voice clone
        const formData = new FormData();
        formData.append('name', `Halla AI - ${tenantId.slice(0, 8)}`);
        formData.append('description', `Custom voice clone for Halla AI tenant`);

        for (const sample of samples) {
          const audioBuffer = Buffer.from(sample.audioBase64, 'base64');
          formData.append('files', new Blob([audioBuffer]), sample.fileName);
        }

        const response = await fetch('https://api.elevenlabs.io/v1/voices/add', {
          method: 'POST',
          headers: { 'xi-api-key': this.elevenLabsApiKey! },
          body: formData,
        });

        if (!response.ok) {
          const error = await response.text();
          throw new Error(`ElevenLabs API error: ${error}`);
        }

        const voiceData = await response.json() as { voice_id: string };

        await pool.query(
          `UPDATE public.voice_clones SET elevenlabs_voice_id = $1, status = 'processing', samples_uploaded = $2, sample_duration_seconds = $3, updated_at = NOW() WHERE id = $4`,
          [voiceData.voice_id, samples.length, samples.reduce((acc, s) => acc + this.getAudioDuration(s.audioBase64), 0), cloneId]
        );
      }

      return this.getById(tenantId, cloneId);
    } catch (error: any) {
      await pool.query(
        `UPDATE public.voice_clones SET status = 'failed', updated_at = NOW() WHERE id = $1`,
        [cloneId]
      );
      throw error;
    }
  }

  async delete(tenantId: string, cloneId: string): Promise<void> {
    const clone = await this.getById(tenantId, cloneId);
    if (clone.elevenlabsVoiceId && this.elevenLabsApiKey) {
      // Delete from ElevenLabs
      await fetch(`https://api.elevenlabs.io/v1/voices/${clone.elevenlabsVoiceId}`, {
        method: 'DELETE',
        headers: { 'xi-api-key': this.elevenLabsApiKey },
      });
    }
    await pool.query(`DELETE FROM public.voice_clones WHERE id = $1 AND tenant_id = $2`, [cloneId, tenantId]);
  }

  private async getById(tenantId: string, cloneId: string): Promise<VoiceClone> {
    const result = await pool.query(
      `SELECT id, tenant_id, elevenlabs_voice_id, name, status, samples_uploaded, sample_duration_seconds, description, created_at, updated_at
       FROM public.voice_clones WHERE id = $1 AND tenant_id = $2`,
      [cloneId, tenantId]
    );
    if (result.rows.length === 0) throw new Error('Voice clone not found');
    return this.mapRow(result.rows[0]);
  }

  private getAudioDuration(base64: string): number {
    // Rough estimate: ~150KB per second for 16kHz mono WAV
    const bytes = base64.length * 0.75;
    return Math.ceil(bytes / 150000);
  }

  private mapRow(row: any): VoiceClone {
    return {
      id: row.id, tenantId: row.tenant_id, elevenlabsVoiceId: row.elevenlabs_voice_id,
      name: row.name, status: row.status, samplesUploaded: row.samples_uploaded,
      sampleDurationSeconds: row.sample_duration_seconds, description: row.description,
      createdAt: row.created_at, updatedAt: row.updated_at,
    };
  }
}

export const voiceCloningService = new VoiceCloningService();

