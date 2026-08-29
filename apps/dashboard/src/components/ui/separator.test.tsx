import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { Separator } from "./separator";

describe("Separator", () => {
  it("renders a horizontal separator by default", () => {
    const { container } = render(<Separator data-testid="sep" />);
    const el = container.querySelector('[data-testid="sep"]');
    expect(el).toBeInTheDocument();
    expect(el).toHaveAttribute("data-orientation", "horizontal");
  });
});
