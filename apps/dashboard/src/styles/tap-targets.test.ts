import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const read = (p: string) => readFileSync(join(__dirname, "..", p), "utf8");
const css = read("styles/apple-dashboard.css");

describe("phone tap targets", () => {
  it("has a tap-target helper that widens the touch area on phones only, without moving the layout", () => {
    const m = css.match(/@media \(max-width: 767px\) \{[^@]*?\.tap-target::after \{([^}]*)\}/s);
    expect(m).not.toBeNull();
    expect(m![1]).toMatch(/position:\s*absolute/);
    expect(m![1]).toMatch(/inset:\s*-0\.75rem/);
  });

  const users: Array<[string, string]> = [
    ["components/dashboard/GoLiveChecklist.tsx", "goLiveDismiss"],
    ["components/dashboard/GoLiveChecklist.tsx", "goLiveOpen"],
    ["components/knowledge/KnowledgeBusinessTemplates.tsx", "Copy Monday hours"],
    ["components/integrations/ZapierHubSection.tsx", "setup guide"],
    ["app/[locale]/dashboard/compliance/audit/page.tsx", 't("back")'],
  ];
  for (const [file, marker] of users) {
    it(`${file} (${marker}) uses tap-target`, () => {
      const src = read(file);
      const i = src.indexOf(marker);
      expect(i).toBeGreaterThan(-1);
      // the class sits on the element that contains this text, within the few lines before it
      const before = src.slice(Math.max(0, i - 420), i);
      expect(before).toContain("tap-target");
    });
  }

  it("opening-hours checkboxes are at least 24px on phones", () => {
    const src = read("components/knowledge/KnowledgeBusinessTemplates.tsx");
    expect(src).toMatch(/type="checkbox"[\s\S]*?className="[^"]*max-md:size-6/);
  });

  it("analytics date fields are at least 36px tall on phones", () => {
    const src = read("app/[locale]/dashboard/analytics/page.tsx");
    const dates = src.match(/type="date"[\s\S]*?className="([^"]*)"/g) || [];
    expect(dates.length).toBe(2);
    for (const d of dates) expect(d).toContain("max-md:min-h-9");
  });
});
