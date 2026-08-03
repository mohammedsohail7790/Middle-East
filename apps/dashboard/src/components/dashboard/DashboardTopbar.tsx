"use client";

import { Link } from "@/i18n/navigation";
import { usePathname } from "@/i18n/navigation";
import { useEffect, useState } from "react";
import {
  LayoutDashboard,
  Phone,
  Users,
  Bot,
  Calendar,
  BarChart3,
  Puzzle,
  BookOpen,
  Settings,
  CreditCard,
  Hash,
  Menu,
  ChevronRight,
  Radio,
  LifeBuoy,
  type LucideIcon,
} from "lucide-react";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { cn } from "@/lib/utils";
import { getPlan } from "@/lib/store";
import { navPageTitle, navPageSubtitle } from "@/lib/dashboard-nav";
import { GlobalSearch } from "@/components/GlobalSearch";
import { ThemeToggle } from "@/components/ui-kit/ThemeToggle";
import { NotificationsCenter } from "@/components/dashboard/NotificationsCenter";
import { LanguageSwitcher } from "@/components/dashboard/LanguageSwitcher";
import { useDashboardLive } from "@/components/dashboard/DashboardRealtimeProvider";
import type { WorkspaceProfile } from "@/lib/ensure-tenant";

const PLAN_LABELS: Record<string, string> = {
  trial: "Trial",
  essential: "Essential",
  starter: "Essential",
  professional: "Professional",
};

function usePageMeta() {
  const pathname = usePathname();
  const title = navPageTitle(pathname || "/dashboard");
  const subtitle = navPageSubtitle(pathname || "/dashboard");
  const key = (pathname || "/dashboard").split("/").filter(Boolean)[1] ?? "dashboard";
  const icon = ROUTE_ICONS[key] ?? LayoutDashboard;
  return { title, subtitle, icon };
}

const ROUTE_ICONS: Record<string, LucideIcon> = {
  dashboard: LayoutDashboard,
  calls: Phone,
  leads: Users,
  agent: Bot,
  calendar: Calendar,
  analytics: BarChart3,
  integrations: Puzzle,
  knowledge: BookOpen,
  billing: CreditCard,
  "phone-numbers": Hash,
  settings: Settings,
  support: LifeBuoy,
};

function workspaceInitials(workspace: WorkspaceProfile | null): string {
  const name = workspace?.companyName?.trim();
  if (name) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    return name.slice(0, 2).toUpperCase();
  }
  return (workspace?.email?.[0] || "C").toUpperCase();
}

function LiveStatusPill() {
  const { connected, lastError } = useDashboardLive();

  if (lastError && !connected) {
    return (
      <span className="dashboard-live-pill dashboard-live-pill--warn" title={lastError} role="status" aria-live="polite">
        <span className="dashboard-live-dot dashboard-live-dot--warn" />
        Reconnecting
      </span>
    );
  }

  if (connected) {
    return (
      <span className="dashboard-live-pill dashboard-live-pill--live" role="status" aria-live="polite">
        <span className="dashboard-live-dot dashboard-live-dot--live" />
        <Radio className="size-3 opacity-80" strokeWidth={ICON_STROKE} />
        Live
      </span>
    );
  }

  return (
    <span className="dashboard-live-pill dashboard-live-pill--idle" role="status" aria-live="polite">
      <span className="dashboard-live-dot dashboard-live-dot--idle" />
      Synced
    </span>
  );
}

type Props = {
  workspace: WorkspaceProfile | null;
  onOpenMenu: () => void;
  planTick: number;
};

export function DashboardTopbar({ workspace, onOpenMenu, planTick }: Props) {
  const { title, subtitle, icon: PageIcon } = usePageMeta();
  const [planId, setPlanId] = useState("trial");
  const [planLabel, setPlanLabel] = useState("");

  useEffect(() => {
    void planTick;
    const plan = getPlan();
    setPlanId(plan);
    setPlanLabel(PLAN_LABELS[plan] ?? plan);
  }, [planTick]);

  const initials = workspaceInitials(workspace);
  const company = workspace?.companyName?.trim() || "Your workspace";
  const email = workspace?.email || "Signed in";

  return (
    <header className="dashboard-header">
      <div className="dashboard-header-menu">
        <button
          type="button"
          className="dashboard-icon-btn lg:hidden"
          onClick={onOpenMenu}
          aria-label="Open menu"
        >
          <Menu className="size-5" />
        </button>
      </div>

      <div className="dashboard-header-context">
        <div className="dashboard-header-context-mobile lg:hidden min-w-0">
          <p className="dashboard-topbar-title truncate">{title}</p>
        </div>

        <div className="dashboard-header-context-desktop hidden lg:flex items-center gap-3 min-w-0">
          <div className="dashboard-topbar-icon-well" aria-hidden>
            <PageIcon className="size-[1.125rem]" strokeWidth={ICON_STROKE} />
          </div>
          <div className="min-w-0">
            <nav className="dashboard-topbar-breadcrumb" aria-label="Breadcrumb">
              <span className="dashboard-topbar-breadcrumb-root">Workspace</span>
              <ChevronRight className="size-3 opacity-50 shrink-0" strokeWidth={ICON_STROKE} />
              <span className="dashboard-topbar-breadcrumb-current truncate">{title}</span>
            </nav>
            <div className="flex items-baseline gap-2 min-w-0 mt-0.5">
              <h1 className="dashboard-topbar-heading truncate">{title}</h1>
            </div>
            <p className="dashboard-topbar-subtitle truncate">{subtitle}</p>
          </div>
        </div>
      </div>

      <div className="dashboard-header-search">
        <GlobalSearch />
      </div>

      <div className="dashboard-header-actions">
        <LiveStatusPill />
        <div className="dashboard-header-utilities hidden sm:flex items-center gap-1.5">
          <LanguageSwitcher />
          <ThemeToggle />
          <NotificationsCenter />
        </div>
        <Link
          href="/dashboard/settings"
          className="dashboard-workspace-chip"
          title={`${company} · ${email}`}
          aria-label={`Workspace settings for ${company}`}
        >
          <div className="dashboard-workspace-avatar" aria-hidden>
            {initials}
          </div>
          <div className="dashboard-workspace-meta hidden sm:block min-w-0">
            <div className="flex items-center gap-1.5 min-w-0">
              <span className="dashboard-workspace-name truncate">{company}</span>
              {planLabel && (
                <span className={cn("dashboard-plan-badge", `dashboard-plan-badge--${planId}`)}>
                  {planLabel}
                </span>
              )}
            </div>
            <span className="dashboard-workspace-email truncate">{email}</span>
          </div>
        </Link>
      </div>
    </header>
  );
}
