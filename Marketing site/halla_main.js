/* ================================================
   Halla AI — Main JavaScript
   Includes: page routing, ROI calculator,
   FAQ accordion, Solutions & Industries content
   © 2025 Halla AI
================================================ */

// ============ SITE SECTION MODE (Consultancy vs AI Receptionist) ============
// The site is split into two audience-facing sections that swap in a
// dedicated nav + footer: 'consultancy' (Halla AI Consultancy) and
// 'receptionist' (the AI Receptionist product: Product/Solutions/
// Industries/Pricing/Resources). page-consultancy is the only page in the
// consultancy section; every other page belongs to the receptionist section.
function sectionForPage(page) {
  const consultancyPages = ['consultancy', 'svc-operations', 'svc-acquisition', 'svc-brand', 'consult-signup'];
  return consultancyPages.includes(page) ? 'consultancy' : 'receptionist';
}
function setSectionMode(section) {
  document.body.setAttribute('data-section', section);
  document.querySelectorAll('.section-switch-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.section === section);
  });
  const ctaBtn = document.getElementById('navPrimaryCta');
  if (ctaBtn) {
    ctaBtn.textContent = (section === 'consultancy') ? 'Book a Consultation →' : 'Get My AI Receptionist →';
  }
  const footerCtaBtn = document.getElementById('footerPrimaryCta');
  if (footerCtaBtn) {
    footerCtaBtn.textContent = (section === 'consultancy') ? 'Book a Consultation →' : 'Get My AI Receptionist →';
  }
}
function switchSection(section) {
  if (section === 'consultancy') { go('consultancy'); }
  else { go('home'); }
}
function navPrimaryCtaClick() {
  const section = document.body.getAttribute('data-section') || 'consultancy';
  if (section === 'consultancy') { go('consult-signup'); }
  else { go('signup'); }
}
function logoClick() {
  const section = document.body.getAttribute('data-section') || 'consultancy';
  switchSection(section);
}
// Scroll to an anchor within the (already active) consultancy page.
function scrollToConsultSection(anchorId) {
  go('consultancy');
  setTimeout(() => {
    const el = document.getElementById(anchorId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

// ============ ROUTING + DEEP LINKS ============
const DEFAULT_PAGE = 'consultancy';
const CONSULTANCY_PAGES = new Set(['consultancy', 'svc-operations', 'svc-acquisition', 'svc-brand', 'consult-signup']);

function pageExists(page) {
  return !!document.getElementById('page-' + page);
}

function hashForPage(page, sub) {
  if (!page) return '';
  if (page === 'consultancy') return '';
  if (page === 'solutions' && sub) return '#solutions/' + sub;
  if (page === 'industries' && sub) return '#industries/' + sub;
  return '#' + page;
}

function parseHash() {
  const raw = (location.hash || '').replace(/^#/, '');
  if (!raw) return { page: DEFAULT_PAGE };
  if (raw.startsWith('solutions/')) {
    const sub = raw.split('/')[1];
    return pageExists('solutions-' + sub) ? { page: 'solutions-' + sub } : { page: 'solutions', sub };
  }
  if (raw.startsWith('industries/')) {
    const sub = raw.split('/')[1];
    return { page: 'industries', sub };
  }
  return { page: raw };
}

function routeFromHash(opts) {
  const { page, sub } = parseHash();
  if (!pageExists(page)) {
    go(DEFAULT_PAGE, Object.assign({ silent: true }, opts));
    return;
  }
  go(page, Object.assign({ silent: true }, opts));
  if (page === 'solutions' && sub && typeof loadSol === 'function') loadSol(sub);
  if (page === 'industries' && sub && typeof loadInd === 'function') loadInd(sub);
}

function go(page, opts) {
  const options = opts || {};
  const authHref = { login: '/login', signup: '/signup' }[page];
  if (authHref && !pageExists(page)) {
    window.location.href = authHref;
    return;
  }

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const el = document.getElementById('page-' + page);
  if (el) {
    el.classList.add('active');
    window.scrollTo({ top: 0, behavior: options.noScroll ? 'auto' : 'smooth' });
  } else {
    const fallback = document.getElementById('page-' + DEFAULT_PAGE);
    if (fallback) fallback.classList.add('active');
    page = DEFAULT_PAGE;
  }

  setSectionMode(sectionForPage(page));
  closeMob();
  closeAllDropdowns();

  if (!options.silent && !window.HALLA_EMBEDDED) {
    const nextHash = hashForPage(page, options.sub);
    if (nextHash) {
      if (location.hash !== nextHash) history.pushState({ page }, '', nextHash);
    } else if (location.hash) {
      history.pushState({ page }, '', location.pathname + location.search);
    }
  }

  onPageActivated(page);
}
function goSol(sub) {
  if (pageExists('solutions-' + sub)) {
    go('solutions-' + sub);
    return;
  }
  go('solutions', { sub });
  loadSol(sub);
}
function goInd(sub) {
  if (sub === 'all') {
    go('industries-all');
  } else {
    go('industries');
    loadInd(sub);
  }
}

// ============ MOBILE NAV ============
function toggleMob() { document.getElementById('mob-nav').classList.toggle('open'); }
function closeMob() { document.getElementById('mob-nav').classList.remove('open'); }

// ============ DESKTOP DROPDOWN NAV ============
// Click-based (not hover-only) so the menu stays open while the user
// moves the mouse or scrolls down to reach a sublink.
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
document.addEventListener('click', function(evt) {
  if (!evt.target.closest('.nav-item')) { closeAllDropdowns(); }
});
document.addEventListener('keydown', function(evt) {
  if (evt.key === 'Escape') { closeAllDropdowns(); }
});

// ============ FAQ ============
function faqToggle(el) { el.parentElement.classList.toggle('open'); }

// ============ ROI ============
function calcROI() {
  const miss = +document.getElementById('r-miss').value || 0;
  const val = +document.getElementById('r-val').value || 0;
  const conv = +document.getElementById('r-conv').value || 0;
  const plan = +document.getElementById('r-plan').value || 149;
  const monthly = Math.round(miss * (conv/100) * val);
  const annual = monthly * 12;
  const cost = plan * 12;
  const net = Math.max(0, annual - cost);
  const mult = cost > 0 ? (annual/cost).toFixed(1) : '∞';
  document.getElementById('r-monthly').textContent = '$' + monthly.toLocaleString();
  document.getElementById('r-annual').textContent = '$' + annual.toLocaleString();
  document.getElementById('r-cost').textContent = '$' + cost.toLocaleString();
  document.getElementById('r-net').textContent = '$' + net.toLocaleString();
  document.getElementById('r-mult').textContent = 'Net Annual ROI — ' + mult + 'x your investment';
}

// ============ SOLUTIONS ============
const SOLS = {
  answering: { title: '24/7 AI Answering Service', sub: 'Never miss a customer call again. Every call answered instantly.', icon: '<i class="ti ti-phone"></i>', desc: 'Halla AI answers every inbound call 24 hours a day, 7 days a week, 365 days a year — including holidays, weekends, and 3am emergencies. No hold music. No voicemail. Instant, professional response every time.', feats: ['Answers in under 2 seconds','Unlimited simultaneous calls','Custom greeting with your business name','Bilingual English + Spanish','Call summaries via email & SMS','Zero spam charges'] },
  scheduling: { title: 'Appointment Scheduling', sub: 'Book, reschedule, and cancel appointments automatically.', icon: '<i class="ti ti-calendar"></i>', desc: 'Your AI receptionist checks your calendar in real-time and books appointments without you lifting a finger. Integrates with Google Calendar, Outlook, and Calendly natively, and 5,000+ more via Zapier.', feats: ['Real-time calendar check','Book, reschedule, and cancel','Automatic confirmation via SMS & email','Multiple appointment types','Business hours & blackout dates','Calendly, Google Calendar, Acuity, and more'] },
  messages: { title: 'Message Taking', sub: 'Detailed call summaries delivered to your phone and email instantly.', icon: '<i class="ti ti-mail"></i>', desc: 'Every call transcribed and summarized. Caller name, phone, purpose, details — delivered to your email and SMS within seconds.', feats: ['Full call transcript','SMS & email delivery','Caller contact info captured','Urgency flagged automatically','Searchable call history','CRM auto-entry'] },
  leads: { title: 'Lead Capture & Qualification', sub: 'Custom questions. Smart routing. Only talk to what matters.', icon: '<i class="ti ti-target"></i>', desc: 'Define your ideal customer. The AI asks custom qualification questions, scores leads, and routes hot leads to your phone while cold leads go to your CRM for follow-up.', feats: ['Custom qualification questions','Lead scoring','Hot leads → instant SMS to you','Cold leads → CRM auto-entry','HubSpot, Salesforce, Pipedrive native','Conversion tracking dashboard'] },
  routing: { title: 'Call Routing & Forwarding', sub: 'The right call goes to the right person at the right time.', icon: '<i class="ti ti-arrows-shuffle"></i>', desc: 'Route calls based on intent, time of day, agent availability, or custom logic. Emergency? Instant SMS. Routine? Logged and handled. After hours? Custom rules.', feats: ['Intent-based routing','Time-of-day rules','Emergency vs. routine triage','Transfer to your cell on demand','Department routing','After-hours & holiday rules'] },
  multilingual: { title: 'Multi-Lingual Answering', sub: 'Never lose a Spanish-speaking customer again.', icon: '<i class="ti ti-language"></i>', desc: 'English and Spanish included on every plan. The AI automatically detects caller language and responds accordingly. Enterprise supports up to 5 languages.', feats: ['English + Spanish on all plans','Auto language detection','Full feature support in both languages','Up to 5 languages on Enterprise','No extra charge for bilingual','Consistent quality in all languages'] },
  afterhours: { title: 'After Hours Calls', sub: 'Your business never closes. Neither does your AI.', icon: '<i class="ti ti-moon"></i>', desc: 'Set different rules for different times. After hours, weekends, and holidays all handled with custom greetings, routing, and emergency escalation.', feats: ['Separate rules per time window','Emergency escalation after hours','Custom after-hours greeting','On-call team SMS alerts','Appointment booking 24/7','Morning summary of overnight calls'] },
  screening: { title: 'Call Screening & Spam Blocking', sub: 'You never pay for spam. Zero tolerance for robocalls.', icon: '<i class="ti ti-shield"></i>', desc: 'AI detects spam within seconds and hangs up automatically. You are never charged. For legitimate calls, the AI screens and qualifies before connecting to you.', feats: ['Spam & robocall detection in seconds','Never pay for spam calls','Screen caller purpose before transfer','Block known spam numbers','Spam log for your records','Caller authentication option'] },
};
function loadSol(key) {
  const s = SOLS[key] || SOLS.answering;
  document.getElementById('sol-title').textContent = s.title;
  document.getElementById('sol-sub').textContent = s.sub;
  document.getElementById('sol-content').innerHTML = `
    <div class="grid-2" style="gap:64px;align-items:start">
      <div>
        <div style="font-size:2.8rem;margin-bottom:20px">${s.icon}</div>
        <p style="font-size:1.05rem;margin-bottom:32px">${s.desc}</p>
        <h3 style="margin-bottom:18px">Key Capabilities</h3>
        <div style="display:grid;gap:10px">
          ${s.feats.map(f=>`<div class="pricing-feature" style="color:var(--gray-700)">${f}</div>`).join('')}
        </div>
        <div style="margin-top:28px;display:flex;gap:12px;flex-wrap:wrap">
          <a class="btn btn-primary" href="javascript:void(0)" onclick="go('signup')">Start Free Trial →</a>
          <a class="btn btn-outline" href="javascript:void(0)" onclick="go('pricing')">View Pricing</a>
        </div>
      </div>
      <div>
        <div class="ptabs" style="flex-wrap:wrap">
          ${Object.keys(SOLS).map(k=>`<div class="ptab${k===key?' active':''}" onclick="loadSol('${k}');document.getElementById('sol-title').textContent='${SOLS[k].title}';document.getElementById('sol-sub').textContent='${SOLS[k].sub}'">${SOLS[k].icon} ${SOLS[k].title.split(' ')[0]}</div>`).join('')}
        </div>
        <div class="cta-block" style="margin-top:20px;padding:40px 36px">
          <h3 style="margin-bottom:10px">One call pays for months.</h3>
          <p>Businesses lose $5,000+/month in missed calls. Halla AI pays for itself in the first week.</p>
          <div class="btn-group"><a class="btn btn-blue" href="javascript:void(0)" onclick="go('roi')">Calculate My ROI →</a></div>
        </div>
      </div>
    </div>`;
}

// ============ INDUSTRIES ============
const INDS = {
  hvac: { name:'HVAC', icon:'<i class="ti ti-snowflake"></i>', tag:'Keep Your Schedule Hot. Not Your Customers.', desc:'Halla AI dispatches HVAC technicians 24/7 — handling no-heat emergencies in winter, no-AC calls in summer, and maintenance bookings all year round while you\'re in an attic or under a house.', faqs:[['How does Halla AI handle seasonal demand spikes?','The AI scales automatically. During heat waves or cold snaps, it handles hundreds of simultaneous calls without busy signals. You define priority rules — AI follows them consistently.'],['Can the AI diagnose basic HVAC problems?','Yes. It guides homeowners through basic troubleshooting (thermostat batteries, resetting breakers, changing filters). If not resolved, it escalates for dispatch.'],['How does Halla AI handle carbon monoxide concerns?','CO-related calls are flagged as highest priority. The AI instructs the homeowner to evacuate and call the fire department, then immediately alerts your team.']] },
  plumbing: { name:'Plumbing', icon:'<i class="ti ti-tool"></i>', tag:'Stop Leaks. Not Leads.', desc:'Captures emergency details, books service windows, and sends job summaries instantly to your phone when you\'re knee-deep in a flooded basement — burst pipes, clogged drains, water heaters, and routine maintenance.', faqs:[['How does Halla AI handle after-hours emergency calls?','You define what\'s an emergency. The AI collects details and immediately notifies your on-call plumber via text with the full job summary.'],['Can the AI provide estimates over the phone?','Yes — service call fees, hourly rates, and common flat-rate pricing. For complex estimates, it collects details and schedules an on-site assessment.'],['What if a customer has a gas line concern?','Gas-related calls are flagged as highest priority with immediate team notification and instructions to evacuate and call the gas company.']] },
  electrical: { name:'Electrical', icon:'<i class="ti ti-bolt"></i>', tag:'Power Your Business Growth.', desc:'Captures emergency details when you\'re up to your elbows in a panel. Handles questions about service areas, hourly rates, availability, and routes emergency calls instantly.', faqs:[['How does Halla AI handle electrical emergencies?','You define emergency criteria. The AI collects details and immediately notifies your on-call electrician via text with the full job summary.'],['Can the AI provide estimates?','Service call fees and hourly rates yes. For full estimates, it schedules an on-site assessment.'],['What if a caller describes something the AI doesn\'t understand?','The AI collects the description verbatim, flags for review, and promises a callback. No technical diagnosis attempted.']] },
  landscaping: { name:'Landscaping', icon:'<i class="ti ti-leaf"></i>', tag:'Grow Your Business. Never Miss a Spring Call.', desc:'Captures property details, books estimates, and handles mowing schedules, fertilization programs, tree services, and snow removal bookings while you\'re on a zero-turn or trimming hedges.', faqs:[['Can the AI handle different service frequencies?','Yes. Weekly, bi-weekly, monthly, or one-time. Recurring services booked automatically.'],['Can the AI provide mowing quotes?','Yes, based on property size using your standard rate. Complex properties require an on-site estimate.'],['How does the AI handle emergency tree removal?','Storm-damaged tree calls are dispatched immediately. AI captures tree details and schedules an arborist visit.']] },
  cleaning: { name:'Home Cleaning', icon:'<i class="ti ti-wash"></i>', tag:'Clean More Homes. Never Miss a Quote.', desc:'Captures property details, books estimates and recurring services for standard, deep, move-out, and commercial cleaning while you\'re driving between jobs.', faqs:[['Can the AI provide quotes over the phone?','For standard recurring cleans, yes — firm pricing based on bedroom/bathroom count. For deep or move-out cleans, a virtual or in-person estimate is needed.'],['How does Halla AI handle recurring scheduling?','Sets up weekly, bi-weekly, or monthly recurring appointments based on route availability. Confirmed via SMS and email.'],['What if a customer needs to skip a week?','The AI reschedules single occurrences or modifies the recurring pattern based on your rescheduling policy.']] },
  legal: { name:'Legal Firms', icon:'<i class="ti ti-scale"></i>', tag:'Never Miss a Billable Consultation Call.', desc:'Captures potential client details, books initial consultations, and logs intake into your practice management system while you\'re in court, drafting documents, or meeting with existing clients.', faqs:[['How does Halla AI handle attorney-client confidentiality?','All calls processed through encrypted systems. Transcripts stored securely. The AI never shares client info with third parties.'],['Can the AI screen for conflicts of interest?','Yes. You provide conflict check questions. The AI collects this during intake and flags potential conflicts before scheduling.'],['Can the AI handle different practice areas?','Yes. Separate intake flows per practice area — different questions for PI vs. estate planning vs. criminal defense.']] },
};

function loadInd(key) {
  if (key === 'all') {
    document.getElementById('ind-label').textContent = 'Industries';
    document.getElementById('ind-title').textContent = 'Industries We Serve';
    document.getElementById('ind-sub').textContent = '50+ industries. Pre-configured. Ready in minutes.';
    document.getElementById('ind-content').innerHTML = `
      <div style="margin-bottom:48px">
        <p style="font-size:0.78rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray-400);margin-bottom:20px">Trades & Services</p>
        <div class="grid-4" style="gap:16px">
          ${['hvac','plumbing','electrical','landscaping'].map(k=>`<a class="ind-card" href="javascript:void(0)" onclick="loadInd('${k}')"><div class="ind-icon">${INDS[k].icon}</div><h4>${INDS[k].name}</h4><p>${INDS[k].tag}</p></a>`).join('')}
        </div>
      </div>
      <div style="margin-bottom:48px">
        <p style="font-size:0.78rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray-400);margin-bottom:20px">Professional Services</p>
        <div class="grid-4" style="gap:16px">
          ${['hvac','plumbing','electrical'].map(k=>`<a class="ind-card" href="javascript:void(0)" onclick="loadInd('${k}')"><div class="ind-icon">${INDS[k].icon}</div><h4>${INDS[k].name}</h4><p>${INDS[k].tag}</p></a>`).join('')}
          <a class="ind-card" href="javascript:void(0)"><div class="ind-icon"><i class="ti ti-building"></i></div><h4>Property Management</h4><p>Maintenance requests, tenant calls, emergency routing</p></a>
        </div>
      </div>
      <div style="margin-bottom:48px">
        <p style="font-size:0.78rem;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:var(--gray-400);margin-bottom:20px">Beauty & Automotive & More</p>
        <div class="grid-4" style="gap:16px">
          <a class="ind-card" href="javascript:void(0)"><div class="ind-icon"><i class="ti ti-scissors"></i></div><h4>Salons & Spas</h4><p>Booking, pricing, availability</p></a>
          <a class="ind-card" href="javascript:void(0)"><div class="ind-icon"><i class="ti ti-car"></i></div><h4>Auto Repair</h4><p>Service appointments, estimates</p></a>
          <a class="ind-card" href="javascript:void(0)"><div class="ind-icon"><i class="ti ti-paw"></i></div><h4>Veterinary</h4><p>Appointments, emergency triage</p></a>
          <a class="ind-card" href="javascript:void(0)"><div class="ind-icon"><i class="ti ti-book"></i></div><h4>Education</h4><p>Enrollment, tuition, scheduling</p></a>
        </div>
      </div>
      <div class="cta-block"><h3 style="margin-bottom:10px">Don\'t See Your Industry?</h3><p>We support 50+ industries. Contact us — we\'ll build a custom template for free.</p><div class="btn-group"><a class="btn btn-blue" href="javascript:void(0)" onclick="go('signup')">Get My AI Receptionist →</a></div></div>`;
    return;
  }
  const ind = INDS[key];
  if (!ind) return;
  document.getElementById('ind-label').textContent = ind.name;
  document.getElementById('ind-title').textContent = 'Halla AI for ' + ind.name;
  document.getElementById('ind-sub').textContent = ind.tag;
  document.getElementById('ind-content').innerHTML = `
    <div class="grid-2" style="gap:64px;align-items:start">
      <div>
        <div style="font-size:2.8rem;margin-bottom:20px">${ind.icon}</div>
        <p style="font-size:1.05rem;margin-bottom:32px">${ind.desc}</p>
        <h3 style="margin-bottom:16px">What Halla AI Does for ${ind.name}</h3>
        <div style="display:grid;gap:10px;margin-bottom:28px">
          <div class="pricing-feature" style="color:var(--gray-700)">Answers every call 24/7 — even during jobs</div>
          <div class="pricing-feature" style="color:var(--gray-700)">Custom intake questions for your service type</div>
          <div class="pricing-feature" style="color:var(--gray-700)">Emergency triage and immediate team alerts</div>
          <div class="pricing-feature" style="color:var(--gray-700)">Appointment booking and calendar sync</div>
          <div class="pricing-feature" style="color:var(--gray-700)">Lead qualification and CRM auto-entry</div>
          <div class="pricing-feature" style="color:var(--gray-700)">Bilingual English + Spanish support</div>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap">
          <a class="btn btn-primary" href="javascript:void(0)" onclick="go('signup')">Start Free Trial →</a>
          <a class="btn btn-outline" href="javascript:void(0)" onclick="go('pricing')">View Pricing</a>
        </div>
      </div>
      <div>
        <h3 style="margin-bottom:18px">Frequently Asked Questions</h3>
        ${(ind.faqs||[]).map(([q,a])=>`<div class="faq-item"><div class="faq-q" onclick="faqToggle(this)">${q} <span class="faq-icon">+</span></div><div class="faq-a">${a}</div></div>`).join('')}
        <div style="margin-top:24px">
          <h4 style="margin-bottom:14px;color:var(--gray-400);font-size:0.8rem;text-transform:uppercase;letter-spacing:0.07em">Other Industries</h4>
          <div style="display:flex;flex-wrap:wrap;gap:8px">
            ${Object.keys(INDS).filter(k=>k!==key).map(k=>`<a class="pill" href="javascript:void(0)" onclick="loadInd('${k}')">${INDS[k].icon} ${INDS[k].name}</a>`).join('')}
            <a class="pill" href="javascript:void(0)" onclick="loadInd('all')" style="color:var(--accent)">+ See All</a>
          </div>
        </div>
      </div>
    </div>`;
}

// ============ FOOTER FIX ============
(function fixFooterLayout() {
  /* layout handled in CSS */
})();

// ============ PAGE ACTIVATION HOOKS ============
function onPageActivated(page) {
  if (window.HallaNeural && HallaNeural.refreshForPage) {
    HallaNeural.refreshForPage(page);
  }
  requestAnimationFrame(() => {
    initScrollAnimations();
    if (CONSULTANCY_PAGES.has(page)) initConsultCounters();
  });
}

// ============ GSAP SCROLL REVEALS ============
function initScrollAnimations() {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const targets = document.querySelectorAll('.reveal-up:not(.gsap-bound)');
  if (!targets.length) return;

  if (reduceMotion || typeof gsap === 'undefined') {
    targets.forEach(el => el.classList.add('is-visible'));
    return;
  }

  if (typeof ScrollTrigger !== 'undefined') gsap.registerPlugin(ScrollTrigger);

  targets.forEach((el) => {
    el.classList.add('gsap-bound');
    const delay = parseFloat(getComputedStyle(el).getPropertyValue('--reveal-delay')) || 0;
    const inView = el.getBoundingClientRect().top < window.innerHeight * 0.92;

    if (inView) {
      gsap.fromTo(el,
        { opacity: 0, y: 36 },
        { opacity: 1, y: 0, duration: 0.75, ease: 'power3.out', delay }
      );
      return;
    }

    gsap.fromTo(el,
      { opacity: 0, y: 36 },
      {
        opacity: 1, y: 0, duration: 0.75, ease: 'power3.out', delay,
        scrollTrigger: { trigger: el, start: 'top 88%', once: true },
      }
    );
  });
}

// ============ CONSULTANCY STAT COUNTERS ============
let consultCountersStarted = false;
function initConsultCounters() {
  if (consultCountersStarted) return;
  const nums = document.querySelectorAll('#page-consultancy .consult-bento-num[data-count]');
  if (!nums.length) return;
  consultCountersStarted = true;

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  nums.forEach((el) => {
    const target = parseInt(el.dataset.count, 10);
    if (reduceMotion || isNaN(target)) {
      el.textContent = target;
      return;
    }
    const obj = { val: 0 };
    if (typeof gsap !== 'undefined') {
      gsap.to(obj, {
        val: target, duration: 1.6, ease: 'power2.out', delay: 0.3,
        onUpdate: () => { el.textContent = Math.round(obj.val); },
      });
    } else {
      el.textContent = target;
    }
  });
}

// ============ LANGUAGE TOGGLE ============
function setLang(lang) {
  const supported = ['en', 'ar'];
  const safeLang = supported.includes(lang) ? lang : 'en';
  const dir = safeLang === 'ar' ? 'rtl' : 'ltr';
  const html = document.documentElement;
  html.setAttribute('dir', dir);
  html.setAttribute('lang', safeLang);
  const root = document.getElementById('marketing-spa-root');
  if (root) {
    root.setAttribute('dir', dir);
    root.setAttribute('lang', safeLang);
  }
  document.querySelectorAll('.lang-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === safeLang);
  });
  try { localStorage.setItem('halla_lang', safeLang); } catch (e) {}
}

// ============ INIT ============
function hallaInit() {
  calcROI();
  let savedLang = 'en';
  try { savedLang = localStorage.getItem('halla_lang') || 'en'; } catch (e) {}
  setLang(savedLang);

  if (!window.HALLA_EMBEDDED) {
    window.addEventListener('popstate', () => routeFromHash({ noScroll: true }));
    routeFromHash({ noScroll: true });
  }

  initPhone3D();
  initBrowserFrameTilt();
  initConsultForm();
  if (window.HallaNeural && typeof HallaNeural.init === 'function') {
    HallaNeural.init();
  }
}

if (document.readyState === 'loading') {
  window.addEventListener('DOMContentLoaded', hallaInit);
} else {
  hallaInit();
}

function initConsultForm() {
  const btn = document.getElementById('consultSignupBtn');
  const form = btn && btn.closest('.card');
  if (!btn || !form) return;
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    const inputs = form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"]');
    let valid = true;
    inputs.forEach((inp) => {
      inp.style.borderColor = '';
      if (!inp.value.trim()) {
        inp.style.borderColor = 'var(--red)';
        valid = false;
      }
    });
    const email = form.querySelector('input[type="email"]');
    if (email && email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value)) {
      email.style.borderColor = 'var(--red)';
      valid = false;
    }
    if (!valid) return;
    alert('Thank you! We will reach out within 1 business day to schedule your diagnostic call.');
  });
}

// ============ HERO NEURAL — handled by halla_neural.js (Three.js) ============

// ============ ROTATABLE 3D PHONE (drag to rotate) ============
function initPhone3D() {
  const wrap = document.querySelector('.mockup-wrap');
  if (!wrap) return;
  const mockup = wrap.querySelector('.mockup');
  if (!mockup || mockup.closest('.phone-3d-inner')) return;

  // Build the 3D frame around the existing mockup content
  const stage = document.createElement('div');
  stage.className = 'phone-3d-stage';
  const inner = document.createElement('div');
  inner.className = 'phone-3d-inner';

  mockup.parentNode.insertBefore(stage, mockup);
  stage.appendChild(inner);
  inner.appendChild(mockup);
  mockup.classList.add('phone-3d-face');

  const hint = document.createElement('div');
  hint.className = 'phone-3d-hint';
  hint.innerHTML = '<i class="ti ti-arrows-shuffle"></i> Drag to rotate';
  stage.appendChild(hint);

  let rotY = -12, rotX = 4;
  let isDragging = false;
  let startX = 0, startY = 0, startRotY = 0, startRotX = 0;
  let idleRAF = null;
  let idleT = 0;

  function apply() {
    inner.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
  }

  function idleFloat() {
    idleT += 0.01;
    if (!isDragging) {
      rotY = -12 + Math.sin(idleT) * 6;
      rotX = 4 + Math.cos(idleT * 0.8) * 2;
      apply();
    }
    idleRAF = requestAnimationFrame(idleFloat);
  }
  apply();
  idleRAF = requestAnimationFrame(idleFloat);

  function onDown(clientX, clientY) {
    isDragging = true;
    startX = clientX; startY = clientY;
    startRotY = rotY; startRotX = rotX;
    stage.classList.add('dragging');
    hint.style.opacity = '0';
  }
  function onMove(clientX, clientY) {
    if (!isDragging) return;
    const dx = clientX - startX;
    const dy = clientY - startY;
    rotY = startRotY + dx * 0.4;
    rotX = startRotX - dy * 0.25;
    rotX = Math.max(-25, Math.min(25, rotX));
    apply();
  }
  function onUp() {
    isDragging = false;
    stage.classList.remove('dragging');
  }

  stage.addEventListener('mousedown', (e) => onDown(e.clientX, e.clientY));
  window.addEventListener('mousemove', (e) => onMove(e.clientX, e.clientY));
  window.addEventListener('mouseup', onUp);

  stage.addEventListener('touchstart', (e) => {
    const t0 = e.touches[0];
    onDown(t0.clientX, t0.clientY);
  }, { passive: true });
  stage.addEventListener('touchmove', (e) => {
    const t0 = e.touches[0];
    onMove(t0.clientX, t0.clientY);
  }, { passive: true });
  stage.addEventListener('touchend', onUp);
}

// ============ BROWSER FRAME PARALLAX TILT ============
function initBrowserFrameTilt() {
  const frames = document.querySelectorAll('.browser-frame');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  frames.forEach((frame) => {
    frame.classList.add('tilt-3d');
    if (reduceMotion) return;

    let rect = null;
    function refreshRect() { rect = frame.getBoundingClientRect(); }
    refreshRect();
    window.addEventListener('resize', refreshRect);

    frame.addEventListener('mouseenter', refreshRect);
    frame.addEventListener('mousemove', (e) => {
      if (!rect) refreshRect();
      const px = (e.clientX - rect.left) / rect.width;
      const py = (e.clientY - rect.top) / rect.height;
      const rotY = (px - 0.5) * 10;
      const rotX = (0.5 - py) * 8;
      frame.style.transform = `perspective(1200px) rotateX(${rotX}deg) rotateY(${rotY}deg) scale3d(1.01,1.01,1.01)`;
    });
    frame.addEventListener('mouseleave', () => {
      frame.style.transform = 'perspective(1200px) rotateX(0deg) rotateY(0deg) scale3d(1,1,1)';
    });

    // subtle scroll-driven tilt too
    window.addEventListener('scroll', () => {
      if (!rect) refreshRect();
      const vh = window.innerHeight;
      const center = rect.top + rect.height / 2;
      const progress = Math.max(-1, Math.min(1, (center - vh / 2) / (vh / 2)));
      if (!frame.matches(':hover')) {
        frame.style.transform = `perspective(1200px) rotateX(${progress * -4}deg) rotateY(0deg)`;
      }
    }, { passive: true });
  });
}