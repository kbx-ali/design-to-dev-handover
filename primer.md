# Session Primer — KBX Figma Tools

## Projects

### 1. KBX CRO App (`cro/index.html`)
Single-file vanilla HTML/CSS/JS app. Firebase Auth (Google OAuth, `@kubixmedia.co.uk` only). Firestore data. Dark/light theme via CSS custom properties.
- Figma file: `TsyQQYJcZCOFc6OilAgLTV` (KBX — CRO App)
- Preview: `npx serve . -p 3000` in `/cro`
- Login screen: dot-matrix canvas ripple (yellow) + floating dark/light pill toggle + KUBIX brand icon + animated Google gradient border on sign-in button
- `setTheme(t)` syncs `lgn/db/cl/cfg` button prefixes across all screens

### 2. Design → Dev Handover App (`handover/index.html` + `figma-plugin/ui.html`)
Single-file vanilla HTML/CSS/JS app. Same Firebase project as CRO. Live at `kubix-design.netlify.app/handover`.
- Repo: `kbx-ali/design-to-dev-handover` — Netlify auto-deploys on push to `main`
- Firebase project: `cro-strategic-roadmap`

**Current state (2026-03-31):**
- All emoji (📋, ✓) and Heroicons SVGs replaced with `<iconify-icon>` from `pixelarticons` set via Iconify CDN v2.1.0
- Same replacement done in `figma-plugin/ui.html`
- Login screen fully redesigned to match CRO app style:
  - Full-page canvas with dot-matrix ripple (orchid `#E591E5` in dark, darker orchid in light)
  - Glassmorphism login card (`backdrop-filter: blur(40px)`)
  - Floating dark/light theme toggle pill (fixed, top-center)
  - Correct branding: pixel `</>` code brackets SVG (28×28, `currentColor`) + Kubix wordmark SVG + "HANDOVER" label in `--accent-text`
  - Animated Google gradient border via `@property --gg-angle` conic-gradient on sign-in button hover
  - `setTheme(t)` syncs `lgn-btn-dark` / `lgn-btn-light` active states; header toggle still uses single `toggleTheme()` which delegates to `setTheme()`
- Share Link button always visible when a project is open (was previously hidden until a `shareToken` existed)

**Key CSS tokens (handover):**
- Light: `--accent-text: var(--kbx-teal)` · Dark: `--accent-text: var(--kbx-yellow)`
- Surfaces: `--bg-page`, `--bg-card`, `--bg-input`, `--border`, `--text-pri`, `--text-sec`, `--text-mute`, `--text-sub`
- No `--bg` or `--text` (use `--bg-page` / `--text-pri`)

**Share URL flow:**
- Editor clicks "Share Link" → `openShareModal()` → `getOrCreateShareToken()` generates token + saves to Firestore → shows copyable `?view=TOKEN` URL
- Viewer opens URL → `VIEWER_MODE = true` → reads from `handover_public/{shareToken}` (no auth required)

**Firestore collections:**
- `handover_projects` — Kubix read/write only
- `handover_public/{shareToken}` — public read, Kubix write
- `handover_sync/{figmaFileKey}` — public read, Kubix write (plugin beacon)

**Plugin (`figma-plugin/ui.html`):**
- Iconify pixelarticons: reload, sun, moon, settings, chevron-left, external-link
- App URL: `kubix-design.netlify.app/handover`
- `firestore.googleapis.com` in manifest `networkAccess`

### 3. Shopify-to-Figma Pipeline (`shopify-to-figma/`)
Local Node.js/Express dashboard for Shopify theme section libraries.
- Server: `npm start` → `http://localhost:3001`
- Figma file: `uoFjCyCsednJEhryRm8G1k` ("Hyper Theme — Shopify Section Library")

---

## Design System Reference

| Token | Value | Usage |
|-------|-------|-------|
| `--kbx-yellow` | `#FFFF00` | Primary CTA, dark-mode accent |
| `--kbx-mint` | `#94F7A1` | Success, share link button |
| `--kbx-orchid` | `#E591E5` | Handover login ripple, designing status |
| `--kbx-teal` | `#0D6987` | Light-mode accent, completed status |
| Body font | `Nunito Sans` 300–700 | All UI text |
| Display font | `Domine` 400/700 | ICE scores, headings |
| Base size | `15px` | |
| Card radius | `2px` | Cards, panels, inputs |
| Button radius | `6–7px` | Buttons |
| Badge radius | `99px` | Pills, chips |

---

## Deployment

- Netlify site: `kubix-design.netlify.app`
- Repo: `github.com/kbx-ali/design-to-dev-handover`
- Auto-deploys on push to `main`
- Firebase authorized domain: `kubix-design.netlify.app`

---

## Next Steps / Open Items

- None outstanding — all features stable and deployed
- Potential: revoke/regenerate share token UX in the share modal
- Potential: show ripple animation colour as orchid in Figma plugin preview too
