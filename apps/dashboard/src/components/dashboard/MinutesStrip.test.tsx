import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: h.get } }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, className, ...rest }: any) => <a href={href} className={className} {...rest}>{children}</a> }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vals?: Record<string, unknown>) => (vals ? `${key}:${Object.values(vals).join("/")}` : key),
}));

import { MinutesStrip } from "./MinutesStrip";

const state = (used: number, limit: number, trial?: Record<string, unknown>) => ({ usage: { callMinutes: used, limitMinutes: limit }, trial });

beforeEach(() => {
  h.get.mockReset();
});

describe("minutes strip", () => {
  it("shows minutes left, the amount used and a link to billing", async () => {
    h.get.mockResolvedValue(state(150, 750));
    render(<MinutesStrip />);
    expect(await screen.findByText("minutesLeft:600")).toBeTruthy();
    expect(screen.getByText("minutesOf:150/750")).toBeTruthy();
    expect(screen.getByRole("link").getAttribute("href")).toBe("/dashboard/billing");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("20");
    expect(h.get).toHaveBeenCalledWith("/billing/account-state");
  });

  it("says how far over the plan the business is", async () => {
    h.get.mockResolvedValue(state(900, 750));
    render(<MinutesStrip />);
    expect(await screen.findByText("minutesOver:150")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
  });

  it("adds the days left on a trial", async () => {
    h.get.mockResolvedValue(state(20, 60, { isTrialing: true, daysRemaining: 9 }));
    render(<MinutesStrip />);
    expect(await screen.findByText(/minutesOf:20\/60/)).toBeTruthy();
    expect(screen.getByText(/trialDays:9/)).toBeTruthy();
  });

  it("shows nothing when there is no minute limit", async () => {
    h.get.mockResolvedValue(state(30, 0));
    const { container } = render(<MinutesStrip />);
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(container.textContent).toBe("");
  });

  it("shows nothing when the data cannot be loaded", async () => {
    h.get.mockImplementation(() => Promise.reject(new Error("down")));
    const { container } = render(<MinutesStrip />);
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 10));
    expect(container.textContent).toBe("");
  });
});
