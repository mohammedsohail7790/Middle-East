"use client";

const STEPS = [
  { num: "01", title: "Customer calls", desc: "Your business line rings — day or night." },
  { num: "02", title: "Halla answers", desc: "AI picks up instantly with your business context." },
  { num: "03", title: "AI understands", desc: "Natural conversation — questions, requests, emergencies." },
  { num: "04", title: "AI handles it", desc: "Books appointments, routes calls, takes messages." },
  { num: "05", title: "You get results", desc: "Summaries, leads, and calendar updates in your dashboard." },
];

export function WorkflowSection() {
  return (
    <section className="premium-section premium-section--muted" aria-labelledby="premium-workflow-heading">
      <div className="container">
        <div className="premium-label">How it works</div>
        <h2 id="premium-workflow-heading">How Halla AI works</h2>
        <p className="lead">Five steps from ring to result — fully automated, always on.</p>
        <div className="premium-workflow">
          {STEPS.map((s) => (
            <div key={s.num} className="premium-workflow-step">
              <div className="premium-workflow-num">{s.num}</div>
              <h4>{s.title}</h4>
              <p>{s.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
