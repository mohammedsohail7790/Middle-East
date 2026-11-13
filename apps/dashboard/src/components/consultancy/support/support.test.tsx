import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SupportPlansTable } from "./SupportPlansTable";
import { LogHoursForm } from "./LogHoursForm";
import { CreatePlanForm } from "./CreatePlanForm";
import { moneyText, toMinor, type SupportPlanRow } from "./types";

const plan = (o: Partial<SupportPlanRow> = {}): SupportPlanRow => ({
  id: "p1", lead_id: "l1", kind: "standard", currency: "AED", price_minor: 75000, hours_included: 4, status: "active", company: "Acme", email: "a@acme.test",
  usage: { month: "2026-11", usedHours: 3, includedHours: 4, percent: 75, over: false }, ...o,
});

describe("money helpers", () => {
  it("formats and parses minor units without floats", () => {
    expect(moneyText(75000, "AED")).toBe("AED 750.00");
    expect(toMinor("5000")).toBe(500000);
    expect(toMinor("5000.5")).toBe(500050);
    expect(toMinor("abc")).toBeNull();
  });
});

describe("support plans table", () => {
  it("shows the plan, status and a green usage bar", () => {
    render(<SupportPlansTable plans={[plan()]} onLogHours={vi.fn()} onSendLink={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText("Acme")).toBeTruthy();
    expect(screen.getByText("AED 750.00 per month")).toBeTruthy();
    expect(screen.getByText("Active")).toBeTruthy();
    expect(screen.getByText("3 of 4 hours")).toBeTruthy();
    expect(screen.getByRole("progressbar").firstElementChild?.className).toContain("bg-emerald-600");
  });
  it("turns the bar red and says over when hours are exceeded", () => {
    render(<SupportPlansTable plans={[plan({ usage: { month: "2026-11", usedHours: 5, includedHours: 4, percent: 125, over: true } })]} onLogHours={vi.fn()} onSendLink={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByRole("progressbar").firstElementChild?.className).toContain("bg-red-600");
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("100");
    expect(screen.getByText("5 of 4 hours (over)")).toBeTruthy();
  });
  it("offers the payment link only while pending, and no actions once cancelled", () => {
    const onSendLink = vi.fn();
    const { rerender } = render(<SupportPlansTable plans={[plan({ status: "pending" })]} onLogHours={vi.fn()} onSendLink={onSendLink} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByText("Send payment link"));
    expect(onSendLink).toHaveBeenCalled();
    rerender(<SupportPlansTable plans={[plan({ status: "cancelled" })]} onLogHours={vi.fn()} onSendLink={onSendLink} onCancel={vi.fn()} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
  it("says so when there are no plans", () => {
    render(<SupportPlansTable plans={[]} onLogHours={vi.fn()} onSendLink={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByText(/No support plans yet/)).toBeTruthy();
  });
});

describe("log hours form", () => {
  it("refuses 0, negative and more than 24 hours without calling save", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<LogHoursForm planName="Acme" onSubmit={onSubmit} onClose={vi.fn()} />);
    const input = screen.getByLabelText("Hours");
    for (const bad of ["", "0", "-2", "25"]) {
      fireEvent.change(input, { target: { value: bad } });
      fireEvent.click(screen.getByText("Save hours"));
      expect(await screen.findByRole("alert")).toBeTruthy();
    }
    expect(onSubmit).not.toHaveBeenCalled();
  });
  it("submits hours, date and note", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<LogHoursForm planName="Acme" onSubmit={onSubmit} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "1.5" } });
    fireEvent.change(screen.getByLabelText("What was done"), { target: { value: "Fixed login" } });
    fireEvent.click(screen.getByText("Save hours"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ hours: 1.5, note: "Fixed login" }));
  });
  it("shows the server error", async () => {
    render(<LogHoursForm planName="Acme" onSubmit={vi.fn().mockRejectedValue(new Error("This plan is cancelled"))} onClose={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Hours"), { target: { value: "1" } });
    fireEvent.click(screen.getByText("Save hours"));
    expect((await screen.findByRole("alert")).textContent).toBe("This plan is cancelled");
  });
});

describe("create plan form", () => {
  it("sends a standard plan with just lead and kind", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreatePlanForm leads={[{ id: "l1", company: "Acme" }]} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Lead"), { target: { value: "l1" } });
    fireEvent.click(screen.getByText("Create plan"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ leadId: "l1", kind: "standard" }));
  });
  it("requires at least 5,000 for a partner plan and sends minor units", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    render(<CreatePlanForm leads={[]} onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("Lead"), { target: { value: "l1" } });
    fireEvent.change(screen.getByLabelText("Plan"), { target: { value: "partner" } });
    fireEvent.change(screen.getByLabelText("Price (AED)"), { target: { value: "4999" } });
    fireEvent.change(screen.getByLabelText("Hours per month"), { target: { value: "10" } });
    fireEvent.click(screen.getByText("Create plan"));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Price (AED)"), { target: { value: "6000" } });
    fireEvent.click(screen.getByText("Create plan"));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ leadId: "l1", kind: "partner", priceMinor: 600000, hoursIncluded: 10 }));
  });
});
