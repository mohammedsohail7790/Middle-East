"use client";

const INDUSTRIES = [
  { icon: "ti-snowflake", label: "HVAC", page: "industry-hvac" },
  { icon: "ti-tool", label: "Plumbing", page: "industry-plumbing" },
  { icon: "ti-bolt", label: "Electrical", page: "industry-electrical" },
  { icon: "ti-home", label: "Real Estate", page: "industry-realtors" },
  { icon: "ti-scale", label: "Legal", page: "industry-legal" },
  { icon: "ti-heart", label: "Healthcare", page: "industry-veterinary" },
  { icon: "ti-leaf", label: "Landscaping", page: "industry-landscaping" },
  { icon: "ti-briefcase", label: "Professional", page: "industry-agency" },
];

export function IndustryStripSection() {
  const navigate = (page: string) => {
    const go = (window as Window & { go?: (p: string) => void }).go;
    if (typeof go === "function") go(page);
  };

  return (
    <section className="premium-section" aria-labelledby="premium-industries-heading">
      <div className="container">
        <div className="premium-label">Who it&apos;s for</div>
        <h2 id="premium-industries-heading">Built for service businesses</h2>
        <p className="lead">
          Pre-configured for 27 industries — from home services to professional firms across the UAE and beyond.
        </p>
        <div className="premium-industry-grid">
          {INDUSTRIES.map((ind) => (
            <button
              key={ind.page}
              type="button"
              className="premium-industry-card"
              onClick={() => navigate(ind.page)}
            >
              <i className={`ti ${ind.icon}`} aria-hidden />
              <span>{ind.label}</span>
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}
