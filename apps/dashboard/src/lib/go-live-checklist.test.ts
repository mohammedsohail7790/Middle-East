import { describe, expect, it } from "vitest";
import { buildGoLiveChecklist, goLiveProgress, isGoLiveComplete } from "./go-live-checklist";

const none = { phoneLine: false, knowledgeCount: 0, testCallDone: false, connections: {} };
const byId = (items: ReturnType<typeof buildGoLiveChecklist>) => Object.fromEntries(items.map((i) => [i.id, i]));

describe("go-live checklist", () => {
  it("starts with nothing done and three required items", () => {
    const items = buildGoLiveChecklist(none);
    expect(items.map((i) => i.id)).toEqual(["phone", "faq", "testCall", "calendar", "crm"]);
    expect(items.filter((i) => i.required).map((i) => i.id)).toEqual(["phone", "faq", "testCall"]);
    expect(goLiveProgress(items)).toEqual({ done: 0, total: 5 });
    expect(isGoLiveComplete(items)).toBe(false);
  });

  it("marks the phone line, questions and test call from what is saved", () => {
    const items = byId(buildGoLiveChecklist({ ...none, phoneLine: true, knowledgeCount: 3, testCallDone: true }));
    expect(items.phone.done && items.faq.done && items.testCall.done).toBe(true);
    expect(items.calendar.done || items.crm.done).toBe(false);
  });

  it("counts any connected calendar or CRM, not just one app", () => {
    const items = byId(buildGoLiveChecklist({ ...none, connections: { calendly: { status: "connected" }, hubspot: { status: "connected" } } }));
    expect(items.calendar.done).toBe(true);
    expect(items.crm.done).toBe(true);
  });

  it("ignores tools that are not connected", () => {
    const items = byId(buildGoLiveChecklist({ ...none, connections: { "google-calendar": { status: "disconnected" }, hubspot: { status: "error" } } }));
    expect(items.calendar.done).toBe(false);
    expect(items.crm.done).toBe(false);
  });

  it("is complete once the three required items are done, even without calendar or CRM", () => {
    const items = buildGoLiveChecklist({ ...none, phoneLine: true, knowledgeCount: 1, testCallDone: true });
    expect(isGoLiveComplete(items)).toBe(true);
    expect(goLiveProgress(items)).toEqual({ done: 3, total: 5 });
  });

  it("is not complete while a required item is missing", () => {
    expect(isGoLiveComplete(buildGoLiveChecklist({ ...none, phoneLine: true, knowledgeCount: 1 }))).toBe(false);
  });

  it("sends the client to the page that finishes each item, and does the test call inline", () => {
    const items = byId(buildGoLiveChecklist(none));
    expect(items.phone.href).toBe("/dashboard/phone-numbers");
    expect(items.faq.href).toBe("/dashboard/knowledge");
    expect(items.calendar.href).toBe("/dashboard/integrations");
    expect(items.testCall.href).toBeNull();
  });
});
