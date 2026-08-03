/** Shared production fixes for Desktop landing HTML/CSS before Vercel deploy. */

export function prepareLandingHtml(html) {
  let out = html;

  out = out.replace(
    /<a class="btn btn-outline btn-sm" href="javascript:void\(0\)" onclick="go\('pricing'\)">Sign In<\/a>/g,
    '<a class="btn btn-outline btn-sm" href="javascript:void(0)" onclick="go(\'login\')">Sign In</a>'
  );

  out = out.replace(
    /onclick="alert\('Thank you! We will contact you within 24 hours to complete your setup\.'\)"/g,
    'onclick="go(\'signup\')"'
  );

  out = out.replace(
    /\s*style="color:rgba\(255,255,255,0\.7\);border-color:rgba\(255,255,255,0\.2\)"/gi,
    ""
  );
  out = out.replace(
    /\s*style="color: rgba\(255,255,255,0\.7\); border-color: rgba\(255,255,255,0\.2\);"/gi,
    ""
  );

  out = out.replace(/<span>📞 24\/7<\/span>/g, "<span>24/7</span>");
  out = out.replace(/<span>🤖 Pure AI<\/span>/g, "<span>Pure AI</span>");
  out = out.replace(/<span>🌎 EN \+ ES<\/span>/g, "<span>EN + ES</span>");

  if (!/<link rel="icon"/i.test(out)) {
    out = out.replace(
      /<meta name="viewport"[^>]*>/i,
      (match) =>
        `${match}\n<link rel="icon" href="/logo.png" type="image/png">\n<meta name="description" content="Call IQ answers every call 24/7, books appointments, captures leads, and routes emergencies — automatically.">\n<meta property="og:title" content="Call IQ – Pure AI Receptionist">\n<meta property="og:description" content="Never miss a call again. AI receptionist for service businesses.">\n<meta property="og:type" content="website">`
    );
  }

  return out;
}

export function prepareLandingCss(css) {
  let out = css;

  out = out.replace(
    /body \{ font-family: var\(--font\); background: var\(--white\); color: var\(--black\); line-height: 1\.6;/,
    "body { font-family: var(--font); background: var(--white); color: var(--black); line-height: 1.65;"
  );
  out = out.replace(
    /p \{ color: var\(--gray-500\); line-height: 1\.72; \}/,
    "p { color: var(--gray-600); line-height: 1.75; }"
  );

  out = out.replace(
    /\.btn-primary \{ background: var\(--black\); color: var\(--white\); \}\s*\.btn-primary:hover \{ background: var\(--gray-800\); transform: translateY\(-1px\); box-shadow: var\(--shadow-md\); \}\s*\.btn-outline \{ background: transparent; color: var\(--black\); border: 1\.5px solid var\(--gray-200\); \}\s*\.btn-outline:hover \{ border-color: var\(--gray-400\); background: var\(--gray-50\); \}\s*\.btn-blue \{ background: var\(--accent\); color: var\(--white\); \}\s*\.btn-blue:hover \{ background: var\(--accent-dark\); transform: translateY\(-1px\); box-shadow: 0 8px 24px rgba\(14,165,233,0\.3\); \}\s*\.btn-lg \{ padding: 16px 34px; font-size: 1rem; \}\s*\.btn-sm \{ padding: 9px 18px; font-size: 0\.85rem; \}/,
    `.btn-primary { background: var(--accent); color: var(--white); box-shadow: 0 4px 14px rgba(14, 165, 233, 0.35); }
.btn-primary:hover { background: var(--accent-dark); transform: translateY(-1px); box-shadow: 0 10px 28px rgba(14, 165, 233, 0.4); }
.btn-outline { background: transparent; color: var(--gray-800); border: 1.5px solid var(--gray-300); }
.btn-outline:hover { border-color: var(--gray-500); background: var(--gray-50); color: var(--black); }
.btn-blue { background: var(--accent); color: var(--white); box-shadow: 0 4px 14px rgba(14, 165, 233, 0.35); }
.btn-blue:hover { background: var(--accent-dark); transform: translateY(-1px); box-shadow: 0 10px 28px rgba(14, 165, 233, 0.4); }
.btn-lg { padding: 16px 34px; font-size: 1.05rem; min-height: 52px; }
.btn-sm { padding: 10px 20px; font-size: 0.88rem; min-height: 40px; }
.btn:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; }`
  );

  if (!out.includes(".hero-sub { font-size: 1.15rem; color: var(--gray-600)")) {
    out = out.replace(
      /\.hero-sub \{ font-size: 1\.15rem; color: var\(--gray-500\); max-width: 560px; margin: 0 auto 36px; line-height: 1\.7; \}/,
      ".hero-sub { font-size: 1.15rem; color: var(--gray-600); max-width: 560px; margin: 0 auto 36px; line-height: 1.75; }"
    );
    out = out.replace(
      /\.hero-actions \{ display: flex; align-items: center; gap: 12px; flex-wrap: wrap; justify-content: center; margin-bottom: 20px; \}/,
      ".hero-actions { display: flex; align-items: stretch; gap: 14px; flex-wrap: wrap; justify-content: center; margin-bottom: 24px; }"
    );
    out = out.replace(
      /\.hero-note \{ font-size: 0\.8rem; color: var\(--gray-400\); \}/,
      ".hero-note { font-size: 0.85rem; color: var(--gray-600); line-height: 1.6; }"
    );
  }

  if (!out.includes(".cta-block .btn-outline {")) {
    out = out.replace(
      /\.cta-block p \{ color: rgba\(255,255,255,0\.55\); \}\s*\.cta-block \.btn-group \{ display: flex; gap: 12px;/,
      `.cta-block p { color: rgba(255,255,255,0.82); }
.cta-block .btn-group { display: flex; gap: 14px;`
    );
    out = out.replace(
      /\.cta-block \.btn-group \{ display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-top: 28px; \}/,
      `.cta-block .btn-group { display: flex; gap: 14px; justify-content: center; flex-wrap: wrap; margin-top: 32px; }
.cta-block .btn-outline {
  color: var(--white);
  border-color: rgba(255,255,255,0.55);
  background: transparent;
}
.cta-block .btn-outline:hover {
  background: rgba(255,255,255,0.12);
  border-color: var(--white);
  color: var(--white);
}`
    );
  }

  if (!out.includes(".nav-inner { height: 93px")) {
    out = out.replace(
      /\.nav-inner \{ display: flex; align-items: center; height: (66|114|103|93)px; gap: 4px; \}/,
      ".nav-inner { display: flex; align-items: center; height: 93px; gap: 4px; }"
    );
    out = out.replace(
      /\.logo img \{ height: (114|103|93)px; width: auto;[^}]*\}/,
      ".logo img { height: 93px; width: auto; object-fit: contain; display: block; }"
    );
    out = out.replace(
      /\.hero \{\s*padding: (140|188|177|167)px 0 80px;/,
      ".hero { padding: 167px 0 80px;"
    );
  }

  if (!out.includes(".footer-logo img { height: 52px")) {
    out = out.replace(
      /\.footer-logo img \{ height: 36px; filter: brightness\(0\) invert\(1\); opacity: 0\.85; \}/,
      `.footer-logo a { display: inline-block; text-decoration: none; }
.footer-logo img { height: 52px; width: auto; border-radius: 10px; filter: none; opacity: 1; }`
    );
    out = out.replace(
      /\.footer-grid \{ display: grid; grid-template-columns: 2\.2fr 1fr 1fr 1fr 1fr; gap: 48px; margin-bottom: 56px; \}/,
      ".footer-grid { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr 1fr 1fr; gap: 40px 32px; margin-bottom: 56px; }"
    );
  }

  if (!out.includes(".cta-block .btn-group .btn { width: 100%")) {
    out = out.replace(
      /(\.cta-block \{ padding: 48px 28px; \}\s*\.section \{ padding: 68px 0; \})/,
      `.cta-block { padding: 48px 24px; }
  .cta-block .btn-group { flex-direction: column; align-items: stretch; }
  .cta-block .btn-group .btn { width: 100%; }
  .section { padding: 72px 0; }`
    );
    out = out.replace(
      /(\.hero-actions \{ flex-direction: column; \})/,
      `.hero-actions { flex-direction: column; align-items: stretch; width: 100%; }
  .hero-actions .btn { width: 100%; }`
    );
    if (!out.includes(".nav-actions .btn-primary { min-height: 44px")) {
      out = out.replace(
        /(\.mock-badge \{ display: none; \}\s*\})/,
        `.mock-badge { display: none; }
  .nav-actions .btn-primary { min-height: 44px; }
}`
      );
    }
  }

  return out;
}
