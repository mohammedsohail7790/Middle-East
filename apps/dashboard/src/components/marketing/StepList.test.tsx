import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StepList } from "./StepList";

describe("StepList", () => {
  it("renders each step's number, title, and description", () => {
    render(
      <StepList
        steps={[
          { number: "01", title: "Diagnostic call", description: "We trace where time leaks." },
          { number: "02", title: "Map, then build", description: "We build a working system." },
        ]}
      />,
    );
    expect(screen.getByText("01")).toBeInTheDocument();
    expect(screen.getByText("Diagnostic call")).toBeInTheDocument();
    expect(screen.getByText("We build a working system.")).toBeInTheDocument();
  });
});
