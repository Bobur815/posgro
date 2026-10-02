---
paths:
  - "src/web/**"
  - "src/landing/**"
---

# Web dashboard and landing rules

- `src/web/` is a separate Vite project (super-admin dashboard), built by `npm --prefix src/web run build`, served under `/web`. `npm run build:web` also stages it into the Electron package (`scripts/stage-web-for-pos.mjs`): **do not add large assets** (videos, big images) to `src/web`, they bloat the installer.
- `src/landing/` is the public site (posgro.uz). It is NOT Next.js and NOT Tailwind; do not add either. Detect its real stack (package.json, build tool) before writing code, and match it.
- Web-only changes do not bump the Electron version.
- Brand: minimalist. Monogram "PG" on a rounded square with a `#1976d2 → #dc004e` gradient, POSGRO wordmark, no decorative icons on the monogram.
- Language: the dashboard is ru/uz. Marketing copy for the Fergana audience is O'zbek only.
- Landing performance: hero media must be compressed (video ≤ ~3 MB, poster ≤ ~150 KB), `muted playsInline` for autoplay, and respect `prefers-reduced-motion`.
- Analytics (GA4) loads only on the production hostname, never on staging or localhost.
