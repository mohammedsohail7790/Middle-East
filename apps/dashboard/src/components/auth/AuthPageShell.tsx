"use client";

import type { InputHTMLAttributes, ReactNode } from "react";
import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { Eye, EyeOff, Lock } from "lucide-react";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { cn } from "@/lib/utils";

/* ─── Shell ──────────────────────────────────────────────────────────────── */

export function AuthPageShell({ children }: { children: ReactNode }) {
  useEffect(() => {
    const prev = document.body.getAttribute("style") ?? "";
    document.body.style.cssText =
      "overflow:auto!important;background:#f1f5f9!important;background-image:none!important;min-height:100dvh";
    document.documentElement.style.overflow = "auto";
    return () => {
      document.body.setAttribute("style", prev);
      document.documentElement.style.overflow = "";
    };
  }, []);

  return (
    <div className="min-h-dvh grid grid-rows-[auto_1fr_auto] bg-slate-50 font-sans text-[#0A0A0A] antialiased">
      <header className="sticky top-0 z-50 border-b border-gray-200 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-[1120px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex shrink-0 items-center">
            <Image
              src="/logo.png"
              alt="Halla AI"
              width={160}
              height={48}
              className="block h-[48px] w-auto object-contain object-left"
              priority
            />
          </Link>
          <nav className="hidden sm:flex items-center gap-0.5 flex-1 pl-3">
            <Link
              href="/pricing"
              className="inline-flex items-center rounded-lg px-3 py-[7px] text-sm font-medium text-gray-500 no-underline transition-colors hover:bg-gray-100 hover:text-[#0A0A0A] whitespace-nowrap"
            >
              Pricing
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex items-center rounded-lg px-3 py-[7px] text-sm font-medium text-gray-500 no-underline transition-colors hover:bg-gray-100 hover:text-[#0A0A0A] whitespace-nowrap"
            >
              How it works
            </Link>
          </nav>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Link
              href="/login"
              className="inline-flex items-center rounded-full border border-gray-200 bg-transparent px-4 py-2 text-sm font-medium text-gray-600 no-underline whitespace-nowrap transition-colors hover:border-gray-400 hover:bg-white hover:text-[#0A0A0A]"
            >
              Sign in
            </Link>
            <Link
              href="/signup"
              className="inline-flex items-center rounded-full bg-[var(--gold)] px-[18px] py-[9px] text-sm font-semibold text-white no-underline shadow-[0_2px_10px_var(--gold-glow)] whitespace-nowrap transition-all hover:bg-[var(--gold-dark)] hover:shadow-[0_4px_16px_var(--gold-glow)] hover:-translate-y-px"
            >
              Start free trial
            </Link>
          </div>
        </div>
      </header>

      <main className="flex items-center justify-center px-4 py-12 sm:py-16">
        {children}
      </main>

      <footer className="border-t border-gray-200 bg-white">
        <div className="mx-auto flex w-full max-w-[1120px] flex-col items-center justify-between gap-3 px-4 py-4 sm:flex-row sm:px-6">
          <p className="text-center text-[0.78rem] text-gray-400 sm:text-left">
            &copy; {new Date().getFullYear()} Halla AI Labs &middot;{" "}
            <Link href="/privacy" className="text-gray-400 no-underline transition-colors hover:text-[#0A0A0A]">Privacy</Link> &middot;{" "}
            <Link href="/terms" className="text-gray-400 no-underline transition-colors hover:text-[#0A0A0A]">Terms</Link> &middot;{" "}
            <Link href="/security" className="text-gray-400 no-underline transition-colors hover:text-[#0A0A0A]">Security</Link>
          </p>
          <div className="flex items-center gap-[14px]">
            <span className="flex items-center gap-[5px] text-[0.7rem] font-semibold uppercase tracking-wide text-gray-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3 shrink-0 stroke-gray-400"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>
              SOC 2 Type II
            </span>
            <span className="flex items-center gap-[5px] text-[0.7rem] font-semibold uppercase tracking-wide text-gray-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3 shrink-0 stroke-gray-400"><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></svg>
              256-bit SSL
            </span>
            <span className="flex items-center gap-[5px] text-[0.7rem] font-semibold uppercase tracking-wide text-gray-400">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="size-3 shrink-0 stroke-gray-400"><circle cx="12" cy="12" r="10" /><path d="M12 8v4l3 3" /></svg>
              99.9% Uptime
            </span>
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
    <div className="w-full max-w-[420px] rounded-2xl border border-gray-200 bg-white px-6 py-8 sm:px-10 sm:py-10 shadow-[0_1px_3px_rgba(0,0,0,0.04),0_8px_28px_rgba(0,0,0,0.08)]">
      <h1 className="text-2xl font-extrabold tracking-tight text-[#0A0A0A]">
        {title}
      </h1>
      {description && (
        <p className="mt-1 text-sm leading-relaxed text-gray-500">
          {description}
        </p>
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
      className="rounded-xl border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-700"
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
    <p className="mt-6 text-center text-sm text-gray-500">
      {prompt}{" "}
      <Link href={href} className="font-semibold text-[#0A0A0A] no-underline transition-colors hover:text-[var(--gold-dark)]">
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
          ? "inline-flex items-center justify-center rounded-full border border-transparent bg-[#0A0A0A] px-[18px] py-[9px] text-sm font-semibold text-white no-underline whitespace-nowrap transition-colors hover:bg-gray-800"
          : "inline-flex items-center justify-center rounded-full border border-gray-200 bg-white px-[18px] py-[9px] text-sm font-semibold text-[#0A0A0A] no-underline whitespace-nowrap transition-colors hover:bg-gray-50 hover:border-gray-400"
      }
    >
      {children}
    </Link>
  );
}

/* ─── Password input ─────────────────────────────────────────────────────── */

type AuthPasswordInputProps = Omit<
  InputHTMLAttributes<HTMLInputElement>,
  "type"
> & {
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
        className={cn(
          "input",
          withLockIcon && "!pl-10",
          "!pr-[4.75rem]",
          className,
        )}
      />
      <button
        type="button"
        className="absolute right-2 top-1/2 inline-flex -translate-y-1/2 items-center gap-1 rounded-md border-none bg-transparent px-2 py-[0.35rem] text-xs font-semibold text-gray-500 transition-colors hover:text-gray-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-500"
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
