"use client";

import { CallFlowDemoGrid } from "./CallFlowDemo";

export function VideoDemoSection() {
  return (
    <section className="premium-section" aria-labelledby="premium-video-heading">
      <div className="container">
        <div className="premium-label">Product demos</div>
        <h2 id="premium-video-heading">See Halla AI in action</h2>
        <p className="lead">
          Interactive demonstrations of what the AI receptionist does on a business call — not recorded
          customer audio.
        </p>
        <CallFlowDemoGrid />
      </div>
    </section>
  );
}
