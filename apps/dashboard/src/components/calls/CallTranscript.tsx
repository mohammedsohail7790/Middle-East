"use client";

import { Bot, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { parseCallTranscript } from "@/lib/parse-call-transcript";

type Props = {
  transcript: string | null | undefined;
  agentName?: string | null;
};

export function CallTranscript({ transcript, agentName }: Props) {
  const turns = parseCallTranscript(transcript);

  if (!turns.length) {
    return (
      <p className="text-sm text-foreground-tertiary bg-muted/40 border border-border p-4 rounded-xl">
        No transcript captured.
      </p>
    );
  }

  const assistantLabel = agentName?.trim() || "AI Agent";

  return (
    <div className="space-y-3 bg-muted/20 border border-border rounded-xl p-4 max-h-[28rem] overflow-y-auto">
      {turns.map((turn, index) => {
        const isCaller = turn.role === "caller";
        const isAssistant = turn.role === "assistant";

        return (
          <div
            key={`${turn.role}-${index}`}
            className={cn(
              "flex gap-2",
              isCaller && "justify-end",
              isAssistant && "justify-start",
              turn.role === "system" && "justify-center",
            )}
          >
            {isAssistant && (
              <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-accent/15 text-accent-dark">
                <Bot className="size-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              </span>
            )}

            <div
              className={cn(
                "max-w-[min(100%,28rem)] rounded-2xl px-3.5 py-2.5 text-sm shadow-sm",
                isAssistant && "bg-accent/10 border border-accent/20 text-foreground",
                isCaller && "bg-card border border-border text-foreground",
                turn.role === "system" && "bg-muted/50 border border-dashed border-border text-xs text-muted-foreground italic max-w-full",
              )}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                {isCaller ? "Caller" : isAssistant ? assistantLabel : "System"}
              </p>
              <p className="whitespace-pre-wrap leading-relaxed">{turn.text}</p>
            </div>

            {isCaller && (
              <span className="mt-1 grid size-7 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                <User className="size-3.5" strokeWidth={ICON_STROKE} aria-hidden />
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
