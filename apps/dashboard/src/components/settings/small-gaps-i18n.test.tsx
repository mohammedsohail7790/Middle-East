import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider, createTranslator, type AbstractIntlMessages } from "next-intl";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

vi.mock("@/lib/api", () => ({ api: { get: async () => [], post: vi.fn() }, asArray: (d: unknown) => (Array.isArray(d) ? d : []) }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: { email: "a@b.co" } } }), updateUser: vi.fn() } } }));
vi.mock("@/lib/auth-redirect", () => ({ getClientAuthOrigin: () => "x", buildAuthCallbackUrlFromOrigin: () => "x" }));
vi.mock("@/lib/dashboard-sync", () => ({ useDashboardSync: () => {} }));
vi.mock("@/lib/dashboard-actions", () => ({ syncDashboardAction: () => {} }));

import { TeamAccountPanel } from "./TeamAccountPanel";
import { subscriptionStatusLabel } from "@/lib/subscription-status";
import { translateFunnelName } from "@/lib/funnel-labels";

const msgs = (l: "en" | "ar") => (l === "en" ? en : ar) as unknown as Record<string, unknown>;
type T = { has: (key: string) => boolean; (key: string): string };
const tr = (l: "en" | "ar", namespace: string) =>
  createTranslator({ locale: l, messages: msgs(l) as AbstractIntlMessages, namespace } as never) as unknown as T;
const read = (p: string) => readFileSync(join(__dirname, "../..", p), "utf8");

describe("Settings team and account email panel", () => {
  it("English keeps its wording", async () => {
    render(
      <NextIntlClientProvider locale="en" messages={msgs("en")}>
        <TeamAccountPanel />
      </NextIntlClientProvider>
    );
    await waitFor(() => expect(screen.getByText("No team members yet")).toBeTruthy());
    expect(screen.getByText("Team")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Send invite/ })).toBeTruthy();
    expect(screen.getByText("Account email")).toBeTruthy();
    expect(screen.getByPlaceholderText("Full name")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Viewer" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change email" })).toBeTruthy();
  });

  it("Arabic has no English", async () => {
    const { container } = render(
      <NextIntlClientProvider locale="ar" messages={msgs("ar")}>
        <TeamAccountPanel />
      </NextIntlClientProvider>
    );
    await waitFor(() => expect(container.querySelector("select")).toBeTruthy());
    const attrs = [...container.querySelectorAll("[placeholder]")].map((e) => e.getAttribute("placeholder")).join(" ");
    const text = (container.textContent || "") + attrs;
    for (const p of ["Team", "No team members", "Invite colleagues", "Send invite", "Account email", "Current:", "Full name", "Email to invite", "New email address", "Change email", "Admin", "Agent", "Viewer", "Invites are sent"]) {
      expect(text, p).not.toContain(p);
    }
  });
});

describe("subscription status label", () => {
  it("translates known statuses and leaves unknown ones as they are", () => {
    const tEn = tr("en", "billing");
    const tAr = tr("ar", "billing");
    expect(subscriptionStatusLabel("trialing", tEn)).toBe("Trialing");
    expect(subscriptionStatusLabel("active", tEn)).toBe("Active");
    expect(subscriptionStatusLabel("trialing", tAr)).toMatch(/[؀-ۿ]/);
    expect(subscriptionStatusLabel("past_due", tAr)).toMatch(/[؀-ۿ]/);
    expect(subscriptionStatusLabel("something_new", tAr)).toBe("something_new");
  });
});

describe("funnel step names", () => {
  it("are translated for every step the app produces", () => {
    const tAr = tr("ar", "pages.analytics");
    const tEn = tr("en", "pages.analytics");
    for (const name of ["Calls", "Leads", "Converted", "Qualified", "Appointments", "Confirmed"]) {
      expect(translateFunnelName(name, tEn), `en ${name}`).toBe(name);
      expect(translateFunnelName(name, tAr), `ar ${name}`).toMatch(/[؀-ۿ]/);
    }
    expect(translateFunnelName("Custom", tAr)).toBe("Custom");
  });
});

describe("Leads page and billing and home page do not hard-code these strings", () => {
  it("leads page", () => {
    const src = read("app/[locale]/dashboard/leads/page.tsx");
    for (const s of ['step="Pipeline"', 'aria-label="Search leads"', 'aria-label="Pipeline stage"', 'description="New leads from calls, WhatsApp']) {
      expect(src, s).not.toContain(s);
    }
  });
  it("billing page shows the translated status, home and analytics translate the funnel names", () => {
    expect(read("app/[locale]/dashboard/billing/page.tsx")).toContain("subscriptionStatusLabel(");
    expect(read("app/[locale]/dashboard/page.tsx")).toContain("translateFunnelName(");
    expect(read("app/[locale]/dashboard/analytics/page.tsx")).toContain("translateFunnelName(");
  });
});
