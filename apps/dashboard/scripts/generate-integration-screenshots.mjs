/**
 * Generates readable SVG setup wireframes for guided integrations.
 * Run: node apps/dashboard/scripts/generate-integration-screenshots.mjs
 */
import { mkdirSync, writeFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "screenshots");

/** @type {Record<string, string>} */
const APP_NAMES = {
  pipedrive: "Pipedrive",
  servicetitan: "ServiceTitan",
  jobber: "Jobber",
  freshsales: "Freshsales",
  insightly: "Insightly",
  zoho: "Zoho CRM",
  copper: "Copper",
  followupboss: "Follow Up Boss",
  clio: "Clio",
  mycase: "MyCase",
  acuity: "Acuity Scheduling",
  setmore: "Setmore",
  "square-appointments": "Square Appointments",
  vagaro: "Vagaro",
  mindbody: "Mindbody",
  housecallpro: "Housecall Pro",
  buildium: "Buildium",
  appfolio: "AppFolio",
  yardi: "Yardi",
  zapier: "Zapier",
};

/**
 * @typedef {'signin' | 'navigate' | 'copy' | 'paste' | 'action'} StepKind
 * @typedef {{ kind: StepKind, headline: string, path?: string, detail?: string }} GuideStep
 */

/** @type {Record<string, GuideStep[]>} */
const GUIDED_APPS = {
  pipedrive: [
    { kind: "signin", headline: "Sign in to Pipedrive", detail: "Use the button above in Call IQ" },
    { kind: "navigate", headline: "Open API settings", path: "Profile (top right) → Personal preferences → API" },
    { kind: "copy", headline: "Copy your API token", detail: "Copy the full token shown on that page" },
    { kind: "paste", headline: "Paste in Call IQ", detail: "Company name + connection code in the boxes below" },
  ],
  freshsales: [
    { kind: "signin", headline: "Sign in to Freshsales", detail: "Use the button above in Call IQ" },
    { kind: "navigate", headline: "Open API settings", path: "Gear icon → Admin Settings → API Settings" },
    { kind: "copy", headline: "Copy your API key", detail: "Copy the entire key from that page" },
    { kind: "paste", headline: "Paste in Call IQ", detail: "Company name + API key below" },
  ],
  insightly: [
    { kind: "signin", headline: "Sign in to Insightly", detail: "Use the button above in Call IQ" },
    { kind: "navigate", headline: "Find your API key", path: "Profile → User Settings → API" },
    { kind: "copy", headline: "Copy your API key", detail: "Copy the key exactly as shown" },
    { kind: "paste", headline: "Paste in Call IQ", detail: "Paste in the box below → Connect" },
  ],
  zoho: [
    { kind: "signin", headline: "Open Zoho API Console", detail: "Use the settings link above" },
    { kind: "action", headline: "Create a Self Client", detail: "In API Console → Self Client → Add" },
    { kind: "copy", headline: "Copy Client ID, Secret & Refresh Token", detail: "Grant scope: ZohoCRM.modules.ALL" },
    { kind: "paste", headline: "Paste all three in Call IQ", detail: "Pick your region, then paste each code" },
  ],
  copper: [
    { kind: "signin", headline: "Sign in to Copper", detail: "Click the blue button above ↑" },
    { kind: "navigate", headline: "Go to API Keys", path: "Settings → Integrations → API Keys" },
    { kind: "action", headline: "Generate an API key", detail: "Click Generate API Key, then copy it" },
    { kind: "paste", headline: "Paste in Call IQ", detail: "Your login email + connection code below" },
  ],
  followupboss: [
    { kind: "signin", headline: "Sign in to Follow Up Boss", detail: "Click the blue button above ↑" },
    { kind: "navigate", headline: "Open API settings", path: "Admin (top menu) → API" },
    { kind: "action", headline: "Create API key", detail: "Click Create API Key — name it Call IQ" },
    { kind: "copy", headline: "Copy the key immediately", detail: "You only see the full key once" },
    { kind: "paste", headline: "Paste in Call IQ", detail: "Paste in the box below → Connect" },
  ],
  clio: [
    { kind: "signin", headline: "Sign in to Clio", detail: "Open developer settings from the link above" },
    { kind: "action", headline: "Authorize your app", detail: "Create or open your Call IQ app" },
    { kind: "paste", headline: "Paste access token in Call IQ", detail: "Copy the token → paste below → Connect" },
  ],
  mycase: [
    { kind: "signin", headline: "Sign in to MyCase", detail: "Use the button above in Call IQ" },
    { kind: "copy", headline: "Copy your access token", detail: "From API settings after your rep enables access" },
    { kind: "paste", headline: "Paste in Call IQ", detail: "Paste below → Connect" },
  ],
  acuity: [
    { kind: "signin", headline: "Sign in to Acuity", detail: "Use the settings link above" },
    { kind: "navigate", headline: "Open API page", path: "Business Settings → Integrations → API" },
    { kind: "copy", headline: "Copy User ID and API key", detail: "Both are on the same page" },
    { kind: "paste", headline: "Paste both in Call IQ", detail: "User number + connection code below" },
  ],
  setmore: [
    { kind: "signin", headline: "Sign in to Setmore", detail: "my.setmore.com — button above" },
    { kind: "action", headline: "Request API access", detail: "setmore.com/developers if you need a key" },
    { kind: "paste", headline: "Paste API key in Call IQ", detail: "Paste below → Connect" },
  ],
  "square-appointments": [
    { kind: "signin", headline: "Open Square Developer Dashboard", detail: "Link above → sign in" },
    { kind: "navigate", headline: "Open your application", path: "Developer Dashboard → Your App" },
    { kind: "copy", headline: "Copy Access Token + Location ID", detail: "From Production credentials" },
    { kind: "paste", headline: "Paste both in Call IQ", detail: "Token + location number below" },
  ],
  vagaro: [
    { kind: "signin", headline: "Sign in to Vagaro", detail: "Use the link above" },
    { kind: "action", headline: "Get API access from Vagaro", detail: "Contact support if you don't have a key yet" },
    { kind: "paste", headline: "Paste Business ID + key", detail: "Both values in the boxes below" },
  ],
  mindbody: [
    { kind: "signin", headline: "Open Mindbody Developer Portal", detail: "Link above → sign in" },
    { kind: "copy", headline: "Copy Site ID + API key", detail: "From your approved developer app" },
    { kind: "paste", headline: "Paste both in Call IQ", detail: "Site number + connection code below" },
  ],
  servicetitan: [
    { kind: "signin", headline: "Open ServiceTitan Developer Portal", detail: "Sign in as Production User — button above" },
    { kind: "navigate", headline: "Find Tenant ID in ServiceTitan app", path: "Settings → Integrations → API Application Access" },
    { kind: "copy", headline: "Copy App Key + Client Secret", detail: "From developer.servicetitan.io → your app" },
    { kind: "paste", headline: "Paste all values in Call IQ", detail: "Tenant ID, App Key, and secret below" },
  ],
  jobber: [
    { kind: "signin", headline: "Open Jobber Developer Center", detail: "Link above → sign in" },
    { kind: "action", headline: "Create or open your app", detail: "Apps → Developer Center → Call IQ" },
    { kind: "copy", headline: "Copy API token", detail: "Copy the Bearer token shown" },
    { kind: "paste", headline: "Paste in Call IQ", detail: "Paste below → Connect" },
  ],
  housecallpro: [
    { kind: "signin", headline: "Sign in to Housecall Pro", detail: "Use the button above ↑" },
    { kind: "navigate", headline: "Open API settings", path: "My Apps → Integrations → API" },
    { kind: "copy", headline: "Copy API key + Company ID", detail: "Generate Key if you don't have one yet" },
    { kind: "paste", headline: "Paste both in Call IQ", detail: "Key + company number below" },
  ],
  buildium: [
    { kind: "signin", headline: "Sign in to Buildium", detail: "Click the blue button above ↑" },
    { kind: "navigate", headline: "Enable the API", path: "Settings → Application Settings → API → On" },
    { kind: "navigate", headline: "Create API key", path: "Settings → Developer Tools → Create API Key" },
    { kind: "copy", headline: "Copy Client ID + Secret now", detail: "Secret is only shown once" },
    { kind: "paste", headline: "Paste both in Call IQ", detail: "Client ID + secret below → Connect" },
  ],
  appfolio: [
    { kind: "action", headline: "Request API access", detail: "Ask your AppFolio account manager first" },
    { kind: "copy", headline: "Copy login name + credentials", detail: "Company name, Client ID, Client Secret" },
    { kind: "paste", headline: "Paste all three in Call IQ", detail: "Fill each box below → Connect" },
  ],
  yardi: [
    { kind: "action", headline: "Get credentials from Yardi", detail: "Your rep must enable API access first" },
    { kind: "signin", headline: "Optional: Client Central", detail: "For docs — clientcentral.yardi.com" },
    { kind: "paste", headline: "Paste what Yardi sent you", detail: "API URL + Client ID + Secret below" },
  ],
  zapier: [
    { kind: "signin", headline: "Open Zapier", detail: "Create a new Zap" },
    { kind: "action", headline: "Add Webhooks trigger", detail: "Choose Webhooks by Zapier → Catch Hook" },
    { kind: "copy", headline: "Copy the webhook URL", detail: "Zapier shows a unique https://hooks.zapier.com/... link" },
    { kind: "paste", headline: "Paste URL in Call IQ", detail: "Paste below → Connect" },
  ],
};

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Wrap long text into tspans for SVG. */
function textLines(x, y, lines, { size = 15, weight = 600, fill = "#0f172a", anchor = "middle" } = {}) {
  const lh = size + 6;
  return lines
    .map(
      (line, i) =>
        `<text x="${x}" y="${y + i * lh}" text-anchor="${anchor}" font-family="system-ui,-apple-system,Segoe UI,sans-serif" font-size="${size}" font-weight="${weight}" fill="${fill}">${escapeXml(line)}</text>`
    )
    .join("\n");
}

function wrapText(text, maxChars) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = "";
  for (const w of words) {
    const next = line ? `${line} ${w}` : w;
    if (next.length > maxChars && line) {
      lines.push(line);
      line = w;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

function stepBadge(stepNum, total) {
  return `
  <rect x="32" y="32" width="88" height="28" rx="14" fill="#0ea5e9"/>
  <text x="76" y="51" text-anchor="middle" font-family="system-ui,sans-serif" font-size="12" font-weight="700" fill="#ffffff">STEP ${stepNum}/${total}</text>`;
}

function appHeader(appName) {
  return `
  <rect x="24" y="72" width="592" height="40" fill="#ffffff" stroke="#e2e8f0" rx="8"/>
  <text x="320" y="98" text-anchor="middle" font-family="system-ui,sans-serif" font-size="13" font-weight="600" fill="#64748b">${escapeXml(appName)} setup</text>`;
}

function footerBar(caption) {
  const lines = wrapText(caption, 52);
  const y = lines.length > 1 ? 318 : 326;
  return `
  <rect x="24" y="300" width="592" height="48" fill="#0f172a" rx="8"/>
  ${textLines(320, y, lines, { size: 13, weight: 500, fill: "#f8fafc" })}`;
}

function panelSignIn(step, appName, stepNum, total) {
  const detail = step.detail ?? "Use the button above in Call IQ";
  return `
  ${stepBadge(stepNum, total)}
  ${appHeader(appName)}
  <rect x="48" y="128" width="544" height="152" fill="#ffffff" stroke="#e2e8f0" rx="12"/>
  <circle cx="320" cy="168" r="28" fill="#e0f2fe" stroke="#0ea5e9" stroke-width="2"/>
  <text x="320" y="176" text-anchor="middle" font-size="28">🔐</text>
  ${textLines(320, 218, wrapText(step.headline, 40), { size: 18, weight: 700 })}
  <rect x="120" y="238" width="400" height="32" rx="8" fill="#eff6ff" stroke="#3b82f6" stroke-width="1.5"/>
  ${textLines(320, 258, wrapText(detail, 44), { size: 12, weight: 600, fill: "#1d4ed8" })}
  ${footerBar(step.headline)}`;
}

function panelNavigate(step, appName, stepNum, total) {
  const path = step.path ?? step.detail ?? "";
  const pathLines = path.split("→").map((p) => p.trim());
  const breadcrumb =
    pathLines.length > 1
      ? pathLines.join("  →  ")
      : path;
  return `
  ${stepBadge(stepNum, total)}
  ${appHeader(appName)}
  <rect x="48" y="128" width="160" height="152" fill="#f8fafc" stroke="#e2e8f0" rx="10"/>
  <rect x="64" y="148" width="128" height="14" fill="#e2e8f0" rx="3"/>
  <rect x="64" y="170" width="100" height="14" fill="#e2e8f0" rx="3"/>
  <rect x="64" y="192" width="128" height="22" fill="#dbeafe" stroke="#2563eb" stroke-width="2" rx="4"/>
  <text x="128" y="207" text-anchor="middle" font-size="10" font-weight="700" fill="#1d4ed8">CLICK HERE</text>
  <rect x="64" y="222" width="90" height="14" fill="#e2e8f0" rx="3"/>
  <rect x="64" y="244" width="110" height="14" fill="#e2e8f0" rx="3"/>
  <path d="M 220 204 L 260 204 L 260 220 L 285 188 L 260 156 L 260 172 L 220 172 Z" fill="#0ea5e9"/>
  <rect x="300" y="128" width="292" height="152" fill="#ffffff" stroke="#e2e8f0" rx="10"/>
  ${textLines(446, 158, wrapText(step.headline, 28), { size: 16, weight: 700 })}
  <rect x="320" y="178" width="252" height="72" rx="8" fill="#f0fdf4" stroke="#22c55e" stroke-width="2"/>
  ${textLines(446, 202, wrapText(breadcrumb, 22), { size: 13, weight: 700, fill: "#15803d" })}
  ${footerBar(path || step.headline)}`;
}

function panelCopy(step, appName, stepNum, total) {
  const detail = step.detail ?? "Copy exactly — do not add spaces";
  return `
  ${stepBadge(stepNum, total)}
  ${appHeader(appName)}
  <rect x="48" y="128" width="544" height="152" fill="#ffffff" stroke="#e2e8f0" rx="12"/>
  ${textLines(320, 158, wrapText(step.headline, 42), { size: 17, weight: 700 })}
  <rect x="80" y="178" width="480" height="44" rx="8" fill="#fef3c7" stroke="#f59e0b" stroke-width="2"/>
  <text x="100" y="206" font-family="ui-monospace,monospace" font-size="14" fill="#92400e">sk_live_••••••••••••••••</text>
  <rect x="460" y="186" width="88" height="28" rx="6" fill="#f59e0b"/>
  <text x="504" y="205" text-anchor="middle" font-size="12" font-weight="700" fill="#ffffff">COPY</text>
  <path d="M 320 230 L 320 248" stroke="#0ea5e9" stroke-width="2" marker-end="url(#arrow)"/>
  ${textLines(320, 268, wrapText(detail, 50), { size: 12, weight: 500, fill: "#64748b" })}
  ${footerBar(step.headline)}`;
}

function panelPaste(step, appName, stepNum, total) {
  const detail = step.detail ?? "Then click Connect";
  return `
  ${stepBadge(stepNum, total)}
  ${appHeader(appName)}
  <rect x="48" y="128" width="220" height="152" fill="#f8fafc" stroke="#e2e8f0" rx="10"/>
  <text x="158" y="168" text-anchor="middle" font-size="11" font-weight="600" fill="#64748b">${escapeXml(appName)}</text>
  <rect x="72" y="182" width="172" height="28" rx="6" fill="#e2e8f0"/>
  <text x="158" y="230" text-anchor="middle" font-size="10" fill="#94a3b8">copied code</text>
  <path d="M 280 204 L 318 204 L 318 220 L 343 188 L 318 156 L 318 172 L 280 172 Z" fill="#0ea5e9"/>
  <rect x="360" y="128" width="232" height="152" fill="#ffffff" stroke="#0ea5e9" stroke-width="2" rx="10"/>
  <text x="476" y="156" text-anchor="middle" font-size="11" font-weight="700" fill="#0369a1">CALL IQ</text>
  ${textLines(476, 182, wrapText(step.headline, 24), { size: 14, weight: 700 })}
  <rect x="384" y="198" width="184" height="36" rx="6" fill="#eff6ff" stroke="#3b82f6" stroke-width="2"/>
  <text x="476" y="221" text-anchor="middle" font-size="11" fill="#3b82f6">Paste here ↓</text>
  ${textLines(476, 262, wrapText(detail, 28), { size: 11, weight: 500, fill: "#64748b" })}
  ${footerBar(step.headline)}`;
}

function panelAction(step, appName, stepNum, total) {
  const detail = step.detail ?? "";
  return `
  ${stepBadge(stepNum, total)}
  ${appHeader(appName)}
  <rect x="48" y="128" width="544" height="152" fill="#ffffff" stroke="#e2e8f0" rx="12"/>
  ${textLines(320, 162, wrapText(step.headline, 44), { size: 17, weight: 700 })}
  <rect x="170" y="188" width="300" height="44" rx="10" fill="#0ea5e9"/>
  <text x="320" y="216" text-anchor="middle" font-size="14" font-weight="700" fill="#ffffff">Click this button</text>
  ${detail ? textLines(320, 252, wrapText(detail, 48), { size: 12, weight: 500, fill: "#64748b" }) : ""}
  ${footerBar(detail || step.headline)}`;
}

function makeSvg(appName, step, stepNum, total) {
  const aria = escapeXml(`${step.headline}. ${step.path ?? step.detail ?? ""}`);
  let body;
  switch (step.kind) {
    case "signin":
      body = panelSignIn(step, appName, stepNum, total);
      break;
    case "navigate":
      body = panelNavigate(step, appName, stepNum, total);
      break;
    case "copy":
      body = panelCopy(step, appName, stepNum, total);
      break;
    case "paste":
      body = panelPaste(step, appName, stepNum, total);
      break;
    default:
      body = panelAction(step, appName, stepNum, total);
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360" viewBox="0 0 640 360" role="img" aria-label="${aria}">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#f1f5f9"/>
      <stop offset="100%" stop-color="#e2e8f0"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#bg)" rx="12"/>
  ${body}
</svg>`;
}

let count = 0;
for (const [id, steps] of Object.entries(GUIDED_APPS)) {
  const dir = join(OUT, id);
  mkdirSync(dir, { recursive: true });
  const appLabel = APP_NAMES[id] ?? id.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  steps.forEach((step, i) => {
    const name = `step-${String(i + 1).padStart(2, "0")}.svg`;
    writeFileSync(join(dir, name), makeSvg(appLabel, step, i + 1, steps.length), "utf8");
    count++;
  });
}

console.log(`Generated ${count} wireframes in ${OUT}`);
