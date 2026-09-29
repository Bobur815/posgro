# Task: slow-motion background video in the landing hero

## Context (already verified, don't re-derive)
- Read `CLAUDE.md` first and follow it: plan first, `tasks/todo.md`, work on `dev`, verify before done.
- The hero section is in `src/landing/`. It is NOT Next.js and NOT Tailwind. Do not add either.
- The rest of the monorepo is React 18 + TypeScript + Vite (POS UI uses styled-components and react-i18next), but do NOT assume `src/landing` uses the same. Detect its actual stack.
- Nginx sits in front (`nginx/`, `nginx.staging.conf`). Staging auto-deploys on push to `dev`.
- FROZEN, do not edit: `src/main`, `src/renderer`, `src/shared`, `src/web`, `electron-builder.config.js`.

## Step 0: do NOT write code yet
1. Read `src/landing/` and report:
   - framework and build tool (or plain HTML/CSS/JS), its own `package.json` and scripts
   - how the hero is styled, how RU/UZ text is handled, and whether there is a light/dark theme
   - how static assets are referenced (public dir, imports, or relative paths) and the base path it is served from
2. Report how `src/landing` is built and deployed: which Nginx server block or which service serves it (posgro.uz), and how staging differs. Does it get bundled into the Electron/POS build in any way? (Check `build:pos`, `scripts/`, `electron-builder.config.js`.)
3. Check whether the server supports HTTP Range requests (206) for mp4/webm. Safari needs it for video.
4. Ask me clarifying questions (numbered, max 7), write the plan to `tasks/todo.md`, and wait for approval.

## Requirements (after approval)

**Hero video component** (match `src/landing`'s existing patterns; no new dependencies)
- `<video autoPlay muted loop playsInline preload="metadata" poster aria-hidden="true">`.
- Source order: `hero-mobile.mp4` (`media="(max-width: 768px)"`), `hero.webm`, `hero.mp4`.
- Dark overlay so the headline stays readable, in every theme the landing supports.
- Show the poster instead of the video when:
  - `prefers-reduced-motion: reduce` is set
  - `navigator.connection.saveData` is true, or the connection is 2g/3g
- Pause when off-screen (IntersectionObserver) and resume when visible.
- No layout shift: fixed hero height, `object-fit: cover`. Keep the subject inside the center 60% because mobile crops the sides.
- Use the existing i18n mechanism for any new text, in both ru and uz.
- If the landing is TypeScript: strict types, no `any`.

**Assets**
- Input: `assets/raw/hero-raw.mov` (60 fps 4K, shot at 1/100 shutter). Add `assets/raw/` to `.gitignore`.
- `scripts/encode-hero.sh` (ffmpeg) writes to the landing's static assets dir under `video/`:
  - `hero.mp4`: H.264, 1920 wide, 24 fps, `-crf 28 -an +faststart`, with `setpts=2.5*PTS` for slow motion
  - `hero.webm`: VP9, `-crf 34 -b:v 0 -an`
  - `hero-mobile.mp4`: 1280 wide, `-crf 30`
  - `hero-poster.jpg` and `.webp`, each under 150 KB
- Print the final sizes and warn if any video is over 3 MB.
- The poster is the LCP element. Preload it or mark it high priority.

**Caching**
- Propose Nginx `expires 1y` / `immutable` for `*.mp4` and `*.webm` for the landing's server block, in both `nginx/` and `nginx.staging.conf`. Show the diff and don't apply it until I confirm. Tell me if a Cloudflare cache rule is also needed.

**Quality gates**
- The landing's own build passes, and so does `npm run lint` at the root if it covers `src/landing`.
- `git diff --stat` shows nothing under the frozen paths.
- Tell me the result of these manual checks: iOS Safari autoplay, reduced-motion fallback, Data Saver fallback, video and poster URLs resolving on staging.
- This is a landing-only change, so don't bump the Electron version. Commit on `dev`, push, and stop. Don't merge to `main`.