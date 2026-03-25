#!/usr/bin/env bash
# ┌──────────────────────────────────────────────────────────────────────────┐
# │  Kubix Design → Dev Handover — Release packager                          │
# │                                                                          │
# │  Run:  bash release.sh                                                   │
# │                                                                          │
# │  Produces two zip files in dist/ ready to attach to a GitHub Release:   │
# │    · handover-app.zip   — index.html + design-to-dev-handover-v3-figma  │
# │    · figma-plugin.zip   — the Figma plugin folder                        │
# └──────────────────────────────────────────────────────────────────────────┘

set -e

REPO_ROOT="$(cd "$(dirname "$0")" && pwd)"
DIST="$REPO_ROOT/dist"

echo ""
echo "╔═══════════════════════════════════════════════╗"
echo "║  Design → Dev Handover  ·  Release Packager   ║"
echo "╚═══════════════════════════════════════════════╝"
echo ""

# ── Validate required files exist ─────────────────────────────────────────
for f in "index.html" "design-to-dev-handover-v3-figma.html" "figma-plugin/manifest.json"; do
  if [ ! -f "$REPO_ROOT/$f" ] && [ ! -d "$REPO_ROOT/figma-plugin" ]; then
    echo "  ✗  Missing: $f"
    echo "  Run this script from the project root."
    exit 1
  fi
done

# ── Clean and create dist/ ────────────────────────────────────────────────
rm -rf "$DIST" && mkdir -p "$DIST"
echo "  📁  Created dist/"

# ── 1. Package web app files ──────────────────────────────────────────────
echo "  📦  Packaging web app files…"
cd "$REPO_ROOT"
zip -j "$DIST/handover-app.zip" \
  index.html \
  design-to-dev-handover-v3-figma.html
echo "      ✓  handover-app.zip  ($(du -sh "$DIST/handover-app.zip" | cut -f1))"

# ── 2. Package Figma plugin ───────────────────────────────────────────────
echo "  🔌  Packaging Figma plugin…"
cd "$REPO_ROOT"
zip -r "$DIST/figma-plugin.zip" figma-plugin/ \
  --exclude "*/node_modules/*" \
  --exclude "*/.DS_Store" \
  --exclude "*/__pycache__/*"
echo "      ✓  figma-plugin.zip  ($(du -sh "$DIST/figma-plugin.zip" | cut -f1))"

# ── Summary ───────────────────────────────────────────────────────────────
echo ""
echo "  ─────────────────────────────────────────────"
echo "  ✅  Done — files in $DIST/"
echo ""
echo "  Next steps:"
echo ""
echo "  1. Commit and push your code changes:"
echo "       git add -A && git commit -m \"Release vX.Y.Z\" && git push"
echo ""
echo "  2. Open the Releases page:"
echo "       https://github.com/kbx-ali/design-to-dev-handover/releases/new"
echo ""
echo "  3. Set the tag (e.g.  v1.1.0)  and write release notes"
echo ""
echo "  4. Drag and drop both files from dist/ into the assets section:"
echo "       · dist/handover-app.zip"
echo "       · dist/figma-plugin.zip"
echo ""
echo "  5. Click Publish release"
echo "       → The landing page version badge updates automatically"
echo "       → /releases/latest/download/ links serve the new files instantly"
echo ""
