import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Page from "./page";

const h = vi.hoisted(() => ({ get: vi.fn() }));
const get = h.get;
vi.mock("@/lib/api", () => ({ api: { get: h.get }, humanizeApiError: () => "Could not load" }));
vi.mock("@/components/ui-kit/DashboardPage", () => ({
  DashboardPage: ({ children, error }: any) => <div>{error ? <p>{error}</p> : children}</div>,
}));

const period = (days: number, name: string, calls: number) => ({ days, rows: [{ tenantId: name, name, calls, minutes: 12.5, estimatedCostUsd: 1.43 }], totals: { calls, minutes: 12.5, estimatedCostUsd: 1.43 } });
const data = { periods: [period(7, "Glow Clinic", 4), period(30, "Glow Clinic", 20)], rates: { phoneUsdPerMinute: 0.014, aiUsdPerMinute: 0.1 }, alerts: [] };

beforeEach(() => get.mockReset());

describe("usage page", () => {
  it("shows the 7 day figures, then the 30 day ones", async () => {
    get.mockResolvedValue(data);
    render(<Page />);
    expect(await screen.findByText("Glow Clinic")).toBeTruthy();
    expect(screen.getByText("4", { selector: "td" })).toBeTruthy();
    fireEvent.click(screen.getByText("Last 30 days"));
    await waitFor(() => expect(screen.getByText("20", { selector: "td" })).toBeTruthy());
  });
  it("says so when there are no alerts and labels the figures as estimates", async () => {
    get.mockResolvedValue(data);
    render(<Page />);
    expect(await screen.findByText(/No alert emails sent/)).toBeTruthy();
    expect(screen.getByText(/Estimates only/)).toBeTruthy();
  });
});
