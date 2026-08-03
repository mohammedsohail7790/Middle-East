/**
 * Scope marketing CSS under .calliq-marketing (safe for @keyframes / @media).
 * Reads public/calliq-marketing.unscoped.css (from root calliq_styles.css via sync-marketing.mjs).
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "..");
const INPUT = path.join(ROOT, "public/calliq-marketing.unscoped.css");
const SCOPE = ".calliq-marketing";

const INTERACTION_FIXES = `
/* Touch / click stability — prevents triangular flash on tap */
${SCOPE} {
  -webkit-tap-highlight-color: transparent;
}
${SCOPE} a,
${SCOPE} button {
  touch-action: manipulation;
}
${SCOPE} .btn:active,
${SCOPE} .card:active,
${SCOPE} .ind-card:active,
${SCOPE} .logo-pill:active,
${SCOPE} .pricing-card:active {
  transform: none !important;
}
@media (hover: hover) and (pointer: fine) {
  ${SCOPE} .nav-item:hover .dropdown {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
  }
  ${SCOPE} .nav-item:hover .nav-link svg {
    transform: rotate(180deg);
  }
}
@media (hover: none), (pointer: coarse) {
  ${SCOPE} .nav-item:hover .dropdown {
    opacity: 0;
    visibility: hidden;
    transform: translateY(-6px);
  }
  ${SCOPE} .nav-item:hover .nav-link svg {
    transform: none;
  }
  ${SCOPE} .btn-primary:hover,
  ${SCOPE} .btn-blue:hover,
  ${SCOPE} .card:hover,
  ${SCOPE} .ind-card:hover,
  ${SCOPE} .logo-pill:hover {
    transform: none;
  }
}
@media (max-width: 768px) {
  ${SCOPE} .hero-actions {
    align-items: stretch;
    width: 100%;
  }
  ${SCOPE} .hero-actions .btn {
    width: 100%;
    max-width: 360px;
    margin-left: auto;
    margin-right: auto;
  }
  ${SCOPE} .container,
  ${SCOPE} .container-sm {
    padding-left: 20px;
    padding-right: 20px;
  }
  ${SCOPE} .stats-bar {
    width: 100%;
    max-width: 360px;
    margin-left: auto;
    margin-right: auto;
  }
  ${SCOPE} .roi-wrap {
    padding: 24px 20px;
  }
  ${SCOPE} .page-hero {
    padding: 100px 0 48px;
  }
  ${SCOPE} .grid-2[style*="gap:48px"] {
    grid-template-columns: 1fr !important;
    gap: 28px !important;
  }
  ${SCOPE} .step-row {
    flex-direction: column;
    gap: 12px;
  }
  ${SCOPE} .value-item {
    flex-direction: column;
    gap: 12px;
  }
  ${SCOPE} .comp-table {
    font-size: 0.8rem;
  }
  ${SCOPE} .pricing-card {
    padding: 28px 22px;
  }
}
@media (max-width: 480px) {
  ${SCOPE} .hero h1 {
    font-size: clamp(2rem, 9vw, 2.6rem);
  }
  ${SCOPE} .pricing-price {
    font-size: 2.4rem;
  }
  ${SCOPE} .roi-result-num {
    font-size: 1.75rem;
  }
}
`;

function splitTopLevelSelectors(selector) {
  const parts = [];
  let depth = 0;
  let current = "";
  for (let i = 0; i < selector.length; i++) {
    const ch = selector[i];
    if (ch === "(" || ch === "[") depth++;
    else if (ch === ")" || ch === "]") depth = Math.max(0, depth - 1);
    else if (ch === "," && depth === 0) {
      parts.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

function scopeSelector(sel) {
  sel = sel.trim();
  if (!sel) return sel;
  if (sel.startsWith(SCOPE)) return sel;
  if (sel === ":root" || sel === "html" || sel === "body") return SCOPE;
  if (sel === "*") return `${SCOPE} *`;
  return splitTopLevelSelectors(sel)
    .map((part) => {
      if (part === ":root" || part === "html" || part === "body") return SCOPE;
      if (part.startsWith(SCOPE)) return part;
      if (part === "*") return `${SCOPE} *`;
      return `${SCOPE} ${part}`;
    })
    .join(", ");
}

function processRules(css) {
  let out = "";
  let i = 0;

  while (i < css.length) {
    while (i < css.length && /\s/.test(css[i])) i++;

    if (i >= css.length) break;

    if (css.slice(i, i + 2) === "/*") {
      const end = css.indexOf("*/", i + 2);
      if (end === -1) break;
      out += css.slice(i, end + 2);
      i = end + 2;
      continue;
    }

    if (css[i] === "@") {
      const brace = css.indexOf("{", i);
      if (brace === -1) break;
      const prelude = css.slice(i, brace).trim();
      i = brace + 1;

      if (/^@keyframes\b/i.test(prelude)) {
        let depth = 1;
        const innerStart = i;
        while (i < css.length && depth > 0) {
          if (css[i] === "{") depth++;
          else if (css[i] === "}") depth--;
          i++;
        }
        out += `${prelude}{${css.slice(innerStart, i - 1)}}`;
        continue;
      }

      if (/^@media\b/i.test(prelude)) {
        let depth = 1;
        const innerStart = i;
        while (i < css.length && depth > 0) {
          if (css[i] === "{") depth++;
          else if (css[i] === "}") depth--;
          i++;
        }
        const inner = css.slice(innerStart, i - 1);
        out += `${prelude}{${processRules(inner)}}`;
        continue;
      }

      let depth = 1;
      const innerStart = i;
      while (i < css.length && depth > 0) {
        if (css[i] === "{") depth++;
        else if (css[i] === "}") depth--;
        i++;
      }
      out += `${prelude}{${css.slice(innerStart, i - 1)}}`;
      continue;
    }

    const brace = css.indexOf("{", i);
    if (brace === -1) break;
    const selector = css.slice(i, brace).trim();
    i = brace + 1;
    let depth = 1;
    const propsStart = i;
    while (i < css.length && depth > 0) {
      if (css[i] === "{") depth++;
      else if (css[i] === "}") depth--;
      i++;
    }
    const props = css.slice(propsStart, i - 1);
    if (selector) out += `${scopeSelector(selector)}{${props}}`;
  }

  return out;
}

function buildScopedCss(raw) {
  let css = raw.replace(/^\s*\/\*[\s\S]*?\*\/\s*/m, "").trim();
  css = css.replace(/^\*,\s*\*::before[\s\S]*?\}\s*\n/m, "");
  css = css.replace(/^html\s*\{[^}]*\}\s*\n/m, "");
  css = css.replace(/^body\s*\{[^}]*\}\s*\n/m, "");

  const header = `/* Scoped Call IQ marketing — generated by scripts/scope-marketing-css.mjs */\n`;
  const base = `${SCOPE} {
  font-family: var(--font);
  background: var(--white);
  color: var(--black);
  line-height: 1.6;
  overflow-x: hidden;
  -webkit-font-smoothing: antialiased;
  min-height: 100%;
}
${SCOPE} *, ${SCOPE} *::before, ${SCOPE} *::after {
  box-sizing: border-box;
}

`;

  return header + base + processRules(css) + INTERACTION_FIXES;
}

function isAlreadyScoped(css) {
  return css.includes("/* Scoped Call IQ marketing");
}

const raw = fs.readFileSync(INPUT, "utf8");
let source = raw;
if (isAlreadyScoped(raw)) {
  const unscopedBackup = path.join(ROOT, "public/calliq-marketing.unscoped.css");
  if (fs.existsSync(unscopedBackup)) {
    source = fs.readFileSync(unscopedBackup, "utf8");
  } else {
    console.warn("Input already scoped; writing backup and using current file minus scope markers.");
    fs.writeFileSync(unscopedBackup, raw);
    source = raw.replace(/\/\* Scoped Call IQ marketing[\s\S]*?\n\n/, "");
    source = source.replace(new RegExp(`\\${SCOPE}\\s*\\{[\\s\\S]*?\\}\\s*\\n\\${SCOPE.replace(".", "\\.")}\\s*\\*`, "m"), "");
    source = source.replace(/\/\* Touch \/ click stability[\s\S]*$/m, "");
    source = source.replace(new RegExp(`\\${SCOPE.replace(".", "\\.")}\\s+`, "g"), "");
  }
}

if (!fs.existsSync(path.join(ROOT, "public/calliq-marketing.unscoped.css"))) {
  fs.writeFileSync(path.join(ROOT, "public/calliq-marketing.unscoped.css"), source);
}

const scoped = buildScopedCss(source);
const outPublic = path.join(ROOT, "public/calliq-marketing.css");
const outSrc = path.join(ROOT, "src/styles/calliq-marketing.css");

function writeAtomic(targetPath, content) {
  const dir = path.dirname(targetPath);
  const tmp = path.join(dir, `.${path.basename(targetPath)}.tmp`);
  fs.writeFileSync(tmp, content, "utf8");
  try {
    fs.renameSync(tmp, targetPath);
  } catch {
    try {
      fs.unlinkSync(targetPath);
    } catch (_) {
      /* ignore */
    }
    fs.renameSync(tmp, targetPath);
  }
}

writeAtomic(outPublic, scoped);
writeAtomic(outSrc, scoped);
console.log("Wrote", outPublic);
console.log("Wrote", outSrc);
