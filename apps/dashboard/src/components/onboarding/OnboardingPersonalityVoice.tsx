"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, Square, Volume2 } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

export type OnboardingTone = {
  id: string;
  label: string;
  desc: string;
};

type Props = {
  tones: OnboardingTone[];
  tone: string;
  agentName: string;
  onToneChange: (toneId: string) => void;
};

function stopAudio(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.pause();
  if (audio.src.startsWith("blob:")) {
    URL.revokeObjectURL(audio.src);
  }
}

export function OnboardingPersonalityVoice({
  tones,
  tone,
  agentName,
  onToneChange,
}: Props) {
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stopPlayback = useCallback(() => {
    stopAudio(audioRef.current);
    audioRef.current = null;
    setPlayingId(null);
  }, []);

  useEffect(() => () => stopPlayback(), [stopPlayback]);

  const playTone = async (toneId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    e?.preventDefault();

    if (playingId === toneId) {
      stopPlayback();
      return;
    }

    stopPlayback();
    setError("");
    setLoadingId(toneId);

    try {
      const blob = await api.postBlob("/onboarding/voice-preview", {
        tone: toneId,
        agentName: agentName.trim() || "Sarah",
      });
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => {
        setPlayingId(null);
        stopAudio(audio);
        audioRef.current = null;
      };
      await audio.play();
      setPlayingId(toneId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not play voice sample");
    } finally {
      setLoadingId(null);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-foreground-tertiary leading-relaxed">
        Tap <strong>Play</strong> on each personality to hear how your receptionist will sound.
        You can change personality, voice, and greeting anytime on the{" "}
        <strong>AI Agent</strong> page in your dashboard.
      </p>

      {error && (
        <p className="text-xs text-red-600" role="alert">
          {error}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3">
        {tones.map((t) => {
          const selected = tone === t.id;
          const isPlaying = playingId === t.id;
          const isLoading = loadingId === t.id;

          return (
            <div
              key={t.id}
              className={cn(
                "rounded-xl border-2 p-3 transition-all text-left",
                selected ? "border-accent bg-accent/10" : "border-border"
              )}
            >
              <button
                type="button"
                onClick={() => onToneChange(t.id)}
                className="w-full text-left"
              >
                <div className="text-sm font-medium">{t.label}</div>
                <div className="text-xs text-foreground-tertiary mt-0.5">{t.desc}</div>
              </button>
              <button
                type="button"
                onClick={(e) => void playTone(t.id, e)}
                disabled={!!loadingId && loadingId !== t.id}
                className={cn(
                  "mt-2 inline-flex items-center gap-1.5 text-xs font-medium rounded-lg px-2.5 py-1.5 transition-colors",
                  isPlaying
                    ? "bg-accent text-white"
                    : "bg-background-hover text-foreground-secondary hover:text-accent"
                )}
                aria-label={`Play ${t.label} voice sample`}
              >
                {isLoading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : isPlaying ? (
                  <Square className="w-3.5 h-3.5" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                {isLoading ? "Loading…" : isPlaying ? "Stop" : "Play sample"}
              </button>
            </div>
          );
        })}
      </div>

      <div className="rounded-xl border border-border bg-background-hover/60 p-4 space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-foreground">
          <Volume2 className="w-4 h-4 text-accent" />
          Test selected personality
        </div>
        <p className="text-xs text-foreground-tertiary">
          Hear <strong>{agentName.trim() || "your agent"}</strong> with the{" "}
          <strong className="capitalize">{tone}</strong> tone you selected.
        </p>
        <button
          type="button"
          className="btn-secondary text-sm !py-2"
          disabled={!!loadingId}
          onClick={() => void playTone(tone)}
        >
          {loadingId === tone && playingId !== tone ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" /> Loading…
            </>
          ) : playingId === tone ? (
            <>
              <Square className="w-4 h-4" /> Stop preview
            </>
          ) : (
            <>
              <Play className="w-4 h-4" /> Play live preview
            </>
          )}
        </button>
      </div>
    </div>
  );
}
