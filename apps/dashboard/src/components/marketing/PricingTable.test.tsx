import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricingTable } from "./PricingTable";
import { PRICING_PLANS } from "@/content/pricing";

describe("PricingTable", () => {
  it("renders each plan's name, price, and CTA link to signup", () => {
    render(<PricingTable plans={PRICING_PLANS} />);
    expect(screen.getByText("Essential")).toBeInTheDocument();
    expect(screen.getByText("Professional")).toBeInTheDocument();
    expect(screen.getByText("Enterprise")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Start Free Trial" })).toHaveLength(3);
    expect(screen.getAllByRole("link", { name: "Start Free Trial" })[0]).toHaveAttribute(
      "href",
      "/signup",
    );
  });

  it("shows the popular badge only on the Professional plan", () => {
    render(<PricingTable plans={PRICING_PLANS} />);
    expect(screen.getByText("Most Popular")).toBeInTheDocument();
    expect(screen.getAllByText("Most Popular")).toHaveLength(1);
  });
});
