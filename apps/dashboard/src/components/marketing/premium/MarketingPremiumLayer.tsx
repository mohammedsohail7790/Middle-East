"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HeroPhone3D } from "./HeroPhone3D";
import { ProblemSolutionSection } from "./ProblemSolutionSection";
import { InteractiveCallDemo } from "./InteractiveCallDemo";
import { WorkflowSection } from "./WorkflowSection";
import { VideoDemoSection } from "./VideoDemoSection";
import { FeaturesHubSection } from "./FeaturesHubSection";
import { BeforeAfterSection } from "./BeforeAfterSection";
import { DashboardShowcaseSection } from "./DashboardShowcaseSection";
import { IndustryStripSection } from "./IndustryStripSection";

function useHomePageActive() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const root = document.getElementById("marketing-spa-root");
    const home = document.getElementById("page-home");
    if (!root || !home) return;

    const check = () => {
      setActive(home.classList.contains("active"));
    };
    check();

    const observer = new MutationObserver(check);
    observer.observe(root, { attributes: true, subtree: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return active;
}

function enhanceHero() {
  const hero = document.querySelector("#page-home .hero");
  const container = hero?.querySelector(".container");
  if (!hero || !container || container.querySelector(".hero-premium-grid")) return;

  hero.classList.add("hero--premium");

  const grid = document.createElement("div");
  grid.className = "hero-premium-grid";

  const copy = document.createElement("div");
  copy.className = "hero-premium-copy";
  while (container.firstChild) {
    copy.appendChild(container.firstChild);
  }

  const visual = document.createElement("div");
  visual.className = "hero-premium-visual";
  visual.id = "premium-hero-visual-mount";

  grid.appendChild(copy);
  grid.appendChild(visual);
  container.appendChild(grid);
}

function PremiumHomeSections() {
  const [tickerAnchor, setTickerAnchor] = useState<HTMLElement | null>(null);
  const [heroVisual, setHeroVisual] = useState<HTMLElement | null>(null);
  const [sectionsReady, setSectionsReady] = useState(false);

  useEffect(() => {
    enhanceHero();
    setHeroVisual(document.getElementById("premium-hero-visual-mount"));

    const ticker = document.querySelector("#page-home .ticker-wrap");
    if (!ticker) return;

    const host = document.createElement("div");
    host.id = "marketing-premium-sections";
    ticker.insertAdjacentElement("afterend", host);
    setTickerAnchor(host);

    const markReady = () => setSectionsReady(true);
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(markReady, { timeout: 2500 });
      return () => {
        window.cancelIdleCallback(id);
        host.remove();
      };
    }
    const t = window.setTimeout(markReady, 400);
    return () => {
      window.clearTimeout(t);
      host.remove();
    };
  }, []);

  return (
    <>
      {heroVisual && createPortal(<HeroPhone3D />, heroVisual)}
      {sectionsReady &&
        tickerAnchor &&
        createPortal(
          <>
            <ProblemSolutionSection />
            <InteractiveCallDemo />
            <WorkflowSection />
            <VideoDemoSection />
            <FeaturesHubSection />
            <BeforeAfterSection />
            <DashboardShowcaseSection />
            <IndustryStripSection />
          </>,
          tickerAnchor,
        )}
    </>
  );
}

export function MarketingPremiumLayer() {
  const homeActive = useHomePageActive();
  if (!homeActive) return null;
  return <PremiumHomeSections />;
}
