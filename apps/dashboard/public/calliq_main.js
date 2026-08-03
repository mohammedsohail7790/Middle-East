/**
 * Call IQ marketing navigation — routes iframe SPA links to real Next.js pages + gateway-backed ROI.
 */
(function () {
  "use strict";

  var ROUTES = {
    home: "/",
    features: "/features",
    pricing: "/pricing",
    "how-it-works": "/how-it-works",
    integrations: "/integrations",
    roi: "/roi",
    blog: "/blog",
    forwarding: "/forwarding",
    "ai-vs-human": "/ai-vs-human",
    "vs-smith": "/vs-smith",
    "vs-ruby": "/vs-ruby",
    alternatives: "/alternatives",
    faq: "/faq",
    about: "/about",
    security: "/security",
    compliance: "/security",
    privacy: "/privacy",
    terms: "/terms",
    "ai-disclosure": "/privacy",
    contact: "/contact",
    signup: "/signup",
    login: "/login",
    dashboard: "/dashboard",
    industries: "/industries",
    "industries-all": "/industries",
    solutions: "/solutions/answering",
    "blog-emergency": "/blog/emergency-calls",
    "blog-ai-disclosure": "/blog/ai-disclosure",
    "blog-crm-integrations": "/blog/crm-integrations",
    "blog-per-minute": "/blog/per-minute-pricing",
    "blog-forwarding-guide": "/blog/forwarding-guide",
  };

  var SOLUTION_SLUGS = {
    answering: 1,
    scheduling: 1,
    messages: 1,
    leads: 1,
    routing: 1,
    multilingual: 1,
    afterhours: 1,
    screening: 1,
  };

  function inIframe() {
    try {
      return window.self !== window.top;
    } catch (_) {
      return true;
    }
  }

  function measureLandingHeight() {
    var footer = document.querySelector("footer");
    if (footer) {
      return footer.offsetTop + footer.offsetHeight;
    }
    return Math.max(
      document.documentElement.scrollHeight,
      document.body ? document.body.scrollHeight : 0
    );
  }

  function notifyParentHeight() {
    if (!inIframe()) return;
    var h = measureLandingHeight();
    try {
      window.parent.postMessage({ type: "calliq-iframe-height", height: h }, "*");
    } catch (_) {}
  }

  function scheduleHeightNotifications() {
    notifyParentHeight();
    [100, 400, 1200].forEach(function (ms) {
      setTimeout(notifyParentHeight, ms);
    });
  }

  function apiBase() {
    return window.location.origin;
  }

  function navigate(path) {
    if (inIframe() && window.top) {
      window.top.location.href = path;
      return;
    }
    window.location.href = path;
  }

  function pathForPage(page) {
    if (ROUTES[page]) return ROUTES[page];
    if (page.indexOf("industry-") === 0) {
      var slug = page.slice(9);
      if (slug === "all") return "/industries";
      if (slug === "home-services") return "/industries/cleaning";
      return "/industries/" + slug;
    }
    if (page.indexOf("solutions-") === 0) {
      var sol = page.slice(10);
      if (SOLUTION_SLUGS[sol]) return "/solutions/" + sol;
    }
    return null;
  }

  function showHomeInSpa() {
    var home = document.getElementById("page-home");
    if (!home) return false;
    document.querySelectorAll(".page").forEach(function (el) {
      el.classList.remove("active");
    });
    home.classList.add("active");
    window.scrollTo(0, 0);
    closeMob();
    notifyParentHeight();
    return true;
  }

function go(page) {
    if (!page) return;
    var path = pathForPage(page);
    if (path === "/" && document.getElementById("page-home")) {
      showHomeInSpa();
      return;
    }
    if (path) {
      navigate(path);
      return;
    }
    navigate("/");
  }

  function goInd(slug) {
    if (!slug || slug === "all") {
      navigate("/industries");
      return;
    }
    if (slug === "home-services") {
      navigate("/industries/cleaning");
      return;
    }
    navigate("/industries/" + slug);
  }

  function goSol(slug) {
    if (slug && SOLUTION_SLUGS[slug]) {
      navigate("/solutions/" + slug);
      return;
    }
    navigate("/solutions/answering");
  }

  function toggleMob() {
    var nav = document.getElementById("mob-nav");
    if (!nav) return;
    nav.classList.toggle("open");
    document.body.style.overflow = nav.classList.contains("open") ? "hidden" : "";
  }

  function closeMob() {
    var nav = document.getElementById("mob-nav");
    if (!nav || !nav.classList.contains("open")) return;
    nav.classList.remove("open");
    document.body.style.overflow = "";
  }

  function faqToggle(el) {
    if (el && el.parentElement) el.parentElement.classList.toggle("open");
  }

  function openChat() {
    if (typeof window.Intercom === "function") {
      window.Intercom("show");
      return;
    }
    window.location.href = "mailto:info@calliqlabs.com";
  }

  function handleContactForm(event) {
    if (event && event.preventDefault) event.preventDefault();
    var form = event && event.target;
    if (!form) return false;
    var name = (form.querySelector('input[type="text"]') || {}).value || "";
    var email = (form.querySelector('input[type="email"]') || {}).value || "";
    var message = (form.querySelector("textarea") || {}).value || "";
    var body = "From: " + name + " <" + email + ">\n\n" + message;
    var mailto =
      "mailto:info@calliqlabs.com?subject=" +
      encodeURIComponent("Contact form: " + name) +
      "&body=" +
      encodeURIComponent(body);
    window.open(mailto, "_blank");
    return false;
  }

  function formatMoney(n) {
    return "$" + Math.round(n).toLocaleString("en-US");
  }

  function calcROI() {
    var missEl = document.getElementById("r-miss");
    var valEl = document.getElementById("r-val");
    var convEl = document.getElementById("r-conv");
    var planEl = document.getElementById("r-plan");
    if (!missEl || !valEl || !convEl || !planEl) return;

    var missed = Math.max(0, Number(missEl.value) || 0);
    var jobValue = Math.max(0, Number(valEl.value) || 0);
    var convPct = Math.min(100, Math.max(1, Number(convEl.value) || 30)) / 100;
    var planMonthly = Math.max(0, Number(planEl.value) || 149);

    var monthlyRecovered = missed * jobValue * convPct;
    var annualRecovered = monthlyRecovered * 12;
    var annualCost = planMonthly * 12;
    var net = annualRecovered - annualCost;
    var mult = annualCost > 0 ? Math.max(0, annualRecovered / annualCost) : 0;

    var monthlyOut = document.getElementById("r-monthly");
    var annualOut = document.getElementById("r-annual");
    var costOut = document.getElementById("r-cost");
    var netOut = document.getElementById("r-net");
    var multOut = document.getElementById("r-mult");

    if (monthlyOut) monthlyOut.textContent = formatMoney(monthlyRecovered);
    if (annualOut) annualOut.textContent = formatMoney(annualRecovered);
    if (costOut) costOut.textContent = formatMoney(annualCost);
    if (netOut) netOut.textContent = formatMoney(net);
    if (multOut) {
      multOut.textContent =
        "Net Annual ROI — " +
        (mult >= 1 ? Math.round(mult) + "x your investment" : "recalculate inputs");
    }
  }

  function hydratePlanSelect() {
    var planEl = document.getElementById("r-plan");
    if (!planEl) return;

    fetch(apiBase() + "/api/v1/billing/plans")
      .then(function (res) {
        return res.json();
      })
      .then(function (json) {
        var data = json && json.data;
        if (!data) return;
        var order = ["essential", "professional"];
        planEl.innerHTML = "";
        order.forEach(function (key) {
          if (!data[key]) return;
          var opt = document.createElement("option");
          opt.value = String(data[key].price);
          opt.textContent = data[key].name + " — $" + data[key].price + "/mo";
          if (key === "professional") opt.selected = true;
          planEl.appendChild(opt);
        });
        calcROI();
      })
      .catch(function () {});
  }

  function wireFooterLinks() {
    document.querySelectorAll("footer .flink, footer .footer-links-row a").forEach(function (a) {
      var text = (a.textContent || "").trim().toLowerCase();
      if (text.indexOf("privacy") !== -1) a.setAttribute("onclick", "go('privacy')");
      else if (text.indexOf("terms") !== -1) a.setAttribute("onclick", "go('terms')");
      else if (text.indexOf("ai disclosure") !== -1) a.setAttribute("onclick", "go('privacy')");
      else if (text.indexOf("features") !== -1 || text.indexOf("what we do") !== -1)
        a.setAttribute("onclick", "go('features')");
      else if (text.indexOf("pricing") !== -1 || text.indexOf("plans") !== -1)
        a.setAttribute("onclick", "go('pricing')");
      else if (text.indexOf("faq") !== -1) a.setAttribute("onclick", "go('faq')");
      else if (text.indexOf("sign in") !== -1) a.setAttribute("onclick", "go('login')");
      else if (text.indexOf("sign up") !== -1) a.setAttribute("onclick", "go('signup')");
      else if (text.indexOf("contact") !== -1) a.setAttribute("onclick", "go('contact')");
      else if (text.indexOf("security") !== -1) a.setAttribute("onclick", "go('security')");
      else if (text.indexOf("about") !== -1) a.setAttribute("onclick", "go('about')");
      else if (text.indexOf("integrations") !== -1) a.setAttribute("onclick", "go('integrations')");
      else if (text.indexOf("how it works") !== -1) a.setAttribute("onclick", "go('how-it-works')");
      else if (text.indexOf("roi") !== -1) a.setAttribute("onclick", "go('roi')");
      else if (text.indexOf("blog") !== -1) a.setAttribute("onclick", "go('blog')");
      else if (text.indexOf("hvac") !== -1) a.setAttribute("onclick", "goInd('hvac')");
      else if (text.indexOf("plumbing") !== -1) a.setAttribute("onclick", "goInd('plumbing')");
      else if (text.indexOf("legal") !== -1) a.setAttribute("onclick", "goInd('legal')");
      else if (text.indexOf("industries") !== -1) a.setAttribute("onclick", "go('industries')");
    });
  }

  window.go = go;
  window.goInd = goInd;
  window.goSol = goSol;
  window.toggleMob = toggleMob;
  window.closeMob = closeMob;
  window.calcROI = calcROI;
  window.faqToggle = faqToggle;
  window.openChat = openChat;
  window.handleContactForm = handleContactForm;

  document.addEventListener("DOMContentLoaded", function () {
    wireFooterLinks();
    hydratePlanSelect();
    calcROI();
    scheduleHeightNotifications();
    window.addEventListener("resize", notifyParentHeight);
    window.addEventListener("load", scheduleHeightNotifications);
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") closeMob();
    });
  });
})();
