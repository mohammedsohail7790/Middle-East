---
name: auditing-onboarding
description: Use when auditing a mobile app's first-run onboarding experience. Walks through the onboarding flow on a real device, captures every screen, analyzes UX friction points, and generates an HTML report with per-screen scores and recommendations. Triggers on "onboarding audit", "first-run experience", "onboarding review", "new user flow", "FTUE audit", "first time user experience".
---

# Onboarding Audit

Walk through a mobile app's first-run onboarding experience on a real device, capture every screen, analyze friction points, and produce a detailed UX audit report.

## Step 1: Ask the User

Before doing anything, ask:

1. **App bundle ID** — "What's the bundle ID? (e.g., com.example.myapp)"
2. **Device** — "Which device?" (list via `GET /api/v1/devices` if needed)
3. **Fresh install?** — "Should I assume a fresh install (no prior data)? Or is there a specific onboarding state to test?"
4. **Account creation** — "Does onboarding include signup? Should I create a real account or stop at the signup wall?"
5. **Specific concerns** — "Anything specific to evaluate? (e.g., permission requests, paywall placement, tutorial length)"

## Step 2: Walk the Onboarding

Navigate the onboarding flow step by step:

1. **Launch the app**: `POST /api/v1/devices/{deviceId}/launch` with `{"bundleId": "{bundleId}"}`
2. **At each screen**:
   - Capture screenshot: `GET /api/v1/devices/{deviceId}/screenshot?path=C:/Users/User/mobai-reports/onboarding-audit/{bundleId}&name=screen-{N}`
   - Get UI tree: `GET /api/v1/devices/{deviceId}/ui-tree`
   - Record: what the screen shows, what actions are available, what's being asked of the user
3. **Advance**: Tap the primary CTA (Continue, Next, Skip, Sign Up, etc.)
4. **Handle branches**: If there are choices (e.g., "Choose interests"), take the most common path
5. **Stop when**: The user reaches the main app content (home screen, dashboard, feed)

### What to Record Per Screen

- Screen number and name/purpose
- What information is requested from the user
- What permissions are requested (and when)
- Number of taps required to advance
- Whether skip/dismiss is available
- Loading time (subjective: instant, brief, slow)
- Any dark patterns (pre-checked boxes, confusing copy, forced actions)

## Step 3: Analyze Each Screen

For each captured screen, evaluate:

### Friction Score (1-5, lower is better)

| Score | Meaning |
|-------|---------|
| 1 | Frictionless — clear value, one tap to advance |
| 2 | Minor friction — small ask or brief delay |
| 3 | Moderate friction — requires thought or input |
| 4 | High friction — significant barrier (signup, payment, long form) |
| 5 | Severe friction — confusing, blocking, or hostile pattern |

### Analysis Dimensions

- **Value clarity**: Does the user understand what they get?
- **Effort required**: How much work is asked of the user?
- **Permission timing**: Are permissions requested at the right moment (just-in-time) or too early?
- **Progress indication**: Does the user know how many steps remain?
- **Escape hatch**: Can the user skip or dismiss?
- **Copy quality**: Is text clear, concise, and benefit-focused?
- **Visual design**: Does the screen feel polished and trustworthy?

## Step 4: Generate Report

Create a self-contained HTML report at `C:/Users/User/mobai-reports/onboarding-audit/{bundleId}/index.html`.

### Report Contents

1. **Summary header**: App name, device, date, overall friction score (average)
2. **Flow visualization**: Horizontal timeline showing all screens with friction color coding
3. **Per-screen cards**: Each with:
   - Screenshot thumbnail
   - Screen purpose
   - Friction score (color-coded badge)
   - Analysis notes
   - Specific recommendations
4. **Overall recommendations**: Top 3-5 improvements ranked by impact
5. **Benchmarks**: Compare onboarding length and friction to typical best practices (e.g., "Most top apps complete onboarding in 3-5 screens")

### HTML Template Pattern

```html
<!-- Same self-contained pattern as smoke-test -->
<!-- Friction colors: 1=green, 2=lime, 3=yellow, 4=orange, 5=red -->
<!-- Screenshots referenced as relative paths: screen-1.png, screen-2.png, etc. -->
```

**Key rules:**
- Everything in one HTML file with inline CSS/JS
- Images reference relative paths
- Use a clean, professional report layout
- Color-code friction scores for quick scanning

## Step 5: Serve and Finish

After generating the report:

1. Print a brief summary: "Onboarding has {N} screens with an average friction score of {X}/5."
2. Tell the user:
   ```
   Onboarding audit complete!
   Report: http://localhost:8686/reports/onboarding-audit/{bundleId}/
   ```

**IMPORTANT:**
- Do NOT start a separate HTTP server. MobAI already serves this directory.
- Do NOT try to open the report on the device. It's for the user's Mac browser.
- Your job is done after generating files and printing the URL.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Skipping permission dialogs | Screenshot and analyze EVERY screen including system dialogs |
| Not recording what's being asked | Note every input field, toggle, and permission |
| Vague recommendations | Be specific: "Move notification permission to after first value moment" |
| Missing dark patterns | Check for pre-checked boxes, confusing dismiss buttons, hidden skip |
| Overly generous scoring | A signup wall IS high friction (4), even if well-designed |
