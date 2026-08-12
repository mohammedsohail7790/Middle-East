"use client";

import { motion, useReducedMotion } from "framer-motion";
import { Phone, Users, TrendingUp, Activity } from "lucide-react";

const MINI_STATS = [
  { label: "Calls today", value: "47", icon: Phone },
  { label: "Leads", value: "12", icon: Users },
  { label: "Conversion", value: "26%", icon: TrendingUp },
];

const CALLS = [
  { title: "Appointment booked — HVAC service", time: "2m ago", status: "success" },
  { title: "Lead captured — new homeowner inquiry", time: "8m ago", status: "success" },
  { title: "Emergency routed to on-call", time: "14m ago", status: "warn" },
];

export function ProductPreview() {
  const reduced = useReducedMotion();

  return (
    <motion.div
      className="premium-preview relative w-full max-w-[540px] mx-auto lg:mx-0 lg:ml-auto min-w-0 px-0 sm:px-2"
      initial={reduced ? false : { opacity: 0, y: 32, scale: 0.98 }}
      animate={reduced ? undefined : { opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.7, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
    >
      <div className="premium-preview-glow" aria-hidden />
      <div className="premium-preview-frame">
        <div className="premium-preview-chrome">
          <span className="premium-preview-title">Halla AI · Operations</span>
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-medium text-emerald-600">
            <Activity className="w-3 h-3" />
            Live
          </span>
        </div>
        <div className="premium-preview-body">
          <div className="grid grid-cols-3 gap-2 mb-4">
            {MINI_STATS.map((s, i) => (
              <motion.div
                key={s.label}
                className="premium-preview-stat"
                initial={reduced ? false : { opacity: 0, y: 8 }}
                animate={reduced ? undefined : { opacity: 1, y: 0 }}
                transition={{ delay: 0.35 + i * 0.08 }}
              >
                <s.icon className="w-3.5 h-3.5 mb-1" style={{ color: "var(--color-accent)" }} />
                <p className="text-lg font-bold tabular-nums leading-none">{s.value}</p>
                <p className="text-[9px] uppercase tracking-wider mt-1 opacity-70">{s.label}</p>
              </motion.div>
            ))}
          </div>
          <div className="h-24 rounded-lg mb-3 relative overflow-hidden border border-[var(--color-rule)]">
            <div
              className="absolute inset-0 opacity-90"
              style={{
                background:
                  "linear-gradient(180deg, var(--color-accent-muted) 0%, transparent 100%)",
              }}
            />
            <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="none" viewBox="0 0 400 96">
              <motion.path
                d="M0,72 Q50,40 100,55 T200,35 T300,50 T400,28 L400,96 L0,96 Z"
                fill="var(--color-accent)"
                fillOpacity="0.15"
                initial={reduced ? false : { pathLength: 0, opacity: 0 }}
                animate={reduced ? undefined : { pathLength: 1, opacity: 1 }}
                transition={{ duration: 1.2, delay: 0.5 }}
              />
              <motion.path
                d="M0,72 Q50,40 100,55 T200,35 T300,50 T400,28"
                fill="none"
                stroke="var(--color-accent)"
                strokeWidth="2"
                initial={reduced ? false : { pathLength: 0 }}
                animate={reduced ? undefined : { pathLength: 1 }}
                transition={{ duration: 1.2, delay: 0.5 }}
              />
            </svg>
          </div>
          <p className="text-[10px] font-semibold uppercase tracking-wider mb-2" style={{ color: "var(--color-ink-3)" }}>
            Recent activity
          </p>
          <ul className="space-y-2">
            {CALLS.map((c, i) => (
              <motion.li
                key={c.title}
                className="premium-preview-row"
                initial={reduced ? false : { opacity: 0, x: -8 }}
                animate={reduced ? undefined : { opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    c.status === "warn" ? "bg-amber-500" : "bg-emerald-500"
                  }`}
                />
                <span className="flex-1 truncate text-xs font-medium">{c.title}</span>
                <span className="text-[10px] shrink-0" style={{ color: "var(--color-ink-muted)" }}>
                  {c.time}
                </span>
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    </motion.div>
  );
}
