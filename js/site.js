'use strict';

/* Compliance Plus — clients, sites and the site workspace
   (plan & 3D, item register, risk assessments, reports & labels). */

const siteUI = {};

/* ---------- Clients ---------- */
function clientForm(c = {}, after) {
  openModal({
    title: c.id ? 'Edit Client' : 'New Client',
    body: `${field('Client / Company Name', 'name', c.name, { required: true })}
      <div class="grid2">${field('Contact Name', 'contact', c.contact)}${field('Phone', 'phone', c.phone, { type: 'tel' })}</div>
      ${field('Email', 'email', c.email, { type: 'email' })}
      ${field('Address', 'address', c.address, { type: 'textarea' })}
      ${field('Notes', 'notes', c.notes, { type: 'textarea' })}`,
    buttons: [
      { label: 'Cancel' },
      { label: 'Save Client', cls: 'primary', onClick: m => {
        const v = formValues(m);
        if (!v.name) { toast('Enter the client name'); return false; }
        const rec = Store.upsert('clients', Object.assign(c, v));
        toast('Client saved');
        after ? after(rec) : go(`#/client/${rec.id}`);
      } }
    ]
  });
}

function clientStats(clientId) {
  const sites = Store.list('sites').filter(s => s.clientId === clientId);
  const ids = new Set(sites.map(s => s.id));
  const items = Store.list('items').filter(i => ids.has(i.siteId) && !i.archived);
  return {
    sites, items,
    defects: items.filter(i => itemState(i).outcome === 'fail').length,
    overdue: items.filter(i => itemState(i).overdue).length
  };
}

function viewClients() {
  setCrumbs([['Clients & Sites']]);
  const clients = [...Store.list('clients')].sort((a, b) => a.name.localeCompare(b.name));
  $('#view').innerHTML = `
    <div class="spread mb"><h1>Clients &amp; Sites</h1><button class="btn primary" id="addClient">+ New Client</button></div>
    ${clients.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Client</th><th>Contact</th><th>Sites</th><th>Items</th><th>Defects</th><th>Overdue</th></tr></thead><tbody>
      ${clients.map(c => { const st = clientStats(c.id); return `<tr class="click" data-href="#/client/${c.id}">
        <td><b>${esc(c.name)}</b>${c.demo ? ' <span class="badge b-untested">Demo</span>' : ''}</td><td>${esc(c.contact || '')}<div class="small muted">${esc(c.email || '')}</div></td>
        <td>${st.sites.length}</td><td>${st.items.length}</td>
        <td>${st.defects ? `<span class="badge b-fail">${st.defects}</span>` : '0'}</td>
        <td>${st.overdue ? `<span class="badge b-overdue">${st.overdue}</span>` : '0'}</td></tr>`; }).join('')}
      </tbody></table></div>` : `<div class="card empty"><h3>No Clients Yet</h3><p>Add your first client, then add their sites (buildings).</p></div>`}`;
  $('#addClient').onclick = () => clientForm();
  bindRowLinks();
}

function viewClient(id) {
  const c = Store.get('clients', id);
  if (!c) return notFound();
  setCrumbs([['Clients & Sites', '#/clients'], [c.name]]);
  const st = clientStats(id);
  $('#view').innerHTML = `
    <div class="spread"><div><h1>${esc(c.name)}</h1><div class="muted">${esc([c.contact, c.phone, c.email].filter(Boolean).join(' · '))}</div></div>
      <div class="row staff-only"><button class="btn" id="editClient">Edit</button><button class="btn danger" id="delClient">Delete</button><button class="btn primary" id="addSite">+ New Site</button></div></div>
    ${c.address || c.notes ? `<div class="card mt"><div class="kv"><div>Address</div><div>${esc(c.address || '—')}</div><div>Notes</div><div>${esc(c.notes || '—')}</div></div></div>` : ''}
    <h2 class="mt">Sites</h2>
    ${st.sites.length ? `<div class="cards">${st.sites.map(s => {
      const items = st.items.filter(i => i.siteId === s.id);
      const d = items.filter(i => itemState(i).outcome === 'fail').length;
      const o = items.filter(i => itemState(i).overdue).length;
      return `<div class="tile link-card" data-href="#/site/${s.id}"><h3>${esc(s.name)}</h3>
        <div class="small muted">${esc([s.address, s.postcode].filter(Boolean).join(', '))}</div>
        <div class="row mt small"><span>${(s.floors || []).length} Floor${(s.floors || []).length === 1 ? '' : 's'}</span><span>· ${items.length} Items</span>
        ${d ? `<span class="badge b-fail">${d} Defects</span>` : ''}${o ? `<span class="badge b-overdue">${o} Overdue</span>` : ''}</div></div>`;
    }).join('')}</div>` : `<div class="card empty"><h3>No Sites Yet</h3><p>A site is a building or premises you inspect for this client.</p></div>`}
    <div class="card staff-only cloud-only mt"><div class="spread"><h2 style="margin:0">Client Portal Logins</h2><button class="btn" id="inviteClient">+ Invite Login</button></div>
      <p class="small muted">People at ${esc(c.name)} who can sign in to see their sites, plans, results and reports (view only).</p>
      <div id="clientLogins" class="small muted">Loading…</div></div>`;
  if (Cloud.isStaff()) {
    const box = $('#clientLogins');
    renderLoginList(box, { clientId: id });
    $('#inviteClient').onclick = () => inviteModal('client', c, () => renderLoginList(box, { clientId: id }));
  }
  if (Cloud.isClient()) setCrumbs([[c.name]]);
  $('#editClient').onclick = () => clientForm(c, () => viewClient(id));
  $('#addSite').onclick = () => siteForm(id);
  $('#delClient').onclick = async () => {
    if (await confirmBox('Delete Client', `Delete <b>${esc(c.name)}</b> with all ${st.sites.length} sites, ${st.items.length} items and their inspection records? This cannot be undone.`)) {
      deleteClientCascade(id); toast('Client deleted'); go('#/clients');
    }
  };
  bindRowLinks();
}

/* ---------- Sites ---------- */
function siteForm(clientId, s = {}) {
  openModal({
    title: s.id ? 'Edit Site' : 'New Site',
    body: `${field('Site / Building Name', 'name', s.name, { required: true })}
      <div class="grid2">${field('Address', 'address', s.address)}${field('Postcode', 'postcode', s.postcode)}</div>
      <div class="grid2">${field('Use Of Building', 'buildingUse', s.buildingUse, { placeholder: 'e.g. Offices, Block Of Flats, Care Home' })}${field('Responsible Person', 'responsiblePerson', s.responsiblePerson)}</div>
      ${field('Access Notes', 'accessNotes', s.accessNotes, { type: 'textarea', placeholder: 'Keys, alarm codes held elsewhere, parking, contact on arrival' })}
      ${field('Notes', 'notes', s.notes, { type: 'textarea' })}`,
    buttons: [
      { label: 'Cancel' },
      { label: 'Save Site', cls: 'primary', onClick: m => {
        const v = formValues(m);
        if (!v.name) { toast('Enter the site name'); return false; }
        const isNew = !s.id;
        Object.assign(s, v, { clientId });
        if (!s.floors || !s.floors.length) s.floors = [{ id: Store.uid(), name: 'Ground Floor', level: 0, height: 2.6, rooms: [] }];
        const rec = Store.upsert('sites', s);
        toast('Site saved');
        if (isNew) go(`#/site/${rec.id}/plan`); else router();
      } }
    ]
  });
}

function viewSite(id, tab = 'plan') {
  const site = Store.get('sites', id);
  if (!site) return notFound();
  const client = Store.get('clients', site.clientId) || { name: 'Client' };
  setCrumbs([['Clients & Sites', '#/clients'], [client.name, `#/client/${client.id}`], [site.name]]);
  const tabs = [['plan', 'Plan & 3D'], ['items', 'Items'], ['systems', 'Fire Systems'], ['assess', 'Assessments & Checks'], ['reports', 'Reports & QR Labels']];
  $('#view').innerHTML = `
    <div class="spread"><div><h1>${esc(site.name)}</h1>
      <div class="muted">${esc([site.address, site.postcode].filter(Boolean).join(', '))}${site.buildingUse ? ' · ' + esc(site.buildingUse) : ''}</div></div>
      <div class="row staff-only"><button class="btn" id="editSite">Edit Site</button><button class="btn danger" id="delSite">Delete</button></div></div>
    <nav class="tabs">${tabs.map(([k, l]) => `<a href="#/site/${id}/${k}" class="${tab === k ? 'active' : ''}">${l}</a>`).join('')}</nav>
    <div id="tabBody"></div>`;
  $('#editSite').onclick = () => siteForm(site.clientId, site);
  $('#delSite').onclick = async () => {
    const n = Store.list('items').filter(i => i.siteId === id).length;
    if (await confirmBox('Delete Site', `Delete <b>${esc(site.name)}</b>, its plans, ${n} items and all inspection records? This cannot be undone.`)) {
      deleteSiteCascade(id); toast('Site deleted'); go(`#/client/${site.clientId}`);
    }
  };
  const body = $('#tabBody');
  if (tab === 'items') renderItemsTab(site, body);
  else if (tab === 'assess') renderAssessTab(site, body);
  else if (tab === 'systems') renderSystemsTab(site, body);
  else if (tab === 'reports') renderReportsTab(site, body);
  else renderPlanTab(site, body);
}

/* ---------- Plan & 3D tab ---------- */
function floorForm(site, floor, after) {
  const isNew = !floor;
  floor = floor || { id: Store.uid(), name: '', level: (site.floors || []).length, height: 2.6, rooms: [] };
  const hasItems = Store.list('items').some(i => i.floorId === floor.id);
  openModal({
    title: isNew ? 'Add Floor' : 'Floor Settings',
    body: `${field('Floor Name', 'name', floor.name, { required: true, placeholder: 'e.g. First Floor, Basement, Roof' })}
      <div class="grid2">${field('Level (0 = Ground, -1 = Basement)', 'level', floor.level, { type: 'number' })}${field('Ceiling Height (m)', 'height', floor.height, { type: 'number', attrs: 'step="0.1" min="1.8"' })}</div>
      ${floor.bg && floor.bg.photoId ? `<h3>Plan Drawing</h3>
        <div class="grid3">${field('Drawing Width (m)', 'bgWidth', (+floor.bg.widthM).toFixed(2), { type: 'number', attrs: 'step="0.01"' })}
        ${field('Opacity (0–1)', 'bgOpacity', floor.bg.opacity ?? 0.6, { type: 'number', attrs: 'step="0.1" min="0.1" max="1"' })}
        <div class="field"><label>&nbsp;</label><label class="row" style="color:inherit"><input type="checkbox" name="bgRemove" style="width:auto"> Remove Drawing</label></div></div>
        <p class="small muted">Tip: use <b>Set Scale</b> on the plan to calibrate the drawing from a known measurement.</p>` : ''}`,
    buttons: [
      ...(!isNew ? [{ label: 'Delete Floor', cls: 'danger', onClick: async () => {
        if (hasItems) { toast('Move or delete the items on this floor first'); return false; }
        if (!(await confirmBox('Delete Floor', `Delete <b>${esc(floor.name)}</b> and its rooms?`))) return true;
        site.floors = site.floors.filter(f => f.id !== floor.id);
        if (floor.bg && floor.bg.photoId) Store.deletePhoto(floor.bg.photoId);
        Store.upsert('sites', site); after && after(null); return true;
      } }] : []),
      { label: 'Cancel' },
      { label: isNew ? 'Add Floor' : 'Save', cls: 'primary', onClick: m => {
        const v = formValues(m);
        if (!v.name) { toast('Enter a floor name'); return false; }
        floor.name = v.name; floor.level = Number(v.level) || 0; floor.height = Number(v.height) || 2.6;
        if (floor.bg && floor.bg.photoId) {
          if (v.bgRemove) { Store.deletePhoto(floor.bg.photoId); delete floor.bg; }
          else { floor.bg.widthM = Number(v.bgWidth) || floor.bg.widthM; floor.bg.opacity = Math.min(1, Math.max(0.1, Number(v.bgOpacity) || 0.6)); }
        }
        if (isNew) site.floors.push(floor);
        Store.upsert('sites', site);
        after && after(floor);
      } }
    ]
  });
}

async function renderPlanTab(site, root) {
  runCleanups();
  if (!site.floors || !site.floors.length) { site.floors = [{ id: Store.uid(), name: 'Ground Floor', level: 0, height: 2.6, rooms: [] }]; Store.upsert('sites', site); }
  const ui = siteUI[site.id] || (siteUI[site.id] = { floorId: null, view: '2d', mode: 'select', addType: 'fire-door', scope: 'all', explode: 2.2, selected: null });
  const floors = [...site.floors].sort((a, b) => (a.level || 0) - (b.level || 0));
  if (!floors.find(f => f.id === ui.floorId)) ui.floorId = floors[0].id;
  const floor = site.floors.find(f => f.id === ui.floorId);
  const siteItems = () => Store.list('items').filter(i => i.siteId === site.id && !i.archived);
  const floorItems = () => siteItems().filter(i => i.floorId === floor.id && i.x != null);
  const typeOpts = Object.entries(ITEM_TYPES).map(([k, t]) => `<option value="${k}" ${ui.addType === k ? 'selected' : ''}>${esc(t.label)}</option>`).join('');

  root.innerHTML = `
    <div class="plan-toolbar">
      <div class="floor-chips">${floors.map(f => `<button class="btn small ${f.id === floor.id ? 'active' : ''}" data-floor="${f.id}">${esc(f.name)}</button>`).join('')}</div>
      <button class="btn small staff-only" id="addFloor">+ Floor</button>
      <button class="btn small staff-only" id="floorSettings">Floor Settings</button>
      <span style="flex:1"></span>
      <div class="seg"><button data-view="2d" class="${ui.view === '2d' ? 'on-pass' : ''}">2D Plan</button><button data-view="3d" class="${ui.view === '3d' ? 'on-pass' : ''}">3D View</button></div>
    </div>
    <div class="plan-toolbar" id="modeBar">
      ${ui.view === '2d' ? `
        <div class="seg staff-only">
          <button data-mode="select">Select / Move</button>
          <button data-mode="room">Draw Room</button>
          <button data-mode="item">Add Item</button>
          ${floor.bg ? '<button data-mode="measure">Set Scale</button>' : ''}
        </div>
        <select id="addType" class="staff-only" style="width:auto">${typeOpts}</select>
        <button class="btn small staff-only" id="uploadBg">${floor.bg ? 'Replace Drawing' : 'Upload Client Drawing'}</button>
        <input type="file" id="bgFile" accept="image/*" hidden>
        <button class="btn small" id="zoomIn">+</button><button class="btn small" id="zoomOut">−</button><button class="btn small" id="fit">Fit</button>`
      : `
        <div class="seg"><button data-scope="all">All Floors</button><button data-scope="floor">This Floor</button></div>
        <label class="row small" style="margin:0">Spacing <input type="range" id="explode" min="1" max="4" step="0.1" value="${ui.explode}" style="width:110px"></label>
        <button class="btn small" id="view3d">3D View</button><button class="btn small" id="viewTop">Top View</button>`}
    </div>
    <div class="plan-layout">
      <div>
        <div class="plan-stage" id="stage"><div class="plan-hint" id="hint"></div></div>
        <div class="legend mt">
          <span><i style="background:${STATUS_COLORS.pass}"></i>Satisfactory</span><span><i style="background:${STATUS_COLORS.fail}"></i>Defective</span>
          <span><i style="background:${STATUS_COLORS.advisory}"></i>Advisory</span><span><i style="background:${STATUS_COLORS.untested}"></i>Not Inspected</span>
          <span>· Outer ring = item type · Number = item ref</span>
        </div>
      </div>
      <div class="plan-side" id="side"></div>
    </div>`;

  $$('[data-floor]', root).forEach(b => b.onclick = () => { ui.floorId = b.dataset.floor; ui.selected = null; renderPlanTab(site, root); });
  $('#addFloor').onclick = () => floorForm(site, null, f => { if (f) ui.floorId = f.id; renderPlanTab(site, root); });
  $('#floorSettings').onclick = () => floorForm(site, floor, () => renderPlanTab(site, root));
  $$('[data-view]', root).forEach(b => b.onclick = () => { ui.view = b.dataset.view; renderPlanTab(site, root); });

  const stage = $('#stage');
  const hint = $('#hint');
  const hints = {
    select: 'Tap a pin or room to select it. Drag to move it. Drag empty space to pan; scroll or pinch to zoom.',
    room: 'Drag out a rectangle to draw a room (snaps to 0.25 m).',
    item: 'Tap the plan where the item is to add it.',
    measure: 'Tap two points on the drawing that are a known distance apart (e.g. the ends of a dimension line).'
  };
  let bgImg = null;
  if (floor.bg && floor.bg.photoId) bgImg = await loadImage(await Store.getPhoto(floor.bg.photoId));

  const statusOf = it => itemState(it).outcome;

  function renderSide() {
    const side = $('#side');
    if (!side) return;
    const items = siteItems();
    const onFloor = items.filter(i => i.floorId === floor.id && i.x != null).sort((a, b) => a.ref.localeCompare(b.ref));
    const unplaced = items.filter(i => i.x == null || !site.floors.some(f => f.id === i.floorId));
    let sel = '';
    if (ui.selected && ui.selected.kind === 'item') {
      const it = Store.get('items', ui.selected.id);
      if (it) {
        const st = itemState(it);
        sel = `<div class="card"><div class="row">${typeChip(it.type)}<b>${esc(it.ref)}</b>${outcomeBadge(st.outcome)}</div>
          <div class="mt">${esc(itemTitle(it))}</div><div class="small muted">${esc(locationText(it, true))}</div>
          <div class="small mt">Next Due: ${dueBadge(st)}</div>
          <div class="row mt"><a class="btn small primary staff-only" href="#/inspect/${it.id}">Inspect</a><a class="btn small" href="#/item/${it.id}">Open</a>
          ${ui.view === '2d' ? '<button class="btn small staff-only" id="unplace">Remove From Plan</button>' : ''}</div>
          ${ui.view === '2d' ? '<p class="small muted staff-only">Drag the pin to move it.</p>' : ''}</div>`;
      }
    } else if (ui.selected && ui.selected.kind === 'room' && !Cloud.isClient()) {
      const r = (floor.rooms || []).find(x => x.id === ui.selected.id);
      if (r) {
        sel = `<div class="card" id="roomCard"><h3>Room</h3>${field('Name', 'name', r.name)}
          <div class="grid2">${field('X (m)', 'x', r.x, { type: 'number', attrs: 'step="0.05"' })}${field('Y (m)', 'y', r.y, { type: 'number', attrs: 'step="0.05"' })}
          ${field('Width (m)', 'w', r.w, { type: 'number', attrs: 'step="0.05" min="0.3"' })}${field('Depth (m)', 'd', r.d, { type: 'number', attrs: 'step="0.05" min="0.3"' })}</div>
          <div class="row"><button class="btn small primary" id="saveRoom">Save Room</button><button class="btn small danger" id="delRoom">Delete Room</button></div></div>`;
      }
    }
    side.innerHTML = `${sel}
      <div class="card"><h3>${esc(floor.name)} — ${onFloor.length} Item${onFloor.length === 1 ? '' : 's'}</h3>
        ${onFloor.length ? `<div style="max-height:340px;overflow:auto">${onFloor.map(it => `<div class="row" style="padding:5px 0;border-bottom:1px solid var(--line);cursor:pointer" data-pick="${it.id}">
          ${typeChip(it.type)}<span style="flex:1;min-width:0"><b>${itemNo(it)}</b> <span class="small">${esc(itemTitle(it))}</span></span>${outcomeBadge(itemState(it).outcome)}</div>`).join('')}</div>`
        : '<p class="small muted">No items placed on this floor yet. Choose <b>Add Item</b> and tap the plan.</p>'}
        ${unplaced.length && !Cloud.isClient() ? `<h3 class="mt">Not On A Plan (${unplaced.length})</h3>${unplaced.slice(0, 30).map(it => `<div class="row small" style="padding:4px 0">${typeChip(it.type)}<span style="flex:1">${esc(it.ref)}</span>
          ${ui.view === '2d' ? `<button class="btn small" data-place="${it.id}">Place</button>` : ''}</div>`).join('')}` : ''}
        <p class="small muted mt">${(floor.rooms || []).length} rooms on this floor.</p>
      </div>`;
    $$('[data-pick]', side).forEach(el => el.onclick = () => {
      ui.selected = { kind: 'item', id: el.dataset.pick };
      if (editor) { editor.selectedItemId = el.dataset.pick; editor.selectedRoomId = null; editor.draw(); }
      if (viewer) build3d();
      renderSide();
    });
    $$('[data-place]', side).forEach(el => el.onclick = () => {
      ui.placeExisting = el.dataset.place;
      setMode('item');
      hint.textContent = 'Tap the plan where this item is located.';
    });
    const un = $('#unplace', side);
    if (un) un.onclick = () => {
      const it = Store.get('items', ui.selected.id);
      it.x = null; it.y = null; it.roomId = null; Store.upsert('items', it);
      ui.selected = null; editor.setItems(floorItems()); renderSide();
    };
    const saveRoom = $('#saveRoom', side);
    if (saveRoom) {
      const r = floor.rooms.find(x => x.id === ui.selected.id);
      saveRoom.onclick = () => {
        const v = formValues($('#roomCard'));
        r.name = v.name; r.x = +v.x; r.y = +v.y; r.w = Math.max(0.3, +v.w); r.d = Math.max(0.3, +v.d);
        Store.upsert('sites', site); editor.draw(); toast('Room saved');
      };
      $('#delRoom', side).onclick = () => {
        floor.rooms = floor.rooms.filter(x => x.id !== r.id);
        for (const it of Store.list('items').filter(i => i.roomId === r.id)) { it.roomId = null; Store.upsert('items', it); }
        Store.upsert('sites', site); ui.selected = null; editor.selectedRoomId = null; editor.draw(); renderSide();
      };
    }
  }

  let editor = null, viewer = null;
  function setMode(m) {
    ui.mode = m;
    if (m !== 'item') ui.placeExisting = null;
    $$('[data-mode]', root).forEach(b => b.className = b.dataset.mode === m ? 'on-pass' : '');
    if (editor) editor.setMode(m);
    hint.textContent = hints[m] || '';
  }

  function build3d() {
    const bgImages = new Map();
    if (bgImg && floor.bg) bgImages.set(floor.bg.photoId, bgImg);
    viewer.build(site, siteItems(), {
      floorId: ui.scope === 'all' ? 'all' : floor.id, explode: ui.explode, bgImages,
      highlightId: ui.selected && ui.selected.kind === 'item' ? ui.selected.id : null, keepCamera: viewer.built
    });
    viewer.built = true;
  }

  if (ui.view === '2d') {
    const canvas = document.createElement('canvas');
    stage.insertBefore(canvas, hint);
    if (Cloud.isClient()) ui.mode = 'select';
    editor = new PlanEditor(canvas, {
      locked: Cloud.isClient(),
      statusOf,
      onPlace: (pos, room) => {
        if (ui.placeExisting) {
          const it = Store.get('items', ui.placeExisting);
          ui.placeExisting = null;
          if (it) { Object.assign(it, { floorId: floor.id, roomId: room ? room.id : null, x: pos.x, y: pos.y }); Store.upsert('items', it); }
          setMode('select'); editor.setItems(floorItems()); renderSide();
          return;
        }
        itemForm({ siteId: site.id, floorId: floor.id, roomId: room ? room.id : null, x: pos.x, y: pos.y, type: ui.addType }, it => {
          ui.selected = { kind: 'item', id: it.id };
          editor.selectedItemId = it.id;
          editor.setItems(floorItems()); renderSide();
        });
      },
      onRoomCreated: rect => {
        openModal({
          title: 'Name This Room',
          body: field('Room Name', 'name', '', { placeholder: 'e.g. Reception, Corridor, Flat 3, Plant Room' }) +
            `<div class="row small">${['Corridor', 'Stairwell', 'Office', 'Kitchen', 'WC', 'Store', 'Plant Room', 'Reception', 'Flat'].map(n => `<button class="btn small" type="button" data-n="${n}">${n}</button>`).join('')}</div>`,
          onOpen: m => $$('[data-n]', m).forEach(b => b.onclick = () => { $('[name=name]', m).value = b.dataset.n; $('[name=name]', m).focus(); }),
          buttons: [{ label: 'Cancel' }, { label: 'Add Room', cls: 'primary', onClick: m => {
            const name = formValues(m).name || 'Room';
            floor.rooms = floor.rooms || [];
            const r = Object.assign({ id: Store.uid(), name }, rect);
            floor.rooms.push(r);
            Store.upsert('sites', site);
            editor.draw(); renderSide();
          } }]
        });
      },
      onPickItem: it => { ui.selected = { kind: 'item', id: it.id }; renderSide(); },
      onPickRoom: r => { ui.selected = { kind: 'room', id: r.id }; renderSide(); },
      onPickNothing: () => { ui.selected = null; renderSide(); },
      onItemMoved: it => { Store.upsert('items', it); ui.selected = { kind: 'item', id: it.id }; renderSide(); },
      onChange: () => { Store.upsert('sites', site); renderSide(); },
      onMeasure: (a, b) => {
        const planDist = Math.hypot(b.x - a.x, b.y - a.y);
        if (planDist < 0.01) return;
        openModal({
          title: 'Set Drawing Scale',
          body: `<p>The two points are <b>${planDist.toFixed(2)} m</b> apart at the current scale.</p>
            ${field('Real Distance Between The Points (m)', 'real', '', { type: 'number', attrs: 'step="0.01" min="0.1"' })}
            <label class="row" style="color:inherit"><input type="checkbox" name="scaleAll" checked style="width:auto"> Also resize rooms and items already drawn on this floor</label>`,
          buttons: [{ label: 'Cancel' }, { label: 'Apply Scale', cls: 'primary', onClick: m => {
            const v = formValues(m);
            const real = Number(v.real);
            if (!real || real <= 0) { toast('Enter the real distance in metres'); return false; }
            const k = real / planDist;
            const ox = floor.bg.x || 0, oy = floor.bg.y || 0;
            floor.bg.widthM *= k;
            if (v.scaleAll) {
              for (const r of floor.rooms || []) { r.x = ox + (r.x - ox) * k; r.y = oy + (r.y - oy) * k; r.w *= k; r.d *= k; }
              for (const it of Store.list('items').filter(i => i.floorId === floor.id && i.x != null)) {
                it.x = ox + (it.x - ox) * k; it.y = oy + (it.y - oy) * k; Store.upsert('items', it);
              }
            }
            Store.upsert('sites', site);
            setMode('select');
            editor.setFloor(floor, floorItems(), bgImg);
            toast(`Scale set — drawing is now ${floor.bg.widthM.toFixed(1)} m wide`);
          } }]
        });
      }
    });
    editor.setFloor(floor, floorItems(), bgImg);
    if (ui.selected) { if (ui.selected.kind === 'item') editor.selectedItemId = ui.selected.id; else editor.selectedRoomId = ui.selected.id; }
    registerCleanup(() => editor.destroy());
    $$('[data-mode]', root).forEach(b => b.onclick = () => setMode(b.dataset.mode));
    $('#addType').onchange = e => { ui.addType = e.target.value; setMode('item'); };
    $('#zoomIn').onclick = () => editor.zoom(1.25);
    $('#zoomOut').onclick = () => editor.zoom(0.8);
    $('#fit').onclick = () => editor.fit();
    $('#uploadBg').onclick = () => $('#bgFile').click();
    $('#bgFile').onchange = async e => {
      const file = e.target.files[0];
      if (!file) return;
      toast('Loading drawing…');
      const url = await compressImage(file, 3000, 0.85);
      if (!url) { toast('That file could not be read as an image'); return; }
      if (floor.bg && floor.bg.photoId) Store.deletePhoto(floor.bg.photoId);
      const photoId = await Store.putPhoto(url, site.clientId);
      const b = planBounds(floor, floorItems(), null);
      const guess = (floor.rooms || []).length ? Math.max(10, (b.x1 - b.x0) * 1.1) : 30;
      floor.bg = { photoId, widthM: guess, x: 0, y: 0, opacity: 0.6 };
      Store.upsert('sites', site);
      ui.mode = 'measure';
      await renderPlanTab(site, root);
      toast('Drawing added — now tap two points a known distance apart to set the scale');
    };
    setMode(ui.mode === 'measure' && !floor.bg ? 'select' : ui.mode);
  } else {
    viewer = new Plan3D(stage, {
      statusOf,
      onPick: it => { ui.selected = { kind: 'item', id: it.id }; if (it.floorId !== floor.id && ui.scope !== 'all') return; build3d(); renderSide(); }
    });
    stage.appendChild(hint);
    hint.textContent = 'Drag to rotate · Right-drag or Shift-drag to pan · Scroll or pinch to zoom · Tap a pin to select it';
    registerCleanup(() => viewer.dispose());
    $$('[data-scope]', root).forEach(b => {
      b.className = b.dataset.scope === ui.scope ? 'on-pass' : '';
      b.onclick = () => { ui.scope = b.dataset.scope; $$('[data-scope]', root).forEach(x => x.className = x.dataset.scope === ui.scope ? 'on-pass' : ''); viewer.built = false; build3d(); };
    });
    $('#explode').oninput = e => { ui.explode = +e.target.value; build3d(); };
    $('#view3d').onclick = () => viewer.setView('iso');
    $('#viewTop').onclick = () => viewer.setView('top');
    build3d();
  }
  renderSide();
}

/* ---------- Items tab ---------- */
function renderItemsTab(site, root) {
  const ui = siteUI[site.id] || (siteUI[site.id] = { view: '2d', mode: 'select', addType: 'fire-door', scope: 'all', explode: 2.2 });
  const f = ui.filter || (ui.filter = { type: '', status: '', floor: '', q: '' });
  const all = Store.list('items').filter(i => i.siteId === site.id && !i.archived).sort((a, b) => a.ref.localeCompare(b.ref));
  root.innerHTML = `
    <div class="spread mb">
      <div class="row">
        <select id="fType" style="width:auto"><option value="">All Types</option>${Object.entries(ITEM_TYPES).map(([k, t]) => `<option value="${k}" ${f.type === k ? 'selected' : ''}>${t.label}</option>`).join('')}</select>
        <select id="fStatus" style="width:auto"><option value="">Any Result</option>${['pass', 'fail', 'advisory', 'untested'].map(k => `<option value="${k}" ${f.status === k ? 'selected' : ''}>${OUTCOME_LABEL[k]}</option>`).join('')}<option value="overdue" ${f.status === 'overdue' ? 'selected' : ''}>Overdue</option></select>
        <select id="fFloor" style="width:auto"><option value="">All Floors</option>${(site.floors || []).map(fl => `<option value="${fl.id}" ${f.floor === fl.id ? 'selected' : ''}>${esc(fl.name)}</option>`).join('')}</select>
        <input id="fQ" placeholder="Search…" value="${esc(f.q)}" style="width:180px">
      </div>
      <div class="row"><button class="btn" id="csv">Export CSV</button><button class="btn primary staff-only" id="addItem">+ Add Item</button></div>
    </div>
    <div class="table-wrap"><table class="list"><thead><tr><th>No.</th><th>Ref</th><th>Type</th><th>Item</th><th>Location</th><th>Last Inspected</th><th>Result</th><th>Next Due</th><th></th></tr></thead><tbody id="itemRows"></tbody></table></div>
    <p class="small muted mt" id="itemCount"></p>`;
  function draw() {
    const q = f.q.toLowerCase();
    const rows = all.filter(it => {
      const st = itemState(it);
      if (f.type && it.type !== f.type) return false;
      if (f.floor && it.floorId !== f.floor) return false;
      if (f.status === 'overdue' ? !st.overdue : (f.status && st.outcome !== f.status)) return false;
      if (q && !`${it.ref} ${itemTitle(it)} ${locationText(it, true)} ${detailSummary(it)}`.toLowerCase().includes(q)) return false;
      return true;
    });
    $('#itemRows').innerHTML = rows.map(it => {
      const st = itemState(it);
      return `<tr class="click" data-href="#/item/${it.id}"><td><b>${itemNo(it)}</b></td><td>${esc(it.ref)}</td><td>${typeChip(it.type)}</td><td>${esc(itemTitle(it))}<div class="small muted">${esc(detailSummary(it))}</div></td>
        <td>${esc(locationText(it, true))}</td><td>${st.last ? esc(fmtDate(st.last.date)) : '—'}</td><td>${outcomeBadge(st.outcome)}</td><td>${dueBadge(st)}</td>
        <td><a class="btn small primary staff-only" href="#/inspect/${it.id}" onclick="event.stopPropagation()">Inspect</a></td></tr>`;
    }).join('') || '<tr><td colspan="9" class="empty">No items match.</td></tr>';
    $('#itemCount').textContent = `${rows.length} of ${all.length} items`;
    bindRowLinks();
  }
  $('#fType').onchange = e => { f.type = e.target.value; draw(); };
  $('#fStatus').onchange = e => { f.status = e.target.value; draw(); };
  $('#fFloor').onchange = e => { f.floor = e.target.value; draw(); };
  $('#fQ').oninput = e => { f.q = e.target.value; draw(); };
  $('#addItem').onclick = () => itemForm({ siteId: site.id, floorId: f.floor || (site.floors[0] || {}).id, type: f.type || 'fire-door' }, it => go(`#/item/${it.id}`));
  $('#csv').onclick = () => {
    const head = ['No', 'Ref', 'Type', 'Item', 'Details', 'Floor', 'Room', 'Last Inspected', 'Result', 'Next Due', 'Inspector'];
    const lines = [head.join(',')].concat(all.map(it => {
      const st = itemState(it); const fl = floorOf(it);
      return [itemNo(it), it.ref, (ITEM_TYPES[it.type] || ITEM_TYPES.other).label, itemTitle(it), detailSummary(it), fl ? fl.name : '', roomName(it),
        st.last ? st.last.date : '', OUTCOME_LABEL[st.outcome], st.due || '', st.last ? st.last.inspector : ''].map(csvCell).join(',');
    }));
    download(`${site.name} - Item Register.csv`, lines.join('\n'), 'text/csv');
  };
  draw();
}

/* ---------- Fire systems tab ---------- */
function systemsUnknown(site) {
  const s = site.systems || {};
  const out = [];
  for (const g of SYSTEM_GROUPS) {
    const vals = s[g.key] || {};
    const absent = vals.present === 'No';
    for (const f of g.fields) {
      if (!f.ask) continue;
      if (absent && f.key !== 'present') continue;
      const v = vals[f.key];
      if (v === undefined || v === '' || v === 'Not Known') out.push({ group: g.title, ask: f.ask });
    }
  }
  return out;
}

function systemsPlanCounts(site) {
  const items = Store.list('items').filter(i => i.siteId === site.id && !i.archived);
  const tally = (type, key) => {
    const t = {};
    for (const i of items.filter(i => i.type === type)) { const k = (i.details || {})[key] || 'Type Not Recorded'; t[k] = (t[k] || 0) + 1; }
    return Object.entries(t).map(([k, n]) => `${n} × ${k}`).join(', ');
  };
  return { alarm: tally('alarm', 'device'), el: tally('emergency-light', 'fitting'), ext: tally('extinguisher', 'medium') };
}

function renderSystemsTab(site, root) {
  site.systems = site.systems || {};
  const S = site.systems;
  const ro = Cloud.isClient();
  const counts = systemsPlanCounts(site);
  const nextService = S.alarm && S.alarm.lastService ? addMonths(S.alarm.lastService, Number(S.alarm.serviceMonths) || 6) : null;
  const nextEl = S.el && S.el.lastAnnual ? addMonths(S.el.lastAnnual, 12) : null;
  const dueTxt = d => d ? (d < today() ? `<span class="badge b-overdue">Overdue · ${fmtDate(d)}</span>` : `<span class="badge b-pass">Next ${fmtDate(d)}</span>`) : '';
  const unknown = systemsUnknown(site);
  const control = (g, f) => {
    const v = (S[g.key] || {})[f.key] ?? '';
    const name = `${g.key}.${f.key}`;
    if (ro) return `<div class="field"><label>${esc(f.label)}</label><div>${esc(v === '' ? '—' : f.type === 'date' ? fmtDate(v) : v)}</div></div>`;
    if (f.type === 'select') return field(f.label, name, v, { type: 'select', options: f.options });
    if (f.type === 'textarea') return field(f.label, name, v, { type: 'textarea', placeholder: f.placeholder });
    return field(f.label, name, v, { type: f.type === 'date' ? 'date' : f.type === 'number' ? 'number' : 'text', placeholder: f.placeholder });
  };
  root.innerHTML = `
    <div class="card staff-only"><div class="spread"><div><h2 style="margin:0">Information Still Needed</h2>
      <p class="small muted" style="margin:4px 0 0">${unknown.length ? `${unknown.length} question${unknown.length === 1 ? '' : 's'} still to answer. Send them to the client, or to their maintenance contractor.` : 'Everything on this page has been answered.'}</p></div>
      ${unknown.length ? '<div class="row"><button class="btn primary" id="askEmail">Email Questions To Client</button><button class="btn" id="askPrint">Print Questions</button></div>' : ''}</div></div>
    <div class="card"><div class="spread"><h2 style="margin:0">Fire Alarm And Detection</h2>${dueTxt(nextService)}</div>
      <p class="small muted">On the plan: ${esc(counts.alarm || 'no alarm devices placed yet')}.</p>
      <div class="grid3" id="sys-alarm">${SYSTEM_GROUPS[0].fields.map(f => control(SYSTEM_GROUPS[0], f)).join('')}</div></div>
    <div class="card"><div class="spread"><h2 style="margin:0">Emergency Lighting</h2>${dueTxt(nextEl)}</div>
      <p class="small muted">On the plan: ${esc(counts.el || 'no emergency lights placed yet')}.</p>
      <div class="grid3" id="sys-el">${SYSTEM_GROUPS[1].fields.map(f => control(SYSTEM_GROUPS[1], f)).join('')}</div></div>
    <div class="card"><h2>Other Fire Safety Equipment And Records</h2>
      <p class="small muted">Extinguishers on the plan: ${esc(counts.ext || 'none placed yet')}.</p>
      <div class="grid3" id="sys-other">${SYSTEM_GROUPS[2].fields.map(f => control(SYSTEM_GROUPS[2], f)).join('')}</div></div>
    ${ro ? '' : '<p class="small muted">Changes save automatically.</p>'}`;
  if (ro) return;
  let timer = null;
  $$('[name]', root).forEach(el => {
    const evt = el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
    el.addEventListener(evt, () => {
      const [g, k] = el.name.split('.');
      S[g] = S[g] || {};
      S[g][k] = el.value.trim();
      clearTimeout(timer);
      timer = setTimeout(() => { Store.upsert('sites', site); if (el.tagName === 'SELECT' || el.type === 'date') { const y = window.scrollY; renderSystemsTab(site, root); window.scrollTo(0, y); } }, 400);
    });
  });
  const client = Store.get('clients', site.clientId) || {};
  const s = Store.settings;
  const questionList = () => {
    let last = '', n = 0;
    return unknown.map(u => { const head = u.group !== last ? `\n${u.group}\n` : ''; last = u.group; return `${head}${++n}. ${u.ask}`; }).join('\n');
  };
  const askEmail = $('#askEmail', root);
  if (askEmail) askEmail.onclick = () => {
    const body = `Hello${client.contact ? ' ' + client.contact.split(' ')[0] : ''},\n\nAhead of the fire safety inspection at ${site.name}, could you help with the questions below about your fire alarm, emergency lighting and other fire safety equipment? Copies of the latest service certificates and the fire log book would also be very helpful. If you don't know the answer, your fire alarm or electrical maintenance company should be able to tell you.\n${questionList()}\n\nMany thanks,\n${s.assessorName || ''}\n${s.businessName}${s.phone ? '\n' + s.phone : ''}`;
    const href = `mailto:${encodeURIComponent(client.email || '')}?subject=${encodeURIComponent(`Fire safety information for ${site.name}`)}&body=${encodeURIComponent(body)}`;
    if (href.length > 1900) {
      openModal({ title: 'Questions For The Client', wide: true, body: `<p class="small">This is too long for some email programs to open directly. Copy it into an email instead.</p><textarea style="min-height:360px" id="askText">${esc(body)}</textarea>`,
        buttons: [{ label: 'Close' }, { label: 'Copy Text', cls: 'primary', onClick: () => { navigator.clipboard.writeText(body).then(() => toast('Copied')); return false; } }] });
    } else location.href = href;
  };
  const askPrint = $('#askPrint', root);
  if (askPrint) askPrint.onclick = () => {
    let last = '';
    const rows = unknown.map((u, i) => { const head = u.group !== last ? `<h3>${esc(u.group)}</h3>` : ''; last = u.group;
      return `${head}<div style="page-break-inside:avoid;margin:0 0 4mm"><b>${i + 1}.</b> ${esc(u.ask)}<div style="border-bottom:1px solid #999;height:9mm"></div><div style="border-bottom:1px solid #999;height:8mm"></div></div>`; }).join('');
    showPrint(`<div class="report"><div class="page"><div style="font-weight:700;color:var(--navy)">${esc(s.businessName)}</div>
      <h1>Fire Safety Information Request</h1><p><b>${esc(client.name || '')}</b> — ${esc(site.name)}${site.address ? ', ' + esc(site.address) : ''}</p>
      <p class="small">Please answer what you can and return this sheet, with copies of your latest fire alarm and emergency lighting service certificates and your fire log book. Your maintenance contractor can help with the technical questions.</p>
      ${rows}<p class="small mt">Completed by: ______________________ &nbsp; Date: ____________</p></div></div>`, { title: `${site.name} - Fire Safety Information Request` });
  };
}

/* ---------- Risk assessments tab ---------- */
function renderAssessTab(site, root) {
  const list = Store.list('assessments').filter(a => a.siteId === site.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  root.innerHTML = `
    <div class="row mb staff-only"><button class="btn primary" id="newFra">+ Fire Risk Assessment</button><button class="btn primary" id="newHs">+ Health &amp; Safety Risk Assessment</button><button class="btn" id="newLog">+ Maintenance Check</button></div>
    ${list.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Assessment</th><th>Date</th><th>Assessor</th><th>Status</th><th>Risk</th><th>Open Actions</th><th>Review Date</th></tr></thead><tbody>
    ${list.map(a => {
      const logIssues = a.kind === 'log' ? maintChecksFor(a.frequency || 'weekly', a.cumulative !== false).reduce((n, g) => n + g.checks.filter(c => (((a.answers || {})[g.freq] || {})[c[1]] || {}).v === 'no').length, 0) : 0;
      const risk = a.kind === 'fra' ? FRA_MATRIX[`${a.likelihood}|${a.consequence}`] || '' : a.kind === 'log' ? '' : (() => { const max = Math.max(0, ...(a.hazards || []).map(h => (+h.l || 0) * (+h.s || 0))); return max ? hsBand(max) : ''; })();
      const open = a.kind === 'fra' ? (a.actions || []).filter(x => !x.done).length : a.kind === 'log' ? logIssues : (a.hazards || []).filter(h => h.action && !h.done).length;
      const label = a.kind === 'log' ? `Maintenance Check — ${(MAINT_FREQ.find(f => f[0] === a.frequency) || MAINT_FREQ[1])[1]}` : ASSESS_TITLES[a.kind] || 'Assessment';
      return `<tr class="click" data-href="#/assessment/${a.id}"><td><b>${esc(label)}</b><div class="small muted">${esc(a.title || '')}</div></td>
        <td>${esc(fmtDate(a.date))}</td><td>${esc(a.assessor || '')}</td><td>${a.kind === 'log' ? 'Done' : esc(a.status || 'Draft')}</td>
        <td>${risk ? `<span class="badge risk-${risk.replace(/\s/g, '')}">${esc(risk)}</span>` : '—'}</td><td>${open}</td>
        <td>${a.reviewDate && a.reviewDate < today() ? `<span class="badge b-overdue">${esc(fmtDate(a.reviewDate))}</span>` : esc(fmtDate(a.reviewDate))}</td></tr>`;
    }).join('')}</tbody></table></div>` : `<div class="card empty"><h3>No Risk Assessments Yet</h3><p>Start a fire risk assessment (PAS 79 layout), a health &amp; safety risk assessment (HSE five steps), or record a fire safety maintenance check for this site.</p></div>`}`;
  $('#newFra').onclick = () => go(`#/assessment/${newAssessment(site, 'fra').id}`);
  $('#newHs').onclick = () => go(`#/assessment/${newAssessment(site, 'hs').id}`);
  $('#newLog').onclick = () => go(`#/assessment/${newAssessment(site, 'log').id}`);
  bindRowLinks();
}

/* ---------- Reports & labels tab ---------- */
function renderReportsTab(site, root) {
  const items = Store.list('items').filter(i => i.siteId === site.id && !i.archived).sort((a, b) => a.ref.localeCompare(b.ref));
  const insps = Store.list('inspections').filter(x => x.siteId === site.id).map(x => x.date).sort();
  const lastDate = insps[insps.length - 1] || today();
  const assess = Store.list('assessments').filter(a => a.siteId === site.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const fras = assess.filter(a => a.kind === 'fra'), hss = assess.filter(a => a.kind === 'hs');
  const ck = (name, label, on = true) => `<label class="row" style="color:inherit;font-weight:500;margin:4px 0"><input type="checkbox" name="${name}" ${on ? 'checked' : ''} style="width:auto"> ${label}</label>`;
  root.innerHTML = `
    <div class="grid2" style="align-items:start">
      <div class="card" id="repForm"><h2>Client Report</h2>
        ${field('Report Title', 'title', 'Fire Safety & Compliance Inspection Report')}
        <div class="grid2">${field('Inspections From', 'from', addMonths(lastDate, -3), { type: 'date' })}${field('Inspections To', 'to', lastDate, { type: 'date' })}</div>
        <div class="grid2">${field('Inspected By', 'assessor', Store.settings.assessorName)}${field('Recommended Next Visit', 'nextVisit', addMonths(lastDate, 6), { type: 'date' })}</div>
        <label>Include</label>
        <div class="grid2">${ck('plans', 'Floor Plans')}${ck('threeD', '3D Building View')}${ck('doors', 'Fire Door Schedule')}${ck('pat', 'PAT Register')}${ck('other', 'Other Equipment')}${ck('defects', 'Defects & Actions')}${ck('photos', 'Photographs')}${ck('logs', 'Maintenance Checks')}${ck('systems', 'Fire Safety Systems')}</div>
        <div class="grid2 mt">${field('Fire Risk Assessment', 'fraId', fras[0] ? fras[0].id : '', { type: 'select', options: fras.map(a => [a.id, `${fmtDate(a.date)} — ${a.status || 'Draft'}`]), hint: 'Leave blank to leave it out' })}
          ${field('H&S Risk Assessment', 'hsId', hss[0] ? hss[0].id : '', { type: 'select', options: hss.map(a => [a.id, `${fmtDate(a.date)} — ${a.status || 'Draft'}`]) })}</div>
        ${field("Assessor's Comments (Summary Page)", 'summary', '', { type: 'textarea' })}
        <button class="btn primary" id="genReport">Create Report</button>
        <p class="small muted">Opens the report ready to print. Choose <b>Save As PDF</b> as the printer to send it to the client.</p>
      </div>
      <div class="card staff-only" id="lblForm"><h2>QR Labels</h2>
        <p class="small muted">Each label links to that item's record. Print on standard A4 label sheets.</p>
        <label>Item Types</label>
        <div class="grid2">${Object.entries(ITEM_TYPES).map(([k, t]) => { const n = items.filter(i => i.type === k).length; return n ? ck('t_' + k, `${t.label} (${n})`) : ''; }).join('') || '<p class="muted">No items yet.</p>'}</div>
        ${field('Floor', 'floor', '', { type: 'select', options: [['', 'All Floors'], ...(site.floors || []).map(f => [f.id, f.name])], blank: false })}
        ${field('Label Sheet', 'layout', 'L7160', { type: 'select', options: Object.entries(LABEL_LAYOUTS).map(([k, l]) => [k, l.name]), blank: false })}
        <div class="grid2">${field('Start At Label No.', 'start', 1, { type: 'number', attrs: 'min="1"', hint: 'To use up a part-used sheet' })}
          <div class="field"><label>&nbsp;</label>${ck('onlyNew', 'Only Items Not Yet Labelled', false)}${ck('withResult', 'Show Last Result & Next Due', false)}</div></div>
        <button class="btn primary" id="genLabels">Print Labels</button>
      </div>
    </div>`;

  $('#genReport').onclick = async () => {
    const v = formValues($('#repForm'));
    const btn = $('#genReport');
    btn.disabled = true; btn.textContent = 'Building Report…';
    try {
      const html = await buildReport(site.id, {
        title: v.title, from: v.from, to: v.to, assessor: v.assessor, nextVisit: v.nextVisit, summary: v.summary,
        fraId: v.fraId, hsId: v.hsId,
        sections: { plans: v.plans, threeD: v.threeD, doors: v.doors, pat: v.pat, other: v.other, defects: v.defects, photos: v.photos, logs: v.logs, systems: v.systems }
      });
      const client = Store.get('clients', site.clientId) || {};
      showPrint(html, { title: `${client.name ? client.name + ' - ' : ''}${site.name} - Report ${today()}` });
    } catch (e) { console.error(e); toast('The report could not be built: ' + e.message); }
    btn.disabled = false; btn.textContent = 'Create Report';
  };

  $('#genLabels').onclick = async () => {
    const v = formValues($('#lblForm'));
    const chosen = items.filter(i => v['t_' + i.type] && (!v.floor || i.floorId === v.floor) && (!v.onlyNew || !i.labelPrinted));
    if (!chosen.length) { toast('No items match those choices'); return; }
    const html = await buildLabelSheets(chosen, v.layout, Number(v.start) || 1, { locationOf: it => locationText(it, true), stateOf: itemState, withResult: v.withResult });
    for (const it of chosen) { it.labelPrinted = today(); Store.upsert('items', it); }
    showPrint(`<div class="labels-sheet">${html}</div>`, { title: `${site.name} - QR Labels`, extraClass: 'screen-outline' });
  };
}
