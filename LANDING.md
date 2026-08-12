# Landing page (repo root)

Put your desktop landing files here (same folder as `package.json`):

| Root file | Role |
|-----------|------|
| `index.html` | Full marketing SPA |
| `hallaai_styles.css` | Your stylesheet (unscoped) |
| `hallaai_main.js` | Navigation, ROI calculator, mobile menu |

In `index.html` use normal local names:

```html
<link rel="stylesheet" href="hallaai_styles.css">
<script src="hallaai_main.js"></script>
```

Sync rewrites those to `/hallaai-marketing.css` and `/hallaai_main.js` and adds `class="hallaai-marketing"` on `<body>`.

Root copies are **gitignored** (large HTML). Generated files under `apps/dashboard/public/` are what the app serves.

> **Legacy note:** If your designer still exports `calliq_styles.css` / `calliq_main.js`, `import-landing.mjs` will accept those names and rename them automatically.

## Publish into the app

```bash
npm run sync:marketing
```

While editing root files:

```bash
npm run sync:marketing:watch
```

`npm run dev` runs `sync:marketing` once before starting servers.

Outputs:

- `apps/dashboard/public/hallaai-spa.html`
- `apps/dashboard/public/hallaai_main.js`
- `apps/dashboard/public/hallaai-marketing.css` (scoped for Next.js)

## Why `hallaai-marketing.css`?

Next.js shares the page with the dashboard. Your `hallaai_styles.css` is scoped under `.hallaai-marketing` so it does not break app UI. The sync script sets `<body class="hallaai-marketing">` on the published HTML.

## Preview

```bash
npm run dev
```

Open **http://127.0.0.1:3000** (homepage iframe → `/hallaai-spa.html`).

Sign In / Sign Up in `hallaai_main.js` use `go('login')` and `go('signup')` to reach `/login` and `/signup`. All other nav/footer links open the matching Next.js route (`/features`, `/pricing`, `/industries/retail`, etc.).

Pricing and ROI load live plan prices from `GET /api/v1/billing/plans` (public).
