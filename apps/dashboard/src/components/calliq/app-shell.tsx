"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import {
  LayoutDashboard, Phone, Users, Bot, Calendar, MessageSquare, BarChart3,
  Puzzle, BookOpen, Lock, CreditCard, Hash, LogOut, Shield,
  PanelLeftClose, PanelLeft, X, LifeBuoy, type LucideIcon,
} from "lucide-react";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { cn } from "@/lib/utils";
import { isNavItemLocked } from "@/lib/store";
import {
  DASHBOARD_NAV_GROUPS,
  navLockedTitle,
  type DashboardNavItem,
} from "@/lib/dashboard-nav";
import { CallIqLogo } from "@/components/brand/CallIqLogo";
import Image from "next/image";
import { MobileBottomNav } from "@/components/calliq/MobileBottomNav";
import { DashboardTopbar } from "@/components/dashboard/DashboardTopbar";
import { useDashboardSync } from "@/lib/dashboard-sync";
import { fetchWorkspaceProfile, type WorkspaceProfile } from "@/lib/ensure-tenant";
import { getLastBootstrap } from "@/lib/dashboard-bootstrap";

const NAV_ICONS: Record<string, LucideIcon> = {
  "/dashboard": LayoutDashboard,
  "/dashboard/calls": Phone,
  "/dashboard/leads": Users,
  "/dashboard/agent": Bot,
  "/dashboard/calendar": Calendar,
  "/dashboard/analytics": BarChart3,
  "/dashboard/integrations": Puzzle,
  "/dashboard/knowledge": BookOpen,
  "/dashboard/phone-numbers": Hash,
  "/dashboard/compliance": Lock,
  "/dashboard/billing": CreditCard,
  "/dashboard/settings/spam": Shield,
  "/dashboard/support": LifeBuoy,
};

function NavLink({
  item,
  active,
  locked,
  collapsed,
  onNavigate,
}: {
  item: DashboardNavItem;
  active: boolean;
  locked: boolean;
  collapsed: boolean;
  onNavigate: () => void;
}) {
  const Icon = NAV_ICONS[item.href] ?? LayoutDashboard;
  const title = navLockedTitle(item, locked);

  return (
    <Link
      href={locked ? "/dashboard/billing" : item.href}
      onClick={onNavigate}
      className={cn(
        "dashboard-nav-link",
        active && "is-active",
        locked && "opacity-50",
        collapsed && "justify-center px-2",
      )}
      title={title}
      aria-label={locked ? `${item.label} (upgrade required)` : item.label}
    >
      <span className="nav-icon-well">
        <Icon className="size-4" strokeWidth={ICON_STROKE} />
      </span>
      {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
      {!collapsed && locked && (
        <Lock className="size-3 shrink-0 opacity-70" strokeWidth={ICON_STROKE} aria-hidden />
      )}
    </Link>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const [planTick, setPlanTick] = useState(0);
  const [workspace, setWorkspace] = useState<WorkspaceProfile | null>(null);

  useEffect(() => {
    let cancelled = false;
    const boot = getLastBootstrap();
    if (boot?.tenant) {
      setWorkspace({
        id: boot.tenant.id,
        companyName: boot.tenant.companyName ?? boot.tenant.company_name,
      });
    }
    void fetchWorkspaceProfile().then((profile) => {
      if (!cancelled && profile) setWorkspace(profile);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const onPlan = () => setPlanTick((n) => n + 1);
    window.addEventListener("calliq-plan-updated", onPlan);
    return () => window.removeEventListener("calliq-plan-updated", onPlan);
  }, []);

  useDashboardSync(["billing"], () => {
    setPlanTick((n) => n + 1);
  });

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!mobileOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [mobileOpen]);

  const closeMobile = () => setMobileOpen(false);

  return (
    <div className="dashboard-app h-[100dvh] max-h-[100dvh] flex w-full min-w-0 overflow-hidden">
      <a href="#main-content" className="dashboard-skip-link">
        Skip to main content
      </a>
      <aside
        className={cn(
          "dashboard-sidebar fixed lg:relative lg:shrink-0 inset-y-0 left-0 h-full max-h-[100dvh] flex flex-col overflow-hidden transition-all duration-300",
          mobileOpen ? "z-[60] translate-x-0" : "z-40 -translate-x-full lg:translate-x-0",
          collapsed ? "w-[72px]" : "w-[280px]",
          "max-w-[min(100vw,300px)]",
        )}
      >
        <div
          className={cn(
            "dashboard-sidebar-brand relative shrink-0 border-b border-[var(--sidebar-border)]",
            collapsed ? "flex flex-col items-center gap-2 px-2 py-3" : "px-3 pt-3 pb-2",
          )}
        >
          {collapsed ? (
            <Link href="/dashboard" className="dashboard-sidebar-icon shrink-0" aria-label="Call IQ">
              <Image
                src="/logo.png"
                alt=""
                width={40}
                height={80}
                className="h-10 w-10 object-cover object-top"
                priority
              />
            </Link>
          ) : (
            <div className="dashboard-sidebar-logo flex justify-center pr-8">
              <CallIqLogo href="/dashboard" size="lg" centered className="w-full max-w-[220px]" />
            </div>
          )}
          {collapsed ? (
            <button
              type="button"
              onClick={() => setCollapsed(false)}
              className="hidden lg:grid size-8 place-items-center rounded-lg text-muted-foreground hover:bg-[var(--nav-hover)]"
              aria-label="Expand sidebar"
            >
              <PanelLeft className="size-4" />
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={closeMobile}
                className="lg:hidden absolute top-2 right-2 grid size-8 place-items-center rounded-lg bg-[var(--sidebar)] text-muted-foreground shadow-sm hover:bg-[var(--nav-hover)]"
                aria-label="Close menu"
              >
                <X className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                className="hidden lg:grid absolute top-2 right-2 size-8 place-items-center rounded-lg bg-[var(--sidebar)] text-muted-foreground shadow-sm hover:bg-[var(--nav-hover)]"
                aria-label="Collapse sidebar"
              >
                <PanelLeftClose className="size-4" />
              </button>
            </>
          )}
        </div>

        <div className="dashboard-sidebar-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain scrollbar-thin">
          <nav className="dashboard-sidebar-nav p-3 space-y-5" aria-label="Main navigation">
            {DASHBOARD_NAV_GROUPS.map((group) => (
              <div key={group.label}>
                {!collapsed && (
                  <p className="dashboard-nav-group-label">{group.label}</p>
                )}
                <div className="space-y-0.5">
                  {group.items.map((item) => {
                    const active =
                      pathname === item.href ||
                      (item.href !== "/dashboard" && pathname?.startsWith(item.href));
                    const locked = item.plan ? isNavItemLocked(item.plan) : false;
                    void planTick;

                    return (
                      <NavLink
                        key={item.href}
                        item={item}
                        active={active}
                        locked={locked}
                        collapsed={collapsed}
                        onNavigate={closeMobile}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>

          <div className="dashboard-sidebar-footer p-3 border-t border-[var(--sidebar-border)]">
            <button
              type="button"
              onClick={() => void import("@/lib/auth-actions").then((m) => m.signOutAndRedirect())}
              className={cn(
                "dashboard-nav-link w-full border-0 bg-transparent cursor-pointer",
                collapsed && "justify-center px-2",
              )}
              title={collapsed ? "Sign out" : undefined}
              aria-label="Sign out"
            >
              <span className="nav-icon-well">
                <LogOut className="size-4" strokeWidth={ICON_STROKE} />
              </span>
              {!collapsed && <span>Sign out</span>}
            </button>
          </div>
        </div>
      </aside>

      {mobileOpen && (
        <div
          onClick={closeMobile}
          className="fixed inset-0 bg-black/40 z-40 lg:hidden backdrop-blur-sm"
          aria-hidden
        />
      )}

      <div className="flex-1 flex flex-col min-w-0 min-h-0 w-full overflow-hidden">
        <DashboardTopbar
          workspace={workspace}
          onOpenMenu={() => setMobileOpen(true)}
          planTick={planTick}
        />

        <main id="main-content" className="dashboard-canvas" tabIndex={-1}>
          <div className="dashboard-canvas-inner dashboard-canvas-inner--mobile-nav">{children}</div>
        </main>

        <MobileBottomNav hidden={mobileOpen} onOpenMenu={() => setMobileOpen(true)} />
      </div>
    </div>
  );
}
