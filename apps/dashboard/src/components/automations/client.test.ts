import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase", () => ({ supabase: { auth: { getSession: async () => ({ data: { session: { access_token: "tok", user: { user_metadata: { tenant_id: "t1" } } } } }) } } }));
vi.mock("@/lib/store", () => ({ getTenantId: () => "t1" }));
vi.mock("@/lib/api", () => ({ attachCsrfToHeaders: async () => undefined, getGatewayBaseUrl: () => "https://gw.test" }));

import { automationsApi } from "./client";
import { AutomationsApiError } from "./errors";

afterEach(() => vi.unstubAllGlobals());

describe("automations client", () => {
  it("keeps the status and the plain sentences of a 400", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false, error: "Check the settings", details: ["Add an email", 5] }), { status: 400 })));
    const err = await automationsApi.save("x", { enabled: true, approvalMode: "ask", config: {} }).catch((e) => e);
    expect(err).toBeInstanceOf(AutomationsApiError);
    expect(err.status).toBe(400);
    expect(err.details).toEqual(["Add an email"]);
  });
  it("sends the file as multipart with the automation key and no JSON content type", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true, data: { ref: "r1" } }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const out = await automationsApi.uploadDocument(new File(["hi"], "a.txt", { type: "text/plain" }));
    expect(out).toEqual({ ref: "r1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gw.test/api/v1/automations/documents");
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get("automation")).toBe("document-intake");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBeUndefined();
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer tok");
  });
  it("turns a network failure into status 0", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("down"); }));
    const err = await automationsApi.stats(7).catch((e) => e);
    expect(err.status).toBe(0);
  });
});
