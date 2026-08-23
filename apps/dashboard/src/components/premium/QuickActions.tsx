"use client";

import { Link } from "@/i18n/navigation";
import { motion, useReducedMotion } from "framer-motion";
import { Phone, Bot, Users, BarChart3, ArrowUpRight } from "lucide-react";

const ACTIONS = [
  { href: "/dashboard/calls", label: "Review calls", desc: "Transcripts & outcomes", icon: Phone },
  { href: "/dashboard/agent", label: "Configure agent", desc: "Voice & scripts", icon: Bot },
  { href: "/dashboard/leads", label: "Leads", desc: "Pipeline & conversions", icon: Users },
  { href: "/dashboard/analytics", label: "Analytics", desc: "Performance trends", icon: BarChart3 },
];

export function QuickActions() {
  const reduced = useReducedMotion();

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 mb-6 sm:mb-8 min-w-0">
      {ACTIONS.map((a, i) => (
        <motion.div
          key={a.href}
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={reduced ? undefined : { opacity: 1, y: 0 }}
          transition={{ delay: 0.1 + i * 0.06, duration: 0.35 }}
        >
          <Link href={a.href} className="quick-action-tile group h-full">
            <div className="flex items-start justify-between">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: "var(--color-accent-muted)", color: "var(--color-accent)" }}
              >
                <a.icon className="w-5 h-5" />
              </div>
              <ArrowUpRight
                className="w-4 h-4 opacity-0 -translate-x-1 group-hover:opacity-100 group-hover:translate-x-0 transition-all"
                style={{ color: "var(--color-accent)" }}
              />
            </div>
            <div>
              <p className="font-semibold text-sm" style={{ color: "var(--color-ink)" }}>
                {a.label}
              </p>
              <p className="text-xs mt-0.5" style={{ color: "var(--color-ink-3)" }}>
                {a.desc}
              </p>
            </div>
          </Link>
        </motion.div>
      ))}
    </div>
  );
}
