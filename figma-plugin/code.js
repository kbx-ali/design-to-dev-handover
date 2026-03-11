// Design → Dev Handover — Figma Plugin
// Runs in Figma's privileged sandbox. Communicates with ui.html via postMessage.

figma.showUI(__html__, {
  width:  380,
  height: 620,
  title:  'Design → Dev Handover'
});

// Prefix that marks a frame as an explicit section, regardless of nesting depth.
const SECTION_PREFIX = '//';

// Recursively search all descendants of `node` for frames/components/groups
// whose name starts with SECTION_PREFIX. Returns them as section objects,
// with the prefix stripped from the display name.
function findPrefixedSections(node, fileKey, pageName) {
  const results = [];
  for (const child of (node.children || [])) {
    if (child.visible === false) continue;
    const isContainer = child.type === 'FRAME' || child.type === 'COMPONENT' || child.type === 'GROUP';
    if (!isContainer) continue;

    if (child.name.startsWith(SECTION_PREFIX)) {
      results.push({
        id:        child.id,
        name:      child.name.slice(SECTION_PREFIX.length).trim(),
        figmaLink: fileKey
          ? `https://www.figma.com/design/${fileKey}/${encodeURIComponent(pageName)}?node-id=${child.id.replace(':', '-')}`
          : ''
      });
    }
    // Always recurse — a // frame may itself contain further // frames
    results.push(...findPrefixedSections(child, fileKey, pageName));
  }
  return results;
}

function buildPageData() {
  const page     = figma.currentPage;
  const fileKey  = figma.fileKey || '';
  const pageName = page.name;

  const toSection = node => ({
    id:        node.id,
    name:      node.name.startsWith(SECTION_PREFIX) ? node.name.slice(SECTION_PREFIX.length).trim() : node.name,
    figmaLink: fileKey
      ? `https://www.figma.com/design/${fileKey}/${encodeURIComponent(pageName)}?node-id=${node.id.replace(':', '-')}`
      : ''
  });

  const topFrames = page.children
    .filter(n => n.type === 'FRAME' && n.visible !== false)
    .map(n => {
      // 1. Look for explicitly prefixed sections anywhere in the subtree
      const prefixed = findPrefixedSections(n, fileKey, pageName);
      if (prefixed.length > 0) {
        return { id: n.id, name: n.name, childCount: prefixed.length, sections: prefixed };
      }

      // 2. Fallback: direct children (original behaviour, no prefix used)
      const childFrames = (n.children || [])
        .filter(c => (c.type === 'FRAME' || c.type === 'COMPONENT' || c.type === 'GROUP') && c.visible !== false);

      return {
        id:         n.id,
        name:       n.name,
        childCount: childFrames.length,
        sections:   childFrames.length > 0 ? childFrames.map(toSection) : [toSection(n)]
      };
    });

  return {
    pageName,
    fileKey,
    figmaFileUrl: fileKey
      ? `https://www.figma.com/design/${fileKey}/${encodeURIComponent(pageName)}`
      : '',
    topFrames
  };
}

// Send initial page data to UI
figma.ui.postMessage({ type: 'page-data', data: buildPageData() });

// Handle messages from UI
figma.ui.onmessage = async msg => {
  switch (msg.type) {

    case 'open-url':
      figma.openExternal(msg.url);
      break;

    case 'close':
      figma.closePlugin();
      break;

    case 'refresh':
      figma.ui.postMessage({ type: 'page-data', data: buildPageData() });
      break;

    case 'get-storage': {
      const value = await figma.clientStorage.getAsync(msg.key);
      figma.ui.postMessage({ type: 'storage-value', key: msg.key, value });
      break;
    }

    case 'set-storage':
      await figma.clientStorage.setAsync(msg.key, msg.value);
      break;
  }
};
