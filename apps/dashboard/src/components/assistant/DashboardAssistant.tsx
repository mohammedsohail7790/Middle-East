"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "@/i18n/navigation";
import { X, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  streamDashboardAssistant,
  type AssistantMessage,
} from "@/lib/assistant-api";
import { navPageTitle } from "@/lib/dashboard-nav";
import { FloatingRobot, type RobotMood } from "./FloatingRobot";

const WELCOME =
  "Hi — I'm Halla AI Assistant. I can see your current dashboard page and workspace data. Ask me anything about setup, calls, leads, or troubleshooting.";


function resolvePageTitle(pathname: string): string {
  return navPageTitle(pathname);
}

const STARTERS = [
  "What can I do on this page?",
  "Why aren't my calls showing up?",
  "How do I fix my AI business hours?",
  "Where do I add a phone number?",
];

function messagesForApi(messages: AssistantMessage[]): AssistantMessage[] {
  return messages.filter((m) => m.content.trim().length > 0);
}

export function DashboardAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<AssistantMessage[]>([
    { role: "assistant", content: WELCOME },
  ]);
  const [streaming, setStreaming] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [mood, setMood] = useState<RobotMood>("idle");
  const [error, setError] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const pageHint = pathname || "/dashboard";
  const pageTitle = resolvePageTitle(pageHint);

  const scrollToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, streaming, statusText, scrollToBottom]);

  const sendMessage = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || streaming) return;

    setError("");
    setStatusText("Scanning your dashboard…");
    const userMsg: AssistantMessage = { role: "user", content: trimmed };
    const nextMessages = [...messages, userMsg];
    setMessages(nextMessages);
    setInput("");
    setStreaming(true);
    setMood("thinking");

    const assistantIndex = nextMessages.length;
    setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

    try {
      await streamDashboardAssistant(messagesForApi(nextMessages), pageHint, pageTitle, {
        onStatus: (text) => setStatusText(text),
        onDelta: (delta) => {
          setStatusText("");
          setMood("speaking");
          setMessages((prev) => {
            const copy = [...prev];
            const cur = copy[assistantIndex];
            if (cur?.role === "assistant") {
              copy[assistantIndex] = { ...cur, content: cur.content + delta };
            }
            return copy;
          });
        },
        onDone: (full) => {
          setMessages((prev) => {
            const copy = [...prev];
            copy[assistantIndex] = { role: "assistant", content: full };
            return copy;
          });
          setStatusText("");
          setMood("idle");
          setStreaming(false);
        },
        onError: (msg) => {
          setError(msg);
          setMessages((prev) => prev.filter((_, i) => i !== assistantIndex));
          setStatusText("");
          setMood("idle");
          setStreaming(false);
        },
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reach assistant");
      setMessages((prev) => prev.filter((_, i) => i !== assistantIndex));
      setStatusText("");
      setMood("idle");
      setStreaming(false);
    }
  };

  const subtitle = streaming
    ? statusText || "Streaming answer…"
    : "Knows every dashboard page · live workspace data";

  return (
    <div
      className={cn("dashboard-assistant-root", open && "is-panel-open")}
      aria-live="polite"
    >
      {open && (
        <button
          type="button"
          className="dashboard-assistant-backdrop lg:hidden"
          aria-label="Close assistant"
          onClick={() => setOpen(false)}
        />
      )}
      {open && (
        <div className="dashboard-assistant-panel" role="dialog" aria-label="Halla AI Assistant">
          <header className="dashboard-assistant-header">
            <div className="flex items-center gap-3 min-w-0">
              <div className="assistant-logo-wrap shrink-0">
                <Image
                  src="/logo-receptionist.jpg"
                  alt=""
                  width={48}
                  height={48}
                  className="assistant-logo-img"
                  priority
                />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-sm text-foreground">Halla AI Assistant</p>
                <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
              </div>
            </div>
            <button
              type="button"
              className="dashboard-icon-btn"
              onClick={() => setOpen(false)}
              aria-label="Close Halla AI Assistant"
            >
              <X className="w-4 h-4" />
            </button>
          </header>

          <div ref={scrollRef} className="dashboard-assistant-messages scrollbar-thin">
            {messages.map((msg, i) => (
              <div
                key={i}
                className={cn(
                  "dashboard-assistant-bubble",
                  msg.role === "user" ? "is-user" : "is-assistant"
                )}
              >
                <p className="text-sm whitespace-pre-wrap">
                  {msg.content ||
                    (streaming && i === messages.length - 1 ? "…" : "")}
                </p>
              </div>
            ))}
            {error && (
              <p className="text-xs text-red-600 px-1" role="alert">
                {error}
              </p>
            )}
          </div>

          {messages.length <= 1 && !streaming && (
            <div className="dashboard-assistant-starters px-3 pb-2 flex flex-wrap gap-1.5">
              {STARTERS.map((q) => (
                <button
                  key={q}
                  type="button"
                  className="text-[11px] px-2.5 py-1 rounded-full border border-border bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors text-left"
                  onClick={() => void sendMessage(q)}
                >
                  {q}
                </button>
              ))}
            </div>
          )}

          <form
            className="dashboard-assistant-input-row"
            onSubmit={(e) => {
              e.preventDefault();
              void sendMessage(input);
            }}
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask Halla AI Assistant…"
              className="input flex-1 text-sm"
              disabled={streaming}
              maxLength={2000}
            />
            <button
              type="submit"
              className="btn-primary shrink-0 !px-3"
              disabled={streaming || !input.trim()}
              aria-label="Send message"
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      )}

      <button
        type="button"
        className={cn("dashboard-assistant-fab", open && "is-open")}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close Halla AI Assistant" : "Open Halla AI Assistant"}
      >
        {open ? (
          <X className="w-5 h-5" />
        ) : (
          <FloatingRobot mood={mood} compact className="floating-robot-fab" />
        )}
        <span className="dashboard-assistant-fab-label">Assistant</span>
      </button>
    </div>
  );
}
