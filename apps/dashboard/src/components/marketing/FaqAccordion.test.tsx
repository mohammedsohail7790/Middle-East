import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FaqAccordion } from "./FaqAccordion";

describe("FaqAccordion", () => {
  it("renders each question and reveals its answer on click", () => {
    render(
      <FaqAccordion
        items={[
          { question: "How does it work?", answer: "It just does." },
          { question: "Is it secure?", answer: "Yes, encrypted end to end." },
        ]}
      />,
    );
    expect(screen.getByText("How does it work?")).toBeInTheDocument();
    expect(screen.getByText("Is it secure?")).toBeInTheDocument();
    expect(screen.queryByText("It just does.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("How does it work?"));
    expect(screen.getByText("It just does.")).toBeVisible();
  });
});
