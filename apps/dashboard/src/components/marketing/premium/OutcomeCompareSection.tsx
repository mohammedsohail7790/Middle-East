"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

const SCENARIOS = [
  {
    id: "peak",
    label: "Peak hours",
    title: "Busy during peak hours",
    without: ["Customer calls", "Team is on a job site", "Nobody answers", "Customer calls a competitor", "Revenue lost"],
    with: ["Customer calls", "Halla answers in 2 seconds", "Need is understood", "Lead captured", "You follow up and win"],
  },
  {
    id: "afterhours",
    label: "After hours",
    title: "After business hours",
    without: ["Call comes in at 9pm", "Office is closed", "Voicemail is ignored", "Opportunity lost"],
    with: ["Halla answers 24/7", "Takes the message", "Books if appropriate", "You wake up to details"],
  },
  {
    id: "voicemail",
    label: "Voicemail trap",
    title: "The voicemail trap",
    without: ["Missed call", "Customer waits", "Goes to voicemail", "Calls a competitor", "Lost opportunity"],
    with: ["Customer calls", "Halla answers instantly", "Customer gets help", "Lead captured", "You follow up and win"],
  },
] as const;

function FlowColumn({
  title,
  steps,
  variant,
}: {
  title: string;
  steps: readonly string[];
  variant: "without" | "with";
}) {
  return (
    <div className={`premium-outcome-col premium-outcome-col--${variant}`}>
      <h3>{title}</h3>
      <ol className="premium-outcome-steps">
        {steps.map((step, i) => (
          <motion.li
            key={step}
            initial={{ opacity: 0, x: variant === "without" ? -12 : 12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.07, duration: 0.35 }}
          >
            <span className="premium-outcome-step-num">{String(i + 1).padStart(2, "0")}</span>
            {step}
          </motion.li>
        ))}
      </ol>
    </div>
  );
}

export function OutcomeCompareSection() {
  const [activeId, setActiveId] = useState<(typeof SCENARIOS)[number]["id"]>("peak");
  const scenario = SCENARIOS.find((s) => s.id === activeId) ?? SCENARIOS[0];

  return (
    <section className="premium-section premium-section--muted" aria-labelledby="premium-outcome-heading">
      <div className="container">
        <div className="premium-label">The difference</div>
        <h2 id="premium-outcome-heading">What happens when you miss a call?</h2>
        <p className="lead">
          Every unanswered call is revenue walking away. Pick a real scenario — same customer, two very different outcomes.
        </p>

        <div className="premium-outcome-tabs" role="tablist" aria-label="Call scenarios">
          {SCENARIOS.map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={activeId === s.id}
              className={`premium-outcome-tab${activeId === s.id ? " is-active" : ""}`}
              onClick={() => setActiveId(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={scenario.id}
            className="premium-outcome-grid"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            <p className="premium-outcome-scenario-title">{scenario.title}</p>
            <FlowColumn title="Without Halla AI" steps={scenario.without} variant="without" />
            <div className="premium-outcome-divider" aria-hidden>
              <span>vs</span>
            </div>
            <FlowColumn title="With Halla AI" steps={scenario.with} variant="with" />
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
