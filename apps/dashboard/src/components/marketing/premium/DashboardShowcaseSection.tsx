"use client";

export function DashboardShowcaseSection() {
  return (
    <section className="premium-section premium-section--muted" aria-labelledby="premium-dashboard-heading">
      <div className="container">
        <div className="premium-label">Your command center</div>
        <h2 id="premium-dashboard-heading">Every call, lead, and result — in one place</h2>
        <p className="lead">
          The Halla AI dashboard gives you call history, transcripts, lead details, and analytics at a glance.
        </p>
        <div className="premium-dashboard-wrap">
          <div className="premium-dashboard-frame">
            <div className="premium-dashboard-chrome" aria-hidden>
              <span /><span /><span />
              <span style={{ marginLeft: 12, fontSize: "0.72rem", color: "rgba(255,255,255,0.5)" }}>
                app.hallaai.com/dashboard
              </span>
            </div>
            <div className="premium-dashboard-body">
              <div className="premium-dash-card">
                <strong>127</strong>
                <span>Calls this month</span>
              </div>
              <div className="premium-dash-card">
                <strong>43</strong>
                <span>Leads captured</span>
              </div>
              <div className="premium-dash-card">
                <strong>34%</strong>
                <span>Conversion rate</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
