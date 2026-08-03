import { logger } from './logger.js';
import { voiceRedis } from './voice/redis.client.js';

export interface ScanOptions {
  pattern: string;
  batchSize?: number;
  timeoutMs?: number;
}

export interface ScanResult {
  keys: string[];
  durationMs: number;
  cursorCount: number;
  timedOut: boolean;
}

export async function scanKeys(options: ScanOptions): Promise<ScanResult> {
  const { pattern, batchSize = 100, timeoutMs = 5000 } = options;
  const startTime = Date.now();
  let cursor = '0';
  let cursorCount = 0;
  const allKeys: string[] = [];

  try {
    do {
      if (Date.now() - startTime > timeoutMs) {
        logger.warn('SCAN_TIMEOUT', { pattern, scannedKeys: allKeys.length, cursorCount, timeoutMs });
        return { keys: allKeys, durationMs: Date.now() - startTime, cursorCount, timedOut: true };
      }

      const result = await voiceRedis.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize);
      cursor = result[0];
      const batch = result[1];
      allKeys.push(...batch);
      cursorCount++;
    } while (cursor !== '0');

    return { keys: allKeys, durationMs: Date.now() - startTime, cursorCount, timedOut: false };
  } catch (error) {
    logger.error('SCAN_ERROR', {
      pattern,
      error: error instanceof Error ? error.message : String(error),
      scannedKeys: allKeys.length,
      cursorCount,
    });
    return { keys: allKeys, durationMs: Date.now() - startTime, cursorCount, timedOut: false };
  }
}

export async function scanKeysBatch(options: ScanOptions): Promise<AsyncIterable<string>> {
  const { pattern, batchSize = 100, timeoutMs = 30000 } = options;
  return {
    [Symbol.asyncIterator]: async function* () {
      const startTime = Date.now();
      let cursor = '0';
      do {
        if (Date.now() - startTime > timeoutMs) {
          logger.warn('SCAN_BATCH_TIMEOUT', { pattern, timeoutMs });
          return;
        }
        const result = await voiceRedis.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize);
        cursor = result[0];
        for (const key of result[1]) {
          yield key;
        }
      } while (cursor !== '0');
    },
  };
}

export async function deleteByPattern(options: ScanOptions): Promise<{ deleted: number; durationMs: number }> {
  const { pattern, batchSize = 100, timeoutMs = 30000 } = options;
  const startTime = Date.now();
  let deleted = 0;
  let cursor = '0';

  try {
    do {
      if (Date.now() - startTime > timeoutMs) {
        logger.warn('DELETE_BY_PATTERN_TIMEOUT', { pattern, deleted, timeoutMs });
        return { deleted, durationMs: Date.now() - startTime };
      }

      const result = await voiceRedis.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize);
      cursor = result[0];
      const batch = result[1];
      if (batch.length > 0) {
        await voiceRedis.unlink(...batch);
        deleted += batch.length;
      }
    } while (cursor !== '0');

    return { deleted, durationMs: Date.now() - startTime };
  } catch (error) {
    logger.error('DELETE_BY_PATTERN_ERROR', {
      pattern,
      error: error instanceof Error ? error.message : String(error),
      deleted,
    });
    return { deleted, durationMs: Date.now() - startTime };
  }
}

export async function forEachKey(
  pattern: string,
  fn: (key: string) => Promise<void>,
  options?: { batchSize?: number; timeoutMs?: number }
): Promise<{ processed: number; errors: number; durationMs: number }> {
  const startTime = Date.now();
  let processed = 0;
  let errors = 0;
  let cursor = '0';
  const batchSize = options?.batchSize || 100;
  const timeoutMs = options?.timeoutMs || 10000;

  try {
    do {
      if (Date.now() - startTime > timeoutMs) {
        logger.warn('FOREACH_KEY_TIMEOUT', { pattern, processed, errors, timeoutMs });
        return { processed, errors, durationMs: Date.now() - startTime };
      }

      const result = await voiceRedis.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize);
      cursor = result[0];
      for (const key of result[1]) {
        try {
          await fn(key);
          processed++;
        } catch (err) {
          errors++;
          logger.error('FOREACH_KEY_CALLBACK_ERROR', {
            key,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }
    } while (cursor !== '0');

    return { processed, errors, durationMs: Date.now() - startTime };
  } catch (error) {
    logger.error('FOREACH_KEY_ERROR', {
      pattern,
      error: error instanceof Error ? error.message : String(error),
      processed,
      errors,
    });
    return { processed, errors, durationMs: Date.now() - startTime };
  }
}
