"use client";

import { useRef, type Ref } from "react";
import { Calendar, Users, Zap } from "lucide-react";
import { AnimatedBeam } from "@/components/magic-ui/animated-beam";
import { HallaAiLogo } from "@/components/brand/HallaAiLogo";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";

function HubNode({
  nodeRef,
  icon: Icon,
  label,
  className,
}: {
  nodeRef: Ref<HTMLDivElement>;
  icon: typeof Users;
  label: string;
  className?: string;
}) {
  return (
    <div
      ref={nodeRef}
      className={`flex flex-col items-center gap-2 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-card ${className ?? ""}`}
    >
      <div className="grid size-11 place-items-center rounded-xl bg-accent/10 text-accent">
        <Icon className="size-5" strokeWidth={ICON_STROKE} />
      </div>
      <span className="text-xs font-semibold text-foreground">{label}</span>
    </div>
  );
}

export function IntegrationHubVisual() {
  const containerRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLDivElement>(null);
  const crmRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const zapierRef = useRef<HTMLDivElement>(null);

  return (
    <div
      ref={containerRef}
      className="relative hidden overflow-hidden rounded-2xl border border-border/70 bg-gradient-to-br from-card via-card to-accent/[0.04] px-6 py-8 md:block"
    >
      <div
        className="pointer-events-none absolute inset-0 opacity-60"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 50% 60% at 50% 50%, color-mix(in srgb, var(--accent) 12%, transparent), transparent 70%)",
        }}
      />

      <div className="relative mx-auto h-44 max-w-2xl">
        <div className="absolute left-1/2 top-0 -translate-x-1/2">
          <HubNode nodeRef={zapierRef} icon={Zap} label="Zapier" />
        </div>

        <div className="absolute bottom-0 left-0 right-0 flex items-end justify-between gap-4">
          <HubNode nodeRef={crmRef} icon={Users} label="CRM" />
          <div ref={centerRef} className="flex flex-col items-center gap-2">
            <div className="rounded-2xl border border-accent/25 bg-card p-3 shadow-glow">
              <HallaAiLogo href={undefined} iconOnly size="md" />
            </div>
            <span className="text-xs font-bold uppercase tracking-wider text-accent">Halla AI</span>
          </div>
          <HubNode nodeRef={calendarRef} icon={Calendar} label="Calendar" />
        </div>
      </div>

      <AnimatedBeam containerRef={containerRef} fromRef={centerRef} toRef={crmRef} curvature={-30} />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={centerRef}
        toRef={calendarRef}
        curvature={-30}
        reverse
      />
      <AnimatedBeam
        containerRef={containerRef}
        fromRef={centerRef}
        toRef={zapierRef}
        curvature={50}
        startYOffset={-8}
        endYOffset={8}
      />
    </div>
  );
}
