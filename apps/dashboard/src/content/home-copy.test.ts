import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const html = readFileSync(join(__dirname, "../../public/marketing-body.html"), "utf8");

describe("home page copy (Hk's review, 17 Nov 2026)", () => {
  it("the hero paragraph starts with the AI receptionist, not 'One partner from diagnosis to a live system'", () => {
    expect(html).not.toContain("One partner from diagnosis");
    expect(html).toContain('<p class="cx-lead"><span class="lang-en">An AI receptionist that answers every call and message, automation that connects your workflows and CRM, and a roadmap that sets the order. Priced up front. Yours to keep.</span>');
    expect(html).not.toContain('a roadmap that sets the order. Built in 2–6 weeks');
  });

  it("the Arabic hero paragraph drops the same lead-in", () => {
    expect(html).not.toContain("شريك واحد من التشخيص");
    expect(html).toContain('<span class="lang-ar">موظف استقبال ذكي يردّ على كل مكالمة ورسالة');
  });

  it("the label reads 'Who is it for', never 'Who it is for'", () => {
    expect(html).not.toMatch(/Who it is for/i);
    expect(html.match(/<span class="lang-en">(07 · )?Who is it for<\/span>/g)?.length).toBe(6);
  });

  it("the section label says 'three ways to start'", () => {
    expect(html).not.toContain("One partner · three ways in");
    expect(html).toContain('<span class="lang-en">One partner · three ways to start</span>');
  });

  it("the 'At a glance' heading reads 'Start in minutes. Know the cost upfront.' in both languages", () => {
    expect(html).not.toContain("Fast to start. Fixed once you do.");
    expect(html).toContain('<span class="lang-en">Start in minutes. Know the cost upfront.</span><span class="lang-ar">ابدأ خلال دقائق. وتعرف التكلفة مسبقاً.</span>');
  });

  it("each 'At a glance' tile names its service without the word AI (Hk, 18 Nov), so the 10-day automation is not read as part of the consultancy", () => {
    const block = html.slice(html.indexOf('<div class="hub-stats">'), html.indexOf('</div></div>', html.indexOf('To put the AI Receptionist') > 0 ? html.indexOf('To put the AI Receptionist') : html.indexOf('to go live')));
    expect(block).toContain("Consultancy · fit check to a direct answer");
    expect(block).toContain("Consultancy · Opportunity Audit and roadmap");
    expect(block).toContain("Automation · to build one automation");
    expect(block).toContain("Receptionist · to go live");
    expect(block).toContain("الاستشارات · فحص الملاءمة لإجابة مباشرة");
    expect(block).toContain("أتمتة الأعمال · لبناء أتمتة واحدة");
    expect(block).toContain("موظف الاستقبال · لبدء التشغيل");
  });
});
