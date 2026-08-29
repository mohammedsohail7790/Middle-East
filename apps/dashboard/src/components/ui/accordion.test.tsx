import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "./accordion";

describe("Accordion", () => {
  it("expands an item's content when its trigger is clicked", () => {
    render(
      <Accordion type="single" collapsible>
        <AccordionItem value="item-1">
          <AccordionTrigger>Question one</AccordionTrigger>
          <AccordionContent>Answer one</AccordionContent>
        </AccordionItem>
      </Accordion>,
    );
    expect(screen.queryByText("Answer one")).not.toBeInTheDocument();
    fireEvent.click(screen.getByText("Question one"));
    expect(screen.getByText("Answer one")).toBeVisible();
  });
});
