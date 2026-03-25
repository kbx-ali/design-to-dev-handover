// Kubix Component Library — Figma Plugin
// Runs in Figma's privileged sandbox. Communicates with ui.html via postMessage.

figma.showUI(__html__, {
  width:  680,
  height: 600,
  title:  'Kubix Component Library'
});

// ─── Storage helpers ──────────────────────────────────────────────────────────

async function getStorage(key) {
  return await figma.clientStorage.getAsync(key);
}
async function setStorage(key, value) {
  await figma.clientStorage.setAsync(key, value);
}
async function delStorage(key) {
  await figma.clientStorage.deleteAsync(key);
}

// ─── Base64 helpers (no btoa/atob — Figma sandbox doesn't have them) ─────────

var B64_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function uint8ToBase64(bytes) {
  var result = '';
  var len = bytes.length;
  for (var i = 0; i < len; i += 3) {
    var b1 = bytes[i];
    var b2 = i + 1 < len ? bytes[i + 1] : 0;
    var b3 = i + 2 < len ? bytes[i + 2] : 0;
    result += B64_CHARS[b1 >> 2];
    result += B64_CHARS[((b1 & 3) << 4) | (b2 >> 4)];
    result += i + 1 < len ? B64_CHARS[((b2 & 15) << 2) | (b3 >> 6)] : '=';
    result += i + 2 < len ? B64_CHARS[b3 & 63] : '=';
  }
  return result;
}

function base64ToUint8(base64) {
  var lookup = {};
  for (var k = 0; k < B64_CHARS.length; k++) lookup[B64_CHARS[k]] = k;
  var str = base64.replace(/=+$/, '');
  var len = str.length;
  var bytes = new Uint8Array((len * 3) >> 2);
  var p = 0;
  for (var i = 0; i < len; i += 4) {
    var c1 = lookup[str[i]] || 0;
    var c2 = lookup[str[i + 1]] || 0;
    var c3 = lookup[str[i + 2]] || 0;
    var c4 = lookup[str[i + 3]] || 0;
    bytes[p++] = (c1 << 2) | (c2 >> 4);
    if (i + 2 < len) bytes[p++] = ((c2 & 15) << 4) | (c3 >> 2);
    if (i + 3 < len) bytes[p++] = ((c3 & 3) << 6) | c4;
  }
  return bytes;
}

// ─── Serialiser ───────────────────────────────────────────────────────────────

async function serialisePaints(paints) {
  const result = [];
  for (const p of paints) {
    const s = {
      type:      p.type,
      visible:   p.visible,
      opacity:   p.opacity,
      blendMode: p.blendMode,
    };

    if (p.type === 'SOLID') {
      s.color = p.color;

    } else if (p.type && p.type.startsWith('GRADIENT_')) {
      s.gradientTransform = p.gradientTransform;
      s.gradientStops = p.gradientStops.map(stop => ({
        position: stop.position,
        color:    stop.color,
      }));

    } else if (p.type === 'IMAGE' && p.imageHash) {
      s.scaleMode       = p.scaleMode;
      s.imageTransform  = p.imageTransform;
      s.scalingFactor   = p.scalingFactor;
      s.rotation        = p.rotation;
      s.filters         = p.filters;
      try {
        const img = figma.getImageByHash(p.imageHash);
        if (img) s.imageData = uint8ToBase64(await img.getBytesAsync());
      } catch (_) { /* skip on failure */ }
    }

    result.push(s);
  }
  return result;
}

function serialiseEffect(e) {
  return {
    type:                 e.type,
    visible:              e.visible,
    radius:               e.radius,
    color:                e.color,
    blendMode:            e.blendMode,
    offset:               e.offset,
    spread:               e.spread,
    showShadowBehindNode: e.showShadowBehindNode,
  };
}

async function serialiseNode(node) {
  const obj = {
    // Flatten INSTANCE → FRAME so the JSON is self-contained; preserve COMPONENT_SET for variant support
    type:   node.type === 'INSTANCE' ? 'FRAME' : node.type,
    name:   node.name,
    width:  Math.round(node.width),
    height: Math.round(node.height),
    x:      Math.round(node.x),
    y:      Math.round(node.y),
  };

  // Scalar optional props
  if (node.opacity  !== undefined && node.opacity  !== 1)      obj.opacity   = node.opacity;
  if (node.visible  === false)                                   obj.visible   = false;
  if (node.rotation)                                             obj.rotation  = node.rotation;
  if (node.blendMode && node.blendMode !== 'NORMAL')            obj.blendMode = node.blendMode;
  if (node.isMask)                                               obj.isMask    = true;
  if ('clipsContent' in node && node.clipsContent !== undefined) obj.clipsContent = node.clipsContent;

  // Corner radius
  if ('cornerRadius' in node) {
    if (node.cornerRadius !== figma.mixed) {
      if (node.cornerRadius) obj.cornerRadius = node.cornerRadius;
    } else {
      obj.topLeftRadius     = node.topLeftRadius     || 0;
      obj.topRightRadius    = node.topRightRadius    || 0;
      obj.bottomLeftRadius  = node.bottomLeftRadius  || 0;
      obj.bottomRightRadius = node.bottomRightRadius || 0;
    }
  }

  // Fills
  if ('fills' in node && node.fills !== figma.mixed && node.fills.length > 0) {
    obj.fills = await serialisePaints(node.fills);
  }

  // Strokes
  if ('strokes' in node && node.strokes.length > 0) {
    obj.strokes = await serialisePaints(node.strokes);
    if (node.strokeWeight !== figma.mixed) obj.strokeWeight = node.strokeWeight;
    obj.strokeAlign = node.strokeAlign;
    if (node.dashPattern && node.dashPattern.length) obj.dashPattern = Array.from(node.dashPattern);
    if (node.strokeCap && node.strokeCap !== figma.mixed && node.strokeCap !== 'NONE') obj.strokeCap = node.strokeCap;
    if (node.strokeJoin && node.strokeJoin !== figma.mixed && node.strokeJoin !== 'MITER') obj.strokeJoin = node.strokeJoin;
  }

  // Effects
  if ('effects' in node && node.effects.length > 0) {
    obj.effects = node.effects.map(serialiseEffect);
  }

  // Auto-layout
  if ('layoutMode' in node && node.layoutMode !== 'NONE') {
    obj.layoutMode              = node.layoutMode;
    obj.primaryAxisAlignItems   = node.primaryAxisAlignItems;
    obj.counterAxisAlignItems   = node.counterAxisAlignItems;
    obj.primaryAxisSizingMode   = node.primaryAxisSizingMode;
    obj.counterAxisSizingMode   = node.counterAxisSizingMode;
    obj.paddingTop              = node.paddingTop    || 0;
    obj.paddingRight            = node.paddingRight  || 0;
    obj.paddingBottom           = node.paddingBottom || 0;
    obj.paddingLeft             = node.paddingLeft   || 0;
    obj.itemSpacing             = node.itemSpacing   || 0;
    if (node.counterAxisSpacing)    obj.counterAxisSpacing    = node.counterAxisSpacing;
    if (node.layoutWrap)            obj.layoutWrap            = node.layoutWrap;
    if (node.strokesIncludedInLayout) obj.strokesIncludedInLayout = node.strokesIncludedInLayout;
  }

  // Layout sizing (child of auto-layout parent)
  if ('layoutSizingHorizontal' in node) {
    obj.layoutSizingHorizontal = node.layoutSizingHorizontal;
    obj.layoutSizingVertical   = node.layoutSizingVertical;
    if (node.layoutGrow)     obj.layoutGrow     = node.layoutGrow;
    if (node.layoutAlign)    obj.layoutAlign    = node.layoutAlign;
    if (node.layoutPositioning) obj.layoutPositioning = node.layoutPositioning;
  }

  // Min/max sizing
  if ('minWidth' in node) {
    if (node.minWidth)  obj.minWidth  = node.minWidth;
    if (node.maxWidth)  obj.maxWidth  = node.maxWidth;
    if (node.minHeight) obj.minHeight = node.minHeight;
    if (node.maxHeight) obj.maxHeight = node.maxHeight;
  }

  // Constraints
  if ('constraints' in node) obj.constraints = node.constraints;

  // TEXT-specific
  if (node.type === 'TEXT') {
    obj.characters      = node.characters || '';
    obj.fontSize        = node.fontSize        !== figma.mixed ? node.fontSize        : 14;
    obj.fontName        = node.fontName        !== figma.mixed ? node.fontName        : { family: 'Inter', style: 'Regular' };
    obj.textAlignHorizontal = node.textAlignHorizontal;
    obj.textAlignVertical   = node.textAlignVertical;
    obj.lineHeight      = node.lineHeight      !== figma.mixed ? node.lineHeight      : { unit: 'AUTO' };
    obj.letterSpacing   = node.letterSpacing   !== figma.mixed ? node.letterSpacing   : { unit: 'PERCENT', value: 0 };
    obj.textCase        = node.textCase        !== figma.mixed ? node.textCase        : 'ORIGINAL';
    obj.textDecoration  = node.textDecoration  !== figma.mixed ? node.textDecoration  : 'NONE';
    if (node.textTruncation)   obj.textTruncation  = node.textTruncation;
    if (node.maxLines)         obj.maxLines        = node.maxLines;
    if (node.paragraphSpacing) obj.paragraphSpacing = node.paragraphSpacing;
    if (node.paragraphIndent)  obj.paragraphIndent  = node.paragraphIndent;
    if (node.textAutoResize)   obj.textAutoResize  = node.textAutoResize;
  }

  // VECTOR-specific
  if (node.type === 'VECTOR' && node.vectorPaths) {
    obj.vectorPaths = node.vectorPaths.map(p => ({
      windingRule: p.windingRule,
      data:        p.data,
    }));
  }

  // BOOLEAN_OPERATION
  if (node.type === 'BOOLEAN_OPERATION') obj.booleanOperation = node.booleanOperation;

  // ELLIPSE arc
  if (node.type === 'ELLIPSE' && node.arcData) obj.arcData = node.arcData;

  // POLYGON / STAR
  if ((node.type === 'POLYGON' || node.type === 'STAR') && node.pointCount) obj.pointCount = node.pointCount;
  if (node.type === 'STAR' && node.innerRadius) obj.innerRadius = node.innerRadius;

  // Children
  if ('children' in node && node.children) {
    obj.children = [];
    for (const child of node.children) {
      obj.children.push(await serialiseNode(child));
    }
  }

  // Strip undefined so JSON.stringify is clean
  return JSON.parse(JSON.stringify(obj));
}

// ─── Font collector ───────────────────────────────────────────────────────────

function collectFonts(node, fonts = new Set()) {
  if (node.type === 'TEXT' && node.fontName) {
    fonts.add(`${node.fontName.family}||${node.fontName.style}`);
  }
  if (node.children) {
    for (const child of node.children) collectFonts(child, fonts);
  }
  return fonts;
}

// ─── Reconstructor ────────────────────────────────────────────────────────────

function reconstructPaint(p) {
  if (!p || !p.type) return null;

  const base = {};
  if (p.opacity  !== undefined) base.opacity   = p.opacity;
  if (p.visible  === false)     base.visible   = false;
  if (p.blendMode)              base.blendMode = p.blendMode;

  if (p.type === 'SOLID') {
    return Object.assign({}, base, { type: 'SOLID', color: p.color });
  }

  if (p.type && p.type.startsWith('GRADIENT_')) {
    return Object.assign({}, base, {
      type:               p.type,
      gradientTransform:  p.gradientTransform,
      gradientStops:      p.gradientStops,
    });
  }

  if (p.type === 'IMAGE' && p.imageData) {
    const image = figma.createImage(base64ToUint8(p.imageData));
    const paint = Object.assign({}, base, {
      type:      'IMAGE',
      scaleMode: p.scaleMode || 'FILL',
      imageHash: image.hash,
    });
    if (p.imageTransform) paint.imageTransform = p.imageTransform;
    if (p.scalingFactor)  paint.scalingFactor  = p.scalingFactor;
    if (p.rotation)       paint.rotation       = p.rotation;
    if (p.filters)        paint.filters        = p.filters;
    return paint;
  }

  return null;
}

async function reconstructNode(data) {
  if (!data) return null;
  let node = null;

  try {
    switch (data.type) {

      // ── Containers ──
      case 'FRAME':
      case 'COMPONENT': {
        node = data.type === 'COMPONENT'
          ? figma.createComponent()
          : figma.createFrame();
        node.name = data.name;
        node.resize(data.width || 100, data.height || 100);

        if (data.clipsContent !== undefined) node.clipsContent = data.clipsContent;

        // Apply fills before children so background is correct
        if (data.fills) {
          node.fills = data.fills.map(reconstructPaint).filter(Boolean);
        } else {
          node.fills = [];
        }

        // Set auto-layout BEFORE appending children — order matters
        if (data.layoutMode && data.layoutMode !== 'NONE') {
          node.layoutMode            = data.layoutMode;
          node.paddingTop            = data.paddingTop    || 0;
          node.paddingRight          = data.paddingRight  || 0;
          node.paddingBottom         = data.paddingBottom || 0;
          node.paddingLeft           = data.paddingLeft   || 0;
          node.itemSpacing           = data.itemSpacing   || 0;
          if (data.counterAxisSpacing)     node.counterAxisSpacing     = data.counterAxisSpacing;
          // Always set alignment — values like 'MIN', 'CENTER', 'SPACE_BETWEEN' are all valid strings
          if (data.primaryAxisAlignItems)  node.primaryAxisAlignItems  = data.primaryAxisAlignItems;
          if (data.counterAxisAlignItems)  node.counterAxisAlignItems  = data.counterAxisAlignItems;
          // Always set sizing modes — 'FIXED' and 'AUTO' (HUG) are both meaningful
          if (data.primaryAxisSizingMode)  node.primaryAxisSizingMode  = data.primaryAxisSizingMode;
          if (data.counterAxisSizingMode)  node.counterAxisSizingMode  = data.counterAxisSizingMode;
          if (data.layoutWrap)             node.layoutWrap             = data.layoutWrap;
          if (data.strokesIncludedInLayout !== undefined) node.strokesIncludedInLayout = data.strokesIncludedInLayout;
        }

        // Children
        if (data.children) {
          for (const childData of data.children) {
            const child = await reconstructNode(childData);
            if (!child) continue;
            node.appendChild(child);
            // All layout properties must be set AFTER the child is appended
            try {
              // Absolute positioning — must be set before x/y, takes child out of flow
              if (childData.layoutPositioning === 'ABSOLUTE') {
                child.layoutPositioning = 'ABSOLUTE';
                // x/y are meaningful for absolute children — apply them now
                if (childData.x !== undefined) child.x = childData.x;
                if (childData.y !== undefined) child.y = childData.y;
              }
              // Sizing within auto-layout
              if (childData.layoutSizingHorizontal) child.layoutSizingHorizontal = childData.layoutSizingHorizontal;
              if (childData.layoutSizingVertical)   child.layoutSizingVertical   = childData.layoutSizingVertical;
              if (childData.layoutGrow !== undefined) child.layoutGrow = childData.layoutGrow;
              // Cross-axis alignment (STRETCH, MIN, MAX, CENTER, BASELINE, INHERIT)
              if (childData.layoutAlign) child.layoutAlign = childData.layoutAlign;
            } catch (_) { /* parent may not be auto-layout */ }
          }
        }

        // Re-apply explicit size for fixed-size frames (auto-layout HUG frames size themselves)
        if (!data.layoutMode || data.layoutMode === 'NONE') {
          node.resize(data.width || 100, data.height || 100);
        } else if (data.primaryAxisSizingMode === 'FIXED' || data.counterAxisSizingMode === 'FIXED') {
          // For auto-layout frames with a fixed axis, enforce the stored dimensions
          try { node.resize(data.width || 100, data.height || 100); } catch (_) {}
        }
        break;
      }

      // ── Group ──
      case 'GROUP': {
        const children = [];
        if (data.children) {
          for (const childData of data.children) {
            const child = await reconstructNode(childData);
            if (child) children.push(child);
          }
        }
        if (children.length === 0) {
          // Groups need at least one child — fall back to rectangle
          node = figma.createRectangle();
          node.name = data.name;
          node.resize(data.width || 10, data.height || 10);
          node.fills = [];
        } else {
          node = figma.group(children, figma.currentPage);
          node.name = data.name;
        }
        break;
      }

      // ── Boolean operation ──
      case 'BOOLEAN_OPERATION': {
        var boolChildren = [];
        if (data.children) {
          for (var bi = 0; bi < data.children.length; bi++) {
            var bChild = await reconstructNode(data.children[bi]);
            if (bChild) {
              figma.currentPage.appendChild(bChild);
              boolChildren.push(bChild);
            }
          }
        }
        if (boolChildren.length >= 2) {
          // Use the correct boolean operation to preserve fidelity
          try {
            switch (data.booleanOperation) {
              case 'SUBTRACT':  node = figma.subtract(boolChildren, figma.currentPage); break;
              case 'INTERSECT': node = figma.intersect(boolChildren, figma.currentPage); break;
              case 'EXCLUDE':   node = figma.exclude(boolChildren, figma.currentPage); break;
              default:          node = figma.union(boolChildren, figma.currentPage); break;
            }
          } catch (_) {
            // Fallback: flatten if boolean op fails
            node = figma.flatten(boolChildren);
          }
        } else if (boolChildren.length === 1) {
          node = boolChildren[0];
        } else {
          node = figma.createRectangle();
          node.resize(data.width || 10, data.height || 10);
          node.fills = [];
        }
        node.name = data.name;
        break;
      }

      // ── Shapes ──
      case 'RECTANGLE': {
        node = figma.createRectangle();
        node.name = data.name;
        node.resize(data.width || 100, data.height || 100);
        break;
      }
      case 'ELLIPSE': {
        node = figma.createEllipse();
        node.name = data.name;
        node.resize(data.width || 100, data.height || 100);
        if (data.arcData) node.arcData = data.arcData;
        break;
      }
      case 'LINE': {
        node = figma.createLine();
        node.name = data.name;
        node.resize(data.width || 100, 0);
        break;
      }
      case 'POLYGON': {
        node = figma.createPolygon();
        node.name = data.name;
        node.resize(data.width || 100, data.height || 100);
        if (data.pointCount) node.pointCount = data.pointCount;
        break;
      }
      case 'STAR': {
        node = figma.createStar();
        node.name = data.name;
        node.resize(data.width || 100, data.height || 100);
        if (data.pointCount)  node.pointCount  = data.pointCount;
        if (data.innerRadius) node.innerRadius = data.innerRadius;
        break;
      }
      case 'VECTOR': {
        node = figma.createVector();
        node.name = data.name;
        if (data.vectorPaths && data.vectorPaths.length > 0) node.vectorPaths = data.vectorPaths;
        node.resize(data.width || 24, data.height || 24);
        break;
      }

      // ── Text ──
      case 'TEXT': {
        node = figma.createText();
        node.name = data.name;

        // Figma requires the font to be loaded before ANY text property can be set
        var desiredFont = data.fontName || { family: 'Inter', style: 'Regular' };
        var loadedFont = desiredFont;
        try {
          await figma.loadFontAsync(desiredFont);
        } catch (_) {
          // Font not available on this machine — fall back to Inter Regular
          try { await figma.loadFontAsync({ family: 'Inter', style: 'Regular' }); } catch (_2) {}
          loadedFont = { family: 'Inter', style: 'Regular' };
        }
        node.fontName = loadedFont;

        // Set formatting properties BEFORE characters
        if (data.fontSize)  node.fontSize  = data.fontSize;
        if (data.textAlignHorizontal) node.textAlignHorizontal = data.textAlignHorizontal;
        if (data.textAlignVertical)   node.textAlignVertical   = data.textAlignVertical;
        if (data.lineHeight)    node.lineHeight    = data.lineHeight;
        if (data.letterSpacing) node.letterSpacing = data.letterSpacing;
        if (data.textCase)      node.textCase      = data.textCase;
        if (data.textDecoration) node.textDecoration = data.textDecoration;
        if (data.paragraphSpacing) node.paragraphSpacing = data.paragraphSpacing;
        if (data.paragraphIndent)  node.paragraphIndent  = data.paragraphIndent;

        // Set characters
        if (data.characters !== undefined) node.characters = data.characters;

        // textAutoResize controls how the text box sizes itself
        // NONE = fixed size, HEIGHT = fixed width auto height, WIDTH_AND_HEIGHT = fully auto
        if (data.textAutoResize) node.textAutoResize = data.textAutoResize;

        // For fixed-size text boxes, apply stored dimensions after setting content
        if (data.textAutoResize === 'NONE') {
          try { node.resize(data.width || 100, data.height || 20); } catch (_) {}
        } else if (data.textAutoResize === 'HEIGHT') {
          // Fixed width, auto height — set width only
          try { node.resize(data.width || 100, node.height); } catch (_) {}
        }

        if (data.textTruncation) node.textTruncation = data.textTruncation;
        if (data.maxLines)       node.maxLines       = data.maxLines;
        break;
      }

      default: {
        // Unknown node type — use a transparent frame as placeholder
        node = figma.createFrame();
        node.name = data.name || 'Unknown';
        node.resize(data.width || 100, data.height || 100);
        node.fills = [];
        break;
      }
    }
  } catch (e) {
    console.error('[Kubix] Failed to create node:', data.type, data.name, e);
    return null;
  }

  if (!node) return null;

  // ── Apply common properties ──
  try {
    if (data.x !== undefined) node.x = data.x;
    if (data.y !== undefined) node.y = data.y;
    if (data.opacity  !== undefined) node.opacity  = data.opacity;
    if (data.visible  === false)     node.visible  = false;
    if (data.rotation)               node.rotation = data.rotation;
    if (data.blendMode)              node.blendMode = data.blendMode;
    if (data.isMask)                 node.isMask   = data.isMask;

    // Corner radius
    if ('cornerRadius' in node) {
      if (data.cornerRadius !== undefined) {
        node.cornerRadius = data.cornerRadius;
      } else if (data.topLeftRadius !== undefined) {
        node.topLeftRadius     = data.topLeftRadius     || 0;
        node.topRightRadius    = data.topRightRadius    || 0;
        node.bottomLeftRadius  = data.bottomLeftRadius  || 0;
        node.bottomRightRadius = data.bottomRightRadius || 0;
      }
    }

    // Fills for non-container nodes (containers handle fills above)
    const isContainer = data.type === 'FRAME' || data.type === 'COMPONENT' || data.type === 'GROUP';
    if (data.fills && !isContainer && 'fills' in node) {
      node.fills = data.fills.map(reconstructPaint).filter(Boolean);
    }

    // Strokes
    if (data.strokes && data.strokes.length > 0 && 'strokes' in node) {
      node.strokes = data.strokes.map(reconstructPaint).filter(Boolean);
      if (data.strokeWeight) node.strokeWeight = data.strokeWeight;
      if (data.strokeAlign)  node.strokeAlign  = data.strokeAlign;
      if (data.dashPattern)  node.dashPattern  = data.dashPattern;
      if (data.strokeCap)    try { node.strokeCap  = data.strokeCap;  } catch (_) {}
      if (data.strokeJoin)   try { node.strokeJoin = data.strokeJoin; } catch (_) {}
    }

    // Effects
    if (data.effects && data.effects.length > 0 && 'effects' in node) {
      node.effects = data.effects;
    }

    // Constraints
    if (data.constraints && 'constraints' in node) node.constraints = data.constraints;

    // Min/max — only valid on auto-layout nodes and their children; silently skip otherwise
    try {
      if (data.minWidth  !== undefined && 'minWidth'  in node) node.minWidth  = data.minWidth;
      if (data.maxWidth  !== undefined && 'maxWidth'  in node) node.maxWidth  = data.maxWidth;
      if (data.minHeight !== undefined && 'minHeight' in node) node.minHeight = data.minHeight;
      if (data.maxHeight !== undefined && 'maxHeight' in node) node.maxHeight = data.maxHeight;
    } catch (_) { /* node not in auto-layout context — skip */ }

  } catch (e) {
    console.warn('[Kubix] Error applying props to', data.name, e);
  }

  return node;
}

// ─── Library page ─────────────────────────────────────────────────────────────

const LIBRARY_PAGE = '🧩 Component Library';

function getOrCreateLibraryPage() {
  let page = figma.root.children.find(p => p.name === LIBRARY_PAGE);
  if (!page) {
    page = figma.createPage();
    page.name = LIBRARY_PAGE;
    // Move to position 1 (after the first page)
    if (figma.root.children.length > 1) {
      figma.root.insertChild(1, page);
    }
  }
  return page;
}

// ─── Theme tokens ─────────────────────────────────────────────────────────────

const TOKENS_COLLECTION = '🎨 Theme Tokens';

function ensureThemeTokens() {
  const existing = figma.variables.getLocalVariableCollections()
    .find(c => c.name === TOKENS_COLLECTION);
  if (existing) return { created: false };

  const collection = figma.variables.createVariableCollection(TOKENS_COLLECTION);
  const modeId     = collection.defaultModeId;

  const colors = [
    ['color/brand-primary',   { r: 0,     g: 0,     b: 0,     a: 1 }],
    ['color/brand-secondary', { r: 0.333, g: 0.333, b: 0.333, a: 1 }],
    ['color/background',      { r: 1,     g: 1,     b: 1,     a: 1 }],
    ['color/surface',         { r: 0.961, g: 0.961, b: 0.961, a: 1 }],
    ['color/text-primary',    { r: 0.067, g: 0.067, b: 0.067, a: 1 }],
    ['color/text-secondary',  { r: 0.533, g: 0.533, b: 0.533, a: 1 }],
  ];
  const strings = [
    ['font/heading', 'Inter'],
    ['font/body',    'Inter'],
  ];
  const floats = [
    ['radius/default', 4],
    ['spacing/base',   16],
  ];

  for (const [name, value] of colors) {
    const v = figma.variables.createVariable(name, collection, 'COLOR');
    v.setValueForMode(modeId, value);
  }
  for (const [name, value] of strings) {
    const v = figma.variables.createVariable(name, collection, 'STRING');
    v.setValueForMode(modeId, value);
  }
  for (const [name, value] of floats) {
    const v = figma.variables.createVariable(name, collection, 'FLOAT');
    v.setValueForMode(modeId, value);
  }

  return { created: true };
}

// ─── Insert orchestrator ──────────────────────────────────────────────────────

async function insertComponent(componentData) {
  var originalPage = figma.currentPage;
  var isSet = componentData.nodes.type === 'COMPONENT_SET';

  // 1. Ensure theme tokens exist
  var tokensResult = ensureThemeTokens();
  var tokensCreated = tokensResult.created;

  // 2. Get / create library page
  var libraryPage = getOrCreateLibraryPage();
  var componentName = isSet
    ? componentData.name
    : componentData.name + ' / ' + componentData.variant;

  // 3. Switch to library page to check for existing master
  figma.currentPage = libraryPage;

  // For component sets, look for existing COMPONENT_SET by name
  // For single components, look for existing COMPONENT by name
  var master = libraryPage.findChild(function(n) {
    if (isSet) return n.type === 'COMPONENT_SET' && n.name === componentName;
    return n.type === 'COMPONENT' && n.name === componentName;
  });

  if (!master) {
    // 4. Pre-load all fonts from ALL nodes (including variant children)
    var fonts = collectFonts(componentData.nodes);
    var fontPromises = Array.from(fonts).map(function(f) {
      var parts = f.split('||');
      return figma.loadFontAsync({ family: parts[0], style: parts[1] }).catch(function() {
        return figma.loadFontAsync({ family: parts[0], style: 'Regular' }).catch(function() {});
      });
    });
    await Promise.all(fontPromises);

    if (isSet) {
      // 5a. COMPONENT_SET: reconstruct each variant child as a COMPONENT, then combine
      var variantComponents = [];
      var children = componentData.nodes.children || [];

      for (var vi = 0; vi < children.length; vi++) {
        var variantData = children[vi];
        // Force each child to be a COMPONENT
        var childData = Object.assign({}, variantData, { type: 'COMPONENT' });
        var comp = await reconstructNode(childData);
        if (comp) {
          comp.name = variantData.name; // Preserve variant property name e.g. "Device=Desktop, Layout=Logo left"
          libraryPage.appendChild(comp);
          variantComponents.push(comp);
        }
      }

      if (variantComponents.length === 0) {
        figma.currentPage = originalPage;
        figma.ui.postMessage({ type: 'insert-error', message: 'Failed to reconstruct variant components.' });
        return;
      }

      // Combine into a proper ComponentSet
      master = figma.combineAsVariants(variantComponents, libraryPage);
      master.name = componentName;

      // Position on library page
      var existingCount = libraryPage.children.filter(function(n) {
        return n.type === 'COMPONENT_SET' || n.type === 'COMPONENT';
      }).length;
      master.x = (existingCount - 1) * ((componentData.nodes.width || 400) + 100);
      master.y = 0;

    } else {
      // 5b. Single COMPONENT: original flow
      var rootData = Object.assign({}, componentData.nodes, { type: 'COMPONENT' });
      master = await reconstructNode(rootData);

      if (!master) {
        figma.currentPage = originalPage;
        figma.ui.postMessage({ type: 'insert-error', message: 'Failed to reconstruct component nodes.' });
        return;
      }

      master.name = componentName;

      var count = libraryPage.children.filter(function(n) { return n.type === 'COMPONENT'; }).length;
      master.x = (count - 1) * ((componentData.nodes.width || 200) + 100);
      master.y = 0;

      libraryPage.appendChild(master);
    }
  }

  // 6. Return to original page and create instance
  figma.currentPage = originalPage;

  // For component sets, get the default variant (first child) and create instance from it
  var instanceSource = master;
  if (master.type === 'COMPONENT_SET' && master.defaultVariant) {
    instanceSource = master.defaultVariant;
  } else if (master.type === 'COMPONENT_SET' && master.children && master.children.length > 0) {
    instanceSource = master.children[0];
  }

  var instance = instanceSource.createInstance();

  // 7. Place at viewport centre
  var vp = figma.viewport;
  instance.x = Math.round(vp.center.x - instance.width / 2);
  instance.y = Math.round(vp.center.y - instance.height / 2);
  originalPage.appendChild(instance);

  // 8. Select and scroll to instance
  figma.currentPage.selection = [instance];
  figma.viewport.scrollAndZoomIntoView([instance]);

  figma.ui.postMessage({ type: 'insert-success', componentName: componentName, tokensCreated: tokensCreated });
}

// ─── Selection helper ─────────────────────────────────────────────────────────

function getSelectionInfo() {
  const sel = figma.currentPage.selection;
  if (!sel.length) return { hasSelection: false };
  const node = sel[0];
  var info = {
    hasSelection: true,
    nodeType:     node.type,
    nodeName:     node.name,
    width:        Math.round(node.width),
    height:       Math.round(node.height),
    id:           node.id,
  };
  if (node.type === 'COMPONENT_SET' && node.children) {
    info.variantCount = node.children.length;
  }
  return info;
}

// ─── Theme Import ─────────────────────────────────────────────────────────────

function sendProgress(percent, message) {
  figma.ui.postMessage({ type: 'theme-import-progress', percent: percent, message: message });
}

function parseHexToRGB(hex) {
  if (!hex || typeof hex !== 'string') return { r: 0, g: 0, b: 0 };
  // Handle rgba() format
  if (hex.indexOf('rgba') === 0) {
    var m = hex.match(/rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)/);
    if (m) return { r: parseFloat(m[1]) / 255, g: parseFloat(m[2]) / 255, b: parseFloat(m[3]) / 255 };
    return { r: 0, g: 0, b: 0 };
  }
  hex = hex.replace('#', '');
  // Strip alpha suffix (8-char hex like #000000cf)
  if (hex.length > 6) hex = hex.substring(0, 6);
  if (hex.length === 3) hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  var r = parseInt(hex.substring(0, 2), 16) / 255;
  var g = parseInt(hex.substring(2, 4), 16) / 255;
  var b = parseInt(hex.substring(4, 6), 16) / 255;
  return { r: isNaN(r) ? 0 : r, g: isNaN(g) ? 0 : g, b: isNaN(b) ? 0 : b };
}

function parseAlphaFromHex(hex) {
  if (!hex || typeof hex !== 'string') return 1;
  if (hex.indexOf('rgba') === 0) {
    var m = hex.match(/rgba?\(\s*[\d.]+\s*,\s*[\d.]+\s*,\s*[\d.]+\s*,\s*([\d.]+)/);
    return m ? parseFloat(m[1]) : 1;
  }
  hex = hex.replace('#', '');
  if (hex.length === 8) return parseInt(hex.substring(6, 8), 16) / 255;
  return 1;
}

async function handleThemeImport(data) {
  var themeName = data.themeName || 'Shopify Theme';
  var colorSchemes = data.colorSchemes || {};
  var typography = data.typography || {};
  var layout = data.layout || {};
  var sections = data.sections || [];

  var totalSteps = 3; // variables, typography, sections
  var variablesCreated = 0;
  var typTokens = 0;

  // ── Step 1: Create colour scheme variables ──
  sendProgress(10, 'Creating colour variables…');

  // Check if collection already exists
  var collectionName = '🎨 ' + themeName;
  var existingCollections = figma.variables.getLocalVariableCollections();
  var collection = null;
  for (var ci = 0; ci < existingCollections.length; ci++) {
    if (existingCollections[ci].name === collectionName) {
      collection = existingCollections[ci];
      break;
    }
  }
  if (!collection) {
    collection = figma.variables.createVariableCollection(collectionName);
  }

  // Define the key colour tokens we want to extract from each scheme
  var colorTokenKeys = [
    'background', 'foreground_heading', 'foreground', 'primary', 'primary_hover',
    'border', 'primary_button_background', 'primary_button_text', 'primary_button_border',
    'primary_button_hover_background', 'primary_button_hover_text',
    'secondary_button_background', 'secondary_button_text', 'secondary_button_border',
    'input_background', 'input_text_color', 'input_border_color'
  ];

  // Get scheme names
  var schemeNames = Object.keys(colorSchemes);

  // Set up modes — one per colour scheme
  // Collection starts with one default mode; rename it, then add more
  var modes = collection.modes;
  var modeMap = {}; // schemeName -> modeId

  // Figma limits variable modes: Free=1, Professional=4, Org/Enterprise=40
  // We cap at the actual limit and warn the user about skipped schemes
  var MAX_MODES = 40; // will naturally fail at the plan limit
  var skippedSchemes = 0;

  for (var si = 0; si < schemeNames.length; si++) {
    var schemeName = schemeNames[si];
    var displayName = schemeName.replace('scheme-', 'Scheme ');
    // UUID or long scheme names — use simple numbered name
    if (displayName.length > 20 || displayName.indexOf('Scheme') === -1) {
      displayName = 'Scheme ' + (si + 1);
    }
    // Safety: Figma mode names must be under 48 chars
    if (displayName.length > 47) displayName = displayName.substring(0, 47);

    if (si === 0 && modes.length > 0) {
      // Rename the default mode
      collection.renameMode(modes[0].modeId, displayName);
      modeMap[schemeName] = modes[0].modeId;
    } else {
      try {
        var newModeId = collection.addMode(displayName);
        modeMap[schemeName] = newModeId;
      } catch (e) {
        // Plan mode limit reached — skip remaining schemes silently
        skippedSchemes++;
      }
    }
  }
  if (skippedSchemes > 0) {
    console.log('[Kubix] Skipped ' + skippedSchemes + ' colour schemes (plan mode limit reached). Upgrade to Org/Enterprise for up to 40 modes.');
  }

  sendProgress(25, 'Setting colour values…');

  // Create a variable for each colour token, set values per mode
  for (var tk = 0; tk < colorTokenKeys.length; tk++) {
    var tokenKey = colorTokenKeys[tk];
    var varName = 'color/' + tokenKey.replace(/_/g, '-');

    // Check if variable already exists
    var existing = figma.variables.getLocalVariables('COLOR');
    var variable = null;
    for (var ev = 0; ev < existing.length; ev++) {
      if (existing[ev].name === varName && existing[ev].variableCollectionId === collection.id) {
        variable = existing[ev];
        break;
      }
    }
    if (!variable) {
      variable = figma.variables.createVariable(varName, collection, 'COLOR');
      variablesCreated++;
    }

    // Set value for each mode
    for (var mk = 0; mk < schemeNames.length; mk++) {
      var modeId = modeMap[schemeNames[mk]];
      if (!modeId) continue;
      var hexVal = colorSchemes[schemeNames[mk]].settings[tokenKey];
      if (!hexVal) continue;

      var rgb = parseHexToRGB(hexVal);
      var alpha = parseAlphaFromHex(hexVal);
      try {
        variable.setValueForMode(modeId, { r: rgb.r, g: rgb.g, b: rgb.b, a: alpha });
      } catch (e) {
        console.warn('[Kubix] Failed to set', varName, 'for mode', schemeNames[mk], e);
      }
    }
  }

  // ── Step 2: Create layout variables ──
  sendProgress(40, 'Creating layout variables…');

  // Create a separate collection for layout tokens
  var layoutCollName = '📐 ' + themeName + ' Layout';
  var layoutColl = null;
  for (var lci = 0; lci < existingCollections.length; lci++) {
    if (existingCollections[lci].name === layoutCollName) {
      layoutColl = existingCollections[lci];
      break;
    }
  }
  if (!layoutColl) {
    layoutColl = figma.variables.createVariableCollection(layoutCollName);
  }

  var layoutMode = layoutColl.modes[0].modeId;

  var layoutTokens = [
    { name: 'layout/button-radius-primary', value: layout.button_border_radius_primary || 0 },
    { name: 'layout/button-radius-secondary', value: layout.button_border_radius_secondary || 0 },
    { name: 'layout/input-radius', value: layout.inputs_border_radius || 0 },
    { name: 'layout/card-radius', value: layout.card_corner_radius || 0 },
    { name: 'layout/product-radius', value: layout.product_corner_radius || 0 },
    { name: 'layout/badge-radius', value: layout.badge_corner_radius || 0 },
    { name: 'layout/input-border-width', value: layout.input_border_width || 0 },
    { name: 'layout/button-border-primary', value: layout.primary_button_border_width || 0 },
    { name: 'layout/swatch-width', value: layout.variant_swatch_width || 34 },
    { name: 'layout/swatch-radius', value: layout.variant_swatch_radius || 0 },
  ];

  var existingFloats = figma.variables.getLocalVariables('FLOAT');
  for (var lt = 0; lt < layoutTokens.length; lt++) {
    var tok = layoutTokens[lt];
    var layoutVar = null;
    for (var ef = 0; ef < existingFloats.length; ef++) {
      if (existingFloats[ef].name === tok.name && existingFloats[ef].variableCollectionId === layoutColl.id) {
        layoutVar = existingFloats[ef];
        break;
      }
    }
    if (!layoutVar) {
      layoutVar = figma.variables.createVariable(tok.name, layoutColl, 'FLOAT');
      variablesCreated++;
    }
    try {
      layoutVar.setValueForMode(layoutMode, tok.value);
    } catch (_) {}
    typTokens++;
  }

  // ── Step 3: Create section scaffolds ──
  sendProgress(55, 'Creating section scaffolds…');

  // Find or create the library page
  var libPageName = '🧩 ' + themeName + ' Sections';
  var libPage = null;
  for (var pi = 0; pi < figma.root.children.length; pi++) {
    if (figma.root.children[pi].name === libPageName) {
      libPage = figma.root.children[pi];
      break;
    }
  }
  if (!libPage) {
    libPage = figma.createPage();
    libPage.name = libPageName;
  }

  await figma.loadFontAsync({ family: 'Inter', style: 'Regular' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Semi Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Bold' });
  await figma.loadFontAsync({ family: 'Inter', style: 'Medium' });

  var sectionsCreated = 0;
  var yOffset = 0;

  // ── Scaffold helper functions ──
  var WHITE  = { r: 1, g: 1, b: 1 };
  var BLACK  = { r: 0, g: 0, b: 0 };
  var GREY98 = { r: 0.98, g: 0.98, b: 0.98 };
  var GREY95 = { r: 0.95, g: 0.95, b: 0.95 };
  var GREY90 = { r: 0.9, g: 0.9, b: 0.9 };
  var GREY85 = { r: 0.85, g: 0.85, b: 0.85 };
  var GREY80 = { r: 0.8, g: 0.8, b: 0.8 };
  var GREY60 = { r: 0.6, g: 0.6, b: 0.6 };
  var GREY40 = { r: 0.4, g: 0.4, b: 0.4 };
  var GREY20 = { r: 0.2, g: 0.2, b: 0.2 };
  var DARK   = { r: 0.13, g: 0.13, b: 0.13 };
  var ACCENT = { r: 0.77, g: 0.19, b: 0.11 };  // #C4301C — Hyper's primary red
  var ACCENT_SOFT = { r: 0.97, g: 0.92, b: 0.91 }; // Light red tint for badges
  var LIME_BG = { r: 0.94, g: 0.94, b: 0.48 };     // Hyper's yellow-green accent bg

  function mkText(chars, size, style, color) {
    var t = figma.createText();
    t.fontName = { family: 'Inter', style: style || 'Regular' };
    t.characters = chars;
    t.fontSize = size || 14;
    t.fills = [{ type: 'SOLID', color: color || BLACK }];
    return t;
  }

  // mkText with textAutoResize set to WIDTH_AND_HEIGHT so text doesn't clip
  function mkLabel(chars, size, style, color) {
    var t = mkText(chars, size, style, color);
    t.textAutoResize = 'WIDTH_AND_HEIGHT';
    return t;
  }

  function mkRect(w, h, color, name, radius) {
    var r = figma.createRectangle();
    r.name = name || 'Placeholder';
    r.resize(w, h);
    r.fills = [{ type: 'SOLID', color: color || GREY90 }];
    if (radius) r.cornerRadius = radius;
    return r;
  }

  function mkFrame(name, dir, opts) {
    var f = figma.createFrame();
    f.name = name;
    f.layoutMode = dir || 'HORIZONTAL';
    f.primaryAxisSizingMode = (opts && opts.primarySize) || 'AUTO';
    f.counterAxisSizingMode = (opts && opts.counterSize) || 'AUTO';
    f.itemSpacing = (opts && opts.gap !== undefined) ? opts.gap : 8;
    f.fills = (opts && opts.fills !== undefined) ? opts.fills : [];
    if (opts && opts.pad) {
      f.paddingTop = f.paddingBottom = f.paddingLeft = f.paddingRight = opts.pad;
    }
    if (opts && opts.padH) { f.paddingLeft = f.paddingRight = opts.padH; }
    if (opts && opts.padV) { f.paddingTop = f.paddingBottom = opts.padV; }
    if (opts && opts.w) f.resize(opts.w, opts.h || 100);
    if (opts && opts.radius) f.cornerRadius = opts.radius;
    if (opts && opts.align) f.counterAxisAlignItems = opts.align;
    if (opts && opts.justify) f.primaryAxisAlignItems = opts.justify;
    if (opts && opts.stroke) {
      f.strokeWeight = opts.stroke;
      f.strokes = [{ type: 'SOLID', color: opts.strokeColor || GREY90 }];
      f.strokeAlign = 'INSIDE';
    }
    return f;
  }

  function fillH(node) { try { node.layoutSizingHorizontal = 'FILL'; } catch(_){} }
  function fillV(node) { try { node.layoutSizingVertical = 'FILL'; } catch(_){} }

  function mkIconCircle(size, name, color) {
    var e = figma.createEllipse();
    e.name = name || 'Icon';
    e.resize(size, size);
    e.fills = [{ type: 'SOLID', color: color || GREY80 }];
    return e;
  }

  // ── Reusable UI component builders ──

  // Pill-shaped button (like Hyper's rounded buttons)
  // CSS: --buttons-radius: 10rem (pill), padding: 0 3.2rem, height: var(--buttons-height) ~48px
  function mkPillBtn(label, filled, width) {
    var bg = filled ? BLACK : WHITE;
    var fg = filled ? WHITE : BLACK;
    var btn = mkFrame(label, 'HORIZONTAL', {
      gap: 0, padH: 32, padV: 14,
      radius: 100,
      fills: [{ type: 'SOLID', color: bg }],
      align: 'CENTER', justify: 'CENTER',
      stroke: filled ? 0 : 1, strokeColor: GREY20
    });
    if (width) { btn.resize(width, 48); btn.primaryAxisSizingMode = 'FIXED'; btn.counterAxisSizingMode = 'FIXED'; }
    btn.appendChild(mkLabel(label, 14, 'Semi Bold', fg));
    return btn;
  }

  // Square button (non-pill variant)
  function mkSquareBtn(label, filled) {
    var bg = filled ? BLACK : WHITE;
    var fg = filled ? WHITE : BLACK;
    var btn = mkFrame(label, 'HORIZONTAL', {
      gap: 0, padH: 32, padV: 14, radius: 6,
      fills: [{ type: 'SOLID', color: bg }],
      align: 'CENTER', justify: 'CENTER',
      stroke: filled ? 0 : 1, strokeColor: GREY20
    });
    btn.appendChild(mkLabel(label, 14, 'Semi Bold', fg));
    return btn;
  }

  // Badge (sale, new, etc.)
  // CSS: --badges-radius: 4rem = 40px (rounded rect, not full pill)
  function mkBadge(text, bgColor) {
    var badge = mkFrame('Badge', 'HORIZONTAL', {
      gap: 0, padH: 10, padV: 4,
      radius: 40,
      fills: [{ type: 'SOLID', color: bgColor || ACCENT }]
    });
    badge.appendChild(mkLabel(text, 11, 'Semi Bold', WHITE));
    return badge;
  }

  // Product image placeholder with realistic aspect ratio + optional badge
  // Figma ref: product-card images use rounded-[10px], badges at x:10 y:10
  function mkProductImage(w, h, badgeText, radius) {
    var wrapper = mkFrame('Product Image', 'VERTICAL', {
      gap: 0, fills: [{ type: 'SOLID', color: GREY90 }],
      radius: radius !== undefined ? radius : 10
    });
    wrapper.resize(w, h);
    wrapper.primaryAxisSizingMode = 'FIXED';
    wrapper.counterAxisSizingMode = 'FIXED';
    wrapper.clipsContent = true;

    // Cross lines to indicate image placeholder
    var line1 = mkRect(Math.round(Math.sqrt(w * w + h * h)), 1, GREY85, 'Diagonal');
    wrapper.appendChild(line1);
    line1.layoutPositioning = 'ABSOLUTE';
    line1.rotation = -Math.atan2(h, w) * (180 / Math.PI);
    line1.x = 0; line1.y = 0;

    // Centered image icon
    var imgIcon = mkFrame('Image Icon', 'VERTICAL', { gap: 2, fills: [], align: 'CENTER', justify: 'CENTER' });
    wrapper.appendChild(imgIcon);
    imgIcon.layoutPositioning = 'ABSOLUTE';
    imgIcon.resize(48, 40);
    imgIcon.x = Math.round(w / 2 - 24);
    imgIcon.y = Math.round(h / 2 - 20);
    var mountain = mkRect(32, 20, GREY80, 'Mountain', 2);
    imgIcon.appendChild(mountain);
    var sun = mkIconCircle(10, 'Sun', GREY80);
    imgIcon.appendChild(sun);
    sun.layoutPositioning = 'ABSOLUTE';
    sun.x = 30; sun.y = 2;

    // Badge overlay
    if (badgeText) {
      var badge = mkBadge(badgeText);
      wrapper.appendChild(badge);
      badge.layoutPositioning = 'ABSOLUTE';
      badge.x = 10; badge.y = 10;
    }

    return wrapper;
  }

  // Colour swatches row
  // Figma ref: swatch-item size-[22px], inner value size-[14px], gap 8px
  // Swatches are circles inside padded containers; we simplify to just circles
  function mkSwatches(count, size) {
    count = count || 4;
    size = size || 22;
    var row = mkFrame('Swatches', 'HORIZONTAL', { gap: 8, align: 'CENTER' });
    var swatchColors = [
      { r: 0.84, g: 0.78, b: 0.72 },  // #d7c8b9 beige
      { r: 0.34, g: 0.23, b: 0.1 },   // #573a19 brown
      { r: 0.62, g: 0.39, b: 0.22 },   // #9f6437 amber
      { r: 0.45, g: 0.43, b: 0.41 },   // #736e69 grey
      { r: 0.62, g: 0.24, b: 0.22 }    // #9f3e37 red
    ];
    for (var si = 0; si < count && si < swatchColors.length; si++) {
      var swatch = figma.createEllipse();
      swatch.name = 'Swatch ' + (si + 1);
      swatch.resize(size, size);
      swatch.fills = [{ type: 'SOLID', color: swatchColors[si] }];
      swatch.strokeWeight = 1;
      swatch.strokes = [{ type: 'SOLID', color: GREY85 }];
      swatch.strokeAlign = 'OUTSIDE';
      row.appendChild(swatch);
    }
    return row;
  }

  // Full product card (used across many sections)
  // Figma ref: product-card__info gap-[4px] pt-[20px], type 12px bold uppercase rgba(0,0,0,0.6),
  //   title 15px semi-bold, price 15px bold, sale in #c4301c, image rounded-[10px],
  //   swatches pt-[8px], swatch gap 8px, ATC button rounded-[6px] (square, not pill)
  function mkProductCard(w, opts) {
    opts = opts || {};
    var imgH = Math.round(w * (opts.ratio || 1.25));  // Default 4:5 portrait
    var badges = ['Sale', null, 'New', 'Best Seller', null];
    var badgeIdx = Math.floor(Math.random() * badges.length);
    var prices = [
      { regular: '\u00A3309.00', sale: null },
      { regular: '\u00A3600.00', sale: '\u00A3589.00' },
      { regular: '\u00A33,289.00', sale: null },
      { regular: '\u00A3200.00', sale: '\u00A3170.00' }
    ];
    var priceIdx = Math.floor(Math.random() * prices.length);

    var card = mkFrame('Product Card', 'VERTICAL', {
      gap: 0, radius: opts.cardRadius || 0,
      fills: opts.cardBg ? [{ type: 'SOLID', color: opts.cardBg }] : []
    });
    card.resize(w, 100);
    card.primaryAxisSizingMode = 'AUTO';

    // Image (rounded-[10px] from Figma ref)
    card.appendChild(mkProductImage(w, imgH, badges[badgeIdx], opts.imgRadius !== undefined ? opts.imgRadius : 10));

    // Info section: pt-[20px] gap-[4px]
    var info = mkFrame('Product Info', 'VERTICAL', {
      gap: 4,
      padH: opts.infoPad || 0
    });
    info.paddingTop = 20;

    // Category: 12px bold uppercase, rgba(0,0,0,0.6) = ~GREY40
    if (opts.showCategory) {
      var cat = mkLabel('CHAIRS', 12, 'Bold', GREY60);
      try { cat.letterSpacing = { value: 0.5, unit: 'PIXELS' }; } catch(_){}
      info.appendChild(cat);
    }

    // Title: 15px semi-bold
    info.appendChild(mkLabel('Product Title', 15, 'Semi Bold', BLACK));

    // Price row: 15px bold, sale in #c4301c
    var priceRow = mkFrame('Price', 'HORIZONTAL', { gap: 8, align: 'CENTER' });
    var p = prices[priceIdx];
    if (p.sale) {
      priceRow.appendChild(mkLabel(p.sale, 15, 'Bold', ACCENT));
      var strikePrice = mkLabel(p.regular, 15, 'Regular', GREY60);
      try { strikePrice.textDecoration = 'STRIKETHROUGH'; } catch(_){}
      priceRow.appendChild(strikePrice);
    } else {
      priceRow.appendChild(mkLabel(p.regular, 15, 'Bold', BLACK));
    }
    info.appendChild(priceRow);

    // Swatches: pt-[8px] wrapper, 22px circles, gap 8px
    if (opts.showSwatches !== false) {
      var swatchWrap = mkFrame('Swatch Wrap', 'VERTICAL', { gap: 0 });
      swatchWrap.paddingTop = 8;
      swatchWrap.appendChild(mkSwatches(opts.swatchCount || 3, 22));
      info.appendChild(swatchWrap);
    }

    card.appendChild(info);
    fillH(info);

    // Add to cart button — Hyper uses rounded-[6px] (square), not pill
    if (opts.showButton !== false) {
      var btn = mkSquareBtn(opts.btnLabel || 'Add to Cart', true);
      card.appendChild(btn);
      fillH(btn);
    }

    return card;
  }

  // Section header block (subheading + heading + description + optional button)
  // CSS: subheading typically 1.2rem = 12px uppercase, heading 3.2–4rem = 32–40px
  function mkSectionHeader(heading, opts) {
    opts = opts || {};
    var header = mkFrame('Section Header', 'VERTICAL', {
      gap: opts.gap || 12,
      align: opts.align || 'CENTER'
    });

    if (opts.subheading) {
      var sub = mkLabel(opts.subheading, 12, 'Semi Bold', GREY60);
      try { sub.letterSpacing = { value: 1.5, unit: 'PIXELS' }; } catch(_){}
      header.appendChild(sub);
    }
    header.appendChild(mkLabel(heading, opts.headingSize || 32, 'Bold', opts.headingColor || BLACK));
    if (opts.description) {
      var desc = mkLabel(opts.description, 15, 'Regular', GREY60);
      try { desc.textAutoResize = 'HEIGHT'; desc.resize(700, 20); desc.textAlignHorizontal = 'CENTER'; } catch(_){}
      header.appendChild(desc);
    }
    if (opts.buttonLabel) {
      header.appendChild(mkPillBtn(opts.buttonLabel, false));
    }

    return header;
  }

  // Navigation arrow circle
  // Figma ref: size-[48px] rounded-[24px], inner icon size-[20px], stroke border
  function mkNavArrow(direction) {
    var arrow = mkFrame(direction === 'left' ? 'Prev' : 'Next', 'HORIZONTAL', {
      gap: 0, fills: [{ type: 'SOLID', color: WHITE }],
      radius: 24, align: 'CENTER', justify: 'CENTER',
      stroke: 1, strokeColor: GREY85
    });
    arrow.resize(48, 48);
    arrow.primaryAxisSizingMode = 'FIXED';
    arrow.counterAxisSizingMode = 'FIXED';
    arrow.appendChild(mkLabel(direction === 'left' ? '\u2039' : '\u203A', 24, 'Regular', BLACK));
    return arrow;
  }

  // Pagination dots
  // CSS: swiper dots = 1rem = 10px, gap ~8px
  function mkDots(count, activeIdx) {
    var dots = mkFrame('Pagination', 'HORIZONTAL', { gap: 8, align: 'CENTER', justify: 'CENTER' });
    for (var di = 0; di < count; di++) {
      var dot = figma.createEllipse();
      dot.name = 'Dot ' + (di + 1);
      dot.resize(10, 10);
      dot.fills = [{ type: 'SOLID', color: di === (activeIdx || 0) ? BLACK : GREY80 }];
      dots.appendChild(dot);
    }
    return dots;
  }

  // Star rating
  function mkStars(count) {
    count = count || 5;
    var row = mkFrame('Stars', 'HORIZONTAL', { gap: 2 });
    for (var si = 0; si < count; si++) {
      row.appendChild(mkLabel('★', 14, 'Regular', { r: 1, g: 0.78, b: 0 }));
    }
    return row;
  }

  // ── Section-specific scaffold builders ──

  function buildHeader(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Header';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.fills = [{ type: 'SOLID', color: WHITE }];
    comp.itemSpacing = 0;

    // Top bar (utility links)
    var topBar = mkFrame('Top Bar', 'HORIZONTAL', {
      gap: 16, padH: 50, padV: 8,
      fills: [{ type: 'SOLID', color: GREY98 }],
      align: 'CENTER', justify: 'SPACE_BETWEEN',
      stroke: 1, strokeColor: GREY90
    });
    var topLeft = mkFrame('Utility Left', 'HORIZONTAL', { gap: 16 });
    topLeft.appendChild(mkLabel('Store Locator', 11, 'Regular', GREY40));
    topLeft.appendChild(mkLabel('Help', 11, 'Regular', GREY40));
    topBar.appendChild(topLeft);
    var topRight = mkFrame('Utility Right', 'HORIZONTAL', { gap: 16 });
    topRight.appendChild(mkLabel('Sign In / Register', 11, 'Regular', GREY40));
    topBar.appendChild(topRight);
    comp.appendChild(topBar);
    fillH(topBar);

    // Main header row
    var main = mkFrame('Main Header', 'HORIZONTAL', {
      gap: 24, padH: 50, padV: 16,
      align: 'CENTER', justify: 'SPACE_BETWEEN',
      stroke: 1, strokeColor: GREY90
    });

    // Logo
    var logo = mkFrame('Logo', 'HORIZONTAL', { gap: 0, align: 'CENTER' });
    var logoBox = mkRect(120, 36, GREY85, 'Logo', 4);
    logo.appendChild(logoBox);
    main.appendChild(logo);

    // Search bar
    var search = mkFrame('Search Bar', 'HORIZONTAL', {
      gap: 8, padH: 16, padV: 10,
      radius: 100, align: 'CENTER',
      fills: [{ type: 'SOLID', color: GREY95 }]
    });
    search.resize(400, 40);
    search.primaryAxisSizingMode = 'FIXED';
    search.counterAxisSizingMode = 'FIXED';
    search.appendChild(mkLabel('🔍', 14, 'Regular', GREY60));
    search.appendChild(mkLabel('Search products...', 13, 'Regular', GREY60));
    main.appendChild(search);

    // Action icons
    var actions = mkFrame('Actions', 'HORIZONTAL', { gap: 20, align: 'CENTER' });
    actions.appendChild(mkIconCircle(22, 'Account', GREY60));
    actions.appendChild(mkIconCircle(22, 'Wishlist', GREY60));
    // Cart with badge
    var cartWrap = mkFrame('Cart', 'HORIZONTAL', { gap: 0 });
    cartWrap.appendChild(mkIconCircle(22, 'Cart', GREY60));
    var cartBadge = mkFrame('Cart Count', 'HORIZONTAL', {
      gap: 0, padH: 5, padV: 2,
      radius: 100, fills: [{ type: 'SOLID', color: ACCENT }],
      align: 'CENTER', justify: 'CENTER'
    });
    cartBadge.appendChild(mkLabel('0', 9, 'Bold', WHITE));
    cartWrap.appendChild(cartBadge);
    cartBadge.layoutPositioning = 'ABSOLUTE';
    cartBadge.x = 14; cartBadge.y = -2;
    actions.appendChild(cartWrap);
    main.appendChild(actions);

    comp.appendChild(main);
    fillH(main);

    // Navigation bar
    var nav = mkFrame('Navigation', 'HORIZONTAL', {
      gap: 28, padH: 50, padV: 12,
      align: 'CENTER',
      stroke: 1, strokeColor: GREY90
    });
    var navItems = ['Shop All', 'New Arrivals', 'Collections', 'Best Sellers', 'Sale'];
    for (var ni = 0; ni < navItems.length; ni++) {
      var navLink = mkLabel(navItems[ni], 13, ni === 4 ? 'Semi Bold' : 'Medium', ni === 4 ? ACCENT : GREY20);
      nav.appendChild(navLink);
    }
    comp.appendChild(nav);
    fillH(nav);

    return comp;
  }

  function buildAnnouncementBar(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Announcement Bar';
    comp.resize(1440, 40);
    comp.layoutMode = 'HORIZONTAL';
    comp.primaryAxisSizingMode = 'FIXED';
    comp.counterAxisSizingMode = 'FIXED';
    comp.primaryAxisAlignItems = 'CENTER';
    comp.counterAxisAlignItems = 'CENTER';
    comp.fills = [{ type: 'SOLID', color: DARK }];
    comp.itemSpacing = 32;

    comp.appendChild(mkLabel('✌ Free Express Shipping on orders over £50!', 12, 'Medium', WHITE));
    // Navigation arrows
    comp.appendChild(mkLabel('‹', 16, 'Regular', GREY60));
    comp.appendChild(mkLabel('›', 16, 'Regular', GREY60));
    // Reposition arrows to edges
    return comp;
  }

  function buildHero(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Hero';
    comp.resize(1440, 640);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'FIXED';
    comp.counterAxisSizingMode = 'FIXED';
    comp.fills = [];
    comp.clipsContent = true;

    // Background media placeholder
    var bg = mkRect(1440, 640, GREY85, 'Background Media');
    comp.appendChild(bg);
    bg.layoutPositioning = 'ABSOLUTE';
    bg.x = 0; bg.y = 0;
    try { bg.layoutSizingHorizontal = 'FILL'; bg.layoutSizingVertical = 'FILL'; } catch(_){}
    bg.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };

    // Subtle gradient overlay
    var overlay = mkRect(1440, 640, BLACK, 'Overlay');
    overlay.opacity = 0.35;
    comp.appendChild(overlay);
    overlay.layoutPositioning = 'ABSOLUTE';
    overlay.x = 0; overlay.y = 0;
    try { overlay.layoutSizingHorizontal = 'FILL'; overlay.layoutSizingVertical = 'FILL'; } catch(_){}
    overlay.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };

    // Content — centered vertically and horizontally
    var content = mkFrame('Content', 'VERTICAL', { gap: 20, pad: 60, fills: [] });
    comp.appendChild(content);
    content.layoutPositioning = 'ABSOLUTE';
    content.x = 0; content.y = 0;
    try { content.layoutSizingHorizontal = 'FILL'; content.layoutSizingVertical = 'FILL'; } catch(_){}
    content.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };
    content.counterAxisAlignItems = 'CENTER';
    content.primaryAxisAlignItems = 'CENTER';

    content.appendChild(mkLabel('SUBHEADING', 13, 'Semi Bold', { r: 1, g: 1, b: 1 }));
    var heading = mkLabel('Hero Headline Goes Here', 56, 'Bold', WHITE);
    try { heading.textAutoResize = 'HEIGHT'; heading.resize(800, 70); heading.textAlignHorizontal = 'CENTER'; } catch(_){}
    content.appendChild(heading);
    var subtext = mkLabel('A brief description or promotional message. Highlight your collection, sale, or brand story.', 17, 'Regular', { r: 0.9, g: 0.9, b: 0.9 });
    try { subtext.textAutoResize = 'HEIGHT'; subtext.resize(600, 20); subtext.textAlignHorizontal = 'CENTER'; } catch(_){}
    content.appendChild(subtext);

    // CTA buttons row
    var btnRow = mkFrame('CTA Buttons', 'HORIZONTAL', { gap: 12, align: 'CENTER' });
    btnRow.appendChild(mkPillBtn('Shop Now', true));
    btnRow.appendChild(mkPillBtn('Learn More', false));
    // Restyle the outline button for dark bg
    try {
      var outlineBtn = btnRow.children[1];
      outlineBtn.fills = [];
      outlineBtn.strokes = [{ type: 'SOLID', color: WHITE }];
      outlineBtn.children[0].fills = [{ type: 'SOLID', color: WHITE }];
    } catch(_){}
    content.appendChild(btnRow);

    // Nav arrows at edges
    var prevArrow = mkNavArrow('left');
    comp.appendChild(prevArrow);
    prevArrow.layoutPositioning = 'ABSOLUTE';
    prevArrow.x = 24; prevArrow.y = 298;

    var nextArrow = mkNavArrow('right');
    comp.appendChild(nextArrow);
    nextArrow.layoutPositioning = 'ABSOLUTE';
    nextArrow.x = 1372; nextArrow.y = 298;

    // Pagination dots
    var dots = mkDots(4, 0);
    comp.appendChild(dots);
    dots.layoutPositioning = 'ABSOLUTE';
    dots.x = 680; dots.y = 604;

    return comp;
  }

  // Figma ref: section__header has heading 32px bold left-aligned, description 15px medium #666,
  //   right side has tab links or "Shop All Products >" link, gap-[16px] pb-[32px]
  //   Product cards: 274px wide in grid with pr-[30px] margin, swiper-controls at bottom with
  //   progress bar + arrows gap-[12px], arrows size-[48px] rounded-[24px]
  function buildProductList(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Featured Collection';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 40; comp.paddingBottom = 40;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 24;
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    // Section header — left text + right link (pb-[32px] gap-[16px])
    var headerRow = mkFrame('Section Header', 'HORIZONTAL', {
      gap: 16, align: 'MAX', justify: 'SPACE_BETWEEN'
    });
    headerRow.paddingBottom = 32;
    var headerLeft = mkFrame('Header Text', 'VERTICAL', { gap: 12 });
    headerLeft.appendChild(mkLabel(displayName || 'New Arrivals', 32, 'Bold', BLACK));
    var desc = mkLabel('Traditional divides between personal and professional space.', 15, 'Medium', GREY60);
    headerLeft.appendChild(desc);
    headerRow.appendChild(headerLeft);
    headerRow.appendChild(mkLabel('Shop All Products \u203A', 15, 'Semi Bold', BLACK));
    comp.appendChild(headerRow);
    fillH(headerRow);

    // Product grid — 5 cards visible (274px each with 30px right margin = ~1340px)
    var grid = mkFrame('Product Grid', 'HORIZONTAL', { gap: 30 });
    comp.appendChild(grid);
    fillH(grid);

    for (var pc = 0; pc < 5; pc++) {
      var card = mkProductCard(244, {
        ratio: 1.25,
        imgRadius: 10,
        showSwatches: true,
        swatchCount: 2,
        showButton: false,
        showCategory: true
      });
      grid.appendChild(card);
      try { card.layoutGrow = 1; } catch(_){}
    }

    // Swiper controls: progress bar + nav arrows (gap-[12px])
    var controls = mkFrame('Swiper Controls', 'HORIZONTAL', { gap: 12, align: 'CENTER' });
    comp.appendChild(controls);
    fillH(controls);

    // Progress bar
    var progressWrap = mkFrame('Progress Bar', 'HORIZONTAL', { gap: 0, fills: [{ type: 'SOLID', color: GREY90 }] });
    progressWrap.resize(100, 2);
    progressWrap.primaryAxisSizingMode = 'FIXED';
    progressWrap.counterAxisSizingMode = 'FIXED';
    var progressFill = mkRect(200, 2, BLACK, 'Progress Fill');
    progressWrap.appendChild(progressFill);
    progressFill.layoutPositioning = 'ABSOLUTE';
    progressFill.x = 0; progressFill.y = 0;
    controls.appendChild(progressWrap);
    try { progressWrap.layoutGrow = 1; } catch(_){}

    controls.appendChild(mkNavArrow('left'));
    controls.appendChild(mkNavArrow('right'));

    return comp;
  }

  function buildMediaWithContent(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Image With Text';
    comp.resize(1440, 580);
    comp.layoutMode = 'HORIZONTAL';
    comp.primaryAxisSizingMode = 'FIXED';
    comp.counterAxisSizingMode = 'FIXED';
    comp.fills = [{ type: 'SOLID', color: WHITE }];
    comp.itemSpacing = 0;

    // Media side (50% width) — full image placeholder
    var media = mkProductImage(670, 540, null, 10);
    comp.appendChild(media);
    fillV(media);

    // Content side (50% width) — Figma ref: subheading, large heading, description, icon bullets, CTA
    var content = mkFrame('Content', 'VERTICAL', {
      gap: 24, padH: 60, padV: 60,
      fills: [{ type: 'SOLID', color: WHITE }],
      justify: 'CENTER'
    });
    content.resize(670, 540);
    comp.appendChild(content);
    fillV(content);
    try { content.layoutGrow = 1; } catch(_){}

    content.appendChild(mkLabel('Meet Our Team', 14, 'Semi Bold', BLACK));
    var heading = mkLabel('The creative minds\nbehind our studio', 36, 'Bold', BLACK);
    try { heading.textAutoResize = 'HEIGHT'; heading.resize(520, 40); } catch(_){}
    content.appendChild(heading);
    var bodyText = mkLabel('As designers we are constantly thinking about how people live and what problems we could solve for them.', 15, 'Regular', GREY40);
    try { bodyText.textAutoResize = 'HEIGHT'; bodyText.resize(480, 20); } catch(_){}
    content.appendChild(bodyText);

    // Icon bullet points
    var bulletItems = ['Product locally in New York', '4.8 Review Score', 'Over 50 Products'];
    for (var bii = 0; bii < bulletItems.length; bii++) {
      var bullet = mkFrame('Bullet ' + (bii + 1), 'HORIZONTAL', { gap: 12, align: 'CENTER' });
      bullet.appendChild(mkIconCircle(24, 'Icon', GREY80));
      bullet.appendChild(mkLabel(bulletItems[bii], 15, 'Semi Bold', BLACK));
      content.appendChild(bullet);
    }

    content.appendChild(mkPillBtn('Contact Us', true));

    return comp;
  }

  function buildFooter(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Footer';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.itemSpacing = 0;
    // Figma ref: white bg footer with top border, newsletter left, menu columns right,
    //   social circles, payment icons, copyright at bottom
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    // ── Top border ──
    var topBorder = mkRect(1340, 1, GREY90, 'Top Border');
    comp.appendChild(topBorder);
    fillH(topBorder);

    // ── Main footer content (newsletter left + menu columns right) ──
    var mainFooter = mkFrame('Footer Content', 'HORIZONTAL', {
      gap: 60, padH: 50, padV: 48,
      justify: 'SPACE_BETWEEN'
    });

    // Newsletter column (left ~35%)
    var nlCol = mkFrame('Newsletter', 'VERTICAL', { gap: 16 });
    nlCol.resize(360, 100);
    nlCol.primaryAxisSizingMode = 'AUTO';
    nlCol.appendChild(mkLabel('Join Our Newsletter', 24, 'Bold', BLACK));
    nlCol.appendChild(mkLabel('Sign up to our newsletter & receive 10% off your first order.', 14, 'Regular', GREY40));

    // Email input + Sign Up button
    var nlInputRow = mkFrame('Newsletter Input', 'HORIZONTAL', { gap: 0, align: 'CENTER' });
    var nlInput = mkFrame('Email Input', 'HORIZONTAL', {
      padH: 20, padV: 14,
      fills: [{ type: 'SOLID', color: GREY95 }],
      radius: 100, align: 'CENTER'
    });
    nlInput.resize(240, 48);
    nlInput.primaryAxisSizingMode = 'FIXED';
    nlInput.counterAxisSizingMode = 'FIXED';
    nlInput.appendChild(mkLabel('Enter your email', 14, 'Regular', GREY60));
    nlInputRow.appendChild(nlInput);
    nlInputRow.appendChild(mkPillBtn('Sign Up', true));
    nlCol.appendChild(nlInputRow);
    nlCol.appendChild(mkLabel('By subscribing you agree to the Terms of Services and Privacy Policy.', 12, 'Regular', GREY60));
    mainFooter.appendChild(nlCol);

    // Menu columns (right ~65%)
    var colNames = ['Company', 'Collection', 'Shop'];
    var menuItems = {
      'Company': ['About us', 'Contact', 'FAQs', 'Blog', 'Find a Store'],
      'Collection': ['Tables', 'Bow Chairs', 'Turn Table', 'Turn Chair', 'Cross Bar Chair'],
      'Shop': ['Sofas', 'Outdoor', 'Seating', 'Lighting', 'Accessories']
    };
    for (var ci = 0; ci < colNames.length; ci++) {
      var col = mkFrame(colNames[ci], 'VERTICAL', { gap: 14 });
      col.appendChild(mkLabel(colNames[ci], 14, 'Bold', BLACK));
      var items = menuItems[colNames[ci]];
      for (var mi = 0; mi < items.length; mi++) {
        col.appendChild(mkLabel(items[mi], 14, 'Regular', GREY40));
      }
      mainFooter.appendChild(col);
      try { col.layoutGrow = 1; } catch(_){}
    }

    // Social icons column (circles)
    var socialCol = mkFrame('Social', 'HORIZONTAL', { gap: 12, align: 'MIN' });
    var socialLabels = ['f', 'X', 'IG', 'TK', 'YT'];
    for (var si = 0; si < socialLabels.length; si++) {
      var socialBtn = mkFrame(socialLabels[si], 'HORIZONTAL', {
        gap: 0, fills: [],
        radius: 100, align: 'CENTER', justify: 'CENTER',
        stroke: 1, strokeColor: GREY85
      });
      socialBtn.resize(40, 40);
      socialBtn.primaryAxisSizingMode = 'FIXED';
      socialBtn.counterAxisSizingMode = 'FIXED';
      socialBtn.appendChild(mkLabel(socialLabels[si], 12, 'Semi Bold', GREY40));
      socialCol.appendChild(socialBtn);
    }
    mainFooter.appendChild(socialCol);

    comp.appendChild(mainFooter);
    fillH(mainFooter);

    // ── Divider ──
    var divWrap = mkFrame('Divider Wrap', 'HORIZONTAL', { gap: 0, padH: 50 });
    var divider = mkRect(1344, 1, GREY40, 'Divider');
    divWrap.appendChild(divider);
    fillH(divider);
    comp.appendChild(divWrap);
    fillH(divWrap);

    // ── Bottom bar ──
    var bottomRow = mkFrame('Bottom Bar', 'HORIZONTAL', {
      gap: 8, padH: 50, padV: 24,
      align: 'CENTER', justify: 'SPACE_BETWEEN'
    });
    // Payment icons left
    var payments = mkFrame('Payment Icons', 'HORIZONTAL', { gap: 8, align: 'CENTER' });
    var payLabels = ['Visa', 'MC', 'Amex', 'PP', 'DI', 'DC'];
    for (var pi = 0; pi < payLabels.length; pi++) {
      var payIcon = mkFrame(payLabels[pi], 'HORIZONTAL', {
        gap: 0, padH: 10, padV: 6,
        radius: 4,
        fills: [{ type: 'SOLID', color: GREY95 }],
        align: 'CENTER', justify: 'CENTER'
      });
      payIcon.resize(42, 28);
      payIcon.primaryAxisSizingMode = 'FIXED';
      payIcon.counterAxisSizingMode = 'FIXED';
      payIcon.appendChild(mkLabel(payLabels[pi], 9, 'Semi Bold', GREY40));
      payments.appendChild(payIcon);
    }
    bottomRow.appendChild(payments);

    // Copyright center
    bottomRow.appendChild(mkLabel('\u00A9 2026 Hyper Garace. Powered by Shopify', 12, 'Regular', GREY40));

    // Legal links right
    var legalLinks = mkFrame('Legal', 'HORIZONTAL', { gap: 16 });
    legalLinks.appendChild(mkLabel('Terms of Service', 12, 'Regular', GREY40));
    legalLinks.appendChild(mkLabel('Privacy Policy', 12, 'Regular', GREY40));
    bottomRow.appendChild(legalLinks);
    comp.appendChild(bottomRow);
    fillH(bottomRow);

    return comp;
  }

  function buildSlideshow(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Slideshow';
    comp.resize(1440, 640);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'FIXED';
    comp.counterAxisSizingMode = 'FIXED';
    comp.fills = [];
    comp.clipsContent = true;
    comp.itemSpacing = 0;

    // Background image placeholder
    var bg = mkRect(1440, 640, GREY85, 'Slide Background');
    comp.appendChild(bg);
    bg.layoutPositioning = 'ABSOLUTE';
    bg.x = 0; bg.y = 0;
    try { bg.layoutSizingHorizontal = 'FILL'; bg.layoutSizingVertical = 'FILL'; } catch(_){}
    bg.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };

    // Dark overlay
    var overlay = mkRect(1440, 640, BLACK, 'Overlay');
    overlay.opacity = 0.35;
    comp.appendChild(overlay);
    overlay.layoutPositioning = 'ABSOLUTE';
    overlay.x = 0; overlay.y = 0;
    try { overlay.layoutSizingHorizontal = 'FILL'; overlay.layoutSizingVertical = 'FILL'; } catch(_){}
    overlay.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };

    // Centered content
    var content = mkFrame('Slide Content', 'VERTICAL', { gap: 20, pad: 60, fills: [] });
    comp.appendChild(content);
    content.layoutPositioning = 'ABSOLUTE';
    content.x = 0; content.y = 0;
    try { content.layoutSizingHorizontal = 'FILL'; content.layoutSizingVertical = 'FILL'; } catch(_){}
    content.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };
    content.counterAxisAlignItems = 'CENTER';
    content.primaryAxisAlignItems = 'CENTER';

    content.appendChild(mkLabel('FEATURED COLLECTION', 13, 'Semi Bold', WHITE));
    var heading = mkLabel('Slideshow Heading\nGoes Right Here', 48, 'Bold', WHITE);
    try { heading.textAutoResize = 'HEIGHT'; heading.resize(700, 70); heading.textAlignHorizontal = 'CENTER'; } catch(_){}
    content.appendChild(heading);
    var desc = mkLabel('A brief description or promotional message highlighting the current slide content.', 16, 'Regular', { r: 0.9, g: 0.9, b: 0.9 });
    try { desc.textAutoResize = 'HEIGHT'; desc.resize(560, 20); desc.textAlignHorizontal = 'CENTER'; } catch(_){}
    content.appendChild(desc);

    var btnRow = mkFrame('CTA Buttons', 'HORIZONTAL', { gap: 12, align: 'CENTER' });
    btnRow.appendChild(mkPillBtn('Shop Now', true));
    var outlineBtn = mkPillBtn('Learn More', false);
    try { outlineBtn.fills = []; outlineBtn.strokes = [{ type: 'SOLID', color: WHITE }]; outlineBtn.children[0].fills = [{ type: 'SOLID', color: WHITE }]; } catch(_){}
    btnRow.appendChild(outlineBtn);
    content.appendChild(btnRow);

    // Nav arrows
    var prevArrow = mkNavArrow('left');
    comp.appendChild(prevArrow);
    prevArrow.layoutPositioning = 'ABSOLUTE';
    prevArrow.x = 24; prevArrow.y = 298;

    var nextArrow = mkNavArrow('right');
    comp.appendChild(nextArrow);
    nextArrow.layoutPositioning = 'ABSOLUTE';
    nextArrow.x = 1372; nextArrow.y = 298;

    // Pagination dots
    var dots = mkDots(3, 0);
    comp.appendChild(dots);
    dots.layoutPositioning = 'ABSOLUTE';
    dots.x = 690; dots.y = 600;

    // Slide counter
    var counter = mkLabel('1 / 3', 13, 'Medium', { r: 0.85, g: 0.85, b: 0.85 });
    comp.appendChild(counter);
    counter.layoutPositioning = 'ABSOLUTE';
    counter.x = 1370; counter.y = 604;

    return comp;
  }

  // Figma ref: scrolling-promotion with category names + small product images between them
  //   White bg, text in blue (#2c3cc4), product thumbnails as separators
  function buildMarquee(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Marquee';
    comp.resize(1440, 72);
    comp.layoutMode = 'HORIZONTAL';
    comp.primaryAxisSizingMode = 'FIXED';
    comp.counterAxisSizingMode = 'FIXED';
    comp.counterAxisAlignItems = 'CENTER';
    comp.primaryAxisAlignItems = 'CENTER';
    comp.itemSpacing = 24;
    comp.fills = [{ type: 'SOLID', color: WHITE }];
    comp.clipsContent = true;

    var SCROLL_BLUE = { r: 0.17, g: 0.24, b: 0.77 };
    var marqueeNames = ['Lounge Chairs', 'Bow Chairs', 'Cross Chair', 'Lounge Chairs', 'Bow Chairs', 'Cross Chair'];
    for (var mi = 0; mi < marqueeNames.length; mi++) {
      comp.appendChild(mkLabel(marqueeNames[mi], 18, 'Bold', SCROLL_BLUE));
      // Small product thumbnail as separator
      comp.appendChild(mkRect(36, 44, GREY90, 'Product Thumb', 4));
    }
    return comp;
  }

  function buildCollectionList(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Collection List';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 56; comp.paddingBottom = 56;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 32;
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    // Figma ref: "Shop By Categories" with 4 tall image cards, each has dark overlay with
    //   subheading, large heading, product thumbnail + name/price + "Shop" pill at bottom
    var header = mkSectionHeader(displayName || 'Shop by Categories', {});
    comp.appendChild(header);
    fillH(header);

    // Collection cards — 4 tall portrait cards with overlay content
    var grid = mkFrame('Collection Grid', 'HORIZONTAL', { gap: 20 });
    comp.appendChild(grid);
    fillH(grid);

    var collSubheads = ['Danish Design', 'Cotton Collection', 'Minimalism Style', 'Danish Design'];
    var collNames = ['Material Natural', 'Authority Design', 'Steels Lighting', 'Nightstand'];
    var collProducts = ['Grid Chair Frame', 'Lunara Tea Towel', 'Sculpt Table Lamp', 'Pixel Shelves'];
    var collPrices = ['\u00A3309.00', '\u00A327.00', '\u00A3415.00', '\u00A385.00'];
    for (var ci = 0; ci < 4; ci++) {
      var card = mkFrame('Collection ' + (ci + 1), 'VERTICAL', { gap: 0, radius: 10 });
      card.resize(320, 440);
      card.primaryAxisSizingMode = 'FIXED';
      card.counterAxisSizingMode = 'FIXED';
      card.clipsContent = true;

      // Background image
      var bgImg = mkProductImage(320, 440, null, 0);
      card.appendChild(bgImg);
      bgImg.layoutPositioning = 'ABSOLUTE';
      bgImg.x = 0; bgImg.y = 0;

      // Dark gradient overlay
      var overlay = mkRect(320, 440, BLACK, 'Overlay');
      overlay.opacity = 0.35;
      card.appendChild(overlay);
      overlay.layoutPositioning = 'ABSOLUTE';
      overlay.x = 0; overlay.y = 0;

      // Text content (bottom-left)
      var textContent = mkFrame('Content', 'VERTICAL', {
        gap: 6, fills: [], padH: 24, padV: 24
      });
      card.appendChild(textContent);
      textContent.layoutPositioning = 'ABSOLUTE';
      textContent.x = 0; textContent.y = 280;
      textContent.appendChild(mkLabel(collSubheads[ci], 12, 'Regular', { r: 0.85, g: 0.85, b: 0.85 }));
      textContent.appendChild(mkLabel(collNames[ci], 28, 'Bold', WHITE));

      // Bottom product bar
      var bottomBar = mkFrame('Product Bar', 'HORIZONTAL', {
        gap: 8, padH: 16, padV: 10,
        fills: [{ type: 'SOLID', color: WHITE }],
        align: 'CENTER', justify: 'SPACE_BETWEEN',
        radius: 10
      });
      bottomBar.resize(288, 48);
      bottomBar.primaryAxisSizingMode = 'FIXED';
      bottomBar.counterAxisSizingMode = 'FIXED';
      card.appendChild(bottomBar);
      bottomBar.layoutPositioning = 'ABSOLUTE';
      bottomBar.x = 16; bottomBar.y = 380;

      var prodInfo = mkFrame('Product Info', 'HORIZONTAL', { gap: 8, align: 'CENTER' });
      prodInfo.appendChild(mkRect(28, 28, GREY90, 'Thumb', 4));
      var prodText = mkFrame('Text', 'VERTICAL', { gap: 0 });
      prodText.appendChild(mkLabel(collProducts[ci], 12, 'Medium', BLACK));
      prodText.appendChild(mkLabel(collPrices[ci], 12, 'Regular', GREY40));
      prodInfo.appendChild(prodText);
      bottomBar.appendChild(prodInfo);
      bottomBar.appendChild(mkPillBtn('Shop', false));

      grid.appendChild(card);
      try { card.layoutGrow = 1; } catch(_){}
    }

    // Progress bar + Nav arrows
    var controls = mkFrame('Swiper Controls', 'HORIZONTAL', { gap: 12, align: 'CENTER' });
    comp.appendChild(controls);
    fillH(controls);
    var progressWrap = mkFrame('Progress Bar', 'HORIZONTAL', { gap: 0, fills: [{ type: 'SOLID', color: GREY90 }] });
    progressWrap.resize(100, 2);
    progressWrap.primaryAxisSizingMode = 'FIXED';
    progressWrap.counterAxisSizingMode = 'FIXED';
    controls.appendChild(progressWrap);
    try { progressWrap.layoutGrow = 1; } catch(_){}
    controls.appendChild(mkNavArrow('left'));
    controls.appendChild(mkNavArrow('right'));

    return comp;
  }

  function buildDivider(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Divider';
    comp.resize(1440, 1);
    comp.layoutMode = 'HORIZONTAL';
    comp.primaryAxisSizingMode = 'FIXED';
    comp.counterAxisSizingMode = 'AUTO';
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.fills = [];
    var line = mkRect(1344, 1, GREY85, 'Line');
    comp.appendChild(line);
    fillH(line);
    return comp;
  }

  function buildGenericSection(sec) {
    var displayName = sec.name.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });
    var comp = figma.createComponent();
    comp.name = displayName;
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 56; comp.paddingBottom = 56;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 32;
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    // Section header
    var header = mkSectionHeader(displayName, {
      subheading: 'SECTION',
      description: 'Section placeholder \u2014 customise this scaffold with your theme\'s content and media.'
    });
    comp.appendChild(header);
    fillH(header);

    // Visual content area based on block types
    var hasImageBlocks = false;
    var hasTextBlocks = false;
    var hasButtonBlocks = false;
    if (sec.blockTypes && sec.blockTypes.length > 0) {
      for (var bk = 0; bk < sec.blockTypes.length; bk++) {
        var bt = sec.blockTypes[bk].toLowerCase();
        if (bt.indexOf('image') !== -1 || bt.indexOf('media') !== -1 || bt.indexOf('video') !== -1) hasImageBlocks = true;
        if (bt.indexOf('text') !== -1 || bt.indexOf('heading') !== -1 || bt.indexOf('paragraph') !== -1 || bt.indexOf('rich') !== -1) hasTextBlocks = true;
        if (bt.indexOf('button') !== -1 || bt.indexOf('link') !== -1 || bt.indexOf('cta') !== -1) hasButtonBlocks = true;
      }
    }

    if (hasImageBlocks && hasTextBlocks) {
      var twoCol = mkFrame('Content', 'HORIZONTAL', { gap: 32 });
      comp.appendChild(twoCol);
      fillH(twoCol);

      var imgSide = mkProductImage(660, 440, null, 12);
      twoCol.appendChild(imgSide);
      try { imgSide.layoutGrow = 1; } catch(_){}

      var textSide = mkFrame('Text Content', 'VERTICAL', { gap: 20, justify: 'CENTER', padH: 16 });
      textSide.appendChild(mkLabel('Heading Goes Here', 28, 'Bold', BLACK));
      var bodyP = mkLabel('This section contains image and text blocks. Replace this placeholder with your actual content, descriptions, and brand messaging.', 15, 'Regular', GREY40);
      try { bodyP.textAutoResize = 'HEIGHT'; bodyP.resize(500, 20); } catch(_){}
      textSide.appendChild(bodyP);
      if (hasButtonBlocks) {
        textSide.appendChild(mkPillBtn('Call to Action', true));
      }
      twoCol.appendChild(textSide);
      try { textSide.layoutGrow = 1; } catch(_){}
    } else if (hasImageBlocks) {
      var imgGrid = mkFrame('Image Grid', 'HORIZONTAL', { gap: 20 });
      comp.appendChild(imgGrid);
      fillH(imgGrid);
      for (var ig = 0; ig < 3; ig++) {
        var placeholder = mkProductImage(440, 300, null, 12);
        imgGrid.appendChild(placeholder);
        try { placeholder.layoutGrow = 1; } catch(_){}
      }
    } else {
      var contentArea = mkFrame('Content Area', 'VERTICAL', {
        gap: 20, pad: 40, radius: 12,
        fills: [{ type: 'SOLID', color: GREY95 }],
        align: 'CENTER'
      });
      contentArea.appendChild(mkLabel('Content goes here', 18, 'Medium', GREY40));
      var contentDesc = mkLabel('This area will contain the section\'s main content. Customise it with text, images, and interactive elements.', 14, 'Regular', GREY60);
      try { contentDesc.textAutoResize = 'HEIGHT'; contentDesc.resize(600, 20); contentDesc.textAlignHorizontal = 'CENTER'; } catch(_){}
      contentArea.appendChild(contentDesc);
      if (hasButtonBlocks) {
        contentArea.appendChild(mkPillBtn('Call to Action', true));
      }
      comp.appendChild(contentArea);
      fillH(contentArea);
    }

    // Block types as pills
    if (sec.blockTypes && sec.blockTypes.length > 0) {
      var blocksLabel = mkLabel('BLOCK TYPES', 10, 'Semi Bold', GREY60);
      comp.appendChild(blocksLabel);
      var blocksRow = mkFrame('Block Types', 'HORIZONTAL', { gap: 8 });
      blocksRow.layoutWrap = 'WRAP';
      for (var bi = 0; bi < sec.blockTypes.length; bi++) {
        var pill = mkFrame(sec.blockTypes[bi], 'HORIZONTAL', {
          padH: 12, padV: 6, radius: 100,
          fills: [{ type: 'SOLID', color: { r: 0.93, g: 0.96, b: 1 } }],
          align: 'CENTER'
        });
        pill.appendChild(mkLabel(sec.blockTypes[bi], 11, 'Medium', { r: 0.2, g: 0.4, b: 0.7 }));
        blocksRow.appendChild(pill);
      }
      comp.appendChild(blocksRow);
      fillH(blocksRow);
    }

    // Settings as compact info
    if (sec.selectSettings && sec.selectSettings.length > 0) {
      var settingsLabel = mkLabel('SETTINGS', 10, 'Semi Bold', GREY60);
      comp.appendChild(settingsLabel);
      var settingsInfo = mkFrame('Settings', 'HORIZONTAL', { gap: 8 });
      settingsInfo.layoutWrap = 'WRAP';
      for (var sti = 0; sti < sec.selectSettings.length && sti < 4; sti++) {
        var s = sec.selectSettings[sti];
        var sPill = mkFrame(s.id, 'HORIZONTAL', {
          padH: 12, padV: 6, radius: 100,
          fills: [{ type: 'SOLID', color: GREY95 }],
          align: 'CENTER'
        });
        sPill.appendChild(mkLabel(s.id, 11, 'Medium', GREY40));
        settingsInfo.appendChild(sPill);
      }
      comp.appendChild(settingsInfo);
      fillH(settingsInfo);
    }

    return comp;
  }

  // ── Banner / promo builder (reusable) ──
  function buildBanner(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Banner';
    comp.resize(1440, 480);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'FIXED';
    comp.counterAxisSizingMode = 'FIXED';
    comp.fills = [];
    comp.clipsContent = true;
    comp.itemSpacing = 0;

    // Background image placeholder
    var bgImg = mkProductImage(1440, 480, null, 0);
    comp.appendChild(bgImg);
    bgImg.layoutPositioning = 'ABSOLUTE';
    bgImg.x = 0; bgImg.y = 0;
    try { bgImg.layoutSizingHorizontal = 'FILL'; bgImg.layoutSizingVertical = 'FILL'; } catch(_){}
    bgImg.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };

    // Dark overlay
    var overlay = mkRect(1440, 480, BLACK, 'Overlay');
    overlay.opacity = 0.4;
    comp.appendChild(overlay);
    overlay.layoutPositioning = 'ABSOLUTE';
    overlay.x = 0; overlay.y = 0;
    try { overlay.layoutSizingHorizontal = 'FILL'; overlay.layoutSizingVertical = 'FILL'; } catch(_){}
    overlay.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };

    // Content
    var content = mkFrame('Content', 'VERTICAL', { gap: 20, pad: 60, fills: [] });
    comp.appendChild(content);
    content.layoutPositioning = 'ABSOLUTE';
    content.x = 0; content.y = 0;
    try { content.layoutSizingHorizontal = 'FILL'; content.layoutSizingVertical = 'FILL'; } catch(_){}
    content.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };
    content.counterAxisAlignItems = 'CENTER';
    content.primaryAxisAlignItems = 'CENTER';

    content.appendChild(mkLabel('LIMITED TIME OFFER', 12, 'Semi Bold', { r: 0.9, g: 0.9, b: 0.9 }));
    var heading = mkLabel(displayName || 'Banner Heading\nGoes Here', 42, 'Bold', WHITE);
    try { heading.textAutoResize = 'HEIGHT'; heading.resize(700, 70); heading.textAlignHorizontal = 'CENTER'; } catch(_){}
    content.appendChild(heading);
    var desc = mkLabel('Discover our latest collection with exclusive deals and free shipping on orders over \u00a350.', 16, 'Regular', { r: 0.85, g: 0.85, b: 0.85 });
    try { desc.textAutoResize = 'HEIGHT'; desc.resize(560, 20); desc.textAlignHorizontal = 'CENTER'; } catch(_){}
    content.appendChild(desc);

    var btnRow = mkFrame('CTA Buttons', 'HORIZONTAL', { gap: 12, align: 'CENTER' });
    btnRow.appendChild(mkPillBtn('Shop Now', true));
    var outlineBtn = mkPillBtn('Learn More', false);
    try { outlineBtn.fills = []; outlineBtn.strokes = [{ type: 'SOLID', color: WHITE }]; outlineBtn.children[0].fills = [{ type: 'SOLID', color: WHITE }]; } catch(_){}
    btnRow.appendChild(outlineBtn);
    content.appendChild(btnRow);

    return comp;
  }

  // ── Image grid builder (reusable) ──
  function buildImageGrid(displayName, cols) {
    cols = cols || 3;
    var comp = figma.createComponent();
    comp.name = displayName || 'Image Grid';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 56; comp.paddingBottom = 56;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 32;
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    var header = mkSectionHeader(displayName || 'Image Grid', {
      subheading: 'Explore',
      description: 'Browse our curated visual collection and discover something new.'
    });
    comp.appendChild(header);
    fillH(header);

    var grid = mkFrame('Grid', 'HORIZONTAL', { gap: 20 });
    comp.appendChild(grid);
    fillH(grid);

    var cardW = Math.floor((1344 - (cols - 1) * 20) / cols);
    var cardH = Math.round(cardW * 0.7);
    var badgeOptions = ['New', 'Featured', null];
    var cardTitles = ['Spring Lookbook', 'Weekend Edit', 'Staff Picks'];
    for (var gi = 0; gi < cols; gi++) {
      var card = mkFrame('Card ' + (gi + 1), 'VERTICAL', { gap: 0, radius: 12 });
      card.primaryAxisSizingMode = 'AUTO';
      card.clipsContent = true;

      // Image with badge
      var img = mkProductImage(cardW, cardH, badgeOptions[gi % badgeOptions.length], 12);
      card.appendChild(img);
      try { img.layoutSizingHorizontal = 'FILL'; } catch(_){}

      // Overlay text at bottom of image
      var overlayBar = mkFrame('Card Overlay', 'HORIZONTAL', {
        gap: 8, padH: 20, padV: 16,
        fills: [{ type: 'SOLID', color: BLACK }],
        align: 'CENTER', justify: 'SPACE_BETWEEN'
      });
      overlayBar.opacity = 0.75;
      card.appendChild(overlayBar);
      fillH(overlayBar);
      overlayBar.appendChild(mkLabel(cardTitles[gi % cardTitles.length], 15, 'Semi Bold', WHITE));
      overlayBar.appendChild(mkLabel('Shop Now \u2192', 13, 'Medium', WHITE));

      grid.appendChild(card);
      try { card.layoutGrow = 1; } catch(_){}
    }

    return comp;
  }

  // ── Testimonials / reviews builder ──
  function buildTestimonials(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Testimonials';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 56; comp.paddingBottom = 56;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 32;
    // Figma ref: yellow/lime bg, centered large quote text, author name + location below
    comp.fills = [{ type: 'SOLID', color: LIME_BG }];
    comp.counterAxisAlignItems = 'CENTER';

    comp.appendChild(mkLabel('What Clients Talk About Us', 14, 'Semi Bold', BLACK));

    var quote = mkLabel('\u201CThe products are artful, fun, have a\nstory just as unique as the designers\nwho made it.\u201D', 32, 'Bold', BLACK);
    try { quote.textAutoResize = 'HEIGHT'; quote.resize(700, 40); quote.textAlignHorizontal = 'CENTER'; } catch(_){}
    comp.appendChild(quote);

    comp.appendChild(mkLabel('Jenny Wilson', 15, 'Bold', BLACK));
    comp.appendChild(mkLabel('New Mexico', 14, 'Regular', GREY40));

    return comp;
  }

  // ── Rich text / text columns builder ──
  function buildRichText(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Rich Text';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 64; comp.paddingBottom = 64;
    comp.paddingLeft = 240; comp.paddingRight = 240;
    comp.itemSpacing = 24;
    comp.fills = [{ type: 'SOLID', color: WHITE }];
    comp.counterAxisAlignItems = 'CENTER';

    var header = mkSectionHeader(displayName || 'Our Story', {
      subheading: 'About Us',
      headingSize: 36
    });
    comp.appendChild(header);
    fillH(header);

    var body1 = mkLabel('We started with a simple belief: everyone deserves access to beautifully crafted, sustainably sourced products. What began as a small workshop has grown into a community of artisans, designers, and dreamers committed to quality over quantity.', 16, 'Regular', GREY40);
    try { body1.textAutoResize = 'HEIGHT'; body1.resize(960, 20); body1.textAlignHorizontal = 'CENTER'; } catch(_){}
    comp.appendChild(body1);

    var body2 = mkLabel('Every piece in our collection tells a story \u2014 from the ethically sourced materials to the skilled hands that shape them. We believe that the things you surround yourself with should bring joy, last a lifetime, and leave the world a little better than we found it.', 16, 'Regular', GREY40);
    try { body2.textAutoResize = 'HEIGHT'; body2.resize(960, 20); body2.textAlignHorizontal = 'CENTER'; } catch(_){}
    comp.appendChild(body2);

    comp.appendChild(mkPillBtn('Learn More', false));

    return comp;
  }

  // ── Newsletter / email signup builder ──
  function buildNewsletter(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Newsletter';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 64; comp.paddingBottom = 64;
    comp.paddingLeft = 240; comp.paddingRight = 240;
    comp.itemSpacing = 24;
    comp.fills = [{ type: 'SOLID', color: GREY95 }];
    comp.counterAxisAlignItems = 'CENTER';

    var header = mkSectionHeader('Stay in the Loop', {
      subheading: 'Newsletter',
      description: 'Subscribe for updates, exclusive offers, early access to sales and more.',
      align: 'CENTER'
    });
    comp.appendChild(header);
    fillH(header);

    // Input row: pill email input + pill subscribe button
    var inputRow = mkFrame('Input Row', 'HORIZONTAL', { gap: 0, align: 'CENTER' });
    var input = mkFrame('Email Input', 'HORIZONTAL', {
      padH: 24, padV: 14,
      fills: [{ type: 'SOLID', color: WHITE }],
      radius: 100, align: 'CENTER',
      stroke: 1, strokeColor: GREY85
    });
    input.resize(380, 48);
    input.primaryAxisSizingMode = 'FIXED';
    input.counterAxisSizingMode = 'FIXED';
    input.appendChild(mkLabel('Enter your email address', 14, 'Regular', GREY60));
    inputRow.appendChild(input);
    inputRow.appendChild(mkPillBtn('Subscribe', true));
    comp.appendChild(inputRow);

    // Helper text
    var helper = mkLabel('No spam, unsubscribe anytime.', 12, 'Regular', GREY60);
    comp.appendChild(helper);

    return comp;
  }

  // ── Video section builder ──
  function buildVideo(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Video';
    comp.resize(1440, 600);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'FIXED';
    comp.counterAxisSizingMode = 'FIXED';
    comp.fills = [];
    comp.clipsContent = true;
    comp.itemSpacing = 0;

    // Full-width video placeholder background
    var videoBg = mkRect(1440, 600, GREY85, 'Video Background');
    comp.appendChild(videoBg);
    videoBg.layoutPositioning = 'ABSOLUTE';
    videoBg.x = 0; videoBg.y = 0;
    try { videoBg.layoutSizingHorizontal = 'FILL'; videoBg.layoutSizingVertical = 'FILL'; } catch(_){}
    videoBg.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };

    // Subtle dark overlay
    var overlay = mkRect(1440, 600, BLACK, 'Overlay');
    overlay.opacity = 0.2;
    comp.appendChild(overlay);
    overlay.layoutPositioning = 'ABSOLUTE';
    overlay.x = 0; overlay.y = 0;
    try { overlay.layoutSizingHorizontal = 'FILL'; overlay.layoutSizingVertical = 'FILL'; } catch(_){}
    overlay.constraints = { horizontal: 'STRETCH', vertical: 'STRETCH' };

    // Large centered play button
    var playBtn = mkFrame('Play Button', 'HORIZONTAL', {
      gap: 0, fills: [{ type: 'SOLID', color: WHITE }],
      radius: 100, align: 'CENTER', justify: 'CENTER'
    });
    playBtn.resize(80, 80);
    playBtn.primaryAxisSizingMode = 'FIXED';
    playBtn.counterAxisSizingMode = 'FIXED';
    playBtn.appendChild(mkLabel('\u25B6', 28, 'Regular', BLACK));
    comp.appendChild(playBtn);
    playBtn.layoutPositioning = 'ABSOLUTE';
    playBtn.x = 680; playBtn.y = 260;

    // Duration badge at bottom-right
    var duration = mkFrame('Duration', 'HORIZONTAL', {
      gap: 0, padH: 10, padV: 6,
      radius: 6, fills: [{ type: 'SOLID', color: BLACK }],
      align: 'CENTER', justify: 'CENTER'
    });
    duration.opacity = 0.75;
    duration.appendChild(mkLabel('2:34', 12, 'Semi Bold', WHITE));
    comp.appendChild(duration);
    duration.layoutPositioning = 'ABSOLUTE';
    duration.x = 1370; duration.y = 560;

    return comp;
  }

  // ── Logo list / brand logos builder ──
  function buildLogoList(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Brand Logos';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 40; comp.paddingBottom = 40;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 24;
    comp.fills = [{ type: 'SOLID', color: WHITE }];
    comp.counterAxisAlignItems = 'CENTER';

    // Top border
    comp.strokes = [{ type: 'SOLID', color: GREY90 }];
    comp.strokeWeight = 1;
    comp.strokeAlign = 'INSIDE';

    comp.appendChild(mkLabel('As Featured In', 12, 'Semi Bold', GREY60));

    var row = mkFrame('Logos', 'HORIZONTAL', { gap: 48, align: 'CENTER', justify: 'CENTER' });
    comp.appendChild(row);
    fillH(row);

    for (var li = 0; li < 5; li++) {
      var logo = mkRect(140, 48, GREY90, 'Logo ' + (li + 1), 6);
      row.appendChild(logo);
    }

    return comp;
  }

  // ── Multi-column content builder ──
  function buildMultiColumn(displayName, cols) {
    cols = cols || 3;
    var comp = figma.createComponent();
    comp.name = displayName || 'Multi Column';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 56; comp.paddingBottom = 56;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 40;
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    var header = mkSectionHeader(displayName || 'Why Choose Us', {
      subheading: 'Features',
      description: 'Discover the benefits that set us apart from the rest.'
    });
    comp.appendChild(header);
    fillH(header);

    var row = mkFrame('Columns', 'HORIZONTAL', { gap: 32 });
    comp.appendChild(row);
    fillH(row);

    // Figma ref: 4 columns, each with a large image + title + description below
    var colTitles = ['Comfortable', 'Price transparency', 'All eco-certified', 'Sustainability'];
    var colDescs = [
      'Bow Chair is available in Natural or Black-stained Oak with full EU Ecolabel certification.',
      'Fair pricing ensures you know exactly what you\u2019re paying for, with no hidden costs or markups.',
      'All products consider a more holistic environmental impact and are designed for a longer lifetime.',
      'Committed to sustainable practices, ethical sourcing, and reducing environmental impact.'
    ];
    for (var ci = 0; ci < (cols > 4 ? 4 : cols); ci++) {
      var col = mkFrame('Column ' + (ci + 1), 'VERTICAL', { gap: 16 });
      col.primaryAxisSizingMode = 'AUTO';

      // Large image placeholder (Figma ref shows real lifestyle photos)
      col.appendChild(mkProductImage(280, 280, null, 10));

      col.appendChild(mkLabel(colTitles[ci % colTitles.length], 18, 'Bold', BLACK));

      var colBody = mkLabel(colDescs[ci % colDescs.length], 14, 'Regular', GREY40);
      try { colBody.textAutoResize = 'HEIGHT'; colBody.resize(280, 20); } catch(_){}
      col.appendChild(colBody);

      row.appendChild(col);
      try { col.layoutGrow = 1; } catch(_){}
    }

    return comp;
  }

  // ── FAQ / Collapsible content builder ──
  function buildFAQ(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'FAQ';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 64; comp.paddingBottom = 64;
    comp.paddingLeft = 200; comp.paddingRight = 200;
    comp.itemSpacing = 0;
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    var header = mkSectionHeader(displayName || 'Frequently Asked Questions', {
      subheading: 'FAQ',
      description: 'Find answers to the most common questions about our products, shipping, and policies.',
      align: 'CENTER'
    });
    comp.appendChild(header);
    fillH(header);

    // Spacer
    var spacer = mkFrame('spacer', 'VERTICAL', { gap: 0 });
    spacer.resize(10, 32);
    comp.appendChild(spacer);

    var questions = [
      'What is your return policy?',
      'How long does shipping take?',
      'Do you offer gift wrapping?',
      'How do I track my order?',
      'What payment methods do you accept?'
    ];
    var answerText = 'We offer a hassle-free 30-day return policy on all items. Simply contact our support team to initiate a return, and we\'ll provide you with a prepaid shipping label. Refunds are processed within 5-7 business days after we receive the item.';

    for (var qi = 0; qi < questions.length; qi++) {
      var item = mkFrame('Question ' + (qi + 1), 'VERTICAL', { gap: 0, padV: 20 });
      item.strokes = [{ type: 'SOLID', color: GREY90 }];
      item.strokeWeight = 1;
      item.strokeAlign = 'INSIDE';

      var qRow = mkFrame('Question Row', 'HORIZONTAL', {
        gap: 8, align: 'CENTER', justify: 'SPACE_BETWEEN'
      });
      qRow.appendChild(mkLabel(questions[qi], 16, qi === 0 ? 'Semi Bold' : 'Medium', BLACK));
      qRow.appendChild(mkLabel(qi === 0 ? '\u2212' : '+', 22, 'Regular', GREY40));
      item.appendChild(qRow);
      fillH(qRow);

      // First question expanded with answer
      if (qi === 0) {
        var answerWrap = mkFrame('Answer', 'VERTICAL', { gap: 0, padV: 12 });
        var answer = mkLabel(answerText, 14, 'Regular', GREY40);
        try { answer.textAutoResize = 'HEIGHT'; answer.resize(960, 20); } catch(_){}
        answerWrap.appendChild(answer);
        item.appendChild(answerWrap);
        fillH(answerWrap);
      }

      comp.appendChild(item);
      fillH(item);
    }

    return comp;
  }

  // ── Contact / form builder ──
  function buildContactForm(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Contact Form';
    comp.resize(1440, 100);
    comp.layoutMode = 'HORIZONTAL';
    comp.primaryAxisSizingMode = 'FIXED';
    comp.counterAxisSizingMode = 'AUTO';
    comp.fills = [{ type: 'SOLID', color: WHITE }];
    comp.itemSpacing = 0;

    // Left side: map placeholder
    var mapSide = mkProductImage(640, 560, null, 0);
    comp.appendChild(mapSide);
    try { mapSide.layoutSizingVertical = 'FILL'; } catch(_){}

    // Right side: form
    var formSide = mkFrame('Form', 'VERTICAL', {
      gap: 20, padH: 56, padV: 56,
      fills: [{ type: 'SOLID', color: WHITE }],
      justify: 'CENTER'
    });
    formSide.resize(800, 100);
    formSide.primaryAxisSizingMode = 'AUTO';

    formSide.appendChild(mkLabel('Get in Touch', 32, 'Bold', BLACK));
    formSide.appendChild(mkLabel('We\'d love to hear from you. Fill out the form below and we\'ll get back to you within 24 hours.', 14, 'Regular', GREY40));

    var fields = ['Name', 'Email', 'Subject', 'Message'];
    for (var fi = 0; fi < fields.length; fi++) {
      var fieldWrap = mkFrame(fields[fi] + ' Field', 'VERTICAL', { gap: 6 });
      fieldWrap.appendChild(mkLabel(fields[fi], 13, 'Medium', GREY40));
      var input = mkFrame(fields[fi] + ' Input', 'HORIZONTAL', {
        padH: 20, padV: fields[fi] === 'Message' ? 48 : 14,
        fills: [{ type: 'SOLID', color: WHITE }],
        radius: 100, align: 'CENTER',
        stroke: 1, strokeColor: GREY85
      });
      input.appendChild(mkLabel('Enter ' + fields[fi].toLowerCase() + '\u2026', 14, 'Regular', GREY60));
      fieldWrap.appendChild(input);
      fillH(input);
      formSide.appendChild(fieldWrap);
      fillH(fieldWrap);
    }

    formSide.appendChild(mkPillBtn('Send Message', true));

    comp.appendChild(formSide);
    try { formSide.layoutGrow = 1; } catch(_){}

    return comp;
  }

  // ── Map section builder ──
  function buildMap(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Map';
    comp.resize(1440, 500);
    comp.layoutMode = 'HORIZONTAL';
    comp.primaryAxisSizingMode = 'FIXED';
    comp.counterAxisSizingMode = 'FIXED';
    comp.fills = [{ type: 'SOLID', color: WHITE }];
    comp.clipsContent = true;
    comp.itemSpacing = 0;

    // Map placeholder (left side)
    var mapArea = mkFrame('Map Area', 'VERTICAL', {
      fills: [{ type: 'SOLID', color: GREY90 }],
      justify: 'CENTER', align: 'CENTER'
    });
    comp.appendChild(mapArea);
    fillV(mapArea);
    try { mapArea.layoutGrow = 1; } catch(_){}

    // Map pin icon
    var pinWrap = mkFrame('Pin', 'VERTICAL', { gap: 8, fills: [], align: 'CENTER' });
    pinWrap.appendChild(mkIconCircle(48, 'Pin Icon', GREY80));
    pinWrap.appendChild(mkLabel('Map Embed', 14, 'Medium', GREY60));
    mapArea.appendChild(pinWrap);

    // Info panel (right side)
    var info = mkFrame('Location Info', 'VERTICAL', {
      gap: 24, padH: 50, padV: 48,
      fills: [{ type: 'SOLID', color: WHITE }],
      justify: 'CENTER'
    });
    info.resize(440, 500);
    info.primaryAxisSizingMode = 'FIXED';
    info.counterAxisSizingMode = 'FIXED';

    info.appendChild(mkLabel('Visit Our Store', 28, 'Bold', BLACK));

    // Address block
    var addrBlock = mkFrame('Address', 'VERTICAL', { gap: 4 });
    addrBlock.appendChild(mkLabel('ADDRESS', 11, 'Semi Bold', GREY60));
    addrBlock.appendChild(mkLabel('123 Store Street\nShoreditch, London\nEC1A 1BB, United Kingdom', 14, 'Regular', GREY40));
    info.appendChild(addrBlock);

    // Phone block
    var phoneBlock = mkFrame('Phone', 'VERTICAL', { gap: 4 });
    phoneBlock.appendChild(mkLabel('PHONE', 11, 'Semi Bold', GREY60));
    phoneBlock.appendChild(mkLabel('+44 (0) 20 7946 0958', 14, 'Regular', GREY40));
    info.appendChild(phoneBlock);

    // Hours block
    var hoursBlock = mkFrame('Hours', 'VERTICAL', { gap: 4 });
    hoursBlock.appendChild(mkLabel('OPENING HOURS', 11, 'Semi Bold', GREY60));
    hoursBlock.appendChild(mkLabel('Mon \u2013 Fri: 9am \u2013 6pm\nSaturday: 10am \u2013 4pm\nSunday: Closed', 14, 'Regular', GREY40));
    info.appendChild(hoursBlock);

    info.appendChild(mkPillBtn('Get Directions', true));

    comp.appendChild(info);

    return comp;
  }

  // ── Tabs section builder ──
  function buildTabs(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Tabs';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 56; comp.paddingBottom = 56;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 32;
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    var header = mkSectionHeader(displayName || 'Shop by Category', {
      subheading: 'Browse',
      description: 'Explore our curated collections by category.'
    });
    comp.appendChild(header);
    fillH(header);

    // Tab bar
    var tabBar = mkFrame('Tab Bar', 'HORIZONTAL', { gap: 0, justify: 'CENTER' });
    tabBar.strokes = [{ type: 'SOLID', color: GREY90 }];
    tabBar.strokeWeight = 1;
    tabBar.strokeAlign = 'INSIDE';
    var tabNames = ['New Arrivals', 'Best Sellers', 'Sale'];
    for (var ti = 0; ti < tabNames.length; ti++) {
      var tab = mkFrame(tabNames[ti], 'VERTICAL', {
        padH: 32, padV: 16, gap: 0,
        fills: [], align: 'CENTER'
      });
      tab.appendChild(mkLabel(tabNames[ti], 14, ti === 0 ? 'Semi Bold' : 'Regular', ti === 0 ? BLACK : GREY60));
      // Active tab: accent bottom border
      if (ti === 0) {
        var activeLine = mkRect(80, 3, ACCENT, 'Active Indicator');
        tab.appendChild(activeLine);
        activeLine.layoutPositioning = 'ABSOLUTE';
        activeLine.x = 16; activeLine.y = 44;
      }
      tabBar.appendChild(tab);
    }
    comp.appendChild(tabBar);
    fillH(tabBar);

    // Tab content: 3 product cards
    var tabContent = mkFrame('Tab Content', 'HORIZONTAL', { gap: 20, padV: 8 });
    comp.appendChild(tabContent);
    fillH(tabContent);

    for (var pc = 0; pc < 3; pc++) {
      var card = mkProductCard(280, {
        ratio: 1.25,
        imgRadius: 10,
        showSwatches: true,
        swatchCount: 4,
        showButton: true,
        showCategory: true
      });
      tabContent.appendChild(card);
      try { card.layoutGrow = 1; } catch(_){}
    }

    // Nav arrows
    var arrowRow = mkFrame('Navigation', 'HORIZONTAL', { gap: 12, justify: 'CENTER' });
    arrowRow.appendChild(mkNavArrow('left'));
    arrowRow.appendChild(mkNavArrow('right'));
    comp.appendChild(arrowRow);
    fillH(arrowRow);

    return comp;
  }

  // ── Comparison table builder ──
  function buildComparisonTable(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Comparison Table';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 60; comp.paddingBottom = 60;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 40;
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    var header = mkSectionHeader('Compare Products');
    comp.appendChild(header);
    fillH(header);

    // Product columns row
    var colRow = mkFrame('Product Columns', 'HORIZONTAL', { gap: 30, align: 'MIN' });
    comp.appendChild(colRow);
    fillH(colRow);

    var productNames = ['Classic Tee', 'Premium Hoodie', 'Sport Jacket'];
    var productPrices = ['£35.00', '£89.00', '£129.00'];

    for (var ci = 0; ci < 3; ci++) {
      var col = mkFrame('Product ' + (ci + 1), 'VERTICAL', { gap: 16, pad: 20, radius: 12, fills: [{ type: 'SOLID', color: GREY98 }] });
      col.appendChild(mkProductImage(320, 320, null, 10));
      col.appendChild(mkLabel(productNames[ci], 16, 'Semi Bold', BLACK));
      col.appendChild(mkLabel(productPrices[ci], 15, 'Medium', GREY40));
      colRow.appendChild(col);
      try { col.layoutGrow = 1; } catch(_){}
    }

    // Comparison rows
    var tableArea = mkFrame('Comparison Rows', 'VERTICAL', { gap: 0 });
    comp.appendChild(tableArea);
    fillH(tableArea);

    var rowLabels = ['Material', 'Weight', 'Sizes Available', 'Colour Options'];
    var rowValues = [
      ['100% Cotton', 'Cotton Blend', 'Nylon/Polyester'],
      ['180gsm', '320gsm', '250gsm'],
      ['XS – XL', 'S – 3XL', 'S – 2XL'],
      ['5 colours', '8 colours', '4 colours']
    ];

    for (var ri = 0; ri < 4; ri++) {
      var bgColor = ri % 2 === 0 ? GREY98 : WHITE;
      var row = mkFrame('Row ' + (ri + 1), 'HORIZONTAL', {
        gap: 0, padH: 20, padV: 16,
        fills: [{ type: 'SOLID', color: bgColor }],
        align: 'CENTER'
      });
      fillH(row);

      var labelCol = mkFrame('Label', 'HORIZONTAL', { gap: 0 });
      labelCol.resize(200, 20);
      labelCol.primaryAxisSizingMode = 'FIXED';
      labelCol.appendChild(mkLabel(rowLabels[ri], 13, 'Semi Bold', GREY40));
      row.appendChild(labelCol);

      for (var vi = 0; vi < 3; vi++) {
        var valCol = mkFrame('Value ' + (vi + 1), 'HORIZONTAL', { gap: 0, justify: 'CENTER' });
        valCol.appendChild(mkLabel(rowValues[ri][vi], 14, 'Regular', BLACK));
        row.appendChild(valCol);
        try { valCol.layoutGrow = 1; } catch(_){}
      }

      tableArea.appendChild(row);
    }

    // Bottom CTA row
    var ctaRow = mkFrame('CTA Row', 'HORIZONTAL', { gap: 24, padV: 24, padH: 20, align: 'CENTER' });
    fillH(ctaRow);

    var ctaSpacer = mkFrame('Spacer', 'HORIZONTAL', { gap: 0 });
    ctaSpacer.resize(200, 1);
    ctaSpacer.primaryAxisSizingMode = 'FIXED';
    ctaRow.appendChild(ctaSpacer);

    for (var bi = 0; bi < 3; bi++) {
      var btnWrap = mkFrame('Btn Wrap ' + (bi + 1), 'HORIZONTAL', { gap: 0, justify: 'CENTER' });
      btnWrap.appendChild(mkPillBtn('Add to Cart', true));
      ctaRow.appendChild(btnWrap);
      try { btnWrap.layoutGrow = 1; } catch(_){}
    }
    comp.appendChild(ctaRow);

    return comp;
  }

  // ── Countdown builder ──
  // Figma ref: yellow/lime bg (#f0f07a-ish), horizontal with text left, big numbers center,
  //   description right, black pill CTA button — rounded-[10px] mask container
  function buildCountdown(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Countdown';
    comp.resize(1440, 180);
    comp.layoutMode = 'HORIZONTAL';
    comp.primaryAxisSizingMode = 'FIXED';
    comp.counterAxisSizingMode = 'FIXED';
    comp.primaryAxisAlignItems = 'SPACE_BETWEEN';
    comp.counterAxisAlignItems = 'CENTER';
    comp.paddingTop = 20; comp.paddingBottom = 20;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 40;
    comp.fills = [];
    comp.clipsContent = true;

    // Rounded background (mask-group with rounded-[10px])
    var bgRect = mkRect(1340, 140, LIME_BG, 'Background', 10);
    comp.appendChild(bgRect);
    bgRect.layoutPositioning = 'ABSOLUTE';
    bgRect.x = 50; bgRect.y = 20;

    // Left: text content (on yellow bg, use black text)
    var textSide = mkFrame('Text Content', 'VERTICAL', { gap: 4, justify: 'CENTER' });
    textSide.appendChild(mkLabel('Flash Sale now on!', 15, 'Bold', ACCENT));
    comp.appendChild(textSide);

    // Center: large countdown numbers (Figma ref: big bold numbers with colon separators)
    var timerRow = mkFrame('Timer', 'HORIZONTAL', { gap: 12, align: 'CENTER' });
    var timeValues = ['16', '22', '29', '59'];
    for (var ti = 0; ti < 4; ti++) {
      timerRow.appendChild(mkLabel(timeValues[ti], 42, 'Bold', BLACK));
      if (ti < 3) {
        timerRow.appendChild(mkLabel(':', 36, 'Regular', BLACK));
      }
    }
    comp.appendChild(timerRow);

    // Right: description + CTA button
    var rightSide = mkFrame('Right Content', 'HORIZONTAL', { gap: 32, align: 'CENTER' });
    var descWrap = mkFrame('Description', 'VERTICAL', { gap: 4 });
    descWrap.appendChild(mkLabel('Save on modern table office,', 14, 'Regular', BLACK));
    descWrap.appendChild(mkLabel('best sellers + more', 14, 'Regular', BLACK));
    rightSide.appendChild(descWrap);
    rightSide.appendChild(mkPillBtn('Use Code: FLASH30', true));
    comp.appendChild(rightSide);

    return comp;
  }

  // ── Horizontal product list builder ──
  function buildHorizontalProductList(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Horizontal Products List';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 60; comp.paddingBottom = 60;
    comp.paddingLeft = 0; comp.paddingRight = 0;
    comp.itemSpacing = 32;
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    // Section header
    var header = mkSectionHeader(displayName || 'Trending Products', {
      subheading: 'SHOP NOW',
      description: 'Browse our most popular items this season'
    });
    comp.appendChild(header);
    fillH(header);

    // Product strip wrapper (for arrows)
    var stripWrap = mkFrame('Product Strip Wrapper', 'HORIZONTAL', {
      gap: 0, padH: 40, align: 'CENTER'
    });
    stripWrap.resize(1440, 100);
    stripWrap.counterAxisSizingMode = 'AUTO';
    stripWrap.primaryAxisSizingMode = 'FIXED';

    // Left arrow
    var leftArrow = mkNavArrow('left');
    stripWrap.appendChild(leftArrow);
    leftArrow.layoutPositioning = 'ABSOLUTE';
    leftArrow.x = 16;
    leftArrow.y = 140;

    // Product row
    var strip = mkFrame('Products', 'HORIZONTAL', { gap: 20, padH: 40, padV: 0 });
    strip.clipsContent = true;
    for (var pi = 0; pi < 5; pi++) {
      strip.appendChild(mkProductCard(240, { ratio: 1.0, showSwatches: false }));
    }
    stripWrap.appendChild(strip);
    fillH(strip);

    // Right arrow
    var rightArrow = mkNavArrow('right');
    stripWrap.appendChild(rightArrow);
    rightArrow.layoutPositioning = 'ABSOLUTE';
    rightArrow.x = 1380;
    rightArrow.y = 140;

    comp.appendChild(stripWrap);
    fillH(stripWrap);

    return comp;
  }

  // ── Before/After builder ──
  function buildBeforeAfter(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Before After';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 60; comp.paddingBottom = 60;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 40;
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    // Section header centered
    var header = mkSectionHeader(displayName || 'Before & After', { align: 'CENTER' });
    comp.appendChild(header);
    fillH(header);

    // Content area: two columns side-by-side
    var content = mkFrame('Content', 'HORIZONTAL', { gap: 24, align: 'CENTER', justify: 'CENTER' });
    content.resize(1440, 500);
    content.primaryAxisSizingMode = 'FIXED';
    content.counterAxisSizingMode = 'FIXED';

    // Before column
    var beforeImg = mkProductImage(680, 460, 'Before', 12);
    content.appendChild(beforeImg);

    // After column
    var afterImg = mkProductImage(680, 460, 'After', 12);
    content.appendChild(afterImg);

    // Center drag handle (absolute)
    var handle = mkFrame('Drag Handle', 'HORIZONTAL', {
      gap: 0, radius: 100,
      fills: [{ type: 'SOLID', color: WHITE }],
      align: 'CENTER', justify: 'CENTER',
      stroke: 2, strokeColor: GREY85
    });
    handle.resize(48, 48);
    handle.primaryAxisSizingMode = 'FIXED';
    handle.counterAxisSizingMode = 'FIXED';
    handle.appendChild(mkLabel('\u27F7', 20, 'Regular', BLACK));
    content.appendChild(handle);
    handle.layoutPositioning = 'ABSOLUTE';
    handle.x = Math.round(1440 / 2 - 24);
    handle.y = Math.round(500 / 2 - 24);

    comp.appendChild(content);

    return comp;
  }

  // ── Scrolling banner builder ──
  function buildScrollingBanner(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Scrolling Banner';
    comp.resize(1440, 560);
    comp.layoutMode = 'HORIZONTAL';
    comp.primaryAxisSizingMode = 'FIXED';
    comp.counterAxisSizingMode = 'FIXED';
    comp.itemSpacing = 0;
    comp.fills = [{ type: 'SOLID', color: DARK }];
    comp.clipsContent = true;

    // Main slide (90% width = ~1296px)
    var mainSlide = mkFrame('Main Slide', 'VERTICAL', {
      gap: 0, fills: []
    });
    mainSlide.resize(1296, 560);
    mainSlide.primaryAxisSizingMode = 'FIXED';
    mainSlide.counterAxisSizingMode = 'FIXED';
    mainSlide.clipsContent = true;

    // Background image
    var bgImg = mkProductImage(1296, 560, null, 0);
    mainSlide.appendChild(bgImg);
    bgImg.layoutPositioning = 'ABSOLUTE';
    bgImg.x = 0; bgImg.y = 0;

    // Dark overlay
    var overlay = mkRect(1296, 560, BLACK, 'Overlay');
    overlay.opacity = 0.45;
    mainSlide.appendChild(overlay);
    overlay.layoutPositioning = 'ABSOLUTE';
    overlay.x = 0; overlay.y = 0;

    // Text content (centered)
    var textContent = mkFrame('Slide Content', 'VERTICAL', {
      gap: 16, align: 'CENTER', justify: 'CENTER',
      pad: 80, fills: []
    });
    textContent.resize(1296, 560);
    textContent.primaryAxisSizingMode = 'FIXED';
    textContent.counterAxisSizingMode = 'FIXED';
    mainSlide.appendChild(textContent);
    textContent.layoutPositioning = 'ABSOLUTE';
    textContent.x = 0; textContent.y = 0;

    textContent.appendChild(mkLabel(displayName || 'Featured Collection', 42, 'Bold', WHITE));
    textContent.appendChild(mkLabel('Discover our latest arrivals and seasonal picks', 18, 'Regular', GREY80));
    textContent.appendChild(mkPillBtn('Shop Now', false));

    comp.appendChild(mainSlide);

    // Next slide peek (10% = ~144px)
    var peekSlide = mkFrame('Next Slide Peek', 'VERTICAL', {
      gap: 0, fills: [{ type: 'SOLID', color: GREY80 }]
    });
    peekSlide.resize(144, 560);
    peekSlide.primaryAxisSizingMode = 'FIXED';
    peekSlide.counterAxisSizingMode = 'FIXED';
    comp.appendChild(peekSlide);

    // Nav arrows (absolute)
    var leftArrow = mkNavArrow('left');
    comp.appendChild(leftArrow);
    leftArrow.layoutPositioning = 'ABSOLUTE';
    leftArrow.x = 24;
    leftArrow.y = 258;

    var rightArrow = mkNavArrow('right');
    comp.appendChild(rightArrow);
    rightArrow.layoutPositioning = 'ABSOLUTE';
    rightArrow.x = 1248;
    rightArrow.y = 258;

    // Bottom controls (dots + counter, absolute)
    var controls = mkFrame('Controls', 'HORIZONTAL', {
      gap: 16, fills: [], align: 'CENTER'
    });
    controls.appendChild(mkDots(3, 0));
    controls.appendChild(mkLabel('1 / 3', 13, 'Medium', WHITE));
    comp.appendChild(controls);
    controls.layoutPositioning = 'ABSOLUTE';
    controls.x = Math.round(1296 / 2 - 60);
    controls.y = 520;

    return comp;
  }

  // ── Lookbook builder ──
  function buildLookbook(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Lookbook';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 60; comp.paddingBottom = 60;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 40;
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    var header = mkSectionHeader(displayName || 'The Lookbook', { subheading: 'The Lookbook' });
    comp.appendChild(header);
    fillH(header);

    var row = mkFrame('Lookbook Cards', 'HORIZONTAL', { gap: 30 });
    comp.appendChild(row);
    fillH(row);

    var tagNames = ['Linen Blazer', 'Cashmere Knit', 'Silk Dress'];
    var tagPrices = ['\u00A3189.00', '\u00A3145.00', '\u00A3220.00'];

    for (var li = 0; li < 3; li++) {
      var card = mkFrame('Look ' + (li + 1), 'VERTICAL', { gap: 0, radius: 12 });
      card.resize(430, 600);
      card.primaryAxisSizingMode = 'FIXED';
      card.counterAxisSizingMode = 'FIXED';
      card.clipsContent = true;

      // Full-size lookbook image
      var img = mkProductImage(430, 600, null, 0);
      card.appendChild(img);
      img.layoutPositioning = 'ABSOLUTE';
      img.x = 0; img.y = 0;

      // Product tag overlay (bottom, absolute)
      var tag = mkFrame('Product Tag', 'HORIZONTAL', {
        gap: 12, padH: 20, padV: 10, radius: 100,
        fills: [{ type: 'SOLID', color: WHITE }],
        align: 'CENTER'
      });
      tag.appendChild(mkLabel(tagNames[li], 13, 'Medium', BLACK));
      tag.appendChild(mkLabel(tagPrices[li], 13, 'Semi Bold', GREY40));
      card.appendChild(tag);
      tag.layoutPositioning = 'ABSOLUTE';
      tag.x = Math.round(430 / 2 - 90);
      tag.y = 540;

      row.appendChild(card);
    }

    // Navigation arrows row
    var navRow = mkFrame('Navigation', 'HORIZONTAL', { gap: 12, justify: 'CENTER', align: 'CENTER' });
    navRow.appendChild(mkNavArrow('left'));
    navRow.appendChild(mkNavArrow('right'));
    comp.appendChild(navRow);
    fillH(navRow);

    return comp;
  }

  // ── Shop the Feed builder ──
  function buildShopTheFeed(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Shop The Feed';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 60; comp.paddingBottom = 60;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 40;
    // Figma ref: deep blue/purple bg (#2c3cc4), "We're on Gram" heading white centered,
    //   5 portrait images with avatar + username + IG icon at bottom, @handle link below
    var DEEP_BLUE = { r: 0.17, g: 0.24, b: 0.77 };
    comp.fills = [{ type: 'SOLID', color: DEEP_BLUE }];
    comp.counterAxisAlignItems = 'CENTER';

    comp.appendChild(mkLabel('We\u2019re on Gram', 36, 'Bold', WHITE));

    var grid = mkFrame('Feed Grid', 'HORIZONTAL', { gap: 20 });
    comp.appendChild(grid);
    fillH(grid);

    var handles = ['thisisaaccount', 'furniturelover', 'thisisaaccount', 'baddyjam', 'liamwealthy'];

    for (var fi = 0; fi < 5; fi++) {
      var card = mkFrame('Post ' + (fi + 1), 'VERTICAL', { gap: 0, radius: 10 });
      card.resize(250, 320);
      card.primaryAxisSizingMode = 'FIXED';
      card.counterAxisSizingMode = 'FIXED';
      card.clipsContent = true;

      // Full portrait image
      var img = mkProductImage(250, 320, null, 10);
      card.appendChild(img);
      img.layoutPositioning = 'ABSOLUTE';
      img.x = 0; img.y = 0;

      // Bottom bar with avatar + username + IG icon
      var bottomBar = mkFrame('Handle Bar', 'HORIZONTAL', {
        gap: 8, padH: 14, padV: 10,
        fills: [{ type: 'SOLID', color: WHITE }],
        align: 'CENTER', justify: 'SPACE_BETWEEN'
      });
      bottomBar.resize(250, 44);
      bottomBar.primaryAxisSizingMode = 'FIXED';
      bottomBar.counterAxisSizingMode = 'FIXED';
      var handleInfo = mkFrame('Handle', 'HORIZONTAL', { gap: 6, align: 'CENTER' });
      handleInfo.appendChild(mkIconCircle(20, 'Avatar', GREY80));
      handleInfo.appendChild(mkLabel(handles[fi], 11, 'Medium', BLACK));
      bottomBar.appendChild(handleInfo);
      bottomBar.appendChild(mkLabel('IG', 12, 'Semi Bold', GREY40));
      card.appendChild(bottomBar);
      bottomBar.layoutPositioning = 'ABSOLUTE';
      bottomBar.x = 0;
      bottomBar.y = 276;

      grid.appendChild(card);
      try { card.layoutGrow = 1; } catch(_){}
    }

    // Handle link below
    var handleLink = mkLabel('@Garage_store', 14, 'Semi Bold', WHITE);
    try { handleLink.textDecoration = 'UNDERLINE'; } catch(_){}
    comp.appendChild(handleLink);

    return comp;
  }

  // ── Product Bundle builder ──
  function buildProductBundle(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Product Bundle';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 60; comp.paddingBottom = 60;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 40;
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    var header = mkSectionHeader(displayName || 'Bundle & Save');
    comp.appendChild(header);
    fillH(header);

    var content = mkFrame('Bundle Content', 'HORIZONTAL', {
      gap: 40, align: 'MIN'
    });
    comp.appendChild(content);
    fillH(content);

    // Left (55%): 2x2 product grid
    var leftSide = mkFrame('Product Grid', 'VERTICAL', { gap: 16 });
    leftSide.resize(770, 100);
    leftSide.primaryAxisSizingMode = 'AUTO';
    leftSide.counterAxisSizingMode = 'FIXED';

    for (var ri = 0; ri < 2; ri++) {
      var gridRow = mkFrame('Row ' + (ri + 1), 'HORIZONTAL', { gap: 16 });
      for (var ci = 0; ci < 2; ci++) {
        gridRow.appendChild(mkProductCard(330, { ratio: 1.0, showButton: false, showSwatches: false }));
      }
      leftSide.appendChild(gridRow);
    }
    content.appendChild(leftSide);

    // Right (45%): bundle info panel
    var info = mkFrame('Bundle Info', 'VERTICAL', {
      gap: 24, pad: 32, radius: 12,
      fills: [{ type: 'SOLID', color: GREY98 }],
      stroke: 1, strokeColor: GREY90
    });
    info.appendChild(mkLabel('The Essentials Bundle', 24, 'Bold', BLACK));

    info.appendChild(mkLabel('This bundle includes:', 14, 'Semi Bold', GREY40));

    var bundleItems = ['Premium Cotton Tee', 'Relaxed Fit Chinos', 'Canvas Sneakers'];
    for (var bi = 0; bi < 3; bi++) {
      var item = mkFrame('Item ' + (bi + 1), 'HORIZONTAL', { gap: 10, align: 'CENTER' });
      item.appendChild(mkLabel('\u2022', 14, 'Regular', ACCENT));
      item.appendChild(mkLabel(bundleItems[bi], 14, 'Regular', BLACK));
      info.appendChild(item);
    }

    // Pricing
    var priceRow = mkFrame('Pricing', 'HORIZONTAL', { gap: 12, align: 'CENTER' });
    var strikePrice = mkLabel('\u00A3253.00', 18, 'Regular', GREY60);
    try { strikePrice.textDecoration = 'STRIKETHROUGH'; } catch(_){}
    priceRow.appendChild(strikePrice);
    priceRow.appendChild(mkLabel('\u00A3199.00', 28, 'Bold', ACCENT));
    info.appendChild(priceRow);

    info.appendChild(mkPillBtn('Add Bundle', true));

    content.appendChild(info);
    try { info.layoutGrow = 1; } catch(_){}

    return comp;
  }

  // ── Image with Text Overlay builder ──
  function buildImageWithTextOverlay(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Image With Text Overlay';
    comp.resize(1440, 520);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'FIXED';
    comp.counterAxisSizingMode = 'FIXED';
    comp.primaryAxisAlignItems = 'CENTER';
    comp.counterAxisAlignItems = 'CENTER';
    comp.fills = [];
    comp.clipsContent = true;

    // Background product image (full size)
    var bgImg = mkProductImage(1440, 520, null, 0);
    comp.appendChild(bgImg);
    bgImg.layoutPositioning = 'ABSOLUTE';
    bgImg.x = 0; bgImg.y = 0;

    // Dark overlay (0.5 opacity)
    var overlay = mkRect(1440, 520, BLACK, 'Overlay');
    overlay.opacity = 0.5;
    comp.appendChild(overlay);
    overlay.layoutPositioning = 'ABSOLUTE';
    overlay.x = 0; overlay.y = 0;

    // Content frame (centered)
    var content = mkFrame('Content', 'VERTICAL', {
      gap: 20, fills: [], align: 'CENTER', justify: 'CENTER',
      pad: 80
    });
    content.resize(1440, 520);
    content.primaryAxisSizingMode = 'FIXED';
    content.counterAxisSizingMode = 'FIXED';
    comp.appendChild(content);
    content.layoutPositioning = 'ABSOLUTE';
    content.x = 0; content.y = 0;

    content.appendChild(mkLabel('COLLECTION', 12, 'Semi Bold', WHITE));
    content.appendChild(mkLabel(displayName || 'Headline Goes Here', 42, 'Bold', WHITE));
    var body = mkLabel('Explore our curated collection of premium essentials, designed for everyday comfort and timeless style.', 16, 'Regular', WHITE);
    try { body.textAutoResize = 'HEIGHT'; body.resize(600, 40); } catch(_){}
    body.opacity = 0.85;
    content.appendChild(body);

    var btnRow = mkFrame('Buttons', 'HORIZONTAL', { gap: 12 });
    btnRow.appendChild(mkPillBtn('Shop Now', false));
    btnRow.appendChild(mkPillBtn('Learn More', false));
    content.appendChild(btnRow);

    return comp;
  }

  // ── Featured Blog builder ──
  function buildFeaturedBlog(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Featured Blogs';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 60; comp.paddingBottom = 60;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 40;
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    var header = mkSectionHeader(displayName || 'From the Blog', { subheading: 'From the Blog' });
    comp.appendChild(header);
    fillH(header);

    var grid = mkFrame('Blog Grid', 'HORIZONTAL', { gap: 30 });
    comp.appendChild(grid);
    fillH(grid);

    var blogTitles = [
      'How to Style Our Bestselling Tee 5 Ways',
      'Behind the Scenes: Our Sustainable Supply Chain',
      'Summer Essentials: The Only Pieces You Need'
    ];
    var blogExcerpts = [
      'Discover versatile ways to wear our most popular piece from morning meetings to weekend adventures.',
      'Take a look at how we source our materials and work with ethical manufacturers around the world.',
      'Our style team picks the key items that will take you through the warmest months in effortless comfort.'
    ];

    for (var bi = 0; bi < 3; bi++) {
      var card = mkFrame('Post ' + (bi + 1), 'VERTICAL', {
        gap: 14, radius: 12,
        stroke: 1, strokeColor: GREY90
      });
      card.clipsContent = true;

      // Blog image
      card.appendChild(mkProductImage(440, 280, null, 12));

      // Text content with padding
      var textWrap = mkFrame('Text', 'VERTICAL', { gap: 8, padH: 16, padV: 4 });
      textWrap.appendChild(mkLabel('Mar 15, 2026', 12, 'Regular', GREY60));
      textWrap.appendChild(mkLabel(blogTitles[bi], 18, 'Bold', BLACK));
      var excerpt = mkLabel(blogExcerpts[bi], 14, 'Regular', GREY40);
      try { excerpt.textAutoResize = 'HEIGHT'; excerpt.resize(400, 40); } catch(_){}
      textWrap.appendChild(excerpt);
      textWrap.appendChild(mkLabel('Read More \u2192', 14, 'Medium', BLACK));
      card.appendChild(textWrap);
      fillH(textWrap);

      grid.appendChild(card);
      try { card.layoutGrow = 1; } catch(_){}
    }

    return comp;
  }

  // ── Collection Banner builder ──
  function buildCollectionBanner(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Collection Banner';
    comp.resize(1440, 360);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'FIXED';
    comp.counterAxisSizingMode = 'FIXED';
    comp.primaryAxisAlignItems = 'CENTER';
    comp.counterAxisAlignItems = 'CENTER';
    comp.fills = [];
    comp.clipsContent = true;

    // Background product image
    var bgImg = mkProductImage(1440, 360, null, 0);
    comp.appendChild(bgImg);
    bgImg.layoutPositioning = 'ABSOLUTE';
    bgImg.x = 0; bgImg.y = 0;

    // Dark overlay (0.3 opacity)
    var overlay = mkRect(1440, 360, BLACK, 'Overlay');
    overlay.opacity = 0.3;
    comp.appendChild(overlay);
    overlay.layoutPositioning = 'ABSOLUTE';
    overlay.x = 0; overlay.y = 0;

    // Centered content
    var content = mkFrame('Content', 'VERTICAL', {
      gap: 16, fills: [], align: 'CENTER', justify: 'CENTER',
      pad: 60
    });
    content.resize(1440, 360);
    content.primaryAxisSizingMode = 'FIXED';
    content.counterAxisSizingMode = 'FIXED';
    comp.appendChild(content);
    content.layoutPositioning = 'ABSOLUTE';
    content.x = 0; content.y = 0;

    content.appendChild(mkLabel(displayName || 'Shop Collection', 40, 'Bold', WHITE));
    content.appendChild(mkLabel('24 Products', 16, 'Regular', WHITE));
    content.appendChild(mkPillBtn('Shop Collection', false));

    return comp;
  }

  // ── Scrolling Gallery builder ──
  function buildScrollingGallery(displayName) {
    var comp = figma.createComponent();
    comp.name = displayName || 'Scrolling Gallery';
    comp.resize(1440, 100);
    comp.layoutMode = 'VERTICAL';
    comp.primaryAxisSizingMode = 'AUTO';
    comp.counterAxisSizingMode = 'FIXED';
    comp.paddingTop = 60; comp.paddingBottom = 60;
    comp.paddingLeft = 50; comp.paddingRight = 50;
    comp.itemSpacing = 32;
    comp.fills = [{ type: 'SOLID', color: WHITE }];

    var header = mkSectionHeader(displayName || 'Gallery', { subheading: 'EXPLORE' });
    comp.appendChild(header);
    fillH(header);

    // Horizontal image row (extends beyond 1440 for overflow feel)
    var gallery = mkFrame('Gallery Row', 'HORIZONTAL', { gap: 8 });
    gallery.resize(1920, 360);
    gallery.primaryAxisSizingMode = 'FIXED';
    gallery.counterAxisSizingMode = 'FIXED';
    gallery.clipsContent = true;

    for (var gi = 0; gi < 5; gi++) {
      gallery.appendChild(mkProductImage(360, 360, null, 8));
    }

    comp.appendChild(gallery);

    return comp;
  }

  // ── Section builder dispatcher ──
  // Exact matches first
  var sectionBuilders = {
    'header': buildHeader,
    'header-announcements': buildAnnouncementBar,
    'announcement-bar': buildAnnouncementBar,
    'hero': buildHero,
    'image-hero': buildHero,
    'product-list': buildProductList,
    'product-recommendations': buildProductList,
    'featured-product': buildProductList,
    'featured-collection': buildProductList,
    'product-grid': buildProductList,
    'media-with-content': buildMediaWithContent,
    'image-with-text': buildMediaWithContent,
    'media-with-text': buildMediaWithContent,
    'footer': buildFooter,
    'slideshow': buildSlideshow,
    'image-slideshow': buildSlideshow,
    'carousel': buildSlideshow,
    'marquee': buildMarquee,
    'scrolling-text': buildMarquee,
    'ticker': buildMarquee,
    'collection-list': buildCollectionList,
    'collection-links': buildCollectionList,
    'collections-grid': buildCollectionList,
    'divider': buildDivider,
    'separator': buildDivider,
    'newsletter': buildNewsletter,
    'email-signup': buildNewsletter,
    'brand-logos': buildLogoList,
    'logo-list': buildLogoList,
    'press': buildLogoList,
    'testimonials': buildTestimonials,
    'reviews': buildTestimonials,
    'video': buildVideo,
    'video-hero': buildVideo,
    'rich-text': buildRichText,
    'custom-liquid': buildRichText,
    'multi-column': buildMultiColumn,
    'multicolumn': buildMultiColumn,
    'icons-with-text': buildMultiColumn,
    'text-columns-with-images': buildMultiColumn,
    'collapsible-content': buildFAQ,
    'faq': buildFAQ,
    'contact-form': buildContactForm,
    'map': buildMap,
    'store-locator': buildMap,
    // Hyper theme section slugs
    'banner-with-categories': buildBanner,
    'banner-with-hotspots': buildBanner,
    'banner-with-tabs': buildTabs,
    'before-after-image-slider': buildBeforeAfter,
    'button-group': buildMultiColumn,
    'collapsible-tabs': buildFAQ,
    'collection-cards': buildCollectionList,
    'collection-list-banner': buildCollectionBanner,
    'collection-list-slider': buildCollectionList,
    'collection-tabs': buildTabs,
    'comparison-table': buildComparisonTable,
    'countdown-timer': buildCountdown,
    'custom-content': buildMultiColumn,
    'favorite-products': buildProductList,
    'featured-blogs': buildFeaturedBlog,
    'featured-countdown-timer': buildCountdown,
    'featured-products-tab': buildTabs,
    'grid-banner': buildImageGrid,
    'highlight-text-with-image': buildMediaWithContent,
    'horizontal-products-list': buildHorizontalProductList,
    'image-cards': buildImageGrid,
    'image-with-feature': buildMediaWithContent,
    'image-with-text-overlay': buildImageWithTextOverlay,
    'image-with-text-slider': buildSlideshow,
    'layered-images-with-text': buildMediaWithContent,
    'lookbook-slider': buildLookbook,
    'multicolumn-with-icon': buildMultiColumn,
    'multiple-product-bundles': buildProductBundle,
    'products-bundle': buildProductBundle,
    'products-bundle-selection': buildProductBundle,
    'promotion-banner': buildBanner,
    'recently-viewed-products': buildProductList,
    'shop-the-feed': buildShopTheFeed,
    'scrolling-banner': buildScrollingBanner,
    'scrolling-gallery-images': buildScrollingGallery,
    'scrolling-promotion': buildMarquee,
    'slideshow-with-product': buildSlideshow,
    'tabs-content': buildTabs,
    'testimonials-masonry': buildTestimonials,
    'apps': buildRichText,
  };

  // Fuzzy keyword matching for section names not in the exact map
  function guessBuilder(sectionName) {
    var n = sectionName.toLowerCase();
    // Multi-word matches first (more specific)
    if (n.indexOf('horizontal') !== -1 && n.indexOf('product') !== -1) return buildHorizontalProductList;
    if (n.indexOf('scrolling') !== -1 && n.indexOf('gallery') !== -1) return buildScrollingGallery;
    // Specific section types
    if (n.indexOf('countdown') !== -1) return buildCountdown;
    if (n.indexOf('bundle') !== -1) return buildProductBundle;
    if (n.indexOf('blog') !== -1 || n.indexOf('article') !== -1 || n.indexOf('post') !== -1) return buildFeaturedBlog;
    if (n.indexOf('lookbook') !== -1) return buildLookbook;
    if (n.indexOf('feed') !== -1 || n.indexOf('ugc') !== -1 || n.indexOf('instagram') !== -1 || n.indexOf('tiktok') !== -1) return buildShopTheFeed;
    if (n.indexOf('compare') !== -1 || n.indexOf('comparison') !== -1 || n.indexOf('versus') !== -1) return buildComparisonTable;
    if (n.indexOf('before') !== -1 || n.indexOf('after') !== -1) return buildBeforeAfter;
    if (n.indexOf('overlay') !== -1) return buildImageWithTextOverlay;
    // Original matchers
    if (n.indexOf('banner') !== -1 || n.indexOf('promo') !== -1) return buildBanner;
    if (n.indexOf('hero') !== -1 || n.indexOf('cover') !== -1) return buildHero;
    if (n.indexOf('header') !== -1 && n.indexOf('announ') === -1) return buildHeader;
    if (n.indexOf('announcement') !== -1 || n.indexOf('topbar') !== -1) return buildAnnouncementBar;
    if (n.indexOf('footer') !== -1) return buildFooter;
    if (n.indexOf('product') !== -1 || n.indexOf('featured') !== -1 || n.indexOf('recommend') !== -1) return buildProductList;
    if (n.indexOf('collection') !== -1 || n.indexOf('categor') !== -1) return buildCollectionList;
    if (n.indexOf('slide') !== -1 || n.indexOf('carousel') !== -1 || n.indexOf('swiper') !== -1) return buildSlideshow;
    if (n.indexOf('marquee') !== -1 || n.indexOf('scroll') !== -1 || n.indexOf('ticker') !== -1) return buildMarquee;
    if (n.indexOf('testimon') !== -1 || n.indexOf('review') !== -1 || n.indexOf('quote') !== -1) return buildTestimonials;
    if (n.indexOf('newsletter') !== -1 || n.indexOf('email') !== -1 || n.indexOf('signup') !== -1 || n.indexOf('subscribe') !== -1) return buildNewsletter;
    if (n.indexOf('logo') !== -1 || n.indexOf('brand') !== -1 || n.indexOf('press') !== -1 || n.indexOf('partner') !== -1) return buildLogoList;
    if (n.indexOf('video') !== -1) return buildVideo;
    if (n.indexOf('rich-text') !== -1 || n.indexOf('text-block') !== -1) return buildRichText;
    if (n.indexOf('column') !== -1 || n.indexOf('icon') !== -1 || n.indexOf('feature') !== -1) return buildMultiColumn;
    if (n.indexOf('collaps') !== -1 || n.indexOf('faq') !== -1 || n.indexOf('accordion') !== -1) return buildFAQ;
    if (n.indexOf('contact') !== -1 || n.indexOf('form') !== -1) return buildContactForm;
    if (n.indexOf('map') !== -1 || n.indexOf('location') !== -1 || n.indexOf('store-locator') !== -1) return buildMap;
    if (n.indexOf('tab') !== -1) return buildTabs;
    if (n.indexOf('image') !== -1 || n.indexOf('gallery') !== -1 || n.indexOf('grid') !== -1 || n.indexOf('mosaic') !== -1) return buildImageGrid;
    if (n.indexOf('divider') !== -1 || n.indexOf('separator') !== -1 || n.indexOf('spacer') !== -1) return buildDivider;
    if (n.indexOf('media') !== -1) return buildMediaWithContent;
    return null;
  }

  for (var sIdx = 0; sIdx < sections.length; sIdx++) {
    var sec = sections[sIdx];
    var pct = 55 + Math.round((sIdx / sections.length) * 40);
    sendProgress(pct, 'Scaffolding: ' + sec.name + '…');

    var prettyName = sec.name.replace(/-/g, ' ').replace(/\b\w/g, function(c) { return c.toUpperCase(); });

    var comp;
    var builder = sectionBuilders[sec.name];
    if (!builder) builder = guessBuilder(sec.name);
    if (builder) {
      comp = builder(prettyName);
    } else {
      comp = buildGenericSection(sec);
    }

    // Place on the library page
    libPage.appendChild(comp);
    comp.x = 0;
    comp.y = yOffset;
    yOffset += comp.height + 40;
    sectionsCreated++;
  }

  sendProgress(100, 'Done!');

  figma.ui.postMessage({
    type: 'theme-import-done',
    themeName: themeName,
    variablesCreated: variablesCreated,
    colorSchemes: Object.keys(colorSchemes).length,
    sectionsCreated: sectionsCreated,
    typographyTokens: typTokens
  });
}

// ─── Message handler ──────────────────────────────────────────────────────────

figma.ui.onmessage = async msg => {
  switch (msg.type) {

    case 'get-storage': {
      const value = await getStorage(msg.key);
      figma.ui.postMessage({ type: 'storage-value', key: msg.key, value });
      break;
    }
    case 'set-storage':
      await setStorage(msg.key, msg.value);
      break;
    case 'del-storage':
      await delStorage(msg.key);
      break;

    case 'get-selection':
      figma.ui.postMessage({ type: 'selection-info', data: getSelectionInfo() });
      break;

    // Serialise the currently selected node and return JSON + thumbnail
    case 'serialise-selection': {
      const sel = figma.currentPage.selection;
      if (!sel.length) {
        figma.ui.postMessage({ type: 'serialise-error', message: 'Select a frame or component first.' });
        break;
      }
      figma.ui.postMessage({ type: 'serialise-progress', message: 'Serialising node tree…' });
      try {
        const data = await serialiseNode(sel[0]);

        // Export thumbnails — one per variant for COMPONENT_SETs, single for everything else
        var thumbB64 = null;
        var variantThumbs = null;
        try {
          if (sel[0].type === 'COMPONENT_SET' && sel[0].children && sel[0].children.length > 0) {
            variantThumbs = [];
            for (var vi = 0; vi < sel[0].children.length; vi++) {
              try {
                var vBytes = await sel[0].children[vi].exportAsync({ format: 'PNG', constraint: { type: 'WIDTH', value: 600 } });
                variantThumbs.push(uint8ToBase64(vBytes));
              } catch (_vt) {
                variantThumbs.push(null);
              }
            }
            thumbB64 = variantThumbs[0];
            console.log('[Kubix] Variant thumbnails exported:', variantThumbs.length, 'variants');
          } else {
            var bytes = await sel[0].exportAsync({ format: 'PNG', constraint: { type: 'WIDTH', value: 600 } });
            thumbB64 = uint8ToBase64(bytes);
            console.log('[Kubix] Thumbnail exported:', thumbB64.length, 'chars');
          }
        } catch (te) {
          console.warn('[Kubix] Thumbnail export failed (non-fatal):', te);
        }

        figma.ui.postMessage({ type: 'serialised', data: data, thumbnail: thumbB64, variantThumbnails: variantThumbs });
      } catch (e) {
        figma.ui.postMessage({ type: 'serialise-error', message: String(e) });
      }
      break;
    }

    // Export a PNG thumbnail of the selected node
    case 'export-thumbnail': {
      const sel = figma.currentPage.selection;
      console.log('[Kubix] export-thumbnail: selection count =', sel.length);
      if (!sel.length) {
        figma.ui.postMessage({ type: 'thumbnail-error', message: 'Nothing selected.' });
        break;
      }
      console.log('[Kubix] export-thumbnail: node type =', sel[0].type, 'name =', sel[0].name);
      try {
        const bytes  = await sel[0].exportAsync({
          format:     'PNG',
          constraint: { type: 'WIDTH', value: 600 },
        });
        console.log('[Kubix] export-thumbnail: success, bytes =', bytes.length);
        const b64 = uint8ToBase64(bytes);
        console.log('[Kubix] export-thumbnail: base64 length =', b64.length);
        figma.ui.postMessage({ type: 'thumbnail-data', data: b64 });
      } catch (e) {
        console.error('[Kubix] export-thumbnail: FAILED', e);
        figma.ui.postMessage({ type: 'thumbnail-error', message: String(e) });
      }
      break;
    }

    // Reconstruct a component from JSON and insert it into the file
    case 'reconstruct-and-insert': {
      try {
        await insertComponent(msg.componentData);
      } catch (e) {
        console.error('[Kubix] Insert error:', e);
        figma.ui.postMessage({ type: 'insert-error', message: String(e) });
      }
      break;
    }

    case 'open-url':
      figma.openExternal(msg.url);
      break;

    case 'close':
      figma.closePlugin();
      break;

    // ── Theme Import ──
    case 'import-theme': {
      try {
        await handleThemeImport(msg.data);
      } catch (e) {
        console.error('[Kubix] Theme import error:', e);
        figma.ui.postMessage({ type: 'theme-import-error', message: String(e) });
      }
      break;
    }
  }
};

// Relay selection changes to UI so the Publish tab stays in sync
figma.on('selectionchange', () => {
  figma.ui.postMessage({ type: 'selection-info', data: getSelectionInfo() });
});

// ─── Init — send all storage values + context to UI ──────────────────────────

(async () => {
  const keys   = ['githubToken', 'repoOwner', 'repoName', 'manifestCache'];
  const stored = {};
  for (const k of keys) stored[k] = await getStorage(k);

  figma.ui.postMessage({
    type:          'init',
    data:          stored,
    fileKey:       figma.fileKey || '',
    selectionInfo: getSelectionInfo(),
  });
})();
