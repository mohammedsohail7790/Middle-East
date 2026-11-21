/**
 * Whether sync-halla-marketing.mjs may overwrite apps/dashboard/public/marketing-body.html (and the other published files) from the root halla files.
 * The published files are now edited directly in pull requests, so an overwrite from older root files would erase that work.
 * It therefore happens only on purpose: with the --force flag, or with HALLA_SYNC_OVERWRITE=1 in the environment.
 */
export function overwriteAllowed(argv = process.argv, env = process.env) {
  return argv.includes("--force") || env.HALLA_SYNC_OVERWRITE === "1";
}

export const OVERWRITE_WARNING =
  "[sync-halla-marketing] Root halla files are present, but nothing was overwritten.\n" +
  "apps/dashboard/public/marketing-body.html is now edited directly in pull requests, so copying older root files over it would erase that work.\n" +
  "Using the committed files. To overwrite on purpose, run: node scripts/sync-halla-marketing.mjs --force (or set HALLA_SYNC_OVERWRITE=1).";
