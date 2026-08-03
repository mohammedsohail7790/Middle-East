"use client";

import { useState, useCallback, useEffect, useRef } from "react";
import { useDebouncedValue } from "@/lib/use-debounced-value";
import { Search, Phone, Users, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { gatewayFetch } from "@/lib/enterprise-api";
import { useDashboardSync } from "@/lib/dashboard-sync";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { cn } from "@/lib/utils";

type Hit = { category: string; id: string; title: string; snippet: string };

const CATEGORY_ICONS: Record<string, typeof Phone> = {
  calls: Phone,
  leads: Users,
};

export function GlobalSearch() {
  const [q, setQ] = useState("");
  const debouncedQ = useDebouncedValue(q, 350);
  const [hits, setHits] = useState<Hit[]>([]);
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const runSearch = useCallback(async (query: string) => {
    if (query.length < 2) {
      setHits([]);
      return;
    }
    const data = await gatewayFetch<Hit[]>(`/search?q=${encodeURIComponent(query)}`);
    setHits(data || []);
    setOpen(true);
  }, []);

  useDashboardSync(["calls", "leads"], () => {
    if (debouncedQ.length >= 2) void runSearch(debouncedQ);
  });

  useEffect(() => {
    void runSearch(debouncedQ);
  }, [debouncedQ, runSearch]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === "Escape") {
        inputRef.current?.blur();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showDropdown = open && hits.length > 0;

  return (
    <div className="relative w-full min-w-0">
      <div
        className={cn(
          "dashboard-topbar-search",
          (focused || showDropdown) && "is-focused"
        )}
      >
        <Search
          className="dashboard-topbar-search-icon"
          strokeWidth={ICON_STROKE}
        />
        <input
          ref={inputRef}
          role="combobox"
          placeholder="Search calls, leads, transcripts…"
          className="dashboard-topbar-search-input"
          aria-label="Global search"
          aria-expanded={showDropdown}
          aria-controls="global-search-results"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => {
            setFocused(true);
            if (hits.length > 0) setOpen(true);
          }}
          onBlur={() => {
            setFocused(false);
            setTimeout(() => setOpen(false), 200);
          }}
        />
        <kbd className="dashboard-topbar-search-kbd hidden sm:inline-flex" aria-hidden>
          <span className="text-[10px]">⌘</span>K
        </kbd>
      </div>

      {showDropdown && (
        <div
          id="global-search-results"
          role="listbox"
          className="dashboard-topbar-search-dropdown"
        >
          <p className="dashboard-topbar-search-dropdown-label">
            {hits.length} result{hits.length === 1 ? "" : "s"}
          </p>
          {hits.map((h) => {
            const Icon = CATEGORY_ICONS[h.category] ?? Search;
            const href =
              h.category === "calls"
                ? `/dashboard/calls/${h.id}`
                : h.category === "leads"
                  ? `/dashboard/leads?lead=${encodeURIComponent(h.id)}`
                  : "/dashboard";

            return (
              <Link
                key={`${h.category}-${h.id}`}
                href={href}
                role="option"
                className="dashboard-topbar-search-hit"
              >
                <span className="dashboard-topbar-search-hit-icon" aria-hidden>
                  <Icon className="size-3.5" strokeWidth={ICON_STROKE} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="dashboard-topbar-search-hit-category">{h.category}</span>
                  <span className="dashboard-topbar-search-hit-title truncate block">{h.title}</span>
                  <span className="dashboard-topbar-search-hit-snippet truncate block">{h.snippet}</span>
                </span>
                <ArrowRight className="size-3.5 shrink-0 opacity-40" strokeWidth={ICON_STROKE} />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
