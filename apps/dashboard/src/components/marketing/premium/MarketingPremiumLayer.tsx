"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { HeroPhone3D } from "./HeroPhone3D";
import { OutcomeCompareSection } from "./OutcomeCompareSection";
import { WorkflowSection } from "./WorkflowSection";
import { VideoDemoSection } from "./VideoDemoSection";
import { FeaturesHubSection } from "./FeaturesHubSection";
import { DashboardShowcaseSection } from "./DashboardShowcaseSection";
import { IndustryStripSection } from "./IndustryStripSection";
import { HomeClosingSection } from "./HomeClosingSection";

function useHomePageActive() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let observer: MutationObserver | undefined;

    // This effect can run before MarketingSPA has injected bodyHtml into
    // #marketing-spa-root (child effects fire before the parent's), so
    // #page-home may not exist yet on the first run. Retry once the SPA
    // signals it has mounted, instead of silently bailing out forever.
    const attach = () => {
      const root = document.getElementById("marketing-spa-root");
      const home = document.getElementById("page-home");
      if (!root || !home) return false;

      const check = () => setActive(home.classList.contains("active"));
      check();

      observer = new MutationObserver(check);
      observer.observe(root, { attributes: true, subtree: true, attributeFilter: ["class"] });
      return true;
    };

    if (!attach()) {
      window.addEventListener("halla-marketing-mounted", attach, { once: true });
    }

    return () => {
      observer?.disconnect();
      window.removeEventListener("halla-marketing-mounted", attach);
    };
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

function activatePremiumHome() {
  const home = document.getElementById("page-home");
  if (!home) return;
  home.classList.add("has-premium-home");
}

function PremiumHomeSections() {
  const [tickerAnchor, setTickerAnchor] = useState<HTMLElement | null>(null);
  const [heroVisual, setHeroVisual] = useState<HTMLElement | null>(null);

  useEffect(() => {
    activatePremiumHome();
    enhanceHero();
    setHeroVisual(document.getElementById("premium-hero-visual-mount"));

    const ticker = document.querySelector("#page-home .ticker-wrap");
    if (!ticker) return;

    const host = document.createElement("div");
    host.id = "marketing-premium-sections";
    ticker.insertAdjacentElement("afterend", host);
    setTickerAnchor(host);

    return () => host.remove();
  }, []);

  return (
    <>
      {heroVisual && createPortal(<HeroPhone3D />, heroVisual)}
      {tickerAnchor &&
        createPortal(
          <>
            <OutcomeCompareSection />
            <WorkflowSection />
            <VideoDemoSection />
            <FeaturesHubSection />
            <DashboardShowcaseSection />
            <IndustryStripSection />
            <HomeClosingSection />
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
