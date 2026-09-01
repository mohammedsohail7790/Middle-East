"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { motion } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  User,
  RefreshCw,
  CalendarClock,
  X,
} from "lucide-react";
import { api, asArray } from "@/lib/api";
import { normalizeCalendarEvent } from "@/lib/gateway-adapters";
import { cn } from "@/lib/utils";
import { useRealtimeQuery } from "@/lib/use-realtime-query";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { VibePanel } from "@/components/magic-ui/vibe-panel";
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";
import { useConfirm } from "@/components/ui-kit/ConfirmDialog";
import { useDashboardPageLabels } from "@/lib/use-dashboard-page-labels";

interface CalendarEvent {
  id: string;
  title: string;
  start: string;
  end: string;
  type: string;
  attendee: string;
  attendeeName?: string;
  attendeePhone?: string;
  service?: string;
  location: string;
  color: string;
  status?: string;
}

const EVENT_COLORS: Record<string, string> = {
  appointment: "bg-accent",
  callback: "bg-amber-500",
  meeting: "bg-stone-500",
  follow_up: "bg-emerald-500",
  default: "bg-slate-500",
};

function monthBounds(year: number, month: number) {
  const from = new Date(year, month, 1, 0, 0, 0, 0);
  const to = new Date(year, month + 1, 0, 23, 59, 59, 999);
  return { from, to };
}

function eventOnLocalDay(event: CalendarEvent, year: number, month: number, day: number): boolean {
  if (!event.start) return false;
  const d = new Date(event.start);
  if (Number.isNaN(d.getTime())) return false;
  return d.getFullYear() === year && d.getMonth() === month && d.getDate() === day;
}

async function fetchCalendarEvents(year: number, month: number): Promise<CalendarEvent[]> {
  const { from, to } = monthBounds(year, month);
  const qs = new URLSearchParams({
    from: from.toISOString(),
    to: to.toISOString(),
    limit: "200",
  });

  try {
    const data = await api.get<CalendarEvent[]>(`/calendar/events?${qs.toString()}`);
    return asArray(data).map(
      (row) => normalizeCalendarEvent(row as Record<string, unknown>) as CalendarEvent
    );
  } catch (err) {
    // Falling back to /appointments hides real backend regressions on the
    // primary endpoint from the user — surface it so it doesn't go unnoticed.
    console.error("[calendar] /calendar/events failed, falling back to /appointments", err);
    const fallback = await api.get<Record<string, unknown>[]>("/appointments?limit=200");
    const { from: f, to: t } = monthBounds(year, month);
    return asArray(fallback)
      .map((row) => normalizeCalendarEvent(row as Record<string, unknown>) as CalendarEvent)
      .filter((e) => {
        if (!e.start) return false;
        const d = new Date(e.start);
        return d >= f && d <= t;
      });
  }
}

export default function CalendarPage() {
  const t = useTranslations("pages.calendar");
  const locale = useLocale();
  const { title } = useDashboardPageLabels("/dashboard/calendar");
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
  const { confirm, confirmDialog } = useConfirm();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const today = new Date();

  const loadEvents = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    setError("");
    try {
      const rows = await fetchCalendarEvents(year, month);
      setEvents(rows);
    } catch (e) {
      setEvents([]);
      setError(e instanceof Error ? e.message : t("loadFailed"));
    } finally {
      setLoading(false);
    }
  }, [year, month, t]);

  const addTestAppointment = async () => {
    setError("");
    const when = new Date();
    when.setDate(when.getDate() + 2);
    when.setHours(14, 0, 0, 0);
    try {
      await api.post("/appointments", {
        name: "Test Booking",
        phone: "+15551234567",
        service: "Demo visit",
        scheduled_time: when.toISOString(),
      });
      await loadEvents();
      syncDashboardAction("calendar");
    } catch (e) {
      setError(e instanceof Error ? e.message : t("createTestFailed"));
    }
  };

  useRealtimeQuery(["calendar"], (opts) => {
    void loadEvents(opts);
  }, `${year}-${month}`, { pollMs: 60000, pollOnlyWhenDisconnected: true });

  const prevMonth = () => {
    setSelectedDay(null);
    setCurrentDate(new Date(year, month - 1, 1));
  };
  const nextMonth = () => {
    setSelectedDay(null);
    setCurrentDate(new Date(year, month + 1, 1));
  };

  const getEventsForDay = (day: number) =>
    events.filter((e) => eventOnLocalDay(e, year, month, day));

  const now = new Date();
  const upcomingEvents = events
    .filter((e) => {
      const d = new Date(e.start);
      return !Number.isNaN(d.getTime()) && d >= now;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 8);

  const selectedDayEvents =
    selectedDay != null ? getEventsForDay(selectedDay) : [];

  const monthYearLabel = useMemo(
    () => new Intl.DateTimeFormat(locale, { month: "long", year: "numeric" }).format(currentDate),
    [locale, currentDate]
  );

  const weekdayLabels = useMemo(() => {
    const base = new Date(2024, 0, 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return new Intl.DateTimeFormat(locale, { weekday: "short" }).format(d);
    });
  }, [locale]);

  const selectedDayLabel =
    selectedDay != null
      ? new Intl.DateTimeFormat(locale, { month: "long", day: "numeric", year: "numeric" }).format(
          new Date(year, month, selectedDay)
        )
      : "";

  const pageDescription = t("monthAppointments", { count: events.length });

  return (
    <DashboardPage
      title={title}
      description={pageDescription}
      maxWidth="xl"
      loading={loading && events.length === 0}
      actions={
        <button
          type="button"
          onClick={() => void loadEvents()}
          className="btn-ghost inline-flex items-center gap-2 text-sm"
          disabled={loading}
        >
          <RefreshCw className={cn("w-4 h-4", loading && "animate-spin")} />
          {t("refresh")}
        </button>
      }
    >
      {error && (
        <div className="dashboard-alert dashboard-alert-error mb-6">
          <p className="text-sm">{error}</p>
          <p className="text-xs mt-2 opacity-90">{t("errorHint")}</p>
        </div>
      )}

      {!loading && events.length === 0 && !error && (
        <div className="dashboard-alert border-amber-200 bg-amber-50 dark:bg-amber-950/20 mb-6">
          <p className="text-sm text-amber-900 dark:text-amber-200 font-medium">{t("noAppointments")}</p>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">{t("noAppointmentsDesc")}</p>
          <button type="button" onClick={() => void addTestAppointment()} className="btn-primary mt-3 text-sm">
            {t("addTest")}
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="lg:col-span-2"
        >
        <VibePanel beam className="rounded-2xl border border-border/70 bg-card shadow-card min-w-0 overflow-hidden">
        <div className="p-4 sm:p-6 min-w-0 overflow-hidden">
          <div className="flex flex-col gap-3 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">{monthYearLabel}</h2>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={prevMonth} className="btn-ghost p-2" aria-label={t("prevMonth")}>
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelectedDay(null);
                  setCurrentDate(new Date());
                }}
                className="btn-ghost px-3 py-1.5 text-xs"
              >
                {t("today")}
              </button>
              <button type="button" onClick={nextMonth} className="btn-ghost p-2" aria-label={t("nextMonth")}>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
              {Array.from({ length: 35 }).map((_, i) => (
                <div key={i} className="min-h-[4rem] sm:min-h-[5rem] bg-muted/50 animate-pulse rounded-lg" />
              ))}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-7 gap-0.5 sm:gap-1 mb-1">
                {weekdayLabels.map((day) => (
                  <div
                    key={day}
                    className="text-center text-[10px] sm:text-xs text-foreground-tertiary py-1.5 sm:py-2 font-medium truncate px-0.5"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                {(() => {
                  const days: (number | null)[] = [];
                  for (let i = 0; i < firstDay; i++) days.push(null);
                  for (let i = 1; i <= daysInMonth; i++) days.push(i);
                  return days;
                })().map((day, i) => {
                  if (!day) return <div key={`pad-${i}`} className="min-h-[4rem] sm:min-h-[5rem]" />;
                  const dayEvents = getEventsForDay(day);
                  const isToday =
                    day === today.getDate() &&
                    month === today.getMonth() &&
                    year === today.getFullYear();
                  const isSelected = selectedDay === day;

                  return (
                    <button
                      type="button"
                      key={`day-${day}`}
                      onClick={() => setSelectedDay(day)}
                      className={cn(
                        "vibe-calendar-day min-h-[4rem] sm:min-h-[5rem] h-full p-1 sm:p-1.5 rounded-lg border text-left transition-colors min-w-0",
                        isSelected && "ring-2 ring-accent ring-offset-1",
                        isToday
                          ? "border-accent/30 bg-accent/[0.05]"
                          : "border-border hover:bg-muted/50",
                        dayEvents.length > 0 && "has-events",
                      )}
                    >
                      <span
                        className={cn(
                          "text-xs font-medium",
                          isToday ? "text-accent" : "text-foreground-secondary"
                        )}
                      >
                        {day}
                      </span>
                      <div className="mt-1 space-y-0.5">
                        {dayEvents.slice(0, 2).map((event) => (
                          <div
                            key={event.id}
                            className={cn(
                              "text-[9px] px-1 py-0.5 rounded truncate text-white",
                              EVENT_COLORS[event.type] || EVENT_COLORS.default
                            )}
                            title={`${event.title} — ${new Date(event.start).toLocaleString()}`}
                          >
                            {new Date(event.start).toLocaleTimeString([], {
                              hour: "numeric",
                              minute: "2-digit",
                            })}{" "}
                            {event.title}
                          </div>
                        ))}
                        {dayEvents.length > 2 && (
                          <span className="text-[9px] text-foreground-tertiary">
                            {t("moreEvents", { count: dayEvents.length - 2 })}
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>
        </VibePanel>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          {selectedDay != null && (
            <div className="dashboard-panel vibe-event-panel p-6">
              <SectionHeader
                icon={CalendarIcon}
                title={selectedDayLabel}
                size="sm"
                className="mb-4"
              />
              {selectedDayEvents.length === 0 ? (
                <p className="text-sm text-foreground-tertiary">{t("noDayAppointments")}</p>
              ) : (
                <div className="space-y-3">
                  {selectedDayEvents.map((event) => (
                    <EventCard key={event.id} event={event} onUpdated={loadEvents} onError={setError} confirm={confirm} />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="dashboard-panel vibe-event-panel p-6">
            <SectionHeader icon={Clock} title={t("upcoming")} size="sm" className="mb-4" />
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : upcomingEvents.length === 0 ? (
              <EmptyState
                icon={CalendarIcon}
                title={t("noUpcoming")}
                description={t("noUpcomingDesc")}
                iconVariant="muted"
              />
            ) : (
              <div className="space-y-3">
                {upcomingEvents.map((event) => (
                  <EventCard key={event.id} event={event} onUpdated={loadEvents} onError={setError} confirm={confirm} />
                ))}
              </div>
            )}
          </div>
        </motion.div>
      </div>
      {confirmDialog}
    </DashboardPage>
  );
}

function isManagedAppointment(event: CalendarEvent): boolean {
  return event.type === "appointment" && !String(event.id).startsWith("lead-");
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function EventCard({
  event,
  onUpdated,
  onError,
  confirm,
}: {
  event: CalendarEvent;
  onUpdated: () => void;
  onError: (msg: string) => void;
  confirm: (options: import("@/components/ui-kit/ConfirmDialog").ConfirmOptions) => Promise<boolean>;
}) {
  const t = useTranslations("pages.calendar");
  const locale = useLocale();
  const start = new Date(event.start);
  const managed = isManagedAppointment(event);
  const [editing, setEditing] = useState(false);
  const [newTime, setNewTime] = useState(toDatetimeLocalValue(event.start));
  const [busy, setBusy] = useState(false);

  const handleReschedule = async () => {
    if (!newTime) return;
    setBusy(true);
    onError("");
    try {
      await api.patch(`/appointments/${event.id}/reschedule`, {
        scheduled_time: new Date(newTime).toISOString(),
      });
      setEditing(false);
      await onUpdated();
      syncDashboardAction("calendar");
    } catch (e) {
      onError(e instanceof Error ? e.message : t("rescheduleFailed"));
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: t("cancelConfirm"),
      message: t("cancelMessage"),
      confirmLabel: t("cancelYes"),
      cancelLabel: t("cancelKeep"),
    });
    if (!ok) return;
    setBusy(true);
    onError("");
    try {
      await api.patch(`/appointments/${event.id}/cancel`, { reason: "Cancelled from dashboard" });
      await onUpdated();
      syncDashboardAction("calendar");
    } catch (e) {
      onError(e instanceof Error ? e.message : t("cancelFailed"));
    } finally {
      setBusy(false);
    }
  };

  const bookLeadAsAppointment = async () => {
    if (!event.start) return;
    setBusy(true);
    onError("");
    try {
      await api.post("/appointments", {
        name: event.attendeeName || event.title || "Lead",
        phone: event.attendeePhone || event.attendee || "",
        service: event.service || event.title || "Appointment",
        scheduled_time: event.start,
      });
      await onUpdated();
      syncDashboardAction("calendar");
    } catch (e) {
      onError(e instanceof Error ? e.message : t("bookFailed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="vibe-event-card rounded-xl border border-border bg-background p-3">
      <div className="flex items-start gap-3">
        <div
          className={cn(
            "w-1 min-h-[40px] rounded-full",
            EVENT_COLORS[event.type] || EVENT_COLORS.default
          )}
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium text-foreground truncate">{event.title}</p>
          {event.type === "lead" && (
            <div className="mt-2 space-y-2">
              <p className="text-[10px] text-amber-700">{t("preferredTime")}</p>
              <button
                type="button"
                className="btn-primary text-xs py-1.5 px-3"
                disabled={busy}
                onClick={() => void bookLeadAsAppointment()}
              >
                {t("bookAppointment")}
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <Clock className="w-3 h-3 text-foreground-tertiary" />
            <span className="text-xs text-foreground-secondary">
              {start.toLocaleDateString(locale)} {t("at")}{" "}
              {start.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })}
            </span>
          </div>
          {event.attendee && (
            <div className="flex items-center gap-2 mt-1">
              <User className="w-3 h-3 text-foreground-tertiary" />
              <span className="text-xs text-foreground-secondary">{event.attendee}</span>
            </div>
          )}
          {event.location && (
            <div className="flex items-center gap-2 mt-1">
              <MapPin className="w-3 h-3 text-foreground-tertiary" />
              <span className="text-xs text-foreground-secondary">{event.location}</span>
            </div>
          )}

          {managed && !editing && (
            <div className="flex flex-wrap gap-2 mt-3">
              <button
                type="button"
                className="btn-ghost text-xs inline-flex items-center gap-1 px-2 py-1"
                onClick={() => {
                  setNewTime(toDatetimeLocalValue(event.start));
                  setEditing(true);
                }}
                disabled={busy}
              >
                <CalendarClock className="w-3 h-3" />
                {t("reschedule")}
              </button>
              <button
                type="button"
                className="btn-ghost text-xs inline-flex items-center gap-1 px-2 py-1 text-red-600"
                onClick={() => void handleCancel()}
                disabled={busy}
              >
                <X className="w-3 h-3" />
                {t("cancel")}
              </button>
            </div>
          )}

          {managed && editing && (
            <div className="mt-3 space-y-2">
              <label htmlFor={`reschedule-${event.id}`} className="text-xs text-foreground-secondary block">{t("newDateTime")}</label>
              <input
                id={`reschedule-${event.id}`}
                type="datetime-local"
                className="input text-sm"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn-primary text-xs py-1.5 px-3"
                  disabled={busy}
                  onClick={() => void handleReschedule()}
                >
                  {t("save")}
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs py-1.5 px-3"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  {t("back")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
