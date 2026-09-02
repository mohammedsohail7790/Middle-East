import Image from "next/image";
import Link from "next/link";
import { cn } from "@/lib/utils";

type HallaAiLogoProps = {
  href?: string;
  /** Icon only (square) */
  iconOnly?: boolean;
  /** Show tagline under wordmark */
  showTagline?: boolean;
  /** Center logo + tagline (e.g. onboarding, auth pages) */
  centered?: boolean;
  /** sm | md | lg | sidebar (dashboard nav) */
  size?: "sm" | "md" | "lg" | "sidebar";
  className?: string;
  /** Override the Link component (e.g. the locale-aware Link for dashboard usage). Defaults to plain next/link. */
  linkAs?: React.ElementType;
};

const SIZES = {
  sm: { icon: 40, wordmark: 132, height: 44 },
  md: { icon: 48, wordmark: 168, height: 52 },
  lg: { icon: 64, wordmark: 220, height: 72 },
  sidebar: { icon: 90, wordmark: 236, height: 90 },
};

export function HallaAiLogo({
  href = "/",
  iconOnly = false,
  showTagline = false,
  centered = false,
  size = "md",
  className,
  linkAs,
}: HallaAiLogoProps) {
  const s = SIZES[size];

  const content = iconOnly ? (
    <Image
      src="/logo-receptionist-nav.jpg"
      alt="Halla AI — AI Receptionist"
      width={s.icon}
      height={s.icon}
      className="object-contain mx-auto size-full max-h-10 max-w-10 rounded-md"
      priority
    />
  ) : (
    <div
      className={cn(
        "flex flex-col gap-0.5",
        centered ? "items-center text-center" : "items-start",
        className
      )}
    >
      <Image
        src="/logo-receptionist-nav.jpg"
        alt="Halla AI — AI Receptionist"
        width={s.wordmark}
        height={s.height}
        className={cn(
          "object-contain h-auto w-auto max-h-[var(--logo-h)] rounded-md",
          centered ? "object-center mx-auto" : "object-left"
        )}
        style={{ "--logo-h": `${s.height}px` } as React.CSSProperties}
        priority
      />
      {showTagline && (
        <p
          className={cn(
            "text-[10px] sm:text-xs text-muted-foreground tracking-wide",
            !centered && "pl-0.5"
          )}
        >
          Smart <span className="text-[var(--cyan)]">•</span> Seamless{" "}
          <span className="text-[var(--cyan)]">•</span> Always
        </p>
      )}
    </div>
  );

  const wrapperClass = cn(
    "inline-flex shrink-0",
    centered ? "flex-col items-center justify-center w-full" : "items-center"
  );

  if (href) {
    const LinkComponent = linkAs ?? Link;
    return (
      <LinkComponent href={href} className={cn(wrapperClass, className)}>
        {content}
      </LinkComponent>
    );
  }

  return <div className={cn(wrapperClass, className)}>{content}</div>;
}

/** Compact mark: icon + Halla<span className="text-accent">AI</span> text */
export function HallaAiMark({
  className,
  href = "/",
  linkAs,
}: {
  className?: string;
  href?: string;
  linkAs?: React.ElementType;
}) {
  const inner = (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <Image src="/logo-receptionist-nav.jpg" alt="" width={44} height={44} className="h-11 w-11 rounded-lg object-contain" />
      <span className="font-bold text-lg tracking-tight text-foreground leading-none">
        Halla<span className="text-[var(--gold)]">AI</span>
      </span>
    </span>
  );
  if (href) {
    const LinkComponent = linkAs ?? Link;
    return <LinkComponent href={href}>{inner}</LinkComponent>;
  }
  return inner;
}
