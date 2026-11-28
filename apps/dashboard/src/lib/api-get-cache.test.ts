import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./store", () => ({ getTenantId: () => "tenant-1" }));

import { cachedGet, clearApiGetCache } from "./api-get-cache";

beforeEach(() => clearApiGetCache());

describe("GET cache", () => {
  it("serves a repeat request from the cache for 45 seconds", async () => {
    const fetcher = vi.fn(async () => ({ n: 1 }));
    await cachedGet("/x", fetcher);
    await cachedGet("/x", fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("goes to the server every time when fresh is asked for", async () => {
    const fetcher = vi.fn(async () => ({ n: 1 }));
    await cachedGet("/x", fetcher, { fresh: true });
    await cachedGet("/x", fetcher, { fresh: true });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("a fresh request never joins a request that started earlier, which may carry an older answer", async () => {
    let release!: (v: { status: string }) => void;
    const slowOld = vi.fn(() => new Promise<{ status: string }>((resolve) => (release = resolve)));
    const fast = vi.fn(async () => ({ status: "disconnected" }));

    const before = cachedGet("/x", slowOld); // started before the change, still waiting
    const after = await cachedGet("/x", fast, { fresh: true }); // asked after the change

    expect(fast).toHaveBeenCalledTimes(1);
    expect(after).toEqual({ status: "disconnected" });
    release({ status: "connected" });
    await before;
  });

  it("an older request finishing last does not hide the newer answer from the cache", async () => {
    let release!: (v: { status: string }) => void;
    const slowOld = () => new Promise<{ status: string }>((resolve) => (release = resolve));
    const before = cachedGet("/x", slowOld);
    await cachedGet("/x", async () => ({ status: "disconnected" }), { fresh: true });
    release({ status: "connected" });
    await before;
    const again = vi.fn(async () => ({ status: "never" }));
    expect(await cachedGet("/x", again)).toEqual({ status: "disconnected" });
    expect(again).not.toHaveBeenCalled();
  });
});

describe("audit history is never served from the cache", () => {
  const api = readFileSync(join(__dirname, "api.ts"), "utf8");
  const page = readFileSync(join(__dirname, "../app/[locale]/dashboard/compliance/audit/page.tsx"), "utf8");

  it("getList accepts the fresh option and passes it on", () => {
    expect(api).toMatch(/async function requestList<T>\([^)]*options\?: \{ fresh\?: boolean \}/s);
    expect(api).toContain("cachedGet(cachePath, () => requestListRaw<T>(path, params), options)");
    expect(api).toMatch(/getList: <T>\(path: string, params\?: Record<string, string>, options\?: \{ fresh\?: boolean \}\)/);
  });

  it("the audit page asks for a fresh list, so a reviewer always sees the latest events", () => {
    expect(page).toMatch(/api\.getList<AuditRow>\(\s*"\/compliance\/audit-events",\s*\{[^}]*\},\s*\{ fresh: true \}\s*\)/);
  });
});
