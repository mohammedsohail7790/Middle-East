import { getIntegrationsByCategory } from "@/lib/integration-hub-catalog";

export type GoLiveItemId = "phone" | "faq" | "calendar" | "crm" | "testCall" | "automation";

export type GoLiveItem = {
  id: GoLiveItemId;
  done: boolean;
  /** Needed before the receptionist can take real calls. Calendar and CRM are extras. */
  required: boolean;
  /** Dashboard page that finishes the item. The test call is done inline, so it has none. */
  href: string | null;
};

export type GoLiveInput = {
  phoneLine: boolean;
  knowledgeCount: number;
  testCallDone: boolean;
  connections: Record<string, { status?: string } | undefined>;
  /** Whether any ready-made automation is switched on; null when that could not be read, which leaves the item out. */
  automationsOn?: boolean | null;
};

const anyConnected = (category: "calendar" | "crm", connections: GoLiveInput["connections"]) =>
  getIntegrationsByCategory(category).some((i) => connections[i.id]?.status === "connected");

/** What a new client still has to do, from what is really saved rather than from wizard flags. */
export function buildGoLiveChecklist(input: GoLiveInput): GoLiveItem[] {
  return [
    { id: "phone", done: input.phoneLine, required: true, href: "/dashboard/phone-numbers" },
    { id: "faq", done: input.knowledgeCount > 0, required: true, href: "/dashboard/knowledge" },
    { id: "testCall", done: input.testCallDone, required: true, href: null },
    { id: "calendar", done: anyConnected("calendar", input.connections), required: false, href: "/dashboard/integrations" },
    { id: "crm", done: anyConnected("crm", input.connections), required: false, href: "/dashboard/integrations" },
    ...(input.automationsOn === null || input.automationsOn === undefined
      ? []
      : [{ id: "automation" as const, done: input.automationsOn, required: false, href: "/dashboard/automations" }]),
  ];
}

/** The card goes away once every required item is done. */
export function isGoLiveComplete(items: GoLiveItem[]): boolean {
  return items.filter((i) => i.required).every((i) => i.done);
}

export function goLiveProgress(items: GoLiveItem[]): { done: number; total: number } {
  return { done: items.filter((i) => i.done).length, total: items.length };
}
