import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The Contact page form is plain browser JavaScript in public/halla_main.js. This loads the real page markup and the real initContactForm() into jsdom and checks
 * that name, email and message are all required, and that a valid message is sent to the lead endpoint marked as a general enquiry.
 */
const pub = path.resolve(__dirname, "../../../public");
const html = readFileSync(path.join(pub, "marketing-body.html"), "utf8");
const js = readFileSync(path.join(pub, "halla_main.js"), "utf8");

function pageMarkup(): string {
  const start = html.indexOf('<div id="page-contact"');
  const end = html.indexOf("<!-- ====== CONSULTANCY", start);
  return html.slice(start, end);
}

function loadInit(): () => void {
  const start = js.indexOf("function initContactForm()");
  let depth = 0;
  let i = js.indexOf("{", start);
  for (; i < js.length; i++) {
    if (js[i] === "{") depth++;
    if (js[i] === "}" && --depth === 0) break;
  }
  return new Function(`${js.slice(start, i + 1)}\nreturn initContactForm;`)() as () => void;
}

const fire = (el: Element) => el.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
const f = () => {
  const root = document.getElementById("page-contact")!;
  return {
    name: root.querySelector('input[name="name"]') as HTMLInputElement,
    email: root.querySelector('input[name="email"]') as HTMLInputElement,
    message: root.querySelector('textarea[name="message"]') as HTMLTextAreaElement,
    button: document.getElementById("contactSendBtn")!,
    status: () => root.querySelector(".consult-form-status")!,
  };
};

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  document.body.innerHTML = pageMarkup();
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal("fetch", fetchMock);
  loadInit()();
});

describe("Contact page form", () => {
  it("shows the support email address on the page", () => {
    expect(document.body.innerHTML).toContain("mailto:hello@hallaai.com");
  });

  it("does not send when the message is missing", () => {
    const x = f();
    x.name.value = "Jordan Smith";
    x.email.value = "jordan@example.com";
    fire(x.button);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(x.message.style.borderColor).toBe("var(--red)");
  });

  it("does not send with a malformed email", () => {
    const x = f();
    x.name.value = "Jordan";
    x.email.value = "not-an-email";
    x.message.value = "Hello";
    fire(x.button);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(x.email.style.borderColor).toBe("var(--red)");
  });

  it("sends a valid message as a general enquiry and clears the form", async () => {
    const x = f();
    x.name.value = "Jordan Smith";
    x.email.value = "jordan@example.com";
    x.message.value = "Do you work with clinics in Abu Dhabi?";
    fire(x.button);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({ name: "Jordan Smith", email: "jordan@example.com", priority: "General enquiry (Contact page)", notes: "Do you work with clinics in Abu Dhabi?" });
    await vi.waitFor(() => expect(x.name.value).toBe(""));
    expect(x.status().textContent).toContain("Thank you");
  });
});
