"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

type DemoId = "answer" | "lead" | "appointment";

type Frame = {
  label: string;
  caller?: string;
  ai?: string;
  badge?: string;
};

const DEMOS: Record<
  DemoId,
  { title: string; desc: string; frames: Frame[] }
> = {
  answer: {
    title: "Incoming call answered",
    desc: "Interactive demo — Halla picks up and greets with your business name.",
    frames: [
      { label: "Ringing…", caller: "+971 50 XXX XXXX" },
      { label: "Answered", ai: "Hello, this is Halla AI for your business. How can I help?" },
      { label: "Listening", ai: "I'm listening — please tell me what you need.", badge: "Voice active" },
    ],
  },
  lead: {
    title: "Lead captured",
    desc: "Interactive demo — caller details logged to your dashboard automatically.",
    frames: [
      { label: "Caller explains", caller: "I need a plumber for a leak tomorrow." },
      { label: "AI confirms", ai: "Got it — may I have your name and best callback number?" },
      { label: "Lead saved", badge: "Lead captured → Dashboard", ai: "Details sent to your team." },
    ],
  },
  appointment: {
    title: "Appointment booked",
    desc: "Interactive demo — scheduling handled on the call, synced to calendar.",
    frames: [
      { label: "Request", caller: "Can I book a service visit for Thursday?" },
      { label: "Checking", ai: "Thursday at 2pm is available. Shall I book that?" },
      { label: "Booked", badge: "Calendar updated", ai: "You're confirmed for Thursday at 2pm." },
    ],
  },
};

function DemoCard({ id }: { id: DemoId }) {
  const demo = DEMOS[id];
  const [frameIdx, setFrameIdx] = useState(0);
  const frame = demo.frames[frameIdx];

  useEffect(() => {
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;
    const timer = window.setInterval(() => {
      setFrameIdx((i) => (i + 1) % demo.frames.length);
    }, 3200);
    return () => window.clearInterval(timer);
  }, [demo.frames.length]);

  return (
    <article className="premium-video-card">
      <div className="premium-video-thumb premium-video-thumb--interactive">
        <div className="premium-demo-ui">
          <div className="premium-demo-status">{frame.label}</div>
          <AnimatePresence mode="wait">
            <motion.div
              key={frameIdx}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.35 }}
              className="premium-demo-messages"
            >
              {frame.caller && (
                <div className="premium-demo-bubble premium-demo-bubble--caller">{frame.caller}</div>
              )}
              {frame.ai && (
                <div className="premium-demo-bubble premium-demo-bubble--ai">{frame.ai}</div>
              )}
              {frame.badge && <div className="premium-demo-badge">{frame.badge}</div>}
            </motion.div>
          </AnimatePresence>
          <div className="premium-demo-wave" aria-hidden>
            {Array.from({ length: 9 }).map((_, i) => (
              <span key={i} style={{ animationDelay: `${i * 0.08}s` }} />
            ))}
          </div>
        </div>
        <span className="premium-demo-tag">Interactive demo</span>
      </div>
      <div className="premium-video-card-body">
        <h4>{demo.title}</h4>
        <p>{demo.desc}</p>
      </div>
    </article>
  );
}

export function CallFlowDemoGrid() {
  return (
    <div className="premium-video-grid">
      <DemoCard id="answer" />
      <DemoCard id="lead" />
      <DemoCard id="appointment" />
    </div>
  );
}
