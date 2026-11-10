import Link from "next/link";

/** Shown for any marketing address that is not a page. Styled like the Halla AI site, with a way back. */
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
        fontFamily: "'Plus Jakarta Sans', 'Segoe UI', Helvetica, Arial, sans-serif",
        background: "#FAF9F6",
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src="/logo-halla-light.png" alt="Halla AI" width={137} height={75} style={{ height: 56, width: "auto", marginBottom: "2rem" }} />
      <p style={{ margin: 0, fontSize: "0.75rem", fontWeight: 700, letterSpacing: "0.14em", textTransform: "uppercase", color: "#7A5A1E" }}>Error 404</p>
      <h1 style={{ fontFamily: "'Cormorant Garamond', Georgia, serif", fontSize: "2.5rem", fontWeight: 600, margin: "0.5rem 0 0.75rem", color: "#121417" }}>
        We couldn&apos;t find that page
      </h1>
      <p style={{ color: "#6B6B70", fontSize: "1rem", maxWidth: 420, margin: "0 0 2rem" }}>
        The address may have changed or never existed. Start from the home page, or write to hello@hallaai.com and we will help.
      </p>
      <Link
        href="/"
        style={{
          display: "inline-block",
          background: "#121417",
          color: "#fff",
          padding: "14px 28px",
          borderRadius: 8,
          borderBottom: "3px solid #C5A059",
          fontWeight: 600,
          fontSize: 14,
          textDecoration: "none",
        }}
      >
        Back to the home page →
      </Link>
    </div>
  );
}
