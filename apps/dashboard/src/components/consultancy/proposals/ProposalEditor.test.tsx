import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProposalEditor } from "./ProposalEditor";

const leads = [{ id: "lead-1", label: "Acme, Sara" }];

describe("ProposalEditor", () => {
  it("totals the items and submits prices in the smallest currency unit", () => {
    const onSubmit = vi.fn();
    render(<ProposalEditor leads={leads} onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "Receptionist" } });
    fireEvent.change(screen.getByLabelText("Item 1 title"), { target: { value: "Bot" } });
    fireEvent.change(screen.getByLabelText("Item 1 price"), { target: { value: "8000" } });
    fireEvent.click(screen.getByText("Add item"));
    fireEvent.change(screen.getByLabelText("Item 2 title"), { target: { value: "Dashboard" } });
    fireEvent.change(screen.getByLabelText("Item 2 price"), { target: { value: "5000.50" } });
    fireEvent.change(screen.getByLabelText("Delivery weeks"), { target: { value: "6" } });
    expect(screen.getByTestId("proposal-total")).toHaveTextContent("AED 13,000.5");
    fireEvent.click(screen.getByText("Save draft"));
    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        leadId: "lead-1",
        title: "Receptionist",
        currency: "AED",
        deliveryWeeks: 6,
        language: "en",
        items: [
          { title: "Bot", priceMinor: 800000 },
          { title: "Dashboard", priceMinor: 500050 },
        ],
      }),
    );
  });

  it("uses thousandths for three-decimal currencies", () => {
    const onSubmit = vi.fn();
    render(<ProposalEditor leads={leads} onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Currency"), { target: { value: "KWD" } });
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Item 1 title"), { target: { value: "Bot" } });
    fireEvent.change(screen.getByLabelText("Item 1 price"), { target: { value: "2500" } });
    fireEvent.click(screen.getByText("Save draft"));
    expect(onSubmit.mock.calls[0][0].items[0].priceMinor).toBe(2500000);
  });

  it("refuses an item without a price, and lets the team remove an item", () => {
    const onSubmit = vi.fn();
    render(<ProposalEditor leads={leads} onSubmit={onSubmit} onCancel={() => {}} />);
    fireEvent.change(screen.getByLabelText("Title"), { target: { value: "T" } });
    fireEvent.change(screen.getByLabelText("Item 1 title"), { target: { value: "Bot" } });
    fireEvent.click(screen.getByText("Save draft"));
    expect(screen.getByRole("alert")).toHaveTextContent("price above zero");
    expect(onSubmit).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Add item"));
    fireEvent.click(screen.getByLabelText("Remove item 2"));
    expect(screen.queryByLabelText("Item 2 title")).toBeNull();
  });

  it("asks for a lead id when no leads are listed", () => {
    render(<ProposalEditor leads={[]} onSubmit={() => {}} onCancel={() => {}} />);
    expect(screen.getByPlaceholderText("Lead id")).toBeInTheDocument();
  });
});
