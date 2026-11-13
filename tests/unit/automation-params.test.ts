import { describe, expect, it } from 'vitest';
import { getPath, isTruthy, redactForProposal, resolveParams } from '../../apps/gateway/src/services/automation-engine/params.js';

const data = { trigger: { name: 'Sam', score: 82, hot: true, nested: { a: [10, 20] } }, config: { tag: 'Halla' }, steps: { read: { fields: { total: '12' } } } };

describe('resolveParams', () => {
  it('fills embedded paths as text and missing values as empty', () => {
    expect(resolveParams({ t: 'Hi {{trigger.name}}, {{trigger.nope}}!' }, data)).toEqual({ t: 'Hi Sam, !' });
  });
  it('keeps numbers and booleans for whole-string paths, and gives objects for whole-string object paths', () => {
    expect(resolveParams({ s: '{{trigger.score}}', h: '{{trigger.hot}}', f: '{{steps.read.fields}}' }, data)).toEqual({ s: 82, h: true, f: { total: '12' } });
  });
  it('reaches into arrays by index and nested params', () => {
    expect(resolveParams({ a: { b: ['{{trigger.nested.a.1}}'] } }, data)).toEqual({ a: { b: [20] } });
  });
  it('never evaluates code or walks the prototype', () => {
    expect(resolveParams({ x: '{{trigger.constructor}}', y: '{{__proto__.polluted}}', z: '{{trigger.name.length}}', w: '{{ process.exit(1) }}' }, data)).toEqual({ x: '', y: '', z: '', w: '' });
  });
  it('caps long values and refuses huge results', () => {
    const big = { trigger: { v: 'x'.repeat(20_000) } };
    expect((resolveParams({ t: 'a{{trigger.v}}' }, big).t as string).length).toBeLessThanOrEqual(5_001);
    const many = { trigger: { v: 'x'.repeat(4_000) } };
    const params = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`k${i}`, '{{trigger.v}}']));
    expect(() => resolveParams(params, many)).toThrow(/too large/);
  });
  it('getPath returns undefined for bad paths', () => {
    expect(getPath(data, '')).toBeUndefined();
    expect(getPath(data, 'trigger..name')).toBeUndefined();
    expect(getPath(data, 'trigger.name')).toBe('Sam');
  });
});

describe('isTruthy and redaction', () => {
  it('reads skip values', () => {
    expect([true, 'true', 'yes', 1].every(isTruthy)).toBe(true);
    expect([false, '', 'false', '0', 0, undefined].some(isTruthy)).toBe(false);
  });
  it('hides secret-looking fields and shows urls as host only', () => {
    expect(redactForProposal({ apiKey: 'k', nested: { Authorization: 'Bearer x', password: 'p', ok: 'fine' }, url: 'https://hooks.zapier.com/hooks/catch/123/abc?x=1', plain: 'https://a.com' })).toEqual({
      apiKey: '[hidden]', nested: { Authorization: '[hidden]', password: '[hidden]', ok: 'fine' }, url: 'https://hooks.zapier.com/…', plain: 'https://a.com',
    });
  });
});
