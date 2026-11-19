import { beforeEach, describe, expect, it } from "vitest";
import { consumeOnboardingReturn, ONBOARDING_RETURN_KEY } from "./onboarding-return";

describe("consumeOnboardingReturn", () => {
  beforeEach(() => window.sessionStorage.clear());

  it("is false when the client did not start from the setup wizard", () => {
    expect(consumeOnboardingReturn()).toBe(false);
  });

  it("is true once, then clears itself so the dashboard is not hijacked later", () => {
    window.sessionStorage.setItem(ONBOARDING_RETURN_KEY, "1");
    expect(consumeOnboardingReturn()).toBe(true);
    expect(consumeOnboardingReturn()).toBe(false);
  });
});
