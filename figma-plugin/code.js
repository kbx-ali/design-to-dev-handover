// Design → Dev Handover — Figma Plugin
// Runs in Figma's privileged sandbox. Communicates with ui.html via postMessage.

figma.showUI(__html__, {
  width:  380,
  height: 620,
  title:  'Design → Dev Handover'
});

function buildPageData() {
  const page     = figma.currentPage;
  const fileKey  = figma.fileKey || '';
  const pageName = page.name;

  // Build every top-level frame with its own resolved sections list.
  // If a frame has child frames/groups those children become sections;
  // otherwise the frame itself is the single section.
  const topFrames = page.children
    .filter(n => n.type === 'FRAME' && n.visible !== false)
    .map(n => {
      const childFrames = (n.children || [])
        .filter(c => (c.type === 'FRAME' || c.type === 'COMPONENT' || c.type === 'GROUP') && c.visible !== false);

      const toSection = node => ({
        id:        node.id,
        name:      node.name,
        figmaLink: fileKey
          ? `https://www.figma.com/design/${fileKey}/${encodeURIComponent(pageName)}?node-id=${node.id.replace(':', '-')}`
          : ''
      });

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
