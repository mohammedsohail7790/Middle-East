import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(join(__dirname, "../../public/marketing-body.html"), "utf8");

describe("home page copy (Hk's review, 17 Nov 2026)", () => {
  it("the hero paragraph starts with the AI receptionist, not 'One partner from diagnosis to a live system'", () => {
    expect(html).not.toContain("One partner from diagnosis");
    expect(html).toContain('<p class="cx-lead"><span class="lang-en">An AI receptionist that answers every call and message, automation that connects your workflows and CRM, and a roadmap that sets the order. Built in 2–6 weeks. Priced up front. Yours to keep.</span>');
  });

  it("the Arabic hero paragraph drops the same lead-in", () => {
    expect(html).not.toContain("شريك واحد من التشخيص");
    expect(html).toContain('<span class="lang-ar">موظف استقبال ذكي يردّ على كل مكالمة ورسالة');
  });

  it("the label reads 'Who is it for', never 'Who it is for'", () => {
    expect(html).not.toMatch(/Who it is for/i);
    expect(html.match(/<span class="lang-en">(07 · )?Who is it for<\/span>/g)?.length).toBe(6);
  });
});
