"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sidebar, MobileMenuButton } from "@/components/Sidebar";
import { GlobalSearch } from "@/components/GlobalSearch";
import { NotificationsCenter } from "@/components/dashboard/NotificationsCenter";

const ROUTE_LABELS: Record<string, string> = {
  dashboard: "Overview",
  calls: "Calls",
  leads: "Leads",
  agent: "AI Agent",
  calendar: "Calendar",
  analytics: "Analytics",
  integrations: "Integrations",
  "phone-numbers": "Phone Numbers",
  knowledge: "Knowledge",
  billing: "Billing",
  settings: "Settings",
};

function useBreadcrumb() {
  const pathname = usePathname();
  if (!pathname?.startsWith("/dashboard")) return { section: "Workspace", page: "Overview" };
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 1) return { section: "Workspace", page: "Overview" };
  const key = parts[1];
  const page = ROUTE_LABELS[key] ?? key.replace(/-/g, " ");
  return { section: "Workspace", page };
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const { page } = useBreadcrumb();

  return (
    <div className="min-h-screen flex min-w-0" style={{ background: "var(--color-paper-2)" }}>
      <Sidebar mobileOpen={mobileOpen} onMobileClose={() => setMobileOpen(false)} />
      <div className="flex-1 flex flex-col min-w-0 min-h-screen w-full">
        <header className="dashboard-header sticky top-0 z-20">
          <div className="dashboard-header-menu">
            <MobileMenuButton onClick={() => setMobileOpen(true)} />
          </div>

          <div className="dashboard-header-title-mobile sm:hidden min-w-0">
            <span className="dashboard-topbar-title truncate block capitalize">{page}</span>
          </div>

          <div className="hidden sm:flex flex-col min-w-0 mr-1 flex-1 max-w-[12rem] lg:max-w-none">
            <span className="dashboard-topbar-crumb truncate hidden md:block">Workspace · {page}</span>
            <span className="dashboard-topbar-title truncate capitalize">{page}</span>
          </div>

          <div className="dashboard-header-actions ml-auto sm:ml-0 flex items-center gap-2 shrink-0">
            <NotificationsCenter />
            <div
              className="w-9 h-9 rounded-xl text-xs font-semibold hidden sm:flex items-center justify-center shrink-0"
              style={{ background: "var(--gradient-brand)", color: "var(--color-accent-ink)" }}
            >
              CQ
            </div>
          </div>

          <div className="dashboard-header-search sm:flex-1 sm:max-w-md lg:max-w-lg">
            <GlobalSearch />
          </div>
        </header>
        <main className="flex-1 overflow-y-auto overflow-x-clip dashboard-canvas min-w-0">{children}</main>
      </div>
    </div>
  );
}
