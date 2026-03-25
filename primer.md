# Session Primer — CRO Planner / KBX Figma

## Project Overview
A single-file vanilla HTML/CSS/JS CRO project management app for Kubix Media (`cro/index.html`).
- Firebase Auth (Google OAuth, restricted to `@kubixmedia.co.uk`)
- Firestore for data
- Dark/light theme support via `data-theme` CSS tokens
- All styles in `<style>` inside `index.html` — no build step

Figma file: `TsyQQYJcZCOFc6OilAgLTV` (KBX — CRO App)

---

## What Changed This Session

### Brand Logo on Login Card ✅
Replaced `div.login-k` (K icon + KUBIX wordmark horizontal) and `h1.login-h1` ("CRO Planner") with the combined KUBIX CRO Planner brand lock-up used in the dashboard header:

```html
<div class="brand" style="justify-content:center;margin:0 auto 32px;">
  <svg class="brand-icon" ...K pixel icon...></svg>
  <div class="brand-wordmark-wrap">
    <svg class="kubix-wordmark" width="94" height="23" ...></svg>
    <div class="brand-sub">CRO Planner</div>
  </div>
</div>
```

`.brand-sub` renders as `11.5px` uppercase `CRO PLANNER` beneath the KUBIX wordmark. The stale `.login-k` and `.login-h1` CSS rules remain in the stylesheet but are unused (orphaned).

---

### Sign-in Button Fix ✅
**Problem:** `signInWithPopup` was blocked by the browser (popup blocker). The fallback `auth.signInWithRedirect(provider)` was called silently with no `.catch()`, so errors were swallowed and the button appeared dead. In the Claude preview iframe, redirect navigation is also blocked — giving no feedback at all.

**Fix — rewritten auth functions:**

```javascript
function _authProvider() {
  const p = new firebase.auth.GoogleAuthProvider();
  p.addScope('https://www.googleapis.com/auth/drive.file');
  p.setCustomParameters({ hd: 'kubixmedia.co.uk', prompt: 'select_account' });
  return p;
}
function _authSetBtnLoading(on) {
  const btn = document.querySelector('.btn-google');
  if (!btn) return;
  btn.disabled = on;
  btn.style.opacity = on ? '0.55' : '';
  btn.style.pointerEvents = on ? 'none' : '';
}
function _authShowErr(html) {
  const el = document.getElementById('login-err');
  if (!el) return;
  el.innerHTML = html;
  el.style.display = html ? 'block' : 'none';
}

function signInWithGoogle() {
  _authShowErr('');
  _authSetBtnLoading(true);
  auth.signInWithPopup(_authProvider()).then(result => {
    if (result.credential?.accessToken) state.driveAccessToken = result.credential.accessToken;
  }).catch(err => {
    _authSetBtnLoading(false);
    if (err.code === 'auth/popup-closed-by-user' || err.code === 'auth/cancelled-popup-request') return;
    if (err.code === 'auth/operation-not-supported-in-this-environment' || err.code === 'auth/popup-blocked') {
      _authShowErr('Pop-ups are blocked by your browser. <a href="#" onclick="signInViaRedirect();return false;" style="color:var(--accent-text);text-decoration:underline;white-space:nowrap;">Try redirect sign-in →</a>');
      return;
    }
    if (err.code === 'auth/unauthorized-domain') {
      _authShowErr('This domain isn\'t authorised in Firebase. Add it under Authentication → Settings → Authorised domains.');
      return;
    }
    _authShowErr(err.message?.includes('hd') ? 'Please use your @kubixmedia.co.uk Google account.' : `Sign-in failed (${err.code || 'unknown'}). Please try again.`);
  });
}

function signInViaRedirect() {
  _authShowErr('');
  _authSetBtnLoading(true);
  auth.signInWithRedirect(_authProvider()).catch(err => {
    _authSetBtnLoading(false);
    _authShowErr(`Redirect sign-in failed (${err.code || 'unknown'}). Please try again.`);
  });
}
```

**Key behaviours:**
- Button is disabled + dimmed while popup is opening
- Popup blocked → shows yellow `"Try redirect sign-in →"` link (inline HTML in error div)
- Redirect errors now caught and surfaced
- `auth/popup-closed-by-user` / `auth/cancelled-popup-request` → silent (expected)

**CSS added to `.login-err`:**
```css
.login-err { ... line-height:1.5; }
.login-err a { color:var(--accent-text) !important; }
```

---

### Animated Google Gradient Border on `.btn-google` ✅
On hover, the button border animates through Google brand colours (blue → green → yellow → red) in a continuous clockwise rotation. Border-ring only — button interior stays dark.

**Technique: `@property` + `mask-composite: exclude` punch-out**

```css
@property --gg-angle { syntax:'<angle>'; inherits:false; initial-value:0deg; }

.btn-google {
  /* existing styles + */
  position: relative;
  isolation: isolate;
  transition: border-color 0.15s, transform 0.15s, opacity 0.15s;
}
.btn-google:hover { border-color: transparent; transform: translateY(-1px); }

.btn-google::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: 10px;
  padding: 1px;                    /* ring thickness */
  --gg-angle: 0deg;
  background: conic-gradient(from var(--gg-angle), #4285F4 0%, #34A853 25%, #FBBC05 50%, #EA4335 75%, #4285F4 100%);
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: destination-out;
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask-composite: exclude;        /* punches out interior — ring only */
  opacity: 0;
  z-index: 0;
  transition: opacity 0.3s;
}
.btn-google:hover::before { opacity: 1; animation: gg-border-spin 2s linear infinite; }
@keyframes gg-border-spin { to { --gg-angle: 360deg; } }
```

**Why `mask-composite: exclude`:** Without it, the conic-gradient fills the entire button background. The mask subtracts the content-box area from the full element, leaving only the `padding` ring visible. Browser support: Chrome 85+, Firefox 128+, Safari 16.4+.

---

## Current State
- Login screen: animated dot-matrix canvas + ripple effect + KUBIX CRO Planner brand logo + single Google sign-in button with animated gradient border on hover
- Sign-in error handling: button loading state, popup-blocked message with redirect fallback link, all error codes surfaced
- Preview server: `npx serve . -p 3000` in `/cro` (config in `cro/.claude/launch.json`, name: `CRO Web App`)
- Firebase project: `cro-strategic-roadmap` (real credentials configured)
- All other screens (dashboard, client, config) unchanged

---

## Next Steps / Open Items
- Test sign-in flow in real browser (localhost:3000) to confirm popup works when allowed, and redirect flow works as fallback
- Potential: add a brief success animation after Google sign-in before transitioning to dashboard
- Potential: dashboard screen updates / Figma frame work
