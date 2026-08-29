import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { SiteFooter } from "./SiteFooter";

describe("SiteFooter", () => {
  it("renders consultancy-specific links when brand is consultancy", () => {
    render(<SiteFooter brand="consultancy" />);
    expect(screen.getByRole("link", { name: "Operations Automation" })).toHaveAttribute(
      "href",
      "/services/operations",
    );
    expect(screen.queryByRole("link", { name: "Plans & Pricing" })).not.toBeInTheDocument();
  });

  it("renders receptionist-specific links when brand is receptionist", () => {
    render(<SiteFooter brand="receptionist" />);
    expect(screen.getByRole("link", { name: "Plans & Pricing" })).toHaveAttribute("href", "/pricing");
    expect(screen.queryByRole("link", { name: "Operations Automation" })).not.toBeInTheDocument();
  });

  it("always renders the shared company column", () => {
    render(<SiteFooter brand="consultancy" />);
    expect(screen.getByRole("link", { name: "Privacy Policy" })).toHaveAttribute("href", "/privacy");
  });
});
