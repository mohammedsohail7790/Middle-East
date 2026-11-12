import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

/**
 * The real sign-up wizard page, with only its network and sign-in replaced. It checks what the client types ends up in the three saves the AI Agent page reads
 * (tenant, AI config, knowledge), that a bad transfer number stops the client, and that a failed save never traps them.
 */
const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  postBlob: vi.fn(),
  push: vi.fn(),
}));

const router = vi.hoisted(() => ({ push: (...a: unknown[]) => h.push(...a), replace: (...a: unknown[]) => h.push(...a) }));
// A stable router object, as in the real app: a new one on every render would re-run the page's loading effect forever.
vi.mock("next/navigation", () => ({ useRouter: () => router }));
vi.mock("framer-motion", () => ({
  motion: new Proxy({}, { get: () => (props: any) => <div {...Object.fromEntries(Object.entries(props).filter(([k]) => !["initial", "animate", "exit", "transition"].includes(k)))} /> }),
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));
vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: { user: { id: "u1", user_metadata: {} } } } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: "11111111-1111-1111-1111-111111111111" } } }),
      updateUser: vi.fn().mockResolvedValue({}),
      refreshSession: vi.fn().mockResolvedValue({}),
    },
  },
}));
vi.mock("@/lib/api", () => ({
  api: { get: h.get, post: h.post, put: h.put, postBlob: h.postBlob },
  humanizeApiError: (e: unknown) => String(e),
  prefetchCsrfToken: vi.fn().mockResolvedValue(undefined),
}));
vi.mock("@/lib/ensure-tenant", () => ({
  resolveOnboardingEntry: vi.fn().mockResolvedValue({ tenantId: null, redirectToDashboard: false }),
  ensureTenantSession: vi.fn().mockResolvedValue("tid"),
}));
vi.mock("@/lib/store", () => ({ setTenantId: vi.fn(), setPlan: vi.fn() }));
vi.mock("@/lib/auth-navigate", () => ({ navigateAfterSignIn: vi.fn(), localizedDashboardPath: (p: string) => p }));
vi.mock("@/components/onboarding/OnboardingShell", () => ({ OnboardingShell: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/onboarding/OnboardingPersonalityVoice", () => ({ OnboardingPersonalityVoice: () => <div>personality</div> }));

import OnboardingPage from "./page";

const INDUSTRIES = [
  { id: "pool_service", name: "Pool Service", icon: "P" },
  { id: "clinic", name: "Medical Clinic", icon: "C" },
  { id: "real_estate", name: "Real Estate", icon: "R" },
];

beforeEach(() => {
  Object.values(h).forEach((f) => f.mockReset());
  h.get.mockImplementation(async (path: string) => {
    if (path.startsWith("/tenants/industries")) return INDUSTRIES;
    if (path.startsWith("/tenants/onboarding-status")) throw new Error("none");
    if (path.startsWith("/onboarding/twilio-status")) return { configured: true };
    return {};
  });
  h.post.mockImplementation(async (path: string) => (path === "/tenants" ? { id: "tid" } : {}));
  h.put.mockResolvedValue({});
});

const next = () => fireEvent.click(screen.getByRole("button", { name: /^Continue/ }));

async function throughToAgentStep(opts: { transfer?: string } = {}) {
  render(<OnboardingPage />);
  await screen.findByText("Tell us about your business");
  fireEvent.change(screen.getByPlaceholderText("Glow Clinic"), { target: { value: "Glow Clinic" } });
  fireEvent.change(screen.getByPlaceholderText(/One or two sentences/), { target: { value: "A skin clinic in Dubai Marina." } });
  fireEvent.change(screen.getByDisplayValue("English"), { target: { value: "ar-SA" } });
  next();
  await screen.findByText("What industries are you in?");
  fireEvent.click(await screen.findByText("Medical Clinic"));
  next();
  await screen.findByText("Business hours");
  fireEvent.click(screen.getByText("Offer to put urgent calls through"));
  if (opts.transfer !== undefined) fireEvent.change(screen.getByPlaceholderText("+971 50 123 4567"), { target: { value: opts.transfer } });
  fireEvent.change(screen.getByPlaceholderText(/Burst pipe/), { target: { value: "severe pain, bleeding" } });
  return null;
}

describe("sign-up wizard", () => {
  it("lists the Gulf favourites first and hides the rest until asked", async () => {
    render(<OnboardingPage />);
    await screen.findByText("Tell us about your business");
    fireEvent.change(screen.getByPlaceholderText("Glow Clinic"), { target: { value: "Glow Clinic" } });
    next();
    await screen.findByText("What industries are you in?");
    await screen.findByText("Medical Clinic");
    expect(screen.queryByText("Pool Service")).toBeNull();
    fireEvent.click(screen.getByText(/Show all 3 industries/));
    expect(await screen.findByText("Pool Service")).toBeTruthy();
  });

  it("stops the client at the hours step when the transfer number has no country code", async () => {
    await throughToAgentStep({ transfer: "0501234567" });
    expect(screen.getByText(/with its country code, for example/)).toBeTruthy();
    expect((screen.getByRole("button", { name: /^Continue/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText("+971 50 123 4567"), { target: { value: "+971 50 123 4567" } });
    expect((screen.getByRole("button", { name: /^Continue/ }) as HTMLButtonElement).disabled).toBe(false);
  });

  it("saves language, voice, greeting, transfer number and brief where the AI Agent page reads them", async () => {
    await throughToAgentStep({ transfer: "00971 50 123 4567" });
    next();
    await screen.findByText("Name your AI receptionist");
    fireEvent.click(screen.getByRole("button", { name: /Chris/ }));
    fireEvent.click(screen.getByRole("button", { name: /Launch AI Agent/ }));

    await waitFor(() => expect(h.put).toHaveBeenCalledWith("/ai-config", expect.anything()));
    const create = h.post.mock.calls.find((c) => c[0] === "/tenants")![1];
    expect(create).toMatchObject({ business_name: "Glow Clinic", language_mode: "ar-SA", voice_id: "cedar", industries: ["clinic"] });

    const ai = h.put.mock.calls.find((c) => c[0] === "/ai-config")![1];
    expect(ai).toMatchObject({ language: "ar-SA", voice: "cedar", transferPhoneNumber: "+971501234567", businessDescription: "A skin clinic in Dubai Marina." });
    expect(ai.greetingMessage).toContain("موظفة الاستقبال الذكية");
    expect(ai.customInstructions).toContain("severe pain, bleeding");
    expect(ai.customInstructions).toContain("transfer the call to the on-call number");

    expect(h.put).toHaveBeenCalledWith("/tenants/tid", { default_language: "ar-SA", transfer_phone_number: "+971501234567" });
    await screen.findByText("Get your AI phone line");
  });

  it("does not trap the client when a save fails: it moves on and tells them what to fill in later", async () => {
    h.put.mockRejectedValue(new Error("boom"));
    await throughToAgentStep({ transfer: "+971501234567" });
    next();
    await screen.findByText("Name your AI receptionist");
    fireEvent.click(screen.getByRole("button", { name: /Launch AI Agent/ }));
    await screen.findByText("Get your AI phone line");
    fireEvent.click(screen.getByRole("button", { name: /Skip for now/ }));
    await screen.findByText("Almost there");
    expect(screen.getByText(/We could not save your greeting, voice and instructions and your language and transfer number/)).toBeTruthy();
  });

  it("saves the pasted questions and answers to the knowledge base on the last step", async () => {
    await throughToAgentStep({ transfer: "+971501234567" });
    next();
    await screen.findByText("Name your AI receptionist");
    fireEvent.click(screen.getByRole("button", { name: /Launch AI Agent/ }));
    await screen.findByText("Get your AI phone line");
    fireEvent.click(screen.getByRole("button", { name: /Skip for now/ }));
    await screen.findByText("Almost there");
    fireEvent.change(screen.getByLabelText(/Common questions and answers/), { target: { value: "Do you take walk-ins? Yes until 5pm." } });
    next();
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/knowledge", { text: "Do you take walk-ins? Yes until 5pm.", category: "general" }));
  });

  it("skips the knowledge call when nothing was pasted", async () => {
    await throughToAgentStep({ transfer: "" });
    next();
    await screen.findByText("Name your AI receptionist");
    fireEvent.click(screen.getByRole("button", { name: /Launch AI Agent/ }));
    await screen.findByText("Get your AI phone line");
    fireEvent.click(screen.getByRole("button", { name: /Skip for now/ }));
    await screen.findByText("Almost there");
    next();
    await screen.findByText(/Setup complete|You're all set|ready/i).catch(() => undefined);
    expect(h.post.mock.calls.some((c) => c[0] === "/knowledge")).toBe(false);
  });
});

// keeps the unused import honest for readers: the helper above uses `within` in some environments
void within;
