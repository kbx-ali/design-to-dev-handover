// Preload runs in a privileged context before the page loads.
// Keep this minimal — just expose what the renderer genuinely needs.
const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('electronApp', {
  platform: process.platform,
  version: process.env.npm_package_version || '1.0.0',
});
