import type { RealtimeSession } from './realtime.types.js';

export function appendSessionTranscript(
  session: RealtimeSession,
  role: 'caller' | 'assistant' | 'system',
  text: string
): void {
  const line = text?.trim();
  if (!line) return;
  if (!session.transcriptLines) session.transcriptLines = [];
  const last = session.transcriptLines[session.transcriptLines.length - 1];
  if (last && last.role === role && last.text === line) return;
  session.transcriptLines.push({ role, text: line });
}

export function formatSessionTranscript(session: RealtimeSession): string {
  if (!session.transcriptLines?.length) return '';
  return session.transcriptLines.map((l) => `${l.role}: ${l.text}`).join('\n');
}

export function extractMessageText(item: {
  content?: Array<{ type?: string; text?: string; transcript?: string }>;
}): string {
  if (!item?.content?.length) return '';
  return item.content
    .map((part) => part.text || part.transcript || '')
    .filter(Boolean)
    .join(' ')
    .trim();
}
