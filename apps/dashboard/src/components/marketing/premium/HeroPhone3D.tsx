"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";
import { HeroParticleCanvas } from "./HeroParticleCanvas";

const HeroPhoneScene = dynamic(
  () => import("./HeroPhoneScene").then((m) => m.HeroPhoneScene),
  { ssr: false },
);

function CssPhoneFallback() {
  return (
    <div className="hp3d-phone">
      <div className="hp3d-screen">
        <div className="hp3d-call-header">
          <p>Incoming call</p>
          <strong>+971 50 XXX XXXX</strong>
        </div>
        <div className="hp3d-avatar">Halla</div>
        <p className="hp3d-status">● Listening…</p>
        <div className="hp3d-bubble">Hello, this is Halla AI. How can I help you today?</div>
        <div className="hp3d-wave" aria-hidden>
          {[14, 22, 28, 20, 26, 18, 24].map((h, i) => (
            <span key={i} style={{ height: h * 0.4 }} />
          ))}
        </div>
      </div>
    </div>
  );
}

export function HeroPhone3D() {
  const [mode, setMode] = useState<"r3f" | "css">("css");

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const narrow = window.matchMedia("(max-width: 768px)").matches;
    setMode(reduced || narrow ? "css" : "r3f");
  }, []);

  return (
    <div className="hp3d-scene hp3d-scene--enhanced" aria-hidden>
      <HeroParticleCanvas />
      <div className="hp3d-orbit hp3d-orbit--outer" />
      <div className="hp3d-orbit hp3d-orbit--inner" />
      <div className="hp3d-float-card hp3d-float-card--lead">Lead captured ✓</div>
      <div className="hp3d-float-card hp3d-float-card--appt">Appointment booked</div>
      <div className="hp3d-device-wrap">
        {mode === "r3f" ? (
          <div className="hp3d-r3f-layer">
            <HeroPhoneScene />
          </div>
        ) : (
          <CssPhoneFallback />
        )}
      </div>
    </div>
  );
}
