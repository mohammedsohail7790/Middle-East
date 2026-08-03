"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";

const PRODUCT_LINKS = [
  { href: "/features", label: "Features", icon: "✨" },
  { href: "/pricing", label: "Pricing", icon: "💰" },
  { href: "/how-it-works", label: "How It Works", icon: "⚙️" },
  { href: "/integrations", label: "Integrations", icon: "🔗" },
];

const SOLUTION_LINKS = [
  { href: "/solutions/answering", label: "Answering Service", icon: "📞" },
  { href: "/solutions/scheduling", label: "Scheduling", icon: "📅" },
  { href: "/solutions/messages", label: "Message Taking", icon: "✉️" },
  { href: "/solutions/leads", label: "Lead Capture", icon: "🎯" },
  { href: "/solutions/routing", label: "Call Routing", icon: "🔀" },
  { href: "/solutions/multilingual", label: "Multi-Lingual", icon: "🌎" },
  { href: "/solutions/afterhours", label: "After Hours", icon: "🌙" },
  { href: "/solutions/screening", label: "Call Screening", icon: "🛡️" },
];

const INDUSTRY_LINKS = [
  { href: "/industries/hvac", label: "HVAC", icon: "❄️" },
  { href: "/industries/plumbing", label: "Plumbing", icon: "🔧" },
  { href: "/industries/electrical", label: "Electrical", icon: "⚡" },
  { href: "/industries/landscaping", label: "Landscaping", icon: "🌿" },
  { href: "/industries/cleaning", label: "Home Cleaning", icon: "🧹" },
  { href: "/industries/roofing", label: "Roofers", icon: "🏠" },
  { href: "/industries/pestcontrol", label: "Pest Control", icon: "🐜" },
  { href: "/industries/movers", label: "Movers", icon: "🚛" },
  { href: "/industries/pool-services", label: "Pool Services", icon: "🏊" },
  { href: "/industries/floor-installers", label: "Floor Installers", icon: "🪚" },
];

const RESOURCE_LINKS = [
  { href: "/roi", label: "ROI Calculator", icon: "📊" },
  { href: "/blog", label: "Blog", icon: "📝" },
  { href: "/forwarding", label: "Call Forwarding Guides", icon: "📲" },
  { href: "/ai-vs-human", label: "AI vs Human", icon: "🤖" },
  { href: "/docs", label: "Help Center", icon: "📚" },
  { href: "/support", label: "Support", icon: "💬" },
];

export function MarketingNav() {
  const [mobOpen, setMobOpen] = useState(false);

  return (
    <>
      <nav>
        <div className="container">
          <div className="nav-inner">
            <Link href="/" className="logo">
              <Image src="/logo.png" alt="Call IQ" width={220} height={56} className="h-[56px] w-auto max-w-[min(220px,46vw)]" priority />
            </Link>

            <div className="nav-links">
              <div className="nav-item">
                <div className="nav-link">
                  Product
                  <svg viewBox="0 0 12 12" aria-hidden>
                    <path d="M2 4l4 4 4-4" />
                  </svg>
                </div>
                <div className="dropdown">
                  {PRODUCT_LINKS.map((l) => (
                    <Link key={l.href} href={l.href} className="dropdown-link">
                      <div className="ddi">{l.icon}</div>
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="nav-item">
                <div className="nav-link">
                  Solutions
                  <svg viewBox="0 0 12 12" aria-hidden>
                    <path d="M2 4l4 4 4-4" />
                  </svg>
                </div>
                <div className="dropdown dropdown-wide">
                  {SOLUTION_LINKS.map((l) => (
                    <Link key={l.href} href={l.href} className="dropdown-link">
                      <div className="ddi">{l.icon}</div>
                      {l.label}
                    </Link>
                  ))}
                </div>
              </div>

              <div className="nav-item">
                <div className="nav-link">
                  Industries
                  <svg viewBox="0 0 12 12" aria-hidden>
                    <path d="M2 4l4 4 4-4" />
                  </svg>
                </div>
                <div className="dropdown dropdown-wide">
                  <div className="dd-section">Trades & Services</div>
                  {INDUSTRY_LINKS.slice(0, 4).map((l) => (
                    <Link key={l.href} href={l.href} className="dropdown-link">
                      <div className="ddi">{l.icon}</div>
                      {l.label}
                    </Link>
                  ))}
                  <div className="dd-section" style={{ marginTop: 6 }}>
                    Professional
                  </div>
                  {INDUSTRY_LINKS.slice(4).map((l) => (
                    <Link key={l.href} href={l.href} className="dropdown-link">
                      <div className="ddi">{l.icon}</div>
                      {l.label}
                    </Link>
                  ))}
                  <Link href="/industries" className="dropdown-link" style={{ color: "var(--accent)" }}>
                    <div className="ddi" style={{ background: "var(--accent-light)" }}>
                      →
                    </div>
                    See All Industries
                  </Link>
                </div>
              </div>

              <Link href="/pricing" className="nav-link">
                Pricing
              </Link>

              <div className="nav-item">
                <div className="nav-link">
                  Resources
                  <svg viewBox="0 0 12 12" aria-hidden>
                    <path d="M2 4l4 4 4-4" />
                  </svg>
                </div>
                <div className="dropdown dropdown-wide">
                  {RESOURCE_LINKS.map((l) => (
                    <Link key={l.href} href={l.href} className="dropdown-link">
                      <div className="ddi">{l.icon}</div>
                      {l.label}
                    </Link>
                  ))}
                  <Link href="/faq" className="dropdown-link">
                    <div className="ddi">❓</div>
                    FAQ
                  </Link>
                </div>
              </div>
            </div>

            <div className="nav-actions">
              <Link href="/login" className="btn btn-outline btn-sm hidden min-[480px]:inline-flex">
                Sign In
              </Link>
              <Link href="/signup" className="btn btn-primary btn-sm">
                <span className="hidden sm:inline">Get My AI Receptionist →</span>
                <span className="sm:hidden">Get Started →</span>
              </Link>
            </div>

            <button
              type="button"
              className="hamburger"
              aria-label="Open menu"
              aria-expanded={mobOpen}
              onClick={() => setMobOpen((o) => !o)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
      </nav>

      <div className={`mob-nav${mobOpen ? " open" : ""}`}>
        <div className="mob-section">Product</div>
        {PRODUCT_LINKS.map((l) => (
          <Link key={l.href} href={l.href} className="mob-link" onClick={() => setMobOpen(false)}>
            {l.icon} {l.label}
          </Link>
        ))}
        <hr className="mob-divider" />
        <div className="mob-section">Solutions</div>
        {SOLUTION_LINKS.slice(0, 4).map((l) => (
          <Link key={l.href} href={l.href} className="mob-link" onClick={() => setMobOpen(false)}>
            {l.icon} {l.label}
          </Link>
        ))}
        <hr className="mob-divider" />
        <div className="mob-section">Resources</div>
        <Link href="/roi" className="mob-link" onClick={() => setMobOpen(false)}>
          📊 ROI Calculator
        </Link>
        <Link href="/faq" className="mob-link" onClick={() => setMobOpen(false)}>
          ❓ FAQ
        </Link>
        <Link href="/blog" className="mob-link" onClick={() => setMobOpen(false)}>
          📝 Blog
        </Link>
        <Link href="/docs" className="mob-link" onClick={() => setMobOpen(false)}>
          📚 Help Center
        </Link>
        <Link href="/support" className="mob-link" onClick={() => setMobOpen(false)}>
          💬 Support
        </Link>
        <hr className="mob-divider" />
        <Link href="/login" className="mob-link" onClick={() => setMobOpen(false)}>
          Sign In
        </Link>
        <Link
          href="/signup"
          className="btn btn-primary"
          style={{ margin: "16px 0", textAlign: "center" }}
          onClick={() => setMobOpen(false)}
        >
          Get My AI Receptionist →
        </Link>
      </div>
    </>
  );
}
