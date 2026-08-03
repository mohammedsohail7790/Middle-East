export const TICKER_ITEMS = [
  { emoji: "📞", strong: "1 emergency call", text: "covers months of service" },
  { emoji: "🤖", strong: "100% AI", text: "— zero live agents" },
  { emoji: "⚡", strong: "under 15 minutes", text: "to go live" },
  { emoji: "🌎", strong: "English + Spanish", text: "on every plan" },
  { emoji: "🛡️", strong: "never charged", text: "for spam calls" },
  { emoji: "📅", strong: "automatically", text: "books appointments" },
  { emoji: "🔗", strong: "5,000+ apps", text: "connected" },
  { emoji: "🎙️", strong: "Call recording", text: "opt-in, off by default" },
];

export const VALUE_PROPS = [
  {
    num: "01",
    title: "Plumbing Emergency",
    desc: "Average emergency job: $800–$2,400. Essential plan costs $39/month. One call = 20+ months covered.",
  },
  {
    num: "02",
    title: "Real Estate Consultation",
    desc: "One home sale: $10,000+ commission. A single missed showing request can cost you everything.",
  },
  {
    num: "03",
    title: "Law Firm Intake",
    desc: "Average case: $3,000–$25,000. Professional plan at $149/month pays for itself in hours.",
  },
];

export const FEATURES = [
  { icon: "📞", iconClass: "feat-icon-blue", title: "24/7 Answering Service", desc: "Instant answer every time — no hold music, no voicemail. 365 days a year including holidays." },
  { icon: "📅", iconClass: "feat-icon-green", title: "Appointment Scheduling", desc: "Books, reschedules, and cancels automatically. Syncs with Google Calendar, Calendly, Outlook." },
  { icon: "🎯", iconClass: "feat-icon-orange", title: "Lead Capture & Qualification", desc: "Custom questions, instant scoring. Only talk to the calls worth your time." },
  { icon: "✉️", iconClass: "", title: "Message Taking", desc: "Full transcript + summary to your email inbox within seconds of every call ending." },
  { icon: "🔀", iconClass: "feat-icon-blue", title: "Smart Call Routing", desc: "Emergency? Live transfer to your on-call team plus an instant email alert. Routine? Logged and handled automatically." },
  { icon: "🛡️", iconClass: "feat-icon-green", title: "Spam Blocking", desc: "Drops spam in seconds. You never pay for robocalls or solicitors. Zero tolerance." },
  { icon: "🌎", iconClass: "feat-icon-orange", title: "Bilingual (EN + ES)", desc: "English and Spanish on every plan. Auto-detects caller language. Never lose a customer." },
  { icon: "🌙", iconClass: "", title: "After Hours Rules", desc: "Custom greetings and routing for after-hours, weekends, and holidays. You set the rules." },
  { icon: "🔗", iconClass: "feat-icon-blue", title: "5,000+ Integrations", desc: "Native HubSpot, Calendly, Google Calendar. Plus Zapier for Salesforce and everything else." },
];

export const HOW_IT_WORKS = [
  { n: "1", title: "Sign Up & Choose Your Plan", desc: "Start your 14-day free trial — no credit card. Pick your plan based on call volume. Upgrade anytime." },
  { n: "2", title: "Configure Your AI Receptionist", desc: "Set your greeting, business hours, qualification questions, and escalation rules during onboarding. No coding required." },
  { n: "3", title: "Connect Your Calendar & CRM", desc: "Link Google Calendar, Calendly, HubSpot, or 5,000+ apps via Zapier. When the AI books or captures — it syncs automatically." },
  { n: "4", title: "Forward Your Phone Number", desc: "Forward calls from any carrier in 5–15 minutes. Or port your number to us free." },
  { n: "5", title: "Go Live — Never Miss a Call", desc: "Test with a few calls, then you're live. Every call answered, every lead captured, every appointment booked — automatically." },
];

export const PRICING_PLANS = [
  {
    id: "essential",
    name: "Essential",
    price: 39,
    mins: "250 min included · $0.20/min overage",
    cta: "Start Free Trial",
    ctaClass: "btn-blue",
    popular: false,
    features: [
      { text: "24/7 AI Receptionist", ok: true },
      { text: "Bilingual EN + ES", ok: true },
      { text: "Appointment Booking", ok: true },
      { text: "Email Summaries", ok: true },
      { text: "Spam Blocking", ok: true },
      { text: "CRM Integration", ok: false },
      { text: "Custom AI Voice", ok: false },
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 149,
    mins: "750 min included · $0.15/min overage",
    cta: "Start Free Trial",
    ctaClass: "btn-blue",
    popular: true,
    features: [
      { text: "Everything in Essential", ok: true },
      { text: "CRM Integration (HubSpot, Salesforce)", ok: true },
      { text: "Native Calendar Sync", ok: true },
      { text: "Custom AI Voice Training", ok: true },
      { text: "3 Phone Numbers", ok: true },
      { text: "HIPAA Compliance", ok: false },
    ],
  },
];

export const FAQ_ITEMS = [
  { q: "What is Call IQ and how does it work?", a: "Call IQ is a 100% automated AI receptionist. When a customer calls your number, our AI answers instantly. It listens, understands natural speech, asks qualifying questions, schedules appointments, answers FAQs, and takes messages. No live agents. No humans." },
  { q: "Do you offer a free trial?", a: "Yes. 14-day free trial on Essential and Professional. No credit card required. Try free. If you don't love it, cancel. You never pay a cent." },
  { q: "Do I pay for spam calls?", a: "No. Our AI detects and drops spam within seconds. You are never charged for spam or robocalls." },
  { q: "Are you HIPAA compliant?", a: "Not at this time. HIPAA compliance and BAA support are not available on Essential or Professional plans." },
];
