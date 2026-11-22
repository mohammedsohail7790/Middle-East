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

describe("marketing fonts", () => {
  it(".font-display uses Cormorant Garamond", () => {
    expect(css).toMatch(/\.font-display\s*{[^}]*--font-cormorant/);
  });
  it("Arabic maps .font-display to Cairo", () => {
    expect(css).toMatch(/\[lang="ar"\]\s+\.font-display\s*{[^}]*--font-cairo/);
  });
  it("body sans stack leads with Plus Jakarta Sans", () => {
    const body = css.slice(css.indexOf("The fonts are bundled packages"));
    expect(body).toMatch(/--font-sans:\s*var\(--font-jakarta/);
  });
});

describe("review fixes", () => {
  for (const [mode, vs] of [["light", light], ["dark", dark]] as const) {
    it(`${mode}: focus ring is at least 3:1 on background and card`, () => {
      expect(contrast(resolve(vs, "--ring"), resolve(vs, "--background"))).toBeGreaterThanOrEqual(3);
      expect(contrast(resolve(vs, "--ring"), resolve(vs, "--card"))).toBeGreaterThanOrEqual(3);
    });
    it(`${mode}: text on the accent fill (--on-accent) is at least 4.5:1`, () => {
      expect(contrast(resolve(vs, "--on-accent"), resolve(vs, "--accent"))).toBeGreaterThanOrEqual(4.5);
    });
    it(`${mode}: primary foreground on primary is at least 4.5:1`, () => {
      expect(contrast(resolve(vs, "--primary-foreground"), resolve(vs, "--primary"))).toBeGreaterThanOrEqual(4.5);
    });
  }

  const brand = readFileSync(join(__dirname, "../styles/consultancy-brand.css"), "utf8");
  function brandVars(selector: string): Record<string, string> {
    const start = brand.indexOf(`${selector} {`);
    if (start < 0) throw new Error(`no ${selector}`);
    return vars(brand.slice(start, brand.indexOf("\n}", start)));
  }
  const brandLight = brandVars('[data-dashboard-brand="consultancy"]');
  const brandDark = brandVars('.dark [data-dashboard-brand="consultancy"]');
  const rootAliases = Object.entries(vars(block(":root"))).filter(([, v]) => v.includes("var(")).map(([k]) => k);
  const darkAliases = Object.entries(vars(block(".dark"))).filter(([, v]) => v.includes("var(")).map(([k]) => k);

  it("consultancy block redeclares every alias that resolves through var() in :root", () => {
    const skip = new Set(["--font-display"]);
    expect(rootAliases.filter((k) => !skip.has(k) && !(k in brandLight))).toEqual([]);
  });
  it("consultancy dark block redeclares every alias that resolves through var() in .dark", () => {
    expect(darkAliases.filter((k) => !(k in brandDark))).toEqual([]);
  });
  it("consultancy keeps the blue ring and primary", () => {
    expect(resolve({ ...light, ...brandLight }, "--primary").toUpperCase()).toBe("#0066CC");
    expect(resolve({ ...light, ...brandLight }, "--ring").toUpperCase()).toBe("#0066CC");
  });

  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "");
  it("no hard-coded action blue is left in the shared dashboard css", () => {
    const apple = strip(readFileSync(join(__dirname, "../styles/apple-dashboard.css"), "utf8"));
    for (const src of [strip(css), apple]) {
      expect(src).not.toMatch(/rgba\(0,\s*102,\s*204/);
      expect(src).not.toMatch(/#0066CC/i);
    }
  });
});

describe("fonts are self-hosted (CI must not depend on Google Fonts)", () => {
  const layout = readFileSync(join(__dirname, "../app/[locale]/layout.tsx"), "utf8");
  it("layout does not load Cormorant, Plus Jakarta or Cairo from next/font/google", () => {
    expect(layout).not.toMatch(/Cormorant_Garamond|Plus_Jakarta_Sans|\bCairo\b/);
  });
  it("layout imports the self-hosted font packages", () => {
    for (const pkg of ["plus-jakarta-sans", "cairo", "cormorant-garamond"]) {
      expect(layout).toContain(`@fontsource-variable/${pkg}`);
    }
  });
  it("globals defines the font variables from the self-hosted families", () => {
    expect(css).toMatch(/--font-cormorant:\s*"Cormorant Garamond Variable"/);
    expect(css).toMatch(/--font-jakarta:\s*"Plus Jakarta Sans Variable"/);
    expect(css).toMatch(/--font-cairo:\s*"Cairo Variable"/);
  });
});

describe("no font is fetched from Google at build time", () => {
  const { readdirSync, statSync } = require("node:fs") as typeof import("node:fs");
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      if (statSync(p).isDirectory()) return walk(p);
      return /\.(tsx?|jsx?)$/.test(p) && !/\.test\.tsx?$/.test(p) ? [p] : [];
    });
  const layout = readFileSync(join(__dirname, "../app/[locale]/layout.tsx"), "utf8");

  it("no source file imports next/font/google (it fails the Docker and CI build when Google cannot be reached)", () => {
    const offenders = walk(join(__dirname, "..")).filter((f) => /next\/font\/google/.test(readFileSync(f, "utf8")));
    expect(offenders).toEqual([]);
  });

  it("the layout imports Inter and IBM Plex Sans Arabic from bundled packages", () => {
    expect(layout).toContain("@fontsource-variable/inter");
    for (const w of ["400", "500", "600", "700"]) expect(layout).toContain(`@fontsource/ibm-plex-sans-arabic/${w}.css`);
  });

  it("globals defines --font-inter and --font-arabic from those families", () => {
    expect(css).toMatch(/--font-inter:\s*"Inter Variable"/);
    expect(css).toMatch(/--font-arabic:\s*"IBM Plex Sans Arabic"/);
  });
});
