import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: { get: h.get, post: h.post },
  readApiGetCache: () => undefined,
  humanizeApiError: () => "error",
}));
vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ children, href }: any) => <a href={href}>{children}</a> }));

import IntegrationsPage from "./page";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  h.get.mockReset();
  h.get.mockResolvedValue({ connections: {} });
});

describe("integrations page", () => {
  it("always asks the server for the connection list, never a cached copy", async () => {
    render(<IntegrationsPage />);
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    const catalogCall = h.get.mock.calls.find((c) => c[0] === "/integrations/catalog");
    expect(catalogCall).toBeTruthy();
    expect(catalogCall?.[1]).toEqual({ fresh: true });
  });
});
