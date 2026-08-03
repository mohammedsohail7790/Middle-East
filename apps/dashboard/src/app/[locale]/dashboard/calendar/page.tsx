"use client";

import { useCallback, useEffect, useState } from "react";
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
import { EmptyState } from "@/components/ui-kit/EmptyState";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";
import { useConfirm } from "@/components/ui-kit/ConfirmDialog";

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
  meeting: "bg-blue-500",
  follow_up: "bg-emerald-500",
  default: "bg-indigo-500",
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
  } catch {
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
      setError(e instanceof Error ? e.message : "Failed to load calendar");
    } finally {
      setLoading(false);
    }
  }, [year, month]);

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
      setError(e instanceof Error ? e.message : "Could not create test appointment");
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

  const days: (number | null)[] = [];
  for (let i = 0; i < firstDay; i++) days.push(null);
  for (let i = 1; i <= daysInMonth; i++) days.push(i);

  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];

  return (
    <DashboardPage
      title="Calendar"
      description={`Appointments booked by your AI receptionist · ${events.length} this month`}
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
          Refresh
        </button>
      }
    >
      {error && (
        <div className="dashboard-alert dashboard-alert-error mb-6">
          <p className="text-sm">{error}</p>
          <p className="text-xs mt-2 opacity-90">
            Ensure the gateway is running (npm run dev:gateway). Enable Book Appointments on the AI Agent
            page, then place a test call with a specific date and time.
          </p>
        </div>
      )}

      {!loading && events.length === 0 && !error && (
        <div className="dashboard-alert border-amber-200 bg-amber-50 dark:bg-amber-950/20 mb-6">
          <p className="text-sm text-amber-900 dark:text-amber-200 font-medium">No appointments yet</p>
          <p className="text-xs text-amber-800 dark:text-amber-300 mt-1">
            Bookings appear here after a successful call booking or when you add one below. Turn on{" "}
            <strong>Book Appointments</strong> under AI Agent.
          </p>
          <button type="button" onClick={() => void addTestAppointment()} className="btn-primary mt-3 text-sm">
            Add test appointment (2 days out)
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        className="dashboard-panel p-4 sm:p-6 lg:col-span-2 min-w-0 overflow-hidden"
        >
          <div className="flex flex-col gap-3 min-[400px]:flex-row min-[400px]:items-center min-[400px]:justify-between mb-6">
            <h2 className="text-lg font-semibold text-foreground">
              {monthNames[month]} {year}
            </h2>
            <div className="flex items-center gap-2 shrink-0">
              <button type="button" onClick={prevMonth} className="btn-ghost p-2" aria-label="Previous month">
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
                Today
              </button>
              <button type="button" onClick={nextMonth} className="btn-ghost p-2" aria-label="Next month">
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
                {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
                  <div
                    key={day}
                    className="text-center text-[10px] sm:text-xs text-foreground-tertiary py-1.5 sm:py-2 font-medium truncate px-0.5"
                  >
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-0.5 sm:gap-1">
                {days.map((day, i) => {
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
                        "min-h-[4rem] sm:min-h-[5rem] h-full p-1 sm:p-1.5 rounded-lg border text-left transition-colors min-w-0",
                        isSelected && "ring-2 ring-accent ring-offset-1",
                        isToday
                          ? "border-accent/30 bg-accent/[0.05]"
                          : "border-border hover:bg-muted/50"
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
                            +{dayEvents.length - 2} more
                          </span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="space-y-6"
        >
          {selectedDay != null && (
            <div className="dashboard-panel p-6">
              <SectionHeader
                icon={CalendarIcon}
                title={`${monthNames[month]} ${selectedDay}, ${year}`}
                size="sm"
                className="mb-4"
              />
              {selectedDayEvents.length === 0 ? (
                <p className="text-sm text-foreground-tertiary">No appointments this day</p>
              ) : (
                <div className="space-y-3">
                  {selectedDayEvents.map((event) => (
                    <EventCard key={event.id} event={event} onUpdated={loadEvents} onError={setError} confirm={confirm} />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="dashboard-panel p-6">
            <SectionHeader icon={Clock} title="Upcoming" size="sm" className="mb-4" />
            {loading ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-16 bg-gray-100 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : upcomingEvents.length === 0 ? (
              <EmptyState
                icon={CalendarIcon}
                title="No upcoming appointments"
                description="Synced calendar events will appear here once connected."
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
      onError(e instanceof Error ? e.message : "Reschedule failed");
    } finally {
      setBusy(false);
    }
  };

  const handleCancel = async () => {
    const ok = await confirm({
      title: "Cancel this appointment?",
      message: "This action cannot be undone.",
      confirmLabel: "Yes, cancel",
      cancelLabel: "Keep it",
    });
    if (!ok) return;
    setBusy(true);
    onError("");
    try {
      await api.patch(`/appointments/${event.id}/cancel`, { reason: "Cancelled from dashboard" });
      await onUpdated();
      syncDashboardAction("calendar");
    } catch (e) {
      onError(e instanceof Error ? e.message : "Cancel failed");
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
      onError(e instanceof Error ? e.message : "Could not book appointment");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-3 rounded-xl bg-background border border-border">
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
              <p className="text-[10px] text-amber-700">Preferred time — not booked yet</p>
              <button
                type="button"
                className="btn-primary text-xs py-1.5 px-3"
                disabled={busy}
                onClick={() => void bookLeadAsAppointment()}
              >
                Book appointment
              </button>
            </div>
          )}
          <div className="flex items-center gap-2 mt-1">
            <Clock className="w-3 h-3 text-foreground-tertiary" />
            <span className="text-xs text-foreground-secondary">
              {start.toLocaleDateString()} at{" "}
              {start.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
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
                Reschedule
              </button>
              <button
                type="button"
                className="btn-ghost text-xs inline-flex items-center gap-1 px-2 py-1 text-red-600"
                onClick={() => void handleCancel()}
                disabled={busy}
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
            </div>
          )}

          {managed && editing && (
            <div className="mt-3 space-y-2">
              <label htmlFor={`reschedule-${event.id}`} className="text-xs text-foreground-secondary block">New date & time</label>
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
                  Save
                </button>
                <button
                  type="button"
                  className="btn-ghost text-xs py-1.5 px-3"
                  disabled={busy}
                  onClick={() => setEditing(false)}
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
