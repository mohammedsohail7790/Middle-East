import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post }, asArray: (d: unknown) => (Array.isArray(d) ? d : []) }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, className, ...rest }: any) => <a href={href} className={className} {...rest}>{children}</a> }));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, vals?: Record<string, unknown>) => (vals ? `${key}:${Object.values(vals).join("/")}` : key),
}));

import { GoLiveChecklist } from "./GoLiveChecklist";

type State = { testCall?: boolean; line?: boolean; knowledge?: unknown[]; connections?: Record<string, { status: string }> };
function serve(s: State = {}) {
  h.get.mockImplementation(async (path: string) => {
    if (path === "/onboarding/progress") return { testCallCompleted: s.testCall === true };
    if (path === "/onboarding/twilio-status") return { configured: s.line === true };
    if (path === "/integrations/catalog") return { connections: s.connections ?? {} };
    if (path === "/knowledge") return s.knowledge ?? [];
    throw new Error("unexpected " + path);
  });
}

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  window.localStorage.clear();
});

describe("go-live checklist card", () => {
  it("lists what is left for a new client with links to the pages that finish each item", async () => {
    serve();
    render(<GoLiveChecklist />);
    expect(await screen.findByText("goLiveTitle")).toBeTruthy();
    expect(screen.getByText("goLiveProgress:0/5")).toBeTruthy();
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(expect.arrayContaining(["/dashboard/phone-numbers", "/dashboard/knowledge", "/dashboard/integrations"]));
    // No line yet, so there is nothing to call from.
    expect(screen.queryByLabelText("goLiveNumber")).toBeNull();
  });

  it("hides itself once the phone line, questions and test call are done", async () => {
    serve({ line: true, knowledge: [{ id: 1 }], testCall: true });
    const { container } = render(<GoLiveChecklist />);
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(4));
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
  });

  it("stays hidden when a lookup fails, rather than telling the client something wrong", async () => {
    serve();
    h.get.mockImplementation(async (path: string) => {
      if (path === "/knowledge") throw new Error("boom");
      return {};
    });
    const { container } = render(<GoLiveChecklist />);
    await waitFor(() => expect(h.get).toHaveBeenCalledTimes(4));
    await new Promise((r) => setTimeout(r, 20));
    expect(container.innerHTML).toBe("");
  });

  it("can be hidden by hand and then does not come back", async () => {
    serve();
    const first = render(<GoLiveChecklist />);
    await screen.findByText("goLiveTitle");
    fireEvent.click(screen.getByLabelText("goLiveDismiss"));
    expect(first.container.innerHTML).toBe("");
    first.unmount();
    h.get.mockClear();
    const second = render(<GoLiveChecklist />);
    await new Promise((r) => setTimeout(r, 20));
    expect(second.container.innerHTML).toBe("");
    expect(h.get).not.toHaveBeenCalled();
  });

  it("rings the client's own number for the test call, and ticks it off", async () => {
    serve({ line: true, knowledge: [{ id: 1 }] });
    h.post.mockResolvedValue({ success: true });
    const { container } = render(<GoLiveChecklist />);
    const field = await screen.findByLabelText("goLiveNumber");
    const button = screen.getByRole("button", { name: "goLiveCallMe" }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "0559876543" } });
    expect(button.disabled).toBe(true);
    fireEvent.change(field, { target: { value: "00971 55 987 6543" } });
    fireEvent.click(button);
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/onboarding/test-call", { phoneNumber: "+971559876543" }));
    // Phone, questions and the test call are now done, so the card has nothing left to ask.
    await waitFor(() => expect(container.innerHTML).toBe(""));
  });

  it("shows the gateway's message when the test call is refused", async () => {
    serve({ line: true, knowledge: [{ id: 1 }] });
    h.post.mockResolvedValue({ success: false, message: "Please wait 40 seconds between test calls" });
    render(<GoLiveChecklist />);
    fireEvent.change(await screen.findByLabelText("goLiveNumber"), { target: { value: "+971559876543" } });
    fireEvent.click(screen.getByRole("button", { name: "goLiveCallMe" }));
    expect(await screen.findByText("Please wait 40 seconds between test calls")).toBeTruthy();
  });
});
