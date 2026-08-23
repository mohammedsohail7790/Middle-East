"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight, Play } from "lucide-react";

type Props = {
  screenshots?: string[];
  videoUrl?: string;
  helpSteps?: string[];
  /** Which step caption to highlight (defaults to carousel index). */
  activeStepIndex?: number;
};

type ImgState = "loading" | "ok" | "error";

function toEmbedUrl(url: string): string {
  const yt = url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/)([^&\s]+)/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}?rel=0`;
  const loom = url.match(/loom\.com\/share\/([^?\s]+)/);
  if (loom) return `https://www.loom.com/embed/${loom[1]}`;
  return url;
}

const isIframeUrl = (url: string) =>
  url.includes("youtube") || url.includes("youtu.be") || url.includes("loom.com");

export function IntegrationSetupMedia({
  screenshots,
  videoUrl,
  helpSteps,
  activeStepIndex,
}: Props) {
  const [imgIdx, setImgIdx] = useState(activeStepIndex ?? 0);
  const [videoOpen, setVideoOpen] = useState(false);
  const [imgStates, setImgStates] = useState<Record<number, ImgState>>({});

  useEffect(() => {
    if (activeStepIndex !== undefined && screenshots?.length) {
      setImgIdx(Math.min(activeStepIndex, screenshots.length - 1));
    }
  }, [activeStepIndex, screenshots?.length]);

  const setImgState = (i: number, s: ImgState) =>
    setImgStates((prev) => ({ ...prev, [i]: s }));

  const loadedScreenshots = (screenshots ?? []).filter((_, i) => imgStates[i] !== "error");
  const hasScreenshots = !!screenshots?.length;
  const safeImgIdx = hasScreenshots ? Math.min(imgIdx, screenshots!.length - 1) : 0;
  const captionIndex = activeStepIndex !== undefined
    ? Math.min(activeStepIndex, Math.max((helpSteps?.length ?? screenshots?.length ?? 1) - 1, 0))
    : safeImgIdx;
  const stepTotal = Math.max(screenshots?.length ?? 0, helpSteps?.length ?? 0, 1);
  const currentCaption = helpSteps?.[captionIndex];
  const showTextGuide = !hasScreenshots && !!helpSteps?.length;

  if (!hasScreenshots && !videoUrl && !showTextGuide) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-3">
      {videoUrl && (
        <div>
          {!videoOpen ? (
            <button
              type="button"
              onClick={() => setVideoOpen(true)}
              className="flex items-center gap-2 text-sm font-medium text-accent hover:opacity-80 w-full"
            >
              <span className="inline-flex items-center justify-center size-7 rounded-full bg-accent/10 shrink-0">
                <Play className="size-3.5 fill-current text-accent" />
              </span>
              Watch 30-second setup guide
            </button>
          ) : isIframeUrl(videoUrl) ? (
            <div className="relative w-full rounded-lg overflow-hidden" style={{ paddingBottom: "56.25%" }}>
              <iframe
                src={toEmbedUrl(videoUrl)}
                className="absolute inset-0 w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
                title="Setup guide"
              />
            </div>
          ) : (
            <video src={videoUrl} controls className="w-full rounded-lg" />
          )}
        </div>
      )}

      {showTextGuide && (
        <ol className="text-xs text-muted-foreground space-y-2 list-none">
          {helpSteps!.map((step, i) => (
            <li key={step} className="flex gap-2">
              <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-accent text-[10px] font-semibold">
                {i + 1}
              </span>
              <span className="pt-0.5">{step}</span>
            </li>
          ))}
        </ol>
      )}

      {!!screenshots?.length && loadedScreenshots.length > 0 && (
        <div className="space-y-2">
          <div className="relative rounded-md overflow-hidden bg-muted">
            <Image
              src={screenshots[safeImgIdx]}
              alt={`Setup step ${safeImgIdx + 1}`}
              width={800}
              height={208}
              unoptimized
              className="w-full object-contain max-h-52 h-auto"
              onLoad={() => setImgState(safeImgIdx, "ok")}
              onError={() => setImgState(safeImgIdx, "error")}
            />
            {/* preload remaining images silently */}
            {screenshots.map((src, i) =>
              i !== safeImgIdx ? (
                <Image
                  key={src}
                  src={src}
                  alt=""
                  width={1}
                  height={1}
                  unoptimized
                  className="hidden"
                  onLoad={() => setImgState(i, "ok")}
                  onError={() => setImgState(i, "error")}
                />
              ) : null
            )}
            {loadedScreenshots.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous"
                  className="absolute left-1 top-1/2 -translate-y-1/2 size-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-background transition-colors"
                  onClick={() => setImgIdx((i) => (i - 1 + screenshots.length) % screenshots.length)}
                >
                  <ChevronLeft className="size-3.5" />
                </button>
                <button
                  type="button"
                  aria-label="Next"
                  className="absolute right-1 top-1/2 -translate-y-1/2 size-6 rounded-full bg-background/80 flex items-center justify-center hover:bg-background transition-colors"
                  onClick={() => setImgIdx((i) => (i + 1) % screenshots.length)}
                >
                  <ChevronRight className="size-3.5" />
                </button>
              </>
            )}
          </div>
          {loadedScreenshots.length > 1 && (
            <div className="flex items-center justify-center gap-1.5">
              {loadedScreenshots.map((_, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`Screenshot ${i + 1}`}
                  onClick={() => setImgIdx(i)}
                  className={`size-1.5 rounded-full transition-colors ${i === safeImgIdx ? "bg-accent" : "bg-border hover:bg-muted-foreground/40"}`}
                />
              ))}
            </div>
          )}
          <p className="text-[10px] text-muted-foreground text-center">
            Step {captionIndex + 1} of {stepTotal}
          </p>
          {currentCaption && (
            <p className="text-sm font-medium text-center text-foreground leading-snug px-1">
              {currentCaption}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
