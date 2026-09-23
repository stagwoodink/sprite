Distribution & Polish Roadmap: PWA & Electron PortA pragmatic guide for taking an existing, functional web-based pixel editor and packaging it for PWA and Electron distribution with zero telemetry, zero runtime costs, and total offline capability.1. Architecture Refactoring for Platform AdaptersSince the core editor logic and UI are already built, retrofitting desktop and PWA capabilities requires wrapping platform-specific calls (File System, Dialogs) behind an Adapter Interface.                           +------------------------+
                           |  Existing Web App UI   |
                           |  (Canvas, Tools, DOM)  |
                           +-----------+------------+
                                       |
                                       v
                           +------------------------+
                           | Platform Adapter Bus   |
                           +----+--------------+----+
                                |              |
            +-------------------+              +-------------------+
            |                                                      |
            v                                                      v
+-----------------------+                              +-----------------------+
|  PWA / Web Adapter    |                              |   Electron Adapter    |
|  - File System API    |                              |   - Native IPC Bridge |
|  - Service Worker     |                              |   - Local File I/O    |
+-----------------------+                              +-----------------------+
File System Adapter PatternInstead of calling raw browser file pickers directly in your canvas code, direct operations through an abstraction layer:// src/platform/adapter.js
export class StorageAdapter {
  async saveImage(blob, suggestedName) {
    // Overridden by platform implementations
  }
  async openImage() {
    // Overridden by platform implementations
  }
}

// Web / PWA Implementation
export class WebStorageAdapter extends StorageAdapter {
  async saveImage(blob, suggestedName) {
    if ('showSaveFilePicker' in window) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName,
          types: [{ description: 'PNG Image', accept: { 'image/png': ['.png'] } }],
        });
        const writable = await handle.createWritable();
        await writable.write(blob);
        await writable.close();
        return;
      } catch (err) {
        if (err.name === 'AbortError') return;
      }
    }
    // Fallback download anchor
    const a = document.createElement('a');
    a.download = suggestedName;
    a.href = URL.createObjectURL(blob);
    a.click();
    URL.revokeObjectURL(a.href);
  }
}

// Electron Implementation
export class ElectronStorageAdapter extends StorageAdapter {
  async saveImage(blob, suggestedName) {
    const arrayBuffer = await blob.arrayBuffer();
    await window.electronAPI.saveFile({ buffer: arrayBuffer, filename: suggestedName });
  }
}
2. PWA Polish (Offline Web & Installability)To make your hosted web version work 100% offline and install as a standalone desktop app on Chrome/Edge/Safari, add two static files to your web root.A. Web App Manifest (manifest.json){
  "name": "Pixel Editor",
  "short_name": "PixelEdit",
  "start_url": "./index.html",
  "display": "standalone",
  "background_color": "#1e1e1e",
  "theme_color": "#1e1e1e",
  "icons": [
    {
      "src": "icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
B. Air-Gapped Service Worker (service-worker.js)Pre-caches static assets on first load so the app opens instantly without network access:const CACHE_NAME = 'pixel-editor-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './style.css',
  './app.js',
  './manifest.json'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      return cachedResponse || fetch(event.request);
    })
  );
});
C. Register Service Worker in index.htmlif ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js');
  });
}
3. Electron Integration (Native Desktop Container)Add Electron to your existing project structure without rewriting your UI code.A. Project Structurepixel-editor/
├── build/                   # App icons for Windows (.ico), Mac (.icns), Linux (.png)
├── electron/
│   ├── main.js             # Main process entrypoint
│   └── preload.js          # Context bridge API
├── src/                    # Your existing built web app (HTML/CSS/JS)
│   ├── index.html
│   └── ...
├── package.json
└── vite.config.js          # (Or your existing bundler)
B. Preload Script (electron/preload.js)Safely bridges file operations between your web app and the desktop OS:const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  saveFile: (data) => ipcRenderer.invoke('dialog:saveFile', data),
  openFile: () => ipcRenderer.invoke('dialog:openFile'),
});
C. Main Process (electron/main.js)Configures a sandboxed, hardware-accelerated Chromium window:const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const fs = require('fs/promises');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 720,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.js')
    }
  });

  // Load the built web application
  win.loadFile(path.join(__dirname, '../dist/index.html'));
}

ipcMain.handle('dialog:saveFile', async (event, { buffer, filename }) => {
  const { filePath } = await dialog.showSaveDialog({ defaultPath: filename });
  if (filePath) {
    await fs.writeFile(filePath, Buffer.from(buffer));
    return true;
  }
  return false;
});

app.whenReady().then(createWindow);
4. Canvas Polish & Rendering EnforcementsTo ensure crisp pixel rendering across both PWA and Electron on high-DPI (Retina/4K) displays:A. Disable Bilinear Filtering in CSScanvas {
  image-rendering: pixelated;
  image-rendering: crisp-edges;
}
B. Force Crisp Canvas Context ScalingWhen instantiating or resizing your 2D canvas context in JavaScript:const ctx = canvas.getContext('2d');
ctx.imageSmoothingEnabled = false;
ctx.webkitImageSmoothingEnabled = false;
ctx.mozImageSmoothingEnabled = false;
C. Air-Gapped Security HeaderGuarantee no external network requests can occur by adding a Content Security Policy tag to your index.html:<meta http-equiv="Content-Security-Policy" 
      content="default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:;">
5. Free Build & Distribution PipelinePackage binaries for Windows, macOS, and Linux without buying code-signing certificates.A. Configuration (package.json){
  "name": "pixel-editor",
  "version": "1.0.0",
  "main": "electron/main.js",
  "scripts": {
    "build:web": "vite build",
    "build:electron": "npm run build:web && electron-builder"
  },
  "build": {
    "appId": "com.indie.pixeleditor",
    "productName": "PixelEditor",
    "directories": {
      "output": "dist-electron"
    },
    "files": [
      "dist/**/*",
      "electron/**/*"
    ],
    "win": {
      "target": ["nsis", "zip"]
    },
    "mac": {
      "target": ["dmg", "zip"]
    },
    "linux": {
      "target": ["AppImage", "tar.gz"]
    },
    "publish": [
      {
        "provider": "github",
        "owner": "YOUR_GITHUB_USERNAME",
        "repo": "YOUR_REPO_NAME"
      }
    ]
  },
  "devDependencies": {
    "electron": "^30.0.0",
    "electron-builder": "^24.0.0"
  }
}
B. Automated GitHub Releases Workflow (.github/workflows/release.yml)Builds and deploys web static files to GitHub Pages and packages desktop executables automatically on tag creation:name: Build & Release

on:
  push:
    tags:
      - 'v*'

jobs:
  release-web:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - run: npm run build:web
      - name: Deploy to GitHub Pages
        uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: ./dist

  release-desktop:
    strategy:
      matrix:
        os: [ubuntu-latest, windows-latest, macos-latest]
    runs-on: ${{ matrix.os }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - run: npm ci
      - name: Build and Package Electron
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: npx electron-builder --publish always
6. User Experience & Bypassing OS PromptsSince you are distributing free, unsigned desktop builds:A. Windows SmartScreenWhen users download your .exe, Windows will display "Windows protected your PC".User Workaround: Click "More info" $\rightarrow$ "Run anyway".B. macOS GatekeeperWhen users download your .dmg, macOS will display "App cannot be opened because it is from an unidentified developer".User Workaround: Right-click (or Control-click) the application icon $\rightarrow$ Select Open $\rightarrow$ Click Open.C. Recommended README / itch.io Disclaimer TemplateInclude this short statement on your download pages to set clear expectations:Unsigned Build Notice:This pixel editor is 100% free, open, and built independently. It contains zero tracking, zero ads, and collects no data.Because commercial code-signing certificates cost hundreds of dollars per year, desktop builds are unsigned.Windows: Click More info $\rightarrow$ Run anyway on the initial launch.macOS: Right-click the app icon and select Open.No Install Option: You can also run the editor directly in your web browser or install it as a PWA via GitHub Pages or itch.io with zero operating system warnings.

---

## Staged plan for this repo

This repo is deliberately zero-build (no bundler, native ES modules) — the Vite-based build scripts and from-scratch `StorageAdapter` class hierarchy above aren't needed for the PWA half, and shouldn't be adopted just for this. `src/storage.js`'s existing `createIndexedDbBackend`/`createFsaBackend`, selected via `chooseBackend()` in `src/persistence.js`, already is that adapter seam — a `{kind, read, write, delete, list}` interface. A future Electron backend just adds a third implementation of the same shape.

**Done now (native browser APIs, no build step):**
- `manifest.json` (repo root) + `<link rel="manifest">` in `index.html`. `icons: []` for now — real icon files haven't been made yet; add them and populate the array when they exist.
- `service-worker.js` (repo root), registered from `index.html`. Cache-as-you-go instead of a hand-maintained precache list of `src/*.js` (that list would go stale every time a file is added — not worth the upkeep in a zero-build repo with no manifest generator): cache-first, and any live network fetch gets stored for next time. After one full online load, the app works offline.
- Self-scoped CSP `<meta>` tag in `index.html` (`script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net` — jsdelivr stays allowed for the existing pdf-lib `<script>` tag).

**Deferred until Electron packaging work actually begins:**
- electron-builder config, `electron/main.js` + `electron/preload.js`, the `window.electronAPI` IPC bridge, an Electron storage backend (plain Node `fs`, same interface shape as the existing backends).
- Any bundler — only ever for packaging the desktop binary, never for day-to-day web development.
- The CI release workflow (see `todo/github-release-update-system.md`'s staged plan).
