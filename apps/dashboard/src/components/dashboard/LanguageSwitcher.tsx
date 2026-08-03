"use client";

import { Globe } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/navigation";
import { ICON_STROKE } from "@/components/ui-kit/IconBox";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const locale = useLocale();
  const t = useTranslations("shell");
  const pathname = usePathname();
  const router = useRouter();

  const nextLocale = locale === "ar" ? "en" : "ar";

  return (
    <button
      type="button"
      onClick={() => router.replace(pathname, { locale: nextLocale })}
      className="inline-flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-lg hover:bg-background-hover"
      aria-label={t("language")}
    >
      <Globe className="size-4" strokeWidth={ICON_STROKE} />
      <span className={cn(locale === "ar" && "font-arabic")}>
        {nextLocale === "ar" ? t("arabic") : t("english")}
      </span>
    </button>
  );
}
