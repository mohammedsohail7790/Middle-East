export type TranscriptRole = "caller" | "assistant" | "system";

export interface TranscriptTurn {
  role: TranscriptRole;
  text: string;
}

const ROLE_LINE =
  /^(caller|assistant|system|user|agent|ai)\s*:\s*(.*)$/i;

function normalizeRole(raw: string): TranscriptRole {
  const key = raw.toLowerCase();
  if (key === "caller" || key === "user") return "caller";
  if (key === "assistant" || key === "agent" || key === "ai") return "assistant";
  return "system";
}

/** Parse stored call transcripts (`caller:` / `assistant:` lines) into chat turns. */
export function parseCallTranscript(raw: string | null | undefined): TranscriptTurn[] {
  if (!raw?.trim()) return [];

  const turns: TranscriptTurn[] = [];

  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const match = trimmed.match(ROLE_LINE);
    if (match) {
      const text = match[2].trim();
      if (text) turns.push({ role: normalizeRole(match[1]), text });
      continue;
    }

    if (turns.length > 0) {
      turns[turns.length - 1].text += `\n${trimmed}`;
    } else {
      turns.push({ role: "system", text: trimmed });
    }
  }

  return turns;
}
