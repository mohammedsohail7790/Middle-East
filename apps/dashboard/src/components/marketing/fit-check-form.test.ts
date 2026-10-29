import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { BUDGET_ANSWERS, COMPANY_SIZES, COUNTRIES, DECIDER_ANSWERS, HOURS_ANSWERS, OFFICE_SIZES, START_ANSWERS } from "../../../../gateway/src/services/leads/fit-check";

/**
 * Form 1 (the fit check) is plain browser JavaScript in public/halla_main.js. This loads the real form markup and the real initFitCheckForm() into jsdom, and checks the
 * answers it sends match what the gateway accepts.
 */
const pub = path.resolve(__dirname, "../../../public");
const html = readFileSync(path.join(pub, "marketing-body.html"), "utf8");
const js = readFileSync(path.join(pub, "halla_main.js"), "utf8");

function pageMarkup(): string {
  const start = html.indexOf('<div id="page-fit-check"');
  const end = html.indexOf("<!-- ====== SECURITY", start);
  return html.slice(start, end);
}

function loadInit(): () => void {
  const start = js.indexOf("function initFitCheckForm()");
  let depth = 0;
  let i = js.indexOf("{", start);
  for (; i < js.length; i++) {
    if (js[i] === "{") depth++;
    if (js[i] === "}" && --depth === 0) break;
  }
  return new Function(`${js.slice(start, i + 1)}\nreturn initFitCheckForm;`)() as () => void;
}

const form = () => document.getElementById("fitCheckForm") as HTMLFormElement;
const el = (name: string) => form().querySelector(`[name="${name}"]`) as HTMLInputElement & HTMLSelectElement & HTMLTextAreaElement;
const set = (name: string, value: string) => { el(name).value = value; };
const tick = (name: string, text: string) => {
  const box = Array.from(form().querySelectorAll(`input[name="${name}"]`)).find((c) => (c as HTMLInputElement).value === text) as HTMLInputElement;
  box.checked = true;
  box.dispatchEvent(new Event("change", { bubbles: true }));
  return box;
};
const status = () => form().querySelector(".fit-form-status")!.textContent;
const send = () => document.getElementById("fitCheckBtn")!.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));

function fillRequired() {
  set("name", "Jordan Smith"); set("email", "jordan@example.com"); set("role", "owner"); set("decider", "yes"); set("company", "Smith & Co");
  set("size", "16-50"); set("industry", "Trading or wholesale"); set("country", "United Arab Emirates"); set("accounting", "QuickBooks"); set("erp", "Odoo");
  tick("pain", "Quotes and invoices"); set("problem", "Invoices are typed by hand from emails."); set("start", "1-3-months");
  el("consent").checked = true;
}

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  Element.prototype.scrollIntoView = vi.fn(); // jsdom has no scrolling; real browsers do
  document.body.innerHTML = pageMarkup();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetchMock);
  loadInit()();
});

describe("Fit check form", () => {
  it("offers exactly the answers the gateway accepts for size, decision, hours, timing and budget", () => {
    const values = (name: string) => Array.from((el(name) as HTMLSelectElement).options).map((o) => o.value).filter(Boolean);
    expect(values("size")).toEqual([...COMPANY_SIZES]);
    expect(values("office")).toEqual([...OFFICE_SIZES]);
    expect(values("country")).toEqual([...COUNTRIES]);
    expect(values("decider")).toEqual([...DECIDER_ANSWERS]);
    expect(values("hours")).toEqual([...HOURS_ANSWERS]);
    expect(values("start")).toEqual([...START_ANSWERS]);
    expect(values("budget")).toEqual([...BUDGET_ANSWERS]);
  });

  it("sends only what was filled in, to the fit-check endpoint, when the required answers are given", async () => {
    fillRequired();
    send();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(fetchMock.mock.calls[0][0]).toBe("https://gateway.hallaai.com/api/v1/public/fit-check");
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ name: "Jordan Smith", email: "jordan@example.com", size: "16-50", pain: "Quotes and invoices", start: "1-3-months", consent: true });
    expect(body).not.toHaveProperty("phone");
    expect(body).not.toHaveProperty("budget");
  });

  it("stops, highlights what is missing and says so, when a required answer or the consent is missing", () => {
    fillRequired();
    set("company", "");
    el("consent").checked = false;
    send();
    expect(fetchMock).not.toHaveBeenCalled();
    expect((form().querySelector('[data-q="company"]') as HTMLElement).style.outline).toContain("var(--red)");
    expect((form().querySelector('[data-q="phone"]') as HTMLElement).style.outline).toBe(""); // an optional question is never flagged
    expect(status()).toBe("Please complete the highlighted questions.");
  });

  it("rejects a malformed email and asks for the consent box on its own", () => {
    fillRequired();
    set("email", "not-an-email");
    send();
    expect(fetchMock).not.toHaveBeenCalled();
    fillRequired();
    el("consent").checked = false;
    send();
    expect(status()).toBe("Please tick the box to agree, so we can reply to you.");
  });

  it("lets the visitor tick every area that applies, and sends them all", async () => {
    const all = Array.from(form().querySelectorAll('input[name="pain"]')) as HTMLInputElement[];
    expect(all.length).toBe(10);
    fillRequired();
    all.forEach((box) => tick("pain", box.value));
    expect(all.every((box) => box.checked)).toBe(true);
    expect(status()).toBe("");
    send();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const pain = JSON.parse(fetchMock.mock.calls[0][1].body).pain as string;
    expect(pain.split(", ")).toHaveLength(10);
    expect(pain.length).toBeLessThanOrEqual(300); // the gateway's limit for this answer
  });

  it("accepts a company of any size, with its office staff, departments and country, and shows no warning about size", async () => {
    expect(document.getElementById("fitSizeNote")).toBeNull();
    fillRequired();
    set("size", "150+");
    set("office", "16-50");
    tick("departments", "Warehouse or logistics");
    tick("departments", "Finance and accounts");
    set("country", "Saudi Arabia");
    set("city", "Riyadh");
    send();
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toMatchObject({ size: "150+", office: "16-50", country: "Saudi Arabia", city: "Riyadh", departments: "Finance and accounts, Warehouse or logistics" });
  });

  it("thanks the visitor and resets the form, keeping every dropdown on a real first choice", async () => {
    fillRequired();
    send();
    await vi.waitFor(() => expect(el("name").value).toBe(""));
    expect(status()).toBe("Thank you. We have your answers and will reply by email within 1 business day.");
    expect(el("size").selectedIndex).toBe(0);
    expect(el("consent").checked).toBe(false);
  });

  it("shows the server's message when sending fails, and lets the visitor try again", async () => {
    fetchMock.mockResolvedValue({ ok: false, json: async () => ({ error: "Could not deliver your request. Please email hello@hallaai.com directly." }) });
    fillRequired();
    send();
    await vi.waitFor(() => expect(status()).toContain("hello@hallaai.com"));
    expect((document.getElementById("fitCheckBtn") as HTMLButtonElement).disabled).toBe(false);
    expect(el("name").value).toBe("Jordan Smith"); // the visitor's answers are kept
  });
});
