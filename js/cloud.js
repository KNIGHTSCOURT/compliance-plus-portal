'use strict';

/* Compliance Plus — Supabase sign-in and sync.
   Staff: every change on this device is queued (Store.outbox) and sent to the
   "records" table; changes from other devices are pulled every minute.
   Clients: read-only; they receive only their own records (enforced by the
   database's row level security), refreshed in full each time. */

const Cloud = (() => {
  const cfg = window.CP_CONFIG || {};
  const configured = !!(cfg.supabaseUrl && cfg.supabaseAnonKey && window.supabase);
  const BUCKET = 'photos';
  let sb = null;
  let session = null;
  let profile = null;
  let pushTimer = null, timer = null;
  let busy = false, again = false, begun = false;
  let status = 'idle', lastError = '', lastSync = null;

  function client() {
    if (!sb) {
      sb = window.supabase.createClient(cfg.supabaseUrl, cfg.supabaseAnonKey, {
        auth: { flowType: 'implicit', detectSessionInUrl: false, persistSession: true, autoRefreshToken: true, storageKey: 'cp-auth' }
      });
    }
    return sb;
  }

  function setStatus(s, err) {
    status = s;
    if (err !== undefined) lastError = err;
    window.dispatchEvent(new CustomEvent('cp-sync-status'));
  }

  /* Sign-in links (invite, password reset, email confirmation) arrive as
     #access_token=…&type=… — handle them before the page router sees them. */
  async function consumeAuthHash() {
    const h = location.hash || '';
    if (!/access_token=|error_description=/.test(h)) return null;
    const p = new URLSearchParams(h.replace(/^#\/?/, ''));
    history.replaceState(null, '', location.pathname + location.search + '#/');
    if (p.get('error_description')) return { error: p.get('error_description').replace(/\+/g, ' ') };
    const { error } = await client().auth.setSession({ access_token: p.get('access_token'), refresh_token: p.get('refresh_token') });
    if (error) return { error: error.message };
    return { type: p.get('type') || '' };
  }

  async function init() {
    if (!configured) return null;
    client();
    const info = await consumeAuthHash();
    const { data } = await sb.auth.getSession();
    session = data.session;
    sb.auth.onAuthStateChange((evt, s) => { session = s; });
    if (session) await loadProfile();
    return info;
  }

  async function loadProfile() {
    if (!session) { profile = null; return null; }
    try {
      const { data, error } = await sb.from('profiles').select('id, email, role, client_id').eq('id', session.user.id).single();
      if (error) throw error;
      profile = data;
      Store.meta.profile = data;
    } catch (e) {
      // Offline: use the last known profile for this user.
      const cached = Store.meta.profile;
      profile = cached && cached.id === session.user.id ? cached : null;
    }
    return profile;
  }

  async function signIn(email, password) {
    const { data, error } = await client().auth.signInWithPassword({ email: email.trim(), password });
    if (error) throw error;
    session = data.session;
    await loadProfile();
  }

  async function signUp(email, password) {
    const { data, error } = await client().auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: portalBaseUrl() } });
    if (error) throw error;
    session = data.session;
    if (session) await loadProfile();
    return !!session;
  }

  async function sendReset(email) {
    const { error } = await client().auth.resetPasswordForEmail(email.trim(), { redirectTo: portalBaseUrl() });
    if (error) throw error;
  }

  async function setPassword(password) {
    const { error } = await client().auth.updateUser({ password });
    if (error) throw error;
  }

  async function signOut() {
    stop();
    try { await client().auth.signOut(); } catch (e) { /* offline */ }
    session = null; profile = null;
    await Store.wipe();
  }

  /* Called once signed in. Clears another person's data off a shared device. */
  async function begin() {
    const uid = session.user.id;
    if (Store.meta.userId && Store.meta.userId !== uid) await Store.wipe();
    Store.meta.userId = uid;
    Store.meta.profile = profile;
    await Store.flush();
    if (timer) clearInterval(timer);
    timer = setInterval(() => { if (document.visibilityState === 'visible') syncNow(); }, 60000);
    if (begun) return;
    begun = true;
    window.addEventListener('online', syncNow);
    Store.onChange(() => {
      if (!isStaff()) return;
      clearTimeout(pushTimer);
      pushTimer = setTimeout(syncNow, 2000);
      window.dispatchEvent(new CustomEvent('cp-sync-status'));
    });
  }

  function stop() { clearInterval(timer); clearTimeout(pushTimer); timer = null; }

  const isStaff = () => !!profile && profile.role === 'staff';
  const isClient = () => !!profile && profile.role === 'client';

  function rowClientId(coll, rec) {
    if (!rec) return null;
    if (coll === 'quotes' || coll === 'accounts') return null; // accounts are never shared with a client login
    if (coll === 'notices') return rec.clientId || null; // an update reaches only its own client; the sent-history record stays staff-only
    if (coll === 'clients') return rec.id;
    if (coll === 'sites') return rec.clientId || null;
    if (coll === 'photos') return rec.clientId || null;
    const site = rec.siteId ? Store.get('sites', rec.siteId) : null;
    return site ? site.clientId || null : null;
  }

  const photoPath = m => `${m.clientId || 'business'}/${m.id}.jpg`;

  async function dataUrlToBlob(url) { return (await fetch(url)).blob(); }
  function blobToDataUrl(blob) {
    return new Promise((resolve, reject) => { const fr = new FileReader(); fr.onload = () => resolve(fr.result); fr.onerror = reject; fr.readAsDataURL(blob); });
  }

  async function push() {
    // Photo files first, so records never point at a photo that isn't there.
    for (const id of Object.keys(Store.photoOutbox)) {
      const m = Store.get('photos', id);
      const url = await Store.localPhoto(id);
      if (!m || !url) { delete Store.photoOutbox[id]; continue; }
      const blob = await dataUrlToBlob(url);
      const { error } = await sb.storage.from(BUCKET).upload(photoPath(m), blob, { upsert: true, contentType: blob.type || 'image/jpeg' });
      if (error) throw error;
      delete Store.photoOutbox[id];
    }
    const sj = JSON.stringify(Store.settings);
    // A device that has never downloaded the online records must not upload its blank settings over the real ones.
    if (!Store.meta.lastPull) delete Store.outbox['settings|main'];
    else if (sj !== Store.meta.settingsJson && !Store.outbox['settings|main']) Store.outbox['settings|main'] = { coll: 'settings', id: 'main' };
    const entries = Object.entries(Store.outbox);
    for (let i = 0; i < entries.length; i += 200) {
      const chunk = entries.slice(i, i + 200);
      const rows = [];
      for (const [, e] of chunk) {
        if (e.coll === 'settings') { rows.push({ coll: 'settings', id: 'main', client_id: null, data: Store.settings, deleted: false }); continue; }
        const rec = Store.get(e.coll, e.id);
        rows.push({ coll: e.coll, id: e.id, client_id: rec ? rowClientId(e.coll, rec) : null, data: rec || {}, deleted: !rec });
      }
      const { error } = await sb.from('records').upsert(rows, { onConflict: 'coll,id' });
      if (error) throw error;
      // Only clear entries not changed again while uploading.
      for (const [key, e] of chunk) if (Store.outbox[key] === e) delete Store.outbox[key];
    }
    Store.meta.settingsJson = sj;
  }

  async function pullStaff() {
    const since = Store.meta.lastPull ? new Date(new Date(Store.meta.lastPull).getTime() - 120000).toISOString() : '1970-01-01T00:00:00Z';
    let changed = 0, maxTs = Store.meta.lastPull || null, from = 0;
    for (;;) {
      const { data, error } = await sb.from('records').select('coll, id, data, deleted, updated_at')
        .gt('updated_at', since).order('updated_at', { ascending: true }).range(from, from + 999);
      if (error) throw error;
      for (const r of data) {
        if (Store.applyRemote(r.coll, r.id, r.data, r.deleted)) changed++;
        if (!maxTs || r.updated_at > maxTs) maxTs = r.updated_at;
      }
      if (data.length < 1000) break;
      from += 1000;
    }
    Store.meta.lastPull = maxTs || new Date().toISOString();
    return changed;
  }

  /* Clients get a full fresh copy each time (small, and removals show up). */
  async function pullClient() {
    const rows = [];
    let from = 0;
    for (;;) {
      const { data, error } = await sb.from('records').select('coll, id, data').range(from, from + 999);
      if (error) throw error;
      rows.push(...data);
      if (data.length < 1000) break;
      from += 1000;
    }
    const before = JSON.stringify(Store.COLLS.map(k => Store.data[k])) + JSON.stringify(Store.settings);
    for (const k of Store.COLLS) Store.data[k] = [];
    for (const r of rows) {
      if (r.coll === 'settings') Store.applyRemote('settings', 'main', r.data, false);
      else if (Store.data[r.coll]) Store.data[r.coll].push(r.data);
    }
    for (const k of Object.keys(Store.outbox)) delete Store.outbox[k];
    return before !== JSON.stringify(Store.COLLS.map(k => Store.data[k])) + JSON.stringify(Store.settings) ? 1 : 0;
  }

  async function syncNow() {
    if (!session || !profile || profile.role === 'pending') return;
    if (busy) { again = true; return; }
    if (!navigator.onLine) { setStatus('offline'); return; }
    busy = true;
    setStatus('syncing');
    try {
      let changed;
      if (isStaff()) { await push(); changed = await pullStaff(); }
      else changed = await pullClient();
      lastSync = new Date();
      await Store.flush();
      setStatus('synced', '');
      if (changed) { invalidateState(); window.dispatchEvent(new CustomEvent('cp-remote-change')); }
    } catch (e) {
      console.warn('Sync failed', e);
      setStatus(navigator.onLine ? 'error' : 'offline', e.message || String(e));
      if (/JWT|token/i.test(e.message || '')) await sb.auth.refreshSession().catch(() => {});
    }
    busy = false;
    if (again) { again = false; syncNow(); }
  }

  async function downloadPhoto(m) {
    if (!sb || !session || !m) return null;
    const { data, error } = await sb.storage.from(BUCKET).download(photoPath(m));
    if (error || !data) return null;
    return blobToDataUrl(data);
  }

  async function callInvite(body) {
    const { data, error } = await client().functions.invoke('invite-user', { body });
    if (error) {
      let msg = error.message;
      try { const j = await error.context.json(); msg = j.error || msg; } catch (e) { /* keep message */ }
      throw new Error(msg);
    }
    if (data && data.error) throw new Error(data.error);
    return data;
  }

  const invite = (email, role, clientId) => callInvite({ action: 'invite', email, role, clientId, redirectTo: portalBaseUrl() });
  const revoke = userId => callInvite({ action: 'revoke', userId });

  async function listLogins(filter) {
    let q = client().from('profiles').select('id, email, role, client_id, created_at').order('email');
    if (filter.clientId) q = q.eq('client_id', filter.clientId).eq('role', 'client');
    if (filter.role) q = q.eq('role', filter.role);
    const { data, error } = await q;
    if (error) throw error;
    return data;
  }

  function pendingCount() { return Object.keys(Store.outbox).length + Object.keys(Store.photoOutbox).length; }

  return {
    init, signIn, signUp, sendReset, setPassword, signOut, begin, syncNow, downloadPhoto, loadProfile,
    invite, revoke, listLogins, pendingCount, isStaff, isClient,
    get configured() { return configured; },
    get signedIn() { return !!session; },
    get email() { return session ? session.user.email : ''; },
    get profile() { return profile; },
    get clientId() { return profile && profile.role === 'client' ? profile.client_id : null; },
    get status() { return status; },
    get lastError() { return lastError; },
    get lastSync() { return lastSync; }
  };
})();
