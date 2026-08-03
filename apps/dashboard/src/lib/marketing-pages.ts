export { TICKER_ITEMS, VALUE_PROPS, FEATURES, HOW_IT_WORKS, PRICING_PLANS, FAQ_ITEMS } from "./marketing-content";

export const PRICING_PLANS_FULL = [
  {
    id: "essential",
    name: "Essential",
    price: 39,
    mins: "250 min · $0.20/min overage",
    cta: "Start Free Trial",
    ctaClass: "btn-blue",
    popular: false,
    features: [
      { text: "24/7 AI receptionist", ok: true },
      { text: "Bilingual EN + ES", ok: true },
      { text: "Call forwarding", ok: true },
      { text: "Full call transcripts", ok: true },
      { text: "Appointment booking", ok: true },
      { text: "Email summaries", ok: true },
      { text: "Live chat (7am–3pm ET)", ok: true },
      { text: "1 phone number", ok: true },
      { text: "CRM integration", ok: false },
      { text: "Native calendar sync", ok: false },
      { text: "Custom AI voice", ok: false },
      { text: "HIPAA compliance", ok: false },
    ],
  },
  {
    id: "professional",
    name: "Professional",
    price: 149,
    mins: "750 min · $0.15/min overage",
    cta: "Start Free Trial",
    ctaClass: "btn-blue",
    popular: true,
    features: [
      { text: "Everything in Essential", ok: true },
      { text: "CRM (HubSpot, Salesforce, Pipedrive)", ok: true },
      { text: "Google Calendar + Outlook sync", ok: true },
      { text: "Custom AI voice training", ok: true },
      { text: "3 phone numbers", ok: true },
      { text: "HIPAA compliance", ok: false },
      { text: "Dedicated account manager", ok: false },
    ],
  },
];

export const FAQ_FULL = [
  { q: "What is Call IQ and how does it work?", a: "Call IQ is a 100% automated AI receptionist. When a customer calls your number, our AI answers instantly. It listens, understands natural speech, asks qualifying questions, schedules appointments, answers FAQs, and takes messages. No live agents. No humans." },
  { q: "Do you use live agents?", a: "No. Zero live agents. Every call is handled entirely by our AI. If a call requires a human, the AI takes a detailed message and immediately notifies you by email." },
  { q: "Do I have to tell callers they're speaking with AI?", a: "Yes, for commercial use in most US jurisdictions. AI disclosure is on by default for every account and plays at the start of every call. You can customize the wording, but disabling it requires acknowledging a compliance warning in your dashboard." },
  { q: "Do you offer a free trial?", a: "Yes. 14-day free trial on Essential and Professional. No credit card required." },
  { q: "Is there a setup fee?", a: "No. Setup is free. You can be live in under 15 minutes." },
  { q: "Do I pay for spam calls?", a: "No. Our AI detects and drops spam within seconds. You are never charged for spam or robocalls." },
  { q: "Are you HIPAA compliant?", a: "Not at this time. HIPAA compliance and BAA support are not available on Essential or Professional plans." },
  { q: "Do you offer call recording?", a: "Yes — as an opt-in feature, off by default (available on the Professional plan). Turn it on in Compliance Settings, where you'll also find a recording announcement and consent prompt. Recording laws vary by state; consult your legal advisor before enabling." },
  { q: "Can I cancel anytime?", a: "Yes. Monthly plans: 7 days' notice. Annual plans: non-refundable after 14 days, but you can cancel future renewal." },
];

export const FEATURES_CORE = [
  { icon: "📞", iconClass: "feat-icon-blue", title: "Answering Service", desc: "24/7/365. Never miss a call again." },
  { icon: "📅", iconClass: "feat-icon-green", title: "Scheduling & Booking", desc: "Book, reschedule, cancel automatically." },
  { icon: "✉️", iconClass: "feat-icon-orange", title: "Message Taking", desc: "Detailed messages straight to your email." },
  { icon: "🎯", iconClass: "feat-icon-blue", title: "Lead Capture", desc: "Custom questions, route to CRM." },
  { icon: "🔀", iconClass: "feat-icon-green", title: "Call Routing", desc: "Route by intent, time of day, urgency." },
  { icon: "🛡️", iconClass: "feat-icon-orange", title: "Spam Blocking", desc: "Auto-detect spam. Never pay for it." },
  { icon: "🌎", iconClass: "feat-icon-blue", title: "Bilingual EN + ES", desc: "Auto-detect language. Seamless." },
  { icon: "💻", iconClass: "feat-icon-green", title: "Browser Dashboard", desc: "Mobile-responsive. No app needed." },
  { icon: "💬", iconClass: "feat-icon-orange", title: "Live Chat Support", desc: "7am–3pm ET, Mon–Fri. Real help." },
];

export const FEATURES_PRO = [
  { icon: "🔗", iconClass: "feat-icon-blue", title: "CRM Integration", desc: "HubSpot, Salesforce + 5,000+ via Zapier." },
  { icon: "📆", iconClass: "feat-icon-blue", title: "Native Calendar Sync", desc: "Google Calendar, Outlook, Calendly." },
  { icon: "🎙️", iconClass: "feat-icon-blue", title: "Custom AI Voice", desc: "Match your brand voice and terminology." },
];

export const INTEGRATION_GROUPS = [
  { title: "📞 Phone Carriers", items: ["RingCentral", "Nextiva", "Vonage", "Google Voice", "Verizon", "AT&T", "T-Mobile", "Grasshopper", "8x8", "Ooma"] },
  { title: "📋 CRM Platforms", items: ["HubSpot", "Salesforce", "Pipedrive", "Zoho CRM", "Copper", "Follow Up Boss", "Clio", "MyCase"] },
  { title: "📅 Calendars & Booking", items: ["Google Calendar", "Outlook", "Calendly", "Acuity", "Setmore", "Square Appts", "Vagaro", "Mindbody"] },
  { title: "🏠 Field Service", items: ["ServiceTitan", "Housecall Pro", "Jobber", "Buildium", "AppFolio", "Yardi"] },
];

export const BLOG_POSTS = [
  { emoji: "🤖", date: "Mar 15, 2025", title: "AI vs. Human Receptionist: The 2025 Cost-Benefit Analysis", desc: "We crunch the numbers. For 80% of small businesses, pure AI wins.", href: "/ai-vs-human" },
  { emoji: "🚨", date: "Mar 1, 2025", title: "How to Handle Emergency Calls with an AI Receptionist", desc: "Emergency calls require speed and empathy. Here is our proven script.", href: "/blog/emergency-calls" },
  { emoji: "⚖️", date: "Feb 10, 2025", title: "The Legal Guide to AI Disclosure", desc: "FCC, state laws, and best practices. Stay compliant.", href: "/blog/ai-disclosure" },
  { emoji: "🔗", date: "Feb 20, 2025", title: "7 CRM Integrations That Will Double Your Lead Conversion", desc: "Zapier + Call IQ + these CRMs = automatic follow-up.", href: "/blog/crm-integrations" },
  { emoji: "💲", date: "Jan 25, 2025", title: "Why Per-Minute Pricing Is Fairer Than Per-Call", desc: "A detailed breakdown with real customer examples.", href: "/blog/per-minute-pricing" },
  { emoji: "📲", date: "Guide", title: "Call Forwarding Guides for Every Carrier", desc: "Step-by-step for RingCentral, Nextiva, Vonage, Verizon, AT&T, and more.", href: "/blog/forwarding-guide" },
];

export const INDUSTRIES_LIST = [
  { slug: "hvac", icon: "❄️", title: "HVAC", desc: "Emergency dispatch, seasonal routing" },
  { slug: "plumbing", icon: "🔧", title: "Plumbers", desc: "24/7 emergencies, job dispatch" },
  { slug: "electrical", icon: "⚡", title: "Electricians", desc: "Emergency triage, service booking" },
  { slug: "landscaping", icon: "🌿", title: "Landscapers", desc: "Seasonal routing, estimate booking" },
  { slug: "roofing", icon: "🏠", title: "Roofers", desc: "Storm damage, inspection scheduling" },
  { slug: "pestcontrol", icon: "🐜", title: "Pest Control", desc: "Emergency removal, recurring plans" },
  { slug: "movers", icon: "🚛", title: "Movers", desc: "Local/long-distance, estimate booking" },
  { slug: "pool-services", icon: "🏊", title: "Pool Services", desc: "Maintenance scheduling, emergency repairs" },
  { slug: "floor-installers", icon: "🪚", title: "Floor Installers", desc: "Estimate booking, project scheduling" },
  { slug: "cleaning", icon: "🧹", title: "Home Cleaning", desc: "Quote requests, recurring bookings" },
];

export const SOLUTIONS: Record<string, { title: string; subtitle: string; body: string[]; bullets: string[] }> = {
  answering: {
    title: "AI Answering Service",
    subtitle: "Never miss a customer call again.",
    body: ["Call IQ answers every call in under 2 rings — 24/7/365. No hold music. No voicemail. Every caller gets a professional, human-sounding AI receptionist."],
    bullets: ["Instant answer, every time", "Custom greeting with your business name", "After-hours and holiday coverage included", "Spam calls dropped — never charged"],
  },
  scheduling: {
    title: "AI Scheduling & Booking",
    subtitle: "Book, reschedule, and cancel — automatically.",
    body: ["Your AI reads your live calendar availability and books appointments while the caller is still on the line."],
    bullets: ["Google Calendar, Outlook, Calendly sync", "Emails booking confirmation to the caller", "Handles reschedules and cancellations", "Timezone-aware scheduling"],
  },
  messages: {
    title: "Message Taking",
    subtitle: "Detailed messages delivered in seconds.",
    body: ["When a human callback is needed, Call IQ captures every detail and sends a full transcript + summary straight to your email."],
    bullets: ["Structured message templates", "Urgency flagging", "Instant email delivery", "Searchable in your dashboard"],
  },
  leads: {
    title: "Lead Capture & Qualification",
    subtitle: "Only talk to calls worth your time.",
    body: ["Custom qualification questions ensure you know exactly what the caller needs before you ever pick up the phone."],
    bullets: ["Custom question flows", "Lead scoring", "CRM sync (Professional+)", "Hot lead email alerts"],
  },
  routing: {
    title: "Smart Call Routing",
    subtitle: "Right call, right person, right now.",
    body: ["Route by urgency, time of day, intent, or department. Emergencies go to your on-call tech. Routine calls get logged and handled."],
    bullets: ["Emergency escalation via live transfer", "Department-based routing", "After-hours rules", "On-call rotation support"],
  },
  multilingual: {
    title: "Multi-Lingual Support",
    subtitle: "English and Spanish on every plan.",
    body: ["Call IQ auto-detects the caller's language and switches seamlessly. Never lose a customer because of a language barrier."],
    bullets: ["Auto language detection", "English + Spanish included", "Up to 4 languages on Professional", "Natural bilingual conversations"],
  },
  afterhours: {
    title: "After Hours Coverage",
    subtitle: "Your business never sleeps — even when you do.",
    body: ["Custom after-hours greetings, routing rules, and emergency escalation. The AI mentions after-hours but still captures every lead."],
    bullets: ["Custom after-hours greeting", "Emergency vs routine routing", "Weekend and holiday rules", "24/7 without shift management"],
  },
  screening: {
    title: "Call Screening",
    subtitle: "Filter spam. Prioritize real customers.",
    body: ["Call IQ screens every call, drops robocalls and solicitors in seconds, and flags high-value callers for immediate attention."],
    bullets: ["Spam detection — never charged", "Robocall blocking", "Priority caller flagging", "Custom screening questions"],
  },
};

export interface IndustryPageContent {
  title: string;
  subtitle: string;
  intro: string;
  /** Short narrative subsections, e.g. "Calls arrive during X" / "Y while our AI handles the phone" */
  sections?: { heading: string; body: string }[];
  /** "What sets Call IQ apart" bullet list */
  differentiators?: string[];
  /** Intro paragraph for the call-flow section */
  callFlowIntro?: string;
  /** Structured qualification questions the AI asks */
  qualificationQuestions?: string[];
  /** Routing/prioritization note */
  routingNote?: string;
  /** Integration/notification note */
  integrationNote?: string;
  faqs?: { q: string; a: string }[];
  useCases: string[];
}

export const INDUSTRY_PAGES: Record<string, IndustryPageContent> = {
  hvac: {
    title: "HVAC",
    subtitle: "Keep Your Schedule Hot. Not Your Customers.",
    intro: "Call IQ provides an intelligent AI receptionist that answers, screens, and dispatches HVAC technicians 24/7 — built specifically for heating, ventilation, and air conditioning contractors.",
    sections: [
      { heading: "Emergency calls arrive when it's 100 degrees and your phone won't stop ringing", body: "Calls come in when you're in an attic, crawling under a house, or charging a system. Call IQ captures emergency details, books maintenance windows, and sends job summaries instantly to your phone. Our AI handles routine questions about filter changes, system types, seasonal tune-ups, and financing options." },
      { heading: "Fix furnaces while our AI handles the phone", body: "Call IQ greets every homeowner professionally and captures essential job details through structured intake questions. By collecting key information upfront — AC or furnace issue, temperature differential, unusual noises, filter status, system age — the system helps identify and prioritize emergency calls based on your response zones and license types." },
    ],
    differentiators: [
      "Custom AI configuration with prompts tailored specifically to your service categories (AC repair, furnace repair, heat pump, ductless mini-split, duct cleaning)",
      "True 24/7 coverage with intelligent call routing based on seasonality and temperature urgency",
      "Complete call handling including emergency dispatch, maintenance agreement sign-ups, and filter subscription management",
      "Integration with job management software like ServiceTitan, Housecall Pro, and Jobber",
      "Dedicated onboarding support ensuring your AI understands your specific service area and seasonal pricing",
      "Professional representation that adapts to your brand voice and customer communication style",
    ],
    callFlowIntro: "Custom call flows built for HVAC contractors. Call IQ customizable call flows serve as the technical framework that consistently executes your lead qualification and dispatch routing protocols. The routing logic evaluates the caller's intent — no AC in summer, no heat in winter, poor airflow, thermostat issues, refrigerant leak — and applies your predefined criteria to determine appropriate next steps.",
    qualificationQuestions: [
      "Current indoor temperature and how long the system has been down",
      "Thermostat settings and battery status",
      "Air filter condition and last replacement date",
      "Unusual sounds (banging, hissing, clicking)",
      "Emergency indicators (gas smell, frozen coils, burning odor)",
    ],
    routingNote: "Intelligent routing ensures no-heat calls in freezing weather receive immediate callback scheduling, while seasonal tune-up inquiries are directed to the appropriate service window based on your availability.",
    integrationNote: "Every interaction generates detailed call summaries with notifications delivered through your preferred channels — email, Slack, text. The system integrates directly with your job management software, maintaining accurate records without manual data entry. For existing customers, new service requests are automatically added to their equipment history. For new prospects, the system creates a lead record with complete system details and contact information.",
    faqs: [
      { q: "How does Call IQ handle seasonal demand spikes?", a: "The AI scales automatically. During heat waves or cold snaps, it handles hundreds of simultaneous calls without busy signals. You define priority rules (elderly customers first, no-heat/no-AC emergencies first) and the AI follows them consistently." },
      { q: "Can the AI diagnose basic HVAC problems over the phone?", a: "The AI can guide homeowners through basic troubleshooting (checking thermostat batteries, resetting breakers, changing filters). If these steps resolve the issue, the AI books a follow-up maintenance call. If not, it escalates for dispatch." },
      { q: "How does the AI handle refrigerant and EPA compliance questions?", a: "The AI knows your company's policies on refrigerant handling and can explain EPA compliance requirements. For specific technical questions about pressures or charging procedures, the AI escalates for a callback from a certified technician." },
      { q: "Can the AI sell maintenance agreements over the phone?", a: "Yes. The AI can explain your maintenance plan options (tiered levels, included services, pricing), answer common questions, and sign up new customers by collecting payment information securely." },
      { q: "What if a customer has a carbon monoxide concern?", a: "The AI is trained to recognize CO-related keywords (carbon monoxide alarm, dizzy, headache, nausea). These calls are flagged as highest priority and trigger immediate notification to your team. The AI instructs the homeowner to evacuate and call the fire department if alarms are sounding." },
      { q: "Can the AI handle thermostat warranty and compatibility questions?", a: "The AI can check basic compatibility when integrated with your product database. For specific questions about smart thermostat installation or wiring, it collects the details and schedules a consultation." },
      { q: "How does the AI handle after-hours emergency pricing?", a: "You define your after-hours rates (time and a half, double time, flat emergency fee). The AI communicates these rates clearly before dispatching, so customers understand pricing before you roll a truck." },
    ],
    useCases: ["AC emergency triage and dispatch", "Seasonal maintenance booking", "Filter replacement scheduling", "After-hours emergency SMS to on-call"],
  },
  plumbing: {
    title: "Plumbers",
    subtitle: "Stop Leaks. Not Leads. Never Miss an Emergency Call Again.",
    intro: "Call IQ provides an intelligent AI receptionist that answers, screens, and dispatches plumbers 24/7 — built specifically for plumbing contractors and drain specialists.",
    sections: [
      { heading: "Emergency calls arrive when you're knee-deep in a flooded basement", body: "Calls come in when you're snaking a drain, replacing a water heater, or repairing a burst pipe. Call IQ captures emergency details, books service windows, and sends job summaries instantly to your phone. Our AI handles routine questions about service areas, flat-rate pricing, after-hours fees, and availability." },
      { heading: "Fix pipes while our AI handles the phone", body: "Call IQ greets every homeowner professionally and captures essential job details through structured intake questions. By collecting key information upfront — leak location, water shut-off status, pipe material, access details, urgency level — the system helps identify and prioritize emergency calls based on your response zones and license types." },
    ],
    differentiators: [
      "Custom AI configuration with prompts tailored specifically to your service categories (repair, replacement, maintenance, emergency)",
      "True 24/7 coverage with intelligent call routing based on job urgency and service type",
      "Complete call handling including emergency dispatch coordination, estimate requests, and appointment scheduling",
      "Integration with job management software like ServiceTitan, Housecall Pro, and Jobber",
      "Dedicated onboarding support ensuring your AI understands your specific service area and pricing model",
      "Professional representation that adapts to your brand voice and customer communication style",
    ],
    callFlowIntro: "Custom call flows built for plumbing contractors. Call IQ customizable call flows serve as the technical framework that consistently executes your lead qualification and dispatch routing protocols. The routing logic evaluates the caller's intent — burst pipe, clogged drain, water heater issue, slab leak, gas line concern — and applies your predefined criteria to determine appropriate next steps.",
    qualificationQuestions: [
      "Leak location and severity (active leaking versus intermittent)",
      "Water shut-off status (has the customer turned off the main valve?)",
      "Property access (is someone home to let you in?)",
      "Emergency indicators (flooding, no water, sewage backup)",
    ],
    routingNote: "Intelligent routing ensures emergency calls with active flooding receive immediate callback scheduling, while routine drain cleaning inquiries are directed to the appropriate service window based on your availability.",
    integrationNote: "Every interaction generates detailed call summaries with notifications delivered through your preferred channels — email, Slack, text. The system integrates directly with your job management software, maintaining accurate records without manual data entry. For existing customers, new service requests are automatically added to their property history. For new prospects, the system creates a lead record with complete job details and contact information.",
    faqs: [
      { q: "How does Call IQ handle after-hours emergency calls?", a: "You define what constitutes an emergency (burst pipe, no hot water, gas smell, sewage backup). The AI collects emergency details and immediately notifies your on-call plumber via text with the full job summary including address, access instructions, and problem description." },
      { q: "Can the AI provide estimates over the phone?", a: "The AI can provide service call fees, hourly rates, and common flat-rate pricing (water heater replacement, toilet installation, drain cleaning). For complex estimates, it collects job details and schedules an on-site assessment or video call." },
      { q: "What if a homeowner describes a problem the AI doesn't understand?", a: "The AI collects the homeowner's description verbatim, flags the call for your review with a \"technical review needed\" tag, and promises a callback from your team within your specified timeframe. No technical diagnosis is attempted — just structured data collection and escalation." },
      { q: "Can the AI handle sewer camera inspection bookings?", a: "Absolutely. The AI can explain what a sewer inspection involves, capture property details and access requirements, and schedule the inspection based on your equipment availability." },
      { q: "How does the AI handle parts and material questions?", a: "The AI can check basic parts availability when integrated with your inventory system. For specific technical questions about compatibility or specifications, the AI collects the question and escalates for a callback." },
      { q: "What if a customer has a gas line concern?", a: "The AI is trained to recognize gas-related keywords (gas smell, hissing sound, gas leak). These calls are flagged as highest priority and trigger immediate notification to your team. The AI instructs the homeowner to evacuate and call the gas company if appropriate." },
      { q: "Can the AI handle warranty questions on previous work?", a: "Yes. The AI can access your warranty database when integrated. It can verify warranty status, explain coverage terms, and schedule a warranty service call based on your protocols." },
    ],
    useCases: ["Burst pipe emergency routing", "Drain cleaning quotes", "Water heater scheduling", "Commercial plumbing intake"],
  },
  electrical: {
    title: "Electricians",
    subtitle: "Power Your Business Growth. Never Miss an Emergency Call.",
    intro: "Call IQ provides an intelligent AI receptionist that answers, screens, and dispatches electricians 24/7 — built specifically for electrical contractors.",
    sections: [
      { heading: "Emergency calls arrive when you're up to your elbows in a panel", body: "Calls come in when you're troubleshooting a short, pulling wire, or finishing a panel upgrade. Call IQ captures emergency details, books service windows, and sends job summaries instantly to your phone. Our AI handles routine questions about service areas, hourly rates, and availability." },
      { heading: "Wire homes while our AI handles the phone", body: "Call IQ greets every homeowner professionally and captures essential job details through structured intake questions. By collecting key information upfront — outage type, panel age, safety concerns, access details — the system helps identify and prioritize emergency calls based on your response zones and license types." },
    ],
    callFlowIntro: "Custom call flows for electrical contractors. Call IQ customizable call flows evaluate caller intent — emergency outage, panel upgrade, new construction wiring, code violation inspection — and apply your predefined criteria for dispatch priority.",
    qualificationQuestions: ["Breaker status, burning smells, partial versus full outage, and property access"],
    routingNote: "Intelligent routing ensures emergency calls with safety concerns (sparks, smoke, shock hazards) receive immediate callback scheduling.",
    faqs: [
      { q: "How does Call IQ handle electrical emergencies after hours?", a: "You define emergency criteria (no power, sparks, burning smell). The AI collects emergency details and immediately notifies your on-call electrician via text with the full job summary." },
      { q: "Can the AI provide estimates over the phone?", a: "The AI can provide service call fees and hourly rates. For full estimates, it collects job details and schedules an on-site assessment." },
      { q: "What if a caller describes a problem the AI doesn't understand?", a: "The AI collects the caller's description verbatim, flags the call for your review, and promises a callback. No technical diagnosis is attempted — just data collection and escalation." },
    ],
    useCases: ["Power outage triage", "Panel upgrade quotes", "EV charger installation booking", "Commercial electrical intake"],
  },
  landscaping: {
    title: "Landscapers",
    subtitle: "Grow Your Business. Never Miss a Spring Cleanup Call.",
    intro: "Call IQ provides an intelligent AI receptionist that answers, screens, and books landscaping estimates 24/7 — built specifically for lawn care and landscaping professionals.",
    sections: [
      { heading: "Lawn care calls arrive during mowing season afternoons", body: "Calls come in when you're on a zero-turn, trimming hedges, or blowing leaves. Call IQ captures property details, books estimates, and sends lead summaries instantly to your phone. Our AI handles routine questions about mowing schedules, fertilization programs, tree services, and pricing." },
      { heading: "Mow lawns while our AI handles the phone", body: "Call IQ greets every homeowner professionally and captures essential property details through structured intake questions. By collecting key information upfront — lawn size, service type, frequency, special features — the system helps identify and prioritize qualified leads based on your route zones and equipment capabilities." },
    ],
    differentiators: [
      "Custom AI configuration with prompts tailored specifically to your service categories (mowing, fertilization, tree care, hardscape, snow removal)",
      "True 24/7 coverage with intelligent call routing based on season and service type",
      "Complete call handling including estimate scheduling, recurring service sign-ups, and emergency tree removal",
      "Integration with lawn care software and routing systems",
      "Dedicated onboarding support ensuring your AI understands your specific service area and seasonal pricing",
      "Professional representation that adapts to your brand voice and customer communication style",
    ],
    callFlowIntro: "Custom call flows built for landscaping professionals. Call IQ customizable call flows serve as the technical framework that consistently executes your lead qualification and estimate routing protocols. The routing logic evaluates the caller's intent — weekly mowing, spring cleanup, tree removal, landscape design, snow plowing — and applies your predefined criteria to determine appropriate next steps.",
    qualificationQuestions: [
      "Property size (acres or lot size)",
      "Current lawn condition (overgrown, patchy, weeds)",
      "Service frequency (weekly, bi-weekly, one-time)",
      "Special features (flower beds, irrigation, slopes, trees)",
      "Budget and timeline",
    ],
    routingNote: "Intelligent routing ensures emergency tree removal calls receive immediate dispatch, while new mowing accounts are scheduled for a property walkthrough.",
    integrationNote: "Every interaction generates detailed call summaries with notifications delivered through your preferred channels — email, Slack, text. The system integrates directly with your lawn care software, maintaining accurate records without manual data entry. For existing customers, new service requests are automatically added to their property history. For new prospects, the system creates a lead record with complete property details and contact information.",
    faqs: [
      { q: "How does Call IQ handle different service frequencies?", a: "The AI captures desired frequency (weekly, bi-weekly, monthly, one-time) and can explain your pricing for each option. Recurring services can be set up as automatic weekly bookings." },
      { q: "Can the AI provide mowing quotes over the phone?", a: "Yes, based on property size and frequency. The AI uses your standard rate per cut (e.g., \"$X per week for a standard residential lot\"). For properties with complex features or overgrown conditions, an on-site estimate is required." },
      { q: "How does the AI handle tree removal estimates?", a: "Tree removal requires an on-site estimate. The AI captures tree species, size, location, and access details, then schedules an arborist visit. Emergency tree removal (storm damage, leaning toward house) is dispatched immediately." },
      { q: "What if a customer needs snow removal in winter?", a: "The AI switches to snow mode based on season or customer request. It captures driveway size, walkway length, and plowing vs. shoveling needs, then either provides seasonal contract pricing or per-event rates." },
      { q: "Can the AI handle commercial landscaping for HOA or office parks?", a: "Yes. The AI captures property type, square footage, service scope, and bid timeline. Commercial inquiries are flagged for your sales team with all collected details." },
      { q: "How does the AI answer questions about fertilization and weed control?", a: "The AI can explain your program offerings (organic vs. synthetic, number of applications per year, weed prevention vs. weed killing) and provide pricing based on lawn size." },
      { q: "What if a customer has an irrigation system issue?", a: "The AI can schedule irrigation repair appointments. It captures zone information, problem description (leak, no water, controller issue), and access details for your technician." },
    ],
    useCases: ["Lawn care estimate booking", "Seasonal service scheduling", "Snow removal routing", "Commercial property intake"],
  },
  roofing: {
    title: "Roofers",
    subtitle: "Protect Homes. Capture Every Storm Call.",
    intro: "Call IQ provides an intelligent AI receptionist that answers, screens, and books roof inspections 24/7 — built specifically for roofing contractors and storm damage specialists.",
    sections: [
      { heading: "Storm chase calls arrive when hail is still on the ground", body: "Calls come in when you're on a roof, measuring for replacement, or meeting with insurance adjusters. Call IQ captures damage details, books inspections, and sends lead summaries instantly to your phone. Our AI handles routine questions about shingle types, warranty options, financing, and insurance claim assistance." },
      { heading: "Replace roofs while our AI handles the phone", body: "Call IQ greets every homeowner professionally and captures essential job details through structured intake questions. By collecting key information upfront — leak location, storm date, visible damage, insurance claim status, roof age — the system helps identify and prioritize leads based on your service areas and damage severity." },
    ],
    differentiators: [
      "Custom AI configuration with prompts tailored specifically to your service categories (repair, replacement, storm damage, gutter installation)",
      "True 24/7 coverage with intelligent call routing based on damage severity and insurance involvement",
      "Complete call handling including inspection scheduling, estimate requests, and insurance documentation collection",
      "Integration with job management software and CRM platforms",
      "Dedicated onboarding support ensuring your AI understands your specific service area and material types",
      "Professional representation that adapts to your brand voice and customer communication style",
    ],
    callFlowIntro: "Custom call flows built for roofing contractors. Call IQ customizable call flows serve as the technical framework that consistently executes your lead qualification and inspection routing protocols. The routing logic evaluates the caller's intent — active leak, storm damage assessment, age-related replacement, gutter installation — and applies your predefined criteria to determine appropriate next steps.",
    qualificationQuestions: [
      "Leak location (ceiling stain, wall drip, skylight)",
      "Storm date and type (hail, wind, hurricane)",
      "Visible damage (missing shingles, granule loss, dented vents)",
      "Insurance claim status (filed, pending, denied)",
      "Roof age and material type",
    ],
    routingNote: "Intelligent routing ensures active leak calls receive immediate inspection scheduling, while storm damage inquiries are prioritized based on your service area and claim filing deadlines.",
    integrationNote: "Every interaction generates detailed call summaries with notifications delivered through your preferred channels — email, Slack, text. The system integrates directly with your job management software, maintaining accurate records without manual data entry. For existing customers, new service requests are automatically added to their property history. For new prospects, the system creates a lead record with complete roof details and contact information.",
    faqs: [
      { q: "How does Call IQ handle storm damage calls during high-volume events?", a: "The AI scales to handle hundreds of simultaneous calls after hailstorms or hurricanes. It captures each homeowner's information, damage details, and insurance status, then queues inspections based on your priority rules (active leaks first, then visible damage)." },
      { q: "Can the AI help homeowners understand their insurance coverage?", a: "The AI can explain your insurance claim assistance process — how you work with adjusters, what documentation you provide, and whether you accept insurance assignment of benefits. It does not provide insurance advice." },
      { q: "What if a homeowner doesn't know their roof age or material?", a: "The AI captures whatever information the homeowner has (purchase date, builder name, approximate age) and notes \"unknown\" for missing fields. The estimate and inspection will determine actual specifications." },
      { q: "Can the AI provide ballpark estimates over the phone?", a: "The AI can provide square footage-based ranges (e.g., \"most asphalt shingle roofs in this area run between $X and $Y\") but always schedules an inspection for a firm quote." },
      { q: "How does the AI handle emergency tarping calls?", a: "Active leak calls are prioritized. The AI explains your tarping service, captures access instructions, and dispatches your emergency response team based on your protocols." },
      { q: "Can the AI handle questions about different shingle brands and warranties?", a: "Yes. You provide your product offerings (brands, grades, warranty lengths, color availability). The AI can explain differences between 3-tab, architectural, and premium shingles." },
      { q: "What if a homeowner calls about a roof that's only a few years old?", a: "The AI checks your warranty database if integrated. It can verify whether the roof was installed by your company and whether the issue is covered under warranty or requires a paid repair." },
    ],
    useCases: ["Storm damage inspection scheduling", "Insurance claim documentation intake", "Emergency tarping dispatch", "Re-roof estimate booking"],
  },
  pestcontrol: {
    title: "Pest Control",
    subtitle: "Eliminate Pests. Not Missed Calls.",
    intro: "Call IQ provides an intelligent AI receptionist that answers, screens, and books pest inspections 24/7 — built specifically for exterminators and pest management professionals.",
    sections: [
      { heading: "Emergency calls arrive when a customer spots a rodent or a nest", body: "Calls come in when you're treating a property, mixing chemicals, or finishing route paperwork. Call IQ captures pest details, books treatments, and sends lead summaries instantly to your phone. Our AI handles routine questions about treatment types, safety protocols, recurring plans, and pricing." },
      { heading: "Treat properties while our AI handles the phone", body: "Call IQ greets every homeowner professionally and captures essential pest details through structured intake questions. By collecting key information upfront — pest type, infestation severity, location in home, previous treatments — the system helps identify and prioritize calls based on your service areas and pest control methods." },
    ],
    differentiators: [
      "Custom AI configuration with prompts tailored specifically to your pest categories (ants, rodents, termites, bed bugs, roaches, wasps)",
      "True 24/7 coverage with intelligent call routing based on pest type and urgency",
      "Complete call handling including inspection scheduling, treatment booking, and recurring plan enrollment",
      "Integration with pest management software and routing systems",
      "Dedicated onboarding support ensuring your AI understands your specific treatment protocols and safety requirements",
      "Professional representation that adapts to your brand voice and customer communication style",
    ],
    callFlowIntro: "Custom call flows built for pest control professionals. Call IQ customizable call flows serve as the technical framework that consistently executes your lead qualification and treatment routing protocols. The routing logic evaluates the caller's intent — active infestation, preventative treatment, emergency removal, commercial account — and applies your predefined criteria to determine appropriate next steps.",
    qualificationQuestions: [
      "Pest type (what they saw, where, when)",
      "Infestation severity (occasional sighting versus consistent activity)",
      "Location in home (kitchen, bedroom, basement, attic)",
      "Previous treatments (DIY attempts, competitor services)",
      "Safety concerns (children, pets, allergies)",
    ],
    routingNote: "Intelligent routing ensures bed bug and termite calls receive immediate inspection scheduling, while routine ant or roach treatments are directed to your next available service window.",
    integrationNote: "Every interaction generates detailed call summaries with notifications delivered through your preferred channels — email, Slack, text. The system integrates directly with your pest management software, maintaining accurate records without manual data entry. For existing customers, new service requests are automatically added to their property history. For new prospects, the system creates a lead record with complete pest details and contact information.",
    faqs: [
      { q: "How does Call IQ handle different pest types with different treatment protocols?", a: "You configure separate intake flows for each pest category. The AI asks relevant questions for each type — termite calls include questions about mud tubes and wood damage, while rodent calls include questions about droppings and entry points." },
      { q: "Can the AI answer safety questions about pesticides?", a: "The AI can explain your safety protocols (evacuation requirements, re-entry timing, pet restrictions) based on your standard procedures. For specific chemical questions or medical concerns, it escalates for a callback from your certified applicator." },
      { q: "What if a customer has a wasp nest or bee swarm emergency?", a: "The AI recognizes these as urgent. It captures location details, nest size, and access information, then notifies your team immediately. The AI can also distinguish between wasps (you treat) and honey bees (referral to beekeeper)." },
      { q: "Can the AI sell recurring maintenance plans over the phone?", a: "Yes. The AI can explain your quarterly, bi-monthly, or annual plans, answer common questions about coverage and pricing, and sign up new customers by collecting payment information securely." },
      { q: "How does the AI handle termite bond transfers when a home sells?", a: "The AI can explain your transfer process, collect new homeowner information, and schedule a required inspection before bond transfer approval." },
      { q: "What if a customer has bed bugs and needs immediate treatment?", a: "Bed bug calls are flagged as high priority. The AI collects room-by-room details, explains your preparation requirements, and schedules the earliest available treatment window. The AI also provides your prep checklist via text or email." },
      { q: "Can the AI handle commercial accounts with multiple locations?", a: "Yes. The AI can capture company name, number of locations, square footage, and pest history. For commercial accounts, the AI schedules a consultation rather than booking immediate treatment." },
    ],
    useCases: ["Emergency pest inspection scheduling", "Recurring treatment plan enrollment", "Bed bug and termite triage", "Commercial multi-location intake"],
  },
  movers: {
    title: "Movers",
    subtitle: "Move More Families. Never Miss a Quote Request.",
    intro: "Call IQ provides an intelligent AI receptionist that answers, screens, and books moving estimates 24/7 — built specifically for moving companies and relocation specialists.",
    sections: [
      { heading: "Moving calls arrive during peak season weekends", body: "Calls come in when you're loading a truck, driving between jobs, or finishing a packing service. Call IQ captures move details, books in-home or virtual estimates, and sends lead summaries instantly to your phone. Our AI handles routine questions about truck sizes, packing services, insurance, and pricing." },
      { heading: "Move belongings while our AI handles the phone", body: "Call IQ greets every customer professionally and captures essential move details through structured intake questions. By collecting key information upfront — move date, home size, distance, special items — the system helps identify and prioritize qualified leads based on your truck capacity and service areas." },
    ],
    differentiators: [
      "Custom AI configuration with prompts tailored specifically to your service categories (local move, long-distance, packing, storage, commercial)",
      "True 24/7 coverage with intelligent call routing based on move distance and timing",
      "Complete call handling including estimate scheduling, packing service booking, and inventory collection",
      "Integration with moving software and CRM platforms",
      "Dedicated onboarding support ensuring your AI understands your specific service area and pricing model",
      "Professional representation that adapts to your brand voice and customer communication style",
    ],
    callFlowIntro: "Custom call flows built for moving companies. Call IQ customizable call flows serve as the technical framework that consistently executes your lead qualification and estimate routing protocols. The routing logic evaluates the caller's intent — local move, long-distance move, packing only, storage, commercial relocation — and applies your predefined criteria to determine appropriate next steps.",
    qualificationQuestions: [
      "Move date (flexible or fixed)",
      "Current home size (bedrooms, square footage)",
      "Distance (within city, cross-state, cross-country)",
      "Special items (piano, pool table, gun safe, art)",
      "Packing needs (full, partial, or none)",
    ],
    routingNote: "Intelligent routing ensures short-notice moves receive immediate estimate scheduling, while future moves are booked into your standard consultation calendar.",
    integrationNote: "Every interaction generates detailed call summaries with notifications delivered through your preferred channels — email, Slack, text. The system integrates directly with your moving software, maintaining accurate records without manual data entry. For existing customers, new move requests are automatically added to their customer history. For new prospects, the system creates a lead record with complete move details and contact information.",
    faqs: [
      { q: "How does Call IQ handle large estimates versus small moves?", a: "The AI captures home size and special items. Large moves (4+ bedrooms, pianos, multiple special items) are flagged for priority follow-up. Small moves (studio, 1-bedroom) can be quoted with standard rates without an in-person estimate." },
      { q: "Can the AI provide ballpark pricing over the phone?", a: "Yes. The AI can provide hourly rate ranges for local moves and per-pound or per-mile ranges for long-distance moves, based on your standard pricing. Firm quotes always require an in-home or virtual survey." },
      { q: "How does the AI handle packing service questions?", a: "The AI can explain your packing options (full pack, partial pack, fragile-only, unpacking), provide pricing based on home size, and add packing services to any moving estimate." },
      { q: "What if a customer has last-minute moving needs (next day)?", a: "The AI checks your availability and, if you have capacity, schedules an immediate virtual estimate or provides your rush move pricing. Last-minute calls are flagged for your dispatch team." },
      { q: "Can the AI handle storage coordination?", a: "Yes. The AI can explain your storage options (container size, climate control, access hours) and add storage to any move estimate. For storage-only customers, it schedules a facility tour or container drop-off." },
      { q: "How does the AI handle claims and damage questions?", a: "The AI can explain your claims process, provide your claims department contact information, and capture basic claim details for your team to follow up. It does not adjudicate claims over the phone." },
      { q: "What if a customer needs to change their move date?", a: "The AI can check your calendar availability and reschedule the move based on your change policy (fees, notice requirements). Date changes are confirmed via text and email." },
    ],
    useCases: ["In-home and virtual estimate booking", "Packing service add-on sales", "Storage coordination", "Rush/last-minute move triage"],
  },
  "pool-services": {
    title: "Pool Services",
    subtitle: "Keep Pools Clean. Never Miss an Opening or Closing Call.",
    intro: "Call IQ provides an intelligent AI receptionist that answers, screens, and books pool service appointments 24/7 — built specifically for pool cleaning and maintenance professionals.",
    sections: [
      { heading: "Pool service calls arrive during spring opening season", body: "Calls come in when you're vacuuming, balancing chemicals, or repairing a pump. Call IQ captures pool details, books service windows, and sends lead summaries instantly to your phone. Our AI handles routine questions about weekly service, chemical programs, equipment repair, and opening/closing dates." },
      { heading: "Clean pools while our AI handles the phone", body: "Call IQ greets every pool owner professionally and captures essential pool details through structured intake questions. By collecting key information upfront — pool type, size, service needed, equipment age — the system helps identify and prioritize qualified leads based on your route zones and service capacity." },
    ],
    differentiators: [
      "Custom AI configuration with prompts tailored specifically to your service categories (weekly cleaning, chemical service, equipment repair, opening, closing)",
      "True 24/7 coverage with intelligent call routing based on season and urgency",
      "Complete call handling including appointment scheduling, emergency repair dispatch, and service plan enrollment",
      "Integration with pool service software and routing systems",
      "Dedicated onboarding support ensuring your AI understands your specific service area and chemical programs",
      "Professional representation that adapts to your brand voice and customer communication style",
    ],
    callFlowIntro: "Custom call flows built for pool service professionals. Call IQ customizable call flows serve as the technical framework that consistently executes your lead qualification and service routing protocols. The routing logic evaluates the caller's intent — weekly cleaning, green pool, equipment breakdown, opening, closing — and applies your predefined criteria to determine appropriate next steps.",
    qualificationQuestions: [
      "Pool type (in-ground, above-ground, saltwater, chlorine)",
      "Pool size (gallons or dimensions)",
      "Service needed (cleaning, chemicals, repair, opening, closing)",
      "Equipment issues (pump not running, heater failure, leak)",
      "Urgency (green pool, no circulation, leak)",
    ],
    routingNote: "Intelligent routing ensures green pool and equipment failure calls receive immediate service scheduling, while opening and closing appointments are booked into your seasonal calendar.",
    integrationNote: "Every interaction generates detailed call summaries with notifications delivered through your preferred channels — email, Slack, text. The system integrates directly with your pool service software, maintaining accurate records without manual data entry. For existing customers, new service requests are automatically added to their pool history. For new prospects, the system creates a lead record with complete pool details and contact information.",
    faqs: [
      { q: "How does Call IQ handle green pool emergencies?", a: "The AI recognizes green pool calls as urgent. It captures algae severity, pump status, and access details, then schedules your earliest available treatment visit. The AI can also provide pre-visit instructions (running pump, brushing walls)." },
      { q: "Can the AI provide weekly service pricing over the phone?", a: "Yes. The AI uses your standard weekly rate based on pool type and size. It can explain what's included (skimming, brushing, vacuuming, chemical testing, filter cleaning schedule)." },
      { q: "How does the AI handle equipment repair questions?", a: "The AI collects equipment brand, age, and problem description. For simple issues (timer programming, basic troubleshooting), it can guide the customer. For repairs, it schedules a technician visit and provides your diagnostic fee pricing." },
      { q: "What if a customer needs pool opening or closing?", a: "The AI captures pool details, preferred date range, and any special requirements (safety cover, mesh cover, heater winterization). It books the opening or closing based on your seasonal availability." },
      { q: "Can the AI answer chemical questions?", a: "The AI can explain your chemical programs (chlorine vs. salt, test frequency, adjustments included). For specific chemical readings or water balancing advice, it schedules a service visit." },
      { q: "How does the AI handle commercial pool accounts (apartments, hotels)?", a: "The AI captures property type, pool size, usage volume, and compliance requirements. Commercial inquiries are flagged for your commercial team with all collected details." },
      { q: "What if a customer has a leak?", a: "Leak calls are prioritized. The AI captures leak location (equipment pad, return line, skimmer, pool shell) and water loss rate, then schedules a leak detection appointment." },
    ],
    useCases: ["Seasonal opening/closing scheduling", "Green pool emergency triage", "Recurring service plan enrollment", "Equipment repair dispatch"],
  },
  "floor-installers": {
    title: "Floor Installers",
    subtitle: "Install More Floors. Never Miss a Quote Request.",
    intro: "Call IQ provides an intelligent AI receptionist that answers, screens, and books in-home estimates for flooring contractors 24/7 — built specifically for floor installation and restoration professionals.",
    sections: [
      { heading: "Flooring calls arrive during installation projects", body: "Calls come in when you're cutting planks, applying adhesive, or sanding hardwood. Call IQ captures room details, books estimates, and sends lead summaries instantly to your phone. Our AI handles routine questions about material types, installation methods, pricing, and timelines." },
      { heading: "Install floors while our AI handles the phone", body: "Call IQ greets every homeowner professionally and captures essential project details through structured intake questions. By collecting key information upfront — room sizes, material interest, subfloor type, timeline — the system helps identify and prioritize qualified leads based on your installation specialties." },
    ],
    differentiators: [
      "Custom AI configuration with prompts tailored specifically to your service categories (hardwood, laminate, vinyl, tile, carpet, refinishing)",
      "True 24/7 coverage with intelligent call routing based on material type and project size",
      "Complete call handling including estimate scheduling, material consultation, and installation booking",
      "Integration with flooring software and CRM platforms",
      "Dedicated onboarding support ensuring your AI understands your specific service area and material offerings",
      "Professional representation that adapts to your brand voice and customer communication style",
    ],
    callFlowIntro: "Custom call flows built for flooring contractors. Call IQ customizable call flows serve as the technical framework that consistently executes your lead qualification and estimate routing protocols. The routing logic evaluates the caller's intent — new installation, refinishing, repair, commercial — and applies your predefined criteria to determine appropriate next steps.",
    qualificationQuestions: [
      "Room count and square footage (approximate)",
      "Material interest (hardwood, LVP, tile, carpet, laminate)",
      "Current flooring (existing material and condition)",
      "Subfloor type (concrete, plywood, existing floor)",
      "Timeline (urgent, flexible, planned)",
    ],
    routingNote: "Intelligent routing ensures urgent repair calls (water damage, loose planks) receive immediate estimate scheduling, while new construction projects are booked based on your installation calendar.",
    integrationNote: "Every interaction generates detailed call summaries with notifications delivered through your preferred channels — email, Slack, text. The system integrates directly with your flooring software, maintaining accurate records without manual data entry. For existing customers, new project requests are automatically added to their property history. For new prospects, the system creates a lead record with complete project details and contact information.",
    faqs: [
      { q: "How does Call IQ handle different flooring types with different pricing?", a: "You configure separate pricing guidance for each material type. The AI can provide per-square-foot ranges for each material and explain the differences in installation complexity, durability, and maintenance." },
      { q: "Can the AI provide estimates over the phone?", a: "The AI can provide ballpark ranges based on square footage and material choice (e.g., \"LVP typically runs between $X and $Y per square foot installed\"). Firm quotes always require an in-home measurement and material selection." },
      { q: "How does the AI handle subfloor preparation questions?", a: "The AI can explain common subfloor issues (uneven, water damage, existing adhesive) and note that final assessment requires an on-site visit. It schedules the estimate with a note about subfloor concerns." },
      { q: "What if a customer needs hardwood refinishing instead of new installation?", a: "The AI captures current floor condition, square footage, and desired finish. It explains the refinishing process (sanding, staining, sealing) and provides pricing based on your standard rates." },
      { q: "Can the AI handle commercial flooring projects (offices, retail)?", a: "Yes. The AI captures square footage, material type, usage volume, and after-hours requirements. Commercial inquiries are flagged for your commercial team with all collected details." },
      { q: "How does the AI answer questions about material durability and warranty?", a: "The AI can explain your product lines (wear layer thickness, scratch resistance, water resistance) and manufacturer warranty terms based on your approved information." },
      { q: "What if a customer has existing flooring that needs removal?", a: "The AI captures existing material type (carpet, tile, hardwood) and disposal requirements. It adds demolition and haul-away to the estimate scope." },
    ],
    useCases: ["In-home estimate scheduling", "Material consultation and pricing ranges", "Refinishing vs. new install triage", "Commercial flooring intake"],
  },
  cleaning: { title: "Home Cleaning", subtitle: "Quote requests, recurring bookings", intro: "Convert quote requests into booked jobs. Call IQ handles pricing questions, availability, and recurring schedule setup.", useCases: ["One-time deep clean quotes", "Recurring weekly/biweekly booking", "Move-out cleaning intake", "Commercial cleaning leads"] },
  realestate: { title: "Real Estate", subtitle: "Showing requests, buyer qualification", intro: "Every missed showing request is a lost commission. Call IQ qualifies buyers, books showings, and syncs leads to your CRM.", useCases: ["Showing request scheduling", "Buyer qualification questions", "Rental inquiry handling", "Open house lead capture"] },
  all: { title: "50+ Industries", subtitle: "Pre-configured. Ready in minutes.", intro: "Call IQ serves HVAC, plumbing, real estate, salons, auto shops, property management, and dozens more — with industry-tuned AI vocabulary out of the box.", useCases: ["Pre-built industry templates", "Custom vocabulary training", "Industry-specific qualification flows", "Fast 15-minute setup"] },
};
