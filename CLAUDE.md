# Kubix Design-to-Dev Handover — Project Notes

## What this project is
A design handover system built for Kubix, consisting of:
- **`design-to-dev-handover-v3-figma.html`** — the main designer dashboard (editor). Stored on GitHub Pages at `kbx-ali.github.io/design-to-dev-handover/`. Data persisted via GitHub Gist.
- **`index.html`** — public-facing viewer gateway. Serves an iframe when `?gist=xxx` is present, neutral "Project link required" page otherwise.
- **`figma-plugin/`** — Figma plugin (`code.js` + `ui.html`) for exporting frames directly into the handover app.

## Protection system (no auth)
Three-layer approach to hide the designer dashboard from developers/external parties:
1. **`index.html` gateway** — shared links are `/?gist=xxx`, pointing to `index.html` not the editor. Loads the editor in a full-page iframe so the editor filename never appears in the browser URL bar.
2. **Editor gate in `v3-figma.html`** — an IIFE that fires before anything renders. If no `gist_token` or `figma_token` in `localStorage` (and not in viewer/import mode), it replaces `document.body` with a neutral page and throws to halt execution.
3. **`getShareUrl()` root path** — uses `location.pathname.replace(/[^/]+$/, '')` to strip the editor filename, so generated share links always point to the directory root (`/?gist=xxx`) not `v3-figma.html?gist=xxx`.

## Deployment compatibility
- Works on **GitHub Pages**, **Netlify Drop**, or any static host.
- Both `index.html` AND `design-to-dev-handover-v3-figma.html` **must always be deployed together** in the same directory. If only one file is hosted, the iframe gateway breaks.
- Netlify automatically serves `index.html` for root requests — no extra config needed.
- The iframe src is a relative URL so it resolves correctly on any host.

## Local preview server
The macOS sandbox prevents `preview_start`-spawned processes from accessing `~/Desktop`. Workaround:
- Server script lives at `/tmp/serve_handover.py` — serves from `/tmp/handover-preview/`
- Before previewing, copy files: `cp /Users/alisisk/Desktop/Claude-Figma/index.html /Users/alisisk/Desktop/Claude-Figma/design-to-dev-handover-v3-figma.html /tmp/handover-preview/`
- `launch.json` uses `python3 /tmp/serve_handover.py`
- The server subclasses `SimpleHTTPRequestHandler` and passes `directory` explicitly to avoid `os.getcwd()` failures.

## Figma plugin details
- Plugin ID lives in `figma-plugin/manifest.json`
- All persistent data stored via Figma `clientStorage` — messages: `get-storage`, `set-storage`, `del-storage`
- Dark/light mode: `data-theme` attribute on `<html>`, persisted via `localStorage` key `kbx_plugin_theme`
- `buildExportData()` in `ui.html` generates frame-specific Figma URLs using `sourceFrameId.replace(':', '-')` as the `node-id` param — required for `parseFigmaUrl()` in the web app to work
- `figma.fileKey` returns `null` for draft/local files — mitigated by `cachedFileKey` (persisted after any cloud session) and the manual "Figma File URL" setting in the plugin

### Plugin clientStorage keys

| Key | What it stores |
|---|---|
| `appUrl` | Handover web app URL |
| `projectName` | Project name |
| `projectTheme` | Base theme name |
| `gistId` | Gist ID or URL for the pull feature |
| `hasExported` | Boolean — controls pull button visibility |
| `cachedFileKey` | Last-known Figma file key (survives draft sessions) |
| `manualFigmaUrl` | Full Figma file URL pasted in Settings |
| `sections_<fileKey>_<pageName>` | Section states (status, notes, included) per file+page |

### Plugin Settings panel fields
1. **Handover App URL** — where the web app is hosted (defaults to GitHub Pages URL)
2. **Figma File URL** — user pastes their Figma file URL; fileKey is extracted and stored as `cachedFileKey`; solves draft files where `figma.fileKey` returns null
3. **Gist ID** — enables the pull button (cloud icon in header); accepts full Gist URL or raw ID
4. **Danger Zone / Reset All Data** — two-step confirm button that deletes all `clientStorage` keys and resets in-memory state; navigating back cancels the pending confirm

### Plugin ↔ web app data flow
- **Plugin → web app**: `open-btn` builds a base64-encoded JSON payload and opens `appUrl?import=<encodeURIComponent(base64)>`. The `encodeURIComponent` wrapper is required — without it, `+` characters in base64 are decoded as spaces by `URLSearchParams.get()`, corrupting `atob()` silently.
- **Web app → plugin**: Pull button (`pull-btn`, visible only after first export) fetches the Gist and syncs section notes, statuses, project name, and theme back into the plugin. Skips web app default placeholder strings (`'Enter Project Name'`, `'Enter Base Theme Name'`).
- **Project matching**: The web app matches an incoming import to an existing project by `figmaFileUrl` file key. The plugin always constructs `figmaFileUrl` using `effectiveFileKey` (`state.fileKey || state.cachedFileKey`) so draft files still match correctly on re-import.

### `//` prefix stripping
- Frames named `// Section Name` in Figma are treated as explicit handover sections
- The prefix is stripped in `code.js` (`toSection`), in the web app via `stripSectionPrefix()` helper, and in the `pullFromGist` / `handlePluginImport` merge paths
- `stripSectionPrefix()` loops until all leading `//` are removed (handles accidental double-prefix)
- If no `//`-prefixed frames found, plugin falls back to direct child frames (no stripping needed)

## Key data structures
- `pages` object keyed by `'homepage' | 'collection' | 'product'` — each has `loomUrl`, `figmaUrl`, `sections[]`
- `sections[]` — array of objects with `name`, `status` (`'existing' | 'modified' | 'bespoke'`), `notes`, `figmaLink`, `useThemeSpacing`, `collapsed`
- Gist stores one JSON file (`checklist-data.json`) per project with structure `{ projectMeta: { title, theme }, pages: { homepage, collection, product } }`
- Multiple projects supported via `projects[]` array in `localStorage`; each project has `id`, `title`, `theme`, `gistId`, `pages`, `generalData`

### Web app section merge logic (`handlePluginImport`)
- Primary match: by `figmaLink` (exact URL match)
- Fallback match: by stripped section name (case-insensitive)
- Tracked by `existing.id` (not by `figmaLink` string) so sections with empty links are still matched
- `figmaLink: incoming.figmaLink || existing.figmaLink` — preserves stored link when re-importing with empty incoming link
- Unmatched existing sections (added manually in web app) are appended after merged sections

## Planned future work

### Designer onboarding landing page
Build a public landing page for designers (new and existing) to:
- **Download the web app files** (`index.html` + `design-to-dev-handover-v3-figma.html`) for self-hosting
- **Get the Figma plugin** (link to Figma Community or manual install instructions)
- **Step-by-step setup guide:**
  1. Get a GitHub token (Gist scope only)
  2. Get a Figma personal access token
  3. Install the Figma plugin
  4. Host the web app (Netlify Drop recommended for simplicity)
  5. Configure tokens in the app settings
- Should be branded Kubix, clean and simple
- Separate from the handover tool itself — purely informational/download page

### Figma file naming conventions (for onboarding docs)
The plugin uses a `//` prefix to identify section frames when a page has intermediate wrapper/layout frames nested before the actual content sections:
- Prefix any frame you want treated as a handover section with `//` followed by the section name
  - Examples: `// Hero Slider`, `// Header`, `// Product Grid`
- The plugin searches recursively through the frame hierarchy and collects only `//`-prefixed frames as sections
- The `//` prefix is automatically stripped from display names in both the plugin and the web app (see `stripSectionPrefix()` in the web app and `toSection()` in `code.js`)
- If no `//`-prefixed frames are found anywhere in a top-level frame, the plugin falls back to its original behaviour (direct child frames become sections)
- Only applies when frames are nested more than one level deep before the real sections — simple flat structures don't need the prefix
