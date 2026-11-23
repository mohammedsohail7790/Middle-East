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
