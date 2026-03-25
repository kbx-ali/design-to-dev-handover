# Session Memory

At the start of every session, read `primer.md` to restore context.

At the end of every session, **rewrite `primer.md` completely** to reflect:
- What this project is and its current state
- What changed this session
- Next steps
- Open blockers

> primer.md is the single source of truth for session continuity.

---

# Figma MCP Integration Rules

## Required Figma Workflow (do not skip steps)

1. Run `get_design_context` first for the exact node(s)
2. If response is large/truncated, run `get_metadata` to get the node map, then re-fetch specific nodes
3. Run `get_screenshot` for visual reference
4. Only after both steps above: download assets and start implementation
5. Validate final UI against Figma screenshot for 1:1 parity before marking complete

## Component Library

The Figma component library lives in file `TsyQQYJcZCOFc6OilAgLTV` (KBX — CRO App) on the **"🧩 Component Library"** frame.

### Available Components
| Component | Variants / Notes |
|-----------|-----------------|
| `Button` | `Type=Ghost/Yellow/Mint/Danger`, `State=Default/Hover` |
| `Badge/Status` | `Status=Backlog/Designing/Live/Completed` |
| `ICE Pill` | `Level=Low/Mid/High` |
| `Filter Pill` | `State=Default/Active/All` |
| `Section Label` | `Colour=Yellow/Mint/Teal` |
| `KPI Card` | `Variant=Yellow/Mint/Orchid/Teal/Muted` |
| `Panel` | `Size=Default/Tall` |
| `Project Card` | `Accent=Yellow/Mint/Teal` |
| `Nav Bar` | Single component |
| `Modal` | `Size=Small/Default/Large` |
| `Form Field` | `Type=Input/Select/Textarea`, `State=Empty/Focus/Filled` |
| `Toast` | `Type=Success/Error/Info` |
| `Empty State` | Single component |
| `Spinner` | Single component |
| `Table Row` | `Role=Header/Row`, `State=Default/Hover` |
| `Action Button` | `State=Default/Hover/Danger` |
| `Theme Toggle` | `Active=Dark/Light` |
| `User Chip` | Single component |
| `Page Tag` | Single component |

## Brand Design Tokens

### Typography
- **Body / UI:** `Nunito Sans` — weights 300/400/500/600/700
- **Display / Numbers:** `Domine` — weights 400/700
- Base font size: `15px`

### Brand Colours
| Token | Hex | Usage |
|-------|-----|-------|
| `--kbx-yellow` | `#FFFF00` | Primary CTA, active states, accent |
| `--kbx-yellow-dk` | `#CCCC00` | Yellow hover |
| `--kbx-mint` | `#94F7A1` | Success, live, positive ICE |
| `--kbx-orchid` | `#E591E5` | Designing status |
| `--kbx-teal` | `#0D6987` | Completed status, accent (light theme) |
| `--kbx-black` | `#28282B` | Text on coloured backgrounds |

### Dark Theme Surfaces
| Token | Hex |
|-------|-----|
| `--bg` | `#141416` |
| `--bg-card` | `#1E1E21` |
| `--bg-input` | `#252528` |
| `--border` | `#2E2E33` |
| `--border-lt` | `#3E3E44` |
| `--text` | `#FFFFFF` |
| `--text-sec` | `#D4D4D8` |
| `--text-mute` | `#878790` |

### Light Theme Surfaces
| Token | Hex |
|-------|-----|
| `--bg` | `#F5F5F0` |
| `--bg-card` | `#FFFFFF` |
| `--text` | `#28282B` |
| `--text-mute` | `#818188` |
| `--accent-text` | `var(--kbx-teal)` (not yellow) |

## Styling Rules

- IMPORTANT: Never hardcode hex colours — always use CSS custom properties (`var(--token-name)`)
- IMPORTANT: Never hardcode font families — use `font-family: inherit` or the token values
- The app is a single-file vanilla HTML/CSS/JS app at `cro/index.html`
- All styles live in `<style>` inside `index.html` — no separate CSS files
- Border-radius follows the design system: `2px` for cards/panels/inputs, `6–7px` for buttons, `99px` for badges/chips
- Both dark and light themes must be supported — all components use CSS variables that swap per `[data-theme]`

## Asset Handling

- IMPORTANT: If Figma MCP returns a `localhost` source for an image/SVG, use it directly
- IMPORTANT: Do NOT install icon packages — all icons are inline SVG in `index.html`
- Pixel-art SVG icons are used throughout (not emoji, not icon fonts)
- Logo images for client cards live in Firebase Storage

## Project-Specific Patterns

- The app uses Firebase Auth (Google sign-in) and Firestore for data
- All screens are `<div class="screen">` toggled with the `.active` class
- Modals use `.modal-overlay` + `.modal` with `.open` to show
- Status badges always include a `<span class="badge-dot">` + text
- ICE scores use `Domine Bold` font at large sizes
- Filter bar uses `.flt-btn` + `.f-active` / `.f-all` for state
- Dark/light theming is controlled by `data-theme` attribute on `<html>`
