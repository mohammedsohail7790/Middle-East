"use client";

import { useEffect, useRef } from "react";
import { useDashboardLive } from "@/components/dashboard/DashboardRealtimeProvider";

type AudioSnapshot = {
  url: string;
  time: number;
  playing: boolean;
};

/**
 * While a call is live or waiting for a recording URL, poll without disrupting playback.
 */
export function useLiveCallDetailRefresh(
  callSid: string | undefined,
  audioUrl: string | undefined,
  outcome: string | null | undefined,
  refresh: (opts?: { preservePlayback?: boolean }) => void | Promise<void>
) {
  const { live } = useDashboardLive();
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  const isLive = Boolean(
    callSid && live?.liveCalls?.some((c) => c.callSid === callSid)
  );
  const waitingForRecording = Boolean(callSid && !audioUrl && outcome !== "failed");

  useEffect(() => {
    if (!isLive && !waitingForRecording) return;
    const tick = () => void refreshRef.current({ preservePlayback: true });
    tick();
    const id = setInterval(tick, 2000);
    return () => clearInterval(id);
  }, [isLive, waitingForRecording, callSid]);
}

export function snapshotAudio(el: HTMLAudioElement | null): AudioSnapshot | null {
  if (!el) return null;
  return {
    url: el.src,
    time: el.currentTime,
    playing: !el.paused,
  };
}

export function restoreAudio(el: HTMLAudioElement | null, snap: AudioSnapshot | null) {
  if (!el || !snap || !snap.url) return;
  if (el.src !== snap.url) el.src = snap.url;
  if (Math.abs(el.currentTime - snap.time) > 0.5) {
    el.currentTime = snap.time;
  }
  if (snap.playing) {
    void el.play().catch(() => {});
  }
}
