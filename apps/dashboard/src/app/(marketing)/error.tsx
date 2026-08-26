"use client";

import { useEffect } from "react";

export default function MarketingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[marketing]", error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: "60vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "2rem",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ maxWidth: "28rem", textAlign: "center" }}>
        <h1 style={{ fontSize: "1.25rem", fontWeight: 600, marginBottom: "0.5rem" }}>
          Marketing page failed to load
        </h1>
        <p style={{ fontSize: "0.875rem", color: "#64748b", marginBottom: "1.25rem" }}>
          Try refreshing. If you just deployed, wait a minute for the new build, then hard refresh
          (Ctrl+Shift+R).
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            padding: "0.625rem 1rem",
            borderRadius: "0.5rem",
            border: "none",
            background: "#0D9488",
            color: "white",
            fontWeight: 600,
            cursor: "pointer",
          }}
        >
          Try again
        </button>
      </div>
    </div>
  );
}
