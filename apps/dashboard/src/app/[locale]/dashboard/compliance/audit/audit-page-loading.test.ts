import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const src = readFileSync(join(__dirname, "page.tsx"), "utf8");

describe("audit history page loading", () => {
  it("shows the full-page skeleton only on the first load", () => {
    // A search that returns no rows must not unmount the filter form.
    expect(src).toContain("loading={loading && !hasLoaded && !error}");
    expect(src).not.toContain("rows.length === 0 && !error}");
  });

  it("marks the first load as finished even when it fails", () => {
    expect(src).toMatch(/finally \{\s*setLoading\(false\);\s*setHasLoaded\(true\);/);
  });
});

describe("audit history page reloads", () => {
  it("Apply and Clear always reload the list, even when the filters did not change", () => {
    // Setting the same filters again does not re-run the load by itself, so new events never showed up.
    expect(src).toMatch(/const apply = \(\) => \{[^}]*setReloadKey\(/);
    expect(src).toMatch(/const reset = \(\) => \{[^}]*setReloadKey\(/);
    expect(src).toMatch(/\[load, reloadKey\]/);
  });
});
