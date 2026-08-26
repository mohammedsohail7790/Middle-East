"use client";

import { HeroPhone3D } from "@/components/marketing/premium/HeroPhone3D";

const STATS = [
  { value: "<2s", label: "Answer time" },
  { value: "24/7", label: "Always on" },
  { value: "50+", label: "Industries" },
];

export function AuthShowcasePanel() {
  return (
    <div className="auth-showcase">
      <div className="auth-showcase__copy">
        <p className="auth-showcase__eyebrow">AI receptionist for GCC businesses</p>
        <h2 className="auth-showcase__title">
          Every call answered.
          <span className="auth-showcase__title-accent"> Every lead captured.</span>
        </h2>
        <p className="auth-showcase__lead">
          Halla AI books appointments, routes emergencies, and sends summaries to your team — in
          English and Arabic.
        </p>
      </div>

      <div className="auth-showcase__visual">
        <HeroPhone3D />
      </div>

      <div className="auth-showcase__stats">
        {STATS.map((stat) => (
          <div key={stat.label} className="auth-showcase__stat">
            <strong>{stat.value}</strong>
            <span>{stat.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
