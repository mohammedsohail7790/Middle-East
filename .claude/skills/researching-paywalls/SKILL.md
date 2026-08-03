---
name: researching-paywalls
description: Use when researching competitor paywalls and pricing screens. Installs competitor apps on a real device, navigates to their paywall or subscription screen, captures screenshots, and generates an HTML comparison report with side-by-side paywalls, pricing tables, and design analysis. Triggers on "paywall research", "pricing comparison", "subscription screen", "paywall design", "monetization research", "paywall teardown".
---

# Paywall Research

Research how competitor apps present their paywalls and pricing by navigating to subscription screens on a real device and producing a side-by-side comparison report.

## Step 1: Ask the User

Before doing anything, ask:

1. **Your app** — "What's your app? (name, bundle ID, or describe it)"
2. **Device** — "Which device?" (list via `GET /api/v1/devices` if needed)
3. **Competitor apps** — "Which apps' paywalls should I research? (provide names or bundle IDs)"
4. **Focus** — "What specifically interests you? (pricing tiers, design, copy, free trial offers, placement)"

## Step 2: Capture Paywalls

For each competitor app:

1. **Launch the app**: `POST /api/v1/devices/{deviceId}/launch` with `{"bundleId": "{bundleId}"}`
2. **Navigate to the paywall**:
   - Try tapping "Pro", "Premium", "Upgrade", or subscription-related UI elements
   - If behind onboarding, walk through onboarding to reach the paywall
   - If paywall appears automatically (forced paywall), capture it immediately
3. **Capture the paywall screen(s)**:
   - Screenshot: `GET /api/v1/devices/{deviceId}/screenshot?path=C:/Users/User/mobai-reports/paywall-research/{identifier}&name=paywall-{appName}-{N}`
   - If the paywall scrolls, capture multiple screenshots (top, middle, bottom)
   - Get UI tree with `only_visible: false` to extract ALL content including off-screen: pricing text, tier names, CTA button text, fine print
4. **Record details**:
   - **Pricing tiers**: Names, prices, billing periods (monthly/yearly/lifetime)
   - **Free trial**: Duration, what's included, how prominently displayed
   - **Discount**: Any discounted pricing shown (e.g., "Save 60%")
   - **CTA copy**: Exact button text ("Start Free Trial", "Subscribe", "Unlock Pro")
   - **Placement**: Hard paywall (blocks content) vs soft paywall (optional upgrade)
   - **Design style**: Dark/light, illustration style, social proof, urgency elements
   - **Dark patterns**: Pre-selected expensive tier, confusing dismiss, hidden terms

## Step 3: Analyze Patterns

Compare across all captured paywalls:

1. **Pricing strategy**: Who uses trials, who doesn't. Monthly vs yearly emphasis.
2. **Design patterns**: Common layouts, color choices, illustration usage
3. **Psychological tactics**: Anchoring, scarcity, social proof, loss aversion
4. **Copy patterns**: Benefit-focused vs feature-focused, tone of voice
5. **Conversion optimization**: What makes the best paywalls effective

## Step 4: Generate Report

Create a self-contained HTML report at `C:/Users/User/mobai-reports/paywall-research/{identifier}/index.html`.

Use a descriptive slug as `{identifier}` (e.g., `fitness-apps`, `note-taking`).

### Report Contents

1. **Header**: Research topic, date, number of apps analyzed
2. **Side-by-side gallery**: All paywall screenshots in a scrollable row for quick visual comparison
3. **Per-app cards**: Each with:
   - Paywall screenshot(s)
   - Pricing table (tiers, prices, features per tier)
   - CTA copy and placement notes
   - Design analysis notes
4. **Pricing comparison table**: All apps × tiers, normalized to monthly price
5. **Pattern analysis**: Common approaches, what works, what doesn't
6. **Recommendations**: Specific suggestions for the user's paywall design

### HTML Pattern

```html
<!-- Self-contained HTML with inline CSS -->
<!-- Screenshots as relative paths -->
<!-- Pricing tables with monthly-normalized comparison -->
<!-- Side-by-side layout for visual comparison -->
```

**Key rules:**
- Everything in one HTML file with inline CSS/JS
- Images reference relative paths
- Normalize all pricing to monthly equivalent for fair comparison
- Include both screenshot evidence and extracted data

## Step 5: Serve and Finish

After generating the report:

1. Print a brief summary: "Analyzed {N} paywalls. Price range: ${min}-${max}/mo. Key pattern: {insight}."
2. Tell the user:
   ```
   Paywall research complete!
   Report: http://localhost:8686/reports/paywall-research/{identifier}/
   ```

**IMPORTANT:**
- Do NOT start a separate HTTP server. MobAI already serves this directory.
- Do NOT try to open the report on the device. It's for the user's Mac browser.
- Your job is done after generating files and printing the URL.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Can't find the paywall | Try: settings → subscription, profile → upgrade, or trigger feature gate |
| Only capturing one frame | Scroll paywalls often — capture ALL parts |
| Missing fine print | Read terms, trial conditions, renewal pricing from UI tree |
| Not noting dark patterns | Pre-selected tiers, confusing close buttons, hidden "restore purchases" |
| No pricing normalization | Always calculate monthly equivalent for yearly/lifetime plans |
