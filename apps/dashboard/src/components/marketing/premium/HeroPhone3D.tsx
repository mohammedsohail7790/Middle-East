"use client";

import { HeroParticleCanvas } from "./HeroParticleCanvas";
import { useParallaxTilt } from "@/components/marketing/effects/useParallaxTilt";

function CssPhoneFallback() {
  return (
    <div className="hp3d-phone">
      <div className="hp3d-screen">
        <div className="hp3d-screen-glow" aria-hidden />
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

/** CSS 3D hero phone — polished depth without react-three-fiber. */
export function HeroPhone3D() {
  const { ref, transform } = useParallaxTilt(14);

  return (
    <div className="hp3d-scene hp3d-scene--enhanced" aria-hidden>
      <HeroParticleCanvas />
      <div className="hp3d-orbit hp3d-orbit--outer" />
      <div className="hp3d-orbit hp3d-orbit--inner" />
      <div className="hp3d-depth-ring hp3d-depth-ring--a" />
      <div className="hp3d-depth-ring hp3d-depth-ring--b" />
      <div className="hp3d-float-card hp3d-float-card--lead">Lead captured ✓</div>
      <div className="hp3d-float-card hp3d-float-card--appt">Appointment booked</div>
      <div
        ref={ref}
        className="hp3d-device-wrap hp3d-device-wrap--tilt"
        style={transform ? { transform } : undefined}
      >
        <CssPhoneFallback />
      </div>
    </div>
  );
}
