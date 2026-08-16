import Link from "next/link";

export default function NotFound() {
  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "4rem 1.5rem",
        fontFamily: "sans-serif",
        background: "#fff",
      }}
    >
      <div style={{ fontSize: "3.5rem", marginBottom: "1rem" }}>📞</div>
      <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: "0.75rem", color: "#0a0a0a" }}>
        Page Not Found
      </h1>
      <p style={{ color: "#6b7280", fontSize: "1rem", maxWidth: "400px", marginBottom: "2rem" }}>
        We couldn&apos;t find that page.
      </p>
      <Link
        href="/login"
        style={{
          display: "inline-block",
          background: "#0D9488",
          color: "#fff",
          padding: "12px 28px",
          borderRadius: "9999px",
          fontWeight: 600,
          textDecoration: "none",
        }}
      >
        Go to Dashboard →
      </Link>
    </div>
  );
}
