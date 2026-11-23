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
