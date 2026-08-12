/**
 * Import Desktop landing (index.html + hallaai_styles.css), apply production fixes,
 * keep wired hallaai_main.js, and sync into apps/dashboard/public.
 *
 * Usage:
 *   node scripts/import-landing.mjs
 *   LANDING_DIR="C:/path/to/landing" node scripts/import-landing.mjs
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";
import { prepareLandingCss, prepareLandingHtml } from "./landing-production.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(__dirname, "..");
const DASHBOARD = path.join(REPO_ROOT, "apps", "dashboard");

const LANDING_DIR =
  process.env.LANDING_DIR ||
  path.join(process.env.USERPROFILE || process.env.HOME || "", "Desktop", "landing");

const SOURCES = {
  html: path.join(LANDING_DIR, "index.html"),
  // Accept either the old calliq_ names or new hallaai_ names from the designer's export
  css: fs.existsSync(path.join(LANDING_DIR, "hallaai_styles.css"))
    ? path.join(LANDING_DIR, "hallaai_styles.css")
    : path.join(LANDING_DIR, "calliq_styles.css"),
  js: fs.existsSync(path.join(LANDING_DIR, "hallaai_main.js"))
    ? path.join(LANDING_DIR, "hallaai_main.js")
    : path.join(LANDING_DIR, "calliq_main.js"),
};

const ROOT = {
  html: path.join(REPO_ROOT, "index.html"),
  css: path.join(REPO_ROOT, "hallaai_styles.css"),
  js: path.join(REPO_ROOT, "hallaai_main.js"),
};

const PRODUCTION_JS = path.join(DASHBOARD, "public", "hallaai_main.js");

function requireFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    console.error(`[import-landing] Missing ${label}: ${filePath}`);
    process.exit(1);
  }
}

function resolveJs() {
  if (fs.existsSync(SOURCES.js)) {
    const body = fs.readFileSync(SOURCES.js, "utf8").trim();
    if (body.length > 200 && body.includes("function go")) {
      console.log("[import-landing] Using landing hallaai_main.js");
      return body;
    }
  }
  if (!fs.existsSync(PRODUCTION_JS)) {
    console.error("[import-landing] No production hallaai_main.js at", PRODUCTION_JS);
    process.exit(1);
  }
  console.log("[import-landing] landing hallaai_main.js empty — using production router");
  return fs.readFileSync(PRODUCTION_JS, "utf8");
}

function main() {
  requireFile(SOURCES.html, "index.html");
  requireFile(SOURCES.css, "hallaai_styles.css (or calliq_styles.css)");

  const html = prepareLandingHtml(fs.readFileSync(SOURCES.html, "utf8"));
  const css = prepareLandingCss(fs.readFileSync(SOURCES.css, "utf8"));
  const js = resolveJs();

  fs.writeFileSync(ROOT.html, html, "utf8");
  fs.writeFileSync(ROOT.css, css, "utf8");
  fs.writeFileSync(ROOT.js, js, "utf8");

  console.log("[import-landing] Wrote repo root landing files from", LANDING_DIR);

  const sync = spawnSync(process.execPath, [path.join(__dirname, "sync-marketing.mjs")], {
    stdio: "inherit",
    cwd: REPO_ROOT,
  });
  if (sync.status !== 0) process.exit(sync.status ?? 1);

  const check = spawnSync(process.execPath, ["--check", path.join(DASHBOARD, "public", "hallaai_main.js")], {
    stdio: "inherit",
  });
  if (check.status !== 0) process.exit(check.status ?? 1);

  console.log("[import-landing] Production landing ready in apps/dashboard/public/");
}

main();
