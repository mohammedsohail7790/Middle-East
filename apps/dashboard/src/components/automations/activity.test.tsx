import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const h = vi.hoisted(() => ({ library: vi.fn(), approvals: vi.fn(), decide: vi.fn(), runs: vi.fn(), run: vi.fn(), retry: vi.fn(), stats: vi.fn(), notify: vi.fn() }));
vi.mock("next-intl", async () => (await import("./test-intl")).intlMock);
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, className }: any) => <a href={href} className={className}>{children}</a> }));
vi.mock("./client", () => ({
  automationsApi: { library: h.library, approvals: h.approvals, decide: h.decide, runs: h.runs, run: h.run, retry: h.retry, stats: h.stats },
  notifyApprovalsChanged: h.notify,
}));

import { AutomationActivity } from "./AutomationActivity";
import { AutomationsApiError } from "./errors";
import { COST_STORAGE_KEY } from "./StatsTab";

const library = [{ key: "lead-follow-up", name: "Lead follow-up", description: "d", steps: [{ key: "push", title: "Add the lead to your CRM" }, { key: "mail", title: "Email the customer" }], automation: { id: "auto-1", templateKey: "lead-follow-up", name: "Lead follow-up", enabled: true, approvalMode: "ask", config: {} } }];
const approval = (over: any = {}) => ({
  id: "ap1", runId: "r1", stepIndex: 1, stepKey: "mail", summary: "Email Sara a welcome note", status: "pending", createdAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + 125 * 60000).toISOString(), proposal: { toEmail: "sara@x.co", subject: "Welcome", notify: true }, ...over,
});
const run = (over: any = {}) => ({ id: "r1", automationId: "auto-1", triggerKind: "lead.created", status: "succeeded", steps: [], error: null, minutesSaved: 12, startedAt: "2026-11-01T10:00:00Z", finishedAt: null, ...over });

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  h.library.mockResolvedValue(library);
  h.approvals.mockResolvedValue([]);
  h.runs.mockResolvedValue([]);
});

describe("waiting for you", () => {
  it("shows the summary, the proposal as a list, and the time left", async () => {
    h.approvals.mockResolvedValue([approval()]);
    render(<AutomationActivity />);
    expect(await screen.findByText("Email Sara a welcome note")).toBeTruthy();
    expect(screen.getByText("To email")).toBeTruthy();
    expect(screen.getByText("sara@x.co")).toBeTruthy();
    expect(screen.getByText("Yes")).toBeTruthy();
    expect(screen.getByText(/2 h \d+ min left to answer/)).toBeTruthy();
    expect(screen.queryByText(/\{/)).toBeNull();
  });

  it("approves and refreshes the list", async () => {
    h.approvals.mockResolvedValueOnce([approval()]).mockResolvedValue([]);
    h.decide.mockResolvedValue({});
    render(<AutomationActivity />);
    fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
    await waitFor(() => expect(h.decide).toHaveBeenCalledWith("ap1", "approve"));
    expect(await screen.findByText("Done. You approved it.")).toBeTruthy();
    expect(h.notify).toHaveBeenCalled();
  });

  it("rejects with Don't do it", async () => {
    h.approvals.mockResolvedValueOnce([approval()]).mockResolvedValue([]);
    h.decide.mockResolvedValue({});
    render(<AutomationActivity />);
    fireEvent.click(await screen.findByRole("button", { name: "Don't do it" }));
    await waitFor(() => expect(h.decide).toHaveBeenCalledWith("ap1", "reject"));
    expect(await screen.findByText("Done. It will not be carried out.")).toBeTruthy();
  });

  it("handles already answered (409), expired (409) and not found (404) with a refresh and a calm message", async () => {
    for (const [err, text] of [
      [new AutomationsApiError("This request was already answered", 409), /already answered/],
      [new AutomationsApiError("This request has expired", 409), /ran out of time/],
      [new AutomationsApiError("Approval not found", 404), /could not find this request/],
    ] as const) {
      h.approvals.mockReset();
      h.approvals.mockResolvedValueOnce([approval()]).mockResolvedValue([]);
      h.decide.mockRejectedValueOnce(err);
      const { unmount } = render(<AutomationActivity />);
      fireEvent.click(await screen.findByRole("button", { name: "Approve" }));
      expect(await screen.findByText(text)).toBeTruthy();
      expect(h.approvals).toHaveBeenCalledTimes(2);
      unmount();
    }
  });

  it("says nothing is waiting", async () => {
    render(<AutomationActivity />);
    expect(await screen.findByText("Nothing is waiting for you")).toBeTruthy();
  });
});

describe("what happened", () => {
  async function openTab() {
    render(<AutomationActivity />);
    fireEvent.click(await screen.findByRole("tab", { name: "What happened" }));
  }

  it("lists runs with name, trigger in plain words, status and minutes saved", async () => {
    h.runs.mockResolvedValue([run()]);
    await openTab();
    expect(await screen.findByText("Lead follow-up")).toBeTruthy();
    expect(screen.getByText(/A new lead came in/)).toBeTruthy();
    expect(screen.getAllByText("Done").length).toBeGreaterThan(0);
    expect(screen.getByText(/12 min/)).toBeTruthy();
  });

  it("filters by status and by automation", async () => {
    h.runs.mockResolvedValue([run()]);
    await openTab();
    await screen.findByText(/A new lead came in/);
    fireEvent.change(screen.getByLabelText("Status"), { target: { value: "failed" } });
    await waitFor(() => expect(h.runs).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", offset: 0 })));
    fireEvent.change(screen.getByLabelText("Automation"), { target: { value: "auto-1" } });
    await waitFor(() => expect(h.runs).toHaveBeenLastCalledWith(expect.objectContaining({ status: "failed", automation: "auto-1" })));
  });

  it("pages with Load more", async () => {
    const page = Array.from({ length: 20 }, (_, i) => run({ id: `p${i}` }));
    h.runs.mockResolvedValueOnce(page).mockResolvedValueOnce([run({ id: "last" })]);
    await openTab();
    fireEvent.click(await screen.findByRole("button", { name: "Load more" }));
    await waitFor(() => expect(h.runs).toHaveBeenLastCalledWith(expect.objectContaining({ offset: 20 })));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Load more" })).toBeNull());
    expect(screen.getAllByRole("listitem").length).toBe(21);
  });

  it("opens a run as a step timeline with titles, summaries and errors", async () => {
    h.runs.mockResolvedValue([run({ status: "failed" })]);
    h.run.mockResolvedValue(run({ status: "failed", error: "The CRM said no", steps: [
      { index: 0, key: "push", status: "succeeded", summary: "Added Sara to your CRM" },
      { index: 1, key: "mail", status: "failed", error: "Mailbox is full" },
    ] }));
    await openTab();
    fireEvent.click(await screen.findByRole("button", { name: "Details" }));
    expect(await screen.findByText("Add the lead to your CRM")).toBeTruthy();
    expect(screen.getByText("Email the customer")).toBeTruthy();
    expect(screen.getByText("Added Sara to your CRM")).toBeTruthy();
    expect(screen.getByText("Mailbox is full")).toBeTruthy();
    expect(screen.getByText(/The CRM said no/)).toBeTruthy();
  });

  it("runs a failed run again, and handles 501 and 409", async () => {
    h.runs.mockResolvedValue([run({ status: "failed" })]);
    h.run.mockResolvedValue(run({ status: "failed" }));
    h.retry.mockResolvedValueOnce({}).mockRejectedValueOnce(new AutomationsApiError("Not available yet", 501)).mockRejectedValueOnce(new AutomationsApiError("x", 409));
    await openTab();
    fireEvent.click(await screen.findByRole("button", { name: "Details" }));
    const retry = await screen.findByRole("button", { name: "Run it again" });
    fireEvent.click(retry);
    expect(await screen.findByText(/Started again/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Run it again" }));
    expect(await screen.findByText("Running it again is not available yet.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Run it again" }));
    expect(await screen.findByText(/Only a run that failed can be run again/)).toBeTruthy();
  });

  it("offers no retry for a run that did not fail", async () => {
    h.runs.mockResolvedValue([run()]);
    h.run.mockResolvedValue(run());
    await openTab();
    fireEvent.click(await screen.findByRole("button", { name: "Details" }));
    await screen.findByText("No steps were recorded.");
    expect(screen.queryByRole("button", { name: "Run it again" })).toBeNull();
  });
});

describe("time saved", () => {
  const stats = { days: 30, runs: 10, succeeded: 8, failed: 1, waitingApproval: 1, minutesSaved: 150, byAutomation: [{ automationId: "auto-1", templateKey: "lead-follow-up", name: "Lead follow-up", runs: 10, succeeded: 8, minutesSaved: 150 }] };
  async function openTab() {
    h.stats.mockResolvedValue(stats);
    render(<AutomationActivity />);
    fireEvent.click(await screen.findByRole("tab", { name: "Time saved" }));
    await screen.findByText("By automation");
  }

  it("shows the numbers, the hours as an estimate, and a per-automation table", async () => {
    await openTab();
    expect(h.stats).toHaveBeenCalledWith(30);
    expect(screen.getAllByText("10").length).toBeGreaterThan(0);
    expect(screen.getAllByText("2.5 h").length).toBe(2);
    expect(screen.getAllByText("estimate").length).toBeGreaterThan(0);
    expect(within(screen.getByRole("table")).getByText("Lead follow-up")).toBeTruthy();
  });

  it("switches the period", async () => {
    await openTab();
    fireEvent.click(screen.getByRole("button", { name: "90 days" }));
    await waitFor(() => expect(h.stats).toHaveBeenLastCalledWith(90));
  });

  it("turns hours into an estimated value only when the owner enters a cost, and keeps it in the browser", async () => {
    await openTab();
    expect(screen.queryByText("Estimated value")).toBeNull();
    fireEvent.change(screen.getByLabelText("Cost per hour"), { target: { value: "100" } });
    expect(await screen.findByText("Estimated value")).toBeTruthy();
    expect(screen.getByText(/250/)).toBeTruthy();
    expect(screen.getByText("An estimate based on the cost per hour you enter, not a measurement.")).toBeTruthy();
    expect(JSON.parse(window.localStorage.getItem(COST_STORAGE_KEY)!)).toEqual({ rate: "100", currency: "AED" });
  });

  it("remembers the cost from the last visit", async () => {
    window.localStorage.setItem(COST_STORAGE_KEY, JSON.stringify({ rate: "40", currency: "AED" }));
    await openTab();
    expect((screen.getByLabelText("Cost per hour") as HTMLInputElement).value).toBe("40");
    expect(screen.getByText(/100/)).toBeTruthy();
  });
});
