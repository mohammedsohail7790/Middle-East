import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const load = (l: string) => JSON.parse(readFileSync(join(__dirname, `${l}.json`), "utf8"));
const en = load("en");
const ar = load("ar");

function flat(o: unknown, p = ""): Record<string, string> {
  const out: Record<string, string> = {};
  if (o && typeof o === "object") {
    for (const [k, v] of Object.entries(o as Record<string, unknown>)) {
      const path = p ? `${p}.${k}` : k;
      if (typeof v === "string") out[path] = v;
      else Object.assign(out, flat(v, path));
    }
  }
  return out;
}

const E = flat(en);
const A = flat(ar);
const placeholders = (s: string) => [...s.matchAll(/\{(\w+)(?:,|\})/g)].map((m) => m[1]).sort();

describe("Arabic messages match English", () => {
  it("every English key exists in Arabic (a missing key shows as a raw key on screen)", () => {
    const missing = Object.keys(E).filter((k) => !(k in A));
    expect(missing).toEqual([]);
  });

  it("each Arabic message uses the same {placeholders} as the English one", () => {
    const bad = Object.keys(E)
      .filter((k) => k in A)
      .filter((k) => JSON.stringify(placeholders(E[k])) !== JSON.stringify(placeholders(A[k])))
      .map((k) => `${k}: en ${placeholders(E[k])} vs ar ${placeholders(A[k])}`);
    expect(bad).toEqual([]);
  });
});

describe("Arabic number-of-things messages avoid a counted noun", () => {
  // "3 رقماً" is wrong Arabic (the singular form is for 11 and up); phrase it count-last instead.
  const keys = [
    "pages.phoneNumbers.planNote",
    "pages.phoneNumbers.planNoteMore",
    "pages.phoneNumbers.numbersAvailable",
  ];
  for (const k of keys) {
    it(`${k} does not put a singular noun after the count`, () => {
      const msg = A[k];
      expect(msg, k).toBeTruthy();
      expect(msg).not.toMatch(/رقماً|\}\s*رقم(?=\s|$)/);
    });
  }
});
