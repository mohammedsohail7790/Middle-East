import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, className }: { href: string; children: React.ReactNode; className?: string }) => (
    <a href={href} className={className}>{children}</a>
  ),
}));
vi.mock("@/lib/api", () => ({
  api: { get: async () => [], post: vi.fn(), put: vi.fn(), del: vi.fn(), postVoicePreview: vi.fn() },
}));
vi.mock("@/lib/store", () => ({ hasAccess: () => true, subscribePlanUpdates: () => () => {} }));
vi.mock("@/lib/dashboard-sync", () => ({ useDashboardSync: () => {} }));
vi.mock("@/lib/dashboard-actions", () => ({ syncDashboardAction: () => {} }));
vi.mock("@/lib/realtime", () => ({ subscribeAIConfigUpdates: () => () => {} }));

import { AgentHeroBanner } from "./AgentHeroBanner";
import { VoicePreviewPanel } from "./VoicePreviewPanel";
import { AdditionalAgentsPanel } from "./AdditionalAgentsPanel";
import { AGENT_LANGUAGES } from "@/lib/agent-languages";
import type { DashboardAIConfigShape } from "@/lib/gateway-adapters";

function show(locale: "en" | "ar", ui: React.ReactElement) {
  const messages = (locale === "en" ? en : ar) as unknown as Record<string, unknown>;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      {ui}
    </NextIntlClientProvider>
  );
}

const config = { agentName: "Sarah", voice: "marin", language: "ar-SA", greetingMessage: "" } as unknown as DashboardAIConfigShape;

const noEnglish = (text: string, phrases: string[]) => {
  for (const p of phrases) expect(text, p).not.toContain(p);
};

describe("agent hero banner", () => {
  it("English keeps its wording", () => {
    show("en", <AgentHeroBanner agentName="Sarah" voiceLabel="Marin" toneLabel="Professional" liveLabel="Live on calls" />);
    expect(screen.getByText("AI receptionist")).toBeTruthy();
    expect(screen.getByText("Voice and tone your callers hear on every inbound call.")).toBeTruthy();
  });
  it("Arabic has no English", () => {
    const { container } = show("ar", <AgentHeroBanner agentName="Sarah" voiceLabel="Marin" toneLabel="محترف" liveLabel="مباشر" />);
    noEnglish(container.textContent || "", ["AI receptionist", "Voice and tone"]);
  });
});

describe("voice preview panel", () => {
  it("English keeps its wording", () => {
    show("en", <VoicePreviewPanel config={config} />);
    expect(screen.getByText(/Hear a sample in your selected language/)).toBeTruthy();
    expect(screen.getByText(/Play preview/)).toBeTruthy();
    expect(screen.getByText(/Stop/)).toBeTruthy();
    expect(screen.getByText(/Voice: marin · Language: Arabic \(Saudi\)/)).toBeTruthy();
    expect(screen.getByText("Thanks for calling. This is Sarah. How can I help you today?")).toBeTruthy();
  });
  it("Arabic has no English, and shows the language by name rather than its code", () => {
    const { container } = show("ar", <VoicePreviewPanel config={config} />);
    const text = container.textContent || "";
    noEnglish(text, ["Hear a sample", "Play preview", "Stop", "Voice:", "Language:", "Thanks for calling", "Live sync", "ar-SA"]);
    expect(text).toContain("العربية (السعودية)");
  });
});

describe("additional agents panel", () => {
  it("English keeps its wording", async () => {
    show("en", <AdditionalAgentsPanel />);
    await waitFor(() => expect(screen.getByText("No additional agents yet.")).toBeTruthy());
    expect(screen.getByText("New agent")).toBeTruthy();
    expect(screen.getByPlaceholderText("Name (e.g. Sales — Mike)")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Create agent/ })).toBeTruthy();
    expect(screen.getByText("Phone Numbers")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Receptionist" })).toBeTruthy();
  });
  it("Arabic has no English", async () => {
    const { container } = show("ar", <AdditionalAgentsPanel />);
    await waitFor(() => expect(container.querySelector("textarea")).toBeTruthy());
    const attrs = [...container.querySelectorAll("[placeholder],[aria-label]")].map((e) => (e.getAttribute("placeholder") || "") + (e.getAttribute("aria-label") || "")).join(" ");
    noEnglish((container.textContent || "") + attrs, ["New agent", "Create agent", "No additional agents", "Name (e.g.", "System instructions", "Phone Numbers", "Receptionist", "Sales", "Support", "Billing", "Loading"]);
  });
});

describe("language names", () => {
  it("every language has a display name in English and in Arabic", () => {
    const enNames = (en as unknown as { pages: { agent: { languageNames: Record<string, string> } } }).pages.agent.languageNames;
    const arNames = (ar as unknown as { pages: { agent: { languageNames: Record<string, string> } } }).pages.agent.languageNames;
    for (const l of AGENT_LANGUAGES) {
      expect(enNames[l.id], `en ${l.id}`).toBe(l.name);
      expect(arNames[l.id], `ar ${l.id}`).toMatch(/[\u0600-\u06FF]/);
    }
  });
});
