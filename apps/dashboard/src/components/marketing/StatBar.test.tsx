import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { StatBar } from "./StatBar";

describe("StatBar", () => {
  it("renders one card per stat with its value and label", () => {
    render(
      <StatBar
        stats={[
          { value: "20", label: "hours/week reclaimed" },
          { value: "3", label: "connected systems" },
          { value: "1st", label: "responder wins the lead", accent: true },
        ]}
      />,
    );
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("hours/week reclaimed")).toBeInTheDocument();
    expect(screen.getByText("1st")).toBeInTheDocument();
  });
});
