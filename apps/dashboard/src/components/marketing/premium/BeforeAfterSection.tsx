"use client";

const WITHOUT = ["Missed call", "Customer waits", "Goes to voicemail", "Calls a competitor", "Lost opportunity"];
const WITH = ["Customer calls", "Halla answers instantly", "Customer gets help", "Lead captured", "You follow up and win"];

export function BeforeAfterSection() {
  return (
    <section className="premium-section" aria-labelledby="premium-compare-heading">
      <div className="container">
        <div className="premium-label">The difference</div>
        <h2 id="premium-compare-heading">Before &amp; after Halla AI</h2>
        <p className="lead">The same customer call — two very different outcomes.</p>
        <div className="premium-compare">
          <div className="premium-compare-col premium-compare-col--without">
            <h3>Without Halla AI</h3>
            <div className="premium-compare-flow">
              {WITHOUT.map((s, i) => (
                <span key={s}>
                  {i > 0 ? "↓ " : ""}
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="premium-compare-col premium-compare-col--with">
            <h3 style={{ color: "var(--accent-dark)" }}>With Halla AI</h3>
            <div className="premium-compare-flow">
              {WITH.map((s, i) => (
                <span key={s}>
                  {i > 0 ? "↓ " : ""}
                  {s}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
