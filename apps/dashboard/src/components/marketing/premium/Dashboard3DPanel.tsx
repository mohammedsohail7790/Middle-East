"use client";

import { useParallaxTilt } from "@/components/marketing/effects/useParallaxTilt";

type Variant = "agent" | "summary";

function AgentDashboardUI() {
  return (
    <div className="dash3d-ui dash3d-ui--dark">
      <aside className="dash3d-sidebar" aria-hidden>
        <div className="dash3d-logo">H</div>
        <nav className="dash3d-nav">
          <span className="dash3d-nav-item">Calls</span>
          <span className="dash3d-nav-item dash3d-nav-item--active">Agent</span>
          <span className="dash3d-nav-item">Leads</span>
          <span className="dash3d-nav-item">Analytics</span>
        </nav>
      </aside>
      <main className="dash3d-main">
        <header className="dash3d-main-head">
          <h4>Agent configuration</h4>
          <span className="dash3d-chip">Changes apply instantly</span>
        </header>
        <div className="dash3d-field">
          <label>Agent name</label>
          <div className="dash3d-input">Sara</div>
        </div>
        <div className="dash3d-field">
          <label>Voice tone</label>
          <div className="dash3d-pills">
            <span>Professional</span>
            <span className="dash3d-pill-active">Friendly</span>
            <span>Warm</span>
          </div>
        </div>
        <div className="dash3d-field">
          <label>Greeting script</label>
          <div className="dash3d-textarea">
            Hello, this is Sara from Halla Dental. How can I help you today?
          </div>
        </div>
        <div className="dash3d-preview-row">
          <div className="dash3d-mini-stat">
            <strong>2.1s</strong>
            <span>Avg response</span>
          </div>
          <div className="dash3d-mini-stat">
            <strong>24/7</strong>
            <span>Always on</span>
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryDashboardUI() {
  return (
    <div className="dash3d-summary-wrap">
      <div className="dash3d-email-card dash3d-email-card--primary">
        <div className="dash3d-email-head">
          <span className="dash3d-email-icon" aria-hidden>✉</span>
          <div>
            <strong>Call summary — Ahmed K.</strong>
            <span>+971 50 123 4567 · 2 min ago</span>
          </div>
        </div>
        <ul className="dash3d-email-list">
          <li><span>Intent</span> Book cleaning appointment</li>
          <li><span>Outcome</span> Scheduled Tue 10:30 AM</li>
          <li><span>Lead score</span> Hot — SMS sent to you</li>
        </ul>
        <div className="dash3d-email-footer">
          <span className="dash3d-badge dash3d-badge--success">Appointment booked</span>
          <span className="dash3d-badge">Transcript saved</span>
        </div>
      </div>
      <div className="dash3d-email-card dash3d-email-card--ghost" aria-hidden>
        <div className="dash3d-email-head">
          <span className="dash3d-email-icon">✉</span>
          <div>
            <strong>Call summary — Layla M.</strong>
            <span>Insurance question resolved</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Dashboard3DPanel({ variant }: { variant: Variant }) {
  const { ref, transform } = useParallaxTilt(8);
  const isAgent = variant === "agent";

  return (
    <div
      className={`dash3d-scene dash3d-scene--${variant}`}
      aria-hidden
    >
      <div className="dash3d-ambient" />
      <div className="dash3d-orbit-ring" />
      {isAgent && <div className="dash3d-float dash3d-float--live">Live on next call</div>}
      {!isAgent && <div className="dash3d-float dash3d-float--sent">Sent automatically</div>}
      <div
        ref={ref}
        className="dash3d-panel dash3d-panel--tilt"
        style={transform ? { transform } : undefined}
      >
        {isAgent ? <AgentDashboardUI /> : <SummaryDashboardUI />}
      </div>
    </div>
  );
}
