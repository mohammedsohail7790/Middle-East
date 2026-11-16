import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(__dirname, "../app/globals.css"), "utf8");

function block(selector: string): string {
  const start = css.indexOf(`\n${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  return css.slice(start, css.indexOf("\n}", start));
}
function vars(b: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of b.matchAll(/(--[\w-]+):\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}
const light = vars(block(":root"));
const dark = { ...light, ...vars(block(".dark")) };

function resolve(v: Record<string, string>, name: string): string {
  let val = v[name];
  for (let i = 0; i < 6 && val && val.startsWith("var("); i++) {
    val = v[val.slice(4, -1).split(",")[0].trim()];
  }
  return val;
}
function lum(hex: string): number {
  const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((x) =>
    x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4,
  );
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}
function contrast(a: string, b: string): number {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

describe("marketing palette tokens", () => {
  it("light mode uses the marketing values", () => {
    expect(resolve(light, "--background").toUpperCase()).toBe("#FAF9F6");
    expect(resolve(light, "--foreground").toUpperCase()).toBe("#121417");
    expect(resolve(light, "--gold").toUpperCase()).toBe("#C5A059");
    expect(resolve(light, "--gold-text").toUpperCase()).toBe("#7A5A1E");
  });

  const pairs: Array<[string, string]> = [
    ["--foreground", "--background"],
    ["--gold-text", "--background"],
    ["--foreground", "--card"],
    ["--muted-foreground", "--background"],
  ];
  for (const [mode, vs] of [["light", light], ["dark", dark]] as const) {
    for (const [fg, bg] of pairs) {
      it(`${mode}: ${fg} on ${bg} is at least 4.5:1`, () => {
        expect(contrast(resolve(vs, fg), resolve(vs, bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
    it(`${mode}: ink on gold fill is at least 4.5:1`, () => {
      expect(contrast("#121417", resolve(vs, "--gold"))).toBeGreaterThanOrEqual(4.5);
    });
  }
});
