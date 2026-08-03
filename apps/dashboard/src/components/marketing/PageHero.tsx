export function PageHero({
  label,
  title,
  subtitle,
}: {
  label: string;
  title: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="page-hero">
      <div className="container text-center">
        <div className="label">{label}</div>
        <h1>{title}</h1>
        {subtitle && (
          <p style={{ marginTop: 12, fontSize: "1.05rem" }}>{subtitle}</p>
        )}
      </div>
    </div>
  );
}
