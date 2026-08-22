# Multilingual support: English, Saudi Arabic, Hindi, Russian

Date: 2026-08-22

## Goal

Support exactly four languages — English, Arabic (Saudi colloquial), Hindi, Russian —
across three surfaces:

1. The AI voice agent (what it speaks on live calls)
2. The dashboard app UI (nav, buttons, settings — post-login)
3. The public marketing landing page (full page copy)

Spanish, French, and Mandarin are removed from the voice agent's language options.

## Current state / bugs found

- `apps/gateway/src/config/plan-config.ts` already declares the correct canonical
  language set: `SUPPORTED_LANGUAGES = [ar-SA, en, hi, ru]`. This is correct and
  needs no change.
- **Bug:** `apps/gateway/src/services/realtime/receptionist-voice.ts` has its own
  `LANGUAGE_NAMES` map used to build the live system prompt, and it does NOT
  include `ar` — it has `es/fr/zh` instead. Since `resolveLanguageCode()` falls
  back to `'en'` for any code not in `LANGUAGE_NAMES`, a tenant configured for
  Arabic (`ar-SA` → truncated to `ar`) silently gets an English-speaking agent.
  This is broken today, not a new feature.
- `apps/dashboard/src/lib/agent-languages.ts` (dashboard language picker) has the
  same stale list: `en, es, fr, ru, zh, hi` — no `ar`.
- Dashboard/marketing UI locale routing (`next-intl`) only supports `en`/`ar`,
  69 translation keys.
- The public marketing landing page (root `index.html` / `halla_styles.css` /
  `halla_main.js`, gitignored locally, synced by
  `scripts/sync-halla-marketing.mjs` into `Marketing site/` and
  `apps/dashboard/public/`) uses a **binary** `lang-en`/`lang-ar` span toggle
  keyed off the `dir` (rtl/ltr) attribute. This can't distinguish `hi`/`ru` from
  `en` since all three are LTR — must be reworked to key off `lang` instead.
- `halla_preview.html` (also root-level, synced verbatim, not referenced by any
  app route — appears to be a design-review artifact) carries the same 45
  lang-span pairs as `index.html` and should be translated identically for
  consistency, even though nothing currently serves it to users.

## Design

### 1. Voice agent (gateway)

`apps/gateway/src/services/realtime/receptionist-voice.ts`:

- `LANGUAGE_NAMES`: `{ en: 'English', ar: 'Arabic', hi: 'Hindi', ru: 'Russian' }`
  (drop `es`/`fr`/`zh`).
- Add an Arabic branch to `buildHumanRealtimePreamble`, `buildGreetingDeliveryHint`,
  and `buildReceptionistRoleBlock` that explicitly instructs **Saudi colloquial
  dialect** (خليجي/Saudi, informal, local phrasing) rather than generic "Arabic"
  or formal MSA — mirroring how the English branch specifies "NYC phone manner."
- `PREVIEW_GREETING_BY_LANG`: replace the `es`/`fr`/`zh` entries with an `ar`
  entry (Saudi-dialect greeting text); keep the existing `hi`/`ru` entries as-is.

`apps/dashboard/src/lib/agent-languages.ts`:

- Replace the list with exactly: Arabic (🇸🇦, Saudi flag — not the generic Arabic
  League flag, to signal dialect), English, Hindi, Russian. Order: Arabic first
  per the gateway config comment ("Saudi Arabic first (primary market)"), then
  English, Hindi, Russian — matching `plan-config.ts` ordering.

No change needed to `plan-config.ts`, `ai-config.dto.ts`, or `realtime.gateway.ts`
— they already reference the canonical list correctly; only the two drifted
lists above need fixing.

### 2. Dashboard app UI (next-intl)

- `apps/dashboard/src/i18n/routing.ts`: `locales: ["en", "ar", "hi", "ru"]`.
- Add `src/messages/hi.json` and `src/messages/ru.json`, translating all 69 keys
  from `en.json`. Formal/standard register (not Saudi slang) per prior decision
  — matches how `ar.json` should also read (formal written Arabic, not
  colloquial, since it's UI chrome). Best-effort translation, not professionally
  reviewed.
- `apps/dashboard/src/app/[locale]/layout.tsx`: no logic change — `dir` stays
  `rtl` only for `ar`, `ltr` for everything else (already correct once `hi`/`ru`
  are valid locales).
- Fonts: add Noto Sans Devanagari (Google Font) for Hindi glyph coverage, and
  add the `cyrillic` subset to the existing Inter font config for Russian.
- `apps/dashboard/src/components/dashboard/LanguageSwitcher.tsx`: replace the
  binary toggle button with a 4-item dropdown (Globe icon trigger; menu items
  EN / العربية / हिन्दी / Русский). Add corresponding `shell.hindi` /
  `shell.russian` keys (and keep `shell.arabic`/`shell.english`) to all four
  message files.

### 3. Public marketing landing page

Source of truth: root-level `index.html`, `halla_preview.html`,
`halla_styles.css`, `halla_main.js` (gitignored locally). Edit these, then run
`node scripts/sync-halla-marketing.mjs` to publish into `Marketing site/` and
`apps/dashboard/public/`.

**CSS/JS scheme rework** (`halla_styles.css`, `halla_main.js`):
Replace the `dir`-keyed binary show/hide rules with `lang`-keyed rules that
support 4 languages:

```css
.lang-en, .lang-ar, .lang-hi, .lang-ru { display: none; }
html[lang="en"] .lang-en, [lang="en"] .lang-en { display: inline; }
html[lang="ar"] .lang-ar, [lang="ar"] .lang-ar { display: inline; }
html[lang="hi"] .lang-hi, [lang="hi"] .lang-hi { display: inline; }
html[lang="ru"] .lang-ru, [lang="ru"] .lang-ru { display: inline; }
/* .lang-block variants of each, display: block */
```

`setLang(lang)` in `halla_main.js`: generalize from the `isAr` boolean to a
lookup — `dir` is `rtl` only when `lang === 'ar'`, `htmlLang` is just `lang`
itself (no more forced `en` fallback for non-ar). Update the nav `.lang-toggle`
markup to 4 buttons (EN / عربي / हिं / RU labels).

**Critical:** `scripts/sync-halla-marketing.mjs` hardcodes the *old* 2-language
CSS block (`LANG_CSS_BLOCK`) and JS (`SETLANG_REPLACEMENT`) and force-injects
them via regex on every sync, overwriting whatever the root files contain for
that section. This script must be updated to the new 4-language block/pattern
first, or it will silently clobber the rework back to binary on next build.

**Content translation:** all 46 `lang-en`/`lang-ar` copy-block pairs in
`index.html` (hero, features, pricing, testimonials, etc.) and the equivalent
45 pairs in `halla_preview.html` get matching `lang-hi`/`lang-ru` spans added,
full best-effort translation (not professionally reviewed).

## Out of scope

- Professional/native-speaker review of Hindi, Russian, or Saudi-dialect Arabic
  copy — flagged for the user to arrange separately before wide release.
- Any change to `plan-config.ts`, billing, or plan-gating logic around
  languages (`isLanguageAllowed` etc.) — already correct.
- Translating dashboard *content* the user enters themselves (lead names, call
  transcripts, etc.) — this is only about static UI/voice-prompt strings.
