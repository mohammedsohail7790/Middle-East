"use client";

const SUPPORT_EMAIL = "hello@hallaai.com";

export function ConsultancySection() {
  return (
    <section
      id="premium-consultancy"
      className="premium-consultancy"
      aria-labelledby="premium-consultancy-heading"
    >
      <div className="container premium-consultancy-inner">
        <div className="premium-consultancy-badge" aria-hidden>
          <i className="ti ti-briefcase" />
        </div>
        <div>
          <h3 id="premium-consultancy-heading">Halla AI Consultancy</h3>
          <p>
            A separate professional service — we help businesses identify, design, and implement practical AI
            solutions: strategy, automation, integrations, and custom AI workflows beyond the receptionist product.
          </p>
        </div>
        <a className="btn btn-consultancy btn-lg" href={`mailto:${SUPPORT_EMAIL}?subject=Halla%20AI%20Consultancy%20Inquiry`}>
          Reach Out →
        </a>
      </div>
    </section>
  );
}
