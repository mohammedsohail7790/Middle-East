---
name: analyzing-competitors
description: Use when analyzing competitor apps in a mobile app category. Opens the App Store or Play Store on a real device, searches the category, captures screenshots of competitor listings and UIs, and generates an HTML comparison report with feature matrices, ratings, and screenshot comparisons. Triggers on "competitor analysis", "app comparison", "competitive research", "market analysis", "compare apps", "category research".
---

# Competitor Analysis

Analyze competitor apps by browsing the App Store or Play Store on a real device, capturing listings and app UIs, and generating a comparison report.

## Step 1: Ask the User

Before doing anything, ask:

1. **Your app** — "What's your app name and bundle ID? (or describe it if not yet built)"
2. **Device** — "Which device?" (list via `GET /api/v1/devices` if needed)
3. **Category / keywords** — "What App Store category or search keywords? (e.g., 'habit tracker', 'expense manager')"
4. **Competitors** — "Any specific competitors to analyze? Or should I find the top results?"
5. **Number of competitors** — "How many competitors to compare? (default: 5)"
6. **Focus areas** — "What matters most? (e.g., pricing, features, design, ratings, onboarding)"

## Step 2: Research Competitors

### App Store Research

1. **Launch App Store / Play Store**: `POST /api/v1/devices/{deviceId}/launch` with the store's bundle ID
   - iOS: `com.apple.AppStore`
   - Android: `com.android.vending`
2. **Search for the category/keywords**: Navigate to search, type the keywords
3. **For each competitor** (top 5 or user-specified):
   - Screenshot the listing: `GET /api/v1/devices/{deviceId}/screenshot?path=C:/Users/User/mobai-reports/competitor-analysis/{identifier}&name=listing-{appName}`
   - Record: app name, developer, rating, review count, price, subtitle/tagline
   - ALWAYS use `only_visible: false` on observe to get ALL listing content including off-screen items — this eliminates unnecessary scroll-observe cycles
   - Scroll down to capture screenshots of listing sections not covered by the UI tree
4. **Install and explore** each competitor (if user approves):
   - Launch the app
   - Screenshot the main screens (home, key features, settings, paywall)
   - Capture UI tree to understand navigation structure
   - Note: number of tabs, key features visible, design style

### What to Record

For each competitor:

- **Identity**: Name, developer, icon
- **Metrics**: Rating (stars), review count, app size, last updated
- **Positioning**: Subtitle, first line of description, category rank
- **Monetization**: Free/paid, subscription tiers, in-app purchases shown
- **Key features**: Top 3-5 visible features from listing screenshots
- **Design**: Overall style (minimal, colorful, professional, playful)
- **Screenshots**: Store listing screenshots + actual app UI if installed

## Step 3: Build Comparison

Analyze the collected data to create:

1. **Feature matrix**: Rows = features, Columns = apps. Check/cross for each.
2. **Ratings comparison**: Bar chart data (rating + review count)
3. **Positioning map**: How each app positions itself (tagline analysis)
4. **Monetization comparison**: Pricing models side by side
5. **Design comparison**: Visual style observations
6. **Gaps and opportunities**: What no competitor does well

## Step 4: Generate Report

Create a self-contained HTML report at `C:/Users/User/mobai-reports/competitor-analysis/{identifier}/index.html`.

Use a slug derived from the category/keywords as `{identifier}` (e.g., `habit-tracker`, `expense-manager`).

### Report Contents

1. **Header**: Category, date, number of apps analyzed
2. **Overview cards**: One per competitor with icon/name/rating/price
3. **Feature matrix table**: Sortable, with your app highlighted (if provided)
4. **Ratings comparison**: Visual bar chart (CSS-only, no chart library needed)
5. **Monetization comparison**: Pricing table
6. **Screenshot gallery**: Store listing screenshots per app (scrollable row)
7. **App UI screenshots**: If installed and explored
8. **Opportunities section**: Gaps, underserved features, positioning whitespace
9. **Recommendations**: Actionable next steps for the user's app

### HTML Pattern

```html
<!-- Self-contained HTML with inline CSS -->
<!-- App icons and screenshots as relative paths -->
<!-- Feature matrix with sticky header row -->
<!-- Responsive layout for comparing 3-6 apps -->
```

**Key rules:**

- Everything in one HTML file with inline CSS/JS
- Images reference relative paths
- Use a clean comparison layout that works for 3-6 apps
- Highlight the user's app differently (accent color) in comparisons

## Step 5: Serve and Finish

After generating the report:

1. Print a brief summary: "Analyzed {N} competitors in {category}. Key finding: {one-line insight}."
2. Tell the user:
   ```
   Competitor analysis complete!
   Report: http://localhost:8686/reports/competitor-analysis/{identifier}/
   ```

**IMPORTANT:**

- Do NOT start a separate HTTP server. MobAI already serves this directory.
- Do NOT try to open the report on the device. It's for the user's Mac browser.
- Your job is done after generating files and printing the URL.

## Common Mistakes

| Mistake                                 | Fix                                                        |
| --------------------------------------- | ---------------------------------------------------------- |
| Only analyzing store listings           | Install and explore actual UIs when possible               |
| Subjective comparisons without evidence | Include screenshots as evidence for every claim            |
| Missing monetization details            | Always check for in-app purchases and subscription screens |
| Too many competitors                    | 5 is the sweet spot; more than 7 becomes noisy             |
| No actionable recommendations           | End with specific "Your app should..." suggestions         |
