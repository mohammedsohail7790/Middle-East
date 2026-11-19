import { describe, expect, it, vi } from "vitest";
import { DEFAULT_FIRST_AUTOMATIONS, FIRST_AUTOMATIONS, isValidOwnerEmail, saveFirstAutomations } from "./first-automations";

describe("first automations", () => {
  it("offers the two that only need an email address", () => {
    expect(FIRST_AUTOMATIONS.map((a) => a.key)).toEqual(["call-summary-email", "missed-call-followup"]);
    expect(DEFAULT_FIRST_AUTOMATIONS).toEqual(["call-summary-email", "missed-call-followup"]);
  });

  it("accepts ordinary email addresses and refuses the rest", () => {
    expect(isValidOwnerEmail(" owner@glow.example ")).toBe(true);
    for (const bad of ["", "owner", "owner@", "@glow.example", "a b@glow.example", "owner@glow", "x".repeat(170) + "@a.co"]) {
      expect(isValidOwnerEmail(bad)).toBe(false);
    }
  });

  it("switches each one on in ask-first mode with the trimmed address", async () => {
    const save = vi.fn().mockResolvedValue({});
    const out = await saveFirstAutomations(save, ["call-summary-email", "missed-call-followup"], " owner@glow.example ");
    expect(out).toEqual({ saved: ["call-summary-email", "missed-call-followup"], failed: [] });
    expect(save).toHaveBeenCalledWith("call-summary-email", { enabled: true, approvalMode: "ask", config: { ownerEmail: "owner@glow.example" } });
  });

  it("keeps going when one fails and says which", async () => {
    const save = vi.fn().mockImplementation(async (k: string) => {
      if (k === "call-summary-email") throw new Error("403");
    });
    const out = await saveFirstAutomations(save, ["call-summary-email", "missed-call-followup"], "owner@glow.example");
    expect(out).toEqual({ saved: ["missed-call-followup"], failed: ["call-summary-email"] });
  });

  it("does nothing when nothing is chosen", async () => {
    const save = vi.fn();
    expect(await saveFirstAutomations(save, [], "owner@glow.example")).toEqual({ saved: [], failed: [] });
    expect(save).not.toHaveBeenCalled();
  });
});
