"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Lock } from "lucide-react";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { cn } from "@/lib/utils";
import { AnimatedGradientText } from "@/components/magic-ui/animated-gradient-text";
import { BorderBeam } from "@/components/magic-ui/border-beam";
import { DotPattern } from "@/components/magic-ui/dot-pattern";
import { ShimmerButton } from "@/components/magic-ui/shimmer-button";
import { MarketingAtmosphere } from "@/components/marketing/effects/MarketingAtmosphere";
import { AuthShowcasePanel } from "@/components/auth/AuthShowcasePanel";

/* ─── Shell ──────────────────────────────────────────────────────────────── */

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-marketing-shell relative grid min-h-dvh grid-rows-[auto_1fr_auto] overflow-x-hidden antialiased">
      <MarketingAtmosphere variant="auth" />
      <DotPattern
        className="absolute inset-0 z-0 text-accent/25 [mask-image:radial-gradient(ellipse_at_center,white,transparent_75%)]"
        width={20}
        height={20}
        cr={1}
        glow
      />
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden
        style={{
          background:
            "radial-gradient(ellipse 80% 55% at 50% -8%, color-mix(in srgb, var(--accent) 16%, transparent), transparent 58%), radial-gradient(ellipse 45% 38% at 100% 90%, color-mix(in srgb, var(--accent) 10%, transparent), transparent 52%)",
        }}
      />

      <header className="sticky top-0 z-50 border-b border-border/60 bg-white/85 backdrop-blur-xl">
        <div className="mx-auto flex h-[72px] w-full max-w-[1280px] items-center gap-4 px-6">
          <Link href="/" className="flex shrink-0 items-center no-underline">
            <span className="text-2xl font-extrabold tracking-tight text-foreground">
              Halla<AnimatedGradientText>AI</AnimatedGradientText>
            </span>
          </Link>
          <nav className="hidden flex-1 items-center gap-1 pl-2 sm:flex">
            <Link
              href="/pricing"
              className="inline-flex items-center rounded-lg px-3 py-[7px] text-sm font-medium text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground"
            >
              Pricing
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center rounded-lg px-3 py-[7px] text-sm font-medium text-muted-foreground no-underline transition-colors hover:bg-muted hover:text-foreground"
            >
              How it works
            </Link>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link
              href="/login"
              className="inline-flex items-center rounded-full border border-border bg-transparent px-4 py-2 text-sm font-medium text-foreground-secondary no-underline whitespace-nowrap transition-colors hover:border-border-light hover:bg-muted"
            >
              Sign in
            </Link>
            <ShimmerButton asChild borderRadius="9999px" className="!px-[18px] !py-[9px]">
              <Link href="/signup">Start free trial</Link>
            </ShimmerButton>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex items-center justify-center px-4 py-12 sm:py-16">
        <div className="auth-layout-split w-full max-w-[1120px]">
          <AuthShowcasePanel />
          <div className="auth-layout-form">{children}</div>
        </div>
      </main>

      <footer className="relative z-10 border-t border-border/70 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex w-full max-w-[1280px] flex-col items-center justify-between gap-3 px-6 py-4 sm:flex-row">
          <p className="text-center text-[0.78rem] text-muted-foreground sm:text-left">
            &copy; {new Date().getFullYear()} Halla AI &middot;{" "}
            <Link href="/privacy" className="text-muted-foreground no-underline hover:text-foreground">
              Privacy
            </Link>{" "}
            &middot;{" "}
            <Link href="/terms" className="text-muted-foreground no-underline hover:text-foreground">
              Terms
            </Link>
          </p>
          <div className="flex items-center gap-3">
            {[
              { icon: "shield", label: "SOC 2 Type II" },
              { icon: "lock", label: "256-bit SSL" },
              { icon: "clock", label: "99.9% Uptime" },
            ].map(({ icon, label }) => (
              <span
                key={label}
                className="flex items-center gap-[5px] text-[0.7rem] font-semibold uppercase tracking-wide text-muted-foreground"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="size-3 shrink-0"
                >
                  {icon === "shield" && <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />}
                  {icon === "lock" && (
                    <>
                      <rect x="3" y="11" width="18" height="11" rx="2" />
                      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                    </>
                  )}
                  {icon === "clock" && (
                    <>
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 8v4l3 3" />
                    </>
                  )}
                </svg>
                {label}
              </span>
            ))}
          </div>
        </div>
      </footer>
    </div>
  );
}

/* ─── Card ───────────────────────────────────────────────────────────────── */

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="relative w-full max-w-[420px] overflow-hidden rounded-2xl border border-border/70 bg-white/90 px-6 py-8 shadow-[0_8px_40px_-12px_rgba(0,0,0,0.12)] backdrop-blur-sm sm:px-10 sm:py-10">
      <BorderBeam size={90} duration={10} colorFrom="#C7A25A" colorTo="#8C6F3E" borderWidth={1.5} />
      <h1 className="text-2xl font-extrabold tracking-tight text-foreground">{title}</h1>
      {description && (
        <p className="mt-1 text-sm leading-relaxed text-muted-foreground">{description}</p>
      )}
      {children}
    </div>
  );
}

/* ─── Primitives ─────────────────────────────────────────────────────────── */

export function AuthError({ message }: { message: string }) {
  return (
    <p
      className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-600"
      role="alert"
    >
      {message}
    </p>
  );
}

export function AuthNotice({ message }: { message: string }) {
  return (
    <p
      className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700"
      role="status"
    >
      {message}
    </p>
  );
}

export function AuthFooterLink({
  prompt,
  href,
  linkLabel,
}: {
  prompt: string;
  href: string;
  linkLabel: string;
}) {
  return (
    <p className="mt-6 text-center text-sm text-muted-foreground">
      {prompt}{" "}
      <Link
        href={href}
        className="font-semibold text-accent no-underline transition-colors hover:underline"
      >
        {linkLabel}
      </Link>
    </p>
  );
}

/* kept for legacy imports */
export function AuthNavCta({
  href,
  children,
  variant = "primary",
}: {
  href: string;
  children: ReactNode;
  variant?: "primary" | "outline";
}) {
  return (
    <Link
      href={href}
      className={
        variant === "primary"
          ? "inline-flex items-center justify-center rounded-full border border-transparent bg-foreground px-[18px] py-[9px] text-sm font-semibold text-white no-underline whitespace-nowrap transition-colors hover:bg-gray-800"
          : "inline-flex items-center justify-center rounded-full border border-border bg-white px-[18px] py-[9px] text-sm font-semibold text-foreground no-underline whitespace-nowrap transition-colors hover:border-border-light hover:bg-muted"
      }
    >
      {children}
    </Link>
  );
}

/* ─── Password input ─────────────────────────────────────────────────────── */

type AuthPasswordInputProps = Omit<InputHTMLAttributes<HTMLInputElement>, "type"> & {
  withLockIcon?: boolean;
};

export function AuthPasswordInput({
  className,
  withLockIcon = false,
  id,
  ...props
}: AuthPasswordInputProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className="relative mt-1.5">
      {withLockIcon && (
        <Lock
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-gray-400"
          strokeWidth={ICON_STROKE}
        />
      )}
      <input
        {...props}
        id={id}
        type={visible ? "text" : "password"}
        className={cn("input", withLockIcon && "!pl-10", "!pr-[4.75rem]", className)}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-md border-none bg-transparent px-2 py-[0.35rem] text-xs font-semibold text-gray-500 transition-colors hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-controls={id}
      >
        {visible ? (
          <EyeOff className="size-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
        ) : (
          <Eye className="size-4 shrink-0" strokeWidth={ICON_STROKE} aria-hidden />
        )}
        <span className="leading-none">{visible ? "Hide" : "Show"}</span>
      </button>
    </div>
  );
}
