"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { DotPattern } from "@/components/magic-ui/dot-pattern";
import { BorderBeam } from "@/components/magic-ui/border-beam";
import { ShimmerButton } from "@/components/magic-ui/shimmer-button";

function useConsultancyPageActive() {
  const [active, setActive] = useState(false);

  useEffect(() => {
    let observer: MutationObserver | undefined;

    // This effect can run before MarketingSPA has injected bodyHtml into
    // #marketing-spa-root (child effects fire before the parent's), so
    // #page-consultancy may not exist yet on the first run. Retry once the
    // SPA signals it has mounted, instead of silently bailing out forever.
    const attach = () => {
      const root = document.getElementById("marketing-spa-root");
      const consult = document.getElementById("page-consultancy");
      if (!root || !consult) return false;

      const check = () => setActive(consult.classList.contains("active"));
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

function spaGo(page: string) {
  const go = (window as Window & { go?: (p: string) => void }).go;
  if (typeof go === "function") go(page);
}

function enhanceConsultHero() {
  const hero = document.querySelector("#page-consultancy .consult-hero");
  if (!hero || hero.querySelector(".consult-hero-fx")) return;

  const fx = document.createElement("div");
  fx.className = "consult-hero-fx";
  fx.id = "consult-hero-fx-mount";
  hero.insertBefore(fx, hero.firstChild);

  const gradient = hero.querySelector(".consult-gradient-text");
  gradient?.classList.add("consult-gradient-text--animated");
}

function enhanceServiceCards(): HTMLElement[] {
  const cards = document.querySelectorAll<HTMLElement>("#page-consultancy .consult-service-card");
  const mounts: HTMLElement[] = [];
  cards.forEach((card) => {
    if (card.querySelector(".consult-beam-mount")) return;
    const mount = document.createElement("div");
    mount.className = "consult-beam-mount";
    card.appendChild(mount);
    mounts.push(mount);
  });
  return mounts;
}

function enhanceHeroCta(): HTMLElement | null {
  const actions = document.querySelector("#page-consultancy .consult-hero-actions");
  const primary = actions?.querySelector<HTMLElement>(".consult-magnetic");
  if (!primary || primary.dataset.enhanced) return null;
  primary.dataset.enhanced = "true";
  primary.classList.add("consult-hero-cta-hidden");

  const mount = document.createElement("div");
  mount.className = "consult-hero-shimmer-mount";
  primary.insertAdjacentElement("afterend", mount);
  return mount;
}

function enhanceConsultCta(): HTMLElement | null {
  const block = document.querySelector("#page-consultancy .consult-cta-block");
  const primary = block?.querySelector<HTMLElement>(".consult-magnetic");
  if (!primary || primary.dataset.enhanced) return null;
  primary.dataset.enhanced = "true";
  primary.classList.add("consult-hero-cta-hidden");

  const mount = document.createElement("div");
  mount.className = "consult-cta-shimmer-mount";
  primary.insertAdjacentElement("afterend", mount);
  return mount;
}

export function MarketingConsultancyLayer() {
  const active = useConsultancyPageActive();
  const [heroFx, setHeroFx] = useState<HTMLElement | null>(null);
  const [beamMounts, setBeamMounts] = useState<HTMLElement[]>([]);
  const [heroCtaMount, setHeroCtaMount] = useState<HTMLElement | null>(null);
  const [footerCtaMount, setFooterCtaMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const consult = document.getElementById("page-consultancy");
    consult?.classList.add("has-consult-premium");

    enhanceConsultHero();
    setHeroFx(document.getElementById("consult-hero-fx-mount"));
    setBeamMounts(enhanceServiceCards());
    setHeroCtaMount(enhanceHeroCta());
    setFooterCtaMount(enhanceConsultCta());
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
            glow
          />,
          heroFx,
        )}
      {beamMounts.map((mount, i) =>
        createPortal(
          <BorderBeam
            key={i}
            size={i === 1 ? 140 : 100}
            duration={7 + i}
            colorFrom="#635BFF"
            colorTo="#4B44C7"
            borderWidth={2}
          />,
          mount,
        ),
      )}
      {heroCtaMount &&
        createPortal(
          <motion.div
            style={{ display: "inline-block" }}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <ShimmerButton
              className="btn-lg consult-shimmer-cta"
              background="linear-gradient(135deg, #635BFF 0%, #4B44C7 100%)"
              onClick={() => spaGo("consult-signup")}
            >
              Book a Diagnostic Call →
            </ShimmerButton>
          </motion.div>,
          heroCtaMount,
        )}
      {footerCtaMount &&
        createPortal(
          <motion.div
            style={{ display: "inline-block" }}
            whileHover={{ scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
          >
            <ShimmerButton
              className="btn-lg consult-shimmer-cta"
              background="linear-gradient(135deg, #635BFF 0%, #4B44C7 100%)"
              onClick={() => spaGo("consult-signup")}
            >
              Book Your Diagnostic Call →
            </ShimmerButton>
          </motion.div>,
          footerCtaMount,
        )}
    </>
  );
}
