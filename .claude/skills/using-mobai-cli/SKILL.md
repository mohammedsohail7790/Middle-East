---
name: using-mobai-cli
description: Use for controlling Android or iOS devices via the `mobai` command-line tool in unfamiliar environments — exploring apps you don't own, one-off debugging, poking new screens, shell scripts, CI steps, or any one-step-at-a-time mobile automation from the terminal. For familiar apps where you know the view hierarchy and can batch multiple steps, prefer the more advanced MobAI MCP server (`mcp__mobai__*`) instead. Triggers on "mobai cli", "mobai tap", "mobai command", tap/swipe/type/screenshot/observe requests, or similar CLI-prefixed shell automation.
---

# Using the MobAI CLI

`mobai` controls connected Android and iOS devices via the MobAI desktop app's local HTTP API (`127.0.0.1:8686`, must be running).

**Discover syntax with `mobai --help` and `mobai <command> --help`.** This skill covers what those don't: how to target elements and common gotchas.

## Install

```sh
npm install -g @mobai-app/cli                   # requires Node 18+
npx @mobai-app/cli devices list                 # one-off
```

The MobAI desktop app must be running on the same machine (or reachable via `--base-url http://host:port`).

## Device selection

Pick a device once per session and forget about it:

```sh
export MOBAI_DEVICE=<id>                        # or pass -d <id> every call
```

Without either, the CLI auto-picks when exactly one device is connected, else errors (exit 11). `mobai devices list` shows available IDs.

## How the CLI works

**One command = one HTTP call = one DSL step.** Run commands sequentially and reason between them. The CLI is for one-step-at-a-time flows; for recorded multi-step sequences use the MCP `execute_dsl` tool.

**Canonical loop:** observe → pick selector → act → (wait → observe again) → next.

```sh
mobai observe --include ui_tree                 # see what's on screen
mobai tap "id:com.apple.settings.general"       # act on a precise id
mobai wait --stable --timeout-ms 2000           # let the transition finish
mobai observe --include ui_tree                 # verify
```

## Run a whole test file

For a saved flow, run the file end-to-end instead of stepping by hand:

```sh
mobai test flows/login.mob                       # MobAI .mob script
mobai test flows/checkout.yaml                    # maestro YAML flow
mobai test flows/login.mob -p user=alice -p otp=123456   # ${name} params
```

The file extension picks the parser (`.mob` vs maestro `.yaml`/`.yml`). The current directory is the project root (so `run "shared/..."` sub-scripts and relative refs resolve); pass `-P <dir>` to set it explicitly. A file outside the current directory falls back to its own directory as the root.

Output is per-step PASS/FAIL; the process exits non-zero if any step fails, so it works as a CI gate. Add `--json` for a machine-readable run result. Long runs get a 10m default timeout (override with `--timeout`).

Use this when you already have a `.mob`/maestro file. To build a flow interactively, step through with the single-step commands below.

## Selector syntax — the single way to target an element

Every command that matches an element accepts the same selector string (as a positional arg, or on `--to`/`--into`/`--from`):

```
"x,y"                                # pixel coordinates (two integers)
"id:login_btn"                       # single key
"text-contains:Login,type:button"    # combine keys with commas
```

| Key | Meaning |
|-----|---------|
| `id` | accessibility id — **prefer this** |
| `text` | exact text (short, static, unique only) |
| `text-contains` (or `contains`) | substring, case-insensitive |
| `text-regex` (or `regex`) | regex |
| `text-starts-with` (or `starts-with`) | prefix |
| `type` | `button`, `input`, `switch`, `cell`, `text`, `image`, `scrollview`, `*` |
| `index` | 0-based Nth match |
| `bounds` | `top_half`, `bottom_half`, `left_half`, `right_half`, `center` |
| `near` / `near-dir` / `near-dist` | anchor text / direction / max distance |
| `enabled` / `visible` / `selected` | `true` / `false` |
| `css` / `xpath` | web-context predicates |

### Preference order

1. `id:foo` — stable, exact, intentional. **If the UI tree shows `#some-id`, use it.**
2. `text-contains:Bar` or `regex:...` — robust to locale, plurals, whitespace.
3. `text:Exact` — only when short, static, unique.
4. Combine with `type:` for disambiguation (`type:cell,text-contains:General`).
5. `near:` when there's a stable anchor nearby.
6. `index:N` — last-resort disambiguator.
7. `"x,y"` — only when no predicate works (OCR result, custom-rendered UI).

### Two-endpoint commands

`drag` and `swipe` take selectors on both ends. `scroll` takes a target on `--to`; `type` on `--into`:

```sh
mobai drag --from "id:item_1" --to "id:trash"
mobai drag --from "text-contains:Photo" --to 400,800
mobai swipe --from "id:card_a" --to 50,500
mobai scroll down --to "id:privacy_row" --max-scrolls 10
mobai type "hello@example.com" --into "id:email_field" --clear
```

## Observation — prefer UI tree over screenshots

```sh
mobai observe --include ui_tree                 # text, compact, parseable — use this for decisions
mobai observe --include ocr                     # iOS-only; fallback when ui_tree is thin
mobai screenshot --path ./shots --name login    # visual verification only
```

The UI tree is textual, enumerates every interactable element with its accessibility id and bounds. Screenshots are images — large, slow, useless for picking a selector. Use screenshots only for visual checks (layout, colors, icons) or report artifacts.

**`--only-visible`:** default `true` (use this when acting — off-screen can't be tapped). Set `false` only when collecting data from a scrollable after scrolling.

**OCR fallback (iOS only):** when the UI tree looks empty but text is visible on screen (React Native, Flutter, canvas-rendered apps, system dialogs like Sign in with Apple), add `--include ocr`. OCR returns text with screen coordinates (already tap-ready) — pass those as a `"x,y"` selector. The rare legitimate coord-selector use case.

## Scroll vs swipe

- **`mobai scroll`** is **semantic** — direction is *where to look* for an element. Use for finding off-screen content, with `--to <selector>` and `--max-scrolls N`.
- **`mobai swipe`** is **physical** — direction is *where the finger moves*. Use for carousels, pagers, dismissal gestures.

## Wait and verify

Never `sleep`. Use:

```sh
mobai wait "id:welcome" --timeout-ms 5000       # wait for a specific element
mobai wait --stable --timeout-ms 3000           # wait for the UI to stop changing
mobai assert exists "text-contains:Welcome"     # exits 6 on failure
mobai assert not-exists "id:error_banner"
mobai assert count "type:cell" --count 5
```

In CI prefer `mobai assert *` (exit code is the contract) over `mobai observe | grep`.

## Exit codes

| Code | Meaning |
|------|---------|
| 0 | success |
| 1 | generic / invalid action |
| 2 | element not found / no match / ambiguous |
| 3 | timeout |
| 4 | bridge crashed / app not running |
| 5 | user cancelled / safety blocked |
| 6 | assertion failed |
| 10 | API unreachable (is the MobAI app running?) |
| 11 | no device / multiple devices (pass `-d` or set `$MOBAI_DEVICE`) |

## Anti-patterns to avoid

- **Acting without observing first.** Run `mobai observe --include ui_tree` on any unfamiliar screen and pick a selector from what's actually there.
- **Using screenshots for decision-making.** They don't tell you what's tappable. Use `observe --include ui_tree`.
- **`text:Exact` when `id:` or `text-contains:` works.** Exact text breaks on localization, plurals, whitespace, A/B copy.
- **Ignoring accessibility ids.** `#some-id` in the UI tree is the most stable matcher — use `id:some-id`.
- **Coord selectors when a predicate works.** `"540,1200"` is brittle against every screen size. Only fall back to coords when OCR is the only path.
- **`sleep` instead of `mobai wait`.** Wait polls and returns the moment it's ready.
- **`--only-visible false` when acting.** Off-screen elements can't be tapped.
- **Assuming element index stays stable across calls.** Each `mobai` invocation is independent; the `[7]` in one `observe` may renumber next time. Match by selector, not index.

## Per-app skills — record what you learn

Before driving a familiar app, check `~/.claude/skills/` for a skill matching its bundle id or name (e.g. `com-instagram-android`, `uber`) and load it — prior sessions may have already figured out the selectors, flows, and quirks.

When you hit app-specific gotchas worth keeping — an unstable selector that only works with a specific predicate combo, a hidden tap target, a screen that needs `--include ocr`, a dialog that hijacks input, a flow that needs an extra `wait --stable` — create or update `~/.claude/skills/<app-slug>/SKILL.md` with the finding. Keep it short: the quirk, the command that works, and one sentence on why the obvious approach fails. Don't duplicate general CLI guidance there — that belongs in this skill.

Also save reusable multi-step flows as labeled command blocks in the same SKILL.md. When you confirm a flow works (login, dismiss onboarding, toggle-a-setting, checkout), add a section like `## Flow: login` with a fenced ```sh``` block of the `mobai` commands in order. Mark variable inputs with placeholders (`<EMAIL>`, `<OTP>`) so future sessions know what to substitute. On the next run, copy the commands and substitute — faster than re-deriving the flow by observing screen-by-screen. Update snippets in place when the app changes.

## Troubleshooting

- **Exit 10 `API unreachable`** — MobAI desktop app not running, or `--base-url` wrong.
- **Exit 11 `multiple devices`** — set `$MOBAI_DEVICE` or pass `-d`.
- **Exit 2 `NO_MATCH`** — `mobai observe --include ui_tree`, find `#id`, switch to `id:...`.
- **Exit 2 `AMBIGUOUS_MATCH`** — add `type:`, `bounds:`, or `near:`. Or use `id:`.
- **Element not visible** — `mobai scroll <dir> --to "<selector>" --max-scrolls N`.
- **iOS tap does nothing** — bridge idle; `mobai bridge start` first.
- **UI tree suspiciously thin on iOS** — add `--include ocr` (React Native / Flutter / system dialogs often need it).
