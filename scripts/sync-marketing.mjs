/**
 * Publish root landing files into the Next.js dashboard.
 *
 * Edit at repo root (gitignored, local only):
 *   index.html
 *   calliq_styles.css
 *   calliq_main.js
 *
 * On Vercel/CI, root files are absent; build uses committed outputs below.
 *
 * Outputs (committed, served at /calliq-spa.html, /calliq-marketing.css, /calliq_main.js):
 *   apps/dashboard/public/calliq-spa.html
 *   apps/dashboard/public/calliq_main.js
 *   apps/dashboard/public/calliq-marketing.css (+ src/styles copy via scope script)
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { createHash } from "crypto";
import { prepareLandingCss, prepareLandingHtml } from "./landing-production.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const DASHBOARD = path.join(REPO_ROOT, "apps", "dashboard");

const ROOT_FILES = {
  html: path.join(REPO_ROOT, "index.html"),
  css: path.join(REPO_ROOT, "calliq_styles.css"),
  js: path.join(REPO_ROOT, "calliq_main.js"),
};

const OUT = {
  indexHtml: path.join(DASHBOARD, "public", "index.html"),
  spa: path.join(DASHBOARD, "public", "calliq-spa.html"),
  js: path.join(DASHBOARD, "public", "calliq_main.js"),
  publicCss: path.join(DASHBOARD, "public", "calliq_styles.css"),
  unscopedCss: path.join(DASHBOARD, "public", "calliq-marketing.unscoped.css"),
};

function missing(paths) {
  return paths.filter((p) => !fs.existsSync(p));
}

function writeFileAtomic(targetPath, content) {
  const dir = path.dirname(targetPath);
  const tmp = path.join(dir, `.${path.basename(targetPath)}.tmp`);
  fs.writeFileSync(tmp, content, "utf8");
  try {
    fs.renameSync(tmp, targetPath);
  } catch (err) {
    try {
      fs.unlinkSync(targetPath);
    } catch (_) {
      /* ignore */
    }
    fs.renameSync(tmp, targetPath);
  }
}

function copyFileAtomic(src, dest) {
  writeFileAtomic(dest, fs.readFileSync(src, "utf8"));
}

// Content-hash cache bust so browsers/CDNs always fetch a fresh /logo.png
// after it changes, instead of serving a stale cached copy at the same URL.
function logoVersion() {
  try {
    const logoPath = path.join(DASHBOARD, "public", "logo.png");
    const buf = fs.readFileSync(logoPath);
    return createHash("md5").update(buf).digest("hex").slice(0, 10);
  } catch {
    return String(Date.now());
  }
}

const LOGO_SRC = `/logo.png?v=${logoVersion()}`;
const NAV_LOGO_HTML = `<img src="${LOGO_SRC}" alt="Call IQ" />`;
const FOOTER_LOGO_HTML =
  `<div class="footer-logo"><a href="javascript:void(0)" onclick="go('home')" aria-label="Call IQ home"><img src="${LOGO_SRC}" alt="Call IQ" /></a></div>`;

function fixMarketingLogos(html) {
  let out = html
    .replace(/<img src="data:image\/[^"]+" alt="Call IQ"[^>]*>/gi, NAV_LOGO_HTML)
    .replace(/<img src="\/logo\.png(?:\?v=[^"]*)?" alt="Call IQ"[^>]*>/gi, NAV_LOGO_HTML)
    .replace(/<div class="footer-logo"><img src="data:image[^>]*><\/div>/, FOOTER_LOGO_HTML)
    .replace(/<div class="footer-logo"><img src="\/logo\.png(?:\?v=[^"]*)?"[^>]*><\/div>/, FOOTER_LOGO_HTML)
    .replace(
      /<div class="footer-logo"><a class="footer-wordmark"[^>]*>[\s\S]*?<\/a><\/div>/,
      FOOTER_LOGO_HTML
    );
  return out;
}

function prepareHtmlExact(html) {
  let out = prepareLandingHtml(html);
  out = out.replace(/href=["']\.?\/?calliq_styles\.css["']/gi, 'href="/calliq_styles.css"');
  out = out.replace(/src=["']\.?\/?calliq_main\.js["']/gi, 'src="/calliq_main.js"');
  return fixMarketingLogos(out);
}

function prepareHtml(html) {
  let out = html;

  out = out.replace(/href=["']\.?\/?calliq_styles\.css["']/gi, 'href="/calliq-marketing.css"');
  out = out.replace(/href=["']calliq-marketing\.unscoped\.css["']/gi, 'href="/calliq-marketing.css"');

  out = out.replace(/src=["']\.?\/?calliq_main\.js["']/gi, 'src="/calliq_main.js"');

  /** Do not match href="/calliq-marketing.css" — only the body element. */
  if (!/<body[^>]*\bcalliq-marketing\b/i.test(out)) {
    out = out.replace(/<body([^>]*)>/i, (match, attrs) => {
      const a = attrs || "";
      if (/class\s*=/.test(a)) {
        return `<body${a.replace(/class\s*=\s*["']([^"']*)["']/i, (_, classes) => {
          const next = classes.includes("calliq-marketing")
            ? classes
            : `${classes} calliq-marketing`.trim();
          return `class="${next}"`;
        })}>`;
      }
      return '<body class="calliq-marketing">';
    });
  }

  return fixMarketingLogos(out);
}

const COMMITTED_OUTPUTS = [
  OUT.indexHtml,
  OUT.spa,
  OUT.js,
  OUT.publicCss,
  path.join(DASHBOARD, "public", "calliq-marketing.css"),
];

function syncOnce() {
  const absent = missing([ROOT_FILES.html, ROOT_FILES.css, ROOT_FILES.js]);
  if (absent.length > 0) {
    const outputsMissing = missing(COMMITTED_OUTPUTS);
    if (outputsMissing.length === 0) {
      console.log(
        "[sync-marketing] Root landing files not in repo (gitignored). " +
          "Using committed apps/dashboard/public/* (Vercel/CI)."
      );
      return;
    }
    console.error(
      "[sync-marketing] Missing root landing files:\n" +
        absent.map((p) => `  - ${path.relative(REPO_ROOT, p)}`).join("\n") +
        "\n\nPlace index.html, calliq_styles.css, and calliq_main.js in the repo root, then re-run.\n" +
        "Or commit generated files under apps/dashboard/public/."
    );
    process.exit(1);
  }

  const html = fs.readFileSync(ROOT_FILES.html, "utf8");
  const exactHtml = prepareHtmlExact(html);
  writeFileAtomic(OUT.indexHtml, exactHtml);
  console.log("[sync-marketing] Wrote", path.relative(REPO_ROOT, OUT.indexHtml));

  writeFileAtomic(OUT.spa, exactHtml);
  console.log("[sync-marketing] Wrote", path.relative(REPO_ROOT, OUT.spa));

  copyFileAtomic(ROOT_FILES.js, OUT.js);
  console.log("[sync-marketing] Wrote", path.relative(REPO_ROOT, OUT.js));

  copyFileAtomic(ROOT_FILES.css, OUT.publicCss);
  console.log("[sync-marketing] Wrote", path.relative(REPO_ROOT, OUT.publicCss));

  const scopedCss = prepareLandingCss(fs.readFileSync(OUT.publicCss, "utf8"));
  writeFileAtomic(OUT.publicCss, scopedCss);
  writeFileAtomic(OUT.unscopedCss, scopedCss);
  console.log("[sync-marketing] Wrote", path.relative(REPO_ROOT, OUT.unscopedCss));

  const scope = spawnSync(
    process.execPath,
    [path.join(DASHBOARD, "scripts", "scope-marketing-css.mjs")],
    { stdio: "inherit", cwd: DASHBOARD }
  );
  if (scope.status !== 0) {
    process.exit(scope.status ?? 1);
  }

  console.log("[sync-marketing] Done. Preview at http://127.0.0.1:3000 after npm run dev");
}

function watchRoot() {
  const absent = missing([ROOT_FILES.html, ROOT_FILES.css, ROOT_FILES.js]);
  if (absent.length > 0) {
    console.error(
      "[sync-marketing] Add these files at repo root before watch:\n" +
        absent.map((p) => `  - ${path.relative(REPO_ROOT, p)}`).join("\n")
    );
    process.exit(1);
  }

  let timer;
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        syncOnce();
      } catch (e) {
        console.error("[sync-marketing]", e.message);
      }
    }, 200);
  };

  syncOnce();
  for (const file of Object.values(ROOT_FILES)) {
    fs.watch(file, { persistent: true }, run);
  }
  console.log("[sync-marketing] Watching root landing files (Ctrl+C to stop)…");
}

const watchMode = process.argv.includes("--watch");
if (watchMode) {
  watchRoot();
} else {
  syncOnce();
}
