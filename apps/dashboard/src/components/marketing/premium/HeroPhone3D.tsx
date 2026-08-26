"use client";

export function HeroPhone3D() {
  return (
    <div className="hp3d-scene" aria-hidden>
      <div className="hp3d-float-card hp3d-float-card--lead">Lead captured ✓</div>
      <div className="hp3d-float-card hp3d-float-card--appt">Appointment booked</div>
      <div className="hp3d-phone">
        <div className="hp3d-screen">
          <div className="hp3d-call-header">
            <p>Incoming call</p>
            <strong>+971 50 XXX XXXX</strong>
          </div>
          <div className="hp3d-avatar">Halla</div>
          <p className="hp3d-status">● Listening…</p>
          <div className="hp3d-bubble">
            Hello, this is Halla AI. How can I help you today?
          </div>
          <div className="hp3d-wave" aria-hidden>
            {[14, 22, 28, 20, 26, 18, 24].map((h, i) => (
              <span key={i} style={{ height: h * 0.4 }} />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
