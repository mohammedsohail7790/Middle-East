import { describe, expect, it } from "vitest";
import { parseServiceText, rowsToText } from "./service-lines";

const one = (line: string) => parseServiceText(line)[0];

describe("parseServiceText: prices a business owner might type", () => {
  it.each([
    ["Consultation - AED 89", "Consultation", "AED 89"], // the example in the hint
    ["Consultation - AED89", "Consultation", "AED 89"],
    ["Consultation - aed 89", "Consultation", "AED 89"],
    ["Consultation - 89 AED", "Consultation", "AED 89"],
    ["Consultation - 89AED", "Consultation", "AED 89"],
    ["Consultation AED 89", "Consultation", "AED 89"],
    ["Consultation 89 AED", "Consultation", "AED 89"],
    ["Consultation: AED 89", "Consultation", "AED 89"],
    ["Consultation – AED 89", "Consultation", "AED 89"],
    ["Consultation, AED 89", "Consultation", "AED 89"],
    ["Consultation - SAR 120", "Consultation", "SAR 120"],
    ["Consultation - 45 KWD", "Consultation", "KWD 45"],
    ["Consultation - $89", "Consultation", "$89"],
    ["Consultation $89", "Consultation", "$89"],
    ["Consultation - €89", "Consultation", "€89"],
    ["Consultation - 89", "Consultation", "89"],
    ["Consultation - 89.50", "Consultation", "89.50"],
    ["Consultation - AED 1,500", "Consultation", "AED 1500"],
    ["Consultation - AED 1,500.50", "Consultation", "AED 1500.50"],
  ])("%s", (line, name, price) => {
    expect(one(line)).toEqual({ name, price });
  });

  it("understands Arabic currency words and Arabic digits", () => {
    expect(one("استشارة - 89 درهم")).toEqual({ name: "استشارة", price: "AED 89" });
    expect(one("استشارة - د.إ 89")).toEqual({ name: "استشارة", price: "AED 89" });
    expect(one("استشارة - ٨٩ درهم")).toEqual({ name: "استشارة", price: "AED 89" });
    expect(one("استشارة - ١٬٥٠٠ درهم")).toEqual({ name: "استشارة", price: "AED 1500" });
    expect(one("استشارة - ٨٩٫٥٠")).toEqual({ name: "استشارة", price: "89.50" });
    expect(one("استشارة - 120 ر.س")).toEqual({ name: "استشارة", price: "SAR 120" });
  });

  it("keeps an ambiguous Arabic word as typed", () => {
    expect(one("استشارة - 50 ريال")).toEqual({ name: "استشارة", price: "ريال 50" });
  });

  it("keeps digits that belong to the service name", () => {
    expect(one("Laser 2 sessions - AED 300")).toEqual({ name: "Laser 2 sessions", price: "AED 300" });
    expect(one("Plan 2 AED 300")).toEqual({ name: "Plan 2", price: "AED 300" });
  });

  it("leaves a line with no price as just a name", () => {
    expect(one("Consultation")).toEqual({ name: "Consultation", price: "" });
    expect(one("Facial - 30 min")).toEqual({ name: "Facial - 30 min", price: "" });
    expect(one("Botox 50 units")).toEqual({ name: "Botox 50 units", price: "" });
  });

  it("handles several lines and ignores blanks", () => {
    expect(parseServiceText("A - AED 10\n\n  B  \nC 5 AED")).toEqual([
      { name: "A", price: "AED 10" },
      { name: "B", price: "" },
      { name: "C", price: "AED 5" },
    ]);
  });
});

describe("rowsToText", () => {
  it("shows a saved price back exactly as saved, never forcing a dollar sign", () => {
    expect(rowsToText([{ name: "Consultation", price: "AED 89" }])).toBe("Consultation - AED 89");
    expect(rowsToText([{ name: "Consultation", price: "89" }])).toBe("Consultation - 89");
    expect(rowsToText([{ name: "Consultation", price: "$89" }])).toBe("Consultation - $89");
    expect(rowsToText([{ name: "Consultation", price: "" }, { name: "  ", price: "5" }])).toBe("Consultation");
  });

  it("a saved line survives a save and reload unchanged", () => {
    const text = "Consultation - AED 89\nLaser - $120\nFacial - 45\nNo price";
    expect(rowsToText(parseServiceText(text))).toBe(text);
  });
});
