import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ProposalList } from "./ProposalList";
import type { Proposal } from "./proposal-utils";

const base: Proposal = {
  id: "p1", lead_id: "l1", title: "Receptionist", scope: "", items: [{ title: "Bot", priceMinor: 800000 }], currency: "AED", total_minor: 800000,
  delivery_weeks: 4, valid_until: "2030-01-01T00:00:00Z", language: "en", status: "draft", sent_at: null, accepted_at: null, accepted_name: null,
  accepted_ip: null, accepted_user_agent: null, terms_hash: null, declined_reason: null,
};

const handlers = () => ({ onSend: vi.fn(), onWithdraw: vi.fn(), onCopyLink: vi.fn() });

describe("ProposalList", () => {
  it("says so when empty", () => {
    render(<ProposalList proposals={[]} {...handlers()} />);
    expect(screen.getByText("No proposals yet.")).toBeInTheDocument();
  });

  it("offers send and withdraw on a draft", () => {
    const h = handlers();
    render(<ProposalList proposals={[base]} leadNames={{ l1: "Acme" }} {...h} />);
    expect(screen.getByText(/Acme · AED 8,000/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Send"));
    fireEvent.click(screen.getByText("Withdraw"));
    expect(h.onSend).toHaveBeenCalledWith(base);
    expect(h.onWithdraw).toHaveBeenCalledWith(base);
    expect(screen.queryByText("Copy client link")).toBeNull();
  });

  it("offers copy link on a sent proposal", () => {
    const h = handlers();
    render(<ProposalList proposals={[{ ...base, status: "sent" }]} {...h} />);
    fireEvent.click(screen.getByText("Copy client link"));
    expect(h.onCopyLink).toHaveBeenCalled();
    expect(screen.queryByText("Send")).toBeNull();
  });

  it("shows the acceptance evidence and no actions once accepted", () => {
    render(
      <ProposalList
        proposals={[{ ...base, status: "accepted", accepted_name: "Sara Ali", accepted_at: "2030-01-01T10:00:00Z", accepted_ip: "1.2.3.4", accepted_user_agent: "TestBrowser", terms_hash: "abc123" }]}
        {...handlers()}
      />,
    );
    const evidence = screen.getByLabelText("Acceptance evidence");
    expect(evidence).toHaveTextContent("Sara Ali");
    expect(evidence).toHaveTextContent("1.2.3.4");
    expect(evidence).toHaveTextContent("abc123");
    expect(screen.queryByText("Withdraw")).toBeNull();
  });
});
