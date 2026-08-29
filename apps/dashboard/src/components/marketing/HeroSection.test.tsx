import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { HeroSection } from "./HeroSection";

describe("HeroSection", () => {
  it("renders eyebrow, headline, subcopy, and CTA links", () => {
    render(
      <HeroSection
        eyebrow="Halla AI Consultancy"
        headline="We Don't Sell AI. We Install It."
        subcopy="An implementation partner for small businesses."
        ctas={[
          { label: "Book a Diagnostic Call", href: "/consult-signup" },
          { label: "See the AI Receptionist", href: "/", variant: "outline" },
        ]}
      />,
    );
    expect(screen.getByText("Halla AI Consultancy")).toBeInTheDocument();
    expect(screen.getByText("We Don't Sell AI. We Install It.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book a Diagnostic Call" })).toHaveAttribute(
      "href",
      "/consult-signup",
    );
    expect(screen.getByRole("link", { name: "See the AI Receptionist" })).toBeInTheDocument();
  });

  it("renders children below the CTAs", () => {
    render(
      <HeroSection eyebrow="e" headline="h" subcopy="s" ctas={[]}>
        <div data-testid="extra">extra content</div>
      </HeroSection>,
    );
    expect(screen.getByTestId("extra")).toBeInTheDocument();
  });
});
