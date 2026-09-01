"use client";

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import Link from "next/link";
import { HallaAiLogo } from "@/components/brand/HallaAiLogo";
import { cn } from "@/lib/utils";
import { IconBox } from "@/components/ui-kit/IconBox";
import { BorderBeam } from "@/components/magic-ui/border-beam";
import { DotPattern } from "@/components/magic-ui/dot-pattern";

const STEP_LABELS = ["Business", "Industry", "Hours", "AI agent", "Phone line", "Integrations", "Finish"];

type OnboardingShellProps = {
  step: number;
  totalSteps?: number;
  children: ReactNode;
  footer?: ReactNode;
};

export function OnboardingShell({
  step,
  totalSteps = 6,
  children,
  footer,
}: OnboardingShellProps) {
  const showProgress = step < totalSteps;

  return (
    <div className="onboarding-page auth-marketing-shell relative min-h-[100dvh] flex flex-col overflow-x-hidden">
      <DotPattern
        className="absolute inset-0 z-0 text-accent/20 [mask-image:radial-gradient(ellipse_at_center,white,transparent_80%)]"
        width={22}
        height={22}
        cr={1}
      />
      <header className="onboarding-header relative z-10">
        <div className="onboarding-header-inner">
          <HallaAiLogo href="/" size="md" className="onboarding-logo" />
          <Link href="/login" className="text-sm font-medium text-muted-foreground hover:text-foreground">
            Sign in
          </Link>
        </div>
      </header>

      <main className="relative z-10 flex-1 flex items-start justify-center px-4 py-8 sm:py-12">
        <div className="w-full max-w-xl">
          {showProgress && (
            <div className="mb-8">
              <div className="flex items-center justify-between gap-2 mb-3">
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Setup · Step {step + 1} of {totalSteps}
                </p>
                <p className="text-xs text-muted-foreground hidden sm:block">
                  {STEP_LABELS[step] ?? ""}
                </p>
              </div>
              <div className="flex gap-1.5">
                {Array.from({ length: totalSteps }, (_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "h-1.5 flex-1 rounded-full transition-colors",
                      i <= step ? "bg-accent" : "bg-border"
                    )}
                    aria-hidden
                  />
                ))}
              </div>
            </div>
          )}

          <div className="onboarding-card relative overflow-hidden">
            <BorderBeam size={70} duration={12} colorFrom="#C7A25A" colorTo="#8C6F3E" borderWidth={1.5} />
            {children}
          </div>

          {footer && <div className="mt-6">{footer}</div>}
        </div>
      </main>
    </div>
  );
}

export function OnboardingStepHeader({
  icon: Icon,
  title,
  description,
}: {
  icon?: LucideIcon;
  title: string;
  description?: string;
}) {
  return (
    <div className="text-center mb-6 sm:mb-8">
      {Icon && <IconBox icon={Icon} variant="accent" size="xl" className="mx-auto mb-4" />}
      <h2 className="text-xl sm:text-2xl font-bold text-foreground tracking-tight">{title}</h2>
      {description && (
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">{description}</p>
      )}
    </div>
  );
}

export function OnboardingField({
  label,
  hint,
  required,
  children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: ReactNode;
}) {
  return (
    <div>
      <label className="dashboard-field-label">
        {label}
        {required && <span className="text-destructive ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="dashboard-field-hint">{hint}</p>}
    </div>
  );
}
