# Session Primer — KBX Figma Tools

## Projects

### 1. KBX CRO App (`cro/index.html`)
Single-file vanilla HTML/CSS/JS app. Firebase Auth (Google OAuth, `@kubixmedia.co.uk` only). Firestore data. Dark/light theme via CSS custom properties.
- Figma file: `TsyQQYJcZCOFc6OilAgLTV` (KBX — CRO App)
- Preview: `npx serve . -p 3000` in `/cro`

### 2. Design → Dev Handover App (`handover/index.html` + `figma-plugin/ui.html`)
Single-file vanilla HTML/CSS/JS app. Same Firebase project as CRO. Live at `kubix-design.netlify.app/handover`.
- Repo: `kbx-ali/design-to-dev-handover` — Netlify auto-deploys on push to `main`
- Firebase project: `cro-strategic-roadmap`

**Current state (stable as of 2026-03-31):**
- Login screen: dot-matrix ripple (orchid), glassmorphism card, animated Google gradient border
- Share Link button always visible when a project is open
- Google Drive assets integration fully working (uploads to Kubix Shared Drive, not Firebase Storage)
- Plugin ↔ web app sync fully working (both directions)

**Google Drive assets:**
- `generalData.driveUrl` — project-level folder URL, editable in General tab
- Per-section `driveUrl` override + `assets: []` dropzone per section card
- Drive scope in `_authProvider()` so token captured at initial sign-in (no second popup)
- `supportsAllDrives=true` on all Drive API calls for Shared Drive folders
- Asset chips shown in editor and viewer; click opens in Drive; editor has × remove

**Plugin ↔ web app sync (fully working):**

*Plugin → web app:*
- Plugin clicks "Sync Changes with Handover" → encodes export data as base64 in URL (`?import=...`)
- Web app receives it in `handlePluginImport(data)`, creates/updates project
- On first export a unique `pluginSyncId` is generated and persisted in plugin `clientStorage`
- Web app stores `pluginSyncId` on the project and writes `handover_sync/{pluginSyncId}` immediately
- Share token is auto-generated on first plugin import (no manual "Share Link" click needed)

*Web app → plugin:*
- Every `scheduleSave()` writes `handover_sync/{pluginSyncId}` AND `handover_sync/{figmaFileKey}` (if available) with `{ updatedAt, updatedBy, shareToken }`
- Plugin polls both keys every 60s via unauthenticated Firestore REST API
- When `updatedAt > lastSyncTs`, the pull button (↺) appears in the plugin header with a yellow dot
- Clicking pull reads `handover_public/{shareToken}` and matches sections by **name** (not ID) to update notes + status
- After pulling, `lastSyncTs` is updated and the pull button hides

*Important: a first "Sync to Handover" from the plugin is required before web→plugin sync works — this establishes the `pluginSyncId` handshake.*

**Why `figma.fileKey` is not relied on:**
- `figma.fileKey` returns `null` for draft/local files
- The `pluginSyncId` fallback means sync works regardless of whether Figma provides a file key
- If `figma.fileKey` IS available, both keys are written/polled (redundant = more reliable)

**Firestore collections:**
- `handover_projects` — Kubix read/write only
- `handover_public/{shareToken}` — public read, Kubix write (viewer + plugin pull source)
- `handover_sync/{key}` — public read, Kubix write (`key` = figmaFileKey OR pluginSyncId)

**Plugin (`figma-plugin/ui.html`):**
- All icons are inline SVG (Iconify CDN was removed — blocked by Figma sandbox)
- App URL: `kubix-design.netlify.app/handover`
- `firestore.googleapis.com` in manifest `networkAccess.allowedDomains`
- `PLUGIN_VERSION = 'v1.0.0'` — version check hits GitHub Releases API; `v1.1.0` banner appears (working correctly, opens landing page)
- `localStorage` wrapped in `_safeLS()` try/catch (data: URL context blocks it in Figma)
- Plugin must be manually reloaded in Figma after `ui.html` changes (import manifest again)

**Key CSS tokens (handover):**
- Light: `--accent-text: var(--kbx-teal)` · Dark: `--accent-text: var(--kbx-yellow)`
- Surfaces: `--bg-page`, `--bg-card`, `--bg-input`, `--border`, `--text-pri`, `--text-sec`, `--text-mute`, `--text-sub`
- No `--bg` or `--text` (use `--bg-page` / `--text-pri`)

---

### 3. Handover Landing Page (`landing.html`)
Live at `kubix-design.netlify.app/handover-plugin` (served via `netlify.toml` redirect → `/landing.html` at repo root).
Plugin `LANDING_URL` updated to `https://kubix-design.netlify.app/handover-plugin`.

**Landing page current state (as of 2026-04-01):**
- Setup guide rewritten to 3 steps (no tokens, no hosting, no config)
  - Step 1 (yellow): Install plugin — download zip, import manifest in Figma dev mode
  - Step 2 (mint): Sign in at `/handover` with `@kubixmedia.co.uk` Google account
  - Step 3 (orchid): Paste Figma file URL in plugin Settings
- All three step mockups updated to reflect real UI (screenshots used as reference):
  - Step 1: Figma context menu + file picker showing `manifest.json` selected
  - Step 2: Faithful HTML/CSS recreation of the real login card (glassmorphism, pixel-art logo, KUBIX wordmark, Google sign-in button)
  - Step 3: Plugin settings panel with label, input, hint text
- Stale copy removed (GitHub Gist references gone)
- Orchid dot-matrix ripple canvas animation added behind the plug-ui, on continuous loop
  - Canvas (`#plug-canvas`) sits inside `#plugin` (z-index: 2), sized to `section height + 340px BLEED` so it physically extends into the "How It Works" section below
  - Origin fixed at `cx = w * 0.72` (right column centre, always within canvas bounds)
  - `canvas.style.height` set explicitly in JS so CSS doesn't clamp it
- Ripple bleeds into "How It Works" section with graceful fade:
  - `.how-it-works` z-index: 3 (content above canvas)
  - `.how-it-works` background: transparent (canvas shows through)
  - `.how-it-works::before` — full-height gradient overlay, `bottom: 0`, transparent→`rgb(20,20,22)` top-to-bottom, z-index: 0 (above canvas, below content)
  - `.how-it-works > *` z-index: 1 (content above the gradient overlay)
  - `background-image: none` on `.how-it-works` to suppress `.grid-dk` white grid (prevented double-grid moiré with canvas)

**Not yet pushed to main** — ask user before pushing.

---

### 4. Shopify-to-Figma Pipeline (`shopify-to-figma/`)
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
- Landing page live at `kubix-design.netlify.app/handover-plugin`

> **Always ask** before pushing to main — user may not know when a push is needed to trigger a Netlify deploy. Prompt: "Would you like me to push these changes to main so Netlify deploys them?"

---

## Next Steps

- **Push landing.html to main** — canvas ripple + bleed fixes not yet deployed
- **Landing page:** Continue redesigning other sections beyond the setup guide
- Potential: revoke/regenerate share token UX in share modal
- Potential: bump `PLUGIN_VERSION` to `v1.1.0` to clear the update banner (after landing page is live on Netlify)
