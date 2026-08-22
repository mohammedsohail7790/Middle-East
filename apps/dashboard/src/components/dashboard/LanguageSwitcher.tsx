"use client";

import { useState, useRef, useEffect } from "react";
import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { cn } from "@/lib/utils";

const LOCALES = ["en", "ar", "hi", "ru"] as const;
type Locale = (typeof LOCALES)[number];

export function LanguageSwitcher() {
  const locale = useLocale() as Locale;
  const t = useTranslations("shell");
  const pathname = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const labelFor: Record<Locale, string> = {
    en: t("english"),
    ar: t("arabic"),
    hi: t("hindi"),
    ru: t("russian"),
  };

  function select(next: Locale) {
    setOpen(false);
    router.replace(pathname, { locale: next });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-background-hover"
        aria-label={t("language")}
        aria-expanded={open}
      >
        <Globe className="size-4" strokeWidth={ICON_STROKE} />
        <span className={cn(locale === "ar" && "font-arabic")}>{labelFor[locale]}</span>
      </button>
      {open && (
        <div className="absolute end-0 mt-1 min-w-[140px] rounded-lg border border-border bg-background shadow-lg py-1 z-50">
          {LOCALES.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => select(l)}
              className={cn(
                "w-full text-start px-3 py-1.5 text-sm hover:bg-background-hover transition-colors",
                l === "ar" && "font-arabic",
                l === locale ? "text-foreground font-medium" : "text-muted-foreground"
              )}
            >
              {labelFor[l]}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
