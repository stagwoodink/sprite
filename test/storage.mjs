// The IndexedDB backend shares one connection, and reopens after the browser drops it.
import assert from 'node:assert/strict';

let opens = 0, db;
const stores = { entries: new Map(), 'fsa-handle': new Map() };
const request = (value) => { const req = {}; queueMicrotask(() => { req.result = value; req.onsuccess?.(); }); return req; };
const objectStore = (m) => ({
  put: (v, k) => request(m.set(k, v) && undefined),
  get: (k) => request(m.get(k)),
  delete: (k) => request(m.delete(k) && undefined),
  getAllKeys: () => request([...m.keys()]),
});
globalThis.indexedDB = {
  open() {
    opens++;
    const req = {};
    db = {
      objectStoreNames: { contains: () => true },
      transaction: (name) => ({ objectStore: () => objectStore(stores[name]) }),
      close() {},
    };
    queueMicrotask(() => { req.result = db; req.onsuccess(); });
    return req;
  },
};

const { createDefaultBackend } = await import('../src/storage.js');
const backend = createDefaultBackend();
await backend.write(['p', 'a'], { x: 1 });
await backend.write(['p', 'b'], new Uint8Array([1, 2]));
await Promise.all([backend.read(['p', 'a']), backend.readBytes(['p', 'b']), backend.list(['p']), backend.delete(['p', 'a'])]);
assert.equal(opens, 1, 'six operations share one connection');
assert.deepEqual(await backend.list(['p']), ['b']);

db.onclose(); // the browser closed the connection
await backend.read(['p', 'b']);
assert.equal(opens, 2, 'a closed connection is reopened');
db.onversionchange(); // another tab upgrades the schema
await backend.read(['p', 'b']);
assert.equal(opens, 3, 'and so is one that must make way for an upgrade');
console.log('storage ok');
