// On-device storage in IndexedDB. Nothing here talks to the network.
const DB_NAME = "riyal-ledger";
const VERSION = 1;
let dbp = null;

function open() {
  if (dbp) return dbp;
  dbp = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) db.createObjectStore("kv");
      if (!db.objectStoreNames.contains("tx")) db.createObjectStore("tx", { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbp;
}

async function run(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    let out;
    Promise.resolve(fn(s)).then(r => { out = r; });
    t.oncomplete = () => resolve(out);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
const req2p = r => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

export const getSettings = () => run("kv", "readonly", s => req2p(s.get("settings")));
export const saveSettings = settings => run("kv", "readwrite", s => { s.put({ ...settings, updated: new Date().toISOString() }, "settings"); });
export const allTx = () => run("tx", "readonly", s => req2p(s.getAll()));
export const putTx = tx => run("tx", "readwrite", s => { s.put(tx); });
export const putManyTx = list => run("tx", "readwrite", s => { for (const x of list) s.put(x); });
export const clearTx = () => run("tx", "readwrite", s => { s.clear(); });

/** Ask the browser not to evict our data under storage pressure. Best effort. */
export async function persist() {
  try { return navigator.storage?.persist ? await navigator.storage.persist() : false; } catch { return false; }
}
