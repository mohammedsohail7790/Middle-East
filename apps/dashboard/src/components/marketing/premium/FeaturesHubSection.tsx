"use client";

import { useState } from "react";

const FEATURES = [
  { id: "247", label: "24/7 Answering", detail: "Every call answered — nights, weekends, holidays." },
  { id: "leads", label: "Lead Capture", detail: "Caller details and intent logged automatically." },
  { id: "voice", label: "Natural Voice AI", detail: "Human-like conversations powered by voice AI." },
  { id: "routing", label: "Call Routing", detail: "Emergencies escalated, routine calls handled." },
  { id: "knowledge", label: "Business Knowledge", detail: "Trained on your services, pricing, and FAQs." },
  { id: "schedule", label: "Appointment Booking", detail: "Books directly to your connected calendar." },
];

export function FeaturesHubSection() {
  const [active, setActive] = useState(FEATURES[0].id);
  const current = FEATURES.find((f) => f.id === active) ?? FEATURES[0];

  return (
    <section className="premium-section premium-section--dark" aria-labelledby="premium-features-heading">
      <div className="container">
        <div className="premium-label">Capabilities</div>
        <h2 id="premium-features-heading" style={{ color: "#f8fafc" }}>
          Everything your AI receptionist does
        </h2>
        <p className="lead">Hover a capability to see how Halla AI handles it for your business.</p>
        <div className="premium-features-hub">
          <div>
            <h3 style={{ fontSize: "1.25rem", marginBottom: 12, color: "#2dd4bf" }}>{current.label}</h3>
            <p style={{ color: "rgba(248,250,252,0.75)", lineHeight: 1.7 }}>{current.detail}</p>
            <div className="premium-gcc-strip" style={{ marginTop: 24 }}>
              <span className="premium-gcc-badge">English + Arabic</span>
              <span className="premium-gcc-badge">GCC carrier guides</span>
              <span className="premium-gcc-badge">UAE-ready setup</span>
            </div>
          </div>
          <div className="premium-features-orbit">
            <div className="premium-features-core">AI<br />Receptionist</div>
            {FEATURES.map((f) => (
              <button
                key={f.id}
                type="button"
                className="premium-feature-pill"
                onMouseEnter={() => setActive(f.id)}
                onFocus={() => setActive(f.id)}
                aria-pressed={active === f.id}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
