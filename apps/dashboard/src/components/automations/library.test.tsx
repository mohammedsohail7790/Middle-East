import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const h = vi.hoisted(() => ({ library: vi.fn(), runs: vi.fn(), save: vi.fn(), upload: vi.fn() }));
vi.mock("next-intl", async () => (await import("./test-intl")).intlMock);
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, className }: any) => <a href={href} className={className}>{children}</a> }));
vi.mock("./client", () => ({ automationsApi: { library: h.library, runs: h.runs, save: h.save, uploadDocument: h.upload } }));

import { AutomationsLibrary } from "./AutomationsLibrary";
import { AutomationsApiError } from "./errors";

const fields = [
  { key: "label", label: "Label", type: "text", required: true, default: "Hello", help: "Shown to staff" },
  { key: "limit", label: "Limit", type: "number", default: 5 },
  { key: "notify", label: "Notify me", type: "boolean", default: true },
  { key: "channel", label: "Channel", type: "select", options: [{ value: "sms", label: "Text message" }, { value: "wa", label: "WhatsApp" }], default: "sms" },
  { key: "owner", label: "Owner email", type: "email" },
  { key: "hook", label: "Webhook address", type: "url" },
];

const tpl = (key: string, over: any = {}) => ({
  key, name: `Name ${key}`, description: `About ${key}`, needs: ["A connected CRM"], config: [], steps: [{ key: "s1", title: "Add the lead" }], automation: null, ...over,
});
const mine = (key: string, over: any = {}) => ({ id: `id-${key}`, templateKey: key, name: key, enabled: false, approvalMode: "ask", config: {}, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  h.runs.mockResolvedValue([]);
});

describe("library", () => {
  it("shows a card per template with name, description, needs and an On/Off badge", async () => {
    h.library.mockResolvedValue([tpl("a", { automation: mine("a", { enabled: true }) }), tpl("b")]);
    render(<AutomationsLibrary />);
    expect(await screen.findByText("Name a")).toBeTruthy();
    expect(screen.getByText("About b")).toBeTruthy();
    expect(screen.getAllByText(/A connected CRM/).length).toBe(2);
    expect(screen.getByText("On")).toBeTruthy();
    expect(screen.getByText("Off")).toBeTruthy();
  });

  it("shows the last run's status and time on the card", async () => {
    h.library.mockResolvedValue([tpl("a", { automation: mine("a") })]);
    h.runs.mockResolvedValue([{ id: "r1", automationId: "id-a", status: "failed", startedAt: "2026-11-01T10:00:00Z" }]);
    render(<AutomationsLibrary />);
    expect(await screen.findByText(/Failed, /)).toBeTruthy();
  });

  it("says so when there are no templates, and on a load error", async () => {
    h.library.mockResolvedValueOnce([]);
    const { unmount } = render(<AutomationsLibrary />);
    expect(await screen.findByText("No automations are available yet")).toBeTruthy();
    unmount();
    h.library.mockRejectedValueOnce(new AutomationsApiError("x", 500));
    render(<AutomationsLibrary />);
    expect(await screen.findByText(/We could not load this just now/)).toBeTruthy();
  });

  it("switches on and saves, defaulting to asking first", async () => {
    h.library.mockResolvedValue([tpl("a")]);
    h.save.mockResolvedValue(mine("a", { enabled: true }));
    render(<AutomationsLibrary />);
    fireEvent.click(await screen.findByRole("button", { name: /Name a, Off/ }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByLabelText(/Ask me before it does anything outside Halla AI/)).toBeChecked();
    fireEvent.click(within(dialog).getByRole("switch"));
    fireEvent.click(within(dialog).getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledWith("a", { enabled: true, approvalMode: "ask", config: {} }));
    expect(await within(dialog).findByText("Saved.")).toBeTruthy();
    expect(screen.getAllByText("On").length).toBeGreaterThan(0);
  });

  it("builds the settings form from fields of every type and saves typed values", async () => {
    h.library.mockResolvedValue([tpl("a", { config: fields, automation: mine("a", { config: { owner: "boss@x.co" } }) })]);
    h.save.mockResolvedValue(mine("a"));
    render(<AutomationsLibrary />);
    fireEvent.click(await screen.findByRole("button", { name: /Name a/ }));
    const label = screen.getByLabelText(/Label/) as HTMLInputElement;
    expect(label.value).toBe("Hello");
    expect(label).toHaveAttribute("aria-required", "true");
    expect(screen.getByText("Shown to staff")).toBeTruthy();
    expect((screen.getByLabelText("Limit") as HTMLInputElement).type).toBe("number");
    expect((screen.getByLabelText("Limit") as HTMLInputElement).value).toBe("5");
    expect((screen.getByLabelText(/Notify me/) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Channel") as HTMLSelectElement).value).toBe("sms");
    expect((screen.getByLabelText("Owner email") as HTMLInputElement).type).toBe("email");
    expect((screen.getByLabelText("Owner email") as HTMLInputElement).value).toBe("boss@x.co");
    expect((screen.getByLabelText("Webhook address") as HTMLInputElement).type).toBe("url");
    fireEvent.change(screen.getByLabelText("Limit"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("Channel"), { target: { value: "wa" } });
    fireEvent.click(screen.getByLabelText(/Notify me/));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(h.save).toHaveBeenCalled());
    expect(h.save.mock.calls[0][1].config).toEqual({ label: "Hello", limit: 9, notify: false, channel: "wa", owner: "boss@x.co" });
  });

  it("shows the gateway's sentences next to the form on a 400", async () => {
    h.library.mockResolvedValue([tpl("a", { config: fields })]);
    h.save.mockRejectedValue(new AutomationsApiError("Check the settings", 400, ["Add the owner email", "The webhook address must start with https"]));
    render(<AutomationsLibrary />);
    fireEvent.click(await screen.findByRole("button", { name: /Name a/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    const alert = await screen.findByText("Please check these settings");
    expect(alert.parentElement?.textContent).toContain("Add the owner email");
    expect(alert.parentElement?.textContent).toContain("The webhook address must start with https");
  });

  it("asks before switching to Run by itself, and Save waits for the yes", async () => {
    h.library.mockResolvedValue([tpl("a", { automation: mine("a", { enabled: true }) })]);
    h.save.mockResolvedValue(mine("a", { enabled: true, approvalMode: "auto" }));
    render(<AutomationsLibrary />);
    fireEvent.click(await screen.findByRole("button", { name: /Name a/ }));
    fireEvent.click(screen.getByLabelText(/Run by itself/));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByText("Let this automation run by itself?")).toBeTruthy();
    expect(h.save).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, run by itself" }));
    await waitFor(() => expect(h.save).toHaveBeenCalledWith("a", expect.objectContaining({ approvalMode: "auto" })));
  });

  it("goes back to asking first when the owner declines", async () => {
    h.library.mockResolvedValue([tpl("a")]);
    render(<AutomationsLibrary />);
    fireEvent.click(await screen.findByRole("button", { name: /Name a/ }));
    fireEvent.click(screen.getByLabelText(/Run by itself/));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    fireEvent.click(screen.getByRole("button", { name: "No, keep asking me" }));
    expect(h.save).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/Ask me before/)).toBeChecked();
  });

  it("shows a calm message on 403", async () => {
    h.library.mockResolvedValue([tpl("a")]);
    h.save.mockRejectedValue(new AutomationsApiError("no", 403));
    render(<AutomationsLibrary />);
    fireEvent.click(await screen.findByRole("button", { name: /Name a/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText(/Only owners and admins can change automations/)).toBeTruthy();
  });

  it("shows the upload box only while document-intake is on, in the panel too", async () => {
    h.library.mockResolvedValue([tpl("document-intake", { automation: mine("document-intake", { enabled: true }) }), tpl("b")]);
    render(<AutomationsLibrary />);
    expect(await screen.findByText("Upload a document")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Name document-intake/ }));
    expect(within(screen.getByRole("dialog")).getByText("Upload a document")).toBeTruthy();
  });

  it("hides the upload box while document-intake is off", async () => {
    h.library.mockResolvedValue([tpl("document-intake")]);
    render(<AutomationsLibrary />);
    await screen.findByText("Name document-intake");
    expect(screen.queryByText("Upload a document")).toBeNull();
  });
});
