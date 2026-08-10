"use client";

import Link from "next/link";
import { useId, useState } from "react";
import {
  Phone, Bot, Zap, Languages, Shield, Calendar, MapPin, Mic,
  Target, Mail, Shuffle, Moon, AlertTriangle, CheckCircle2,
  type LucideIcon,
} from "lucide-react";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { Hero } from "@/components/marketing/Hero";
import {
  TICKER_ITEMS,
  VALUE_PROPS,
  FEATURES,
  HOW_IT_WORKS,
  PRICING_PLANS,
  FAQ_ITEMS,
} from "@/lib/marketing-content";

const ICONS: Record<string, LucideIcon> = {
  phone: Phone,
  bot: Bot,
  zap: Zap,
  languages: Languages,
  shield: Shield,
  calendar: Calendar,
  "map-pin": MapPin,
  mic: Mic,
  target: Target,
  mail: Mail,
  shuffle: Shuffle,
  moon: Moon,
};

function MarketingIcon({ name, className }: { name: string; className?: string }) {
  const Icon = ICONS[name] ?? Phone;
  return <Icon className={className} strokeWidth={2} aria-hidden />;
}

function FaqItem({ q, a }: { q: string; a: string }) {
  const [open, setOpen] = useState(false);
  const answerId = useId();
  return (
    <div className={`faq-item${open ? " open" : ""}`}>
      <button
        type="button"
        className="faq-q"
        aria-expanded={open}
        aria-controls={answerId}
        onClick={() => setOpen((o) => !o)}
      >
        {q}
        <span className="faq-icon">+</span>
      </button>
      <div id={answerId} className="faq-a" aria-hidden={!open}>
        {a}
      </div>
    </div>
  );
}

export default function HomeMarketingPage() {
  const ticker = [...TICKER_ITEMS, ...TICKER_ITEMS];

  return (
    <MarketingShell>

      <Hero />

      <div className="ticker-wrap">
        <div className="ticker-track">
          {ticker.map((item, i) => (
            <span key={i} className="ticker-item" aria-hidden={i >= TICKER_ITEMS.length}>
              <MarketingIcon name={item.icon} className="inline-block size-3.5 -mt-0.5 me-1 text-[var(--gold)]" />
              <strong>{item.strong}</strong> {item.text}{" "}
              <span className="ticker-sep">·</span>
            </span>
          ))}
        </div>
      </div>

      <section className="section">
        <div className="container">
          <div className="grid-2 items-center" style={{ gap: "clamp(2rem, 5vw, 5rem)" }}>
            <div>
              <div className="label">The ROI Is Obvious</div>
              <h2>
                One Call Can Pay for
                <br />
                <span style={{ color: "var(--accent)" }}>6+ Months</span> of Service
              </h2>
              <p style={{ margin: "18px 0 36px", fontSize: "1.05rem" }}>
                Every missed call is money walking to your competitor. Halla AI ensures every call is answered, every lead
                captured, every appointment booked — while you&apos;re doing the actual work.
              </p>
              {VALUE_PROPS.map((v) => (
                <div key={v.num} className="value-item">
                  <div className="value-num">{v.num}</div>
                  <div>
                    <h4>{v.title}</h4>
                    <p style={{ marginTop: 6, fontSize: "0.9rem" }}>{v.desc}</p>
                  </div>
                </div>
              ))}
              <Link href="/signup" className="btn btn-primary" style={{ marginTop: 24 }}>
                Start Free Trial →
              </Link>
            </div>

            <div className="mockup-wrap">
              <div className="mock-badge mock-badge-1">
                <AlertTriangle className="inline-block size-3.5 -mt-0.5 me-1" strokeWidth={2.25} aria-hidden />
                <span>Emergency flagged</span> <span className="mock-badge-green">→ Dispatching</span>
              </div>
              <div className="mock-badge mock-badge-2">
                <CheckCircle2 className="inline-block size-3.5 -mt-0.5 me-1" strokeWidth={2.25} aria-hidden />
                <span className="mock-badge-green">AED 2,000 job</span> captured
              </div>
              <div className="mockup">
                <div className="mockup-header">
                  <Phone className="inline-block size-3.5 -mt-0.5 me-1.5" strokeWidth={2.25} aria-hidden />
                  Incoming Call — +971 4 XXX XXXX
                </div>
                <div className="wave">
                  {[0, 1, 2, 3, 4, 5, 6].map((i) => (
                    <div key={i} className="wave-bar" />
                  ))}
                </div>
                <div className="bubble">The AC unit just stopped completely — it&apos;s 45 degrees outside!</div>
                <div className="bubble ai">
                  I&apos;m Halla AI, your AI receptionist. Is this a full outage, or is it still running but not cooling?
                </div>
                <div className="bubble">Full outage. No power to the unit at all.</div>
                <div className="bubble ai">
                  Marking as emergency — alerting your on-call technician now. Confirming your address in Al Barsha?
                </div>
                <div className="mockup-status">
                  <div className="status-dot" />
                  <div className="status-text">Emergency dispatched → Technician en route</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <hr className="divider-line" />

      <section className="section">
        <div className="container">
          <div className="text-center" style={{ marginBottom: 60 }}>
            <div className="label">Core Features</div>
            <h2>
              Everything a World-Class
              <br />
              Receptionist Does — Automated
            </h2>
            <p style={{ marginTop: 16, maxWidth: 500, marginLeft: "auto", marginRight: "auto" }}>
              All core features on every plan. No add-ons. No surprises.
            </p>
          </div>
          <div className="grid-3" style={{ gap: 20 }}>
            {FEATURES.map((f) => (
              <div key={f.title} className={`card${f.iconClass === "feat-icon-blue" ? " card-blue" : ""}`}>
                <div className={`feat-icon ${f.iconClass}`.trim()}>
                  <MarketingIcon name={f.icon} className="size-5" />
                </div>
                <h4>{f.title}</h4>
                <p style={{ marginTop: 8, fontSize: "0.875rem" }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ background: "var(--gray-50)" }}>
        <div className="container container-sm">
          <div className="text-center" style={{ marginBottom: 48 }}>
            <div className="label">How It Works</div>
            <h2>Live in 15 Minutes</h2>
          </div>
          {HOW_IT_WORKS.map((s) => (
            <div key={s.n} className="step-row">
              <div className="step-num">{s.n}</div>
              <div>
                <h3 style={{ marginBottom: 8 }}>{s.title}</h3>
                <p>{s.desc}</p>
              </div>
            </div>
          ))}
          <div className="text-center" style={{ marginTop: 32 }}>
            <Link href="/signup" className="btn btn-blue btn-lg">
              Get My AI Receptionist →
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="text-center" style={{ marginBottom: 52 }}>
            <div className="label">Simple Pricing</div>
            <h2>
              Transparent. No Surprises.
              <br />
              No Hidden Fees.
            </h2>
            <p style={{ marginTop: 16 }}>Start free for 14 days. No credit card required. Save 20% annually.</p>
          </div>
          <div className="grid-3" style={{ maxWidth: 920, margin: "0 auto 36px", alignItems: "start" }}>
            {PRICING_PLANS.map((p) => (
              <div key={p.id} className={`pricing-card${p.popular ? " popular" : ""}`}>
                {p.popular && <div className="pop-badge">Most Popular</div>}
                <div className="pricing-plan">{p.name}</div>
                <div className="pricing-price">
                  <span className="text-[0.4em] font-semibold align-top me-1">{p.currency}</span>
                  {p.price}
                  <sub>/mo</sub>
                </div>
                <div className="pricing-mins">{p.mins}</div>
                <Link
                  href="/signup"
                  className={`btn ${p.ctaClass}`}
                  style={{ width: "100%", marginBottom: 22, display: "flex" }}
                >
                  {p.cta}
                </Link>
                <div className="p-divider" />
                {p.features.map((f) => (
                  <div key={f.text} className={`pricing-feature${f.ok ? "" : " miss"}`}>
                    {f.text}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="section-sm">
        <div className="container container-sm">
          <div className="text-center" style={{ marginBottom: 40 }}>
            <div className="label">FAQ</div>
            <h2>Common Questions</h2>
          </div>
          {FAQ_ITEMS.map((item) => (
            <FaqItem key={item.q} q={item.q} a={item.a} />
          ))}
        </div>
      </section>

      <section className="section-sm">
        <div className="container">
          <div className="cta-block">
            <div className="label" style={{ background: "rgba(201,162,75,0.15)", color: "var(--accent-mid)" }}>
              Start Today
            </div>
            <h2>
              Your Competitors Are Answering.
              <br />
              Are You?
            </h2>
            <p style={{ marginTop: 16, maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
              Set up in 15 minutes. 14-day free trial. No credit card. No risk. One call can pay for months.
            </p>
            <div className="btn-group">
              <Link href="/signup" className="btn btn-blue btn-lg">
                Get My AI Receptionist →
              </Link>
              <Link
                href="/pricing"
                className="btn btn-outline btn-lg"
                style={{ color: "rgba(255,255,255,0.7)", borderColor: "rgba(255,255,255,0.2)" }}
              >
                View Pricing
              </Link>
            </div>
            <p style={{ marginTop: 20, fontSize: "0.8rem", color: "rgba(255,255,255,0.3)" }}>
              14-day free trial · No credit card · Cancel anytime · Live chat 9am–6pm GST
            </p>
          </div>
        </div>
      </section>

    </MarketingShell>
  );
}
