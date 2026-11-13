import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), patch: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post, patch: h.patch } }));

import { LeadsPipeline } from "./LeadsPipeline";

const ID = "11111111-2222-4333-8444-555555555555";
const lead = (over: Record<string, unknown> = {}) => ({
  id: ID, source: "fit_check", company: "Acme Property", contact_name: "Sam Lee", email: "sam@acme.test", phone: "+971 50", country: "United Arab Emirates",
  status: "new", notes: null, owner_email: null, created_at: "2026-11-10T09:00:00Z", updated_at: "2026-11-10T09:00:00Z",
  answers: { problem: "Invoices are typed by hand <b>twice</b>", consent: true, painHours: "20 hours" }, ...over,
});
const counts = (over: Record<string, number> = {}) => ({ new: 2, approved: 0, form_sent: 1, form_received: 0, audit_in_review: 0, audit_paid: 0, proposal_sent: 0, won: 0, lost: 0, ...over });

let current: any;
beforeEach(() => {
  [h.get, h.post, h.patch].forEach((f) => f.mockReset());
  current = lead();
  h.get.mockImplementation(async (path: string) => {
    if (path.startsWith(`/consultancy-admin/leads/${ID}`)) return { lead: current, audit: { id: "ab12cd34", status: "in_review", summary: "Acme re-types jobs.", fee_aed: 4500, approved_at: null, paid_at: null, delivered_at: null } };
    return { items: [current, lead({ id: "22222222-2222-4333-8444-555555555555", company: "Beta Trading", status: "form_sent" })], total: 2, counts: counts() };
  });
  h.patch.mockImplementation(async (_p: string, body: any) => (current = { ...current, ...body }));
});

describe("prospect pipeline", () => {
  it("lists the prospects with a count on every status chip", async () => {
    render(<LeadsPipeline />);
    expect(await screen.findByText("Acme Property")).toBeTruthy();
    expect(screen.getByText("Beta Trading")).toBeTruthy();
    const chips = within(screen.getByRole("group", { name: "Filter by status" }));
    expect(chips.getByRole("button", { name: /^All 3$/ })).toBeTruthy();
    expect(chips.getByRole("button", { name: /^New 2$/ })).toBeTruthy();
    expect(chips.getByRole("button", { name: /^Form sent 1$/ })).toBeTruthy();
  });

  it("filters by status and searches, asking the server each time", async () => {
    render(<LeadsPipeline />);
    await screen.findByText("Acme Property");
    fireEvent.click(screen.getByRole("button", { name: /^Form sent/ }));
    await waitFor(() => expect(h.get.mock.calls.some((c) => String(c[0]).includes("status=form_sent"))).toBe(true));
    fireEvent.change(screen.getByLabelText("Search prospects"), { target: { value: "acme" } });
    await waitFor(() => expect(h.get.mock.calls.some((c) => String(c[0]).includes("q=acme") && String(c[0]).includes("status=form_sent"))).toBe(true));
  });

  it("opens the detail with their answers shown as plain text and the audit summary", async () => {
    render(<LeadsPipeline />);
    fireEvent.click(await screen.findByRole("button", { name: "Acme Property" }));
    const panel = await screen.findByRole("complementary", { name: "Prospect details" });
    expect(within(panel).getByText("Invoices are typed by hand <b>twice</b>")).toBeTruthy();
    expect(panel.querySelector("b")).toBeNull();
    expect(within(panel).getByText("Pain hours")).toBeTruthy();
    expect(within(panel).getByText("20 hours")).toBeTruthy();
    expect(within(panel).getByText(/suggested fee AED 4,500/)).toBeTruthy();
  });

  it("changes the status from the panel and refreshes the list", async () => {
    render(<LeadsPipeline />);
    fireEvent.click(await screen.findByRole("button", { name: "Acme Property" }));
    const select = (await screen.findByLabelText("Status")) as HTMLSelectElement;
    const before = h.get.mock.calls.length;
    fireEvent.change(select, { target: { value: "lost" } });
    await waitFor(() => expect(h.patch).toHaveBeenCalledWith(`/consultancy-admin/leads/${ID}`, { status: "lost" }));
    expect(await screen.findByText("Status updated.")).toBeTruthy();
    await waitFor(() => expect(h.get.mock.calls.length).toBeGreaterThan(before));
  });

  it("saves notes and the owner", async () => {
    render(<LeadsPipeline />);
    fireEvent.click(await screen.findByRole("button", { name: "Acme Property" }));
    const notes = await screen.findByLabelText("Notes");
    const save = screen.getByRole("button", { name: "Save notes" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.change(notes, { target: { value: "Call on Monday" } });
    fireEvent.click(save);
    await waitFor(() => expect(h.patch).toHaveBeenCalledWith(`/consultancy-admin/leads/${ID}`, { notes: "Call on Monday" }));
    expect(await screen.findByText("Notes saved.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Owner (email)"), { target: { value: "hk@halla.com" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Save" })[0]);
    await waitFor(() => expect(h.patch).toHaveBeenCalledWith(`/consultancy-admin/leads/${ID}`, { owner_email: "hk@halla.com" }));
  });

  it("shows the server's message when a save fails", async () => {
    h.patch.mockRejectedValue(new Error("owner_email is not a valid email address"));
    render(<LeadsPipeline />);
    fireEvent.click(await screen.findByRole("button", { name: "Acme Property" }));
    fireEvent.change(await screen.findByLabelText("Notes"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "Save notes" }));
    expect((await screen.findByRole("alert")).textContent).toContain("not a valid email");
  });

  it("adds a prospect by hand and opens it", async () => {
    h.post.mockResolvedValue(lead({ source: "manual", company: "Gamma LLC" }));
    render(<LeadsPipeline />);
    await screen.findByText("Acme Property");
    fireEvent.click(screen.getByRole("button", { name: "Add a prospect" }));
    const form = within(screen.getByRole("form", { name: "Add a prospect" }));
    fireEvent.click(form.getByRole("button", { name: "Add prospect" }));
    expect(screen.getByText("Add at least a company, a contact name or an email.")).toBeTruthy();
    expect(h.post).not.toHaveBeenCalled();
    fireEvent.change(form.getByLabelText("Company"), { target: { value: "Gamma LLC" } });
    fireEvent.change(form.getByLabelText("Email"), { target: { value: "g@gamma.test" } });
    fireEvent.click(form.getByRole("button", { name: "Add prospect" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/consultancy-admin/leads", expect.objectContaining({ company: "Gamma LLC", email: "g@gamma.test" })));
    expect(await screen.findByRole("complementary", { name: "Prospect details" })).toBeTruthy();
  });

  it("says so when the list cannot be loaded", async () => {
    h.get.mockRejectedValue(new Error("Team access only"));
    render(<LeadsPipeline />);
    expect((await screen.findByRole("alert")).textContent).toContain("Team access only");
  });
});
