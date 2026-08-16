/* ================================================
   Halla AI — Main JavaScript
   Marketing site + Dashboard logic
   © 2025 Halla AI
================================================ */

// ============ MODE: marketing vs dashboard ============
let _mode = 'marketing'; // 'marketing' | 'dashboard'

function showMarketing() {
  _mode = 'marketing';
  document.getElementById('app-shell').classList.remove('active');
  document.getElementById('marketing-wrap').style.display = 'block';
  document.getElementById('site-nav').style.display = '';
}

function showDashboard(page) {
  _mode = 'dashboard';
  document.getElementById('marketing-wrap').style.display = 'none';
  document.getElementById('site-nav').style.display = 'none';
  document.getElementById('app-shell').classList.add('active');
  dashGo(page || 'overview');
}

// ============ MARKETING ROUTING ============
function go(page) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) { el.classList.add('active'); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  closeMob();
  closeAllDropdowns();
}
function goSol(sub) { go('solutions'); loadSol(sub); }
function goInd(sub) {
  if (sub === 'all') { go('industries-all'); }
  else { go('industries'); loadInd(sub); }
}

// ============ MOBILE NAV ============
function toggleMob() { document.getElementById('mob-nav').classList.toggle('open'); }
function closeMob() { document.getElementById('mob-nav').classList.remove('open'); }

// ============ DROPDOWN NAV ============
function toggleDropdown(evt, triggerEl) {
  evt.stopPropagation();
  const item = triggerEl.closest('.nav-item');
  const wasOpen = item.classList.contains('open');
  closeAllDropdowns();
  if (!wasOpen) { item.classList.add('open'); }
}
function closeAllDropdowns() {
  document.querySelectorAll('.nav-item.open').forEach(i => i.classList.remove('open'));
}
document.addEventListener('click', function (evt) {
  if (!evt.target.closest('.nav-item')) { closeAllDropdowns(); }
});
document.addEventListener('keydown', function (evt) {
  if (evt.key === 'Escape') { closeAllDropdowns(); }
});

// ============ FAQ ============
function faqToggle(el) { el.parentElement.classList.toggle('open'); }

// ============ ROI CALCULATOR ============
function calcROI() {
  const miss = +document.getElementById('r-miss').value || 0;
  const val = +document.getElementById('r-val').value || 0;
  const conv = +document.getElementById('r-conv').value || 0;
  const plan = +document.getElementById('r-plan').value || 149;
  const monthly = Math.round(miss * (conv / 100) * val);
  const annual = monthly * 12;
  const cost = plan * 12;
  const net = Math.max(0, annual - cost);
  const mult = cost > 0 ? (annual / cost).toFixed(1) : '∞';
  document.getElementById('r-monthly').textContent = '$' + monthly.toLocaleString();
  document.getElementById('r-annual').textContent = '$' + annual.toLocaleString();
  document.getElementById('r-cost').textContent = '$' + cost.toLocaleString();
  document.getElementById('r-net').textContent = '$' + net.toLocaleString();
  document.getElementById('r-mult').textContent = 'Net Annual ROI — ' + mult + 'x your investment';
}

// ============ SOLUTIONS DATA ============
const SOLS = {
  answering: { title: '24/7 AI Answering Service', sub: 'Never miss a customer call again. Every call answered instantly.', icon: '📞', desc: 'Halla AI answers every inbound call 24 hours a day, 7 days a week, 365 days a year — including holidays, weekends, and 3am emergencies. No hold music. No voicemail. Instant, professional response every time.', feats: ['Answers in under 2 seconds', 'Unlimited simultaneous calls', 'Custom greeting with your business name', 'Bilingual English + Spanish', 'Call summaries via email & SMS', 'Zero spam charges'] },
  scheduling: { title: 'Appointment Scheduling', sub: 'Book, reschedule, and cancel appointments automatically.', icon: '📅', desc: 'Your AI receptionist checks your calendar in real-time and books appointments without you lifting a finger. Integrates with Google Calendar, Outlook, and Calendly natively, and 5,000+ more via Zapier.', feats: ['Real-time calendar check', 'Book, reschedule, and cancel', 'Automatic confirmation via SMS & email', 'Multiple appointment types', 'Business hours & blackout dates', 'Calendly, Google Calendar, Acuity, and more'] },
  messages: { title: 'Message Taking', sub: 'Detailed call summaries delivered to your phone and email instantly.', icon: '✉️', desc: 'Every call transcribed and summarized. Caller name, phone, purpose, details — delivered to your email and SMS within seconds.', feats: ['Full call transcript', 'SMS & email delivery', 'Caller contact info captured', 'Urgency flagged automatically', 'Searchable call history', 'CRM auto-entry'] },
  leads: { title: 'Lead Capture & Qualification', sub: 'Custom questions. Smart routing. Only talk to what matters.', icon: '🎯', desc: 'Define your ideal customer. The AI asks custom qualification questions, scores leads, and routes hot leads to your phone while cold leads go to your CRM for follow-up.', feats: ['Custom qualification questions', 'Lead scoring', 'Hot leads → instant SMS to you', 'Cold leads → CRM auto-entry', 'HubSpot, Salesforce, Pipedrive native', 'Conversion tracking dashboard'] },
  routing: { title: 'Call Routing & Forwarding', sub: 'The right call goes to the right person at the right time.', icon: '🔀', desc: 'Route calls based on intent, time of day, agent availability, or custom logic. Emergency? Instant SMS. Routine? Logged and handled. After hours? Custom rules.', feats: ['Intent-based routing', 'Time-of-day rules', 'Emergency vs. routine triage', 'Transfer to your cell on demand', 'Department routing', 'After-hours & holiday rules'] },
  multilingual: { title: 'Multi-Lingual Answering', sub: 'Never lose a Spanish-speaking customer again.', icon: '🌐', desc: 'English and Spanish included on every plan. The AI automatically detects caller language and responds accordingly. Enterprise supports up to 5 languages.', feats: ['English + Spanish on all plans', 'Auto language detection', 'Full feature support in both languages', 'Up to 5 languages on Enterprise', 'No extra charge for bilingual', 'Consistent quality in all languages'] },
  afterhours: { title: 'After Hours Calls', sub: 'Your business never closes. Neither does your AI.', icon: '🌙', desc: 'Set different rules for different times. After hours, weekends, and holidays all handled with custom greetings, routing, and emergency escalation.', feats: ['Separate rules per time window', 'Emergency escalation after hours', 'Custom after-hours greeting', 'On-call team SMS alerts', 'Appointment booking 24/7', 'Morning summary of overnight calls'] },
  screening: { title: 'Call Screening & Spam Blocking', sub: 'You never pay for spam. Zero tolerance for robocalls.', icon: '🛡️', desc: 'AI detects spam within seconds and hangs up automatically. You are never charged. For legitimate calls, the AI screens and qualifies before connecting to you.', feats: ['Spam & robocall detection in seconds', 'Never pay for spam calls', 'Screen caller purpose before transfer', 'Block known spam numbers', 'Spam log for your records', 'Caller authentication option'] },
};

function loadSol(key) {
  const s = SOLS[key] || SOLS.answering;
  const titleEl = document.getElementById('sol-title');
  const subEl = document.getElementById('sol-sub');
  const contentEl = document.getElementById('sol-content');
  if (!titleEl) return;
  titleEl.textContent = s.title;
  subEl.textContent = s.sub;
  contentEl.innerHTML = `
    <div class="grid-2" style="gap:64px;align-items:start">
      <div>
        <div style="font-size:2.8rem;margin-bottom:20px">${s.icon}</div>
        <p style="font-size:1.05rem;margin-bottom:32px">${s.desc}</p>
        <h3 style="margin-bottom:18px">Key Capabilities</h3>
        <div style="display:grid;gap:10px">
          ${s.feats.map(f => `<div class="pricing-feature" style="color:var(--gray-700)">${f}</div>`).join('')}
        </div>
        <div style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="go('signup')">Start Free Trial →</button>
          <button class="btn btn-outline" onclick="go('pricing')">View Pricing</button>
        </div>
      </div>
      <div style="background:var(--gray-50);border-radius:20px;padding:32px;border:1px solid var(--gray-200)">
        <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--gray-400);margin-bottom:20px">Live Demo Preview</div>
        <div class="wave">${[26,38,18,44,28,36,20,32,22,40].map(h => `<div class="wave-bar" style="height:${h}px"></div>`).join('')}</div>
        <div class="bubble">Hi, I'd like to book a consultation for next Tuesday.</div>
        <div class="bubble ai">Of course! I have Tuesday the 8th available at 10am, 2pm, or 4pm. Which works best for you?</div>
        <div class="mockup-status"><span class="status-dot"></span><span class="status-text">AI Active · Just now</span></div>
      </div>
    </div>`;
  document.querySelectorAll('.sol-tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.sol-tab[data-key="${key}"]`);
  if (tab) tab.classList.add('active');
}

// ============ INDUSTRIES DATA ============
const INDS = {
  hvac: { name: 'HVAC & Plumbing', icon: '🔧', desc: 'Never miss an emergency service call. The AI dispatches your techs, handles scheduling, and filters out spam — 24/7.', stats: ['Avg. 47 calls/mo recovered', '92% booking rate', '< 2s answer time'] },
  dental: { name: 'Dental & Medical', icon: '🦷', desc: 'HIPAA-aware call handling. Book appointments, handle insurance questions, and manage patient follow-up without adding staff.', stats: ['Avg. 38 new patients/mo', '99.2% uptime', 'HIPAA compliant'] },
  legal: { name: 'Law Firms', icon: '⚖️', desc: 'Intake new clients 24/7, screen case types, and schedule consultations — all before you even open the office.', stats: ['$4,200 avg monthly revenue recovered', '3.1x ROI average', 'Intake in < 60s'] },
  realestate: { name: 'Real Estate', icon: '🏠', desc: 'Capture every buyer and seller lead, qualify them automatically, and schedule showings without lifting a finger.', stats: ['200+ leads captured/mo avg', '68% lead conversion lift', 'Same-day follow-up'] },
  restaurant: { name: 'Restaurants', icon: '🍽️', desc: 'Handle reservations, hours inquiries, and to-go orders by voice — freeing your staff for in-house guests.', stats: ['85% of phone tasks automated', '0 voicemails missed', 'OpenTable sync'] },
  salon: { name: 'Salons & Spas', icon: '💅', desc: 'Book appointments, handle rescheduling, and capture client info automatically. Your front desk never misses a call.', stats: ['62% fewer no-shows', 'Avg. 22 extra bookings/mo', 'All major booking systems'] },
  financial: { name: 'Financial Services', icon: '💰', desc: 'Screen leads, schedule advisor calls, and handle general inquiries while staying compliant.', stats: ['FINRA-conscious scripting', '24/7 lead capture', 'CRM auto-entry'] },
  ecommerce: { name: 'E-Commerce', icon: '🛒', desc: 'Handle order status, returns, and product questions by voice. Reduce support tickets and keep customers happy.', stats: ['72% ticket deflection', 'Instant order lookup', 'Shopify + WooCommerce'] },
};

function loadInd(key) {
  const ind = INDS[key] || INDS.hvac;
  const el = document.getElementById('ind-content');
  if (!el) return;
  el.innerHTML = `
    <div class="grid-2" style="gap:64px;align-items:start">
      <div>
        <div style="font-size:3rem;margin-bottom:18px">${ind.icon}</div>
        <h2 style="font-size:2rem;margin-bottom:14px">Halla AI for ${ind.name}</h2>
        <p style="font-size:1.05rem;margin-bottom:32px;max-width:520px">${ind.desc}</p>
        <div style="display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin-bottom:32px">
          ${ind.stats.map(s => `<div style="background:var(--gray-50);border:1px solid var(--gray-200);border-radius:12px;padding:18px 14px;text-align:center"><div style="font-size:1rem;font-weight:800;color:var(--black);margin-bottom:4px">${s}</div></div>`).join('')}
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <button class="btn btn-primary" onclick="go('signup')">Start Free Trial →</button>
          <button class="btn btn-outline" onclick="go('pricing')">See Pricing</button>
        </div>
      </div>
      <div style="background:var(--gray-50);border-radius:20px;padding:32px;border:1px solid var(--gray-200)">
        <div style="font-size:0.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:var(--gray-400);margin-bottom:18px">Sample Call — ${ind.name}</div>
        <div class="bubble">Hi, I'm calling about ${ind.name.toLowerCase()} — can you help?</div>
        <div class="bubble ai">Absolutely! I'd love to help. Let me pull up some availability for you right now. Can I get your name?</div>
        <div class="bubble">Sure, it's Alex Martinez.</div>
        <div class="bubble ai">Great, Alex! I've got a slot this Thursday at 11am. Shall I book that for you and send a confirmation text?</div>
        <div class="mockup-status"><span class="status-dot"></span><span class="status-text">AI Active · Booking in progress</span></div>
      </div>
    </div>`;
  document.querySelectorAll('.ind-tab').forEach(t => t.classList.remove('active'));
  const tab = document.querySelector(`.ind-tab[data-key="${key}"]`);
  if (tab) tab.classList.add('active');
}

// ============ PRICING TAB TOGGLE ============
function setPricingCycle(cycle) {
  document.querySelectorAll('.ptab').forEach(t => t.classList.toggle('active', t.dataset.cycle === cycle));
  document.querySelectorAll('.price-monthly').forEach(el => el.style.display = cycle === 'monthly' ? '' : 'none');
  document.querySelectorAll('.price-annual').forEach(el => el.style.display = cycle === 'annual' ? '' : 'none');
}

// ============ DASHBOARD ROUTING ============
const dashPages = ['overview','calls','analytics','agent','integrations','billing','settings','account'];

function dashGo(page) {
  document.querySelectorAll('.dash-page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('dash-' + page);
  if (el) { el.classList.add('active'); }
  // Update sidebar active state
  document.querySelectorAll('.dash-nav-item').forEach(n => {
    n.classList.toggle('active', n.dataset.page === page);
  });
  // Update topbar title
  const titles = {
    overview: 'Dashboard',
    calls: 'Call Log',
    analytics: 'Analytics',
    agent: 'AI Agent Config',
    integrations: 'Integrations',
    billing: 'Billing & Plan',
    settings: 'Settings',
    account: 'Account'
  };
  const topbarTitle = document.getElementById('dash-topbar-title');
  if (topbarTitle) topbarTitle.textContent = titles[page] || page;
  // Close mobile sidebar
  document.querySelector('.dash-sidebar')?.classList.remove('open');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function toggleDashSidebar() {
  document.querySelector('.dash-sidebar').classList.toggle('open');
}

// ============ CALLS PAGE — FILTER ============
let _callFilter = 'all';
function filterCalls(status) {
  _callFilter = status;
  document.querySelectorAll('.call-filter-btn').forEach(b => b.classList.toggle('active', b.dataset.status === status));
  document.querySelectorAll('.call-row').forEach(row => {
    const show = status === 'all' || row.dataset.status === status;
    row.style.display = show ? '' : 'none';
  });
}

// ============ CALL DETAIL MODAL ============
function openCall(id) {
  const call = CALLS_DATA.find(c => c.id === id);
  if (!call) return;
  document.getElementById('call-modal-name').textContent = call.caller;
  document.getElementById('call-modal-phone').textContent = call.phone;
  document.getElementById('call-modal-time').textContent = call.time;
  document.getElementById('call-modal-duration').textContent = call.duration;
  document.getElementById('call-modal-type').textContent = call.type;
  document.getElementById('call-modal-summary').textContent = call.summary;
  document.getElementById('call-modal-transcript').innerHTML = call.transcript.map(t =>
    `<div class="transcript-line"><span class="transcript-speaker ${t.who === 'AI' ? 'ai' : ''}">${t.who}</span><span class="transcript-text">${t.text}</span></div>`
  ).join('');
  document.getElementById('call-modal').style.display = 'flex';
}
function closeCallModal() {
  document.getElementById('call-modal').style.display = 'none';
}

// Close modal on backdrop click
document.addEventListener('click', function(e) {
  const modal = document.getElementById('call-modal');
  if (modal && e.target === modal) closeCallModal();
});

// ============ CALLS DATA ============
const CALLS_DATA = [
  { id: 1, caller: 'Sarah Johnson', phone: '(512) 445-2210', time: 'Today, 2:34 PM', duration: '3:12', status: 'answered', type: 'Appointment Booking', summary: 'Caller requested a consultation on Tuesday. AI booked the slot for Tuesday Aug 18 at 10am and sent SMS confirmation.', transcript: [
    { who: 'AI', text: "Thank you for calling Halla AI. How can I help you today?" },
    { who: 'Caller', text: "Hi, I'd like to schedule a consultation for next Tuesday if possible." },
    { who: 'AI', text: "Of course! I have Tuesday the 18th available at 10am, 1pm, or 3:30pm. Which works best?" },
    { who: 'Caller', text: "10am would be perfect." },
    { who: 'AI', text: "Great! I've booked you for Tuesday Aug 18 at 10am. You'll receive a confirmation text shortly. Is there anything else I can help with?" },
    { who: 'Caller', text: "No that's perfect, thank you!" },
  ]},
  { id: 2, caller: 'Mike Torres', phone: '(713) 887-5521', time: 'Today, 1:18 PM', duration: '1:47', status: 'answered', type: 'Lead Inquiry', summary: 'Caller asked about pricing and services. Qualified as warm lead. Details sent to CRM automatically.', transcript: [
    { who: 'AI', text: "Thank you for calling. How can I assist you today?" },
    { who: 'Caller', text: "I was wondering about your pricing. We have a medium-sized office, maybe 15 employees." },
    { who: 'AI', text: "Happy to help! For a team of 15, our Professional plan at $249/month covers unlimited calls and full CRM integration. Shall I have someone follow up with you?" },
    { who: 'Caller', text: "Yes please, send me more info." },
    { who: 'AI', text: "Done! I've captured your details and our team will reach out within 1 business day. Is there a best time to call?" },
  ]},
  { id: 3, caller: 'Unknown', phone: '(800) 123-4567', time: 'Today, 12:05 PM', duration: '0:04', status: 'spam', type: 'Spam / Robocall', summary: 'Robocall detected within 4 seconds. Call terminated automatically. No charge applied.', transcript: [
    { who: 'AI', text: "Spam signal detected. Call terminated." },
  ]},
  { id: 4, caller: 'Lisa Park', phone: '(469) 332-9918', time: 'Today, 10:52 AM', duration: '4:33', status: 'answered', type: 'Emergency Service', summary: 'Caller reported HVAC failure. AI triaged as emergency, sent immediate SMS alert to on-call technician.', transcript: [
    { who: 'AI', text: "Thank you for calling. How can I help you today?" },
    { who: 'Caller', text: "My AC just stopped working and it's 102 degrees outside. This is an emergency!" },
    { who: 'AI', text: "I completely understand, this is urgent. I'm alerting your on-call technician right now. Can I get your address?" },
    { who: 'Caller', text: "4821 Maple Drive." },
    { who: 'AI', text: "Got it. I've sent an emergency alert to your technician. They'll call you within 15 minutes. Is there anything else urgent I should pass along?" },
  ]},
  { id: 5, caller: 'David Chen', phone: '(214) 776-4490', time: 'Yesterday, 6:44 PM', duration: '2:08', status: 'answered', type: 'After Hours', summary: 'After-hours call. Caller left message for callback. Full transcript and contact info delivered by email.', transcript: [
    { who: 'AI', text: "You've reached us after business hours. I can take a message or help schedule a callback." },
    { who: 'Caller', text: "Just wanted to ask about rescheduling my appointment tomorrow." },
    { who: 'AI', text: "I can reschedule that for you now. Let me pull up your appointment. Can I get your name?" },
    { who: 'Caller', text: "David Chen." },
    { who: 'AI', text: "Found it! Your appointment is tomorrow at 2pm. I have Thursday at 3pm or Friday at 11am available. Which works?" },
  ]},
  { id: 6, caller: 'Unknown', phone: '(900) 555-0199', time: 'Yesterday, 3:21 PM', duration: '0:06', status: 'spam', type: 'Spam / Robocall', summary: 'Automated spam call detected and terminated. Not charged.', transcript: [
    { who: 'AI', text: "Spam signal detected. Call terminated." },
  ]},
  { id: 7, caller: 'Jennifer Walsh', phone: '(512) 903-2214', time: 'Yesterday, 11:30 AM', duration: '2:55', status: 'answered', type: 'Appointment Booking', summary: 'New patient inquiry. Appointment booked for Monday. Confirmation sent via SMS and email.', transcript: [
    { who: 'AI', text: "Thank you for calling. How can I assist you today?" },
    { who: 'Caller', text: "I'm looking to set up a new patient appointment." },
    { who: 'AI', text: "Welcome! I'd be happy to help. We have openings Monday Aug 17 at 9am or 2pm. Do either of those work?" },
    { who: 'Caller', text: "Monday at 9am is great." },
    { who: 'AI', text: "Perfect! I've booked you in for Monday Aug 17 at 9am. You'll get a confirmation text and email shortly. See you then!" },
  ]},
];

// ============ ANALYTICS CHARTS ============
function renderCharts() {
  // Weekly calls bar chart
  const weekData = [28, 34, 22, 41, 38, 29, 45];
  const weekLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  const maxVal = Math.max(...weekData);
  const weekChart = document.getElementById('weekly-calls-chart');
  if (weekChart) {
    weekChart.innerHTML = weekData.map((v, i) => `
      <div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px">
        <div style="font-size:0.7rem;color:var(--gray-500);font-weight:600">${v}</div>
        <div class="chart-bar" style="height:${Math.max(12, Math.round((v / maxVal) * 100))}px;width:100%;background:${i === 6 ? 'var(--accent)' : 'var(--accent-light)'}"></div>
        <div class="chart-bar-label">${weekLabels[i]}</div>
      </div>`).join('');
  }

  // Call type donut (SVG)
  const donutWrap = document.getElementById('call-type-donut');
  if (donutWrap) {
    const segments = [
      { label: 'Appointment', pct: 41, color: '#0D9488' },
      { label: 'Lead Inquiry', pct: 27, color: '#2DD4BF' },
      { label: 'After Hours', pct: 16, color: '#6EE7B7' },
      { label: 'Spam Blocked', pct: 11, color: '#E5E7EB' },
      { label: 'Emergency', pct: 5, color: '#EF4444' },
    ];
    let cumulative = 0;
    const r = 50, cx = 60, cy = 60, stroke = 18;
    const circumference = 2 * Math.PI * r;
    const paths = segments.map(s => {
      const dash = (s.pct / 100) * circumference;
      const offset = -cumulative / 100 * circumference;
      cumulative += s.pct;
      return `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${stroke}" stroke-dasharray="${dash} ${circumference - dash}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})"/>`;
    });
    donutWrap.innerHTML = `
      <div class="donut-wrap">
        <svg width="120" height="120" class="donut-svg">${paths.join('')}</svg>
        <div class="donut-legend">
          ${segments.map(s => `<div class="donut-item"><span class="donut-dot" style="background:${s.color}"></span><span style="font-size:0.83rem;color:var(--gray-700)">${s.label}</span><span style="margin-left:auto;font-size:0.83rem;font-weight:700;color:var(--black);padding-left:12px">${s.pct}%</span></div>`).join('')}
        </div>
      </div>`;
  }

  // Monthly trend sparklines
  const sparkles = document.querySelectorAll('.spark-auto');
  sparkles.forEach(sp => {
    const count = 12;
    const heights = Array.from({ length: count }, () => Math.round(Math.random() * 20 + 5));
    sp.innerHTML = heights.map(h => `<span style="height:${h}px"></span>`).join('');
  });
}

// ============ SETTINGS SAVE ============
function saveSettings(section) {
  const btn = document.getElementById('save-btn-' + section);
  if (!btn) return;
  btn.textContent = 'Saving...';
  btn.disabled = true;
  setTimeout(() => {
    btn.textContent = 'Saved ✓';
    btn.style.background = 'var(--green)';
    setTimeout(() => {
      btn.textContent = 'Save Changes';
      btn.style.background = '';
      btn.disabled = false;
    }, 2000);
  }, 800);
}

// ============ COPY PHONE NUMBER ============
function copyPhone() {
  navigator.clipboard.writeText('+1 (888) 555-0192').then(() => {
    const btn = document.getElementById('copy-phone-btn');
    if (btn) {
      const orig = btn.textContent;
      btn.textContent = 'Copied!';
      setTimeout(() => btn.textContent = orig, 1500);
    }
  });
}

// ============ CONNECT INTEGRATION ============
function connectIntegration(id) {
  const card = document.getElementById('int-' + id);
  if (!card) return;
  const btn = card.querySelector('.int-btn');
  if (btn) {
    btn.textContent = 'Connecting...';
    btn.disabled = true;
  }
  setTimeout(() => {
    card.classList.add('connected');
    if (btn) {
      btn.textContent = 'Connected ✓';
      btn.className = 'btn btn-xs btn-ghost';
      btn.disabled = false;
    }
    const statusEl = card.querySelector('.integration-status');
    if (statusEl) statusEl.style.display = 'flex';
  }, 1200);
}

// ============ UPGRADE PLAN ============
function upgradePlan(plan) {
  alert(`Redirecting to checkout for the ${plan} plan…\n(Payment integration goes here)`);
}

// ============ INIT ============
document.addEventListener('DOMContentLoaded', function () {
  // Start on home page
  go('home');

  // Init ROI calculator
  const roi = document.getElementById('r-miss');
  if (roi) { calcROI(); ['r-miss', 'r-val', 'r-conv', 'r-plan'].forEach(id => document.getElementById(id)?.addEventListener('input', calcROI)); }

  // Init solutions
  if (document.getElementById('sol-content')) loadSol('answering');

  // Init industries
  if (document.getElementById('ind-content')) loadInd('hvac');

  // Init pricing cycle
  setPricingCycle('monthly');

  // Render charts when analytics page is shown (mutation observer)
  const observer = new MutationObserver(mutations => {
    mutations.forEach(m => {
      if (m.target.id === 'dash-analytics' && m.target.classList.contains('active')) {
        renderCharts();
      }
    });
  });
  document.querySelectorAll('.dash-page').forEach(p => {
    observer.observe(p, { attributes: true, attributeFilter: ['class'] });
  });
});
