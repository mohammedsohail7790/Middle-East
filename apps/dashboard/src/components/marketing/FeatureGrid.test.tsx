import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { FeatureGrid } from "./FeatureGrid";
import type { ServiceItem } from "@/content/types";

const items: ServiceItem[] = [
  {
    label: "Efficiency",
    icon: "settings",
    title: "Operations Automation",
    description: "Test description.",
    bullets: ["Bullet one", "Bullet two"],
    href: "/services/operations",
    exploreLabel: "Operations",
  },
  {
    label: "Revenue",
    icon: "trending-up",
    title: "Client Acquisition & Growth",
    description: "Another description.",
    bullets: ["Bullet three"],
    href: "/services/acquisition",
    exploreLabel: "Acquisition",
    featured: true,
    featuredBadge: "Most requested",
  },
];

describe("FeatureGrid", () => {
  it("renders one card per service with title, bullets, and link", () => {
    render(<FeatureGrid items={items} />);
    expect(screen.getByText("Operations Automation")).toBeInTheDocument();
    expect(screen.getByText("Bullet one")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Explore Operations/i })).toHaveAttribute(
      "href",
      "/services/operations",
    );
  });

  it("shows the featured badge only on the featured item", () => {
    render(<FeatureGrid items={items} />);
    expect(screen.getByText("Most requested")).toBeInTheDocument();
  });
});
