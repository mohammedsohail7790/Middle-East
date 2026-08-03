export function FeatureGrid({
  items,
}: {
  items: { icon: string; iconClass: string; title: string; desc: string }[];
}) {
  return (
    <div className="grid-3" style={{ gap: 20 }}>
      {items.map((f) => (
        <div
          key={f.title}
          className={`card${f.iconClass === "feat-icon-blue" ? " card-blue" : ""}`}
        >
          <div className={`feat-icon ${f.iconClass}`.trim()}>{f.icon}</div>
          <h4>{f.title}</h4>
          <p style={{ marginTop: 8, fontSize: "0.875rem" }}>{f.desc}</p>
        </div>
      ))}
    </div>
  );
}
