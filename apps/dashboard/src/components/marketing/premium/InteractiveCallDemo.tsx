"use client";

import { useEffect, useState } from "react";

const STAGES = [
  { id: "ring", label: "Incoming call" },
  { id: "answer", label: "Halla AI answers" },
  { id: "listen", label: "AI understands" },
  { id: "respond", label: "AI responds naturally" },
  { id: "capture", label: "Lead captured" },
] as const;

export function InteractiveCallDemo() {
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
    <section className="premium-section premium-section--muted" aria-labelledby="premium-call-demo-heading">
      <div className="container">
        <div className="premium-label">Live demonstration</div>
        <h2 id="premium-call-demo-heading">See a call handled in real time</h2>
        <p className="lead">
          Halla AI picks up instantly, understands what the caller needs, and captures the outcome for your team.
        </p>
        <div className="premium-call-demo">
          <div className="premium-call-phone">
            <div className="hp3d-call-header">
              <p>Incoming call</p>
              <strong>+971 50 XXX XXXX</strong>
            </div>
            <div className="hp3d-avatar" style={{ marginTop: 20 }}>Halla</div>
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
          <div className="premium-call-stages" role="list">
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
      </div>
    </section>
  );
}
