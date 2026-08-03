---
name: finding-app-niches
description: Use when researching App Store niches, market gaps, or app opportunities. Browses App Store categories and search results on a real device, notes ratings and review counts, and generates an HTML report with underserved niches, keyword opportunities, and low-rated categories. Triggers on "find niche", "market gap", "app store opportunity", "niche finder", "app idea research", "underserved category", "keyword opportunity".
---

# App Niche Finder

Browse the App Store on a real device to identify underserved niches, low-rated categories, and keyword opportunities. Produces a research report with actionable findings.

## Step 1: Ask the User

Before doing anything, ask:

1. **Device** — "Which device?" (list via `GET /api/v1/devices` if needed)
2. **Interest area** — "What area are you interested in? (e.g., productivity, health, finance, education) Or say 'open exploration'."
3. **Keywords to explore** — "Any specific keywords or app ideas to research? (e.g., 'habit tracker for couples', 'receipt scanner')"
4. **Goals** — "What are you looking for? (e.g., low-competition niches, poorly-rated apps to outdo, trending categories)"

## Step 2: Research the Market

### Category Browsing

1. **Launch App Store**: `POST /api/v1/devices/{deviceId}/launch` with `{"bundleId": "com.apple.AppStore"}`
2. **Browse relevant categories**:
   - Navigate to the category (e.g., Productivity, Health & Fitness)
   - Screenshot the top charts: `GET /api/v1/devices/{deviceId}/screenshot?path=C:/Users/User/mobai-reports/niche-analysis/{identifier}&name=category-{name}`
   - Record: top apps, their ratings, review counts

### Keyword Research

For each keyword of interest:
1. **Search the keyword** in the App Store search
2. **Capture results**: Screenshot the search results
3. **For each result** (top 10):
   - ALWAYS use `only_visible: false` on observe to get ALL search results including off-screen ones — this eliminates unnecessary scroll-observe cycles
   - Record: app name, rating, review count, subtitle
   - Note: Does it directly address the keyword? Or is it tangentially related?
4. **Assess competition**:
   - How many apps directly target this keyword?
   - What are their ratings? (Low average = opportunity)
   - How many reviews? (Low count = low competition)

### Signals to Look For

| Signal | What it means |
|--------|--------------|
| Low ratings (< 3.5★) across top results | Users are dissatisfied — opportunity to build better |
| Few results (< 5 direct matches) | Low competition — niche may be underserved |
| High ratings but few reviews | Good apps exist but market is small or new |
| Old "last updated" dates | Abandoned apps — opportunity if demand exists |
| Generic apps dominating specific searches | Opportunity for a focused, specialized app |
| Many results but poor relevance | Keyword is underserved despite search volume |

## Step 3: Score Opportunities

For each niche/keyword discovered, score on:

1. **Competition** (1-5, lower = less competition): Number and quality of existing apps
2. **Demand signals** (1-5, higher = more demand): Review counts, search suggestion prominence
3. **Quality gap** (1-5, higher = bigger gap): Difference between user needs and current app quality
4. **Opportunity score**: (Demand × Quality Gap) / Competition

## Step 4: Generate Report

Create a self-contained HTML report at `C:/Users/User/mobai-reports/niche-analysis/{identifier}/index.html`.

Use a descriptive slug as `{identifier}` (e.g., `productivity-niches`, `health-apps`).

### Report Contents

1. **Header**: Research area, date, keywords explored
2. **Top opportunities**: Ranked by opportunity score, each with:
   - Keyword/niche name
   - Opportunity score (visual bar)
   - Competition level
   - Evidence (screenshot of search results)
   - Why it's an opportunity
3. **Category overview**: Top apps in each explored category with ratings
4. **Keyword analysis table**: Each keyword with result count, avg rating, avg reviews, competition assessment
5. **Low-rated app highlights**: Specific poorly-rated apps with their common complaints (from visible review snippets)
6. **Recommendations**: Top 3-5 most promising niches with suggested positioning

### HTML Pattern

```html
<!-- Self-contained HTML with inline CSS -->
<!-- Screenshots as relative paths -->
<!-- Opportunity scores as CSS bar charts -->
<!-- Sortable table for keyword analysis -->
```

**Key rules:**
- Everything in one HTML file with inline CSS/JS
- Images reference relative paths
- Sort opportunities by score (best first)
- Include evidence screenshots for each finding

## Step 5: Serve and Finish

After generating the report:

1. Print a brief summary: "Explored {N} keywords across {M} categories. Top opportunity: {niche} (score: {X}/25)."
2. Tell the user:
   ```
   Niche research complete!
   Report: http://localhost:8686/reports/niche-analysis/{identifier}/
   ```

**IMPORTANT:**
- Do NOT start a separate HTTP server. MobAI already serves this directory.
- Do NOT try to open the report on the device. It's for the user's Mac browser.
- Your job is done after generating files and printing the URL.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Only checking one keyword | Explore variations and related terms |
| Ignoring review content | Visible review snippets reveal user pain points |
| No evidence for claims | Screenshot every search result and listing you cite |
| Subjective opportunity scores | Base scores on observable data (ratings, counts, relevance) |
| Too broad analysis | Focus on specific niches, not entire categories |
