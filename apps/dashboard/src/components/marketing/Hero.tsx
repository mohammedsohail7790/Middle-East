import Link from "next/link";
import { CheckCircle2, PhoneIncoming, Sparkles } from "lucide-react";

const TRUST_ITEMS = [
  "Free 14-day trial",
  "No credit card",
  "Live in 15 minutes",
  "Cancel anytime",
];

const STATS = [
  { num: "24/7", label: "Always Answering" },
  { num: "AR / EN", label: "Bilingual, Live" },
  { num: "UAE", label: "Local Number" },
  { num: "15min", label: "Setup Time" },
];

/**
 * Abstract geometric motif inspired by Islamic geometric pattern grids —
 * kept fully abstract (interlocking line grid, no literal ornament) and at
 * very low opacity so it reads as texture, not decoration.
 */
function GeometricPattern() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute inset-0 h-full w-full opacity-[0.05] [mask-image:radial-gradient(ellipse_80%_60%_at_50%_0%,black,transparent)]"
      preserveAspectRatio="xMidYMid slice"
    >
      <defs>
        <pattern id="halla-geo" width="72" height="72" patternUnits="userSpaceOnUse">
          <path
            d="M36 0 L72 36 L36 72 L0 36 Z M36 18 L54 36 L36 54 L18 36 Z"
            fill="none"
            stroke="var(--gold)"
            strokeWidth="1"
          />
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#halla-geo)" />
    </svg>
  );
}

function CallMockup() {
  const bars = [6, 10, 16, 24, 16, 10, 6];
  return (
    <div className="relative mx-auto w-full max-w-[380px]">
      <div className="absolute -inset-4 -z-10 rounded-[32px] bg-[var(--gold)]/10 blur-2xl" aria-hidden />
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-[0_20px_60px_-20px_rgba(11,18,32,0.35)] overflow-hidden">
        <div className="flex items-center gap-2 border-b border-[var(--border)] bg-[var(--background-elevated)] px-5 py-3.5">
          <PhoneIncoming className="size-4 text-[var(--gold)]" strokeWidth={2} />
          <span className="text-sm font-semibold text-foreground">Incoming Call · +971 4 XXX XXXX</span>
        </div>

        <div className="flex items-end justify-center gap-1 px-5 py-4">
          {bars.map((h, i) => (
            <span
              key={i}
              className="w-1.5 rounded-full bg-[var(--gold)]/70 motion-safe:animate-pulse"
              style={{ height: `${h}px`, animationDelay: `${i * 90}ms` }}
            />
          ))}
        </div>

        <div className="space-y-2.5 px-5 pb-5">
          <div className="ms-auto max-w-[85%] rounded-2xl rounded-ee-sm bg-[var(--muted)] px-3.5 py-2.5 text-sm text-foreground" dir="rtl" lang="ar">
            أحتاج حجز موعد صيانة تكييف غداً
          </div>
          <div className="me-auto max-w-[85%] rounded-2xl rounded-ss-sm bg-[var(--gold)] px-3.5 py-2.5 text-sm text-[var(--navy)]">
            I&apos;m Halla, your AI receptionist. I can book that now — what time works for you tomorrow?
          </div>
          <div className="flex items-center gap-2 rounded-xl border border-[var(--gold)]/25 bg-[var(--gold)]/10 px-3.5 py-2.5 text-xs font-semibold text-[var(--gold-text)]">
            <CheckCircle2 className="size-3.5 shrink-0" strokeWidth={2.25} />
            Appointment booked · Confirmation sent
          </div>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="hero relative overflow-hidden !text-start">
      <GeometricPattern />
      <div
        className="pointer-events-none absolute -top-24 start-1/2 -z-10 h-[420px] w-[420px] -translate-x-1/2 rounded-full bg-[var(--gold)]/[0.08] blur-3xl rtl:translate-x-1/2"
        aria-hidden
      />

      <div className="container">
        <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
          <div className="text-center lg:text-start">
            <div className="hero-eyebrow mx-auto lg:mx-0">
              <span className="dot" />
              14-Day Free Trial — No Credit Card Required
            </div>

            <h1 className="!mb-6">
              Your Business Deserves
              <br />
              an AI That <em>Never</em> Sleeps
            </h1>

            <p className="hero-sub mx-auto lg:mx-0">
              Halla AI answers every call 24/7 in Arabic or English, books appointments, captures
              leads, and routes emergencies — automatically, on your own UAE number.
            </p>

            <div className="hero-actions justify-center lg:justify-start">
              <Link href="/signup" className="btn btn-primary btn-lg">
                <Sparkles className="size-4" strokeWidth={2.25} aria-hidden />
                Get My AI Receptionist
              </Link>
              <Link href="/how-it-works" className="btn btn-outline btn-lg">
                See How It Works
              </Link>
            </div>

            <ul className="flex flex-wrap justify-center gap-x-5 gap-y-2 lg:justify-start" aria-label="Trial terms">
              {TRUST_ITEMS.map((item) => (
                <li key={item} className="inline-flex items-center gap-1.5 text-sm text-[var(--gray-600)]">
                  <CheckCircle2 className="size-4 shrink-0 text-[var(--gold)]" strokeWidth={2.25} aria-hidden />
                  {item}
                </li>
              ))}
            </ul>
          </div>

          <CallMockup />
        </div>

        <div className="stats-bar">
          {STATS.map((s) => (
            <div key={s.label} className="stat-item">
              <div className="stat-num">{s.num}</div>
              <div className="stat-label">{s.label}</div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
