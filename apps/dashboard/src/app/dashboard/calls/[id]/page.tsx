"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowLeft, Play, Pause, SkipBack, SkipForward,
  Tag, X, Plus, Phone, Clock, CalendarClock, Calendar,
} from "lucide-react";
import { api } from "@/lib/api";
import { cn, formatDuration, timeAgo } from "@/lib/utils";
import { useDashboardSync } from "@/lib/dashboard-sync";
import { syncDashboardAction } from "@/lib/dashboard-actions";
import {
  restoreAudio,
  snapshotAudio,
  useLiveCallDetailRefresh,
} from "@/lib/use-live-call-detail";
import { DashboardPage } from "@/components/ui-kit/DashboardPage";
import { SectionHeader } from "@/components/ui-kit/SectionHeader";
import { IconBox, ICON_STROKE, outcomeIconVariant } from "@/components/ui-kit/IconBox";
import { CallTranscript } from "@/components/calls/CallTranscript";
import { useConfirm } from "@/components/ui-kit/ConfirmDialog";

interface CallLead {
  id: string;
  name: string | null;
  phone: string | null;
  service: string | null;
  preferred_time: string | null;
  status: string | null;
}

interface CallAppointment {
  id: string;
  name: string;
  phone: string;
  service: string;
  scheduled_time: string;
  status: string;
}

interface CallDetail {
  id: string;
  call_sid: string;
  audio_url?: string | null;
  recording_url?: string | null;
  transcript: string;
  duration_ms: number;
  outcome: string | null;
  created_at: string;
  tags: string[];
  disposition?: string | null;
  agent_name?: string;
  sentiment?: string;
  lead?: CallLead | null;
  appointment?: CallAppointment | null;
  can_create_appointment?: boolean;
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function CallDetailPage() {
  const params = useParams();
  const callId = params.id as string;
  const audioRef = useRef<HTMLAudioElement>(null);
  const { confirm, confirmDialog } = useConfirm();

  const [call, setCall] = useState<CallDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [newTag, setNewTag] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [appointmentBusy, setAppointmentBusy] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [newAppointmentTime, setNewAppointmentTime] = useState("");

  const loadCall = useCallback(
    (opts?: { preservePlayback?: boolean; silent?: boolean }) => {
      const snap = opts?.preservePlayback ? snapshotAudio(audioRef.current) : null;
      if (!opts?.silent) setLoading(true);
      return api
        .get<CallDetail>(`/calls/${callId}`)
        .then((data) => {
          setCall(data);
          if (data.appointment?.scheduled_time) {
            setNewAppointmentTime(toDatetimeLocalValue(data.appointment.scheduled_time));
          } else if (data.lead?.preferred_time) {
            setNewAppointmentTime(toDatetimeLocalValue(data.lead.preferred_time));
          }
          if (opts?.preservePlayback) {
            requestAnimationFrame(() => restoreAudio(audioRef.current, snap));
          }
        })
        .finally(() => {
          if (!opts?.silent) setLoading(false);
        });
    },
    [callId]
  );

  useEffect(() => {
    void loadCall()
      .catch((e) => setError(e.message));
  }, [loadCall]);

  useDashboardSync(["calls", "calendar", "leads"], () => {
    void loadCall({ preservePlayback: true, silent: true }).catch((e) => setError(e.message));
  });

  const audioUrl = call?.audio_url || call?.recording_url || "";

  useLiveCallDetailRefresh(call?.call_sid, audioUrl, call?.outcome ?? null, (opts) => {
    void loadCall({ preservePlayback: opts?.preservePlayback ?? true, silent: true }).catch(
      (e) => setError(e.message)
    );
  });

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().catch(() => setIsPlaying(false));
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const time = Number(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = time;
      setCurrentTime(time);
    }
  };

  const skip = (seconds: number) => {
    if (audioRef.current) {
      audioRef.current.currentTime = Math.max(0, audioRef.current.currentTime + seconds);
    }
  };

  const addTag = async () => {
    if (!newTag.trim() || !call) return;
    try {
      const res = await api.post<{ tags: string[] }>(`/calls/${call.id}/tags`, { tag: newTag.trim() });
      setCall({ ...call, tags: res.tags || [...call.tags, newTag.trim()] });
      setNewTag("");
      setShowTagInput(false);
      syncDashboardAction("calls");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to add tag");
    }
  };

  const removeTag = async (tag: string) => {
    if (!call) return;
    try {
      const res = await api.del<{ tags: string[] }>(`/calls/${call.id}/tags/${encodeURIComponent(tag)}`);
      setCall({ ...call, tags: res.tags || call.tags.filter((t) => t !== tag) });
      syncDashboardAction("calls");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to remove tag");
    }
  };

  const createAppointmentFromCall = async () => {
    if (!call) return;
    setAppointmentBusy(true);
    setError("");
    try {
      const body = newAppointmentTime
        ? { scheduled_time: new Date(newAppointmentTime).toISOString() }
        : {};
      await api.post(`/calls/${call.id}/appointment`, body);
      await loadCall();
      syncDashboardAction("callDetail");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not save appointment");
    } finally {
      setAppointmentBusy(false);
    }
  };

  const rescheduleAppointment = async () => {
    if (!call?.appointment?.id || !newAppointmentTime) return;
    setAppointmentBusy(true);
    setError("");
    try {
      await api.patch(`/appointments/${call.appointment.id}/reschedule`, {
        scheduled_time: new Date(newAppointmentTime).toISOString(),
      });
      setRescheduleOpen(false);
      await loadCall();
      syncDashboardAction("callDetail");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Reschedule failed");
    } finally {
      setAppointmentBusy(false);
    }
  };

  const cancelAppointment = async () => {
    if (!call?.appointment?.id) return;
    const ok = await confirm({
      title: "Cancel this appointment?",
      message: "The appointment will be removed from your calendar. This cannot be undone.",
      confirmLabel: "Cancel appointment",
      cancelLabel: "Keep it",
    });
    if (!ok) return;
    setAppointmentBusy(true);
    setError("");
    try {
      await api.patch(`/appointments/${call.appointment.id}/cancel`, {
        reason: "Cancelled from call details",
      });
      await loadCall();
      syncDashboardAction("callDetail");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Cancel failed");
    } finally {
      setAppointmentBusy(false);
    }
  };

  const updateDisposition = async (disposition: string) => {
    if (!call) return;
    try {
      await api.post(`/calls/${call.id}/disposition`, { disposition });
      setCall({ ...call, disposition });
      syncDashboardAction("calls");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Failed to update disposition");
    }
  };

  const getOutcomeBadge = (outcome: string | null) => {
    switch (outcome) {
      case "completed":
        return <span className="badge-success" role="status">Completed</span>;
      case "failed":
        return <span className="badge-error" role="status">Failed</span>;
      case "transferred":
        return <span className="badge-warning" role="status">Transferred</span>;
      default:
        return <span className="badge-neutral" role="status">Recorded</span>;
    }
  };

  if (error && !call && !loading) {
    return (
      <DashboardPage
        title="Call details"
        description="Recording and transcript"
        maxWidth="md"
        error={error}
        toolbar={
          <Link href="/dashboard/calls" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" strokeWidth={ICON_STROKE} /> Back to calls
          </Link>
        }
      >
        <div />
      </DashboardPage>
    );
  }

  if (!call) {
    return (
      <DashboardPage title="Call details" maxWidth="md" loading={loading}>
        <div />
      </DashboardPage>
    );
  }

  return (
    <DashboardPage
      title="Call details"
      description={call.call_sid}
      maxWidth="md"
      error={error || undefined}
      actions={getOutcomeBadge(call.outcome)}
      toolbar={
          <Link href="/dashboard/calls" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="w-4 h-4" strokeWidth={ICON_STROKE} /> Back to calls
          </Link>
      }
    >
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="dashboard-panel-padded space-y-6 min-w-0">
        <div className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <IconBox icon={Phone} variant={outcomeIconVariant(call.outcome)} size="md" className="shrink-0" />
          <span className="flex items-center gap-1.5"><Clock className="size-4" strokeWidth={ICON_STROKE} />{timeAgo(call.created_at)}</span>
          <span className="flex items-center gap-1.5"><Phone className="size-4" strokeWidth={ICON_STROKE} />{formatDuration(call.duration_ms)}</span>
          {call.agent_name && <span>Agent: {call.agent_name}</span>}
          {call.lead?.id && (
            <Link
              href={`/dashboard/leads?lead=${encodeURIComponent(call.lead.id)}`}
              className="text-accent hover:underline"
            >
              View lead{call.lead.name ? `: ${call.lead.name}` : ""}
            </Link>
          )}
        </div>

        {audioUrl ? (
          <div className="space-y-3">
            <audio
              ref={audioRef}
              src={audioUrl}
              onTimeUpdate={() => setCurrentTime(audioRef.current?.currentTime || 0)}
              onLoadedMetadata={() => setDuration(audioRef.current?.duration || 0)}
              onEnded={() => setIsPlaying(false)}
            />
            <div className="flex flex-wrap items-center gap-2 sm:gap-3">
              <button type="button" onClick={() => skip(-10)} className="btn-ghost p-2 shrink-0" aria-label="Rewind 10 seconds"><SkipBack className="size-4" strokeWidth={ICON_STROKE} /></button>
              <button type="button" onClick={togglePlay} className="btn-primary p-3 rounded-full shrink-0" aria-label={isPlaying ? "Pause" : "Play"}>
                {isPlaying ? <Pause className="size-5" strokeWidth={ICON_STROKE} /> : <Play className="size-5" strokeWidth={ICON_STROKE} />}
              </button>
              <button type="button" onClick={() => skip(10)} className="btn-ghost p-2 shrink-0" aria-label="Forward 10 seconds"><SkipForward className="size-4" strokeWidth={ICON_STROKE} /></button>
              <input
                type="range"
                min={0}
                max={duration || 100}
                value={currentTime}
                onChange={handleSeek}
                className="flex-1 min-w-[8rem] w-full basis-full sm:basis-auto"
              />
            </div>
          </div>
        ) : (
          <p className="text-sm text-foreground-tertiary">Recording not available yet.</p>
        )}

        <div>
          <SectionHeader title="Transcript" size="sm" className="mb-3" />
          <CallTranscript transcript={call.transcript} agentName={call.agent_name} />
        </div>

        <div className="dashboard-panel-padded !p-4 space-y-3">
          <SectionHeader
            icon={Calendar}
            title="Appointment"
            iconVariant="accent"
            size="sm"
            actions={
              call.appointment ? (
                <Link href="/dashboard/calendar" className="text-xs text-accent hover:underline">
                  Open calendar
                </Link>
              ) : undefined
            }
          />

          {call.appointment ? (
            <>
              <div className="text-sm space-y-1">
                <p className="font-medium text-foreground">{call.appointment.name}</p>
                <p className="text-foreground-secondary">{call.appointment.service}</p>
                <p className="text-foreground-secondary flex items-center gap-1.5">
                  <Clock className="size-3.5" strokeWidth={ICON_STROKE} />
                  {new Date(call.appointment.scheduled_time).toLocaleString()}
                </p>
                {call.appointment.phone && (
                  <p className="text-foreground-secondary flex items-center gap-1.5">
                    <Phone className="size-3.5" strokeWidth={ICON_STROKE} />
                    {call.appointment.phone}
                  </p>
                )}
              </div>
              {!rescheduleOpen ? (
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-ghost text-xs inline-flex items-center gap-1 px-2 py-1"
                    disabled={appointmentBusy}
                    onClick={() => setRescheduleOpen(true)}
                  >
                    <CalendarClock className="size-3" strokeWidth={ICON_STROKE} />
                    Reschedule
                  </button>
                  <button
                    type="button"
                    className="btn-ghost text-xs inline-flex items-center gap-1 px-2 py-1 text-red-600"
                    disabled={appointmentBusy}
                    onClick={() => void cancelAppointment()}
                  >
                    <X className="size-3" strokeWidth={ICON_STROKE} />
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  <label className="text-xs text-foreground-secondary block">New date & time</label>
                  <input
                    type="datetime-local"
                    className="input text-sm"
                    value={newAppointmentTime}
                    onChange={(e) => setNewAppointmentTime(e.target.value)}
                  />
                  <div className="flex gap-2">
                    <button
                      type="button"
                      className="btn-primary text-xs py-1.5 px-3"
                      disabled={appointmentBusy}
                      onClick={() => void rescheduleAppointment()}
                    >
                      Save
                    </button>
                    <button
                      type="button"
                      className="btn-ghost text-xs py-1.5 px-3"
                      disabled={appointmentBusy}
                      onClick={() => setRescheduleOpen(false)}
                    >
                      Back
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : call.can_create_appointment || call.lead ? (
            <>
              <p className="text-sm text-foreground-secondary">
                This call discussed booking
                {call.lead?.name ? ` for ${call.lead.name}` : ""}, but no calendar entry exists yet.
                {call.lead?.preferred_time
                  ? ` Lead preferred time: ${new Date(call.lead.preferred_time).toLocaleString()}.`
                  : " Save with a time below (defaults to next available slot)."}
              </p>
              <label className="text-xs text-foreground-secondary block">Appointment time</label>
              <input
                type="datetime-local"
                className="input w-full text-sm"
                value={newAppointmentTime}
                onChange={(e) => setNewAppointmentTime(e.target.value)}
              />
              <button
                type="button"
                className="btn-primary text-xs py-2 px-4"
                disabled={appointmentBusy}
                onClick={() => void createAppointmentFromCall()}
              >
                Save to calendar
              </button>
            </>
          ) : (
            <p className="text-sm text-foreground-tertiary">
              No lead or appointment linked to this call yet.
            </p>
          )}
        </div>

        <div>
          <SectionHeader
            icon={Tag}
            title="Tags"
            iconVariant="muted"
            size="sm"
            className="mb-2"
            actions={
              <button type="button" onClick={() => setShowTagInput(!showTagInput)} className="text-xs text-accent inline-flex items-center gap-1">
                <Plus className="size-3" strokeWidth={ICON_STROKE} /> Add
              </button>
            }
          />
          {showTagInput && (
            <div className="flex gap-2 mb-2">
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    void addTag();
                  }
                }}
                className="input flex-1 text-sm"
                placeholder="Tag name"
                aria-label="New tag name"
              />
              <button type="button" onClick={addTag} className="btn-primary text-xs px-3">Add</button>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            {(call.tags || []).map((tag) => (
              <span key={tag} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-background-elevated text-xs">
                {tag}
                <button type="button" onClick={() => removeTag(tag)} aria-label={`Remove tag ${tag}`}><X className="size-3" strokeWidth={ICON_STROKE} /></button>
              </span>
            ))}
          </div>
        </div>

        <div>
          <SectionHeader title="Disposition" iconVariant="neutral" size="sm" className="mb-2" />
          <div className="flex flex-wrap gap-2">
            {["booked", "callback", "not_interested", "voicemail"].map((d) => (
              <button
                key={d}
                type="button"
                onClick={() => updateDisposition(d)}
                aria-pressed={call.disposition === d}
                className={cn(
                  "px-3 py-1.5 rounded-lg text-xs border",
                  call.disposition === d ? "border-accent bg-accent/10" : "border-border"
                )}
              >
                {d.replace("_", " ")}
              </button>
            ))}
          </div>
        </div>
      </motion.div>
      {confirmDialog}
    </DashboardPage>
  );
}
