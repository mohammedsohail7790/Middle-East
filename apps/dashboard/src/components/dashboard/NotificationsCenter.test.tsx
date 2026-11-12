import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
  get: vi.fn(),
  post: vi.fn(),
  put: vi.fn(),
  locale: { value: "en" },
  live: { notifications: [] as any[], unreadCount: 0, markAllRead: vi.fn(), markRead: vi.fn() },
}));

vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post, put: h.put } }));
vi.mock("next-intl", () => ({ useLocale: () => h.locale.value }));
vi.mock("@/i18n/navigation", () => ({ Link: ({ href, children, onClick, className }: any) => <a href={href} onClick={onClick} className={className}>{children}</a> }));
vi.mock("./DashboardRealtimeProvider", () => ({ useDashboardNotifications: () => h.live }));

import { NotificationsCenter } from "./NotificationsCenter";

const alert = (over: Record<string, unknown> = {}) => ({
  id: "11111111-2222-3333-4444-555555555555",
  kind: "usage_90_percent",
  severity: "warning",
  title: "Your minutes are almost used up",
  title_ar: "دقائقك على وشك النفاد",
  body: "You have used about 90% of your minutes.",
  body_ar: "استهلكت نحو 90% من دقائقك.",
  href: "/dashboard/billing",
  created_at: new Date().toISOString(),
  read_at: null,
  ...over,
});

beforeEach(() => {
  [h.get, h.post, h.put, h.live.markAllRead].forEach((f) => f.mockReset());
  h.live.notifications = [];
  h.live.unreadCount = 0;
  h.locale.value = "en";
  h.post.mockResolvedValue({});
  h.put.mockResolvedValue({});
  h.get.mockImplementation(async (path: string) => {
    if (path === "/alerts") return { alerts: [alert(), alert({ id: "22222222-2222-3333-4444-555555555555", severity: "critical", title: "Your free trial has ended", title_ar: "انتهت تجربتك المجانية", body: "Choose a plan.", body_ar: "اختر باقة.", read_at: "2026-11-12T10:00:00Z" })], unread: 1 };
    if (path === "/alerts/settings") return { emailEnabled: true };
    return {};
  });
});

const open = async () => {
  render(<NotificationsCenter />);
  const bell = await screen.findByRole("button", { name: "Notifications" });
  await waitFor(() => expect(screen.getByText("1")).toBeTruthy()); // unread badge from the server
  fireEvent.click(bell);
  return bell;
};

describe("alerts in the bell", () => {
  it("shows the unread count from the server and lists the saved alerts, unread first", async () => {
    await open();
    expect(await screen.findByText("Your minutes are almost used up")).toBeTruthy();
    expect(screen.getByText("Your free trial has ended")).toBeTruthy();
    const titles = screen.getAllByRole("link").map((a) => a.textContent || "");
    const unreadAt = titles.findIndex((t) => t.includes("Your minutes are almost used up"));
    const readAt = titles.findIndex((t) => t.includes("Your free trial has ended"));
    expect(unreadAt).toBeGreaterThanOrEqual(0);
    expect(unreadAt).toBeLessThan(readAt); // unread first, even though the read one is critical
  });

  it("adds the live unread count to the badge", async () => {
    h.live.unreadCount = 3;
    render(<NotificationsCenter />);
    await waitFor(() => expect(screen.getByText("4")).toBeTruthy());
  });

  it("shows Arabic text in an Arabic dashboard", async () => {
    h.locale.value = "ar";
    await open();
    expect(await screen.findByText("دقائقك على وشك النفاد")).toBeTruthy();
    expect(screen.queryByText("Your minutes are almost used up")).toBeNull();
  });

  it("marks an alert read when it is opened, and tells the server", async () => {
    await open();
    fireEvent.click(await screen.findByText("Your minutes are almost used up"));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/alerts/11111111-2222-3333-4444-555555555555/read", {}));
  });

  it("does not tell the server about an alert that was already read", async () => {
    await open();
    fireEvent.click(await screen.findByText("Your free trial has ended"));
    expect(h.post).not.toHaveBeenCalled();
  });

  it("marks everything read, saved alerts and live activity alike", async () => {
    h.live.unreadCount = 2;
    render(<NotificationsCenter />);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    fireEvent.click(await screen.findByText("Mark all read"));
    expect(h.live.markAllRead).toHaveBeenCalled();
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/alerts/read-all", {}));
  });

  it("turns alert emails off and back on, undoing the switch if saving fails", async () => {
    await open();
    const box = (await screen.findByLabelText("Email me alerts")) as HTMLInputElement;
    expect(box.checked).toBe(true);
    fireEvent.click(box);
    await waitFor(() => expect(h.put).toHaveBeenCalledWith("/alerts/settings", { emailEnabled: false }));
    h.put.mockRejectedValue(new Error("nope"));
    fireEvent.click(box);
    await waitFor(() => expect((screen.getByLabelText("Email me alerts") as HTMLInputElement).checked).toBe(false));
  });

  it("still works when the alerts cannot be loaded", async () => {
    h.get.mockRejectedValue(new Error("down"));
    render(<NotificationsCenter />);
    fireEvent.click(await screen.findByRole("button", { name: "Notifications" }));
    expect(await screen.findByText(/Live updates appear here/)).toBeTruthy();
    expect(screen.queryByLabelText("Email me alerts")).toBeNull();
  });
});
