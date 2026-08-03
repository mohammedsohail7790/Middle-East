---
name: running-smoke-tests
description: Use when performing a quick smoke test on a mobile app to verify core flows work. Launches the app on a real device, navigates critical paths, captures screenshots at each step, and detects crashes or errors. Generates a pass/fail HTML report with evidence. Triggers on "smoke test", "quick test", "verify app works", "sanity check", "does it crash".
---

# Smoke Test

Run a quick smoke test on a mobile app by navigating core user flows on a real device, capturing evidence at each step, and producing a pass/fail report.

## Step 1: Ask the User

Before doing anything, ask:

1. **App bundle ID** — "What's the bundle ID? (e.g., com.example.myapp)"
2. **Device** — "Which device should I test on?" (list devices via `GET /api/v1/devices` if needed)
3. **Core flows to test** — "Which flows should I smoke test? (e.g., login, home feed, settings, checkout) Or say 'auto' and I'll explore the main tabs."
4. **Credentials** — "Does the app require login? If so, provide test credentials."

## Step 2: Plan Test Flows

Based on user input (or auto-discovery), define 3-6 test flows. Each flow is a sequence of steps:

```
Flow: "Login"
  1. Launch app
  2. Tap email field → type credentials
  3. Tap password field → type password
  4. Tap "Sign In"
  5. Verify: home screen loads (check UI tree for expected elements)
```

For "auto" mode:
1. Launch app → screenshot home screen
2. Get UI tree → identify tab bar or main navigation
3. Tap each tab → screenshot each
4. Look for common flows (settings, profile, search)

## Step 3: Execute Tests

For each flow:

1. **Launch the app**: `POST /api/v1/devices/{deviceId}/launch` with `{"bundleId": "{bundleId}"}`
2. **Execute each step**: Use tap, type, swipe via MobAI API
3. **Capture evidence after each step**:
   ```
   GET /api/v1/devices/{deviceId}/screenshot?path=C:/Users/User/mobai-reports/smoke-test/{bundleId}&name=flow-{N}-step-{M}
   ```
4. **Check for crashes**: After each action, get UI tree. If the app is no longer in foreground or shows a crash dialog, mark the flow as FAILED.
5. **Record result**: PASS if all steps complete without crashes, FAIL otherwise.

### Crash Detection

After each action, check:
- `GET /api/v1/devices/{deviceId}/ui-tree` — if the app's UI is gone or shows system crash dialog → FAIL
- If a step times out (element not found after reasonable retries) → FAIL with "timeout"

## Step 4: Generate Report

Create a self-contained HTML report at `C:/Users/User/mobai-reports/smoke-test/{bundleId}/index.html`.

### Report Structure

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Smoke Test Report — {bundleId}</title>
  <style>
    /* All CSS inline — clean, modern report layout */
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, system-ui, sans-serif; background: #f5f5f7; color: #1d1d1f; padding: 40px; }
    .header { text-align: center; margin-bottom: 40px; }
    .summary { display: flex; gap: 20px; justify-content: center; margin-bottom: 40px; }
    .stat { background: white; border-radius: 12px; padding: 20px 32px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .stat .value { font-size: 36px; font-weight: 700; }
    .stat .label { font-size: 14px; color: #86868b; margin-top: 4px; }
    .pass { color: #34c759; }
    .fail { color: #ff3b30; }
    .flow { background: white; border-radius: 12px; padding: 24px; margin-bottom: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
    .flow-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; }
    .flow-name { font-size: 18px; font-weight: 600; }
    .badge { padding: 4px 12px; border-radius: 6px; font-size: 13px; font-weight: 600; }
    .badge.pass { background: #e8f8ed; }
    .badge.fail { background: #fde8e8; }
    .steps { display: flex; gap: 12px; overflow-x: auto; padding-bottom: 8px; }
    .step { flex-shrink: 0; width: 200px; }
    .step img { width: 100%; border-radius: 8px; border: 1px solid #e5e5e5; }
    .step .caption { font-size: 12px; color: #86868b; margin-top: 6px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Smoke Test Report</h1>
    <p>{bundleId} — {date}</p>
  </div>
  <div class="summary">
    <div class="stat"><div class="value pass">{passCount}</div><div class="label">Passed</div></div>
    <div class="stat"><div class="value fail">{failCount}</div><div class="label">Failed</div></div>
    <div class="stat"><div class="value">{totalFlows}</div><div class="label">Total Flows</div></div>
  </div>
  <!-- For each flow: -->
  <div class="flow">
    <div class="flow-header">
      <span class="flow-name">Flow: Login</span>
      <span class="badge pass">PASS</span>
    </div>
    <div class="steps">
      <div class="step">
        <img src="flow-1-step-1.png">
        <div class="caption">Step 1: Launch app</div>
      </div>
      <!-- more steps... -->
    </div>
  </div>
</body>
</html>
```

### Key Rules

- **Everything in one HTML file** — inline all CSS/JS
- **Images reference relative paths** — screenshots are in the same directory
- **Include timestamp** in report header
- **Sort flows**: failed flows first, then passed

## Step 5: Serve and Finish

After generating the report:

1. Tell the user:
   ```
   Smoke test complete! {passCount}/{totalFlows} flows passed.
   Report: http://localhost:8686/reports/smoke-test/{bundleId}/
   ```

**IMPORTANT:**
- Do NOT start a separate HTTP server. MobAI already serves this directory.
- Do NOT try to open the report on the device. It's for the user's browser.
- Your job is done after generating files and printing the URL.

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Not checking for crashes after each step | Always get UI tree after actions |
| Continuing after a crash | Mark flow as FAILED and move to next flow |
| Screenshots overwriting each other | Use `flow-{N}-step-{M}` naming |
| Missing the report URL | Always print the localhost:8686 URL at the end |
| Trying to verify the HTML on device | The report is for the user's Mac browser |
