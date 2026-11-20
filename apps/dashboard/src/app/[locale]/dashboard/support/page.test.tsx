import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

// A plain function (not a tracked mock) decides the outcome, so a deliberate failure is not reported by the test runner as an unhandled error.
const h = vi.hoisted(() => {
  const state: { fail: boolean } = { fail: false };
  const post = vi.fn((..._args: unknown[]) => undefined as unknown);
  return { post, state, call: (...args: unknown[]): Promise<unknown> => { post(...args); return state.fail ? (async () => { throw new Error("We could not send your message."); })() : Promise.resolve({ received: true }); } };
});
vi.mock("@/lib/api", () => ({ api: { post: h.call }, humanizeApiError: (e: unknown) => (e instanceof Error ? e.message : "error") }));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/lib/use-dashboard-page-labels", () => ({ useDashboardPageLabels: () => ({ title: "Support", description: "" }) }));
vi.mock("@/lib/dashboard-toast", () => ({ showDashboardToast: vi.fn() }));
vi.mock("@/components/ui-kit/DashboardPage", () => ({ DashboardPage: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/ui-kit/DashboardPageSection", () => ({ DashboardPageSection: ({ children, title }: any) => <section><h2>{title}</h2>{children}</section> }));
vi.mock("@/components/magic-ui/vibe-panel", () => ({ VibePanel: ({ children }: any) => <div>{children}</div> }));
vi.mock("@/components/support/SupportQuickLink", () => ({ SupportQuickLink: ({ title }: any) => <span>{title}</span> }));

import SupportPage from "./page";

const fill = () => {
  fireEvent.change(screen.getByLabelText(/Your email/), { target: { value: "client@clinic.com" } });
  fireEvent.change(screen.getByLabelText(/Subject/), { target: { value: "Calls not answered" } });
  fireEvent.change(screen.getByLabelText(/Message \*/), { target: { value: "The line rings out." } });
};

beforeEach(() => {
  h.post.mockClear();
  h.state.fail = false;
});

describe("support ticket form", () => {
  it("cannot be sent while a field is empty", () => {
    render(<SupportPage />);
    expect((screen.getByRole("button", { name: /Send message/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends the ticket to the gateway and then says it was received", async () => {
    render(<SupportPage />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /Send message/ }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/support/ticket", { email: "client@clinic.com", subject: "Calls not answered", message: "The line rings out." }));
    expect(await screen.findByText(/we got your message/)).toBeTruthy();
  });

  it("keeps what the client typed and shows the email address when sending fails", async () => {
    h.state.fail = true;
    render(<SupportPage />);
    fill();
    fireEvent.click(screen.getByRole("button", { name: /Send message/ }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("hello@hallaai.com");
    expect((screen.getByLabelText(/Subject/) as HTMLInputElement).value).toBe("Calls not answered");
  });
});
