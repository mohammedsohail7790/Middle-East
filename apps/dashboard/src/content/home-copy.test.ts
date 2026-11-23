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

  it("each 'At a glance' tile reads category first, then the timeline, then the description (Hk, 22 Nov), Automation and Receptionist first", () => {
    const from = html.indexOf('<div class="hub-stats">');
    const block = html.slice(from, html.indexOf("</div></div>", html.indexOf("Opportunity Audit and roadmap", from)) + 12);
    const text = (h: string) => [...h.matchAll(/<span class="lang-(en|ar)">(.*?)<\/span>/g)].map((m) => m[2]);
    const rows = block;
    const parsed = [...rows.matchAll(/<div class="hub-stat"><em class="hub-stat-cat">(.*?)<\/em><strong>(.*?)<\/strong><span>(.*?)<\/span><\/div>/g)].map((m) => ({
      category: text(m[1]),
      timeline: text(m[2]),
      description: text(m[3]),
    }));
    expect(parsed).toEqual([
      { category: ["Automation", "أتمتة الأعمال"], timeline: ["10 days", "10 أيام"], description: ["To build one automation", "لبناء أتمتة واحدة"] },
      { category: ["Receptionist", "موظف الاستقبال"], timeline: ["15 min", "15 دقيقة"], description: ["To go live", "لبدء التشغيل"] },
      { category: ["Consultancy", "الاستشارات"], timeline: ["3 min", "3 دقائق"], description: ["Fit check to a direct answer", "فحص الملاءمة لإجابة مباشرة"] },
      { category: ["Consultancy", "الاستشارات"], timeline: ["1 week", "أسبوع"], description: ["Opportunity Audit and roadmap", "تدقيق الفرص وخارطة الطريق"] },
    ]);
    expect(block).not.toContain("Consultancy · ");
    expect(block).not.toContain("Automation · ");
    expect(block).not.toContain("Receptionist · ");
  });

  it("the AI Receptionist price in the home pricing table is in AED (Hk, 22 Nov), matching the other rows", () => {
    const row = html.slice(html.indexOf('<span class="lang-en">AI Receptionist</span><span class="lang-ar">موظف الاستقبال الذكي</span></div><div class="cx-pscope">'));
    const price = row.slice(0, row.indexOf("per month"));
    expect(price).toContain("From AED 150");
    expect(price).toContain("من 150 درهماً");
    expect(price).not.toContain("$39");
  });
});
