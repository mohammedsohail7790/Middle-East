import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IndustryPageTemplate } from "./IndustryPageTemplate";
import { INDUSTRIES } from "@/content/industries";

describe("IndustryPageTemplate", () => {
  const hvac = INDUSTRIES.find((i) => i.slug === "hvac")!;

  it("renders the industry's tagline, description, and FAQ questions", () => {
    render(<IndustryPageTemplate industry={hvac} />);
    expect(screen.getByRole("heading", { name: /Halla AI for HVAC/i })).toBeInTheDocument();
    expect(screen.getByText(hvac.tagline)).toBeInTheDocument();
    expect(screen.getByText(hvac.description)).toBeInTheDocument();
    expect(screen.getByText(hvac.faqs[0].question)).toBeInTheDocument();
  });

  it("links to every other industry, not itself", () => {
    render(<IndustryPageTemplate industry={hvac} />);
    expect(screen.queryByRole("link", { name: "HVAC" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Plumbing" })).toHaveAttribute(
      "href",
      "/design-preview/receptionist/industries/plumbing",
    );
  });

  it("has a primary CTA linking to signup", () => {
    render(<IndustryPageTemplate industry={hvac} />);
    expect(screen.getByRole("link", { name: "Start Free Trial" })).toHaveAttribute(
      "href",
      "/signup",
    );
  });
});
