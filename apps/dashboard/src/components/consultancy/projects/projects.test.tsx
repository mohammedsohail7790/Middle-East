import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ProjectList } from "./ProjectList";
import { MilestoneEditor } from "./MilestoneEditor";
import { HandoverChecklist } from "./HandoverChecklist";
import type { Milestone, ProjectSummary } from "./types";

const H = { code: false, data: true, accounts: false, documentation: false };
const project = (o: Partial<ProjectSummary>): ProjectSummary => ({
  id: "p1", name: "CRM build", company: "Acme", status: "in_progress", startsOn: null, deliveryDate: "2026-04-01", deliveredAt: null, handover: H, clientNotes: null, overdue: false, warrantyEndsOn: null, milestoneTotal: 4, milestoneDone: 1, ...o,
});
const ms = (id: string, title: string, done = false): Milestone => ({ id, title, dueOn: null, done, note: null, position: 0 });

describe("ProjectList", () => {
  it("shows status chip, progress and picks a project", () => {
    const onSelect = vi.fn();
    render(<ProjectList projects={[project({})]} onSelect={onSelect} />);
    expect(screen.getByText("In progress")).toBeTruthy();
    expect(screen.getByText("1 of 4 milestones done")).toBeTruthy();
    expect(screen.getByRole("progressbar").getAttribute("aria-valuenow")).toBe("25");
    fireEvent.click(screen.getByText("CRM build"));
    expect(onSelect).toHaveBeenCalledWith("p1");
  });
  it("highlights overdue projects only", () => {
    render(<ProjectList projects={[project({ overdue: true }), project({ id: "p2", name: "Other" })]} onSelect={() => undefined} />);
    expect(screen.getByText("Overdue")).toBeTruthy();
    const rows = screen.getAllByRole("button");
    expect(rows[0].getAttribute("data-overdue")).toBe("true");
    expect(rows[1].getAttribute("data-overdue")).toBe("false");
  });
  it("explains an empty list", () => {
    render(<ProjectList projects={[]} onSelect={() => undefined} />);
    expect(screen.getByText(/No projects yet/)).toBeTruthy();
  });
});

describe("MilestoneEditor", () => {
  const setup = () => {
    const h = { onAdd: vi.fn(), onToggle: vi.fn(), onMove: vi.fn(), onDelete: vi.fn() };
    const list = [ms("a", "Design"), ms("b", "Build", true)];
    render(<MilestoneEditor milestones={list} {...h} />);
    return { h, list };
  };
  it("adds a milestone with its due date and clears the form", () => {
    const { h } = setup();
    fireEvent.change(screen.getByLabelText("New milestone title"), { target: { value: "  Launch " } });
    fireEvent.change(screen.getByLabelText("New milestone due date"), { target: { value: "2026-05-01" } });
    fireEvent.click(screen.getByText("Add milestone"));
    expect(h.onAdd).toHaveBeenCalledWith("Launch", "2026-05-01");
    expect((screen.getByLabelText("New milestone title") as HTMLInputElement).value).toBe("");
  });
  it("ignores an empty title", () => {
    const { h } = setup();
    fireEvent.click(screen.getByText("Add milestone"));
    expect(h.onAdd).not.toHaveBeenCalled();
  });
  it("ticks, reorders (not past the ends) and deletes", () => {
    const { h, list } = setup();
    fireEvent.click(screen.getByLabelText("Done: Design"));
    expect(h.onToggle).toHaveBeenCalledWith(list[0]);
    expect((screen.getByLabelText("Done: Build") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Move up: Design") as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByLabelText("Move down: Build") as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByLabelText("Move down: Design"));
    expect(h.onMove).toHaveBeenCalledWith(list[0], 1);
    fireEvent.click(screen.getByLabelText("Delete: Build"));
    expect(h.onDelete).toHaveBeenCalledWith(list[1]);
  });
});

describe("HandoverChecklist", () => {
  it("shows the four items with their state and reports a change", () => {
    const onChange = vi.fn();
    render(<HandoverChecklist handover={H} onChange={onChange} />);
    for (const l of ["Code", "Data", "Accounts", "Documentation"]) expect(screen.getByLabelText(l)).toBeTruthy();
    expect((screen.getByLabelText("Data") as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText("Code") as HTMLInputElement).checked).toBe(false);
    fireEvent.click(screen.getByLabelText("Code"));
    expect(onChange).toHaveBeenCalledWith("code", true);
    fireEvent.click(screen.getByLabelText("Data"));
    expect(onChange).toHaveBeenCalledWith("data", false);
  });
});
