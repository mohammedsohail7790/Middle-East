"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

/**
 * Mirrors halla_main.js's own setLang(): the SPA sets `lang`/`dir` on
 * <html> (never React state, since this whole page is portaled into a
 * plain-JS-driven static page — see MarketingPremiumLayer), so this
 * component watches that attribute directly instead of expecting a
 * locale prop that doesn't exist anywhere in this render tree.
 */
function useHtmlLang(): "en" | "ar" {
  const [lang, setLang] = useState<"en" | "ar">(() =>
    typeof document !== "undefined" && document.documentElement.lang === "ar" ? "ar" : "en"
  );

  useEffect(() => {
    const html = document.documentElement;
    const sync = () => setLang(html.lang === "ar" ? "ar" : "en");
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(html, { attributes: true, attributeFilter: ["lang"] });
    return () => observer.disconnect();
  }, []);

  return lang;
}

const SCENARIOS = [
  {
    id: "peak",
    label: { en: "Peak hours", ar: "ساعات الذروة" },
    title: { en: "Busy during peak hours", ar: "الانشغال خلال ساعات الذروة" },
    without: {
      en: ["Customer calls", "Team is on a job site", "Nobody answers", "Customer calls a competitor", "Revenue lost"],
      ar: ["يتصل العميل", "الفريق في موقع العمل", "لا أحد يرد", "يتصل العميل بمنافس", "إيرادات ضائعة"],
    },
    with: {
      en: ["Customer calls", "Halla answers in 2 seconds", "Need is understood", "Lead captured", "You follow up and win"],
      ar: ["يتصل العميل", "تردّ هالة خلال ثانيتين", "يتم فهم الحاجة", "يتم تسجيل العميل المحتمل", "تتابع وتفوز بالصفقة"],
    },
  },
  {
    id: "afterhours",
    label: { en: "After hours", ar: "بعد ساعات العمل" },
    title: { en: "After business hours", ar: "بعد ساعات العمل الرسمية" },
    without: {
      en: ["Call comes in at 9pm", "Office is closed", "Voicemail is ignored", "Opportunity lost"],
      ar: ["تصل مكالمة الساعة 9 مساءً", "المكتب مغلق", "يتم تجاهل البريد الصوتي", "الفرصة ضائعة"],
    },
    with: {
      en: ["Halla answers 24/7", "Takes the message", "Books if appropriate", "You wake up to details"],
      ar: ["تردّ هالة على مدار الساعة", "تسجّل الرسالة", "تحجز الموعد إذا لزم الأمر", "تستيقظ لتجد كل التفاصيل جاهزة"],
    },
  },
  {
    id: "voicemail",
    label: { en: "Voicemail trap", ar: "فخ البريد الصوتي" },
    title: { en: "The voicemail trap", ar: "فخ البريد الصوتي" },
    without: {
      en: ["Missed call", "Customer waits", "Goes to voicemail", "Calls a competitor", "Lost opportunity"],
      ar: ["مكالمة فائتة", "ينتظر العميل", "تتحول إلى بريد صوتي", "يتصل بمنافس", "فرصة ضائعة"],
    },
    with: {
      en: ["Customer calls", "Halla answers instantly", "Customer gets help", "Lead captured", "You follow up and win"],
      ar: ["يتصل العميل", "تردّ هالة فورًا", "يحصل العميل على المساعدة", "يتم تسجيل العميل المحتمل", "تتابع وتفوز بالصفقة"],
    },
  },
] as const;

const COPY = {
  en: {
    label: "The difference",
    heading: "What happens when you miss a call?",
    lead: "Every unanswered call is revenue walking away. Pick a real scenario — same customer, two very different outcomes.",
    without: "Without Halla AI",
    with: "With Halla AI",
    vs: "vs",
  },
  ar: {
    label: "الفرق",
    heading: "ماذا يحدث عندما تفوّت مكالمة؟",
    lead: "كل مكالمة لا يتم الرد عليها هي إيرادات ضائعة. اختر سيناريو حقيقيًا — نفس العميل، نتيجتان مختلفتان تمامًا.",
    without: "بدون هالة AI",
    with: "مع هالة AI",
    vs: "مقابل",
  },
} as const;

function FlowColumn({
  title,
  steps,
  variant,
  lang,
}: {
  title: string;
  steps: readonly string[];
  variant: "without" | "with";
  lang: "en" | "ar";
}) {
  // RTL flips which edge each column visually enters from, so the
  // "without" column (visually first in a right-to-left reading order)
  // should still slide in from its own leading edge, not always the left.
  const entersFromLeft = lang === "ar" ? variant === "with" : variant === "without";

  return (
    <div className={`premium-outcome-col premium-outcome-col--${variant}`}>
      <h3>{title}</h3>
      <ol className="premium-outcome-steps">
        {steps.map((step, i) => (
          <motion.li
            key={step}
            initial={{ opacity: 0, x: entersFromLeft ? -12 : 12 }}
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
  const lang = useHtmlLang();
  const copy = COPY[lang];
  const [activeId, setActiveId] = useState<(typeof SCENARIOS)[number]["id"]>("peak");
  const scenario = SCENARIOS.find((s) => s.id === activeId) ?? SCENARIOS[0];

  return (
    <section className="premium-section premium-section--muted" aria-labelledby="premium-outcome-heading">
      <div className="container">
        <div className="premium-label">{copy.label}</div>
        <h2 id="premium-outcome-heading">{copy.heading}</h2>
        <p className="lead">{copy.lead}</p>

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
              {s.label[lang]}
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
            <p className="premium-outcome-scenario-title">{scenario.title[lang]}</p>
            <FlowColumn title={copy.without} steps={scenario.without[lang]} variant="without" lang={lang} />
            <div className="premium-outcome-divider" aria-hidden>
              <span>{copy.vs}</span>
            </div>
            <FlowColumn title={copy.with} steps={scenario.with[lang]} variant="with" lang={lang} />
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  );
}
