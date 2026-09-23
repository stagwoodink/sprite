// Hybrid storage backend (design-doc §1 item 5, ui-design-system §3): a real
// directory via the File System Access API when the browser grants it,
// otherwise a silent fallback to an IndexedDB-backed virtual filesystem.
// Both backends share the same path-based interface so callers (Phase 7's
// Project/File model) never need to know which one is active.
//
// Path = an array of segments, e.g. ['MyProject', 'icon.sprite'].
// `write` takes either a JSON-able value or a Uint8Array (stored raw — the
// binary pixel sidecars); binary entries are read back with `readBytes`.

const IDB_NAME = 'sprite-vfs';
const IDB_STORE = 'entries';
const IDB_HANDLE_STORE = 'fsa-handle';

function openIdb() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(IDB_HANDLE_STORE)) db.createObjectStore(IDB_HANDLE_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function idbRequest(store, mode, fn) {
  return openIdb().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

function createIndexedDbBackend() {
  return {
    kind: 'idb',
    async write(path, data) {
      await idbRequest(IDB_STORE, 'readwrite', (s) => s.put(data, path.join('/')));
    },
    async read(path) {
      const v = await idbRequest(IDB_STORE, 'readonly', (s) => s.get(path.join('/')));
      return v === undefined ? null : v;
    },
    async readBytes(path) {
      const v = await this.read(path);
      return v && new Uint8Array(v);
    },
    async delete(path) {
      await idbRequest(IDB_STORE, 'readwrite', (s) => s.delete(path.join('/')));
    },
    async list(prefix) {
      const keys = await idbRequest(IDB_STORE, 'readonly', (s) => s.getAllKeys());
      const prefixStr = prefix.length ? prefix.join('/') + '/' : '';
      return keys
        .filter((k) => k.startsWith(prefixStr) && k !== prefixStr)
        .map((k) => k.slice(prefixStr.length).split('/')[0])
        .filter((v, i, arr) => arr.indexOf(v) === i);
    },
  };
}

async function fsaDirFor(root, path, { create } = {}) {
  let dir = root;
  for (let i = 0; i < path.length - 1; i++) {
    dir = await dir.getDirectoryHandle(path[i], { create: !!create });
  }
  return dir;
}

function createFsaBackend(rootHandle) {
  return {
    kind: 'fsa',
    async write(path, data) {
      const dir = await fsaDirFor(rootHandle, path, { create: true });
      const fileHandle = await dir.getFileHandle(path[path.length - 1], { create: true });
      const writable = await fileHandle.createWritable();
      await writable.write(data instanceof Uint8Array ? data : JSON.stringify(data));
      await writable.close();
    },
    async read(path) {
      try {
        const dir = await fsaDirFor(rootHandle, path);
        const fileHandle = await dir.getFileHandle(path[path.length - 1]);
        const file = await fileHandle.getFile();
        return JSON.parse(await file.text());
      } catch {
        return null;
      }
    },
    async readBytes(path) {
      try {
        const dir = await fsaDirFor(rootHandle, path);
        const fileHandle = await dir.getFileHandle(path[path.length - 1]);
        return new Uint8Array(await (await fileHandle.getFile()).arrayBuffer());
      } catch {
        return null;
      }
    },
    async delete(path) {
      try {
        const dir = await fsaDirFor(rootHandle, path);
        await dir.removeEntry(path[path.length - 1]);
      } catch {
        // already gone
      }
    },
    async list(prefix) {
      const names = [];
      try {
        const dir = prefix.length ? await fsaDirFor(rootHandle, [...prefix, '']) : rootHandle;
        for await (const name of dir.keys()) names.push(name);
      } catch {
        // directory doesn't exist yet
      }
      return names;
    },
  };
}

// One-time "connect a folder" grant (ui-design-system §3.1). The handle is
// cached in IndexedDB so it can be re-requested (not re-prompted from
// scratch) on the next visit — the browser still requires a user gesture to
// re-confirm permission, this just avoids losing which folder was chosen.
export async function connectFolder() {
  if (!window.showDirectoryPicker) return null;
  const handle = await window.showDirectoryPicker();
  await idbRequest(IDB_HANDLE_STORE, 'readwrite', (s) => s.put(handle, 'root'));
  return createFsaBackend(handle);
}

export async function resumeFolder() {
  if (!window.showDirectoryPicker) return null;
  const handle = await idbRequest(IDB_HANDLE_STORE, 'readonly', (s) => s.get('root'));
  if (!handle) return null;
  const perm = await handle.queryPermission({ mode: 'readwrite' });
  if (perm !== 'granted') return null; // needs a fresh user gesture to re-request
  return createFsaBackend(handle);
}

// Falls back silently to IndexedDB (§1 item 5) — this is the default backend
// until/unless the user explicitly connects a folder.
export function createDefaultBackend() {
  return createIndexedDbBackend();
}
