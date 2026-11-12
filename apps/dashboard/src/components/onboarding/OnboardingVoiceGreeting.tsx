"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, Square } from "lucide-react";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import { VOICE_CHOICES } from "@/lib/onboarding-setup";

type Props = {
  voice: string;
  onVoiceChange: (voiceId: string) => void;
  greeting: string;
  onGreetingChange: (text: string) => void;
  /** The greeting we would suggest, shown as a hint and used when the box is empty. */
  suggestedGreeting: string;
  tone: string;
  agentName: string;
  rtl: boolean;
};

function stopAudio(audio: HTMLAudioElement | null) {
  if (!audio) return;
  audio.pause();
  if (audio.src.startsWith("blob:")) URL.revokeObjectURL(audio.src);
}

/** Pick a voice, edit the greeting, and hear that greeting in that voice before going live. Everything here can be changed later on the AI Agent page. */
export function OnboardingVoiceGreeting({ voice, onVoiceChange, greeting, onGreetingChange, suggestedGreeting, tone, agentName, rtl }: Props) {
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const stop = useCallback(() => {
    stopAudio(audioRef.current);
    audioRef.current = null;
    setPlaying(false);
  }, []);

  useEffect(() => () => stop(), [stop]);

  const play = async () => {
    if (playing) {
      stop();
      return;
    }
    stop();
    setError("");
    setLoading(true);
    try {
      const blob = await api.postBlob("/onboarding/voice-preview", {
        voice,
        tone,
        agentName: agentName.trim() || "Sarah",
        text: (greeting.trim() || suggestedGreeting).slice(0, 300),
      });
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => {
        setPlaying(false);
        stopAudio(audio);
        audioRef.current = null;
      };
      await audio.play();
      setPlaying(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not play the greeting");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <label className="text-sm text-foreground-secondary mb-2 block">Voice</label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {VOICE_CHOICES.map((v) => (
            <button
              key={v.id}
              type="button"
              aria-pressed={voice === v.id}
              onClick={() => onVoiceChange(v.id)}
              className={cn(
                "rounded-xl border-2 px-3 py-2 text-left transition-all",
                voice === v.id ? "border-accent bg-accent/10 ring-1 ring-accent/30" : "border-border hover:border-border-light",
              )}
            >
              <div className="text-sm font-medium">{v.name}</div>
              <div className="text-[11px] text-foreground-secondary">{v.note}</div>
            </button>
          ))}
        </div>
      </div>

      <div>
        <label htmlFor="onboarding-greeting" className="text-sm text-foreground-secondary mb-1.5 block">
          What callers hear first
        </label>
        <textarea
          id="onboarding-greeting"
          value={greeting}
          onChange={(e) => onGreetingChange(e.target.value)}
          rows={3}
          maxLength={400}
          dir={rtl ? "rtl" : "ltr"}
          className="input"
          placeholder={suggestedGreeting}
        />
        <p className="text-xs text-foreground-secondary mt-1">
          Leave it empty to use the suggestion above. The greeting says it is an AI receptionist, which builds trust.
        </p>
      </div>

      <div className="flex items-center gap-3">
        <button type="button" onClick={() => void play()} disabled={loading} className="btn-blue !px-4 !py-2 text-sm">
          {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : playing ? <Square className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          <span className="ml-2">{playing ? "Stop" : "Hear this greeting"}</span>
        </button>
        {error && <span className="text-xs text-red-600">{error}</span>}
      </div>
    </div>
  );
}
