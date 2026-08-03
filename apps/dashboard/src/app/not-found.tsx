import Link from "next/link";
import { MarketingShell } from "@/components/marketing/MarketingShell";

export default function NotFound() {
  return (
    <MarketingShell>
      <div
        style={{
          minHeight: "60vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          textAlign: "center",
          padding: "4rem 1.5rem",
        }}
      >
        <div style={{ fontSize: "4rem", marginBottom: "1rem" }}>📞</div>
        <h1 style={{ fontSize: "clamp(2rem, 5vw, 3rem)", fontWeight: 800, marginBottom: "0.75rem" }}>
          Page Not Found
        </h1>
        <p style={{ color: "#6b7280", fontSize: "1.1rem", maxWidth: "480px", marginBottom: "2.5rem" }}>
          We couldn&apos;t find that page. Let&apos;s get you back on track.
        </p>
        <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", justifyContent: "center" }}>
          <Link href="/" className="btn btn-primary">
            Back to Home
          </Link>
          <Link href="/pricing" className="btn btn-secondary">
            View Pricing
          </Link>
        </div>
      </div>
    </MarketingShell>
  );
}
