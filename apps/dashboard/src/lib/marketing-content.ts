export const TICKER_ITEMS = [
  { icon: "phone", strong: "1 emergency call", text: "covers months of service" },
  { icon: "bot", strong: "100% AI", text: "— zero live agents" },
  { icon: "zap", strong: "under 15 minutes", text: "to go live" },
  { icon: "languages", strong: "Arabic + English", text: "on every plan" },
  { icon: "shield", strong: "never charged", text: "for spam calls" },
  { icon: "calendar", strong: "automatically", text: "books appointments" },
  { icon: "map-pin", strong: "UAE number", text: "own local presence" },
  { icon: "mic", strong: "Call recording", text: "opt-in, off by default" },
];

export const VALUE_PROPS = [
  {
    num: "01",
    title: "AC & Maintenance Emergency",
    desc: "Average emergency call-out: AED 800–2,200. Essential plan costs AED 149/month. One call covers 5+ months.",
  },
  {
    num: "02",
    title: "Real Estate Viewing Request",
    desc: "One villa or apartment sale: AED 30,000+ commission. A single missed viewing request can cost you everything.",
  },
  {
    num: "03",
    title: "Clinic & Salon Booking",
    desc: "A no-show slot is lost revenue every time. Halla AI confirms, reminds, and rebooks — automatically, in Arabic or English.",
  },
];

export const FEATURES = [
  { icon: "phone", iconClass: "feat-icon-blue", title: "24/7 Answering Service", desc: "Instant answer every time — no hold music, no voicemail. 365 days a year including holidays." },
  { icon: "calendar", iconClass: "feat-icon-green", title: "Appointment Scheduling", desc: "Books, reschedules, and cancels appointments directly in your workspace — no calendar left unattended." },
  { icon: "target", iconClass: "feat-icon-orange", title: "Lead Capture & Qualification", desc: "Custom questions, instant scoring. Only talk to the calls worth your time." },
  { icon: "mail", iconClass: "", title: "Message Taking", desc: "Full transcript + summary in your dashboard within seconds of every call ending." },
  { icon: "shuffle", iconClass: "feat-icon-blue", title: "Smart Call Routing", desc: "Emergency? Live transfer to your on-call team plus an instant alert. Routine? Logged and handled automatically." },
  { icon: "shield", iconClass: "feat-icon-green", title: "Spam Blocking", desc: "Drops spam in seconds. You never pay for robocalls or solicitors. Zero tolerance." },
  { icon: "languages", iconClass: "feat-icon-orange", title: "Bilingual (Arabic + English)", desc: "Fluent in both, on every plan. Auto-detects caller language mid-call. Never lose a customer to a language gap." },
  { icon: "moon", iconClass: "", title: "After Hours Rules", desc: "Custom greetings and routing for after-hours, weekends, and holidays. You set the rules." },
  { icon: "map-pin", iconClass: "feat-icon-blue", title: "Local UAE Number", desc: "Answer on a real UAE phone number from day one — no international forwarding required." },
];

export const HOW_IT_WORKS = [
  { n: "1", title: "Sign Up & Choose Your Plan", desc: "Start your 14-day free trial — no credit card. Pick your plan based on call volume. Upgrade anytime." },
  { n: "2", title: "Configure Your AI Receptionist", desc: "Set your greeting, business hours, qualification questions, and escalation rules during onboarding. No coding required." },
  { n: "3", title: "Add Your Knowledge Base", desc: "Give the AI your services, hours, and pricing so it answers questions the way your team would — in Arabic or English." },
  { n: "4", title: "Forward Your Phone Number", desc: "Forward calls from any carrier in 5–15 minutes, or get a new UAE number provisioned for you." },
  { n: "5", title: "Go Live — Never Miss a Call", desc: "Test with a few calls, then you're live. Every call answered, every lead captured, every appointment booked — automatically." },
];

export const PRICING_PLANS = [
  {
    id: "essential",
    name: "Essential",
    price: 149,
    currency: "AED",
    mins: "250 min included · AED 0.75/min overage",
    cta: "Start Free Trial",
    ctaClass: "btn-blue",
    popular: false,
    features: [
      { text: "24/7 AI Receptionist", ok: true },
      { text: "Bilingual Arabic + English", ok: true },
      { text: "Appointment Booking", ok: true },
      { text: "Call Summaries in Dashboard", ok: true },
      { text: "Spam Blocking", ok: true },
      { text: "Custom AI Voice", ok: false },
      { text: "Multiple Phone Numbers", ok: false },
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 549,
    currency: "AED",
    mins: "750 min included · AED 0.55/min overage",
    cta: "Start Free Trial",
    ctaClass: "btn-blue",
    popular: true,
    features: [
      { text: "Everything in Essential", ok: true },
      { text: "Custom AI Voice Training", ok: true },
      { text: "3 Phone Numbers", ok: true },
      { text: "Priority Support", ok: true },
      { text: "Advanced Analytics", ok: true },
      { text: "Dedicated Onboarding", ok: false },
    ],
  },
];

export const FAQ_ITEMS = [
  { q: "What is Halla AI and how does it work?", a: "Halla AI is a 100% automated AI receptionist. When a customer calls your number, our AI answers instantly. It listens, understands natural speech in Arabic or English, asks qualifying questions, schedules appointments, answers FAQs, and takes messages. No live agents. No humans." },
  { q: "Do you offer a free trial?", a: "Yes. 14-day free trial on Essential and Professional. No credit card required. Try free. If you don't love it, cancel. You never pay a cent." },
  { q: "Do I pay for spam calls?", a: "No. Our AI detects and drops spam within seconds. You are never charged for spam or robocalls." },
  { q: "Can I use my existing UAE phone number?", a: "Yes — forward calls from any carrier to Halla AI in 5–15 minutes, or we can provision a new local UAE number for you at signup." },
];
