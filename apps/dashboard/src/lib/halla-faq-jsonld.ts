// FAQPage structured data for the marketing site. Mirrors the first six items of the FAQ page in public/marketing-body.html; keep the two in sync.
export const hallaFaqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What services does Halla AI provide?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Halla AI provides three core pillars of artificial intelligence implementation for businesses across the GCC and international markets: AI Consultancy: Strategic digital transformation, operations optimization, and custom AI architecture for enterprises. AI Receptionist: A 24/7 multi-lingual voice and WhatsApp front-desk agent that answers calls, books appointments, and captures leads. AI Business Automation: End-to-end backend integrations, including automated CRM logging, invoicing workflows, and calendar synchronization."
      }
    },
    {
      "@type": "Question",
      "name": "What is involved in Halla AI's consultancy engagements?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Our consultancy practice audits your existing operations, client acquisition funnels, and brand visibility. We design custom AI roadmaps, build proprietary automation pipelines, and integrate secure LLM systems tailored to regional data compliance and global business frameworks."
      }
    },
    {
      "@type": "Question",
      "name": "How does the Halla AI Receptionist handle calls and messages?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "It answers inbound phone calls and WhatsApp messages instantly, 24/7/365, with zero hold music and no human agents. It automatically detects the caller's language and switches seamlessly across 7 supported languages: English, Arabic (KSA Dialect), Urdu, French, Mandarin, Russian, and Farsi."
      }
    },
    {
      "@type": "Question",
      "name": "Does the AI receptionist book appointments directly?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Yes. It checks your real-time availability and schedules, reschedules, or cancels appointments directly in Google Calendar, Outlook, or Calendly."
      }
    },
    {
      "@type": "Question",
      "name": "What systems can Halla AI automate and connect to?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Halla AI integrates natively with leading CRMs (such as HubSpot, Salesforce, and Pipedrive) and calendar systems. For custom workflows, it links seamlessly to 5,000+ apps via Zapier and custom webhooks to handle automated invoicing, lead scoring, and team notifications."
      }
    },
    {
      "@type": "Question",
      "name": "Which regions and data standards does Halla AI support?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "While built with deep specialization for the GCC market, Halla AI scales globally. Databases, gateways, and voice processing pipelines are configured to respect regional data residency requirements (such as local GCC data protection frameworks) as well as international compliance standards."
      }
    }
  ]
} as const;
