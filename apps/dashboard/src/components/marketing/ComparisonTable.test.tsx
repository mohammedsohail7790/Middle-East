import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ComparisonTable } from "./ComparisonTable";

describe("ComparisonTable", () => {
  it("renders each row's need and all three comparison cells", () => {
    render(
      <ComparisonTable
        competitorLabel="Halla AI Consultancy"
        rows={[
          {
            need: "Connected systems, not one-off tools",
            hallaAi: "One layer across ops, sales & social",
            diy: "Disconnected apps, manual glue work",
            agency: "Often siloed by department",
          },
        ]}
      />,
    );
    expect(screen.getByText("Connected systems, not one-off tools")).toBeInTheDocument();
    expect(screen.getByText("One layer across ops, sales & social")).toBeInTheDocument();
    expect(screen.getByText("Disconnected apps, manual glue work")).toBeInTheDocument();
    expect(screen.getByText("Often siloed by department")).toBeInTheDocument();
    expect(screen.getByText("Halla AI Consultancy")).toBeInTheDocument();
  });
});
