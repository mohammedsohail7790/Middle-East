/**
 * Static regression guard for F8. It reads the source of every file on the live tool / voice pipeline and fails if a
 * logger or console call includes raw tool arguments, caller speech or caller-supplied fields. Calls that pass the
 * value through the redaction helpers are fine; a new raw field is not.
 *
 * This complements the behavioural tests (tool-arg-redaction.test.ts, tool-redaction.integration.test.ts): those
 * prove what is recorded today; this stops the next `logger.info('...', { parameters })` from being merged.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import path from 'path';

const ROOT = path.resolve(__dirname, '../../../apps/gateway/src/services');
const FILES = [
  'realtime/realtime.tools.ts',
  'realtime/realtime.session.ts',
  'ai-governance/ai-governance.service.ts',
  'ai-governance/execution-audit.ts',
  'voice/ai.service.ts',
  'voice/conversation.orchestrator.ts',
  'knowledge/knowledge.cache.ts',
  // telephony plumbing that sits on the same live path and would otherwise log caller / customer numbers
  'voice/voice.controller.ts',
  'voice/transfer.service.ts',
  'sms/sms.controller.ts',
  'sms/sms.service.ts',
  'workflows/workflow-engine.ts',
  'automation/automation.service.ts',
];

/** Extracts the full text of each `logger.x(...)` / `console.x(...)` call by balancing parentheses. */
function logCalls(src: string): Array<{ line: number; text: string }> {
  const out: Array<{ line: number; text: string }> = [];
  for (const m of src.matchAll(/\b(?:logger|console)\.(?:debug|info|warn|error|log)\(/g)) {
    const begin = m.index ?? 0;
    let depth = 1;
    let i = begin + m[0].length;
    while (i < src.length && depth > 0) {
      const c = src[i++];
      if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    out.push({ line: src.slice(0, begin).split('\n').length, text: src.slice(begin, i) });
  }
  return out;
}

/** Replaces `name(...)` (balanced parentheses) with a token, so the sanctioned wrappers are not judged by their inputs. */
function stripCall(text: string, name: string, token: string): string {
  let out = text;
  for (;;) {
    const at = out.search(new RegExp('\\b' + name + '\\('));
    if (at < 0) return out;
    let depth = 1;
    let i = at + name.length + 1;
    while (i < out.length && depth > 0) {
      const c = out[i++];
      if (c === '(') depth++;
      else if (c === ')') depth--;
    }
    out = out.slice(0, at) + token + out.slice(i);
  }
}

/** Removes the sanctioned redaction/summary wrappers so only the REMAINING identifiers are judged. */
function withoutRedactors(text: string): string {
  let t = text;
  for (const [name, token] of [
    ['redactToolArguments', 'REDACTED_CALL'], ['summarizeToolArguments', 'SUMMARY_CALL'], ['safeErrorForLog', 'SAFE_ERROR'],
    ['safeResultSummary', 'SAFE_SUMMARY'], ['safeReason', 'SAFE_REASON'], ['Boolean', 'BOOL'],
  ] as const) t = stripCall(t, name, token);
  return t.replace(/typeof [\w.]+ === 'string' \? [\w.]+\.length : 0/g, 'LENGTH_ONLY');
}

const FORBIDDEN: Array<[string, RegExp]> = [
  ['raw tool parameters', /(?:^|[\s{,])parameters\s*[,}]/],
  ['raw parsed arguments', /\bparsedArgs\b/],
  ['raw "arguments:" field', /\barguments\s*:/],
  ['caller-supplied tool fields', /(?<!req\.)\bparams\.(?!length)\w+/], // `req.params.<id>` (a route id) is not caller speech
  ['customer name', /\b(?:customerName|customer_name)\b/],
  ['phone value', /\bphone\s*:\s*(?!Boolean|!!)/],
  ['caller query / utterance text', /\bquery\s*:\s*(?!query\.length)/],
  ['transcript text', /\btranscript\s*:\s*transcript\b/],
  ['model text delta', /\bdelta\s*:\s*event\.delta/],
  ['lastUser text', /\bquery\s*:\s*lastUser\b/],
  ['caller number', /\b(?:from|callerPhone|callerNumber|fromNumber)\s*:\s*(?!Boolean|!!)(?:fromNumber|From\b|event\.data|req\.body)/],
  ['customer number as a shorthand field', /[{,]\s*(?:to|from|phone)\s*[,}]/],
  ['number or address interpolated into a message', /\$\{(?:to|from|email|phone)\}/],
];

describe('F8 static guard: no raw tool arguments or caller text in log calls on the live pipeline', () => {
  for (const file of FILES) {
    it(`${file}`, () => {
      const src = readFileSync(path.join(ROOT, file), 'utf8');
      const calls = logCalls(src);
      expect(calls.length, 'the guard found no log calls — the extractor is broken').toBeGreaterThan(0);
      const offenders: string[] = [];
      for (const call of calls) {
        const judged = withoutRedactors(call.text);
        for (const [label, re] of FORBIDDEN) {
          if (re.test(judged)) offenders.push(`${file}:${call.line} ${label}: ${call.text.replace(/\s+/g, ' ').slice(0, 140)}`);
        }
      }
      expect(offenders).toEqual([]);
    });
  }

  it('the guard itself works: it flags a raw-arguments log call and accepts a redacted one', () => {
    const bad = "logger.info('X', { sessionId: s.id, parameters, toolName });";
    const good = "logger.info('X', { sessionId: s.id, redactedArguments: redactToolArguments(toolName, parameters) });";
    expect(FORBIDDEN.some(([, re]) => re.test(withoutRedactors(logCalls(bad)[0].text)))).toBe(true);
    expect(FORBIDDEN.some(([, re]) => re.test(withoutRedactors(logCalls(good)[0].text)))).toBe(false);
  });
});
