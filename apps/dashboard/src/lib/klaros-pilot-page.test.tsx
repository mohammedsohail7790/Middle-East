/**
 * The real Klaros pilot page, rendered in jsdom against a FAKE API client (the dashboard's `api` is mocked at its module boundary).
 * This proves the page's behaviour: disabled by default, confirmation gating, the one-time value lifecycle, and failure states.
 * It does not run a browser against the real gateway, and it does not exercise the Supabase session or the CSRF transport (those are
 * the existing dashboard client's job and are unchanged by this work).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const TENANT = "5b1f0c3e-1111-4222-8333-444455556666";
const NAME = "Test Clinic Ltd";
const CALL_IQ = "ad9c3394-f7ab-42af-aa74-43f2b0d8b52c";
const KEY_VALUE = "sk_calliq_" + "ab12cd34".repeat(8);
const SECRET_VALUE = "f0".repeat(32);

interface Opts { tenantId?: string; keys?: any[]; hooks?: any[]; keyPost?: "ok" | "throw"; revoke?: "ok" | "throw" }
function makeApi(o: Opts = {}) {
  const calls: Array<{ method: string; path: string; body?: any }> = [];
  const state = { keys: o.keys ?? [], hooks: o.hooks ?? [] };
  const api = {
    get: vi.fn(async (path: string) => {
      calls.push({ method: "GET", path });
      if (path === "/tenants/me") return { id: o.tenantId ?? TENANT, companyName: NAME, transferNumber: "+14155550142" };
      if (path === "/api-keys") return state.keys.map((k) => ({ ...k }));
      if (path === "/webhooks") return state.hooks.map((h) => ({ ...h }));
      throw new Error("unexpected GET " + path);
    }),
    post: vi.fn(async (path: string, body: any) => {
      calls.push({ method: "POST", path, body });
      if (path === "/api-keys") {
        state.keys.push({ id: "key-1", name: body.name, keyPrefix: "sk_calliq_ab12cd...", revokedAt: null, expiresAt: body.expiresAt });
        if (o.keyPost === "throw") throw new Error("timed out");
        return { id: "key-1", keyPrefix: "sk_calliq_ab12cd...", key: KEY_VALUE };
      }
      if (/\/revoke$/.test(path)) {
        if (o.revoke === "throw") throw new Error("boom");
        state.keys.forEach((k) => { k.revokedAt = new Date().toISOString(); });
        return {};
      }
      if (path === "/webhooks") {
        state.hooks.push({ id: "hook-1", url: body.url });
        return { id: "hook-1", secret: SECRET_VALUE };
      }
      throw new Error("unexpected POST " + path);
    }),
    del: vi.fn(async (path: string) => { calls.push({ method: "DELETE", path }); state.hooks.length = 0; return {}; }),
  };
  return { api, calls, state, mutating: () => calls.filter((c) => c.method !== "GET") };
}

async function mount(flag: string | undefined, o: Opts = {}) {
  vi.resetModules();
  if (flag === undefined) delete process.env.NEXT_PUBLIC_KLAROS_PILOT_SETUP;
  else process.env.NEXT_PUBLIC_KLAROS_PILOT_SETUP = flag;
  const fake = makeApi(o);
  vi.doMock("@/lib/api", () => ({ api: fake.api }));
  const mod = await import("@/app/[locale]/dashboard/klaros-pilot/page");
  const view = render(<mod.default />);
  return { fake, view };
}

const reviewPlan = async () => {
  fireEvent.click(screen.getByRole("button", { name: /Review plan/ }));
  await screen.findByText(/Signed in as tenant/);
};
const confirmAll = (id = TENANT, name = NAME) => {
  fireEvent.change(screen.getByLabelText("Tenant id"), { target: { value: id } });
  fireEvent.change(screen.getByLabelText("Tenant name"), { target: { value: name } });
  fireEvent.click(screen.getByRole("checkbox"));
};

let consoleSpies: Array<ReturnType<typeof vi.spyOn>> = [];
let setItemSpy: ReturnType<typeof vi.spyOn>;
const writeText = vi.fn().mockResolvedValue(undefined);
beforeEach(() => {
  consoleSpies = (["log", "info", "warn", "error", "debug"] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => undefined));
  setItemSpy = vi.spyOn(Storage.prototype, "setItem");
  writeText.mockClear();
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
});
afterEach(() => { cleanup(); consoleSpies.forEach((s) => s.mockRestore()); setItemSpy.mockRestore(); vi.doUnmock("@/lib/api"); });

const everythingLogged = () => consoleSpies.flatMap((s) => s.mock.calls).flat().map(String).join("\n") + JSON.stringify(setItemSpy.mock.calls);

describe("page is disabled by default", () => {
  it.each([undefined, "", "false", "1", "TRUE", "yes"])("flag %j renders only a notice and calls nothing", async (flag) => {
    const { fake } = await mount(flag as string | undefined);
    expect(screen.getByText("This page is not enabled.")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
    expect(fake.api.get).not.toHaveBeenCalled();
    expect(fake.api.post).not.toHaveBeenCalled();
  });
});

describe("enabled page: plan and confirmation gating", () => {
  it("makes no network call until the owner asks for the plan, and the plan is read-only", async () => {
    const { fake } = await mount("true");
    expect(fake.calls).toHaveLength(0);
    await reviewPlan();
    expect(fake.mutating()).toHaveLength(0);
    expect(screen.getByText(TENANT)).toBeInTheDocument();
    expect(screen.getByText(NAME)).toBeInTheDocument();
    expect(screen.getByText(/configured/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain("+14155550142");
    expect(document.body.textContent).not.toContain("appointment.requested");
  });

  it("keeps both action buttons disabled until the exact id, exact name and acknowledgement are given", async () => {
    await mount("true");
    await reviewPlan();
    const create = screen.getByRole("button", { name: /1\. Create runtime key/ });
    const register = screen.getByRole("button", { name: /2\. Register webhook/ });
    expect(create).toBeDisabled(); expect(register).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Tenant id"), { target: { value: TENANT } });
    fireEvent.change(screen.getByLabelText("Tenant name"), { target: { value: "test clinic ltd" } });
    fireEvent.click(screen.getByRole("checkbox"));
    expect(create).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Tenant name"), { target: { value: NAME } });
    expect(create).toBeEnabled(); expect(register).toBeEnabled();
  });

  it("refuses an existing company tenant: shows the refusal, no plan, nothing created", async () => {
    const { fake } = await mount("true", { tenantId: CALL_IQ });
    fireEvent.click(screen.getByRole("button", { name: /Review plan/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/REFUSING/);
    expect(screen.queryByText(/Signed in as tenant/)).toBeNull();
    expect(fake.mutating()).toHaveLength(0);
  });
});

describe("one-time value lifecycle", () => {
  it("shows the key masked, never in the page text, never logged or stored; clears completely when dismissed", async () => {
    const { fake, view } = await mount("true");
    await reviewPlan(); confirmAll();
    fireEvent.click(screen.getByRole("button", { name: /1\. Create runtime key/ }));
    const field = (await screen.findByLabelText("API key")) as HTMLInputElement;
    expect(field.type).toBe("password");
    expect(field.readOnly).toBe(true);
    expect(field.autocomplete).toBe("off");
    expect(view.container.textContent).not.toContain(KEY_VALUE);
    expect(screen.getByText(/HALLA_API_KEY_MT/)).toBeInTheDocument();
    // exactly one create, with the minimum scopes
    const post = fake.calls.find((c) => c.method === "POST" && c.path === "/api-keys")!;
    expect(post.body.scopes).toEqual(["workforce.read", "workforce.write", "leads.read", "leads.write"]);
    // reveal / copy
    fireEvent.click(screen.getByRole("button", { name: "Reveal" }));
    expect((screen.getByLabelText("API key") as HTMLInputElement).type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Copy" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(KEY_VALUE));
    // dismiss: nothing of the value remains anywhere in the DOM
    fireEvent.click(screen.getByRole("button", { name: /I stored it in Klaros/ }));
    expect(screen.queryByLabelText("API key")).toBeNull();
    expect(document.documentElement.outerHTML).not.toContain(KEY_VALUE);
    expect(everythingLogged()).not.toContain(KEY_VALUE);
  });

  it("the webhook secret behaves the same, and leaving the page (unmount) clears it", async () => {
    const { view } = await mount("true", { keys: [{ id: "k0", name: "klaros-pilot-runtime (medical tourism)", keyPrefix: "sk_calliq_pre...", revokedAt: null, expiresAt: null }] });
    await reviewPlan(); confirmAll();
    fireEvent.click(screen.getByRole("button", { name: /2\. Register webhook/ }));
    await screen.findByLabelText("Webhook signing secret");
    expect(view.container.textContent).not.toContain(SECRET_VALUE);
    view.unmount();
    expect(document.documentElement.outerHTML).not.toContain(SECRET_VALUE);
    expect(everythingLogged()).not.toContain(SECRET_VALUE);
  });

  it("warns before the tab is closed while a value is on screen, and stops warning once it is cleared", async () => {
    await mount("true");
    await reviewPlan(); confirmAll();
    const add = vi.spyOn(window, "addEventListener"); const remove = vi.spyOn(window, "removeEventListener");
    fireEvent.click(screen.getByRole("button", { name: /1\. Create runtime key/ }));
    await screen.findByLabelText("API key");
    expect(add.mock.calls.some((c) => c[0] === "beforeunload")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /I stored it in Klaros/ }));
    await waitFor(() => expect(remove.mock.calls.some((c) => c[0] === "beforeunload")).toBe(true));
    add.mockRestore(); remove.mockRestore();
  });

  it("'I could not store it' revokes the key at the gateway and clears the value", async () => {
    const { fake } = await mount("true");
    await reviewPlan(); confirmAll();
    fireEvent.click(screen.getByRole("button", { name: /1\. Create runtime key/ }));
    await screen.findByLabelText("API key");
    fireEvent.click(screen.getByRole("button", { name: /I could not store it/ }));
    await waitFor(() => expect(screen.queryByLabelText("API key")).toBeNull());
    expect(fake.calls.some((c) => c.method === "POST" && /\/revoke$/.test(c.path))).toBe(true);
    expect(fake.state.keys.every((k: any) => k.revokedAt)).toBe(true);
    expect(document.documentElement.outerHTML).not.toContain(KEY_VALUE);
  });
});

describe("failure states", () => {
  it("a create that times out client-side is found by name and revoked: an error is shown, no value, no orphan", async () => {
    const { fake } = await mount("true", { keyPost: "throw" });
    await reviewPlan(); confirmAll();
    fireEvent.click(screen.getByRole("button", { name: /1\. Create runtime key/ }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/did not complete cleanly.*The key was revoked/);
    expect(screen.queryByLabelText("API key")).toBeNull();
    expect(fake.state.keys.every((k: any) => k.revokedAt)).toBe(true);
    expect(document.documentElement.outerHTML).not.toContain(KEY_VALUE);
  });

  it("if even the revoke fails, the page says so plainly and names the key id (never a false 'revoked')", async () => {
    await mount("true", { keyPost: "throw", revoke: "throw" });
    await reviewPlan(); confirmAll();
    fireEvent.click(screen.getByRole("button", { name: /1\. Create runtime key/ }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent(/THE REVOKE FAILED/);
    expect(alert).toHaveTextContent(/key-1/);
    expect(alert.textContent).not.toMatch(/was revoked, so nothing/);
  });

  it("an existing key is never duplicated, and a lost one can be revoked from the page with the same confirmation", async () => {
    const { fake } = await mount("true", { keys: [{ id: "k0", name: "klaros-pilot-runtime (medical tourism)", keyPrefix: "sk_calliq_old...", revokedAt: null, expiresAt: null }] });
    await reviewPlan();
    const revoke = screen.getByRole("button", { name: "Revoke existing key" });
    expect(revoke).toBeDisabled();
    confirmAll();
    fireEvent.click(screen.getByRole("button", { name: /1\. Create runtime key/ }));
    expect(await screen.findByRole("status")).toHaveTextContent(/already exists/);
    expect(fake.mutating()).toHaveLength(0);
    fireEvent.click(screen.getByRole("button", { name: "Revoke existing key" }));
    await waitFor(() => expect(fake.calls.some((c) => c.path === "/api-keys/k0/revoke")).toBe(true));
  });
});
