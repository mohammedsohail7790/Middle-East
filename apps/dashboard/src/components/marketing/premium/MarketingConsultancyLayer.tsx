"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DotPattern } from "@/components/magic-ui/dot-pattern";
import { BorderBeam } from "@/components/magic-ui/border-beam";

function useConsultancyPageActive() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    const root = document.getElementById("marketing-spa-root");
    const consult = document.getElementById("page-consultancy");
    if (!root || !consult) return;

    const check = () => setActive(consult.classList.contains("active"));
    check();

    const observer = new MutationObserver(check);
    observer.observe(root, { attributes: true, subtree: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  return active;
}

function enhanceConsultHero() {
  const hero = document.querySelector("#page-consultancy .consult-hero");
  if (!hero || hero.querySelector(".consult-hero-fx")) return;

  const fx = document.createElement("div");
  fx.className = "consult-hero-fx";
  fx.id = "consult-hero-fx-mount";
  hero.insertBefore(fx, hero.firstChild);
}

function enhanceFeaturedService() {
  const card = document.querySelector("#page-consultancy .consult-service-featured");
  if (!card || card.querySelector(".consult-beam-mount")) return;

  const mount = document.createElement("div");
  mount.className = "consult-beam-mount";
  card.appendChild(mount);
  return mount as HTMLElement;
}

export function MarketingConsultancyLayer() {
  const active = useConsultancyPageActive();
  const [heroFx, setHeroFx] = useState<HTMLElement | null>(null);
  const [beamMount, setBeamMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    enhanceConsultHero();
    setHeroFx(document.getElementById("consult-hero-fx-mount"));
    setBeamMount(enhanceFeaturedService() ?? null);
  }, [active]);

  if (!active) return null;

  return (
    <>
      {heroFx &&
        createPortal(
          <DotPattern
            className="consult-dot-pattern [mask-image:radial-gradient(500px_circle_at_center,white,transparent)]"
            width={20}
            height={20}
            cx={1}
            cy={1}
            cr={1}
          />,
          heroFx,
        )}
      {beamMount &&
        createPortal(
          <BorderBeam size={120} duration={8} colorFrom="#0D9488" colorTo="#2DD4BF" borderWidth={2} />,
          beamMount,
        )}
    </>
  );
}
