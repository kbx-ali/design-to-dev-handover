# Kubix Design-to-Dev Handover — Project Notes

## What this project is
A design handover system built for Kubix, consisting of:
- **`design-to-dev-handover-v3-figma.html`** — the main designer dashboard (editor). Stored on GitHub Pages at `kbx-ali.github.io/design-to-dev-handover/`. Data persisted via GitHub Gist.
- **`index.html`** — public-facing viewer gateway. Serves an iframe when `?gist=xxx` is present, redirects to the editor for `?import=` and `?project=` params, neutral "Project link required" page otherwise.
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

## ⚠️ Plugin reload required
**Whenever any change is made to `figma-plugin/manifest.json`, `code.js`, or `ui.html`, the plugin MUST be reloaded in Figma before the changes take effect.**

How to reload:
1. Close the plugin panel if open
2. Right-click the canvas → **Plugins → Development → Design → Dev Handover**

Figma re-reads all plugin files from disk on each relaunch. Skipping this step means the old code is still running and any fix or new feature will appear broken.

---

## Figma plugin details
- Plugin ID lives in `figma-plugin/manifest.json`
- `manifest.json` must include `networkAccess.allowedDomains: ["https://api.github.com"]` — without it Figma's sandbox blocks all `fetch()` calls to the GitHub API (pull will silently fail with a network error)
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
| `githubToken` | GitHub personal access token for authenticated Gist pulls |
| `sections_<fileKey>_<pageName>` | Section states (status, notes, included) per file+page |

### Plugin Settings panel fields
1. **Handover App URL** — where the web app is hosted (defaults to GitHub Pages URL)
2. **Figma File URL** — user pastes their Figma file URL; fileKey is extracted and stored as `cachedFileKey`; solves draft files where `figma.fileKey` returns null
3. **Gist ID** — enables the pull button (cloud icon in header); accepts full Gist URL or raw ID
4. **GitHub Token** — same personal access token used in the web app; added to the Authorization header on pull requests; required because Figma routes plugin network requests through shared servers, causing unauthenticated GitHub API calls to hit rate limits and return 403
5. **Danger Zone / Reset All Data** — two-step confirm button that deletes all `clientStorage` keys and resets in-memory state; navigating back cancels the pending confirm

### Plugin ↔ web app data flow
- **Plugin → web app**: `open-btn` builds a base64-encoded JSON payload and opens `appUrl?import=<encodeURIComponent(base64)>`. The `encodeURIComponent` wrapper is required — without it, `+` characters in base64 are decoded as spaces by `URLSearchParams.get()`, corrupting `atob()` silently.
- **Web app → plugin**: Pull button (`pull-btn`, visible only after first export) fetches the Gist and syncs section notes, statuses, project name, and theme back into the plugin. Skips web app default placeholder strings (`'Enter Project Name'`, `'Enter Base Theme Name'`). Requires `githubToken` in plugin Settings — unauthenticated requests return 403 because Figma routes all plugin network calls through shared servers, hitting GitHub's rate limit instantly.
- **Project matching**: The web app matches an incoming import to an existing project — **gistId first**, then Figma file key as a fallback. Preferring gistId prevents "ghost" projects (auto-created by old failed syncs) from intercepting updates. The plugin always sends `gistId: extractGistId(state.gistId)` and constructs `figmaFileUrl` using `effectiveFileKey` (`state.fileKey || state.cachedFileKey`) so draft files still match correctly.

### Open button dirty state
- `state.isDirty` (`boolean`) — set to `true` whenever the user edits notes or changes a section status in the plugin
- `updateOpenBtn()` toggles the button appearance based on `isDirty`:
  - `false` → Yellow, label **"Open in Handover"** (default)
  - `true` → Orchid `#E591E5`, label **"Sync Changes with Handover"**
- `isDirty` is reset to `false` on: successful pull, open-btn click
- This gives the designer a clear visual signal that unsaved changes exist and need to be pushed back to the web app

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
- **Project matching** (in priority order):
  1. By `gistId` (`data.gistId === p.gistId`) — **preferred** because this is the explicit user-configured link. Also guards against "ghost" projects (empty auto-created projects from old failed syncs) that may have a matching `figmaFileUrl` from a previous import
  2. By Figma file key extracted from `data.figmaFileUrl` — only used if no gistId match found
  - When a brand-new project is created from a plugin import (no match found), the incoming `gistId` is stored on the new project immediately so the next sync will match it
- **Section matching** (within the matched project, in priority order):
  1. By `figmaLink` (exact URL match)
  2. By stripped section name (case-insensitive)
- Tracked by `existing.id` (not by `figmaLink` string) so sections with empty links are still matched
- `figmaLink: incoming.figmaLink || existing.figmaLink` — preserves stored link when re-importing with empty incoming link
- `notes: incoming.notes || existing.notes` — plugin note wins if non-empty; web-app note preserved if plugin has none
- `status: incoming.status || existing.status` — plugin status **always wins** (always a valid truthy string: `'existing'`/`'modified'`/`'bespoke'`). This correctly handles the case where a designer resets a section back to `'existing'` from `'bespoke'`
- Unmatched existing sections (added manually in web app) are appended after merged sections
- After merging, `saveToGist()` is called immediately — this prevents the 15-second Gist poller from overwriting the merged data with stale Gist content before the user can see the changes (the poller uses `lastHash` equality to skip unchanged data; without the immediate save, `lastHash` is empty and the poller always overwrites)
- Diagnostic `console.log('[PluginImport] ...')` lines trace: incoming gistId + fileKey, which project was matched (and by which method), section-level merge results. Check the browser console to debug any matching issues

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

---

## Session log — 2026-03-11

### Issues diagnosed and fixed

#### 1. Pull button returning "Pull failed" — missing `networkAccess` in manifest
**Symptom:** Clicking the pull button always showed "⚠ Pull failed — check Gist ID in Settings" even with a correct Gist ID.
**Root cause:** `figma-plugin/manifest.json` had no `networkAccess` declaration. Figma's sandbox blocks all `fetch()` calls from the plugin UI unless the target domain is explicitly listed. The request never reached GitHub.
**Fix:** Added `"networkAccess": { "allowedDomains": ["https://api.github.com"] }` to `manifest.json`.
**Reload required:** Yes — manifest changes only take effect when the plugin is relaunched in Figma.

#### 2. Pull button returning 403 after manifest fix
**Symptom:** After adding `networkAccess`, the pull reached GitHub but returned HTTP 403.
**Root cause:** Figma routes all plugin network requests through shared infrastructure. Multiple Figma users share the same outbound IP, so GitHub's 60 req/hour unauthenticated rate limit is hit almost immediately.
**Fix:** Added a **GitHub Token** field to the plugin Settings screen. The token (same one used in the web app) is stored in `clientStorage` under key `githubToken` and added as `Authorization: token <value>` on all Gist fetch requests. Authenticated requests get a 5,000 req/hour limit.
**Reload required:** Yes.

#### 3. Pull button returning 401 after token added
**Symptom:** HTTP 401 Unauthorized from GitHub after the token field was added.
**Root cause:** The token value entered in plugin Settings was invalid or expired — not a code issue.
**Fix:** User generated a fresh GitHub classic personal access token with `gist` scope and pasted it into both the web app (GitHub Sync modal) and the plugin (Settings → GitHub Token).

#### 4. Plugin changes not appearing in web app after "Open in Handover"
**Symptom:** After pulling from Gist into the plugin, editing notes/status, then clicking "Open in Handover", the web app showed the old data.
**Root cause:** Two issues:
  - The `handlePluginImport` merge logic was correct, but the web app's 15-second Gist poller immediately overwrote the merged data. On a fresh `?import=` page load, `lastHash` is `''`, so the first poll always treated the Gist as "new data" and overwrote everything.
  - There was no visual signal in the plugin that unsaved changes existed.
**Fix 1 (web app):** `handlePluginImport` now calls `saveToGist()` immediately after merging plugin changes into the project. This pushes the merged data to the Gist and sets `lastHash`, so the poller finds no change and skips the overwrite.
**Fix 2 (plugin):** Added `state.isDirty` tracking and `updateOpenBtn()`. The "Open in Handover" button turns Orchid (`#E591E5`) and reads "Sync Changes with Handover" as soon as any note or status is edited. It resets to yellow after clicking or after a successful pull.
**Reload required:** Yes (plugin changes).

#### 5. "Sync Changes with Handover" not applying changes to the correct project
**Symptom:** After editing notes/status in the plugin and clicking "Sync Changes with Handover", the web app refreshed but the original project was unchanged.
**Root cause:** `handlePluginImport` matched projects exclusively by Figma file key from `figmaFileUrl`. Projects created manually in the web app have no `figmaFileUrl` stored (`generalData.figmaFileUrl = ''`), so the file key match always fails and a **new project** is silently created instead of updating the existing one.
**Fix:** Two-part:
  1. Plugin's `buildExportData` now includes `gistId: extractGistId(state.gistId)` in the export payload.
  2. `handlePluginImport` now falls back to matching by `gistId` if the file key match fails — allowing it to find the correct project even when no Figma URL is stored.
**Reload required:** Yes (plugin change).

#### 6. Changes STILL not reflecting — ghost project + matching priority bug (session 2)
**Symptom:** Sync Changes still not working even after fix #5. Changes never appear in the project the user expected.
**Root causes diagnosed:**
  - **Ghost project collision**: Old failed syncs (before fix #5) had already auto-created a new project with `figmaFileUrl` set but `gistId: ''`. Because file key matching ran FIRST, every subsequent sync matched the ghost project (which was empty/stale) instead of the user's manually-configured project.
  - **Status reset not honoured**: The old merge code `(incoming.status && incoming.status !== 'existing') ? incoming.status : existing.status` silently discarded any designer change back to `'existing'`.
  - **New projects didn't store incoming gistId**: When a brand-new project was created from a plugin import, `gistId` was hardcoded to `''` — so the very next sync couldn't find it by gistId either.
**Fixes (web app only — no plugin reload required):**
  1. **Swap matching priority**: `gistId` match now runs FIRST, before fileKey. This routes syncs to the explicitly-configured project and bypasses any ghost project.
  2. **Fix status merge**: Changed to `incoming.status || existing.status` — since all valid statuses are truthy strings, the plugin's chosen status always wins.
  3. **Persist gistId on new projects**: When `handlePluginImport` creates a new project, it now stores `gistId: data.gistId || ''` so the next sync finds it immediately.
  4. **Added diagnostic console.logs**: `[PluginImport]` prefixed logs trace gistId, fileKey, match result, and per-section merge output. Open browser DevTools → Console when syncing to see exactly what's happening.
**Reload required:** No — this is a web app change only.

---

### Figma file naming conventions (for onboarding docs)
The plugin uses a `//` prefix to identify section frames when a page has intermediate wrapper/layout frames nested before the actual content sections:
- Prefix any frame you want treated as a handover section with `//` followed by the section name
  - Examples: `// Hero Slider`, `// Header`, `// Product Grid`
- The plugin searches recursively through the frame hierarchy and collects only `//`-prefixed frames as sections
- The `//` prefix is automatically stripped from display names in both the plugin and the web app (see `stripSectionPrefix()` in the web app and `toSection()` in `code.js`)
- If no `//`-prefixed frames are found anywhere in a top-level frame, the plugin falls back to its original behaviour (direct child frames become sections)
- Only applies when frames are nested more than one level deep before the real sections — simple flat structures don't need the prefix

---

## Session log — 2026-03-11 (session 2)

### Issues diagnosed and fixed

#### 7. `index.html` gateway ignores `?import=` and `?project=` parameters
**Symptom:** If a user sets the plugin's App URL to a root path (e.g. `https://mysite.netlify.app/`), clicking "Open in Handover" shows the "Project link required" landing page instead of importing the data.
**Root cause:** `index.html` only handled `?gist=` — all other query parameters were ignored, showing the neutral landing page.
**Fix:** Added detection for `?import=` and `?project=` parameters. When either is present, `index.html` now uses `location.replace()` to redirect to the editor HTML with the full query string preserved.

#### 8. Plugin export payload too large for URL transfer
**Symptom:** With many sections or long notes, the `?import=` URL could exceed length limits in `figma.openExternal()`, causing silent import failures.
**Root cause:** `buildExportData()` included all three page types (even empty ones), default boolean fields (`useThemeSpacing`, `collapsed`), generated IDs, and empty strings — all unnecessary bloat.
**Fix:** Optimised `buildExportData()` to only send the active page, omit default values (`useThemeSpacing`, `collapsed`, `id`), and skip empty `notes`. Added a URL length warning toast when the URL exceeds 8000 characters.

#### 9. Silent import failures — no user feedback
**Symptom:** When `?import=` parsing failed (e.g. truncated URL), the web app silently fell through to the library view. The user had no idea what went wrong.
**Fix:** Added `console.log` diagnostics for successful import parsing, `console.error` for failures, and an `alert()` dialog explaining the error and suggesting the user reduce section count/notes.

#### 10. fileKey-matched projects never upgrade to gistId matching
**Symptom:** A project matched by fileKey on the first sync would never adopt the plugin's gistId, so future syncs still relied on fileKey matching (which can hit ghost projects).
**Fix:** Added `if (data.gistId && !existingProj.gistId) existingProj.gistId = data.gistId;` to `handlePluginImport` so fileKey-matched projects upgrade to gistId matching on subsequent syncs.

#### 11. New projects created from plugin don't save to Gist immediately
**Symptom:** A project created via `?import=` only existed in localStorage. If the user expected it to appear in the Gist (for pulling back into the plugin), it wouldn't be there until the user manually triggered a save.
**Fix:** Added `saveToGist()` call after `openProject()` in the new-project creation path. This is a no-op if no Gist token is configured.

### Critical deployment note
All previous session fixes (gistId-first matching, status merge fix, dirty state tracking, GitHub token for pull, immediate saveToGist after merge) were in the **working tree only** — never committed or deployed. The plugin opens the **deployed** web app at `kbx-ali.github.io`, which still had the old buggy `handlePluginImport`. This was the root cause of all three reported issues. **All changes must be committed and pushed to GitHub Pages for the fixes to take effect.**
