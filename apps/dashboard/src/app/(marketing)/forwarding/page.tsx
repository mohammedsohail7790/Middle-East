import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";
import { PageHero } from "@/components/marketing/PageHero";

export const metadata = { title: "Call Forwarding | Halla AI" };

export default function ForwardingPage() {
  return (
    <MarketingShell>
      <PageHero
        label="Call Forwarding"
        title="Set Up Halla AI in Minutes"
        subtitle="Step-by-step instructions for every major phone carrier."
      />
      <section className="section">
        <div className="container-sm">
          <div className="alert alert-info">
            <span>📱</span>
            <span className="alert-text">
              You have 3 setup options: (1) Port your number to Halla AI — free, 5–10 days. (2) Get a new number from us —
              instant. (3) Forward calls from your existing carrier — 5–15 minutes. This guide covers option #3.
            </span>
          </div>
          <div style={{ marginTop: 36, display: "grid", gap: 18 }}>
            <div className="card">
              <h4 style={{ marginBottom: 14 }}>📞 RingCentral</h4>
              <ol style={{ color: "var(--gray-500)", fontSize: "0.875rem", lineHeight: 2.2, paddingLeft: 20 }}>
                <li>Log in to RingCentral admin portal</li>
                <li>
                  Go to <span className="chip">Phone System → Extensions</span> → select your user
                </li>
                <li>
                  Click <span className="chip">Call Handling & Forwarding</span>
                </li>
                <li>Add forwarding number: your Halla AI number</li>
                <li>Set: Ring desk first, forward after 15 seconds</li>
                <li>Save and test</li>
              </ol>
            </div>
            <div className="card">
              <h4 style={{ marginBottom: 14 }}>📞 Nextiva</h4>
              <ol style={{ color: "var(--gray-500)", fontSize: "0.875rem", lineHeight: 2.2, paddingLeft: 20 }}>
                <li>Log in to Nextiva admin portal</li>
                <li>
                  Go to <span className="chip">Users → select your extension</span>
                </li>
                <li>
                  Click <span className="chip">Call Forwarding</span>
                </li>
                <li>Enable &quot;Forward when unanswered&quot; and enter your Halla AI number</li>
                <li>Set ring time to 15–20 seconds. Save.</li>
              </ol>
            </div>
            <div className="card">
              <h4 style={{ marginBottom: 14 }}>📱 Cell Phones (Verizon, AT&T, T-Mobile)</h4>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3,1fr)", gap: 12, marginTop: 10 }}>
                {[
                  { name: "Verizon", fwd: "*72 + number", cancel: "*73" },
                  { name: "AT&T", fwd: "*21* + number + #", cancel: "#21#" },
                  { name: "T-Mobile", fwd: "**21* + number + #", cancel: "##21#" },
                ].map((c) => (
                  <div key={c.name} style={{ background: "var(--gray-50)", borderRadius: "var(--radius)", padding: 14 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6, fontSize: "0.875rem" }}>{c.name}</div>
                    <div style={{ fontSize: "0.78rem", color: "var(--gray-500)" }}>
                      Dial <span className="chip">{c.fwd}</span>
                      <br />
                      Cancel: <span className="chip">{c.cancel}</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div style={{ textAlign: "center", marginTop: 40 }}>
            <Link href="/signup" className="btn btn-primary btn-lg">
              Get My Halla AI Number →
            </Link>
          </div>
        </div>
      </section>
    </MarketingShell>
  );
}
