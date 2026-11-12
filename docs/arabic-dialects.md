# Arabic dialects: review sheet

The receptionist can speak four Arabic dialects. The choice is the language code of the business:

| Language code | Dialect | Covers |
|---|---|---|
| `ar-SA` | Saudi | Najdi and Hejazi everyday speech. This is the default for new Arabic businesses. |
| `ar-AE` | Gulf (Khaleeji) | UAE, Kuwait, Qatar, Bahrain, Oman |
| `ar-EG` | Egyptian | Egypt |
| `ar-LB` | Levantine | Lebanon, Jordan, Syria, Palestine |

A plain `ar` (older businesses) keeps the old behaviour: match whatever the caller speaks.
Every dialect guide ends with "if the caller clearly speaks another dialect, move toward theirs", so the caller always wins.

**These phrases were written by an AI assistant and have not been checked by a native speaker of each dialect. Please check them before any dialect is advertised.**

## What to check

For each dialect below, a native speaker should confirm:

1. The phrases sound natural for a phone receptionist, not formal and not rude.
2. Nothing sounds like a different dialect.
3. When you hear the preview, the accent sounds right (see "How to listen").

## The phrases

Source of truth: `ARABIC_DIALECT_GUIDES` and `ARABIC_DIALECT_PREVIEW_GREETING` in `apps/gateway/src/services/realtime/receptionist-voice.ts`, and the greetings in `apps/dashboard/src/lib/onboarding-setup.ts`.

### Saudi (`ar-SA`)

- Greeting line: هلا والله، معك {name}. كيف أقدر أخدمك؟
- Typical phrases: هلا والله / حياك الله; كيف أقدر أخدمك؟; إيوه / أكيد; تمام / أبشر; ثواني بس; يعطيك العافية / مشكور; في أمان الله

### Gulf (`ar-AE`)

- Greeting line: هلا والله، معاك {name}. كيف أقدر أساعدك؟
- Typical phrases: هلا والله / مرحبا فيك; كيف أقدر أساعدك؟; إي نعم / أكيد; تمام / أبشر; ثواني; مشكور / الله يعطيك العافية; في أمان الله / مع السلامة
- Question for the reviewer: the Gulf countries differ (an Emirati and a Kuwaiti would not always say the same thing). Is one shared set acceptable, or should the UAE and Kuwait be separate?

### Egyptian (`ar-EG`)

- Greeting line: أهلاً بحضرتك، أنا {name}. أقدر أساعدك إزاي؟
- Typical phrases: أهلاً بحضرتك; أقدر أساعدك إزاي؟; أيوه / تمام; لأ; حاضر / من عيوني; ثانية واحدة; شكراً / ميرسي; مع السلامة

### Levantine (`ar-LB`)

- Greeting line: أهلاً وسهلاً، أنا {name}. كيف فيني ساعدك؟
- Typical phrases: أهلاً وسهلاً; كيف فيني ساعدك؟ / شو بقدر أساعدك؟; إيه / أكيد; تمام / تكرم; ثانية; يسلمو / شكراً; الله معك / مع السلامة
- Question for the reviewer: "كيف فيني ساعدك" is Lebanese. Is it right for Jordan, Syria and Palestine, or does each need its own line?

## How to listen

1. Dashboard, **AI Agent** page: pick the language (the four Arabic options are in the list), pick a voice, press **Preview**. The preview says the dialect greeting, or the business's own greeting if it is written in Arabic.
2. Sign-up wizard: the voice and greeting step has **Hear this greeting**. It uses the language chosen on the first screen.

The preview uses a speech model that follows an accent instruction ("speak Gulf Arabic the way a native speaker on the phone would"). If that model is not available for the account, the preview falls back to the older model, which plays the same voice without the accent. If a preview sounds the same in every dialect, the fallback is being used: check `OPENAI_TTS_INSTRUCT_MODEL` (default `gpt-4o-mini-tts`) on the gateway.

## Voices

The six voices (Maya, Sarah, Emma, Chris, Alex, Sage) are multilingual voices from the voice provider. None is Arabic-specific; the accent comes from the instructions. Please listen to each voice in each dialect and note which two or three sound best, so we can recommend them.

| Voice | Saudi | Gulf | Egyptian | Levantine |
|---|---|---|---|---|
| Maya (`marin`) | | | | |
| Sarah (`coral`) | | | | |
| Emma (`shimmer`) | | | | |
| Chris (`cedar`) | | | | |
| Alex (`ash`) | | | | |
| Sage (`sage`) | | | | |

Mark each cell 1 (poor) to 5 (very natural).
