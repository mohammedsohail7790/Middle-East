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

import { TrialUsageBanner, type TrialUsageState } from "./TrialUsageBanner";

const trial = (over: Partial<TrialUsageState> = {}): TrialUsageState => ({
  isTrialing: true,
  isLocked: false,
  trialMinutesUsed: 0,
  trialMinutesLimit: 60,
  trialMinutesRemaining: 60,
  daysRemaining: 10,
  usagePercent: 0,
  ...over,
});

function show(locale: "en" | "ar", t: TrialUsageState) {
  const messages = (locale === "en" ? en : ar) as unknown as Record<string, unknown>;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <TrialUsageBanner trial={t} />
    </NextIntlClientProvider>
  );
}

describe("trial banner in English", () => {
  it("keeps its wording, with singular and plural days", () => {
    const { unmount } = show("en", trial({ daysRemaining: 1 }));
    expect(screen.getByText("Free trial — Professional features")).toBeTruthy();
    expect(screen.getByText("1 day left")).toBeTruthy();
    expect(screen.getByText(/minutes used/)).toBeTruthy();
    expect(screen.getByText("Upgrade now")).toBeTruthy();
    unmount();
    show("en", trial({ daysRemaining: 10 }));
    expect(screen.getByText("10 days left")).toBeTruthy();
  });
});

describe("trial banner in Arabic", () => {
  it("is fully Arabic", () => {
    show("ar", trial({ daysRemaining: 10, trialMinutesUsed: 20 }));
    const text = document.body.textContent || "";
    expect(text).not.toMatch(/Free trial|minutes used|days left|Upgrade now/);
    expect(text).toMatch(/[؀-ۿ]/);
    expect(screen.getByRole("link").textContent).toMatch(/[؀-ۿ]/);
  });

  it("shows the minutes as 0 / 60 (not flipped) by isolating the numbers left to right", () => {
    show("ar", trial({ trialMinutesUsed: 0, trialMinutesLimit: 60 }));
    const nums = [...document.querySelectorAll('[dir="ltr"]')].find((e) => /0\s*\/\s*60/.test(e.textContent || ""));
    expect(nums).toBeTruthy();
    expect(nums!.textContent?.replace(/\s+/g, " ").trim()).toBe("0 / 60");
  });

  it("uses Arabic plural forms for the days left", () => {
    const days = (n: number) => {
      const { unmount } = show("ar", trial({ daysRemaining: n }));
      const t = document.body.textContent || "";
      unmount();
      return t;
    };
    expect(days(1)).toContain("يوم واحد");
    expect(days(2)).toContain("يومان");
    expect(days(5)).toContain("5 أيام");
  });
});
