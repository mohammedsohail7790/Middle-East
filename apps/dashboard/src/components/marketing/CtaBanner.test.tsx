import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { CtaBanner } from "./CtaBanner";

describe("CtaBanner", () => {
  it("renders eyebrow, headline, subcopy, and CTA links", () => {
    render(
      <CtaBanner
        eyebrow="Ready When You Are"
        headline="Let's map out where AI can move the needle in your business"
        subcopy="Book a diagnostic call."
        ctas={[
          { label: "Book Your Diagnostic Call", href: "/consult-signup" },
          { label: "See the AI Receptionist", href: "/design-preview/receptionist", variant: "outline" },
        ]}
      />,
    );
    expect(screen.getByText("Ready When You Are")).toBeInTheDocument();
    expect(
      screen.getByText("Let's map out where AI can move the needle in your business"),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Book Your Diagnostic Call" })).toHaveAttribute(
      "href",
      "/consult-signup",
    );
  });
});
