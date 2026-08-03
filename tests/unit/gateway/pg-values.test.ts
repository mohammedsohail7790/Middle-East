import { describe, it, expect } from 'vitest';
import { asJsonbArray, asJsonbObject, ensureJsonArray } from '../../../apps/gateway/src/services/db/pg-values.js';

describe('pg-values JSONB helpers', () => {
  it('serializes arrays for jsonb columns', () => {
    expect(asJsonbArray(['a', 'b'])).toBe('["a","b"]');
    expect(JSON.parse(asJsonbArray(ensureJsonArray('["x"]')))).toEqual(['x']);
  });

  it('serializes objects for jsonb columns', () => {
    expect(asJsonbObject({ ok: true })).toBe('{"ok":true}');
    expect(asJsonbObject(null)).toBe('{}');
  });
});
