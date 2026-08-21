/**
 * Publish root Halla marketing files into Marketing site + Next.js dashboard.
 *
 * Edit at repo root (source of truth):
 *   index.html
 *   halla_preview.html
 *   halla_styles.css
 *   halla_main.js
 *
 * Outputs:
 *   Marketing site/*
 *   apps/dashboard/public/marketing-body.html (NOT index.html — Next.js serves
 *     public/index.html as a static file at "/", shadowing the real React
 *     marketing page that reads this file and wires up auth navigation)
 *   apps/dashboard/public/halla_main.js
 *   apps/dashboard/public/halla_styles.css
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const MARKETING_DIR = path.join(REPO_ROOT, "Marketing site");
const DASHBOARD_PUBLIC = path.join(REPO_ROOT, "apps", "dashboard", "public");

const ROOT_FILES = {
  indexHtml: path.join(REPO_ROOT, "index.html"),
  previewHtml: path.join(REPO_ROOT, "halla_preview.html"),
  css: path.join(REPO_ROOT, "halla_styles.css"),
  js: path.join(REPO_ROOT, "halla_main.js"),
};

const LANG_CSS_BLOCK = `
.lang-ar { display: none; }
html[dir="rtl"] .lang-en,
#marketing-spa-root[dir="rtl"] .lang-en,
[dir="rtl"] .lang-en { display: none; }
html[dir="rtl"] .lang-ar,
#marketing-spa-root[dir="rtl"] .lang-ar,
[dir="rtl"] .lang-ar { display: inline; }
html[dir="rtl"] .lang-ar.lang-block,
#marketing-spa-root[dir="rtl"] .lang-ar.lang-block,
[dir="rtl"] .lang-ar.lang-block { display: block; }`;

const LANG_CSS_PATTERN =
  /(?:\.lang-ar\s*\{\s*display:\s*none;\s*\}[\s\S]*?(?:html\[dir="rtl"\]\s*\.lang-ar\.lang-block|#marketing-spa-root\[dir="rtl"\]\s*\.lang-ar\.lang-block)[^{]*\{\s*display:\s*block;\s*\})/;

const SETLANG_REPLACEMENT = `function setLang(lang) {
  const isAr = lang === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const htmlLang = isAr ? 'ar' : 'en';
  const html = document.documentElement;
  html.setAttribute('dir', dir);
  html.setAttribute('lang', htmlLang);
  const root = document.getElementById('marketing-spa-root');
  if (root) {
    root.setAttribute('dir', dir);
    root.setAttribute('lang', htmlLang);
  }
  document.querySelectorAll('.lang-toggle button').forEach(b => {
    b.classList.toggle('active', b.dataset.lang === lang);
  });
  try { localStorage.setItem('halla_lang', lang); } catch (e) {}
}`;

const SETLANG_PATTERN = /function setLang\(lang\)\s*\{[\s\S]*?try\s*\{\s*localStorage\.setItem\('halla_lang', lang\);\s*\}\s*catch\s*\([^)]*\)\s*\{\s*\}\s*\}/;

function missing(paths) {
  return paths.filter((p) => !fs.existsSync(p));
}

function writeFileAtomic(targetPath, content) {
  const dir = path.dirname(targetPath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = path.join(dir, `.${path.basename(targetPath)}.tmp`);
  fs.writeFileSync(tmp, content, "utf8");
  try {
    fs.renameSync(tmp, targetPath);
  } catch {
    try {
      fs.unlinkSync(targetPath);
    } catch {
      /* ignore */
    }
    fs.renameSync(tmp, targetPath);
  }
}

function prepareCss(css) {
  if (LANG_CSS_PATTERN.test(css)) {
    return css.replace(LANG_CSS_PATTERN, LANG_CSS_BLOCK.trim());
  }
  return `${css.trim()}\n${LANG_CSS_BLOCK}\n`;
}

function prepareJs(js) {
  if (SETLANG_PATTERN.test(js)) {
    return js.replace(SETLANG_PATTERN, SETLANG_REPLACEMENT);
  }
  return js;
}

function prepareIndexHtml(html) {
  let out = html;
  out = out.replace(
    /href=["']\.?\/?halla_styles\.css["']/gi,
    'href="/halla_styles.css"'
  );
  out = out.replace(/src=["']\.?\/?halla_main\.js["']/gi, 'src="/halla_main.js"');
  return out;
}

function copyUtf8(src, dest, transform) {
  const raw = fs.readFileSync(src, "utf8");
  const content = transform ? transform(raw) : raw;
  writeFileAtomic(dest, content);
}

function syncOnce() {
  const absent = missing(Object.values(ROOT_FILES));
  if (absent.length > 0) {
    const dashboardOutputs = [
      path.join(DASHBOARD_PUBLIC, "marketing-body.html"),
      path.join(DASHBOARD_PUBLIC, "halla_main.js"),
      path.join(DASHBOARD_PUBLIC, "halla_styles.css"),
    ];
    const outputsMissing = missing(dashboardOutputs);
    if (outputsMissing.length === 0) {
      console.log(
        "[sync-halla-marketing] Root files not present (gitignored locally). " +
          "Using committed apps/dashboard/public/*."
      );
      return;
    }
    console.error(
      "[sync-halla-marketing] Missing root files:\n" +
        absent.map((p) => `  - ${path.relative(REPO_ROOT, p)}`).join("\n") +
        "\n\nPlace index.html, halla_preview.html, halla_styles.css, and halla_main.js in the repo root, then re-run."
    );
    process.exit(1);
  }

  const css = prepareCss(fs.readFileSync(ROOT_FILES.css, "utf8"));
  const js = prepareJs(fs.readFileSync(ROOT_FILES.js, "utf8"));
  const indexHtml = prepareIndexHtml(fs.readFileSync(ROOT_FILES.indexHtml, "utf8"));
  const previewHtml = fs.readFileSync(ROOT_FILES.previewHtml, "utf8");

  writeFileAtomic(path.join(MARKETING_DIR, "index.html"), indexHtml);
  writeFileAtomic(path.join(MARKETING_DIR, "halla_preview.html"), previewHtml);
  writeFileAtomic(path.join(MARKETING_DIR, "halla_styles.css"), css);
  writeFileAtomic(path.join(MARKETING_DIR, "halla_main.js"), js);

  writeFileAtomic(path.join(DASHBOARD_PUBLIC, "marketing-body.html"), indexHtml);
  writeFileAtomic(path.join(DASHBOARD_PUBLIC, "halla_styles.css"), css);
  writeFileAtomic(path.join(DASHBOARD_PUBLIC, "halla_main.js"), js);

  console.log("[sync-halla-marketing] Synced root → Marketing site + apps/dashboard/public");
  console.log("[sync-halla-marketing] Done.");
}

const watchMode = process.argv.includes("--watch");
if (watchMode) {
  let timer;
  const run = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      try {
        syncOnce();
      } catch (e) {
        console.error("[sync-halla-marketing]", e.message);
      }
    }, 200);
  };
  syncOnce();
  for (const file of Object.values(ROOT_FILES)) {
    fs.watch(file, { persistent: true }, run);
  }
  console.log("[sync-halla-marketing] Watching root halla files (Ctrl+C to stop)…");
} else {
  syncOnce();
}
