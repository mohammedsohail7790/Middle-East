import { describe, expect, it } from "vitest";
import { sortAlerts, toAlertView, type ServerAlert } from "./server-alerts";

const base: ServerAlert = { id: "1", kind: "usage_90_percent", severity: "warning", title: "Minutes low", title_ar: "الدقائق قليلة", body: "Used 90%.", body_ar: "استهلكت 90%.", href: "/dashboard/billing", created_at: "2026-11-12T10:00:00Z", read_at: null };

describe("toAlertView", () => {
  it("uses English in an English dashboard and Arabic in an Arabic one", () => {
    expect(toAlertView(base, "en")).toMatchObject({ title: "Minutes low", body: "Used 90%.", read: false, href: "/dashboard/billing" });
    expect(toAlertView(base, "ar")).toMatchObject({ title: "الدقائق قليلة", body: "استهلكت 90%." });
  });
  it("falls back to English when there is no Arabic text", () => {
    expect(toAlertView({ ...base, title_ar: null, body_ar: null }, "ar")).toMatchObject({ title: "Minutes low", body: "Used 90%." });
  });
  it("knows when it has been read and falls back to the dashboard home without a link", () => {
    expect(toAlertView({ ...base, read_at: "2026-11-12T11:00:00Z", href: "" }, "en")).toMatchObject({ read: true, href: "/dashboard" });
  });
});

describe("sortAlerts", () => {
  const v = (id: string, severity: ServerAlert["severity"], read: boolean, at: string) => toAlertView({ ...base, id, severity, read_at: read ? at : null, created_at: at }, "en");
  it("puts unread before read, serious before minor among unread, and newest first otherwise", () => {
    const sorted = sortAlerts([
      v("read-new", "critical", true, "2026-11-12T12:00:00Z"),
      v("info", "info", false, "2026-11-12T11:00:00Z"),
      v("critical-old", "critical", false, "2026-11-12T09:00:00Z"),
      v("warn-new", "warning", false, "2026-11-12T13:00:00Z"),
      v("warn-old", "warning", false, "2026-11-12T08:00:00Z"),
    ]);
    expect(sorted.map((x) => x.id)).toEqual(["critical-old", "warn-new", "warn-old", "info", "read-new"]);
  });
  it("does not change the list it was given", () => {
    const list = [v("a", "info", false, "2026-11-12T10:00:00Z"), v("b", "critical", false, "2026-11-12T09:00:00Z")];
    sortAlerts(list);
    expect(list.map((x) => x.id)).toEqual(["a", "b"]);
  });
});
