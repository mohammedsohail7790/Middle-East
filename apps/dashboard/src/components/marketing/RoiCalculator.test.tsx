import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { RoiCalculator } from "./RoiCalculator";

describe("RoiCalculator", () => {
  it("computes revenue recovered from the default inputs (20 missed calls, $500 value, 30% conversion, $149 plan)", () => {
    render(<RoiCalculator />);
    // monthly = round(20 * 0.30 * 500) = 3000; annual = 36000; cost = 149*12 = 1788; net = 34212
    expect(screen.getByText("$3,000")).toBeInTheDocument();
    expect(screen.getByText("$36,000")).toBeInTheDocument();
    expect(screen.getByText("$1,788")).toBeInTheDocument();
    expect(screen.getByText("$34,212")).toBeInTheDocument();
  });

  it("recomputes when the missed-calls input changes", () => {
    render(<RoiCalculator />);
    const missedInput = screen.getByLabelText("Monthly Calls You Currently Miss");
    fireEvent.change(missedInput, { target: { value: "40" } });
    // monthly = round(40 * 0.30 * 500) = 6000
    expect(screen.getByText("$6,000")).toBeInTheDocument();
  });

  it("has a CTA linking to signup", () => {
    render(<RoiCalculator />);
    expect(screen.getByRole("link", { name: /Start Free Trial/ })).toHaveAttribute("href", "/signup");
  });
});
