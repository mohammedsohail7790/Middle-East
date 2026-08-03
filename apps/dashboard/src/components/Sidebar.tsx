"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard, Phone, Users, Bot, Calendar,
  BarChart3, Puzzle, BookOpen, CreditCard, Hash,
  ChevronLeft, ChevronRight, Lock, LogOut, Menu, X,
  Activity,
  Workflow, LifeBuoy, ShieldCheck, Building2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { isNavItemLocked, getPlan } from "@/lib/store";

const NAV_GROUPS = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
    ],
  },
  {
    label: "Operations",
    items: [
      { name: "Calls", href: "/dashboard/calls", icon: Phone },
      { name: "Leads", href: "/dashboard/leads", icon: Users },
      { name: "AI Agent", href: "/dashboard/agent", icon: Bot },
      { name: "Calendar", href: "/dashboard/calendar", icon: Calendar },
      { name: "Analytics", href: "/dashboard/analytics", icon: BarChart3, plan: "professional" },
      { name: "Quality", href: "/dashboard/quality", icon: Activity, plan: "professional" },
    ],
  },
  {
    label: "Platform",
    items: [
      { name: "Integrations", href: "/dashboard/integrations", icon: Puzzle },
      { name: "Phone Numbers", href: "/dashboard/phone-numbers", icon: Hash },
      { name: "Business Profile", href: "/dashboard/knowledge", icon: BookOpen },
      { name: "Automation", href: "/dashboard/automation", icon: Workflow, plan: "professional" },
    ],
  },
  {
    label: "Account",
    items: [
      { name: "Organization", href: "/dashboard/organizations", icon: Building2 },
      { name: "Compliance", href: "/dashboard/compliance", icon: ShieldCheck },
      { name: "Support", href: "/dashboard/support", icon: LifeBuoy },
      { name: "Billing", href: "/dashboard/billing", icon: CreditCard },
      { name: "Spam Protection", href: "/dashboard/settings/spam", icon: ShieldCheck },
    ],
  },
];

export function Sidebar({ mobileOpen, onMobileClose }: { mobileOpen?: boolean; onMobileClose?: () => void }) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [plan, setPlanView] = useState(() => (typeof window !== "undefined" ? getPlan() : "trial"));

  useEffect(() => {
    const refresh = () => setPlanView(getPlan());
    refresh();
    window.addEventListener("calliq-plan-updated", refresh);
    return () => window.removeEventListener("calliq-plan-updated", refresh);
  }, []);

  const navContent = (isMobile: boolean) => (
    <>
      <div
        className={cn(
          "h-14 flex items-center shrink-0 border-b",
          collapsed && !isMobile ? "justify-center px-2" : "justify-between px-4",
        )}
        style={{ borderColor: "var(--color-sidebar-rule)" }}
      >
        <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0" onClick={onMobileClose}>
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: "var(--color-accent)", color: "var(--color-accent-ink)", boxShadow: "0 2px 8px rgba(14,165,233,0.4), inset 0 1px 0 rgba(255,255,255,0.2)" }}
          >
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden>
              <path d="M3.5 2C3.5 1.72 3.72 1.5 4 1.5h8c.28 0 .5.22.5.5v11c0 .28-.22.5-.5.5H4a.5.5 0 0 1-.5-.5V2Z" stroke="currentColor" strokeWidth="1.25" strokeLinejoin="round"/>
              <path d="M5.5 5h5M5.5 7.5h5M5.5 10h3" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
            </svg>
          </div>
          {(!collapsed || isMobile) && (
            <span className="text-sm font-semibold tracking-tight truncate" style={{ color: "var(--color-sidebar-ink)" }}>
              Call IQ
            </span>
          )}
        </Link>
        {!isMobile && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="p-1.5 rounded-md transition-colors"
            style={{ color: "var(--color-sidebar-muted)" }}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </button>
        )}
        {isMobile && (
          <button
            type="button"
            onClick={onMobileClose}
            className="p-1.5 rounded-md"
            style={{ color: "var(--color-sidebar-muted)" }}
            aria-label="Close menu"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      <nav className="flex-1 px-2 py-4 overflow-y-auto space-y-5">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            {(!collapsed || isMobile) && (
              <p
                className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-widest"
                style={{ color: "var(--color-sidebar-muted)" }}
              >
                {group.label}
              </p>
            )}
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname?.startsWith(item.href));
                const locked = isNavItemLocked(item.plan);
                const Icon = item.icon;

                return (
                  <Link
                    key={item.href}
                    href={locked ? "/dashboard/billing" : item.href}
                    onClick={onMobileClose}
                    title={locked ? `Upgrade to unlock ${item.name}` : item.name}
                    className={cn(
                      "group relative flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
                      collapsed && !isMobile && "justify-center px-2",
                      locked && "opacity-50",
                      !active && "sidebar-nav-inactive",
                    )}
                    style={
                      active
                        ? {
                            background: "var(--color-sidebar-elevated)",
                            color: "var(--color-sidebar-ink)",
                            boxShadow: "inset 2px 0 0 var(--color-accent)",
                          }
                        : { color: "var(--color-sidebar-muted)" }
                    }
                  >
                    <Icon className="w-[17px] h-[17px] shrink-0" />
                    {(!collapsed || isMobile) && <span className="flex-1 truncate">{item.name}</span>}
                    {locked && (!collapsed || isMobile) && <Lock className="w-3 h-3 opacity-60" />}
                    {collapsed && !isMobile && !locked && (
                      <div
                        className="absolute left-full ml-3 px-2.5 py-1.5 text-xs rounded-md whitespace-nowrap opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all pointer-events-none z-50"
                        style={{
                          background: "var(--color-ink)",
                          color: "var(--color-paper)",
                          boxShadow: "var(--shadow-md)",
                        }}
                      >
                        {item.name}
                      </div>
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {(!collapsed || isMobile) ? (
        <div className="px-3 pb-2">
          <div
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium capitalize"
            style={{
              background: "var(--color-sidebar-elevated)",
              color: "var(--color-sidebar-muted)",
              border: "1px solid var(--color-sidebar-rule)",
            }}
          >
            <span
              className="w-1.5 h-1.5 rounded-full shrink-0"
              style={{ background: "var(--color-accent)" }}
            />
            {plan || "Trial"} plan
          </div>
        </div>
      ) : null}

      <div className="p-3 border-t" style={{ borderColor: "var(--color-sidebar-rule)" }}>
        <button
          type="button"
          onClick={() => void import("@/lib/auth-actions").then((m) => m.signOutAndRedirect())}
          className={cn(
            "w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors",
            collapsed && !isMobile && "justify-center",
          )}
          style={{ color: "var(--color-sidebar-muted)" }}
        >
          <LogOut className="w-[17px] h-[17px]" />
          {(!collapsed || isMobile) && <span>Sign out</span>}
        </button>
      </div>
    </>
  );

  return (
    <>
      <motion.aside
        animate={{ width: collapsed ? 72 : 248 }}
        transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        className="hidden md:flex dashboard-sidebar relative z-30 before:absolute before:inset-x-0 before:top-0 before:h-px before:bg-gradient-to-r before:from-transparent before:via-[var(--color-accent)] before:to-transparent"
      >
        {navContent(false)}
      </motion.aside>

      <AnimatePresence>
        {mobileOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 md:hidden"
              style={{ background: "oklch(19% 0.04 265 / 0.45)" }}
              onClick={onMobileClose}
            />
            <motion.aside
              initial={{ x: -280 }}
              animate={{ x: 0 }}
              exit={{ x: -280 }}
              className="fixed inset-y-0 left-0 z-50 w-[248px] dashboard-sidebar md:hidden flex flex-col"
            >
              {navContent(true)}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}

export function MobileMenuButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="md:hidden p-2 rounded-lg border transition-colors"
      style={{ borderColor: "var(--color-rule)", color: "var(--color-ink-2)" }}
      aria-label="Open menu"
    >
      <Menu className="w-5 h-5" />
    </button>
  );
}
