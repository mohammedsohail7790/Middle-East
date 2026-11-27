import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import en from "@/messages/en.json";
import ar from "@/messages/ar.json";

const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post } }));

import { TestAppointmentTool } from "./TestAppointmentTool";

function show(locale: "en" | "ar", onAdded = () => {}) {
  const messages = (locale === "en" ? en : ar) as unknown as Record<string, unknown>;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <TestAppointmentTool onAdded={onAdded} />
    </NextIntlClientProvider>
  );
}

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
});

describe("owner-only test appointment tool", () => {
  it("shows nothing to anyone the server does not allow (viewers, agents, admins)", async () => {
    h.get.mockResolvedValue({ allowed: false, googleConnected: false });
    const { container } = show("en");
    await waitFor(() => expect(h.get).toHaveBeenCalledWith("/appointments/test-access", { fresh: true }));
    expect(container.textContent).toBe("");
  });

  it("shows nothing when the access check fails", async () => {
    h.get.mockRejectedValue(new Error("403"));
    const { container } = show("en");
    await waitFor(() => expect(h.get).toHaveBeenCalled());
    expect(container.textContent).toBe("");
  });

  it("owner: adds a test appointment, tells them it went to Google, and refreshes the calendar", async () => {
    h.get.mockResolvedValue({ allowed: true, googleConnected: true });
    h.post.mockResolvedValue({ id: "a1", scheduled_time: "2026-12-01T10:00:00.000Z", googleConnected: true });
    const onAdded = vi.fn();
    show("en", onAdded);
    const button = await screen.findByRole("button", { name: /Add test appointment/ });
    fireEvent.click(button);
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/appointments/test", {}));
    await waitFor(() => expect(screen.getByText(/sent to your Google Calendar/i)).toBeTruthy());
    expect(onAdded).toHaveBeenCalledTimes(1);
  });

  it("owner without Google connected: says it only shows in Halla AI", async () => {
    h.get.mockResolvedValue({ allowed: true, googleConnected: false });
    h.post.mockResolvedValue({ id: "a1", scheduled_time: "2026-12-01T10:00:00.000Z", googleConnected: false });
    show("en");
    fireEvent.click(await screen.findByRole("button", { name: /Add test appointment/ }));
    await waitFor(() => expect(screen.getByText(/Google Calendar is not connected/i)).toBeTruthy());
  });

  it("shows the server's reason when it cannot book", async () => {
    h.get.mockResolvedValue({ allowed: true, googleConnected: true });
    h.post.mockRejectedValue(new Error("No free slot at 2 PM in the next eight days."));
    show("en");
    fireEvent.click(await screen.findByRole("button", { name: /Add test appointment/ }));
    await waitFor(() => expect(screen.getByText(/No free slot/)).toBeTruthy());
  });

  it("is fully Arabic", async () => {
    h.get.mockResolvedValue({ allowed: true, googleConnected: true });
    h.post.mockResolvedValue({ id: "a1", scheduled_time: "2026-12-01T10:00:00.000Z", googleConnected: true });
    const { container } = show("ar");
    const button = await screen.findByRole("button");
    fireEvent.click(button);
    await waitFor(() => expect(h.post).toHaveBeenCalled());
    await waitFor(() => expect(container.textContent).toMatch(/Google/));
    const text = container.textContent || "";
    for (const p of ["Add test appointment", "owner", "Owner", "Google Calendar.", "added for"]) expect(text, p).not.toContain(p);
    expect(text).toMatch(/[؀-ۿ]/);
  });
});
