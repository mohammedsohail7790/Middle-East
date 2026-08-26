"use client";

import { useEffect, useState } from "react";
import { CallFlowDemoGrid } from "./CallFlowDemo";

const STAGES = [
  { id: "ring", label: "Incoming call" },
  { id: "answer", label: "Halla AI answers" },
  { id: "listen", label: "AI understands" },
  { id: "respond", label: "AI responds naturally" },
  { id: "capture", label: "Lead captured" },
] as const;

function FeaturedCallDemo() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (prefersReduced) return;
    const id = window.setInterval(() => {
      setActive((i) => (i + 1) % STAGES.length);
    }, 2800);
    return () => window.clearInterval(id);
  }, []);

  const stage = STAGES[active];

  return (
    <div className="premium-action-feature">
      <div className="premium-call-phone premium-call-phone--3d premium-action-phone">
        <div className="premium-call-orb">
          <div className="premium-voice-orb-css" aria-hidden />
        </div>
        <div className="hp3d-call-header">
          <p>Incoming call</p>
          <strong>+971 50 XXX XXXX</strong>
        </div>
        <div className="hp3d-avatar" style={{ marginTop: 20 }}>
          Halla
        </div>
        <p className="hp3d-status" style={{ marginTop: 8 }}>
          ● {stage.label}
        </p>
        <div className="hp3d-bubble" style={{ marginTop: 16 }}>
          {stage.id === "capture"
            ? "I've noted your request and sent the details to the business team."
            : "Hello, this is Halla AI. How can I help you today?"}
        </div>
        <div className="hp3d-wave" style={{ marginTop: 20 }}>
          {[12, 20, 26, 18, 24, 16, 22].map((h, i) => (
            <span key={i} style={{ height: stage.id === "listen" ? h : 8 }} />
          ))}
        </div>
      </div>
      <div className="premium-action-stages" role="list">
        {STAGES.map((s, i) => (
          <div
            key={s.id}
            className={`premium-call-stage${i === active ? " is-active" : ""}`}
            role="listitem"
          >
            <span className="premium-call-stage-num">{String(i + 1).padStart(2, "0")}</span>
            {s.label}
          </div>
        ))}
      </div>
    </div>
  );
}

export function VideoDemoSection() {
  return (
    <section className="premium-section premium-section--dark" aria-labelledby="premium-video-heading">
      <div className="container">
        <div className="premium-label">Product demos</div>
        <h2 id="premium-video-heading">See Halla AI in action</h2>
        <p className="lead">
          Watch a live call cycle, then explore three interactive demos — answering, lead capture, and booking.
        </p>

        <FeaturedCallDemo />

        <div className="premium-action-divider">
          <span>Interactive scenarios</span>
        </div>

        <CallFlowDemoGrid />
      </div>
    </section>
  );
}
