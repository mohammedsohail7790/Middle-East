import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PricingFeatureTable } from "./PricingFeatureTable";

describe("PricingFeatureTable", () => {
  it("renders each row's feature name and per-plan values", () => {
    render(
      <PricingFeatureTable
        rows={[
          { feature: "Monthly price", essential: "$39", professional: "$149", enterprise: "$499" },
          { feature: "Phone numbers", essential: "1", professional: "3", enterprise: "20+" },
        ]}
      />,
    );
    expect(screen.getByText("Monthly price")).toBeInTheDocument();
    expect(screen.getByText("$39")).toBeInTheDocument();
    expect(screen.getByText("$149")).toBeInTheDocument();
    expect(screen.getByText("$499")).toBeInTheDocument();
    expect(screen.getByText("Phone numbers")).toBeInTheDocument();
    expect(screen.getByText("20+")).toBeInTheDocument();
  });
});
