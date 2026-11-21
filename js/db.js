/*
 * Quiet Moon — on-device storage. IndexedDB first, localStorage as a fallback.
 * Nothing here (or anywhere in the app) touches the network.
 * Author: Vishal Gangaram
 */

const DB_NAME = 'cycle-tracker';
const DB_VERSION = 1;
const LS_ENTRIES = 'cycle.entries';
const LS_KV = 'cycle.kv';

function req(r) {
  return new Promise((resolve, reject) => {
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}

function openIDB() {
  return new Promise((resolve, reject) => {
    if (!('indexedDB' in self) || !indexedDB) return reject(new Error('no indexedDB'));
    let r;
    try { r = indexedDB.open(DB_NAME, DB_VERSION); } catch (e) { return reject(e); }
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains('entries')) db.createObjectStore('entries', { keyPath: 'date' });
      if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
    };
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.onblocked = () => reject(new Error('indexedDB blocked'));
  });
}

class IDBStore {
  constructor(db) { this.db = db; this.kind = 'IndexedDB'; }
  tx(store, mode = 'readonly') { return this.db.transaction(store, mode).objectStore(store); }
  done(t) {
    return new Promise((resolve, reject) => {
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  getAllEntries() { return req(this.tx('entries').getAll()); }
  putEntry(e) { return req(this.tx('entries', 'readwrite').put(e)); }
  deleteEntry(date) { return req(this.tx('entries', 'readwrite').delete(date)); }
  async putEntries(list, { replace = false } = {}) {
    const t = this.db.transaction('entries', 'readwrite');
    const s = t.objectStore('entries');
    if (replace) s.clear();
    for (const e of list) s.put(e);
    return this.done(t);
  }
  getKV(key) { return req(this.tx('kv').get(key)); }
  setKV(key, val) { return req(this.tx('kv', 'readwrite').put(val, key)); }
  async clearAll() {
    const t = this.db.transaction(['entries', 'kv'], 'readwrite');
    t.objectStore('entries').clear();
    t.objectStore('kv').clear();
    return this.done(t);
  }
}

class LocalStore {
  constructor() { this.kind = 'localStorage'; }
  read(k) { try { return JSON.parse(localStorage.getItem(k)) || {}; } catch { return {}; } }
  write(k, v) { localStorage.setItem(k, JSON.stringify(v)); }
  async getAllEntries() { return Object.values(this.read(LS_ENTRIES)); }
  async putEntry(e) { const m = this.read(LS_ENTRIES); m[e.date] = e; this.write(LS_ENTRIES, m); }
  async deleteEntry(date) { const m = this.read(LS_ENTRIES); delete m[date]; this.write(LS_ENTRIES, m); }
  async putEntries(list, { replace = false } = {}) {
    const m = replace ? {} : this.read(LS_ENTRIES);
    for (const e of list) m[e.date] = e;
    this.write(LS_ENTRIES, m);
  }
  async getKV(key) { return this.read(LS_KV)[key]; }
  async setKV(key, val) { const m = this.read(LS_KV); m[key] = val; this.write(LS_KV, m); }
  async clearAll() { localStorage.removeItem(LS_ENTRIES); localStorage.removeItem(LS_KV); }
}

export async function openStore() {
  try {
    const db = await openIDB();
    const store = new IDBStore(db);
    await store.getKV('__probe'); // make sure reads actually work (some private modes fail late)
    return store;
  } catch {
    return new LocalStore();
  }
}
