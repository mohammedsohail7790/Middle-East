"use client";

import { BorderBeam } from "@/components/magic-ui/border-beam";
import { NeonGradientCard } from "@/components/magic-ui/neon-gradient-card";
import { ShimmerButton } from "@/components/magic-ui/shimmer-button";

const PLANS = [
  {
    name: "Essential",
    price: 39,
    mins: "250 min included · $0.20/min overage",
    cta: "outline" as const,
    features: ["24/7 AI Receptionist", "7 Languages", "Appointment Booking", "Email Summaries", "Spam Blocking"],
  },
  {
    name: "Professional",
    price: 149,
    mins: "750 min included · $0.15/min overage",
    cta: "primary" as const,
    popular: true,
    features: [
      "Everything in Essential",
      "CRM Integration (HubSpot, Salesforce)",
      "Native Calendar Sync",
      "Custom AI Voice Training",
      "3 Phone Numbers",
    ],
  },
  {
    name: "Enterprise",
    price: 499,
    mins: "4,000 min included · $0.10/min overage",
    cta: "outline" as const,
    features: [
      "Everything in Professional",
      "Dedicated Account Manager",
      "99.9% Uptime SLA",
      "Advanced Analytics",
      "20+ Phone Numbers",
    ],
  },
];

const TESTIMONIALS = [
  {
    quote:
      "Recovered $4,200 in emergency plumbing jobs in the first month. Halla AI paid for itself in week one.",
    name: "Mike Thompson",
    role: "Mike's Plumbing — Austin, TX",
    initial: "M",
  },
  {
    quote:
      "We were missing 40% of calls while in court. Closed 3 new cases in the first month from after-hours calls alone.",
    name: "Sarah Chen",
    role: "Chen & Associates Law — Houston, TX",
    initial: "S",
  },
  {
    quote:
      "Books 30 new clients a month that I would have missed. Best investment I've made for my salon.",
    name: "Jessica Reyes",
    role: "Luxe Salon — Miami, FL",
    initial: "J",
  },
];

function spaGo(page: string) {
  const go = (window as Window & { go?: (p: string) => void }).go;
  if (typeof go === "function") go(page);
}

export function HomeClosingSection() {
  return (
    <>
      <section className="premium-section" aria-labelledby="premium-pricing-heading">
        <div className="container">
          <div className="premium-section-head text-center">
            <div className="premium-label">Simple pricing</div>
            <h2 id="premium-pricing-heading">Transparent. No surprises.</h2>
            <p className="lead">Start free for 14 days. No credit card. Save 20% annually.</p>
          </div>
          <div className="premium-pricing-grid">
            {PLANS.map((plan) => (
              <div
                key={plan.name}
                className={`premium-pricing-card${plan.popular ? " premium-pricing-card--popular" : ""}`}
              >
                {plan.popular && <span className="premium-pricing-badge">Most popular</span>}
                {plan.popular && (
                  <BorderBeam size={100} duration={7} colorFrom="#0D9488" colorTo="#2DD4BF" borderWidth={2} />
                )}
                <div className="premium-pricing-plan">{plan.name}</div>
                <div className="premium-pricing-price">
                  <sup>$</sup>
                  {plan.price}
                  <sub>/mo</sub>
                </div>
                <div className="premium-pricing-mins">{plan.mins}</div>
                <button
                  type="button"
                  className={plan.cta === "primary" ? "btn btn-blue" : "btn btn-outline"}
                  style={{ width: "100%", marginBottom: 20 }}
                  onClick={() => spaGo("signup")}
                >
                  Start Free Trial
                </button>
                <ul className="premium-pricing-features">
                  {plan.features.map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          <div className="text-center" style={{ marginTop: 28 }}>
            <button type="button" className="btn btn-outline" onClick={() => spaGo("pricing")}>
              Compare all plans →
            </button>
          </div>
        </div>
      </section>

      <section className="premium-section premium-section--muted" aria-labelledby="premium-testimonials-heading">
        <div className="container">
          <div className="premium-section-head text-center">
            <div className="premium-label">Customer stories</div>
            <h2 id="premium-testimonials-heading">Real businesses. Real results.</h2>
          </div>
          <div className="premium-testimonial-grid">
            {TESTIMONIALS.map((t) => (
              <article key={t.name} className="premium-testimonial-card">
                <div className="premium-testimonial-stars" aria-hidden>
                  ★★★★★
                </div>
                <p>&ldquo;{t.quote}&rdquo;</p>
                <div className="premium-testimonial-author">
                  <span className="premium-testimonial-avatar">{t.initial}</span>
                  <div>
                    <strong>{t.name}</strong>
                    <span>{t.role}</span>
                  </div>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="premium-section" aria-labelledby="premium-consult-bridge-heading">
        <div className="container">
          <NeonGradientCard className="premium-consult-bridge">
            <div className="premium-consult-bridge-copy">
              <div className="premium-label">Beyond the front desk</div>
              <h2 id="premium-consult-bridge-heading">Need more than a receptionist?</h2>
              <p>
                Halla AI Consultancy builds connected automation for operations, client acquisition, and
                brand visibility — one point of contact, backed by a full AI team.
              </p>
            </div>
            <button type="button" className="btn btn-blue btn-lg" onClick={() => spaGo("consultancy")}>
              Explore AI Consultancy →
            </button>
          </NeonGradientCard>
        </div>
      </section>

      <section className="premium-section premium-section--dark premium-section--cta" aria-labelledby="premium-final-cta">
        <div className="container">
          <div className="premium-final-cta">
            <div className="premium-label">Start today</div>
            <h2 id="premium-final-cta">Your competitors are answering. Are you?</h2>
            <p className="lead">
              Set up in 15 minutes. 14-day free trial. No credit card. One call can pay for months.
            </p>
            <div className="premium-final-cta-actions">
              <ShimmerButton
                className="btn-lg"
                background="linear-gradient(135deg, #0D9488 0%, #0F766E 100%)"
                onClick={() => spaGo("signup")}
              >
                Get My AI Receptionist →
              </ShimmerButton>
              <button type="button" className="btn btn-outline btn-lg premium-cta-ghost" onClick={() => spaGo("pricing")}>
                View Pricing
              </button>
            </div>
            <p className="premium-final-cta-note">
              14-day free trial · No credit card · Cancel anytime · Live chat 7am–3pm ET
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
