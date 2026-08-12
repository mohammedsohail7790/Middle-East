"use client";

import Link from "next/link";
import { Menu, X } from "lucide-react";
import { useState, useEffect } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";

const LINKS = [
  { href: "#platform", label: "Platform" },
  { href: "#features", label: "Features" },
  { href: "#pricing", label: "Pricing" },
  { href: "#how", label: "How it works" },
];

export function MarketingNav() {
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const reduced = useReducedMotion();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [open]);

  const inner = (
    <>
      <Link href="/" className="flex items-center gap-2.5 shrink-0 min-w-0" onClick={() => setOpen(false)}>
        <div
          className="w-9 h-9 rounded-xl flex items-center justify-center text-[11px] font-bold shrink-0"
          style={{ background: "var(--gradient-brand)", color: "var(--color-accent-ink)" }}
        >
          CQ
        </div>
        <span className="font-bold text-base tracking-tight truncate" style={{ color: "var(--color-ink)" }}>
          Halla AI
        </span>
      </Link>

      <nav className="hidden lg:flex items-center gap-1">
        {LINKS.map((l) => (
          <a
            key={l.href}
            href={l.href}
            className="px-4 py-2 rounded-full text-sm font-medium transition-colors hover:bg-[var(--color-paper-3)]"
            style={{ color: "var(--color-ink-2)" }}
          >
            {l.label}
          </a>
        ))}
      </nav>

      <div className="hidden md:flex items-center gap-2 shrink-0">
        <Link href="/login" className="premium-btn-secondary !py-2.5 !px-5 !w-auto text-sm">
          Sign in
        </Link>
        <Link href="/signup" className="premium-btn-primary !py-2.5 !px-5 !w-auto text-sm">
          Start free trial
        </Link>
      </div>

      <button
        type="button"
        className="lg:hidden p-2.5 rounded-xl border shrink-0 min-w-[44px] min-h-[44px] flex items-center justify-center"
        style={{ borderColor: "var(--color-rule)" }}
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        aria-label={open ? "Close menu" : "Open menu"}
      >
        {open ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>
    </>
  );

  return (
    <>
      <motion.header
        className={scrolled ? "marketing-nav-float px-3 py-2" : "marketing-nav-shell"}
        initial={reduced ? false : { y: -16, opacity: 0 }}
        animate={reduced ? undefined : { y: 0, opacity: 1 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className={scrolled ? "flex items-center justify-between gap-3 h-12 px-2" : "marketing-nav-inner"}>
          {inner}
        </div>
      </motion.header>

      <AnimatePresence>
        {open && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[60] lg:hidden"
              style={{ background: "oklch(16% 0.04 265 / 0.5)" }}
              onClick={() => setOpen(false)}
            />
            <motion.nav
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ type: "tween", duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              className="fixed top-0 right-0 bottom-0 z-[70] w-[min(100%,20rem)] flex flex-col p-5 pt-[max(1.25rem,env(safe-area-inset-top))] shadow-2xl lg:hidden"
              style={{ background: "var(--color-elevated)", borderLeft: "1px solid var(--color-rule)" }}
            >
              <div className="flex items-center justify-between mb-6">
                <span className="font-bold">Menu</span>
                <button type="button" onClick={() => setOpen(false)} className="p-2 rounded-lg" aria-label="Close">
                  <X className="w-5 h-5" />
                </button>
              </div>
              {LINKS.map((l) => (
                <a
                  key={l.href}
                  href={l.href}
                  className="py-3.5 px-3 rounded-xl text-base font-medium border-b"
                  style={{ borderColor: "var(--color-rule)", color: "var(--color-ink)" }}
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </a>
              ))}
              <div className="mt-auto flex flex-col gap-2 pt-6">
                <Link href="/login" className="premium-btn-secondary w-full text-center" onClick={() => setOpen(false)}>
                  Sign in
                </Link>
                <Link href="/signup" className="premium-btn-primary w-full text-center" onClick={() => setOpen(false)}>
                  Start free trial
                </Link>
              </div>
            </motion.nav>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
