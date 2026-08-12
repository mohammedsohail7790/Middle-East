#!/usr/bin/env node
/**
 * Updates Supabase Auth Site URL + redirect allow list (fixes localhost confirmation emails).
 *
 * Prerequisites:
 *   1. Personal access token: https://supabase.com/dashboard/account/tokens
 *   2. Project ref from dashboard URL (e.g. abcdefghijklmnop)
 *
 * Usage (PowerShell):
 *   $env:SUPABASE_ACCESS_TOKEN="sbp_..."
 *   $env:SUPABASE_PROJECT_REF="your-ref"
 *   node scripts/fix-supabase-auth-urls.mjs
 */

const token = process.env.SUPABASE_ACCESS_TOKEN?.trim();
const ref = process.env.SUPABASE_PROJECT_REF?.trim();

const SITE_URL = "https://www.hallaai.com";
const REDIRECT_URLS = [
  "https://www.hallaai.com/auth/callback",
  "https://hallaai.com/auth/callback",
  "https://app.hallaai.com/auth/callback",
  "http://localhost:3000/auth/callback",
].join(",");

if (!token || !ref) {
  console.error(
    "Set SUPABASE_ACCESS_TOKEN and SUPABASE_PROJECT_REF, then run again.\n" +
      "Or fix manually: Supabase Dashboard → Authentication → URL Configuration\n" +
      `  Site URL: ${SITE_URL}\n` +
      `  Redirect URLs: ${REDIRECT_URLS.replace(/,/g, "\n    ")}`
  );
  process.exit(1);
}

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: "PATCH",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    site_url: SITE_URL,
    uri_allow_list: REDIRECT_URLS,
  }),
});

if (!res.ok) {
  const text = await res.text();
  console.error(`Supabase API ${res.status}: ${text}`);
  process.exit(1);
}

const json = await res.json();
console.log("Updated Supabase Auth config:");
console.log("  site_url:", json.site_url ?? SITE_URL);
console.log("  uri_allow_list:", json.uri_allow_list ?? REDIRECT_URLS);
console.log("\nResend confirmation emails from Authentication → Users for existing signups.");
