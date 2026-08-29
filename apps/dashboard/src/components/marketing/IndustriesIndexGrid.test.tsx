import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IndustriesIndexGrid } from "./IndustriesIndexGrid";

describe("IndustriesIndexGrid", () => {
  it("links each real industry to its detail page", () => {
    render(<IndustriesIndexGrid />);
    expect(screen.getByRole("link", { name: /HVAC/ })).toHaveAttribute(
      "href",
      "/design-preview/receptionist/industries/hvac",
    );
  });

  it("renders placeholder categories as non-interactive cards", () => {
    render(<IndustriesIndexGrid />);
    expect(screen.getByText("Property Management")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Property Management/ })).not.toBeInTheDocument();
  });
});
