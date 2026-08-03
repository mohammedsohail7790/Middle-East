"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, Phone, Users, Puzzle, Menu } from "lucide-react";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/dashboard", label: "Home", icon: LayoutDashboard, exact: true },
  { href: "/dashboard/calls", label: "Calls", icon: Phone },
  { href: "/dashboard/leads", label: "Leads", icon: Users },
  { href: "/dashboard/integrations", label: "Connect", icon: Puzzle },
] as const;

type Props = {
  onOpenMenu: () => void;
  hidden?: boolean;
};

export function MobileBottomNav({ onOpenMenu, hidden }: Props) {
  const pathname = usePathname();

  return (
    <nav
      className={cn(
        "lg:hidden fixed bottom-0 inset-x-0 z-40 border-t border-border bg-card/95 backdrop-blur-xl supports-[backdrop-filter]:bg-card/90 transition-opacity",
        hidden && "pointer-events-none opacity-0",
      )}
      aria-hidden={hidden || undefined}
      style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
      aria-label="Primary"
    >
      <div className="grid grid-cols-5 h-[3.75rem] max-w-lg mx-auto">
        {ITEMS.map((item) => {
          const active =
            item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname?.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors min-h-[44px]",
                active ? "text-accent-dark" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "grid place-items-center size-9 rounded-xl transition-all",
                  active && "bg-accent/10 text-accent-dark shadow-sm"
                )}
              >
                <Icon className="size-[18px]" strokeWidth={active ? ICON_STROKE + 0.25 : ICON_STROKE} />
              </span>
              {item.label}
            </Link>
          );
        })}
        <button
          type="button"
          onClick={onOpenMenu}
          className="flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold text-muted-foreground min-h-[44px]"
          aria-label="Open menu"
        >
          <span className="grid place-items-center size-9 rounded-xl">
            <Menu className="size-[18px]" strokeWidth={ICON_STROKE} />
          </span>
          More
        </button>
      </div>
    </nav>
  );
}
