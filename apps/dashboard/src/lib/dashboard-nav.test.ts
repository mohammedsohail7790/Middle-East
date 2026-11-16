import { describe, expect, it } from "vitest";
import { isConsultancyPath } from "./dashboard-nav";

describe("isConsultancyPath", () => {
  it.each([
    "/dashboard/consultancy",
    "/dashboard/consultancy/leads",
    "/en/dashboard/consultancy/projects",
    "/ar/dashboard/consultancy",
  ])("is true for %s", (p) => expect(isConsultancyPath(p)).toBe(true));

  it.each([
    "/dashboard",
    "/en/dashboard/calls",
    "/dashboard/consultations",
    "/dashboard/consultancyx",
    "",
  ])("is false for %s", (p) => expect(isConsultancyPath(p)).toBe(false));
});
