'use strict';

/* Compliance Plus — data store.
   Everything is kept on this device in IndexedDB so the portal works with no
   signal on site. Every change is also added to an "outbox"; when signed in,
   js/cloud.js sends the outbox to Supabase and pulls changes made on other
   devices. Photos are kept separately (one record per photo). */

const Store = (() => {
  const DB_NAME = 'compliance-plus';
  const COLLS = ['clients', 'sites', 'items', 'inspections', 'assessments', 'photos', 'quotes'];
  let idb = null;
  let data = null;
  let saveTimer = null;
  const photoCache = new Map();
  let outbox = {};          // "coll|id" -> { coll, id, deleted }
  let photoOutbox = {};     // photoId -> true (file not yet uploaded)
  let meta = {};            // { userId, lastPull, settingsJson }
  const listeners = [];

  const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));

  function defaults() {
    const c = window.CP_CONFIG || {};
    return {
      businessName: c.businessName || 'Compliance Plus',
      tagline: c.tagline || '',
      assessorName: '',
      qualifications: '',
      phone: '',
      email: '',
      address: '',
      website: '',
      portalUrl: c.portalUrl || '',
      refPrefix: c.refPrefix || 'CP',
      nextRef: 1,
      logo: '',
      reportDisclaimer: 'This report records the condition of the items inspected at the time of the visit. It is based on a non-intrusive visual inspection and the tests described, and covers only the areas and items listed. Items not accessible at the time of the visit are noted as such.'
    };
  }

  function empty() {
    const d = { schema: 1, settings: defaults() };
    for (const k of COLLS) d[k] = [];
    return d;
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('kv')) db.createObjectStore('kv');
        if (!db.objectStoreNames.contains('photos')) db.createObjectStore('photos');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  function run(storeName, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = idb.transaction(storeName, mode);
      const req = fn(t.objectStore(storeName));
      t.oncomplete = () => resolve(req ? req.result : undefined);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }

  function normalise() {
    if (!data) data = empty();
    data.settings = Object.assign(defaults(), data.settings || {});
    for (const k of COLLS) if (!Array.isArray(data[k])) data[k] = [];
  }

  async function init() {
    try {
      idb = await openDb();
      data = await run('kv', 'readonly', s => s.get('data'));
      outbox = (await run('kv', 'readonly', s => s.get('outbox'))) || {};
      photoOutbox = (await run('kv', 'readonly', s => s.get('photoOutbox'))) || {};
      meta = (await run('kv', 'readonly', s => s.get('meta'))) || {};
      if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
    } catch (e) {
      console.warn('IndexedDB unavailable, data will not be kept', e);
      idb = null;
    }
    normalise();
    return data;
  }

  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(flush, 250);
    notify();
  }

  async function flush() {
    clearTimeout(saveTimer);
    if (!idb) return;
    try {
      await run('kv', 'readwrite', s => {
        s.put(JSON.parse(JSON.stringify(data)), 'data');
        s.put(outbox, 'outbox');
        s.put(photoOutbox, 'photoOutbox');
        return s.put(meta, 'meta');
      });
    } catch (e) {
      console.error(e);
      window.dispatchEvent(new CustomEvent('cp-save-error', { detail: e }));
    }
  }

  function notify() { for (const fn of listeners) { try { fn(); } catch (e) { console.warn(e); } } }
  function onChange(fn) { listeners.push(fn); }

  // ---------- Generic record helpers ----------
  const list = coll => data[coll];
  const get = (coll, id) => data[coll].find(r => r.id === id) || null;

  function markDirty(coll, id, deleted) {
    outbox[`${coll}|${id}`] = { coll, id, deleted: !!deleted };
  }

  function upsert(coll, rec) {
    const now = new Date().toISOString();
    if (!rec.id) { rec.id = uid(); rec.createdAt = now; }
    rec.updatedAt = now;
    const i = data[coll].findIndex(r => r.id === rec.id);
    if (i === -1) data[coll].push(rec); else data[coll][i] = rec;
    markDirty(coll, rec.id, false);
    save();
    return rec;
  }

  function remove(coll, id) {
    data[coll] = data[coll].filter(r => r.id !== id);
    markDirty(coll, id, true);
    save();
  }

  /* Applies a record received from the cloud. Local unsent changes win if newer. */
  function applyRemote(coll, id, rec, deleted) {
    if (coll === 'settings') {
      if (outbox['settings|main'] && (data.settings.updatedAt || '') > ((rec && rec.updatedAt) || '')) return false;
      data.settings = Object.assign(defaults(), rec || {});
      meta.settingsJson = JSON.stringify(data.settings);
      return true;
    }
    if (!data[coll]) return false;
    const key = `${coll}|${id}`;
    const i = data[coll].findIndex(r => r.id === id);
    const local = i === -1 ? null : data[coll][i];
    if (outbox[key]) {
      const localTime = local ? local.updatedAt || '' : '9999';
      if (localTime >= ((rec && rec.updatedAt) || '')) return false;
      delete outbox[key];
    }
    if (deleted) {
      if (i === -1) return false;
      data[coll].splice(i, 1);
      return true;
    }
    if (local && JSON.stringify(local) === JSON.stringify(rec)) return false;
    if (i === -1) data[coll].push(rec); else data[coll][i] = rec;
    return true;
  }

  function nextRef() {
    const s = data.settings;
    let ref;
    do {
      ref = `${s.refPrefix || 'CP'}-${String(s.nextRef || 1).padStart(5, '0')}`;
      s.nextRef = (s.nextRef || 1) + 1;
    } while (data.items.some(i => i.ref === ref));
    touchSettings();
    return ref;
  }

  function touchSettings() {
    data.settings.updatedAt = new Date().toISOString();
    markDirty('settings', 'main', false);
    save();
  }

  // ---------- Photos ----------
  /* clientId decides which client login may see the photo. */
  async function putPhoto(dataUrl, clientId) {
    const id = uid();
    photoCache.set(id, dataUrl);
    if (idb) await run('photos', 'readwrite', s => s.put(dataUrl, id));
    upsert('photos', { id, clientId: clientId || null });
    photoOutbox[id] = true;
    save();
    return id;
  }

  async function getPhoto(id) {
    if (!id) return null;
    if (photoCache.has(id)) return photoCache.get(id);
    let v = idb ? await run('photos', 'readonly', s => s.get(id)) : null;
    if (!v && typeof Cloud !== 'undefined' && Cloud.signedIn) {
      v = await Cloud.downloadPhoto(get('photos', id) || { id });
      if (v && idb) await run('photos', 'readwrite', s => s.put(v, id));
    }
    if (v) photoCache.set(id, v);
    return v || null;
  }

  async function localPhoto(id) {
    if (photoCache.has(id)) return photoCache.get(id);
    return idb ? run('photos', 'readonly', s => s.get(id)) : null;
  }

  async function deletePhoto(id) {
    photoCache.delete(id);
    delete photoOutbox[id];
    if (idb) await run('photos', 'readwrite', s => s.delete(id));
    if (get('photos', id)) remove('photos', id);
  }

  async function allPhotoIds() {
    if (!idb) return [...photoCache.keys()];
    return run('photos', 'readonly', s => s.getAllKeys());
  }

  // ---------- Backup ----------
  async function exportAll() {
    const ids = await allPhotoIds();
    const photos = {};
    for (const id of ids) photos[id] = await localPhoto(id);
    return { app: 'compliance-plus', exportedAt: new Date().toISOString(), data, photos };
  }

  async function importAll(obj) {
    if (!obj || obj.app !== 'compliance-plus' || !obj.data) throw new Error('This file is not a Compliance Plus backup.');
    data = obj.data;
    normalise();
    if (idb) {
      await run('photos', 'readwrite', s => s.clear());
      for (const [id, url] of Object.entries(obj.photos || {})) await run('photos', 'readwrite', s => s.put(url, id));
    }
    photoCache.clear();
    markAllDirty();
    await flush();
  }

  /* Queues everything on this device for upload (first sign-in, or after restoring a backup). */
  function markAllDirty() {
    for (const k of COLLS) for (const r of data[k]) markDirty(k, r.id, false);
    for (const p of data.photos) photoOutbox[p.id] = true;
    data.settings.updatedAt = data.settings.updatedAt || new Date().toISOString();
    markDirty('settings', 'main', false);
    save();
  }

  async function wipe(keepSync) {
    data = empty();
    photoCache.clear();
    outbox = {};
    photoOutbox = {};
    if (!keepSync) meta = {};
    if (idb) await run('photos', 'readwrite', s => s.clear());
    await flush();
    notify();
  }

  return {
    COLLS, init, save, flush, uid, list, get, upsert, remove, applyRemote, nextRef, touchSettings, onChange,
    putPhoto, getPhoto, localPhoto, deletePhoto, exportAll, importAll, wipe, markAllDirty,
    get data() { return data; },
    get settings() { return data.settings; },
    get persistent() { return !!idb; },
    get outbox() { return outbox; },
    get photoOutbox() { return photoOutbox; },
    get meta() { return meta; }
  };
})();
