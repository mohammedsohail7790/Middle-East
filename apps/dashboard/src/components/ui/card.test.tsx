import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Card, CardContent, CardTitle } from "./card";

describe("Card", () => {
  it("renders children inside a card with content and title", () => {
    render(
      <Card data-testid="card">
        <CardContent>
          <CardTitle>Hello</CardTitle>
        </CardContent>
      </Card>,
    );
    expect(screen.getByTestId("card")).toBeInTheDocument();
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
