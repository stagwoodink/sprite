Auto-Update Strategy: Electron & GitHub Releases

A comprehensive, zero-cost plan to enable background auto-updating for your unsigned Electron desktop application using electron-updater and GitHub Releases.

1. Overview & Constraints

Provider: GitHub Releases (Public repository).

Cost: $0 / year (No private update server or paid certificates required).

Privacy: Checks standard GitHub API for tag releases without collecting telemetry or user data.

Unsigned Executables Note: On Windows and macOS, updates will download natively. However, Windows SmartScreen or macOS Gatekeeper may prompt the user during installation if executables are unsigned.

2. Dependencies & Project Setup

Install electron-updater in your project root:

npm install electron-updater


3. Preload & Main Process Implementation

A. Main Process (electron/main.js)

Integrate autoUpdater to handle lifecycle events and communicate update status to the renderer UI via IPC.

const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const { autoUpdater } = require('electron-updater');
const path = require('path');

// Configure autoUpdater settings
autoUpdater.autoDownload = false; // Give user choice before downloading
autoUpdater.autoInstallOnAppQuit = true;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  win.loadFile(path.join(__dirname, '../dist/index.html'));

  // Trigger update check after window is ready
  win.once('ready-to-show', () => {
    if (!app.isPackaged) return; // Skip update checks during local dev
    autoUpdater.checkForUpdates();
  });

  // AutoUpdater Event Listeners
  autoUpdater.on('update-available', (info) => {
    win.webContents.send('update:available', info);
  });

  autoUpdater.on('download-progress', (progress) => {
    win.webContents.send('update:progress', progress);
  });

  autoUpdater.on('update-downloaded', (info) => {
    win.webContents.send('update:downloaded', info);
  });

  autoUpdater.on('error', (err) => {
    console.error('Update error:', err);
  });
}

// IPC Handlers for UI Controls
ipcMain.handle('update:startDownload', () => {
  autoUpdater.downloadUpdate();
});

ipcMain.handle('update:quitAndInstall', () => {
  autoUpdater.quitAndInstall();
});

app.whenReady().then(createWindow);


B. Preload Script (electron/preload.js)

Expose the update API through your existing contextBridge.

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Existing I/O APIs...
  saveFile: (data) => ipcRenderer.invoke('dialog:saveFile', data),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),

  // Auto-updater Listeners & Commands
  onUpdateAvailable: (callback) => ipcRenderer.on('update:available', (_e, info) => callback(info)),
  onUpdateProgress: (callback) => ipcRenderer.on('update:progress', (_e, progress) => callback(progress)),
  onUpdateDownloaded: (callback) => ipcRenderer.on('update:downloaded', (_e, info) => callback(info)),
  downloadUpdate: () => ipcRenderer.invoke('update:startDownload'),
  quitAndInstall: () => ipcRenderer.invoke('update:quitAndInstall'),
});


4. Front-End UI Integration

Add a unobtrusive update banner or notification inside your editor's UI:

// src/ui/update-notifier.js
if (window.electronAPI) {
  window.electronAPI.onUpdateAvailable((info) => {
    const notify = confirm(`Version ${info.version} is available! Would you like to download it now?`);
    if (notify) {
      window.electronAPI.downloadUpdate();
    }
  });

  window.electronAPI.onUpdateProgress((progress) => {
    console.log(`Download speed: ${progress.bytesPerSecond} - Downloaded ${progress.percent}%`);
  });

  window.electronAPI.onUpdateDownloaded(() => {
    const installNow = confirm('Update downloaded. Restart the application now to apply the update?');
    if (installNow) {
      window.electronAPI.quitAndInstall();
    }
  });
}


5. Builder Configuration (package.json)

Configure electron-builder to publish the required release metadata (latest.yml / latest-mac.yml) alongside your binaries to GitHub Releases:

{
  "name": "pixel-editor",
  "version": "1.0.0",
  "main": "electron/main.js",
  "build": {
    "appId": "com.indie.pixeleditor",
    "productName": "PixelEditor",
    "publish": [
      {
        "provider": "github",
        "owner": "YOUR_GITHUB_USERNAME",
        "repo": "YOUR_REPO_NAME",
        "releaseType": "release"
      }
    ],
    "win": {
      "target": ["nsis"]
    },
    "mac": {
      "target": ["dmg", "zip"]
    },
    "linux": {
      "target": ["AppImage"]
    }
  }
}


6. GitHub Actions Release Workflow

When you push a new git tag (e.g., git tag v1.0.1 && git push origin v1.0.1), this action packages and attaches the executables along with the update metadata to GitHub Releases:

name: Release & Publish Updates

on:
  push:
    tags:
      - 'v*'

jobs:
  publish:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Install Dependencies
        run: npm ci

      - name: Build Web Bundle
        run: npm run build:web

      - name: Build and Publish Electron Assets
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx electron-builder --publish always


## Staged plan for this repo

Entirely downstream of `todo/pwa-electron-pivot.md`'s staged plan — `electron-updater` has nothing to update against until Electron builds actually exist.

**Done now:**
- Confirmed `src/version.js`'s `VERSION` (`0.1.0`) is already a plain semver string, no format change needed to later tag releases as `v${VERSION}`.
- Repo/tag convention for when Electron builds start: `git tag v${VERSION}` on release, matching what `electron-builder`/`electron-updater` expect from `latest.yml`.
- Landing spot for the eventual update-check UI, once it exists: same `window.electronAPI` presence check `pwa-electron-pivot.md`'s Electron adapter work establishes — a no-op on web/PWA, active only inside the packaged app.

**Deferred until Electron builds are actually being produced:**
- Adding the `electron-updater` dependency.
- Wiring `autoUpdater` in the (not-yet-existing) Electron main process.
- `.github/workflows/release.yml`.

Nothing here can be meaningfully stubbed before the Electron adapter exists — placeholder updater code today would be exactly the "scaffolding for later" this project avoids.
