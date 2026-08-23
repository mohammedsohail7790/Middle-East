import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ar", "hi", "ru"],
  defaultLocale: "en",
  // "always": the custom auth middleware (src/middleware.ts) doesn't run
  // next-intl's own middleware, so there's nothing to invisibly rewrite a
  // bare default-locale path (e.g. "/dashboard/leads") to its real
  // [locale]-prefixed route. "as-needed" generated exactly those bare
  // paths for the default locale via Link/useRouter, which 404'd since no
  // page exists at the bare path. "always" makes every generated link
  // include the locale segment, matching the real routes that exist.
  localePrefix: "always",
});
