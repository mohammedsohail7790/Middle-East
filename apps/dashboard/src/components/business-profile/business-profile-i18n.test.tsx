import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";
import { defaultTemplates } from "@/lib/knowledge-templates";

const loads = vi.hoisted(() => ({ n: 0 }));
vi.mock("@/lib/knowledge-templates-api", () => ({
  loadKnowledgeTemplates: async () => {
    loads.n += 1;
    return defaultTemplates();
  },
  saveKnowledgeTemplates: async (t: unknown) => t,
}));
vi.mock("@/lib/dashboard-sync", () => ({ useDashboardSync: () => {} }));
vi.mock("@/lib/dashboard-actions", () => ({ syncDashboardAction: () => {} }));

import { KnowledgeBusinessTemplates } from "@/components/knowledge/KnowledgeBusinessTemplates";
import { BusinessProfileHero } from "./BusinessProfileHero";

function show(locale: "en" | "ar", ui: React.ReactElement) {
  const messages = (locale === "en" ? en : ar) as unknown as Record<string, unknown>;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

const ENGLISH_PHRASES = [
  "Step 1", "Business info", "Hours, services", "What callers ask", "Save business info", "Timezone", "Office hours",
  "Copy Monday", "Opens", "Closes", "Services & pricing", "One service per line", "Sunday", "Monday", "Tuesday",
  "Wednesday", "Thursday", "Friday", "Saturday", "Business profile", "Your business", "Train your AI", "Services configured", "Service area on",
];

describe("Business Profile hours and services card", () => {
  it("loads the templates once, not on every render", async () => {
    loads.n = 0;
    const { rerender } = show("en", <KnowledgeBusinessTemplates />);
    await waitFor(() => expect(screen.getByText("Step 1 · Business info")).toBeTruthy());
    rerender(
      <NextIntlClientProvider locale="en" messages={en as unknown as Record<string, unknown>}>
        <KnowledgeBusinessTemplates />
      </NextIntlClientProvider>
    );
    await new Promise((r) => setTimeout(r, 50));
    expect(loads.n).toBe(1);
  });

  it("English keeps its wording", async () => {
    show("en", <KnowledgeBusinessTemplates />);
    await waitFor(() => expect(screen.getByText("Step 1 · Business info")).toBeTruthy());
    expect(screen.getByText("Hours, services & pricing")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Save business info/ })).toBeTruthy();
    expect(screen.getByText("Office hours")).toBeTruthy();
    expect(screen.getByText("Copy Monday hours to Mon–Fri")).toBeTruthy();
    expect(screen.getByText("Sunday")).toBeTruthy();
    expect(screen.getByLabelText("Monday opens")).toBeTruthy();
    expect(screen.getByLabelText("Monday open")).toBeTruthy();
    expect(screen.getByLabelText("Services and pricing, one per line")).toBeTruthy();
  });

  it("Arabic has none of the English text, and keeps the AED 89 example as typed", async () => {
    const { container } = show("ar", <KnowledgeBusinessTemplates />);
    await waitFor(() => expect(container.querySelector("textarea")).toBeTruthy());
    const text = (container.textContent || "") + [...container.querySelectorAll("[aria-label],[placeholder]")].map((e) => (e.getAttribute("aria-label") || "") + (e.getAttribute("placeholder") || "")).join(" ");
    for (const phrase of ENGLISH_PHRASES) expect(text, phrase).not.toContain(phrase);
    expect(text).toContain("- AED 89");
    expect(text).toContain("الأحد");
    expect(text).toContain("السبت");
  });
});

describe("Business Profile hero", () => {
  it("English keeps its wording", () => {
    show("en", <BusinessProfileHero companyName="" services="" serviceAreaEnabled />);
    expect(screen.getByText("Business profile")).toBeTruthy();
    expect(screen.getByText("Your business")).toBeTruthy();
    expect(screen.getByText("Train your AI on services, pricing, and service area.")).toBeTruthy();
    expect(screen.getByText("Service area on")).toBeTruthy();
  });

  it("Arabic hero has no English", () => {
    const { container } = show("ar", <BusinessProfileHero companyName="" services="خدمة" serviceAreaEnabled />);
    const text = container.textContent || "";
    for (const phrase of ["Business profile", "Your business", "Train your AI", "Services configured", "Service area on"]) {
      expect(text, phrase).not.toContain(phrase);
    }
    expect(text).toMatch(/[؀-ۿ]/);
  });
});
