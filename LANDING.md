# Landing page (repo root)

Put your desktop landing files here (same folder as `package.json`):

| Root file | Role |
|-----------|------|
| `index.html` | Full marketing SPA |
| `calliq_styles.css` | Your stylesheet (unscoped) |
| `calliq_main.js` | Navigation, ROI calculator, mobile menu |

In `index.html` use normal local names:

```html
<link rel="stylesheet" href="calliq_styles.css">
<script src="calliq_main.js"></script>
```

Sync rewrites those to `/calliq-marketing.css` and `/calliq_main.js` and adds `class="calliq-marketing"` on `<body>`.

Root copies are **gitignored** (large HTML). Generated files under `apps/dashboard/public/` are what the app serves.

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

- `apps/dashboard/public/calliq-spa.html`
- `apps/dashboard/public/calliq_main.js`
- `apps/dashboard/public/calliq-marketing.css` (scoped for Next.js)

## Why `calliq-marketing.css`?

Next.js shares the page with the dashboard. Your `calliq_styles.css` is scoped under `.calliq-marketing` so it does not break app UI. The sync script sets `<body class="calliq-marketing">` on the published HTML.

## Preview

```bash
npm run dev
```

Open **http://127.0.0.1:3000** (homepage iframe → `/calliq-spa.html`).

Sign In / Sign Up in `calliq_main.js` use `go('login')` and `go('signup')` to reach `/login` and `/signup`. All other nav/footer links open the matching Next.js route (`/features`, `/pricing`, `/industries/hvac`, etc.).

Pricing and ROI load live plan prices from `GET /api/v1/billing/plans` (public).
