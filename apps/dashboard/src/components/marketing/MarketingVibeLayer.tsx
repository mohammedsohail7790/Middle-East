"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Marquee } from "@/components/magic-ui/marquee";

const TRUST_LOGOS = [
  "HubSpot",
  "Salesforce",
  "Google Calendar",
  "Calendly",
  "Zapier",
  "ServiceTitan",
  "Jobber",
  "Housecall Pro",
  "Outlook",
  "GoHighLevel",
];

function TrustPill({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-gray-200 bg-white/90 px-4 py-2 text-sm font-semibold text-gray-600 shadow-sm backdrop-blur-sm">
      {label}
    </span>
  );
}

export function MarketingVibeLayer() {
  const [anchor, setAnchor] = useState<HTMLElement | null>(null);

  useEffect(() => {
    const root = document.getElementById("marketing-spa-root");
    const hero = root?.querySelector(".hero");
    if (!hero) return;

    const host = document.createElement("section");
    host.id = "marketing-vibe-trust";
    host.className = "marketing-vibe-trust";
    host.setAttribute("aria-label", "Trusted integrations");
    hero.insertAdjacentElement("afterend", host);
    setAnchor(host);

    return () => host.remove();
  }, []);

  if (!anchor) return null;

  return createPortal(
    <div className="border-y border-gray-200/80 bg-gray-50/90 py-4 backdrop-blur-sm">
      <p className="mb-3 text-center text-[0.72rem] font-bold uppercase tracking-[0.14em] text-gray-400">
        Connects with tools you already use
      </p>
      <Marquee pauseOnHover className="[--duration:35s]">
        {TRUST_LOGOS.map((name) => (
          <TrustPill key={name} label={name} />
        ))}
      </Marquee>
    </div>,
    anchor,
  );
}
