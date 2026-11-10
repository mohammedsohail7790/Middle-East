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
// Industries/Pricing/Resources). page-consultancy is the hub (umbrella hero +
// three-pillar strip) and page-ai-consultancy is the consultancy spoke; both,
// plus the service/audit/booking pages, belong to the consultancy section.
// Every other page belongs to the receptionist section.
function sectionForPage(page) {
  const consultancyPages = ['consultancy', 'ai-consultancy', 'svc-operations', 'consult-signup', 'fit-check', 'audit-info', 'audit', 'audit-pay', 'audit-paid'];
  const intelligencePages = ['intelligence'];
  if (consultancyPages.includes(page)) return 'consultancy';
  if (intelligencePages.includes(page)) return 'intelligence';
  return 'receptionist';
}
// Section -> { en, ar } primary CTA copy. Arabic uses ← (not →) since the
// whole button reads right-to-left in RTL, matching every other
// arrow-suffixed CTA on the site (see the hero's own lang-ar copy).
const SECTION_CTA_TEXT = {
  consultancy: { en: 'Book a Call →', ar: 'احجز مكالمة ←' },
  intelligence: { en: 'Book a Call →', ar: 'احجز مكالمة ←' },
  receptionist: { en: 'Start Free Trial →', ar: 'ابدأ التجربة المجانية ←' },
};
function applyPrimaryCtaText() {
  const section = document.body.getAttribute('data-section') || 'consultancy';
  const lang = document.documentElement.lang === 'ar' ? 'ar' : 'en';
  const ctaText = (SECTION_CTA_TEXT[section] || SECTION_CTA_TEXT.receptionist)[lang];
  const ctaBtn = document.getElementById('navPrimaryCta');
  if (ctaBtn) ctaBtn.textContent = ctaText;
  const footerCtaBtn = document.getElementById('footerPrimaryCta');
  if (footerCtaBtn) footerCtaBtn.textContent = ctaText;
}
// The Halla AI home (page-consultancy) is neutral too. Company-wide pages (About, Terms, Privacy, Security) belong to no single
// product. They keep whichever nav/footer the visitor arrived with (the
// hub's consultancy set by default) but must not light up a product tab.
const COMPANY_PAGES = new Set(['about', 'contact', 'terms', 'privacy', 'security']);
function setSectionMode(section, neutral) {
  document.body.setAttribute('data-section', section);
  document.querySelectorAll('.section-switch-btn').forEach(b => {
    const on = !neutral && b.dataset.section === section;
    b.classList.toggle('active', on); if (b.tagName === 'BUTTON') b.setAttribute('aria-pressed', String(on));
  });
  applyPrimaryCtaText();
}
function switchSection(section) {
  if (section === 'consultancy') { go('ai-consultancy'); }
  else if (section === 'intelligence') { go('intelligence'); }
  else { go('home'); }
}
function navPrimaryCtaClick() {
  const section = document.body.getAttribute('data-section') || 'consultancy';
  if (section === 'consultancy') { go('consult-signup'); }
  else if (section === 'intelligence') { go('consult-signup'); }
  else { go('signup'); }
}
function logoClick() {
  const section = document.body.getAttribute('data-section') || 'consultancy';
  // The hub is the Halla AI home page; the Consultancy tab is its own page.
  if (section === 'consultancy') { go('consultancy'); return; }
  switchSection(section);
}
// Scroll to an anchor on the AI Consultancy spoke page (page-ai-consultancy).
function scrollToConsultSection(anchorId) {
  go('ai-consultancy', { noScroll: true });
  setTimeout(() => {
    const el = document.getElementById(anchorId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

// Scroll to a section of the AI Receptionist page (page-home).
function scrollToHomeSection(anchorId) {
  go('home', { noScroll: true });
  setTimeout(() => {
    const el = document.getElementById(anchorId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

// Scroll to an anchor within the AI Business Automation page (stays on hallaai).
function scrollToIntelSection(anchorId) {
  go('intelligence', { noScroll: true });
  setTimeout(() => {
    const el = document.getElementById(anchorId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 60);
}

// ============ ROUTING + DEEP LINKS ============
const DEFAULT_PAGE = 'consultancy';
const CONSULTANCY_PAGES = new Set(['consultancy', 'ai-consultancy', 'svc-operations', 'consult-signup', 'fit-check', 'audit-info', 'audit', 'audit-pay', 'audit-paid']);
// The site is light-themed everywhere now, so no page runs the starfield
// backdrop or glassmorphism card treatment — both were built for a dark
// background (bright stars, translucent glass over near-black) and don't
// read against white. Kept as an empty set (rather than deleting the
// has-cosmic-bg wiring below) so a future dark section can opt back in
// by re-adding page ids here.
const DARK_BG_PAGES = new Set([]);

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
  if (page === 'industries') page = 'industries-all';
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

  if (COMPANY_PAGES.has(page)) {
    const cur = document.body.getAttribute('data-section');
    setSectionMode(cur || 'consultancy', true);
  } else if (page === 'consultancy') {
    // Halla AI home: the general landing page, so no product tab is lit.
    setSectionMode('consultancy', true);
  } else {
    setSectionMode(sectionForPage(page));
  }
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
function goInd() {
  go('industries-all');
}

// ============ MOBILE NAV ============
function setMobExpanded(open) { const b = document.getElementById('hamb'); if (b) b.setAttribute('aria-expanded', String(open)); }
function toggleMob() { const open = document.getElementById('mob-nav').classList.toggle('open'); setMobExpanded(open); }
function closeMob() { document.getElementById('mob-nav').classList.remove('open'); setMobExpanded(false); }

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
  const C = window.HallaCur;
  const cur = C ? C.get() : 'USD';
  const PLAN_COST = { '39': { AED: 150, SAR: 149, USD: 39 }, '149': { AED: 550, SAR: 559, USD: 149 } };
  const fmt = v => C ? C.money(v) : '$' + v.toLocaleString();
  const miss = +document.getElementById('r-miss').value || 0;
  const val = +document.getElementById('r-val').value || 0;
  const conv = +document.getElementById('r-conv').value || 0;
  const key = document.getElementById('r-plan').value || '149';
  const plan = (PLAN_COST[key] || PLAN_COST['149'])[cur];
  const monthly = Math.round(miss * (conv/100) * val);
  const annual = monthly * 12;
  const cost = plan * 12;
  const net = Math.max(0, annual - cost);
  const mult = cost > 0 ? (annual/cost).toFixed(1) : '\u221e';
  document.getElementById('r-monthly').textContent = fmt(monthly);
  document.getElementById('r-annual').textContent = fmt(annual);
  document.getElementById('r-cost').textContent = fmt(cost);
  document.getElementById('r-net').textContent = fmt(net);
  const isAr = document.documentElement.getAttribute('lang') === 'ar';
  document.getElementById('r-mult').textContent = isAr
    ? '\u0635\u0627\u0641\u064a \u0627\u0644\u0639\u0627\u0626\u062f \u0627\u0644\u0633\u0646\u0648\u064a \u2014 ' + mult + 'x \u0645\u0646 \u0627\u0633\u062a\u062b\u0645\u0627\u0631\u0643'
    : 'Net Annual ROI \u2014 ' + mult + 'x your investment';
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

// ============ FOOTER FIX ============
(function fixFooterLayout() {
  /* layout handled in CSS */
})();

// ============ PAGE ACTIVATION HOOKS ============
function onPageActivated(page) {
  if (window.HallaNeural && HallaNeural.refreshForPage) {
    HallaNeural.refreshForPage(page);
  }
  document.body.classList.toggle('has-cosmic-bg', DARK_BG_PAGES.has(page));
  if (window.HallaPlexus && HallaPlexus.setVisible) {
    HallaPlexus.setVisible(DARK_BG_PAGES.has(page));
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
  const html = document.documentElement;
  if (lang === 'ar') {
    html.setAttribute('dir', 'rtl');
    html.setAttribute('lang', 'ar');
  } else {
    html.setAttribute('dir', 'ltr');
    html.setAttribute('lang', 'en');
  }
  document.querySelectorAll('.lang-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
  document.querySelectorAll('[data-en][data-ar]').forEach(el => {
    el.textContent = lang === 'ar' ? el.dataset.ar : el.dataset.en;
  });
  // The primary CTA's text is built from section + lang together (see
  // applyPrimaryCtaText), not just swapped via the [data-en][data-ar]
  // sweep above, so a plain language toggle has to re-run it too.
  applyPrimaryCtaText();
  if (document.getElementById('r-mult')) calcROI();
  try { localStorage.setItem('halla_lang', lang); } catch (e) {}
}

// ============ HERO LIVE ACTIVITY FEED ============
// Cycles rows into a hero dashboard-mockup feed on an interval so the
// card visibly updates itself instead of sitting as static text — only
// mutates while its own page is the active one (cheap visibility check
// each tick, no IntersectionObserver needed) and respects
// prefers-reduced-motion by rendering the full set once and never
// animating further. Each row carries data-en/data-ar so the existing
// setLang() sweep (which retargets every [data-en][data-ar] element on
// toggle) keeps already-rendered rows correctly translated even after
// the language is switched mid-cycle, not just on the next row in.
const HERO_FEED_ICONS = {
  'user-check': 'ti-user-check', star: 'ti-star', invoice: 'ti-file-invoice',
  quote: 'ti-file-text', bolt: 'ti-bolt', mail: 'ti-mail', check: 'ti-circle-check',
};
function startHeroLiveFeed(containerId, items) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function currentLang() {
    return document.documentElement.getAttribute('lang') === 'ar' ? 'ar' : 'en';
  }
  function rowEl(item) {
    const lang = currentLang();
    const wrap = document.createElement('div');
    wrap.className = 'consult-activity-row';
    wrap.innerHTML = `<div class="consult-activity-icon"><i class="ti ${HERO_FEED_ICONS[item.icon] || 'ti-bolt'}"></i></div>
      <div>
        <div class="consult-activity-text" data-en="${item.en}" data-ar="${item.ar}">${lang === 'ar' ? item.ar : item.en}</div>
        <div class="consult-activity-time" data-en="${item.timeEn}" data-ar="${item.timeAr}">${lang === 'ar' ? item.timeAr : item.timeEn}</div>
      </div>`;
    return wrap;
  }

  let i = 0;
  const visible = 3;
  function renderInitial() {
    container.innerHTML = '';
    items.slice(0, visible).forEach((item) => container.appendChild(rowEl(item)));
    i = visible % items.length;
  }
  renderInitial();
  if (reduceMotion) return;

  setInterval(() => {
    if (!container.offsetParent) return; // paused while its page/section isn't active
    const item = items[i % items.length];
    i++;
    const first = container.firstElementChild;
    if (first) {
      first.classList.add('leaving');
      setTimeout(() => first.remove(), 340);
    }
    container.appendChild(rowEl(item));
    while (container.children.length > visible + 1) {
      container.removeChild(container.firstElementChild);
    }
  }, 3200);
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
  initContactForm();
  initFitCheckForm();
  initAuditPages();

  startHeroLiveFeed('consult-activity-feed-consultancy', [
    { icon: 'user-check', en: 'New lead auto-qualified &amp; synced to CRM', ar: 'عميل محتمل جديد مؤهّل تلقائياً ومتزامن مع نظام العملاء', timeEn: 'Just now', timeAr: 'الآن' },
    { icon: 'star', en: 'Review request sent to 3 recent customers', ar: 'طلب تقييم أُرسل إلى 3 عملاء حديثين', timeEn: '14 minutes ago', timeAr: 'قبل 14 دقيقة' },
    { icon: 'invoice', en: 'Overdue invoice reminder sent automatically', ar: 'تذكير فاتورة متأخرة أُرسل تلقائياً', timeEn: '1 hour ago', timeAr: 'قبل ساعة' },
    { icon: 'bolt', en: 'Workflow triggered — new form submission routed', ar: 'تم تشغيل سير عمل — تم توجيه نموذج جديد', timeEn: '2 hours ago', timeAr: 'قبل ساعتين' },
    { icon: 'mail', en: 'Weekly report emailed to the owner', ar: 'تقرير أسبوعي أُرسل بالبريد إلى المالك', timeEn: '3 hours ago', timeAr: 'قبل 3 ساعات' },
    { icon: 'check', en: 'Missed call follow-up sent by text', ar: 'متابعة مكالمة فائتة أُرسلت برسالة نصية', timeEn: '5 hours ago', timeAr: 'قبل 5 ساعات' },
  ]);
  startHeroLiveFeed('consult-activity-feed-intelligence', [
    { icon: 'invoice', en: 'Overdue invoice — follow-up proposed', ar: 'فاتورة متأخرة — تم اقتراح متابعة', timeEn: 'Awaiting your approval', timeAr: 'بانتظار موافقتك' },
    { icon: 'quote', en: 'Quote gone quiet — reminder sent', ar: 'عرض سعر بلا رد — تم إرسال تذكير', timeEn: 'Ran automatically', timeAr: 'تم تلقائياً' },
    { icon: 'user-check', en: 'New lead scored &amp; routed to pipeline', ar: 'عميل محتمل جديد مُقيَّم وموجَّه إلى خط المبيعات', timeEn: 'Ran automatically', timeAr: 'تم تلقائياً' },
    { icon: 'bolt', en: 'Job marked complete — invoice drafted', ar: 'مهمة اكتملت — تم إعداد مسودة فاتورة', timeEn: 'Awaiting your approval', timeAr: 'بانتظار موافقتك' },
    { icon: 'star', en: 'Review request queued for a happy customer', ar: 'طلب تقييم في قائمة الانتظار لعميل راضٍ', timeEn: 'Ran automatically', timeAr: 'تم تلقائياً' },
  ]);
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

  const nameInput = form.querySelector('input[type="text"]');
  const emailInput = form.querySelector('input[type="email"]');
  const phoneInput = form.querySelector('input[type="tel"]');
  const businessInput = form.querySelectorAll('input[type="text"]')[1] || null;
  const prioritySelect = form.querySelector('select');
  const notesTextarea = form.querySelector('textarea');

  let statusEl = form.querySelector('.consult-form-status');
  if (!statusEl) {
    statusEl = document.createElement('div');
    statusEl.className = 'consult-form-status';
    statusEl.style.marginTop = '12px';
    statusEl.style.fontSize = '0.9rem';
    btn.insertAdjacentElement('afterend', statusEl);
  }

  const btnDefaultText = btn.innerHTML;
  const isAr = () => document.documentElement.lang === 'ar';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    // Only name and email are needed to reach the lead (the gateway treats phone and business as optional), so those two are the only required fields.
    form.querySelectorAll('input').forEach((inp) => { inp.style.borderColor = ''; });
    let valid = true;
    [nameInput, emailInput].forEach((inp) => {
      if (inp && !inp.value.trim()) {
        inp.style.borderColor = 'var(--red)';
        valid = false;
      }
    });
    if (emailInput && emailInput.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value)) {
      emailInput.style.borderColor = 'var(--red)';
      valid = false;
    }
    if (!valid) {
      statusEl.style.color = 'var(--red)';
      statusEl.textContent = isAr() ? 'يرجى إدخال اسمك وبريد إلكتروني صحيح.' : 'Please enter your name and a valid email address.';
      return;
    }

    btn.disabled = true;
    btn.textContent = isAr() ? 'جارٍ الإرسال...' : 'Sending...';
    statusEl.style.color = '';
    statusEl.textContent = '';

    fetch('https://gateway.hallaai.com/api/v1/public/consult-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameInput ? nameInput.value.trim() : '',
        email: emailInput ? emailInput.value.trim() : '',
        phone: phoneInput ? phoneInput.value.trim() : undefined,
        business: businessInput ? businessInput.value.trim() : undefined,
        priority: prioritySelect ? prioritySelect.value : undefined,
        notes: notesTextarea ? notesTextarea.value.trim() : undefined,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || (isAr() ? 'حدث خطأ ما. يُرجى مراسلتنا مباشرة على hello@hallaai.com.' : 'Something went wrong. Please email hello@hallaai.com directly.'));
        }
        statusEl.style.color = 'var(--green, #2ecc71)';
        statusEl.textContent = isAr() ? 'شكرًا لك! سنتواصل معك خلال يوم عمل واحد لتحديد موعد مكالمتك التشخيصية.' : 'Thank you! We will reach out within 1 business day to schedule your diagnostic call.';
        form.querySelectorAll('input, textarea').forEach((el) => { el.value = ''; });
        form.querySelectorAll('select').forEach((el) => { el.selectedIndex = 0; }); // back to the first choice, not a blank one
        btn.innerHTML = btnDefaultText;
        btn.disabled = false;
      })
      .catch((err) => {
        statusEl.style.color = 'var(--red)';
        statusEl.textContent = err.message || (isAr() ? 'حدث خطأ ما. يُرجى مراسلتنا مباشرة على hello@hallaai.com.' : 'Something went wrong. Please email hello@hallaai.com directly.');
        btn.innerHTML = btnDefaultText;
        btn.disabled = false;
      });
  });
}

function initContactForm() {
  const btn = document.getElementById('contactSendBtn');
  const form = document.getElementById('contactCard');
  if (!btn || !form) return;

  const nameInput = form.querySelector('input[name="name"]');
  const emailInput = form.querySelector('input[name="email"]');
  const messageInput = form.querySelector('textarea[name="message"]');

  const statusEl = document.createElement('div');
  statusEl.className = 'consult-form-status';
  statusEl.style.marginTop = '12px';
  statusEl.style.fontSize = '0.9rem';
  btn.insertAdjacentElement('afterend', statusEl);

  const btnDefaultText = btn.innerHTML;
  const isAr = () => document.documentElement.lang === 'ar';

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    [nameInput, emailInput, messageInput].forEach((el) => { el.style.borderColor = ''; });
    let valid = true;
    [nameInput, emailInput, messageInput].forEach((el) => {
      if (!el.value.trim()) { el.style.borderColor = 'var(--red)'; valid = false; }
    });
    if (emailInput.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailInput.value)) {
      emailInput.style.borderColor = 'var(--red)';
      valid = false;
    }
    if (!valid) {
      statusEl.style.color = 'var(--red)';
      statusEl.textContent = isAr() ? 'يرجى إدخال اسمك وبريد إلكتروني صحيح ورسالتك.' : 'Please enter your name, a valid email address and your message.';
      return;
    }

    btn.disabled = true;
    btn.textContent = isAr() ? 'جارٍ الإرسال...' : 'Sending...';
    statusEl.style.color = '';
    statusEl.textContent = '';

    // Same lead email as the booking form; the priority line tells us it came from the Contact page.
    fetch('https://gateway.hallaai.com/api/v1/public/consult-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: nameInput.value.trim(),
        email: emailInput.value.trim(),
        priority: 'General enquiry (Contact page)',
        notes: messageInput.value.trim(),
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || (isAr() ? 'حدث خطأ ما. يُرجى مراسلتنا مباشرة على hello@hallaai.com.' : 'Something went wrong. Please email hello@hallaai.com directly.'));
        }
        statusEl.style.color = 'var(--green, #2ecc71)';
        statusEl.textContent = isAr() ? 'شكرًا لك! وصلتنا رسالتك وسنرد خلال يوم عمل واحد.' : 'Thank you! We got your message and will reply within 1 business day.';
        form.querySelectorAll('input, textarea').forEach((el) => { el.value = ''; });
        btn.innerHTML = btnDefaultText;
        btn.disabled = false;
      })
      .catch((err) => {
        statusEl.style.color = 'var(--red)';
        statusEl.textContent = err.message || (isAr() ? 'حدث خطأ ما. يُرجى مراسلتنا مباشرة على hello@hallaai.com.' : 'Something went wrong. Please email hello@hallaai.com directly.');
        btn.innerHTML = btnDefaultText;
        btn.disabled = false;
      });
  });
}

// ============ FIT CHECK (Form 1): a short public form whose answers reach us by email, with a verdict worked out on the server ============
// Messages from the gateway are English; Arabic visitors get an Arabic message chosen by the response status.
function formErrorText(status, serverText, fallbackEn) {
  if (document.documentElement.lang !== 'ar') return serverText || fallbackEn;
  if (status === 410) return 'انتهت صلاحية هذا الرابط. يرجى مراسلتنا على hello@hallaai.com وسنساعدك.';
  if (status === 429) return 'محاولات كثيرة. يرجى المحاولة لاحقاً أو مراسلتنا على hello@hallaai.com.';
  if (status === 400) return 'يرجى مراجعة الإجابات أو التأكد من فتح الرابط كاملاً من رسالتنا، أو مراسلتنا على hello@hallaai.com.';
  return 'حدث خطأ ما. يُرجى مراسلتنا مباشرة على hello@hallaai.com.';
}

function initFitCheckForm() {
  const btn = document.getElementById('fitCheckBtn');
  const form = document.getElementById('fitCheckForm');
  if (!btn || !form) return;

  const statusEl = form.querySelector('.fit-form-status');
  const btnDefaultText = btn.innerHTML;
  const GATEWAY = 'https://gateway.hallaai.com/api/v1/public/fit-check';
  const REQUIRED = ['name', 'email', 'role', 'decider', 'company', 'size', 'industry', 'country', 'accounting', 'erp', 'problem', 'start'];
  const isAr = () => document.documentElement.lang === 'ar';
  const field = (name) => form.querySelector('[name="' + name + '"]');
  const box = (name) => form.querySelector('[data-q="' + name + '"]');
  const checked = (name) => Array.from(form.querySelectorAll('input[name="' + name + '"]:checked')).map((el) => el.value);
  const say = (text, color) => { statusEl.style.color = color || ''; statusEl.textContent = text; };

  // Every country in the world for "Other", named in the visitor's language by the browser. The GCC countries are already listed in the main question.
  const GCC = ['AE', 'SA', 'QA', 'KW', 'BH', 'OM'];
  const REGIONS = ('AF AL DZ AD AO AG AR AM AU AT AZ BS BD BB BY BE BZ BJ BT BO BA BW BR BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI XK KG LA LV LB LS LR LY LI LT LU MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO PK PW PS PA PG PY PE PH PL PT RO RU RW KN LC VC WS SM ST SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA GB US UY UZ VU VA VE VN YE ZM ZW').split(' ').filter((c) => !GCC.includes(c));
  const countrySelect = field('countryName');
  if (countrySelect && countrySelect.options.length <= 1) {
    let en = null, ar = null;
    try { en = new Intl.DisplayNames(['en'], { type: 'region' }); ar = new Intl.DisplayNames(['ar'], { type: 'region' }); } catch (e) { /* very old browser: the list falls back to codes */ }
    REGIONS.map((code) => ({ code, en: (en && en.of(code)) || code, ar: (ar && ar.of(code)) || code })).sort((a, b) => a.en.localeCompare(b.en)).forEach((r) => {
      const o = document.createElement('option');
      o.value = r.en; o.setAttribute('data-en', r.en); o.setAttribute('data-ar', r.ar); o.textContent = isAr() ? r.ar : r.en;
      countrySelect.appendChild(o);
    });
  }

  // "Other" opens a box where the visitor names the software or country, so we know what they actually use.
  const OTHER_BOXES = { country: 'countryName', accounting: 'accountingOther', erp: 'erpOther', crm: 'crmOther' };
  const syncOther = () => {
    Object.keys(OTHER_BOXES).forEach((name) => {
      const q = box(OTHER_BOXES[name]); const sel = field(name);
      if (!q || !sel) return;
      const on = sel.value === 'Other';
      q.hidden = !on;
      if (!on) { const inner = field(OTHER_BOXES[name]); if (inner) inner.value = ''; }
    });
  };
  Object.keys(OTHER_BOXES).forEach((name) => { const sel = field(name); if (sel) sel.addEventListener('change', syncOther); });

  // One hours-a-week answer for every area the visitor ticked, so we can see where the time actually goes.
  const HOURS_CHOICES = [['under-5', 'Under 5', 'أقل من 5', 2.5], ['5-20', '5 to 20', 'من 5 إلى 20', 12.5], ['20-50', '20 to 50', 'من 20 إلى 50', 35], ['over-50', 'Over 50', 'أكثر من 50', 60], ['unsure', 'Not sure', 'لست متأكداً', 0]];
  const hoursList = form.querySelector('[data-hours-list]');
  const hoursHint = form.querySelector('[data-hours-hint]');
  const syncHours = () => {
    if (!hoursList) return;
    const kept = {};
    hoursList.querySelectorAll('select').forEach((sel) => { kept[sel.getAttribute('data-area')] = sel.value; });
    hoursList.innerHTML = '';
    const boxes = Array.from(form.querySelectorAll('input[name="pain"]:checked'));
    boxes.forEach((cb) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:grid;grid-template-columns:1fr minmax(120px,40%);gap:10px;align-items:center';
      const name = document.createElement('span');
      const labelSpans = cb.parentElement.querySelectorAll('span > span');
      name.style.fontSize = '0.9rem';
      labelSpans.forEach((sp) => { name.appendChild(sp.cloneNode(true)); });
      const sel = document.createElement('select');
      sel.className = 'roi-select'; sel.setAttribute('data-area', cb.value); sel.setAttribute('aria-label', cb.value);
      const blank = document.createElement('option'); blank.value = ''; blank.setAttribute('data-en', 'Hours…'); blank.setAttribute('data-ar', 'الساعات…'); blank.textContent = isAr() ? 'الساعات…' : 'Hours…'; sel.appendChild(blank);
      HOURS_CHOICES.forEach((h) => { const o = document.createElement('option'); o.value = h[0]; o.setAttribute('data-en', h[1]); o.setAttribute('data-ar', h[2]); o.textContent = isAr() ? h[2] : h[1]; sel.appendChild(o); });
      if (kept[cb.value]) sel.value = kept[cb.value];
      row.appendChild(name); row.appendChild(sel); hoursList.appendChild(row);
    });
    if (hoursHint) hoursHint.style.display = boxes.length ? 'none' : '';
  };
  form.addEventListener('change', (e) => { if (e.target && e.target.name === 'pain') syncHours(); });
  // Overall weekly hours for the verdict, added up from the areas; the per-area answers go to us as text.
  const hoursSummary = () => {
    const picks = Array.from(form.querySelectorAll('[data-hours-list] select')).filter((sel) => sel.value);
    if (!picks.length) return { hours: undefined, painHours: undefined };
    const label = (code) => HOURS_CHOICES.find((h) => h[0] === code)[1];
    const painHours = picks.map((sel) => sel.getAttribute('data-area') + ': ' + label(sel.value)).join('; ');
    if (picks.every((sel) => sel.value === 'unsure')) return { hours: 'unsure', painHours };
    const total = picks.reduce((sum, sel) => sum + HOURS_CHOICES.find((h) => h[0] === sel.value)[3], 0);
    return { hours: total < 5 ? 'under-5' : total < 20 ? '5-20' : total < 50 ? '20-50' : 'over-50', painHours };
  };
  // A software answer of "Other" is sent as "Other: <what they typed>".
  const named = (name, otherName) => {
    const el = field(name); const v = el && el.value.trim();
    if (!v) return undefined;
    if (v !== 'Other') return v;
    const t = field(otherName); return t && t.value.trim() ? 'Other: ' + t.value.trim() : v;
  };
  syncOther(); syncHours();

  // Tie each label to its single field (so a click on the label focuses it and screen readers read it), and tell the browser what each field is so it can autofill.
  const AUTOFILL = { name: 'name', email: 'email', phone: 'tel', company: 'organization', website: 'url', city: 'address-level2', country: 'country-name' };
  form.querySelectorAll('[data-q]').forEach((q) => {
    const controls = q.querySelectorAll('input:not([type="checkbox"]), select, textarea');
    const label = q.querySelector('label');
    if (controls.length === 1 && label && !q.querySelector('input[type="checkbox"]')) {
      if (!controls[0].id) controls[0].id = 'fc-' + controls[0].name;
      label.setAttribute('for', controls[0].id);
    }
  });
  Object.keys(AUTOFILL).forEach((n) => { const el = field(n); if (el) el.setAttribute('autocomplete', AUTOFILL[n]); });

  // "Not sure" excludes the other places, and ticking a real place clears "Not sure".
  form.querySelectorAll('input[name="dataLocation"]').forEach((cb) => {
    cb.addEventListener('change', () => {
      if (!cb.checked) return;
      form.querySelectorAll('input[name="dataLocation"]').forEach((other) => {
        if (other !== cb && ((cb.value === 'unsure') || other.value === 'unsure')) other.checked = false;
      });
    });
  });

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    form.querySelectorAll('[data-q]').forEach((q) => { q.style.outline = ''; q.removeAttribute('aria-invalid'); });
    form.querySelectorAll('.fit-err').forEach((n) => n.remove());
    const missing = [];
    REQUIRED.forEach((name) => {
      const el = field(name);
      if (el && !el.value.trim()) missing.push(name);
    });
    if (field('country').value === 'Other' && !field('countryName').value.trim()) missing.push('countryName');
    [['accounting', 'accountingOther'], ['erp', 'erpOther'], ['crm', 'crmOther']].forEach((pair) => {
      const sel = field(pair[0]);
      if (sel && sel.value === 'Other' && !field(pair[1]).value.trim()) missing.push(pair[1]);
    });
    const email = field('email');
    if (email && email.value && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value.trim()) && !missing.includes('email')) missing.push('email');
    if (checked('pain').length === 0) missing.push('pain');
    if (checked('dataLocation').length === 0) missing.push('dataLocation');
    if (!field('consent').checked) missing.push('consent');
    if (missing.length) {
      missing.forEach((name) => {
        const q = box(name);
        if (!q) return;
        q.style.outline = '2px solid var(--red)'; q.style.outlineOffset = '4px'; q.style.borderRadius = '8px';
        q.setAttribute('aria-invalid', 'true');
        const msg = document.createElement('div');
        msg.className = 'fit-err'; msg.setAttribute('role', 'alert'); msg.style.cssText = 'color:var(--red);font-size:0.8rem;margin-top:6px';
        msg.textContent = isAr() ? 'يرجى الإجابة عن هذا السؤال.' : 'Please answer this question.';
        q.appendChild(msg);
      });
      const first = box(missing[0]);
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
      say(missing.includes('consent') && missing.length === 1 ? (isAr() ? 'يرجى تحديد خانة الموافقة حتى نتمكن من الرد عليك.' : 'Please tick the box to agree, so we can reply to you.') : (isAr() ? 'يرجى إكمال الأسئلة المحددة.' : 'Please complete the highlighted questions.'), 'var(--red)');
      return;
    }

    const val = (name) => { const el = field(name); return el && el.value.trim() ? el.value.trim() : undefined; };
    const list = (name) => { const v = checked(name); return v.length ? v.join(', ') : undefined; };
    btn.disabled = true;
    btn.textContent = isAr() ? 'جارٍ الإرسال...' : 'Sending...';
    say('');

    fetch(GATEWAY, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: val('name'), email: val('email'), phone: val('phone'), role: val('role'), decider: val('decider'), company: val('company'), website: val('website'),
        size: val('size'), office: val('office'), departments: list('departments'), industry: val('industry'), country: val('country'), countryName: val('country') === 'Other' ? val('countryName') : undefined, city: val('city'), years: val('years'),
        accounting: named('accounting', 'accountingOther'), erp: named('erp', 'erpOther'), crm: named('crm', 'crmOther'),
        channels: list('channels'), tools: list('tools'), pain: list('pain'), problem: val('problem'), hours: hoursSummary().hours, painHours: hoursSummary().painHours, dataLocation: list('dataLocation'), compliance: val('compliance'), tried: val('tried'),
        start: val('start'), budget: val('budget'), heard: val('heard'), consent: true,
      }),
    })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(formErrorText(res.status, data.error, 'Something went wrong. Please email hello@hallaai.com directly.'));
        }
        say(isAr() ? 'شكراً لك. وصلتنا إجاباتك وسنرد عليك بالبريد الإلكتروني خلال 3 أيام عمل.' : 'Thank you. We have your answers and will reply by email within 3 business days.', 'var(--green, #2ecc71)');
        form.querySelectorAll('input[type="text"], input[type="email"], input[type="tel"], textarea').forEach((el) => { el.value = ''; });
        form.querySelectorAll('input[type="checkbox"]').forEach((el) => { el.checked = false; });
        form.querySelectorAll('select').forEach((el) => { el.selectedIndex = 0; });
        syncOther(); syncHours();
      })
      .catch((err) => { say(err.message || (isAr() ? 'حدث خطأ ما. يُرجى مراسلتنا مباشرة على hello@hallaai.com.' : 'Something went wrong. Please email hello@hallaai.com directly.'), 'var(--red)'); })
      .finally(() => { btn.innerHTML = btnDefaultText; btn.disabled = false; });
  });
}

// ============ PAID AUDIT: Form 2, payment page ============
// Both pages open from a private signed link we email (?t=...). Nothing is stored on our side; answers reach us by email and payment is taken by Stripe.
function initAuditPages() {
  const API = 'https://gateway.hallaai.com/api/v1/public/audit';
  const token = new URLSearchParams(window.location.search).get('t') || '';
  // The server can be asleep for the first request, so a failed check is tried again a few times before the page gives up. Both pages share one check.
  let linkCheck = null;
  const checkLink = () => {
    if (!token) return Promise.resolve({ valid: false });
    if (linkCheck) return linkCheck;
    const attempt = (n) => fetch(API + '/link?t=' + encodeURIComponent(token), { cache: 'no-store' })
      .then((r) => {
        if (r.status >= 500 || r.status === 304) throw new Error('retry');
        return r.json().catch(() => ({ valid: false }));
      })
      .catch((err) => (n >= 4 ? Promise.reject(err) : new Promise((resolve) => setTimeout(resolve, 1500 * (n + 1))).then(() => attempt(n + 1))));
    linkCheck = attempt(0);
    return linkCheck;
  };
  const isAr = () => document.documentElement.lang === 'ar';
  const bad = (d) => d && d.expired ? (isAr() ? 'انتهت صلاحية هذا الرابط. يرجى مراسلتنا على hello@hallaai.com وسنساعدك.' : 'This link has expired. Please email hello@hallaai.com and we will help.') : (isAr() ? 'هذا الرابط غير صالح. يرجى فتح الرابط كاملاً من رسالتنا، أو مراسلتنا على hello@hallaai.com.' : 'This link is not valid. Please open the whole link from our email, or write to hello@hallaai.com.');

  const form = document.getElementById('auditForm');
  if (form) {
    const note = document.getElementById('auditLinkNote');
    const btn = document.getElementById('auditSubmitBtn');
    const status = form.querySelector('.audit-status');
    const say = (t, c) => { status.style.color = c || ''; status.textContent = t; };
    const key = 'halla-audit-' + token.slice(-24);
    const fields = () => Array.from(form.querySelectorAll('input[name], textarea[name], select[name]'));
    const reveal = (id, n) => { const blocks = form.querySelectorAll('[data-block="' + id + '"]'); blocks.forEach((b, i) => { if (i < n) b.style.display = ''; }); const add = form.querySelector('[data-add="' + id + '"]'); if (add && n >= blocks.length) add.style.display = 'none'; };
    const shown = (id) => Array.from(form.querySelectorAll('[data-block="' + id + '"]')).filter((b) => b.style.display !== 'none').length;

    form.querySelectorAll('[data-add]').forEach((add) => add.addEventListener('click', () => { const id = add.getAttribute('data-add'); reveal(id, shown(id) + 1); }));
    try {
      const saved = JSON.parse(localStorage.getItem(key) || '{}');
      fields().forEach((el) => { if (saved[el.name]) el.value = saved[el.name]; });
      form.querySelectorAll('[data-add]').forEach((add) => { const id = add.getAttribute('data-add'); let n = 1; form.querySelectorAll('[data-block="' + id + '"]').forEach((b, i) => { if (i > 0 && Array.from(b.querySelectorAll('[name]')).some((el) => el.value)) n = i + 1; }); reveal(id, n); });
    } catch (e) { /* no saved answers */ }
    form.addEventListener('input', () => { try { const o = {}; fields().forEach((el) => { if (el.value) o[el.name] = el.value; }); localStorage.setItem(key, JSON.stringify(o)); } catch (e) { /* storage full or blocked */ } });

    let valid = false;
    btn.disabled = true;
    checkLink().then((d) => {
      valid = !!(d && d.valid && d.kind === 'form2');
      if (valid) { note.textContent = isAr() ? 'أُعدّ لـ ' + d.company + '. هذا الرابط صالح حتى ' + new Date(d.expiresAt).toLocaleDateString('ar-AE') + '.' : 'Prepared for ' + d.company + '. This link is valid until ' + new Date(d.expiresAt).toLocaleDateString() + '.'; btn.disabled = false; }
      else { note.style.color = 'var(--red)'; note.textContent = bad(d); form.style.display = 'none'; }
    }).catch(() => { note.style.color = 'var(--red)'; note.textContent = isAr() ? 'تعذّر التحقق من الرابط. يرجى المحاولة مرة أخرى.' : 'We could not check your link. Please try again.'; });

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const answers = {};
      fields().forEach((el) => { const v = el.value.trim(); if (v) answers[el.name] = v; });
      form.querySelectorAll('[data-q]').forEach((q) => { q.style.outline = ''; });
      if (!answers.a_company || !answers.b_process) {
        const first = !answers.a_company ? 'a_company' : 'b_process';
        ['a_company', 'b_process'].filter((n) => !answers[n]).forEach((n) => { const q = form.querySelector('[data-q="' + n + '"]'); if (q) { q.style.outline = '2px solid var(--red)'; q.style.outlineOffset = '4px'; q.style.borderRadius = '8px'; } });
        const target = form.querySelector('[data-q="' + first + '"]');
        if (target) target.scrollIntoView({ block: 'center' });
        say(isAr() ? 'يرجى إخبارنا عن شركتك، ووصف كيفية تنفيذ العملية حالياً.' : 'Please tell us about your company, and describe how the process is handled today.', 'var(--red)');
        return;
      }
      btn.disabled = true; btn.textContent = isAr() ? 'جارٍ الإرسال...' : 'Sending...'; say('');
      fetch(API + '/form2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token, answers }) })
        .then(async (res) => { if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(formErrorText(res.status, data.error, 'Something went wrong. Please email hello@hallaai.com directly.')); }
          try { localStorage.removeItem(key); } catch (e2) { /* ignore */ }
          form.querySelectorAll('input[name], textarea[name], select[name]').forEach((el) => { el.value = ''; });
          say(isAr() ? 'شكراً لك. وصلتنا إجاباتك. سنعدّ تدقيقك ونراسلك عندما يكون جاهزاً.' : 'Thank you. We have your answers. We will prepare your audit and email you when it is ready.', 'var(--green, #2ecc71)'); })
        .catch((err) => { say(err.message || (isAr() ? 'حدث خطأ ما. يُرجى مراسلتنا مباشرة على hello@hallaai.com.' : 'Something went wrong. Please email hello@hallaai.com directly.'), 'var(--red)'); })
        .finally(() => { btn.textContent = isAr() ? 'أرسل إجاباتي ←' : 'Send my answers →'; btn.disabled = !valid; });
    });
  }

  const info = document.getElementById('auditPayInfo');
  const payBtn = document.getElementById('auditPayBtn');
  if (info && payBtn) {
    const status = document.querySelector('.audit-pay-status');
    checkLink().then((d) => {
      if (!(d && d.valid && d.kind === 'pay')) { info.style.color = 'var(--red)'; info.textContent = bad(d); return; }
      const until = new Date(d.expiresAt).toLocaleDateString();
      if (!d.priceAvailable) { info.textContent = isAr() ? d.company + ': تدقيقك جاهز. سنرسل لك فاتورة بالبريد الإلكتروني.' : d.company + ': your audit is ready. We will send you an invoice by email.'; return; }
      info.innerHTML = '';
      const a = document.createElement('div'); a.textContent = d.company; a.style.fontWeight = '700';
      const b = document.createElement('div'); b.textContent = (isAr() ? 'تدقيق الفرص: ' : 'Opportunity Audit: ') + d.priceText; b.style.fontSize = '1.4rem'; b.style.margin = '8px 0';
      const c = document.createElement('div'); c.textContent = isAr() ? 'يرجى السداد قبل ' + new Date(d.expiresAt).toLocaleDateString('ar-AE') + ' لتستلم تدقيقك. بعد ذلك يُغلق هذا الطلب.' : 'Please pay by ' + until + ' to receive your audit. After that this order is closed.'; c.style.fontSize = '0.9rem';
      info.append(a, b, c);
      payBtn.style.display = '';
    }).catch(() => { info.textContent = isAr() ? 'تعذّر التحقق من الرابط. يرجى المحاولة مرة أخرى.' : 'We could not check your link. Please try again.'; });
    payBtn.addEventListener('click', () => {
      payBtn.disabled = true; status.textContent = '';
      fetch(API + '/pay', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token }) })
        .then(async (res) => { const data = await res.json().catch(() => ({})); if (!res.ok || !data.url) throw new Error(formErrorText(res.status, data.error, 'We could not start the payment. Please write to hello@hallaai.com.')); window.location.href = data.url; })
        .catch((err) => { status.style.color = 'var(--red)'; status.textContent = err.message; payBtn.disabled = false; });
    });
  }
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