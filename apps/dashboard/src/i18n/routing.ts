import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "ar", "hi", "ru"],
  defaultLocale: "en",
  localePrefix: "as-needed",
});
