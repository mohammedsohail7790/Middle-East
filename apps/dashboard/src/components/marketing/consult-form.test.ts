import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Consultancy "Book a Diagnostic Call" form is plain browser JavaScript in public/halla_main.js. This loads the real form markup and the real
 * initConsultForm() into jsdom and checks what a visitor sees: only name and email are required, and the priority dropdown is not blanked after sending.
 */
const pub = path.resolve(__dirname, "../../../public");
const html = readFileSync(path.join(pub, "marketing-body.html"), "utf8");
const js = readFileSync(path.join(pub, "halla_main.js"), "utf8");

function formMarkup(): string {
  const start = html.indexOf('<div id="page-consult-signup"');
  const end = html.indexOf("<!-- ====== SECURITY", start);
  return html.slice(start, end);
}

function loadInit(): () => void {
  const start = js.indexOf("function initConsultForm()");
  let depth = 0;
  let i = js.indexOf("{", start);
  const from = start;
  for (; i < js.length; i++) {
    if (js[i] === "{") depth++;
    if (js[i] === "}" && --depth === 0) break;
  }
  const src = js.slice(from, i + 1);
  return new Function(`${src}\nreturn initConsultForm;`)() as () => void;
}

const fire = (el: Element) => el.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
const fields = () => {
  const root = document.getElementById("page-consult-signup")!;
  const inputs = root.querySelectorAll("input");
  return { name: inputs[0] as HTMLInputElement, email: inputs[1] as HTMLInputElement, phone: inputs[2] as HTMLInputElement, business: inputs[3] as HTMLInputElement, select: root.querySelector("select") as HTMLSelectElement, button: document.getElementById("consultSignupBtn")! };
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  document.body.innerHTML = formMarkup();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetchMock);
  loadInit()();
});

describe("Consultancy booking form", () => {
  it("sends the request with only a name and an email: phone and business are optional", async () => {
    const f = fields();
    f.name.value = "Jordan Smith";
    f.email.value = "jordan@example.com";
    fire(f.button);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ name: "Jordan Smith", email: "jordan@example.com", phone: "", business: "" });
  });

  it("still stops, and marks the field, when the name or the email is missing or the email is malformed", () => {
    const f = fields();
    f.email.value = "jordan@example.com";
    fire(f.button);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(f.name.style.borderColor).toBe("var(--red)");
    expect(f.phone.style.borderColor).toBe(""); // an optional field is never flagged

    f.name.value = "Jordan";
    f.email.value = "not-an-email";
    fire(f.button);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(f.email.style.borderColor).toBe("var(--red)");
    expect(f.name.style.borderColor).toBe(""); // a field that is now fine loses its red border
  });

  it("clears the text fields after sending but leaves the priority dropdown on a real choice", async () => {
    const f = fields();
    f.select.selectedIndex = Math.min(2, f.select.options.length - 1);
    f.name.value = "Jordan";
    f.email.value = "jordan@example.com";
    fire(f.button);
    await vi.waitFor(() => expect(f.name.value).toBe(""));
    expect(f.select.selectedIndex).toBe(0);
    expect(f.select.value).not.toBe("");
  });

  it("marks phone and business as optional on the page, in English and Arabic", () => {
    const labels = [...document.querySelectorAll("#page-consult-signup label")].map((l) => l.textContent ?? "");
    expect(labels.find((t) => t.includes("Business Phone"))).toContain("(optional)");
    expect(labels.find((t) => t.includes("Business Name"))).toContain("(optional)");
    expect(labels.find((t) => t.includes("هاتف العمل"))).toContain("(اختياري)");
    expect(labels.find((t) => t.includes("اسم العمل"))).toContain("(اختياري)");
  });
});
