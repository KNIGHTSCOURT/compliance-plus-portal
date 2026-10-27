'use strict';

/* Compliance Plus — shared helpers used by every screen. */

const OUTCOME_LABEL = { pass: 'Satisfactory', fail: 'Defective', advisory: 'Advisory', untested: 'Not Inspected' };
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function today() {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}
function addMonths(iso, m) {
  const d = new Date(iso + 'T12:00:00');
  const day = d.getDate();
  d.setMonth(d.getMonth() + Number(m));
  if (d.getDate() < day) d.setDate(0);
  return d.toISOString().slice(0, 10);
}
function addDays(iso, n) {
  const d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso) {
  if (!iso) return '—';
  const d = new Date(String(iso).length === 10 ? iso + 'T12:00:00' : iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/* ---------- Item status ---------- */
let _lastMap = null;
function invalidateState() { _lastMap = null; }
function lastInspection(itemId) {
  if (!_lastMap) {
    _lastMap = new Map();
    for (const x of Store.list('inspections')) {
      const p = _lastMap.get(x.itemId);
      if (!p || (x.date + (x.createdAt || '')) > (p.date + (p.createdAt || ''))) _lastMap.set(x.itemId, x);
    }
  }
  return _lastMap.get(itemId) || null;
}
function inspectionsFor(itemId) {
  return Store.list('inspections').filter(x => x.itemId === itemId)
    .sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || '')));
}
function itemState(it) {
  const last = lastInspection(it.id);
  const due = last ? last.nextDue : null;
  const t = today();
  return {
    last, due,
    outcome: last ? last.outcome : 'untested',
    overdue: !!due && due < t,
    dueSoon: !!due && due >= t && due <= addDays(t, 30)
  };
}

function siteOf(it) { return Store.get('sites', it.siteId); }
function floorOf(it) {
  const s = siteOf(it);
  return s ? (s.floors || []).find(f => f.id === it.floorId) || null : null;
}
function roomName(it) {
  const f = floorOf(it);
  const r = f && it.roomId ? (f.rooms || []).find(x => x.id === it.roomId) : null;
  return [r ? r.name : '', it.locationNote || ''].filter(Boolean).join(' — ');
}
function locationText(it, short) {
  const s = siteOf(it), f = floorOf(it);
  const parts = [short ? '' : (s ? s.name : ''), f ? f.name : '', roomName(it)].filter(Boolean);
  return parts.join(' · ') || 'Location Not Set';
}
function itemTitle(it) {
  const t = ITEM_TYPES[it.type] || ITEM_TYPES.other;
  const d = it.details || {};
  const extra = it.name || d.appliance || d.description || d.device || d.medium || d.sign || '';
  return extra ? `${t.label} — ${extra}` : t.label;
}
function detailSummary(it) {
  const t = ITEM_TYPES[it.type] || ITEM_TYPES.other;
  return t.details.map(f => (it.details || {})[f.key]).filter(Boolean).join(', ');
}
function typeChip(type) {
  const t = ITEM_TYPES[type] || ITEM_TYPES.other;
  return `<span class="type-chip" style="background:${t.color}" title="${esc(t.label)}">${t.code}</span>`;
}
function outcomeBadge(outcome) {
  return `<span class="badge b-${outcome}">${OUTCOME_LABEL[outcome] || outcome}</span>`;
}
function dueBadge(st) {
  if (!st.due) return '<span class="muted">—</span>';
  if (st.overdue) return `<span class="badge b-overdue">Overdue · ${fmtDate(st.due)}</span>`;
  if (st.dueSoon) return `<span class="badge b-due">Due ${fmtDate(st.due)}</span>`;
  return esc(fmtDate(st.due));
}

/* ---------- UI helpers ---------- */
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 2400);
}

function closeModal() { $('#modalRoot').innerHTML = ''; }

/* buttons: [{label, cls, onClick(modalEl) → return false to keep it open}] */
function openModal({ title, body, buttons = [], wide = false, onOpen }) {
  const root = $('#modalRoot');
  root.innerHTML = `<div class="backdrop"><div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
    <div class="modal-head"><h2>${esc(title)}</h2><button class="x" aria-label="Close">×</button></div>
    <div class="modal-body">${body}</div>
    <div class="modal-foot"></div></div></div>`;
  const m = $('.modal', root);
  $('.x', root).onclick = closeModal;
  $('.backdrop', root).addEventListener('mousedown', e => { if (e.target.classList.contains('backdrop')) closeModal(); });
  const foot = $('.modal-foot', root);
  const all = buttons.length ? buttons : [{ label: 'Close', onClick: () => true }];
  for (const b of all) {
    const el = document.createElement('button');
    el.className = 'btn ' + (b.cls || '');
    el.textContent = b.label;
    el.onclick = async () => { const r = b.onClick ? await b.onClick(m) : true; if (r !== false) closeModal(); };
    foot.appendChild(el);
  }
  const first = $('input, select, textarea', m);
  if (first) setTimeout(() => first.focus(), 30);
  m.addEventListener('keydown', e => {
    if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'file') {
      e.preventDefault();
      const primary = $('.modal-foot .primary', root);
      if (primary) primary.click();
    }
    if (e.key === 'Escape') closeModal();
  });
  if (onOpen) onOpen(m);
  return m;
}

function confirmBox(title, message, okLabel = 'Delete') {
  return new Promise(resolve => {
    openModal({
      title, body: `<p>${message}</p>`,
      buttons: [
        { label: 'Cancel', onClick: () => { resolve(false); return true; } },
        { label: okLabel, cls: 'primary', onClick: () => { resolve(true); return true; } }
      ]
    });
    $('.modal .x').addEventListener('click', () => resolve(false));
  });
}

function formValues(root) {
  const out = {};
  for (const el of $$('[name]', root)) {
    if (el.type === 'checkbox') out[el.name] = el.checked;
    else if (el.type === 'file') continue;
    else out[el.name] = el.value.trim();
  }
  return out;
}

function field(label, name, value = '', opts = {}) {
  const id = 'f-' + name.replace(/\W/g, '_') + '-' + Math.random().toString(36).slice(2, 6);
  let input;
  if (opts.type === 'select') {
    const options = (opts.options || []).map(o => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(v) === String(value) ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('');
    input = `<select id="${id}" name="${name}">${opts.blank !== false ? '<option value=""></option>' : ''}${options}</select>`;
  } else if (opts.type === 'textarea') {
    input = `<textarea id="${id}" name="${name}" placeholder="${esc(opts.placeholder || '')}">${esc(value)}</textarea>`;
  } else {
    input = `<input id="${id}" name="${name}" type="${opts.type || 'text'}" value="${esc(value)}" placeholder="${esc(opts.placeholder || '')}" ${opts.required ? 'required' : ''} ${opts.attrs || ''}>`;
  }
  return `<div class="field ${opts.cls || ''}"><label for="${id}">${esc(label)}${opts.required ? ' *' : ''}</label>${input}${opts.hint ? `<div class="small muted">${opts.hint}</div>` : ''}</div>`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(fr.result);
    fr.onerror = () => reject(fr.error);
    fr.readAsDataURL(file);
  });
}

async function compressImage(file, max = 1600, quality = 0.8) {
  const url = await readFileAsDataUrl(file);
  const img = await loadImage(url);
  if (!img) return null;
  const k = Math.min(1, max / Math.max(img.width, img.height));
  const c = document.createElement('canvas');
  c.width = Math.round(img.width * k);
  c.height = Math.round(img.height * k);
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', quality);
}

/* Logos: scaled to fit 600 × 300 px and kept as PNG so transparent backgrounds survive. */
async function resizeLogo(file) {
  const img = await loadImage(await readFileAsDataUrl(file));
  if (!img) return null;
  const k = Math.min(1, 600 / img.width, 300 / img.height);
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k));
  c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL('image/png');
}

async function hydratePhotos(root = document) {
  for (const img of $$('img[data-photo]', root)) {
    const src = await Store.getPhoto(img.dataset.photo);
    if (src) img.src = src;
  }
}

function download(filename, text, type = 'application/json') {
  const blob = new Blob([text], { type });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
}

function csvCell(v) {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const k = keys[i];
    if (o[k] === undefined || o[k] === null) o[k] = /^\d+$/.test(keys[i + 1]) ? [] : {};
    o = o[k];
  }
  o[keys[keys.length - 1]] = value;
}
function getPath(obj, path) {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

/* ---------- Print overlay (reports & labels) ---------- */
function showPrint(html, { title = 'Compliance Plus', extraClass = '' } = {}) {
  const area = $('#printArea');
  area.innerHTML = `<div class="print-bar"><button class="btn" id="printBack">← Back</button>
    <span>${esc(title)}</span><button class="btn primary" id="printGo">Print / Save As PDF</button></div>
    <div class="${extraClass}">${html}</div>`;
  document.body.classList.add('printing');
  const oldTitle = document.title;
  document.title = title;
  window.scrollTo(0, 0);
  $('#printGo').onclick = () => window.print();
  $('#printBack').onclick = () => {
    document.body.classList.remove('printing');
    area.innerHTML = '';
    document.title = oldTitle;
  };
}

/* ---------- Cascading deletes ---------- */
function deleteItemCascade(itemId) {
  for (const x of Store.list('inspections').filter(x => x.itemId === itemId)) {
    (x.photos || []).forEach(p => Store.deletePhoto(p));
    Store.remove('inspections', x.id);
  }
  Store.remove('items', itemId);
  invalidateState();
}
function deleteSiteCascade(siteId) {
  const site = Store.get('sites', siteId);
  for (const it of Store.list('items').filter(i => i.siteId === siteId)) deleteItemCascade(it.id);
  for (const a of Store.list('assessments').filter(a => a.siteId === siteId)) Store.remove('assessments', a.id);
  for (const f of (site && site.floors) || []) if (f.bg && f.bg.photoId) Store.deletePhoto(f.bg.photoId);
  Store.remove('sites', siteId);
}
function deleteClientCascade(clientId) {
  for (const s of Store.list('sites').filter(s => s.clientId === clientId)) deleteSiteCascade(s.id);
  Store.remove('clients', clientId);
}
