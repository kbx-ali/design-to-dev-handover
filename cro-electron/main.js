const { app, BrowserWindow, shell, Menu, ipcMain } = require('electron');
const path = require('path');

const APP_URL = 'https://kubix-cro.netlify.app/';
const SPLASH_MIN_MS = 1800; // minimum splash display time

// ─── Single instance lock ────────────────────────────────────────────────────
const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
}

let mainWindow = null;
let splashWindow = null;

// ─── Splash window ───────────────────────────────────────────────────────────
function createSplash() {
  splashWindow = new BrowserWindow({
    width: 600,
    height: 400,
    frame: false,
    transparent: true,
    resizable: false,
    center: true,
    alwaysOnTop: true,
    webPreferences: { nodeIntegration: false, contextIsolation: true },
  });
  splashWindow.loadFile(path.join(__dirname, 'splash.html'));
  splashWindow.on('closed', () => { splashWindow = null; });
}

// ─── Main window ─────────────────────────────────────────────────────────────
function createMain() {
  mainWindow = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    show: false,
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 12, y: 9 },
    backgroundColor: '#141414',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  // Track when app has loaded and minimum splash time
  let appLoaded = false;
  let splashTimeDone = false;

  const tryShowMain = () => {
    if (appLoaded && splashTimeDone) {
      if (splashWindow && !splashWindow.isDestroyed()) splashWindow.close();
      mainWindow.show();
      mainWindow.focus();
    }
  };

  setTimeout(() => {
    splashTimeDone = true;
    tryShowMain();
  }, SPLASH_MIN_MS);

  mainWindow.webContents.on('did-finish-load', () => {
    appLoaded = true;
    tryShowMain();
    // Inject matte black title bar (Electron only — invisible on Netlify)
    mainWindow.webContents.insertCSS(`
      body::before {
        content: '';
        position: fixed;
        top: 0; left: 0; right: 0;
        height: 30px;
        background: #1C1C1C;
        -webkit-app-region: drag;
        z-index: 2147483647;
        pointer-events: auto;
      }
      .nav-bar { padding-top: 46px !important; }
    `);
  });

  // If loading fails (offline etc.) still show the window
  mainWindow.webContents.on('did-fail-load', () => {
    appLoaded = true;
    tryShowMain();
  });

  mainWindow.loadURL(APP_URL);

  // Allow Google OAuth popups; send everything else to system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const isGoogleAuth = url.includes('accounts.google.com') ||
                         url.includes('firebaseapp.com/__/auth') ||
                         url.includes('firebase.google.com');
    if (isGoogleAuth) {
      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 500,
          height: 640,
          center: true,
          autoHideMenuBar: true,
          webPreferences: {
            nodeIntegration: false,
            contextIsolation: false, // must be false so preload can override navigator.credentials
            preload: path.join(__dirname, 'auth-preload.js'),
          },
        },
      };
    }
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ─── App menu ─────────────────────────────────────────────────────────────────
function buildMenu() {
  const template = [
    {
      label: 'Kubix CRO',
      submenu: [
        { label: 'About Kubix CRO', role: 'about' },
        { type: 'separator' },
        { label: 'Hide Kubix CRO', role: 'hide' },
        { label: 'Hide Others', role: 'hideOthers' },
        { label: 'Show All', role: 'unhide' },
        { type: 'separator' },
        { label: 'Quit Kubix CRO', role: 'quit' },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' },
        { role: 'selectAll' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        { type: 'separator' },
        { role: 'front' },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ─── Lifecycle ────────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  buildMenu();
  createSplash();
  createMain();
});

app.on('second-instance', () => {
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (!mainWindow) createMain();
});
