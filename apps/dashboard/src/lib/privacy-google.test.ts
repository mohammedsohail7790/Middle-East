import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(join(__dirname, "../../public/marketing-body.html"), "utf8");
const privacy = html.slice(html.indexOf('id="page-privacy"'), html.indexOf('id="page-terms"'));

describe("privacy page, Google user data section", () => {
  it("states the Limited Use commitment in English and Arabic, with the policy link", () => {
    expect(privacy).toContain("Google user data");
    expect(privacy).toContain("Limited Use");
    expect(privacy).toContain("https://developers.google.com/terms/api-services-user-data-policy");
    expect(privacy).toContain("بيانات مستخدمي Google");
    expect(privacy).toContain("الاستخدام المحدود");
  });

  it("keeps the sections numbered in order, 1 to 11", () => {
    const nums = [...privacy.matchAll(/<h2><span class="lang-en">(\d+)\./g)].map((m) => Number(m[1]));
    expect(nums).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});
