---
name: testing-localization
description: Use when testing a mobile app's localization across multiple languages. Switches the device language, navigates key screens, captures screenshots per locale, and generates an HTML report flagging truncation, untranslated strings, and layout issues. Triggers on "localization test", "language test", "l10n test", "translation test", "locale test", "internationalization test", "i18n check".
---

# Localization Test

Test a mobile app's localization by switching the device language, navigating key screens in each locale, capturing screenshots, and producing a report that flags truncation, untranslated strings, and layout issues.

## Step 1: Ask the User

Before doing anything, ask:

1. **App bundle ID** — "What's the bundle ID? (e.g., com.example.myapp)"
2. **Device** — "Which device?" (list via `GET /api/v1/devices` if needed)
3. **Languages to test** — "Which locales? (e.g., en, de, ja, ar, es) Provide the language codes."
4. **Key screens** — "Which screens to test? (e.g., home, settings, onboarding, paywall) Or say 'main screens' for auto-discovery."
5. **Language switching method** — "Does the app have in-app language switching? Or should I change the device language in Settings?"

## Step 2: Establish Baseline

First, capture all screens in the primary language (usually English):

1. **Launch the app**: `POST /api/v1/devices/{deviceId}/launch` with `{"bundleId": "{bundleId}"}`
2. **Navigate to each key screen** and capture:
   - Screenshot: `GET /api/v1/devices/{deviceId}/screenshot?path=C:/Users/User/mobai-reports/localization-test/{bundleId}&name=en-screen-{N}`
   - UI tree: `GET /api/v1/devices/{deviceId}/ui-tree` — record all text content as baseline
3. **Build a screen map**: List of screens with their baseline text strings

## Step 3: Test Each Locale

For each additional language:

### Switch Language

**Option A — In-app switching** (preferred, faster):
1. Navigate to language settings within the app
2. Select the target language

**Option B — Device language change**:
1. Navigate to device Settings → General → Language & Region (iOS) or Settings → System → Language (Android)
2. Change to target language
3. Wait for device to restart/apply
4. Relaunch the app

### Capture Each Screen

For each key screen in the new locale:
1. Navigate to the screen
2. **Screenshot**: `GET /api/v1/devices/{deviceId}/screenshot?path=C:/Users/User/mobai-reports/localization-test/{bundleId}&name={locale}-screen-{N}`
3. **UI tree**: ALWAYS use `only_visible: false` on observe to get ALL text including off-screen content

### What to Check

For each screen in each locale, flag:

| Issue | How to Detect | Severity |
|-------|--------------|----------|
| **Untranslated string** | Text identical to English baseline (and not a proper noun/brand) | High |
| **Truncated text** | UI tree shows text but screenshot shows "..." or clipped text | High |
| **Layout broken** | Elements overlap or overflow (compare positioning to baseline) | High |
| **Placeholder text** | Strings like "TODO", "FIXME", "lorem ipsum" | Critical |
| **Wrong language** | Text in a language different from the selected locale | High |
| **Number/date format** | Dates/numbers not following locale conventions | Medium |
| **RTL issues** (Arabic, Hebrew) | Layout not mirrored, text alignment wrong | High |
| **Text too small** | Translated text forced to smaller size to fit | Medium |

## Step 4: Generate Report

Create a self-contained HTML report at `C:/Users/User/mobai-reports/localization-test/{bundleId}/index.html`.

### Report Contents

1. **Summary header**: App, device, date, locales tested, total issues found
2. **Locale tabs**: Tab switcher to view each locale's results
3. **Per-locale section**: Each with:
   - **Side-by-side comparison**: Baseline (English) screenshot next to locale screenshot
   - **Issues table**: String, issue type, severity, screen name
   - **Pass rate**: Percentage of strings correctly localized
4. **Cross-locale summary**: Which screens have the most issues, which locales are worst
5. **Untranslated strings list**: All strings that appear identical to English across locales

### HTML Pattern

```html
<!-- Self-contained HTML with inline CSS/JS -->
<!-- Tab switcher for locales (vanilla JS) -->
<!-- Side-by-side image comparison with baseline -->
<!-- Screenshots as relative paths: en-screen-1.png, de-screen-1.png, etc. -->
```

**Key rules:**
- Everything in one HTML file with inline CSS/JS
- Images reference relative paths
- Locale tabs for quick switching between languages
- Side-by-side layout: baseline left, test locale right

## Step 5: Serve and Finish

After generating the report:

1. Print summary: "Tested {N} locales across {M} screens. Found {X} issues ({critical} critical, {high} high)."
2. Tell the user:
   ```
   Localization test complete!
   Report: http://localhost:8686/reports/localization-test/{bundleId}/
   ```

**IMPORTANT:**
- Do NOT start a separate HTTP server. MobAI already serves this directory.
- Do NOT try to open the report on the device. It's for the user's Mac browser.
- Your job is done after generating files and printing the URL.
- After testing, **restore the device to the original language** (important!).

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting to restore language | Always switch back to original language when done |
| Flagging brand names as untranslated | Exclude known brand names, app name, proper nouns |
| Not testing RTL languages | Arabic and Hebrew need special RTL layout checks |
| Missing scrollable content | Scroll down on each screen to check all visible text |
| Not capturing enough screens | Test at least: home, settings, any text-heavy screen, error states |
| Slow device language switching | Prefer in-app switching when available |
