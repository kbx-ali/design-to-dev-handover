# Session Primer — CRO Planner / KBX Figma + Shopify-to-Figma

## Projects

### 1. KBX CRO App (`cro/index.html`)
Single-file vanilla HTML/CSS/JS app. Firebase Auth (Google OAuth, `@kubixmedia.co.uk` only). Firestore data. Dark/light theme via CSS custom properties.
- Figma file: `TsyQQYJcZCOFc6OilAgLTV` (KBX — CRO App)
- Preview: `npx serve . -p 3000` in `/cro` (name: `CRO Web App` in launch.json)
- Login screen: dot-matrix canvas + KUBIX CRO Planner brand logo + Google sign-in button with animated gradient border

### 2. Shopify-to-Figma Pipeline (`shopify-to-figma/`)
A local Node.js/Express dashboard for uploading Shopify theme ZIPs, previewing all sections via `shopify theme dev`, and building Figma section libraries.
- Server: `npm start` in `/shopify-to-figma` → `http://localhost:3001`
- Figma file: `uoFjCyCsednJEhryRm8G1k` ("Hyper Theme — Shopify Section Library")

---

## Shopify-to-Figma: Full Session History

### What Was Built

#### Dashboard App (`shopify-to-figma/`)
- `server.js` — Express server: ZIP upload (multer), extraction (adm-zip), section parsing, Shopify CLI command generator, SSE log streaming
- `index.html` — 4-step UI: ZIP drop → Store URL → Copy terminal command → Generate Figma
- `lib/theme-parser.js` — Parses `sections/*.liquid`, extracts `{% schema %}` JSON, infers section type by handle pattern
- `lib/preview-builder.js` — Writes `index.liquid` (Liquid template, no 25-section limit), backs up `index.json` to `.sfp-backups/` OUTSIDE theme dir to avoid Shopify CLI conflicts
- `sample-data/products.csv` — 16 products (Arc Chair, Beam Table, Oslo Sofa, etc.) with Unsplash images, variants, prices, tags

#### Figma Section Library (`uoFjCyCsednJEhryRm8G1k`)
10 pages built programmatically via `use_figma` (Figma Plugin API):

| Page | Contents |
|------|----------|
| 🏠 Overview | Rainbow summary cards — 67 sections across 7 types |
| ⚡ Hero | 8 sections |
| 🛒 Commerce | 14 sections |
| 📝 Content | 12 sections |
| 🎨 Media | 10 sections |
| ⭐ Social Proof | 6 sections |
| ❓ FAQ & Form | 8 sections |
| ⚙️ General & Nav | 9 sections |
| 📐 Page Layouts | Annotated wireframes: Homepage (12 sections), Collection, Product page — real heights and content labels |
| 🛍️ Product Catalog | All 16 products, 28 SKUs — price, variants, tags (bestseller/trending/sale/new/gift) |

Each section card: 360×140px dark frame, colour-coded left accent bar, type badge, section name, `handle.liquid`, settings · blocks count.

---

### Key Technical Lessons

#### Shopify CLI
- **TTY issue**: Shopify CLI v3 uses `@inquirer/prompts` which checks `process.stdin.isTTY` → throws "Failed to prompt" when spawned as a Node child process. **Fix**: don't spawn it — generate the shell command and let user run it manually in their own terminal.
- **25-section JSON limit**: `templates/index.json` max 25 sections in `order` array. **Fix**: use `index.liquid` template instead (no limit). `{% section 'handle' %}` can only be called from template files, NOT from within other section files.
- **index.backup.json conflict**: Backing up `index.json` as `index.backup.json` inside `templates/` causes Shopify to treat it as an `index` template variant → "Filename index already exists with json extension" error. **Fix**: store backup at `../.sfp-backups/index.json` OUTSIDE the theme directory.
- **Dev store password**: Shopify development stores force password protection (can't be disabled). Must pass `--store-password` to `shopify theme dev`.
- **Sections rendering black**: `index.liquid` renders sections with zero settings — no collection assigned, no blog selected etc. Sections need settings configured to display content. The dev store approach is limited without importing real data AND configuring section settings.

#### Figma Plugin API (`use_figma`)
- **Async IIFE returning no value**: `(async () => { ... })()` at the top level doesn't block — the tool captures the return of the outer expression (a Promise), not the resolved value. **Fix**: use top-level `await` directly (Figma's sandbox supports it): `await figma.loadFontAsync(...)` then synchronous operations.
- **`figma.currentPage =` not allowed**: Use `await figma.setCurrentPageAsync(page)` instead.
- **`page.fills` doesn't exist**: Pages have `backgrounds`, not `fills`. Setting `page.fills` throws "object is not extensible". Use fill-less frames or skip background setting on Page nodes.
- **No network access in plugin sandbox**: `figma.fetch()` → "not a function". Global `fetch()` → "not defined". `figma.createImageAsync(url)` → "not a supported API". Cannot fetch external images from within `use_figma` code.
- **`figma.createImageAsync` with URL**: Not supported in this plugin context.
- **Empty fills array**: `frame.fills = []` can cause issues — use a transparent fill `[{type:'SOLID',color:{r:0,g:0,b:0},opacity:0}]` for transparent frames.

#### `generate_figma_design` (live page capture)
- This capability is **NOT available via the cloud MCP server**. It requires:
  1. Figma **desktop app** running
  2. The Figma MCP plugin running **locally** (not cloud)
  3. A local connection between Claude and the desktop plugin
- See setup instructions below.

---

### What Didn't Work

| Attempt | Failure | Reason |
|---------|---------|--------|
| Spawn `shopify theme dev` as child_process | TTY error | CLI requires interactive terminal |
| `templates/index.json` with 25+ sections | Hard limit error | Shopify JSON template cap |
| `index.backup.json` inside `templates/` | Filename conflict | Shopify treats any `.json` in templates/ as a template |
| Sections rendering with content | All black | No settings configured, no data assigned |
| `figma.fetch()` for CDN images | "not a function" | No network access in plugin sandbox |
| `figma.createImageAsync(url)` | "not a supported API" | URL overload not available in this plugin |
| `generate_figma_design` from demo URL | Tool not found | Requires Figma desktop + local MCP plugin |
| Chrome MCP screenshots | "Cannot access chrome-extension URL" | Extension cross-origin permission boundary |
| Claude-flow browser_screenshot | `spawnSync ENOENT` | Puppeteer/agent-browser binary not installed |

---

## How to Set Up Figma Desktop MCP (for `generate_figma_design`)

See section below in this primer — or ask Claude to explain the Figma desktop MCP setup.

**Short version:**
1. Install Figma desktop app
2. Enable MCP server in Figma: Preferences → Enable MCP Server (or via Figma Dev Mode plugin)
3. Configure Claude Code to connect to it locally (add to `settings.json` MCP section pointing to `localhost` or the Figma socket)
4. With that running, `generate_figma_design` becomes available and can capture any browser URL as Figma frames

---

## Next Steps

- **Figma desktop MCP setup** → enables `generate_figma_design` to capture `hyper-theme-demo.myshopify.com` pages as actual visual frames
- **Configure section settings** in dev store → assign collections, blogs etc so sections render with real content
- **Convert section cards to real Figma components** → use `use_figma` to call `figma.createComponent()` on each section card frame
- **Add image thumbnails** → once desktop MCP works, replace placeholder image areas in product catalog with real product photos

---

## Dev Store Info
- Store: Set up via Shopify Partners at dev.shopify.com
- Products: 17 products, 28 SKUs imported from `sample-data/products.csv`
- Collections created with automated tags: furniture, chairs, tables, decor, lighting, rugs, sofas
- Sections still render empty (no settings configured)
