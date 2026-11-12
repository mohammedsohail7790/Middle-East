import { afterEach, describe, expect, it } from "vitest";
import { hasAccess, isNavItemLocked, setPlan } from "./store";

afterEach(() => localStorage.clear());

describe("what each plan can open in the dashboard", () => {
  it("lets Enterprise open everything Professional and Essential can", () => {
    setPlan("enterprise");
    expect(hasAccess("essential")).toBe(true);
    expect(hasAccess("professional")).toBe(true);
    expect(isNavItemLocked("professional")).toBe(false);
  });

  it("keeps Professional below Enterprise and Essential below Professional", () => {
    setPlan("professional");
    expect(hasAccess("professional")).toBe(true);
    expect(hasAccess("enterprise")).toBe(false);
    setPlan("essential");
    expect(hasAccess("essential")).toBe(true);
    expect(hasAccess("professional")).toBe(false);
  });
});
