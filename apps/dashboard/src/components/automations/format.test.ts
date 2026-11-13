import { describe, expect, it } from "vitest";
import { buildConfig, checkUploadFile, hoursFromMinutes, initialConfigValues, minutesLeft, proposalRows } from "./format";

const f = (name: string, size: number, type: string) => ({ name, size, type });

describe("upload check", () => {
  it("accepts PDF, PNG, JPG and text up to 8 MB", () => {
    expect(checkUploadFile(f("a.pdf", 10, "application/pdf"))).toBeNull();
    expect(checkUploadFile(f("a.png", 10, "image/png"))).toBeNull();
    expect(checkUploadFile(f("a.jpg", 10, "image/jpeg"))).toBeNull();
    expect(checkUploadFile(f("a.txt", 10, "text/plain"))).toBeNull();
    expect(checkUploadFile(f("a.pdf", 8 * 1024 * 1024, "application/pdf"))).toBeNull();
  });
  it("refuses other types, empty and big files", () => {
    expect(checkUploadFile(f("a.exe", 10, "application/x-msdownload"))).toBe("badType");
    expect(checkUploadFile(f("a.gif", 10, "image/gif"))).toBe("badType");
    expect(checkUploadFile(f("a.pdf", 0, "application/pdf"))).toBe("empty");
    expect(checkUploadFile(f("a.pdf", 8 * 1024 * 1024 + 1, "application/pdf"))).toBe("tooBig");
  });
});

describe("proposal rows", () => {
  it("reads like a list, not JSON", () => {
    const rows = proposalRows({ toEmail: "a@b.co", send: true, tags: ["x", "y"], customer: { fullName: "Sara", phone: null } });
    expect(rows).toEqual([
      { label: "To email", value: "a@b.co" },
      { label: "Send", value: "Yes" },
      { label: "Tags", value: "x, y" },
      { label: "Customer: Full name", value: "Sara" },
      { label: "Customer: Phone", value: "-" },
    ]);
  });
});

describe("settings values", () => {
  const fields = [
    { key: "a", label: "A", type: "text" as const, default: "hi" },
    { key: "n", label: "N", type: "number" as const },
    { key: "b", label: "B", type: "boolean" as const, default: true },
  ];
  it("starts from saved values, then defaults", () => {
    expect(initialConfigValues(fields, { a: "saved" })).toEqual({ a: "saved", n: "", b: true });
  });
  it("sends real numbers and leaves empty fields out", () => {
    expect(buildConfig(fields, { a: " x ", n: "5", b: false })).toEqual({ a: "x", n: 5, b: false });
    expect(buildConfig(fields, { a: "", n: "", b: true })).toEqual({ b: true });
  });
  it("counts hours and minutes left", () => {
    expect(hoursFromMinutes(90)).toBe("1.5");
    expect(minutesLeft(new Date(Date.now() + 5 * 60000 + 500).toISOString())).toBe(5);
    expect(minutesLeft(new Date(Date.now() - 1000).toISOString())).toBe(0);
  });
});
