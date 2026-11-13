import { describe, expect, it } from 'vitest';
import { ALL_TEMPLATES } from '../../apps/gateway/src/services/automation-engine/templates/index.js';
import { getTemplate } from '../../apps/gateway/src/services/automation-engine/registry.js';
import { validateConfig } from '../../apps/gateway/src/services/automation-engine/config-validation.js';
import { TRIGGER_KINDS } from '../../apps/gateway/src/services/automation-engine/types.js';

const KEYS = ['lead-to-crm', 'missed-call-followup', 'hot-lead-alert', 'lead-to-spreadsheet', 'document-intake'];
const byKey = (k: string) => ALL_TEMPLATES.find((t) => t.key === k)!;

function collectStrings(v: unknown, out: string[] = []): string[] {
  if (typeof v === 'string') out.push(v);
  else if (Array.isArray(v)) v.forEach((x) => collectStrings(x, out));
  else if (v && typeof v === 'object') Object.values(v).forEach((x) => collectStrings(x, out));
  return out;
}

describe('template library', () => {
  it('has exactly the five templates and registers them', () => {
    expect(ALL_TEMPLATES.map((t) => t.key)).toEqual(KEYS);
    for (const k of KEYS) expect(getTemplate(k)).toBeDefined();
  });

  for (const t of ALL_TEMPLATES) {
    describe(t.key, () => {
      it('has plain text fields and a sane time estimate', () => {
        expect(t.name.length).toBeGreaterThan(5);
        expect(t.description).toMatch(/ask first/i);
        expect(TRIGGER_KINDS).toContain(t.trigger);
        expect(t.minutesSavedPerRun).toBeGreaterThan(0);
        expect(t.minutesSavedPerRun).toBeLessThanOrEqual(5);
        expect(t.needs?.length).toBeGreaterThan(0);
      });
      it('has unique step keys', () => {
        const keys = t.steps.map((s) => s.key);
        expect(new Set(keys).size).toBe(keys.length);
      });
      it('only refers to real sources in {{...}} paths', () => {
        const configKeys = new Set(t.config.map((c) => c.key));
        t.steps.forEach((step, i) => {
          const earlier = new Set(t.steps.slice(0, i).map((s) => s.key));
          for (const str of collectStrings([step.params, step.skipIf])) {
            for (const m of str.matchAll(/\{\{\s*([^}]+?)\s*\}\}/g)) {
              const [root, a] = m[1].split('.');
              if (root === 'trigger') expect(m[1].split('.').length).toBeGreaterThan(1);
              else if (root === 'config') expect(configKeys.has(a), `${t.key}: config.${a}`).toBe(true);
              else if (root === 'steps') expect(earlier.has(m[1].split('.')[1]), `${t.key}: ${m[1]}`).toBe(true);
              else throw new Error(`${t.key}: unknown source ${m[1]}`);
            }
          }
        });
      });
      it('labels every setting, explains required ones, and validates with its defaults', () => {
        for (const c of t.config) {
          expect(c.label.trim()).not.toBe('');
          if (c.required) expect(c.help?.trim(), `${t.key}.${c.key} needs help`).toBeTruthy();
        }
        const sample: Record<string, string> = {};
        for (const c of t.config) if (c.required) sample[c.key] = c.type === 'email' ? 'a@b.co' : c.type === 'url' ? 'https://hooks.example/x' : 'Acme';
        expect(validateConfig(t, sample, { enabling: true }).ok).toBe(true);
        expect(validateConfig(t, {}, { enabling: false }).ok).toBe(true);
      });
    });
  }

  it('triggers and external steps are as designed', () => {
    const shape = (k: string) => ({ trigger: byKey(k).trigger, steps: byKey(k).steps.map((s) => `${s.kind}:${s.external}`) });
    expect(shape('lead-to-crm')).toEqual({ trigger: 'lead.created', steps: ['crm.push_lead:true', 'notify.team:true'] });
    expect(shape('missed-call-followup')).toEqual({ trigger: 'call.missed', steps: ['message.send:true', 'notify.team:true'] });
    expect(shape('hot-lead-alert')).toEqual({ trigger: 'call.ended', steps: ['data.transform:false', 'notify.team:true', 'email.send:true'] });
    expect(shape('lead-to-spreadsheet')).toEqual({ trigger: 'lead.created', steps: ['webhook.post:true'] });
    expect(shape('document-intake')).toEqual({ trigger: 'document.received', steps: ['document.extract:false', 'webhook.post:true', 'notify.team:true'] });
  });

  it('hot-lead-alert skips its alerts below the minimum and defaults to 70', () => {
    const t = byKey('hot-lead-alert');
    expect(t.config.find((c) => c.key === 'minScore')?.default).toBe(70);
    expect(t.steps[0].skipIf).toBeUndefined();
    expect(t.steps.slice(1).every((s) => s.skipIf === '{{steps.check-score.belowMinimum}}')).toBe(true);
  });

  it('the spreadsheet and intake webhooks are required https addresses', () => {
    for (const k of ['lead-to-spreadsheet', 'document-intake']) {
      const f = byKey(k).config.find((c) => c.key === 'webhookUrl')!;
      expect(f.type).toBe('url');
      expect(f.required).toBe(true);
    }
    expect(Object.keys((byKey('lead-to-spreadsheet').steps[0].params as any).body).sort()).toEqual(['email', 'name', 'phone', 'score', 'source', 'time']);
    expect(byKey('document-intake').config.find((c) => c.key === 'fields')?.default).toBe('customer name, date, total amount, reference number');
  });
});
