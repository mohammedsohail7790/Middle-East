import Link from "next/link";
import { cn } from "@/lib/utils";

type HallaAiLogoProps = {
  href?: string;
  /** Mark only (square tile) */
  iconOnly?: boolean;
  /** Show tagline under the wordmark */
  showTagline?: boolean;
  /** Center the lockup (onboarding, auth pages) */
  centered?: boolean;
  /** sm | md | lg | sidebar (dashboard nav) */
  size?: "sm" | "md" | "lg" | "sidebar";
  /** Use light text, for placement on a dark band */
  tone?: "default" | "light";
  className?: string;
  /** Override the Link component (e.g. the locale-aware Link for dashboard usage). Defaults to plain next/link. */
  linkAs?: React.ElementType;
};

const SIZES = {
  sm: { tile: 28, glyph: 14, text: "text-[16px]" },
  md: { tile: 32, glyph: 16, text: "text-[18px]" },
  lg: { tile: 36, glyph: 18, text: "text-[20px]" },
  sidebar: { tile: 32, glyph: 16, text: "text-[18px]" },
};

/** The Halla mark: a rounded graphite tile with a bold "H" whose crossbar is the action blue. */
export function HallaAiTile({ size = 32, className }: { size?: number; className?: string }) {
  const glyph = Math.round(size * 0.5);
  return (
    <span
      aria-hidden="true"
      className={cn("inline-flex shrink-0 items-center justify-center rounded-[28%] bg-[#1d1d1f] text-white dark:bg-[#f5f5f7] dark:text-[#1d1d1f]", className)}
      style={{ width: size, height: size }}
    >
      <svg width={glyph} height={glyph} viewBox="0 0 16 16" fill="none">
        <path d="M3.5 2.5v11M12.5 2.5v11" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <path d="M3.5 8h9" stroke="#2997FF" strokeWidth="2.2" strokeLinecap="round" />
      </svg>
    </span>
  );
}

export function HallaAiLogo({
  href = "/",
  iconOnly = false,
  showTagline = false,
  centered = false,
  size = "md",
  tone = "default",
  className,
  linkAs,
}: HallaAiLogoProps) {
  const s = SIZES[size];

  const content = iconOnly ? (
    <HallaAiTile size={s.tile} />
  ) : (
    <span className={cn("inline-flex flex-col", centered ? "items-center text-center" : "items-start")}>
      <span className="inline-flex items-center gap-2.5">
        <HallaAiTile size={s.tile} className={tone === "light" ? "!bg-white !text-[#1d1d1f]" : undefined} />
        <span className={cn("font-semibold leading-none tracking-[-0.02em]", s.text, tone === "light" ? "text-white" : "text-foreground")}>
          Halla <span className={tone === "light" ? "text-white/70" : "text-muted-foreground"}>AI</span>
        </span>
      </span>
      {showTagline && (
        <span className="mt-1.5 text-[11px] tracking-wide text-muted-foreground">Smart · Seamless · Always</span>
      )}
    </span>
  );

  const wrapperClass = cn("inline-flex shrink-0 items-center", centered && "justify-center");

  if (href) {
    const LinkComponent = linkAs ?? Link;
    return (
      <LinkComponent href={href} aria-label="Halla AI" className={cn(wrapperClass, className)}>
        {content}
      </LinkComponent>
    );
  }

  return <div className={cn(wrapperClass, className)}>{content}</div>;
}

/** Compact mark: tile + "Halla AI" text. */
export function HallaAiMark({
  className,
  href = "/",
  linkAs,
}: {
  className?: string;
  href?: string;
  linkAs?: React.ElementType;
}) {
  return <HallaAiLogo href={href} linkAs={linkAs} size="md" className={className} />;
}
