"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Play, Square } from "lucide-react";
import { api } from "@/lib/api";
import { normalizeAIConfig, type DashboardAIConfigShape } from "@/lib/gateway-adapters";
import { subscribeAIConfigUpdates } from "@/lib/realtime";
import { useDashboardSync } from "@/lib/dashboard-sync";

interface VoicePreviewPanelProps {
  config: DashboardAIConfigShape | null;
}

export function VoicePreviewPanel({ config: parentConfig }: VoicePreviewPanelProps) {
  const [config, setConfig] = useState<DashboardAIConfigShape | null>(parentConfig);
  const [loading, setLoading] = useState(!parentConfig);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState("");
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    setConfig(parentConfig);
    if (parentConfig) setLoading(false);
  }, [parentConfig]);

  const reloadConfig = useCallback(() => {
    return api
      .get<DashboardAIConfigShape>("/ai-config")
      .then((data) => setConfig(normalizeAIConfig(data)))
      .catch((e: unknown) => {
        setError(e instanceof Error ? e.message : "Could not load agent settings");
      });
  }, []);

  useEffect(() => {
    if (!parentConfig) {
      setLoading(true);
      void reloadConfig().finally(() => setLoading(false));
    }
  }, [parentConfig, reloadConfig]);

  useDashboardSync(["config", "settings"], () => {
    void reloadConfig();
  });

  useEffect(() => {
    return subscribeAIConfigUpdates((remote) => {
      setConfig(normalizeAIConfig(remote as DashboardAIConfigShape));
    });
  }, []);

  const preview = async () => {
    if (!config) return;
    setError("");
    setPlaying(true);
    const lang = config.language || "en";
    const greeting = config.greetingMessage?.trim();
    try {
      const blob = await api.postVoicePreview({
        voice: config.voice,
        language: lang,
        agentName: config.agentName,
        ...(greeting ? { text: greeting } : {}),
      });
      if (audioRef.current) {
        URL.revokeObjectURL(audioRef.current.src);
      }
      const audio = new Audio(URL.createObjectURL(blob));
      audioRef.current = audio;
      audio.onended = () => setPlaying(false);
      await audio.play();
    } catch (e: unknown) {
      setPlaying(false);
      setError(e instanceof Error ? e.message : "Voice preview failed");
    }
  };

  const stop = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      URL.revokeObjectURL(audioRef.current.src);
      audioRef.current = null;
    }
    speechSynthesis.cancel();
    setPlaying(false);
  };

  if (loading) {
    return (
      <div className="card p-6 max-w-xl space-y-3">
        <div className="h-4 w-3/4 bg-muted animate-pulse rounded" />
        <div className="h-20 bg-muted animate-pulse rounded-xl" />
      </div>
    );
  }

  if (!config) {
    return (
      <div className="card p-6 max-w-xl space-y-3">
        <p className="text-sm text-foreground-secondary">
          {error || "Could not load agent settings. Save your configuration above or retry."}
        </p>
        <button type="button" className="btn-primary" onClick={() => void reloadConfig()}>
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="card p-6 space-y-4 max-w-xl">
      <p className="text-sm text-foreground-secondary">
        Hear a sample in your selected language (OpenAI TTS). Updates automatically when you or a teammate
        saves agent settings on another tab.
      </p>
      {error && <p className="text-red-600 text-sm">{error}</p>}
      <div className="rounded-xl border border-border bg-muted p-4 text-sm text-foreground-secondary">
        <p className="font-medium text-foreground mb-1">{config.agentName}</p>
        <p className="line-clamp-4">
          {config.greetingMessage?.trim() ||
            `Thanks for calling. This is ${config.agentName}. How can I help you today?`}
        </p>
        <p className="text-xs text-foreground-tertiary mt-2">
          Voice: {config.voice} · Language: {config.language}
        </p>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={preview} disabled={playing} className="btn-primary">
          <Play className="w-4 h-4" /> {playing ? "Playing..." : "Play preview"}
        </button>
        <button type="button" onClick={stop} className="btn-ghost">
          <Square className="w-4 h-4" /> Stop
        </button>
      </div>
      <p className="text-[10px] text-foreground-tertiary flex items-center gap-1">
        <Mic className="w-3 h-3" /> Live sync via workspace push and AI config WebSocket.
      </p>
    </div>
  );
}
