import {
  attachCsrfToHeaders,
  clearCsrfCache,
  getGatewayBaseUrl,
  prefetchCsrfToken,
} from "./api";
import { supabase } from "./supabase";

export interface AssistantMessage {
  role: "user" | "assistant";
  content: string;
}

async function assistantHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sign in to use the assistant.");

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
    Accept: "text/event-stream",
  };

  await attachCsrfToHeaders(headers);
  return headers;
}

function parseSseBlock(
  block: string,
  handlers: {
    onStatus?: (text: string) => void;
    onDelta: (text: string) => void;
    onDone: (fullText: string) => void;
    onError: (message: string) => void;
  },
  state: { full: string; finished: boolean }
) {
  const lines = block.split("\n");
  let event = "message";
  let data = "";
  for (const line of lines) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) data = line.slice(5).trim();
  }
  if (!data) return;
  try {
    const payload = JSON.parse(data) as { text?: string; error?: string };
    if (event === "status" && payload.text) {
      handlers.onStatus?.(payload.text);
    } else if (event === "delta" && payload.text) {
      state.full += payload.text;
      handlers.onDelta(payload.text);
    } else if (event === "done" && !state.finished) {
      state.finished = true;
      handlers.onDone(payload.text || state.full);
    } else if (event === "error") {
      state.finished = true;
      handlers.onError(payload.error || "Assistant error");
    }
  } catch {
    /* ignore malformed block */
  }
}

export async function streamDashboardAssistant(
  messages: AssistantMessage[],
  page: string,
  pageTitle: string,
  handlers: {
    onStatus?: (text: string) => void;
    onDelta: (text: string) => void;
    onDone: (fullText: string) => void;
    onError: (message: string) => void;
  },
  csrfRetried = false
): Promise<void> {
  await prefetchCsrfToken();
  const headers = await assistantHeaders();
  const base = getGatewayBaseUrl();

  const res = await fetch(`${base}/api/v1/dashboard-assistant/chat`, {
    method: "POST",
    headers,
    body: JSON.stringify({ messages, page, pageTitle }),
  });

  if (res.status === 403 && !csrfRetried) {
    const errText = await res.text().catch(() => "");
    if (/csrf/i.test(errText)) {
      clearCsrfCache();
      await prefetchCsrfToken();
      return streamDashboardAssistant(messages, page, pageTitle, handlers, true);
    }
  }

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    let msg = `Assistant error (${res.status})`;
    try {
      const j = JSON.parse(errBody) as { error?: string };
      if (j.error) msg = j.error;
    } catch {
      if (errBody.length < 200) msg = errBody || msg;
    }
    if (res.status === 429) {
      msg = "Too many questions — wait a minute and try again.";
    }
    handlers.onError(msg);
    return;
  }

  const reader = res.body?.getReader();
  if (!reader) {
    handlers.onError("Streaming not supported in this browser.");
    return;
  }

  const decoder = new TextDecoder();
  let buffer = "";
  const state = { full: "", finished: false };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const parts = buffer.split("\n\n");
    buffer = parts.pop() || "";
    for (const part of parts) {
      if (part.trim()) parseSseBlock(part, handlers, state);
    }
  }

  if (buffer.trim()) parseSseBlock(buffer, handlers, state);
  if (!state.finished && state.full) {
    handlers.onDone(state.full);
  }
}
