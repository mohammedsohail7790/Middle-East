"use client";

const SCENARIOS = [
  {
    title: "Busy during peak hours",
    problem: ["Customer calls", "Team is on a job site", "Nobody answers", "Customer calls a competitor"],
    solution: ["Customer calls", "Halla answers instantly", "Need is understood", "Lead sent to your team"],
  },
  {
    title: "After business hours",
    problem: ["Call comes in at 9pm", "Office is closed", "Voicemail is ignored", "Opportunity lost"],
    solution: ["Halla answers 24/7", "Takes the message", "Books if appropriate", "You wake up to details"],
  },
];

export function ProblemSolutionSection() {
  return (
    <section className="premium-section" aria-labelledby="premium-problem-heading">
      <div className="container">
        <div className="premium-label">Real business situations</div>
        <h2 id="premium-problem-heading">What happens when you miss a call?</h2>
        <p className="lead">
          Every unanswered call is revenue walking away. Halla AI turns missed opportunities into captured leads.
        </p>
        <div className="premium-scenario-grid">
          {SCENARIOS.map((s) => (
            <div key={s.title} style={{ display: "contents" }}>
              <div className="premium-scenario-card premium-scenario-card--problem">
                <h3 style={{ fontSize: "1rem", marginBottom: 8 }}>Without Halla AI — {s.title}</h3>
                <div className="premium-scenario-steps">
                  {s.problem.map((step) => (
                    <div key={step} className="premium-scenario-step">
                      <span className="step-dot" />
                      {step}
                    </div>
                  ))}
                </div>
              </div>
              <div className="premium-scenario-card premium-scenario-card--solution">
                <h3 style={{ fontSize: "1rem", marginBottom: 8, color: "var(--accent-dark)" }}>
                  With Halla AI — {s.title}
                </h3>
                <div className="premium-scenario-steps">
                  {s.solution.map((step) => (
                    <div key={step} className="premium-scenario-step">
                      <span className="step-dot" />
                      {step}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
