import type { AutomationTemplate, StepExecutor, StepKind } from './types.js';

/** The library of ready-made automations and the code that carries out each kind of step. Templates and executors register themselves here; the engine only reads. */
const templates = new Map<string, AutomationTemplate>();
const executors = new Map<StepKind, StepExecutor>();

export function registerTemplate(t: AutomationTemplate): void {
  if (templates.has(t.key)) throw new Error(`Automation template "${t.key}" is already registered`);
  const seen = new Set<string>();
  for (const s of t.steps) {
    if (seen.has(s.key)) throw new Error(`Template "${t.key}" has two steps called "${s.key}"`);
    seen.add(s.key);
  }
  templates.set(t.key, t);
}

export function getTemplate(key: string): AutomationTemplate | undefined {
  return templates.get(key);
}

export function listTemplates(): AutomationTemplate[] {
  return [...templates.values()];
}

export function registerExecutor(kind: StepKind, fn: StepExecutor): void {
  executors.set(kind, fn);
}

export function getExecutor(kind: StepKind): StepExecutor | undefined {
  return executors.get(kind);
}

/** Test helper: start from an empty library. */
export function resetRegistry(): void {
  templates.clear();
  executors.clear();
}
