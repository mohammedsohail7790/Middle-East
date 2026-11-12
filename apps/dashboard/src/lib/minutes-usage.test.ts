import { describe, expect, it } from "vitest";
import { minutesOverview } from "./minutes-usage";

const state = (callMinutes: number, limitMinutes: number, trial?: Record<string, unknown>) => ({ usage: { callMinutes, limitMinutes }, trial });

describe("minutesOverview", () => {
  it("works out minutes left, percent and a calm tone under 80%", () => {
    expect(minutesOverview(state(150, 750))).toMatchObject({ used: 150, limit: 750, left: 600, over: 0, percent: 20, tone: "ok", hasLimit: true, trialing: false });
  });
  it("turns amber from 80% and red at the limit", () => {
    expect(minutesOverview(state(600, 750))?.tone).toBe("warn");
    expect(minutesOverview(state(749, 750))?.tone).toBe("warn");
    expect(minutesOverview(state(750, 750))?.tone).toBe("critical");
  });
  it("counts the minutes over the limit and never lets the bar overflow", () => {
    expect(minutesOverview(state(900, 750))).toMatchObject({ over: 150, left: 0, percent: 100, tone: "critical" });
  });
  it("reads the trial from the same state, with days left", () => {
    expect(minutesOverview(state(20, 60, { isTrialing: true, daysRemaining: 9.6 }))).toMatchObject({ trialing: true, daysRemaining: 10, left: 40 });
    expect(minutesOverview(state(20, 60, { isTrialing: false, daysRemaining: 9 }))?.daysRemaining).toBeNull();
  });
  it("shows no bar when there is no limit to measure against", () => {
    expect(minutesOverview(state(30, 0))).toMatchObject({ hasLimit: false, percent: 0, left: 0, over: 0, tone: "ok" });
  });
  it("ignores junk numbers and a missing state", () => {
    expect(minutesOverview(state(NaN as any, -5))).toMatchObject({ used: 0, limit: 0 });
    expect(minutesOverview(null)).toBeNull();
    expect(minutesOverview({})).toBeNull();
    expect(minutesOverview("x")).toBeNull();
  });
});
