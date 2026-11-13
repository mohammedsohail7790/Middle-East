import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { SystemStatus } from "./SystemStatus";

afterEach(() => vi.unstubAllGlobals());

const reply = (status: number, body: unknown = {}) => ({ ok: status >= 200 && status < 300, status, clone: () => ({ json: async () => body }) });

/** Routes each URL to an answer, so a test can say "the gateway is fine but the database is down". */
function stub(answers: { health?: number; ready?: { status: number; ready: boolean }; site?: number }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).endsWith("/health")) return reply(answers.health ?? 200);
      if (String(url).endsWith("/ready")) return reply(answers.ready?.status ?? 200, { ready: answers.ready?.ready ?? true });
      return reply(answers.site ?? 200);
    }),
  );
}

describe("system status page", () => {
  it("says everything is working when all three checks pass", async () => {
    stub({});
    render(<SystemStatus refreshMs={600_000} />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Everything is working/));
    expect(screen.getAllByText(/Working ·/)).toHaveLength(3);
  });

  it("shows the database as not responding when /ready says it is not ready, even though the gateway is alive", async () => {
    stub({ ready: { status: 503, ready: false } });
    render(<SystemStatus refreshMs={600_000} />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/Something is not working/));
    expect(screen.getAllByText(/Working ·/)).toHaveLength(2);
    expect(screen.getAllByText("Not responding")).toHaveLength(1);
  });

  it("shows a down gateway and a down website", async () => {
    stub({ health: 502, site: 500, ready: { status: 502, ready: false } });
    render(<SystemStatus refreshMs={600_000} />);
    await waitFor(() => expect(screen.getAllByText("Not responding")).toHaveLength(3));
  });

  it("treats a request that cannot even connect as down", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network"); }));
    render(<SystemStatus refreshMs={600_000} />);
    await waitFor(() => expect(screen.getAllByText("Not responding")).toHaveLength(3));
  });

  it("says plainly that it keeps no history", async () => {
    stub({});
    render(<SystemStatus refreshMs={600_000} />);
    expect(screen.getByText(/current state only, not history/)).toBeTruthy();
  });
});
