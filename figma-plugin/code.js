// Design → Dev Handover — Figma Plugin
// Runs in Figma's privileged sandbox. Communicates with ui.html via postMessage.

figma.showUI(__html__, {
  width:  380,
  height: 580,
  title:  'Design → Dev Handover'
});

function buildPageData() {
  const page     = figma.currentPage;
  const fileKey  = figma.fileKey || '';
  const pageName = page.name;

  // Top-level frames on this page
  const topFrames = page.children.filter(n => n.type === 'FRAME' && n.visible !== false);

  // If there is exactly 1 top-level frame (common pattern: one "Homepage" wrapper
  // containing all section frames as children), drill into its children instead.
  // Fall back to the wrapper itself only if it has no child frames.
  let sourceNodes = topFrames;
  if (topFrames.length === 1) {
    const childFrames = (topFrames[0].children || [])
      .filter(n => (n.type === 'FRAME' || n.type === 'COMPONENT' || n.type === 'GROUP') && n.visible !== false);
    if (childFrames.length > 0) sourceNodes = childFrames;
  }

  const frames = sourceNodes.map(n => {
    const nodeId = n.id.replace(':', '-');
    return {
      id:        n.id,
      name:      n.name,
      figmaLink: fileKey
        ? `https://www.figma.com/design/${fileKey}/${encodeURIComponent(pageName)}?node-id=${nodeId}`
        : ''
    };
  });

  return {
    pageName,
    fileKey,
    figmaFileUrl: fileKey
      ? `https://www.figma.com/design/${fileKey}/${encodeURIComponent(pageName)}`
      : '',
    frames
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
