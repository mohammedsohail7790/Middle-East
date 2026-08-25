"use client";

import { Bot, Mic, Sparkles } from "lucide-react";
import { AnimatedGradientText } from "@/components/magic-ui/animated-gradient-text";
import { VibePanel } from "@/components/magic-ui/vibe-panel";
import { IconBox, ICON_STROKE } from "@/components/ui-kit/IconBox";

type AgentHeroBannerProps = {
  agentName: string;
  voiceLabel: string;
  toneLabel: string;
  liveLabel: string;
};

export function AgentHeroBanner({
  agentName,
  voiceLabel,
  toneLabel,
  liveLabel,
}: AgentHeroBannerProps) {
  const displayName = agentName.trim() || "Halla";

  return (
    <VibePanel beam className="mb-6 rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/[0.06] shadow-card">
      <div className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
        <div className="flex items-start gap-4 min-w-0">
          <IconBox icon={Bot} variant="accent" size="lg" className="shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              AI receptionist
            </p>
            <h2 className="mt-1 text-xl font-bold tracking-tight text-foreground sm:text-2xl">
              <AnimatedGradientText>{displayName}</AnimatedGradientText>
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Voice and tone your callers hear on every inbound call.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground-secondary">
            <Mic className="size-3.5 text-accent" strokeWidth={ICON_STROKE} />
            {voiceLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/80 px-3 py-1.5 text-xs font-medium text-foreground-secondary">
            <Sparkles className="size-3.5 text-accent" strokeWidth={ICON_STROKE} />
            {toneLabel}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/90 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-300">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
            </span>
            {liveLabel}
          </span>
        </div>
      </div>
    </VibePanel>
  );
}
