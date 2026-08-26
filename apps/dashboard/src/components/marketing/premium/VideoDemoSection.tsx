"use client";

/** Placeholder cards — replace `data-video-src` when real demo MP4s are available. */
const DEMOS = [
  {
    title: "Incoming call answered",
    desc: "Halla picks up and greets the caller with your business name.",
    videoSrc: "",
  },
  {
    title: "Lead captured",
    desc: "Caller details and request logged to your dashboard automatically.",
    videoSrc: "",
  },
  {
    title: "Appointment booked",
    desc: "Scheduling handled on the call — synced to your calendar.",
    videoSrc: "",
  },
];

export function VideoDemoSection() {
  return (
    <section className="premium-section" aria-labelledby="premium-video-heading">
      <div className="container">
        <div className="premium-label">Product demos</div>
        <h2 id="premium-video-heading">See Halla AI in action</h2>
        <p className="lead">
          Short demonstrations of what the AI receptionist actually does on a real business call.
        </p>
        <div className="premium-video-grid">
          {DEMOS.map((d) => (
            <article key={d.title} className="premium-video-card">
              <div className="premium-video-thumb" data-video-src={d.videoSrc || undefined}>
                {d.videoSrc ? (
                  <video src={d.videoSrc} muted playsInline preload="none" />
                ) : (
                  <span className="premium-video-play" aria-hidden>▶</span>
                )}
              </div>
              <div className="premium-video-card-body">
                <h4>{d.title}</h4>
                <p>{d.videoSrc ? d.desc : `${d.desc} (Video coming soon)`}</p>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
