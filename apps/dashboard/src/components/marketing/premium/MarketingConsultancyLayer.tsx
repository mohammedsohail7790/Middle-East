"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { DotPattern } from "@/components/magic-ui/dot-pattern";
import { BorderBeam } from "@/components/magic-ui/border-beam";
import { Marquee } from "@/components/magic-ui/marquee";
import { ShimmerButton } from "@/components/magic-ui/shimmer-button";

const CAPABILITIES = [
  "Process Mapping",
  "Workflow Automation",
  "Lead Engines",
  "CRM Integration",
  "AI Receptionist",
  "Brand Systems",
  "Review Automation",
  "Live Dashboards",
  "n8n & Zapier",
  "HubSpot Sync",
];

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

function enhanceMarquee(): HTMLElement | null {
  const legacy = document.querySelector<HTMLElement>("#page-consultancy .consult-marquee");
  if (!legacy || legacy.dataset.enhanced) return null;
  legacy.dataset.enhanced = "true";
  legacy.classList.add("consult-marquee--legacy");

  const host = document.createElement("div");
  host.id = "consult-marquee-mount";
  host.className = "consult-marquee-premium";
  legacy.insertAdjacentElement("afterend", host);
  return host;
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
  const [marqueeMount, setMarqueeMount] = useState<HTMLElement | null>(null);
  const [heroCtaMount, setHeroCtaMount] = useState<HTMLElement | null>(null);
  const [footerCtaMount, setFooterCtaMount] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!active) return;
    const consult = document.getElementById("page-consultancy");
    consult?.classList.add("has-consult-premium");

    enhanceConsultHero();
    setHeroFx(document.getElementById("consult-hero-fx-mount"));
    setBeamMounts(enhanceServiceCards());
    setMarqueeMount(enhanceMarquee());
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
            colorFrom="#4f6f93"
            colorTo="#8fa8c4"
            borderWidth={2}
          />,
          mount,
        ),
      )}
      {marqueeMount &&
        createPortal(
          <div className="consult-marquee-inner">
            <Marquee pauseOnHover className="[--duration:38s]">
              {CAPABILITIES.map((item) => (
                <span key={item} className="consult-marquee-pill">
                  {item}
                </span>
              ))}
            </Marquee>
          </div>,
          marqueeMount,
        )}
      {heroCtaMount &&
        createPortal(
          <ShimmerButton
            className="btn-lg consult-shimmer-cta"
            background="linear-gradient(135deg, #4f6f93 0%, #8fa8c4 100%)"
            onClick={() => spaGo("consult-signup")}
          >
            Book a Diagnostic Call →
          </ShimmerButton>,
          heroCtaMount,
        )}
      {footerCtaMount &&
        createPortal(
          <ShimmerButton
            className="btn-lg consult-shimmer-cta"
            background="linear-gradient(135deg, #4f6f93 0%, #8fa8c4 100%)"
            onClick={() => spaGo("consult-signup")}
          >
            Book Your Diagnostic Call →
          </ShimmerButton>,
          footerCtaMount,
        )}
    </>
  );
}
