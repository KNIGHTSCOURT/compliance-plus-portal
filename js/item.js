'use strict';

/* Compliance Plus — items (anything with a QR label) and inspections. */

function detailFieldsHtml(type, details = {}) {
  const t = ITEM_TYPES[type] || ITEM_TYPES.other;
  return `<div class="grid2">${t.details.map(f => field(f.label, 'd_' + f.key, details[f.key] || '', { type: f.type === 'select' ? 'select' : 'text', options: f.options, placeholder: f.placeholder })).join('')}</div>`;
}

function readDetails(root, type) {
  const v = formValues(root);
  const out = {};
  for (const f of (ITEM_TYPES[type] || ITEM_TYPES.other).details) if (v['d_' + f.key]) out[f.key] = v['d_' + f.key];
  return out;
}

function itemForm(preset, after) {
  const it = preset.id ? preset : Object.assign({ details: {} }, preset);
  const site = Store.get('sites', it.siteId);
  const floors = [...(site.floors || [])].sort((a, b) => (a.level || 0) - (b.level || 0));
  const roomOpts = floorId => {
    const f = floors.find(x => x.id === floorId);
    return [['', '— Not In A Room —'], ...((f && f.rooms) || []).map(r => [r.id, r.name])];
  };
  openModal({
    title: it.id ? `Edit ${it.ref}` : `Add ${(ITEM_TYPES[it.type] || ITEM_TYPES.other).label}`,
    wide: true,
    body: `<div class="grid2">
        ${field('Item Type', 'type', it.type, { type: 'select', blank: false, options: Object.entries(ITEM_TYPES).map(([k, t]) => [k, t.label]) })}
        ${field('Short Description', 'name', it.name, { placeholder: 'e.g. Door To Office G1, Kettle In Staff Room' })}
      </div>
      <div class="grid3">
        ${field('Floor', 'floorId', it.floorId, { type: 'select', blank: false, options: floors.map(f => [f.id, f.name]) })}
        <div id="roomWrap">${field('Room', 'roomId', it.roomId || '', { type: 'select', blank: false, options: roomOpts(it.floorId) })}</div>
        ${field('Location Detail', 'locationNote', it.locationNote, { placeholder: 'e.g. Left of stair door, 2nd from window' })}
      </div>
      <h3>Item Details</h3>
      <div id="detailWrap">${detailFieldsHtml(it.type, it.details)}</div>
      ${field('Notes', 'notes', it.notes, { type: 'textarea' })}
      ${it.id ? '' : '<p class="small muted">A reference number and QR code are created when you save.</p>'}`,
    onOpen: m => {
      $('[name=type]', m).onchange = e => { $('#detailWrap', m).innerHTML = detailFieldsHtml(e.target.value, it.details); };
      $('[name=floorId]', m).onchange = e => { $('#roomWrap', m).innerHTML = field('Room', 'roomId', '', { type: 'select', blank: false, options: roomOpts(e.target.value) }); };
    },
    buttons: [
      { label: 'Cancel' },
      ...(!it.id ? [{ label: 'Save & Inspect Now', onClick: m => { const rec = save(m); if (rec) go(`#/inspect/${rec.id}`); return !!rec; } }] : []),
      { label: it.id ? 'Save' : 'Save Item', cls: 'primary', onClick: m => { const rec = save(m); if (rec && after) after(rec); return !!rec; } }
    ]
  });
  function save(m) {
    const v = formValues(m);
    const floorChanged = it.id && v.floorId !== it.floorId;
    Object.assign(it, { type: v.type, name: v.name, floorId: v.floorId, roomId: v.roomId || null, locationNote: v.locationNote, notes: v.notes, details: readDetails(m, v.type) });
    if (floorChanged) { it.x = null; it.y = null; }
    if (!it.ref) it.ref = Store.nextRef();
    if (it.x === undefined) it.x = null;
    const rec = Store.upsert('items', it);
    toast(`${rec.ref} saved`);
    return rec;
  }
}

async function viewItem(id) {
  const it = Store.get('items', id);
  if (!it) return notFound();
  const site = siteOf(it), client = site ? Store.get('clients', site.clientId) : null;
  setCrumbs([['Clients & Sites', '#/clients'], [client ? client.name : 'Client', client ? `#/client/${client.id}` : ''], [site ? site.name : 'Site', site ? `#/site/${site.id}/items` : ''], [it.ref]]);
  const st = itemState(it);
  const t = ITEM_TYPES[it.type] || ITEM_TYPES.other;
  const history = inspectionsFor(id);
  const url = itemQrUrl(it);
  $('#view').innerHTML = `
    <div class="spread"><div><div class="row">${typeChip(it.type)}<h1 style="margin:0">${esc(it.ref)}</h1>${outcomeBadge(st.outcome)}${it.archived ? '<span class="badge b-untested">Archived</span>' : ''}</div>
      <div class="muted mt">${esc(itemTitle(it))} · ${esc(locationText(it))}</div></div>
      <div class="row"><a class="btn primary staff-only" href="#/inspect/${id}">Inspect Now</a><button class="btn staff-only" id="editItem">Edit</button><button class="btn" id="showPlan">Show On Plan</button><button class="btn danger staff-only" id="delItem">Delete</button></div></div>
    <div class="grid2 mt" style="align-items:start">
      <div>
        <div class="card"><h3>Status</h3><div class="kv">
          <div>Result</div><div>${outcomeBadge(st.outcome)}${st.last && st.last.fd ? ` <b class="small">${esc(st.last.fd.result)}</b>` : ''}</div>
          <div>Last Inspected</div><div>${st.last ? `${esc(fmtDate(st.last.date))} by ${esc(st.last.inspector || '—')}` : 'Never'}</div>
          <div>Next Due</div><div>${dueBadge(st)}</div>
          ${st.last && st.last.action ? `<div>Action Needed</div><div>${esc(st.last.action)}</div>` : ''}
        </div></div>
        <div class="card"><h3>Details</h3><div class="kv">
          <div>Type</div><div>${esc(t.label)}</div>
          ${t.details.map(f => `<div>${esc(f.label)}</div><div>${esc((it.details || {})[f.key] || '—')}</div>`).join('')}
          <div>Client</div><div>${esc(client ? client.name : '')}</div>
          <div>Location</div><div>${esc(locationText(it))}</div>
          ${it.notes ? `<div>Notes</div><div>${esc(it.notes)}</div>` : ''}
          <div>Label Printed</div><div>${esc(fmtDate(it.labelPrinted))}</div>
        </div></div>
      </div>
      <div>
        <div class="card qr-box"><h3>QR Code</h3><img id="qrImg" alt="QR code"><div class="small muted" style="word-break:break-all">${esc(url)}</div>
          <div class="row mt" style="justify-content:center"><button class="btn small staff-only" id="printLabel">Print Label</button><button class="btn small" id="copyLink">Copy Link</button></div></div>
        <div class="card"><h3>Plan</h3><div id="planImg" class="muted small">${it.x == null ? 'Not placed on a plan yet — use <b>Show On Plan</b>, then <b>Place</b>.' : ''}</div></div>
      </div>
    </div>
    <div class="card"><h3>Inspection History</h3>
      ${history.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Date</th><th>Inspector</th><th>Result</th><th>Defects / Notes</th><th>Next Due</th><th>Photos</th><th></th></tr></thead><tbody>
        ${history.map(h => `<tr ${Cloud.isClient() ? '' : `class="click" data-href="#/inspect/${id}/${h.id}"`}><td>${esc(fmtDate(h.date))}</td><td>${esc(h.inspector || '')}</td><td>${outcomeBadge(h.outcome)}</td>
          <td class="small">${esc([failedChecksText(it, h).join('; '), h.notes].filter(Boolean).join(' — '))}</td><td>${esc(fmtDate(h.nextDue))}</td><td>${(h.photos || []).length || ''}</td>
          <td>${h.fd ? `<div class="row" style="flex-wrap:nowrap"><button class="btn small" data-fdprint="${h.id}" data-kind="record">Record</button><button class="btn small" data-fdprint="${h.id}" data-kind="client">Client Report</button></div>` : ''}</td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">No inspections recorded yet.</p>'}
    </div>`;
  bindRowLinks();
  $$('[data-fdprint]').forEach(b => b.onclick = e => { e.stopPropagation(); fdPrint(it, Store.get('inspections', b.dataset.fdprint), b.dataset.kind); });
  $('#qrImg').src = await qrDataUrl(url, 400);
  $('#editItem').onclick = () => itemForm(it, () => viewItem(id));
  $('#showPlan').onclick = () => {
    const ui = siteUI[it.siteId] || (siteUI[it.siteId] = { view: '2d', mode: 'select', addType: it.type, scope: 'all', explode: 2.2 });
    ui.floorId = it.floorId; ui.selected = { kind: 'item', id }; ui.view = '2d';
    go(`#/site/${it.siteId}/plan`);
  };
  $('#copyLink').onclick = () => { navigator.clipboard.writeText(url).then(() => toast('Link copied')); };
  $('#printLabel').onclick = () => {
    openModal({
      title: 'Print Label',
      body: `${field('Label Sheet', 'layout', 'L7160', { type: 'select', blank: false, options: Object.entries(LABEL_LAYOUTS).map(([k, l]) => [k, l.name]) })}
        ${field('Print On Label No.', 'start', 1, { type: 'number', attrs: 'min="1"', hint: 'Counting across then down — so you can use up a part-used sheet' })}
        <label class="row" style="color:inherit"><input type="checkbox" name="withResult" style="width:auto" ${st.last ? 'checked' : ''}> Show last result and next due date</label>`,
      buttons: [{ label: 'Cancel' }, { label: 'Print', cls: 'primary', onClick: async m => {
        const v = formValues(m);
        const html = await buildLabelSheets([it], v.layout, Number(v.start) || 1, { locationOf: x => locationText(x, true), stateOf: itemState, withResult: v.withResult });
        it.labelPrinted = today(); Store.upsert('items', it);
        showPrint(`<div class="labels-sheet">${html}</div>`, { title: `${it.ref} Label`, extraClass: 'screen-outline' });
      } }]
    });
  };
  $('#delItem').onclick = async () => {
    if (await confirmBox('Delete Item', `Delete <b>${esc(it.ref)}</b> and its ${history.length} inspection records? Its QR label will stop working.`)) {
      deleteItemCascade(id); toast('Item deleted'); go(`#/site/${it.siteId}/items`);
    }
  };
  if (it.x != null) {
    const f = floorOf(it);
    if (f) {
      const bg = f.bg && f.bg.photoId ? await loadImage(await Store.getPhoto(f.bg.photoId)) : null;
      const items = Store.list('items').filter(i => i.floorId === f.id && !i.archived);
      const src = renderPlanImage(f, items, { bgImg: bg, statusOf: x => itemState(x).outcome, highlightId: id, width: 900, height: 600, showCodes: false });
      const box = $('#planImg');
      if (box) box.innerHTML = `<img src="${src}" style="width:100%;border:1px solid var(--line);border-radius:8px" alt=""><div class="small muted">${esc(f.name)} — this item is circled.</div>`;
    }
  }
}

/* ---------- Inspection form ---------- */
function viewInspect(itemId, inspId) {
  const it = Store.get('items', itemId);
  if (!it) return notFound();
  const old = inspId ? Store.get('inspections', inspId) : null;
  if (it.type === 'fire-door' && (!old || old.fd)) return viewFireDoorInspect(itemId, inspId);
  const site = siteOf(it);
  const t = ITEM_TYPES[it.type] || ITEM_TYPES.other;
  const existing = inspId ? Store.get('inspections', inspId) : null;
  const insp = existing ? JSON.parse(JSON.stringify(existing)) : {
    itemId, siteId: it.siteId, type: it.type, date: today(), inspector: Store.settings.assessorName || '',
    answers: {}, readings: {}, photos: [], notes: '', action: '', outcome: '', intervalMonths: t.interval, nextDue: addMonths(today(), t.interval)
  };
  const details = JSON.parse(JSON.stringify(it.details || {}));
  const removedPhotos = [];
  let outcomeManual = !!existing;
  let dueManual = !!existing;
  setCrumbs([['Clients & Sites', '#/clients'], [site ? site.name : 'Site', site ? `#/site/${site.id}/items` : ''], [it.ref, `#/item/${itemId}`], [existing ? 'Edit Inspection' : 'Inspect']]);

  function suggested() {
    if (t.checks.some(c => (insp.answers[c.key] || {}).v === 'fail')) return 'fail';
    if (t.readings.some(r => evaluateReading(r, insp.readings[r.key], details) === 'fail')) return 'fail';
    return 'pass';
  }

  function segBtns(group, value, opts) {
    return `<div class="seg" data-group="${group}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${value === v ? 'on-' + v : ''}">${l}</button>`).join('')}</div>`;
  }

  function render() {
    const answered = t.checks.filter(c => insp.answers[c.key] && insp.answers[c.key].v).length;
    if (!outcomeManual) insp.outcome = suggested();
    $('#view').innerHTML = `
      <div class="spread"><div><div class="row">${typeChip(it.type)}<h1 style="margin:0">${esc(it.ref)}</h1></div>
        <div class="muted">${esc(itemTitle(it))} · ${esc(locationText(it))}</div></div>
        <a class="btn" href="#/item/${itemId}">Cancel</a></div>
      <div class="card mt"><div class="grid3">
        ${field('Inspection Date', 'date', insp.date, { type: 'date' })}
        ${field('Inspected By', 'inspector', insp.inspector)}
        <div class="field"><label>Progress</label><div style="padding-top:8px"><b>${answered}</b> of ${t.checks.length} checks answered</div></div>
      </div>
      <details ${Object.keys(details).length ? '' : 'open'}><summary class="small" style="cursor:pointer;font-weight:600">Item Details (${esc(detailSummary({ type: it.type, details }) || 'not filled in')})</summary>
        <div class="mt" id="detailBox">${detailFieldsHtml(it.type, details)}</div></details></div>

      <div class="card"><div class="spread"><h2 style="margin:0">Checklist</h2><button class="btn small" id="allPass">Mark Unanswered As Pass</button></div>
        ${t.checks.map(c => {
          const a = insp.answers[c.key] || {};
          return `<div class="check-row"><div><div class="q">${esc(c.q)}</div>${c.help ? `<div class="help">${esc(c.help)}</div>` : ''}</div>
            ${segBtns('a:' + c.key, a.v, [['pass', 'Pass'], ['fail', 'Fail'], ['na', 'N/A']])}
            ${a.v === 'fail' || a.note ? `<input class="note" data-note="${c.key}" placeholder="Describe the defect…" value="${esc(a.note || '')}">` : ''}</div>`;
        }).join('')}
      </div>

      ${t.readings.length ? `<div class="card"><h2>Readings</h2><div class="grid2">
        ${t.readings.map(r => {
          const val = insp.readings[r.key] ?? '';
          const ev = evaluateReading(r, val, details);
          if (r.type === 'passfail') return `<div class="field"><label>${esc(r.label)}</label>${segBtns('r:' + r.key, val, [['pass', 'Pass'], ['fail', 'Fail'], ['na', 'N/A']])}</div>`;
          return `<div class="field"><label>${esc(r.label)} (${esc(r.unit)})</label><input type="number" step="any" inputmode="decimal" data-reading="${r.key}" value="${esc(val)}" class="${ev === 'fail' ? 'reading-bad' : ''}">
            <div class="small muted">${esc(readingLimitText(r, details))}${ev === 'fail' ? ' — <b style="color:var(--fail)">Outside Limit</b>' : ev === 'pass' ? ' — <b style="color:var(--pass)">OK</b>' : ''}</div></div>`;
        }).join('')}</div></div>` : ''}

      <div class="card"><h2>Photos</h2>
        <div class="photos" id="photoList">${insp.photos.map(p => `<div class="ph"><img data-photo="${p}" alt=""><button data-rm="${p}" aria-label="Remove">×</button></div>`).join('')}</div>
        <label class="btn mt" style="display:inline-flex;color:inherit;font-size:inherit">+ Add Photos<input type="file" id="photoIn" accept="image/*" capture="environment" multiple hidden></label>
      </div>

      <div class="card"><h2>Result</h2>
        ${field('Notes', 'notes', insp.notes, { type: 'textarea' })}
        ${field('Recommended Action', 'action', insp.action, { type: 'textarea', placeholder: 'What needs doing to put this right (shown in the client report)' })}
        <div class="field"><label>Outcome ${!outcomeManual ? '(Set Automatically From The Checklist)' : ''}</label>
          ${segBtns('outcome', insp.outcome, [['pass', 'Satisfactory'], ['advisory', 'Advisory'], ['fail', 'Defective']])}
          ${outcomeManual && insp.outcome !== suggested() ? `<div class="small muted mt">Checklist suggests: <b>${OUTCOME_LABEL[suggested()]}</b></div>` : ''}</div>
        <div class="grid2">
          ${field('Re-Inspect Every', 'intervalMonths', insp.intervalMonths, { type: 'select', blank: false, options: [[1, '1 Month'], [3, '3 Months'], [6, '6 Months'], [12, '12 Months'], [24, '24 Months'], [36, '36 Months'], [48, '48 Months']] })}
          ${field('Next Due', 'nextDue', insp.nextDue, { type: 'date' })}
        </div>
      </div>
      <div class="sticky-actions">
        ${existing ? '<button class="btn danger" id="delInsp">Delete Inspection</button>' : ''}
        <button class="btn" id="saveNext">Save &amp; Next Item</button>
        <button class="btn primary" id="saveInsp">Save Inspection</button>
      </div>`;
    hydratePhotos($('#photoList'));
    bind();
  }

  function keepScroll(fn) { const y = window.scrollY; fn(); window.scrollTo(0, y); }

  function bind() {
    const v = $('#view');
    $('[name=date]', v).onchange = e => { insp.date = e.target.value; if (!dueManual) insp.nextDue = addMonths(insp.date, insp.intervalMonths); keepScroll(render); };
    $('[name=inspector]', v).oninput = e => { insp.inspector = e.target.value; };
    $('[name=notes]', v).oninput = e => { insp.notes = e.target.value; };
    $('[name=action]', v).oninput = e => { insp.action = e.target.value; };
    $('[name=intervalMonths]', v).onchange = e => { insp.intervalMonths = Number(e.target.value); dueManual = false; insp.nextDue = addMonths(insp.date, insp.intervalMonths); keepScroll(render); };
    $('[name=nextDue]', v).onchange = e => { insp.nextDue = e.target.value; dueManual = true; };
    $$('#detailBox select, #detailBox input', v).forEach(el => el.onchange = () => {
      const key = el.name.slice(2);
      if (el.value) details[key] = el.value.trim(); else delete details[key];
      keepScroll(render);
      const d = $('#view details'); if (d) d.open = true;
    });
    $$('.seg[data-group]', v).forEach(seg => {
      const g = seg.dataset.group;
      $$('button', seg).forEach(b => b.onclick = () => {
        const val = b.dataset.v;
        if (g === 'outcome') { insp.outcome = val; outcomeManual = true; }
        else if (g.startsWith('a:')) {
          const k = g.slice(2);
          const a = insp.answers[k] || (insp.answers[k] = {});
          a.v = a.v === val ? '' : val;
        } else if (g.startsWith('r:')) insp.readings[g.slice(2)] = insp.readings[g.slice(2)] === val ? '' : val;
        keepScroll(render);
        if (g.startsWith('a:') && val === 'fail') { const n = $(`[data-note="${g.slice(2)}"]`); if (n) n.focus(); }
      });
    });
    $$('[data-note]', v).forEach(el => el.oninput = () => { (insp.answers[el.dataset.note] || (insp.answers[el.dataset.note] = {})).note = el.value; });
    $$('[data-reading]', v).forEach(el => el.onchange = () => { insp.readings[el.dataset.reading] = el.value; keepScroll(render); });
    $('#allPass').onclick = () => { for (const c of t.checks) { const a = insp.answers[c.key] || (insp.answers[c.key] = {}); if (!a.v) a.v = 'pass'; } keepScroll(render); };
    $('#photoIn').onchange = async e => {
      for (const f of e.target.files) { const url = await compressImage(f, 1600, 0.8); if (url) insp.photos.push(await Store.putPhoto(url, (siteOf(it) || {}).clientId)); }
      keepScroll(render);
    };
    $$('[data-rm]', v).forEach(b => b.onclick = () => { insp.photos = insp.photos.filter(p => p !== b.dataset.rm); removedPhotos.push(b.dataset.rm); keepScroll(render); });
    $('#saveInsp').onclick = () => { if (save()) go(`#/item/${itemId}`); };
    $('#saveNext').onclick = () => {
      if (!save()) return;
      const siteItems = Store.list('items').filter(i => i.siteId === it.siteId && !i.archived).sort((a, b) => a.ref.localeCompare(b.ref));
      const idx = siteItems.findIndex(i => i.id === itemId);
      const next = siteItems.slice(idx + 1).concat(siteItems.slice(0, idx)).find(i => { const st = itemState(i); return !st.last || st.last.date !== insp.date; });
      if (next) go(`#/inspect/${next.id}`); else { toast('Every item on this site has been inspected today'); go(`#/site/${it.siteId}/items`); }
    };
    const del = $('#delInsp');
    if (del) del.onclick = async () => {
      if (await confirmBox('Delete Inspection', 'Delete this inspection record and its photos?')) {
        (existing.photos || []).forEach(p => Store.deletePhoto(p));
        Store.remove('inspections', existing.id); invalidateState(); go(`#/item/${itemId}`);
      }
    };
  }

  function save() {
    const unanswered = t.checks.filter(c => !(insp.answers[c.key] || {}).v).length;
    if (unanswered === t.checks.length && !t.readings.some(r => insp.readings[r.key])) { toast('Answer the checklist before saving'); return false; }
    if (!insp.outcome) insp.outcome = suggested();
    it.details = details;
    Store.upsert('items', it);
    Store.upsert('inspections', Object.assign(existing || {}, insp));
    removedPhotos.forEach(p => Store.deletePhoto(p));
    invalidateState();
    toast(`${it.ref} — ${OUTCOME_LABEL[insp.outcome]}${unanswered ? ` (${unanswered} checks left blank)` : ''}`);
    return true;
  }

  render();
}
