---
name: auditing-accessibility
description: Use when auditing a mobile app's accessibility. Navigates screens on a real device, inspects the UI tree for missing labels, small tap targets, missing traits, and contrast issues. Generates an HTML report with per-screen issues, severity levels, and WCAG references. Triggers on "accessibility audit", "a11y check", "VoiceOver audit", "TalkBack audit", "accessibility review", "WCAG compliance".
---

# Accessibility Audit

Audit a mobile app's accessibility by navigating key screens on a real device, analyzing the UI tree for issues, and producing a report with severity-ranked findings and WCAG references.

## Step 1: Ask the User

Before doing anything, ask:

1. **App bundle ID** — "What's the bundle ID? (e.g., com.example.myapp)"
2. **Device** — "Which device?" (list via `GET /api/v1/devices` if needed)
3. **Screens to audit** — "Which screens should I check? (e.g., home, settings, detail view) Or say 'main screens' for auto-discovery."
4. **Priority areas** — "Any specific concerns? (e.g., VoiceOver navigation, tap target sizes, color contrast)"

## Step 2: Navigate and Inspect

For each screen to audit:

1. **Navigate to the screen** using MobAI API (launch app, tap, swipe as needed)
2. **Capture screenshot**: `GET /api/v1/devices/{deviceId}/screenshot?path=C:/Users/User/mobai-reports/accessibility-audit/{bundleId}&name=screen-{N}` or via DSL
3. **Get UI tree**: ALWAYS use `only_visible: false` on observe to get ALL elements including off-screen ones — this ensures no elements are missed in the audit
4. **Analyze the UI tree** for accessibility issues (see checklist below)

### Accessibility Checklist

For every element in the UI tree, check:

#### Labels & Descriptions

- **Missing accessibility label**: Interactive elements (buttons, links, inputs) without text or accessibility label
- **Unhelpful labels**: Labels like "button", "image", "icon" that don't describe the action
- **Decorative images not hidden**: Images without semantic meaning that are exposed to screen readers

#### Tap Targets

- **Too small**: Interactive elements smaller than 44x44pt (iOS) or 48x48dp (Android)
- **Too close together**: Adjacent interactive elements with less than 8pt spacing

#### Traits / Roles (from UI tree attributes)

- **Missing button trait**: Tappable elements not marked as buttons
- **Missing header trait**: Section headers not marked as headers
- **Missing text field trait**: Input fields not properly identified

#### Structure

- **No logical reading order**: Elements that would be read in a confusing order by screen reader
- **Grouped content not grouped**: Related elements that should be a single accessibility group
- **Redundant information**: Same info announced multiple times

#### Text & Contrast

- **Small text**: Text below 11pt (iOS) or 12sp (Android)
- **Dynamic Type / font scaling not supported**: Fixed font sizes

### Severity Levels

| Level             | Meaning                   | Examples                                                       |
| ----------------- | ------------------------- | -------------------------------------------------------------- |
| **Critical**      | Blocks access entirely    | Missing labels on primary navigation, no button traits on CTAs |
| **Major**         | Significantly impairs use | Tap targets under 30pt, unhelpful labels on key features       |
| **Minor**         | Inconvenient but usable   | Tap targets 30-43pt, decorative images not hidden              |
| **Best Practice** | Enhancement opportunity   | Grouping improvements, reading order optimization              |

## Step 3: Generate Report

Create a self-contained HTML report at `C:/Users/User/mobai-reports/accessibility-audit/{bundleId}/index.html`.

### Report Contents

1. **Summary**: Total issues by severity, overall score (percentage of elements passing)
2. **Per-screen sections**: Each with:
   - Screenshot
   - Issues table: element name, issue type, severity, WCAG reference, recommendation
   - Pass count vs fail count
3. **WCAG Reference Links**: Map each issue type to the relevant WCAG 2.1 guideline:
   - Labels → 1.1.1 Non-text Content, 4.1.2 Name Role Value
   - Tap targets → 2.5.8 Target Size (Minimum)
   - Traits → 4.1.2 Name Role Value
   - Reading order → 1.3.2 Meaningful Sequence
   - Text size → 1.4.4 Resize Text
   - Contrast → 1.4.3 Contrast (Minimum)
4. **Top recommendations**: Prioritized list of fixes with highest impact

### HTML Pattern

```html
<!-- Self-contained HTML with inline CSS -->
<!-- Severity colors: Critical=red, Major=orange, Minor=yellow, Best Practice=blue -->
<!-- Screenshots as relative paths -->
<!-- Sortable/filterable table for issues -->
```

**Key rules:**

- Everything in one HTML file with inline CSS/JS
- Images reference relative paths
- Include WCAG guideline numbers for each issue
- Sort issues by severity (critical first)

## Step 4: Serve and Finish

After generating the report:

1. Print brief summary: "Found {N} accessibility issues across {M} screens: {critical} critical, {major} major, {minor} minor."
2. Tell the user:
   ```
   Accessibility audit complete!
   Report: http://localhost:8686/reports/accessibility-audit/{bundleId}/
   ```

**IMPORTANT:**

- Do NOT start a separate HTTP server. MobAI already serves this directory.
- Do NOT try to open the report on the device. It's for the user's Mac browser.
- Your job is done after generating files and printing the URL.
- You are analyzing the UI TREE data, not running actual VoiceOver/TalkBack. Note this limitation in the report.

## Common Mistakes

| Mistake                                | Fix                                                                       |
| -------------------------------------- | ------------------------------------------------------------------------- |
| Only checking visible text             | Also check accessibility labels/traits in UI tree attributes              |
| Ignoring container elements            | Check XCUIElementTypeOther / android.view.ViewGroup for grouping          |
| No WCAG references                     | Every issue must cite a specific WCAG guideline                           |
| False positives on decorative elements | Skip elements that are legitimately decorative                            |
| Not noting platform differences        | iOS and Android have different a11y APIs — note which platform was tested |
