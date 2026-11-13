import en from "@/messages/en.json";

/** Test helper: next-intl replaced by the real English messages, so tests read like the screen. */
function lookup(path: string): string | undefined {
  const parts = path.split(".");
  const key = parts.pop() as string;
  let cur: unknown = en;
  for (const part of parts) {
    if (cur && typeof cur === "object" && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  const v = (cur as Record<string, unknown> | undefined)?.[key];
  return typeof v === "string" ? v : undefined;
}

const cache = new Map<string, unknown>();

function make(ns: string) {
  const t = (key: string, params?: Record<string, string | number>) => {
    const msg = lookup(`${ns}.${key}`) ?? `${ns}.${key}`;
    return msg.replace(/\{(\w+)\}/g, (_, k: string) => String(params?.[k] ?? `{${k}}`));
  };
  t.has = (key: string) => lookup(`${ns}.${key}`) !== undefined;
  return t;
}

export const intlMock = {
  useLocale: () => "en",
  useTranslations: (ns: string) => {
    if (!cache.has(ns)) cache.set(ns, make(ns));
    return cache.get(ns) as ReturnType<typeof make>;
  },
};
