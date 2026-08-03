import Link from "next/link";

export function CtaBlock({
  label,
  title,
  description,
  primaryHref = "/signup",
  primaryLabel = "Start Free Trial →",
  secondaryHref,
  secondaryLabel,
}: {
  label?: string;
  title: React.ReactNode;
  description?: string;
  primaryHref?: string;
  primaryLabel?: string;
  secondaryHref?: string;
  secondaryLabel?: string;
}) {
  return (
    <div className="cta-block">
      {label && (
        <div
          className="label"
          style={{ background: "rgba(14,165,233,0.15)", color: "var(--accent-mid)" }}
        >
          {label}
        </div>
      )}
      <h2>{title}</h2>
      {description && (
        <p style={{ marginTop: 12, maxWidth: 460, marginLeft: "auto", marginRight: "auto" }}>
          {description}
        </p>
      )}
      <div className="btn-group">
        <Link href={primaryHref} className="btn btn-blue btn-lg">
          {primaryLabel}
        </Link>
        {secondaryHref && secondaryLabel && (
          <Link
            href={secondaryHref}
            className="btn btn-outline btn-lg"
            style={{ color: "rgba(255,255,255,0.7)", borderColor: "rgba(255,255,255,0.2)" }}
          >
            {secondaryLabel}
          </Link>
        )}
      </div>
    </div>
  );
}
