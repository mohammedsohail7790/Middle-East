import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));
vi.mock("@/lib/api", () => ({ api: { post: vi.fn() } }));
vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getUser: async () => ({ data: { user: null } }) } } }));
vi.mock("@/lib/integration-support", () => ({ SUPPORT_EMAIL: "hello@example.com" }));

import { TrialLockedOverlay } from "./TrialLockedOverlay";
import type { TrialUsageState } from "./TrialUsageBanner";

const trial = (over: Partial<TrialUsageState> = {}): TrialUsageState => ({
  isTrialing: false,
  isLocked: true,
  trialMinutesUsed: 60,
  trialMinutesLimit: 60,
  trialMinutesRemaining: 0,
  daysRemaining: 0,
  usagePercent: 100,
  ...over,
});

function show(locale: "en" | "ar", t: TrialUsageState) {
  const messages = (locale === "en" ? en : ar) as unknown as Record<string, unknown>;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <TrialLockedOverlay trial={t} />
    </NextIntlClientProvider>
  );
}

describe("trial ended overlay in English", () => {
  it("keeps its wording, and shows the server's reason when there is one", () => {
    const { unmount } = show("en", trial());
    expect(screen.getByText("Your free trial has ended")).toBeTruthy();
    expect(screen.getByText("Upgrade to restore your AI receptionist, workflows, and integrations.")).toBeTruthy();
    expect(screen.getByText("Minutes used")).toBeTruthy();
    expect(screen.getByText("Trial period")).toBeTruthy();
    expect(screen.getByText("14 days")).toBeTruthy();
    expect(screen.getByText("View billing")).toBeTruthy();
    expect(screen.getByText(/Contact sales/)).toBeTruthy();
    expect(screen.getByText("Popular")).toBeTruthy();
    expect(screen.getByText("$149/mo")).toBeTruthy();
    unmount();
    show("en", trial({ blockReason: "Trial ended on 20 Nov" }));
    expect(screen.getByText("Trial ended on 20 Nov")).toBeTruthy();
  });
});

describe("trial ended overlay in Arabic", () => {
  it("is Arabic, apart from the plan names, and ignores the server's English reason", () => {
    show("ar", trial({ blockReason: "Account restricted — upgrade required" }));
    const text = document.body.textContent || "";
    for (const phrase of ["free trial has ended", "Minutes used", "Trial period", "14 days", "View billing", "Contact sales", "Popular", "/mo", "Account restricted", "Upgrade to restore"]) {
      expect(text, phrase).not.toContain(phrase);
    }
    expect(text).toMatch(/[؀-ۿ]/);
    expect(screen.getByText("Essential")).toBeTruthy();
    expect(screen.getByText("Professional")).toBeTruthy();
  });

  it("shows the minutes as 60 / 60 left to right and the period as 14 days in Arabic", () => {
    show("ar", trial({ trialMinutesUsed: 20 }));
    const nums = [...document.querySelectorAll('[dir="ltr"]')].find((e) => /20\s*\/\s*60/.test(e.textContent || ""));
    expect(nums).toBeTruthy();
    expect(document.body.textContent).toContain("14 يومًا");
  });
});
