"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { useState } from "react";
import Link from "next/link";
import { Eye, EyeOff, Lock } from "lucide-react";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { cn } from "@/lib/utils";
import { HallaAiLogo } from "@/components/brand/HallaAiLogo";

/* ─── Shell ──────────────────────────────────────────────────────────────── */

export function AuthPageShell({ children }: { children: ReactNode }) {
  return (
    <div className="auth-marketing-shell relative grid min-h-dvh grid-rows-[auto_1fr_auto] overflow-x-hidden bg-background antialiased">
      <header className="sticky top-0 z-50 border-b border-border/70 bg-background/75 backdrop-blur-2xl backdrop-saturate-150">
        <div className="mx-auto flex h-14 w-full max-w-[1120px] items-center gap-4 px-5">
          <HallaAiLogo href="/" size="sm" />
          <nav className="hidden flex-1 items-center gap-1 pl-4 sm:flex" aria-label="Main">
            <Link href="/pricing" className="rounded-full px-3 py-1.5 text-[13px] text-muted-foreground no-underline transition-colors hover:text-foreground">
              Pricing
            </Link>
            <Link href="/how-it-works" className="rounded-full px-3 py-1.5 text-[13px] text-muted-foreground no-underline transition-colors hover:text-foreground">
              How it works
            </Link>
          </nav>
          <div className="ml-auto flex shrink-0 items-center gap-2">
            <Link href="/login" className="px-3 py-1.5 text-[13px] text-muted-foreground no-underline transition-colors hover:text-foreground">
              Sign in
            </Link>
            <Link href="/signup" className="btn-primary !min-h-0 !px-4 !py-1.5 !text-[13px] no-underline">
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      <main className="relative z-10 flex items-center justify-center px-4 py-12 sm:py-20">
        <div className="auth-layout-form flex w-full justify-center">{children}</div>
      </main>

      <footer className="relative z-10 border-t border-border/70 bg-[var(--surface-card)]">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center justify-between gap-2 px-5 py-4 sm:flex-row">
          <p className="text-center text-[12px] text-muted-foreground sm:text-left">
            &copy; {new Date().getFullYear()} Halla AI &middot;{" "}
            <Link href="/privacy" className="text-muted-foreground no-underline hover:text-foreground hover:underline">Privacy</Link>{" "}
            &middot;{" "}
            <Link href="/terms" className="text-muted-foreground no-underline hover:text-foreground hover:underline">Terms</Link>
          </p>
          <p className="text-[12px] text-muted-foreground">
            Also from Halla AI:{" "}
            <a href="https://meetklaros.com" target="_blank" rel="noopener" className="text-accent no-underline hover:underline">Klaros AI &#8599;</a>
          </p>
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
    <div className="relative w-full max-w-[420px] rounded-3xl bg-[var(--surface-card)] px-6 py-8 sm:px-10 sm:py-10">
      <h1 className="text-[1.75rem] font-semibold leading-tight tracking-[-0.03em] text-foreground">{title}</h1>
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
      className="rounded-xl bg-[color-mix(in_srgb,var(--red)_10%,transparent)] px-3 py-2 text-sm text-[color:var(--red)]"
      role="alert"
    >
      {message}
    </p>
  );
}

export function AuthNotice({ message }: { message: string }) {
  return (
    <p
      className="rounded-xl bg-[var(--surface-active)] px-3 py-2 text-sm text-foreground"
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
          ? "inline-flex items-center justify-center rounded-full bg-accent px-[18px] py-[9px] text-sm font-medium text-white no-underline whitespace-nowrap transition-colors hover:bg-accent-dark"
          : "inline-flex items-center justify-center rounded-full bg-[var(--surface-card)] px-[18px] py-[9px] text-sm font-medium text-foreground no-underline whitespace-nowrap transition-colors hover:bg-[var(--surface-active)]"
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
