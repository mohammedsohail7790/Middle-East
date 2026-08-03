/**
 * Untrusted text (tenant config, transcripts, caller input) must not be interpolated raw into system prompts.
 */

const INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above)\s+instructions/i,
  /disregard\s+(all\s+)?(previous|prior)\s+/i,
  /\bsystem\s*:\s*/i,
  /\bassistant\s*:\s*/i,
  /\buser\s*:\s*/i,
  /<\s*\/?\s*system\s*>/i,
  /\[INST\]/i,
  /<<\s*SYS\s*>>/i,
  /you are now (a|an) /i,
  /new instructions?:/i,
  /developer mode/i,
  /jailbreak/i,
];

const MAX_UNTRUSTED_CHARS = Number(process.env.MAX_UNTRUSTED_PROMPT_CHARS || 12_000);

export function scanPromptInjection(text: string): string | null {
  if (!text?.trim()) return null;
  for (const pattern of INJECTION_PATTERNS) {
    if (pattern.test(text)) {
      return `Blocked pattern: ${pattern.source.slice(0, 48)}`;
    }
  }
  return null;
}

export function sanitizeUntrustedText(input: unknown, maxLen = MAX_UNTRUSTED_CHARS): string {
  if (input == null) return '';
  let text = String(input)
    .replace(/\0/g, '')
    .replace(/[\u0001-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ')
    .trim();
  if (text.length > maxLen) {
    text = text.slice(0, maxLen);
  }
  return text;
}

/** Wrap tenant/user content with clear delimiters for the model. */
export function wrapUntrustedBlock(label: string, content: string): string {
  const safe = sanitizeUntrustedText(content);
  if (!safe) return '';
  const hit = scanPromptInjection(safe);
  if (hit) {
    return `[${label}_BLOCKED: content removed — policy violation]`;
  }
  return `[${label}_START]\n${safe}\n[${label}_END]`;
}

export function appendUntrustedInstructions(basePrompt: string, sections: string[]): string {
  const parts = [basePrompt];
  for (const section of sections) {
    const wrapped = section.startsWith('[') ? section : wrapUntrustedBlock('TENANT_CONFIG', section);
    if (wrapped) parts.push(wrapped);
  }
  return parts.join('\n\n');
}
