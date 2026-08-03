"use client";

import { useState } from "react";
import Link from "next/link";
import { SUPPORT_EMAIL } from "@/lib/integration-support";

type TawkWindow = {
  Tawk_API?: { toggle?: () => void; maximize?: () => void };
  Intercom?: (action: string) => void;
};

/**
 * Tawk's script takes a few seconds after page load to attach real methods
 * to window.Tawk_API — a click in that window used to fall straight through
 * to the mailto fallback. Poll briefly for readiness before giving up.
 */
function openChat(attempt = 0) {
  const w = window as unknown as TawkWindow;
  const tawkOpen = w.Tawk_API?.maximize ?? w.Tawk_API?.toggle;
  if (tawkOpen) {
    tawkOpen();
    return;
  }
  if (attempt < 15) {
    setTimeout(() => openChat(attempt + 1), 200);
    return;
  }
  if (typeof w.Intercom === "function") {
    w.Intercom("show");
    return;
  }
  window.location.href = `mailto:${SUPPORT_EMAIL}`;
}

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = `From: ${name} <${email}>\n\n${message}`;
    const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
      "Contact form: " + name
    )}&body=${encodeURIComponent(body)}`;
    window.open(mailto, "_blank");
    setSent(true);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24, marginBottom: 48 }}>
      {/* Email Card */}
      <a
        href={`mailto:${SUPPORT_EMAIL}`}
        className="card"
        style={{ display: "flex", alignItems: "center", gap: 18, padding: "20px 24px", textDecoration: "none" }}
      >
        <div style={{ fontSize: "2rem", lineHeight: 1 }}>✉️</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--gray-600)" }}>Email us</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--accent)" }}>{SUPPORT_EMAIL}</div>
          <p style={{ fontSize: "0.8rem", color: "var(--gray-400)", marginTop: 2 }}>
            We respond within 24 hours, usually sooner.
          </p>
        </div>
      </a>

      {/* Chat Card */}
      <button
        type="button"
        onClick={() => openChat()}
        className="card"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "20px 24px",
          cursor: "pointer",
          textAlign: "left",
          border: "1px solid var(--gray-200)",
          width: "100%",
        }}
      >
        <div style={{ fontSize: "2rem", lineHeight: 1 }}>💬</div>
        <div>
          <div style={{ fontWeight: 600, fontSize: "0.9rem", color: "var(--gray-600)" }}>Live Chat</div>
          <div style={{ fontSize: "1.1rem", fontWeight: 600, color: "var(--black)" }}>Chat with our team</div>
          <p style={{ fontSize: "0.8rem", color: "var(--gray-400)", marginTop: 2 }}>
            Available 7am–3pm ET, Monday–Friday.
          </p>
        </div>
      </button>

      {/* Quick Contact Form */}
      <div className="card" style={{ padding: "28px 24px", marginTop: 8 }}>
        {sent ? (
          <div style={{ textAlign: "center", padding: "24px 0" }}>
            <p style={{ fontSize: "0.95rem", color: "var(--gray-600)" }}>
              Thanks{name ? `, ${name}` : ""}! Send the pre-filled email that just opened and we&apos;ll get back to
              you within 24 hours.
            </p>
            <button type="button" className="btn-ghost" style={{ marginTop: 16 }} onClick={() => setSent(false)}>
              Send another message
            </button>
          </div>
        ) : (
          <>
            <h3 style={{ marginBottom: 6 }}>Send us a quick message</h3>
            <p style={{ fontSize: "0.85rem", color: "var(--gray-500)", marginBottom: 20 }}>
              We&apos;ll get back to you as soon as possible.
            </p>
            <form onSubmit={submit}>
              <div style={{ display: "grid", gap: 16 }}>
                <div>
                  <label style={{ fontSize: "0.83rem", fontWeight: 600, color: "var(--gray-700)", display: "block", marginBottom: 6 }}>
                    Your name
                  </label>
                  <input
                    className="roi-input"
                    type="text"
                    placeholder="e.g., Mike Thompson"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.83rem", fontWeight: 600, color: "var(--gray-700)", display: "block", marginBottom: 6 }}>
                    Email address
                  </label>
                  <input
                    className="roi-input"
                    type="email"
                    placeholder="mike@business.com"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
                <div>
                  <label style={{ fontSize: "0.83rem", fontWeight: 600, color: "var(--gray-700)", display: "block", marginBottom: 6 }}>
                    Message
                  </label>
                  <textarea
                    className="roi-input"
                    rows={4}
                    placeholder="Tell us how we can help..."
                    style={{ resize: "vertical", minHeight: 100 }}
                    required
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                  />
                </div>
                <button type="submit" className="btn btn-primary btn-lg" style={{ width: "100%", fontSize: "1rem" }}>
                  Send Message →
                </button>
              </div>
            </form>
            <p style={{ fontSize: "0.75rem", color: "var(--gray-400)", textAlign: "center", marginTop: 16 }}>
              By submitting, you agree to our{" "}
              <Link href="/privacy" style={{ color: "var(--accent)" }}>
                Privacy Policy
              </Link>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
