import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({
  api: { get: h.get, post: h.post, patch: vi.fn() },
  asArray: (v: unknown) => (Array.isArray(v) ? v : []),
  humanizeApiError: () => "error",
}));
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => key,
  useLocale: () => "en",
}));
vi.mock("@/lib/use-realtime-query", async () => {
  const React = await import("react");
  return {
    useRealtimeQuery: (_keys: string[], load: (o?: { silent?: boolean }) => void) => {
      React.useEffect(() => {
        load();
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
    },
  };
});
vi.mock("@/lib/use-dashboard-page-labels", () => ({ useDashboardPageLabels: () => ({ title: "Calendar" }) }));
vi.mock("@/components/calendar/TestAppointmentTool", () => ({ TestAppointmentTool: () => null }));
vi.mock("@/components/ui-kit/ConfirmDialog", () => ({ useConfirm: () => ({ confirm: vi.fn(), confirmDialog: null }) }));

import CalendarPage from "./page";

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", class { observe() {} unobserve() {} disconnect() {} });
  h.get.mockReset();
  h.get.mockResolvedValue([]);
});

describe("calendar page", () => {
  it("always asks the server for events, never a cached copy, so a new booking shows at once", async () => {
    render(<CalendarPage />);
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    const call = h.get.mock.calls.find((c) => String(c[0]).startsWith("/calendar/events"));
    expect(call).toBeTruthy();
    expect(call?.[1]).toEqual({ fresh: true });
  });
});
