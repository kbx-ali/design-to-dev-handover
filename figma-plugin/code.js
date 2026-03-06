// Design → Dev Handover — Figma Plugin
// Runs in Figma's privileged sandbox. Communicates with ui.html via postMessage.

figma.showUI(__html__, {
  width:  380,
  height: 580,
  title:  'Design → Dev Handover'
});

function buildPageData() {
  const page    = figma.currentPage;
  const fileKey = figma.fileKey || '';
  const pageName = page.name;

  const frames = page.children
    .filter(n => n.type === 'FRAME' && n.visible !== false)
    .map(n => {
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
