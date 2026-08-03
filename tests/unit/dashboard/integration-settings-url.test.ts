import { describe, expect, it } from "vitest";
import {
  getIntegrationDef,
  resolveIntegrationOpenLink,
  resolveIntegrationSettingsUrl,
} from "../../../apps/dashboard/src/lib/integration-hub-catalog";

describe("resolveIntegrationOpenLink", () => {
  it("uses Freshsales sign-in when company subdomain is not entered yet", () => {
    const def = getIntegrationDef("freshsales");
    expect(def).toBeDefined();
    const link = resolveIntegrationOpenLink(def!, {});
    expect(link).toEqual({
      url: "https://www.freshworks.com/freshsales-crm/login/",
      kind: "login",
    });
  });

  it("opens Freshsales login after organization domain is entered", () => {
    const def = getIntegrationDef("freshsales");
    expect(def).toBeDefined();
    const link = resolveIntegrationOpenLink(def!, { domain: "acme.myfreshworks.com" });
    expect(link).toEqual({
      url: "https://www.freshworks.com/freshsales-crm/login/",
      kind: "login",
    });
  });

  it("never returns yourcompany placeholder URLs", () => {
    const def = getIntegrationDef("freshsales");
    const url = resolveIntegrationSettingsUrl(def!, {});
    expect(url).not.toContain("yourcompany");
  });

  it("returns static provider URLs unchanged", () => {
    const def = getIntegrationDef("pipedrive");
    expect(def).toBeDefined();
    expect(resolveIntegrationOpenLink(def!, {})).toEqual({
      url: "https://app.pipedrive.com/auth/login",
      kind: "login",
    });
  });

  it("opens Copper sign-in instead of broken settings path", () => {
    const def = getIntegrationDef("copper");
    expect(def).toBeDefined();
    expect(resolveIntegrationOpenLink(def!, {})).toEqual({
      url: "https://app.copper.com/",
      kind: "login",
    });
  });

  it("opens ServiceTitan sign-in for OAuth connect", () => {
    const def = getIntegrationDef("servicetitan");
    expect(def).toBeDefined();
    expect(resolveIntegrationOpenLink(def!, {})).toEqual({
      url: "https://go.servicetitan.com/",
      kind: "login",
    });
  });

  it("opens Clio sign-in instead of settings deep link", () => {
    const def = getIntegrationDef("clio");
    expect(def).toBeDefined();
    expect(resolveIntegrationOpenLink(def!, {})).toEqual({
      url: "https://account.clio.com/login",
      kind: "login",
    });
  });

  it("opens Jobber sign-in for OAuth connect", () => {
    const def = getIntegrationDef("jobber");
    expect(def).toBeDefined();
    expect(resolveIntegrationOpenLink(def!, {})).toEqual({
      url: "https://secure.getjobber.com/login",
      kind: "login",
    });
  });

  it("opens Zapier Catch Hook editor", () => {
    const def = getIntegrationDef("zapier");
    expect(def).toBeDefined();
    expect(resolveIntegrationOpenLink(def!, {})?.url).toContain("zapier.com/webintent/create-zap");
  });
});
