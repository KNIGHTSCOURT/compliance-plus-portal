'use strict';

/* Compliance Plus - client business details and Client Updates (v1.8.0).
   Each client has a business type, size, area, building height, whether people sleep there and which services they take.
   On the Client Updates page you pick which clients a message is for (by any of those), then:
     - it is posted to each matching client's own portal page (one 'notices' record per client, so each client can read only its own), and
     - your email app opens with the matching email addresses in BCC, ready for you to check and send yourself.
   A 'batch' record (no client) keeps the history; only staff can read it. */

const CLIENT_SECTORS = ['Offices', 'Shops & Retail', 'Industrial, Warehouse & Depot', 'Transport', 'Blocks Of Flats & Residential', 'Landlord / HMO',
  'Pubs, Cafés & Restaurants', 'Hotels & Guest Houses', 'Care & Health', 'Schools & Childcare', 'Community & Faith Buildings', 'Other'];
const CLIENT_EMPLOYEES = ['1–4', '5–9', '10–49', '50–249', '250+'];
const CLIENT_HEIGHTS = [['under11', 'Under 11 m (Up To About 3 Storeys)'], ['11to18', '11 m To 18 m (About 4–6 Storeys)'], ['over18', '18 m Or Over (7+ Storeys)']];
const CLIENT_SERVICES = [['fra', 'Fire Risk Assessment'], ['doors', 'Fire Door Inspections'], ['pat', 'PAT Testing'], ['hsra', 'H&S Risk Assessment']];

/* ---------------- business details on the client ---------------- */
function clientProfileFields(c) {
  const areas = [...new Set(Store.list('clients').map(x => (x.area || '').trim()).filter(Boolean))].sort();
  const svc = c.services || [];
  return `<div class="field"><label>Business Details</label><div class="small muted" style="margin:-2px 0 8px">Used to send each client only the updates that affect them.</div></div>
    <div class="grid2">${field('Business Type', 'sector', c.sector, { type: 'select', options: CLIENT_SECTORS })}${field('Employees', 'employees', c.employees, { type: 'select', options: CLIENT_EMPLOYEES })}</div>
    <div class="grid2">${field('Town / Area', 'area', c.area, { placeholder: 'e.g. Stafford', attrs: 'list="cpAreaList" autocomplete="off"' })}${field('Total Floor Area (m², Rough)', 'floorArea', c.floorArea, { type: 'number', attrs: 'min="0"' })}</div>
    <datalist id="cpAreaList">${areas.map(a => `<option value="${esc(a)}">`).join('')}</datalist>
    ${field('Tallest Building', 'height', c.height, { type: 'select', options: CLIENT_HEIGHTS })}
    <label class="checkrow"><input type="checkbox" name="sleeping" ${c.sleeping ? 'checked' : ''}> People Sleep On Site (Flats, Care Home, Hotel, HMO)</label>
    <div class="field"><label>Services They Take</label><div class="check-grid">${CLIENT_SERVICES.map(([k, l]) => `<label><input type="checkbox" name="svc_${k}" ${svc.includes(k) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div></div>
    <label class="checkrow"><input type="checkbox" name="noUpdates" ${c.noUpdates ? 'checked' : ''}> Does Not Want Update Emails</label>`;
}
function clientProfileRead(m, v) {
  v.services = CLIENT_SERVICES.filter(([k]) => v['svc_' + k]).map(([k]) => k);
  CLIENT_SERVICES.forEach(([k]) => delete v['svc_' + k]);
  v.area = (v.area || '').trim().replace(/\b\w/g, ch => ch.toUpperCase());
  v.floorArea = v.floorArea ? Number(v.floorArea) : '';
  v.sleeping = !!v.sleeping; v.noUpdates = !!v.noUpdates;
}
function clientProfileCard(c) {
  if (!c.sector && !c.area && !c.employees && !c.height && !(c.services || []).length) return `<div class="card staff-only mt"><p class="small muted" style="margin:0">No business details yet. Press <b>Edit</b> to add the business type, size and area, so you can send them the updates that affect them.</p></div>`;
  const h = (CLIENT_HEIGHTS.find(x => x[0] === c.height) || [])[1];
  const svc = (c.services || []).map(k => (CLIENT_SERVICES.find(x => x[0] === k) || [k, k])[1]);
  return `<div class="card staff-only mt"><div class="kv">
    <div>Business Type</div><div>${esc(c.sector || '—')}</div>
    <div>Size</div><div>${esc([c.employees ? c.employees + ' employees' : '', c.floorArea ? c.floorArea + ' m²' : ''].filter(Boolean).join(' · ') || '—')}</div>
    <div>Area</div><div>${esc(c.area || '—')}</div>
    <div>Tallest Building</div><div>${esc(h || '—')}${c.sleeping ? ' · People sleep on site' : ''}</div>
    <div>Services</div><div>${esc(svc.join(', ') || '—')}</div>
    ${c.noUpdates ? '<div>Updates</div><div>No update emails (still shown in their portal)</div>' : ''}</div></div>`;
}

/* ---------------- updates on the client's page ---------------- */
function clientUpdatesCard(c) {
  const list = Store.list('notices').filter(n => n.kind === 'notice' && n.clientId === c.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  if (!list.length) return '';
  const biz = Store.settings.businessName || 'Compliance Plus';
  return `<div class="card barred mt"><div class="card-bar"><h3>Updates From ${esc(biz)}</h3></div>
    ${list.slice(0, 6).map((n, i) => `<details class="cu-note" ${i === 0 ? 'open' : ''}><summary><b>${esc(n.title)}</b><span class="small muted">${esc(fmtDate(n.date))}</span></summary>
      <div class="cu-body">${esc(n.body).replace(/\n/g, '<br>')}</div></details>`).join('')}
  </div>`;
}

/* ---------------- who a message is for ---------------- */
function updMatches(c, t) {
  if (c.demo) return false;
  if (t.sectors.length && !t.sectors.includes(c.sector)) return false;
  if (t.areas.length && !t.areas.includes((c.area || '').trim())) return false;
  if (t.employees.length && !t.employees.includes(c.employees)) return false;
  if (t.heights.length && !t.heights.includes(c.height)) return false;
  if (t.sleeping && !c.sleeping) return false;
  if (t.services.length && !t.services.some(s => (c.services || []).includes(s))) return false;
  return true;
}
function updTargetText(t) {
  const bits = [];
  if (t.sectors.length) bits.push(t.sectors.join(', '));
  if (t.areas.length) bits.push('in ' + t.areas.join(', '));
  if (t.employees.length) bits.push(t.employees.join(', ') + ' employees');
  if (t.heights.length) bits.push(t.heights.map(h => (CLIENT_HEIGHTS.find(x => x[0] === h) || [h, h])[1].split(' (')[0]).join(', '));
  if (t.sleeping) bits.push('sleeping on site');
  if (t.services.length) bits.push('taking ' + t.services.map(s => (CLIENT_SERVICES.find(x => x[0] === s) || [s, s])[1]).join(' or '));
  return bits.join(' · ') || 'All clients';
}

/* Starting messages.  Check them against the current guidance before sending: the law changes. */
const UPD_TEMPLATES = [
  { id: 'records', name: 'Fire Risk Assessment Must Be Written Down (All Businesses)', target: {},
    title: 'Your Fire Risk Assessment Must Now Be Fully Written Down',
    body: 'Since 1 October 2023, changes made by the Building Safety Act 2022 to the Regulatory Reform (Fire Safety) Order 2005 mean every business, whatever its size, must:\n\n• record its whole fire risk assessment in writing (not only businesses with five or more employees);\n• record the name of the person or company who carried it out;\n• record its fire safety arrangements;\n• share fire safety information with any other responsible persons in a shared building, and with the people who take over from you.\n\nIf your assessment is not fully written down, is out of date, or was done before your premises or use changed, please get in touch and we can review it for you.' },
  { id: 'flats11', name: 'Fire Door Checks In Blocks Of Flats Over 11 m', target: { sectors: ['Blocks Of Flats & Residential', 'Landlord / HMO'], heights: ['11to18', 'over18'] },
    title: 'Fire Door Checks In Your Building',
    body: 'Under the Fire Safety (England) Regulations 2022, in residential buildings over 11 metres tall the responsible person must:\n\n• check communal fire doors (including those to stairs and corridors) at least every three months;\n• use best endeavours to check flat entrance doors at least every twelve months;\n• give residents information on why fire doors should be kept shut, not tampered with, and how to report faults.\n\nWe can carry out these checks for you, keep a record of every door in your portal and remind you before the next check is due.' },
  { id: 'flats18', name: 'High-Rise Residential (18 m Or 7 Storeys And Over)', target: { sectors: ['Blocks Of Flats & Residential'], heights: ['over18'] },
    title: 'Duties For High-Rise Residential Buildings',
    body: 'For residential buildings 18 metres or more tall (or seven or more storeys), the Fire Safety (England) Regulations 2022 add duties including:\n\n• giving the fire and rescue service electronic floor plans and a building plan, and information on the external walls;\n• keeping a secure information box on site;\n• checking lifts used by firefighters and key firefighting equipment every month, and reporting faults lasting over 24 hours;\n• fitting wayfinding signage that firefighters can see in low light.\n\nPlease contact us if you would like help checking where your building stands.' },
  { id: 'pat', name: 'Electrical Equipment Reminder (PAT)', target: { services: ['pat'] },
    title: 'Keeping Your Electrical Equipment Safe',
    body: 'The Electricity at Work Regulations 1989 require electrical equipment at work to be kept safe. PAT testing, together with regular visual checks by staff, is the usual way to show this.\n\nHow often items need testing depends on the type of equipment and how it is used. Items that are moved around, used outdoors or in workshops need checking more often than office equipment that stays put.\n\nIf you have added new equipment since our last visit, or would like to book your next test, please get in touch.' },
  { id: 'blank', name: 'Blank Message', target: {}, title: '', body: '' }
];

/* ---------------- the page ---------------- */
function viewUpdates() {
  setCrumbs([['Clients & Sites', '#/clients'], ['Client Updates']]);
  const batches = Store.list('notices').filter(n => n.kind === 'batch').sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  const clients = Store.list('clients').filter(c => !c.demo);
  const missing = clients.filter(c => !c.sector || !c.area).length;
  $('#view').innerHTML = `
    <div class="spread dash-hello"><div><h1>Client Updates</h1><div class="muted">Tell clients about new rules that affect them: it goes on their portal page and by email.</div></div>
      <button class="btn primary" id="updNew">+ New Update</button></div>
    ${missing ? `<div class="fd-box warn mb"><div class="fd-box-h">${missing} Client${missing === 1 ? '' : 's'} Without A Business Type Or Area</div><p class="small" style="margin:0">They only get updates sent to "All Clients" until you add their details (Clients &amp; Sites → open the client → Edit).</p></div>` : ''}
    <div class="card barred"><div class="card-bar"><h3>Sent Updates</h3></div>
      ${batches.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Date</th><th>Update</th><th>Sent To</th><th></th></tr></thead><tbody>
        ${batches.map(b => `<tr><td>${esc(fmtDate(b.date))}</td><td><b>${esc(b.title)}</b><div class="small muted">${esc(updTargetText(b.target))}</div></td>
          <td class="small">${b.clientIds.length} client${b.clientIds.length === 1 ? '' : 's'}<div class="muted">${esc(b.clientNames.slice(0, 4).join(', '))}${b.clientNames.length > 4 ? '…' : ''}</div></td>
          <td style="white-space:nowrap"><button class="btn small" data-again="${b.id}">Email Again</button> <button class="btn small danger" data-del="${b.id}">Withdraw</button></td></tr>`).join('')}
      </tbody></table></div>` : '<p class="muted">Nothing sent yet. Press <b>+ New Update</b>, or start from one of the ready-made messages.</p>'}</div>`;
  $('#updNew').onclick = () => updCompose();
  $$('[data-again]').forEach(b => b.onclick = async () => { const rec = Store.get('notices', b.dataset.again); const recips = await updRecipients(rec.clientIds.map(id => Store.get('clients', id)).filter(Boolean)); updEmail(rec, recips); });
  $$('[data-del]').forEach(b => b.onclick = async () => {
    const rec = Store.get('notices', b.dataset.del);
    if (!(await confirmBox('Withdraw Update', `Take <b>${esc(rec.title)}</b> off ${rec.clientIds.length} client portal page${rec.clientIds.length === 1 ? '' : 's'}? Emails already sent cannot be recalled.`, 'Withdraw'))) return;
    Store.list('notices').filter(n => n.batchId === rec.id).forEach(n => Store.remove('notices', n.id));
    Store.remove('notices', rec.id); toast('Update withdrawn'); viewUpdates();
  });
}

/* email addresses for a set of clients: the client's own email plus their portal logins */
async function updRecipients(list) {
  const out = new Map();
  let logins = [];
  try { if (Cloud.signedIn && Cloud.isStaff()) logins = await Cloud.listLogins({ role: 'client' }); } catch (e) { logins = []; }
  for (const c of list) {
    if (c.noUpdates) continue;
    const emails = [c.email, ...logins.filter(l => l.client_id === c.id).map(l => l.email)].filter(Boolean).map(e => e.trim().toLowerCase());
    for (const e of emails) if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) out.set(e, c.name);
  }
  return [...out.keys()];
}

function updEmail(rec, recipients) {
  const s = Store.settings;
  if (!recipients.length) { toast('None of these clients has an email address'); return; }
  const sign = [s.assessorName, s.businessName, s.phone, s.email, s.website].filter(Boolean).join('\n');
  const body = `${rec.body}\n\nYou can also read this in your ${s.businessName} portal.\n\n${sign}`;
  const url = `mailto:${encodeURIComponent(s.email || '')}?bcc=${encodeURIComponent(recipients.join(','))}&subject=${encodeURIComponent(rec.title)}&body=${encodeURIComponent(body)}`;
  if (url.length > 1900) {
    // too long for some email apps: copy the addresses and open with the message only
    try { navigator.clipboard.writeText(recipients.join('; ')); } catch (e) { /* ignore */ }
    toast('Email addresses copied: paste them into BCC');
    location.href = `mailto:${encodeURIComponent(s.email || '')}?subject=${encodeURIComponent(rec.title)}&body=${encodeURIComponent(body)}`;
  } else location.href = url;
}

function updCompose() {
  const clients = Store.list('clients').filter(c => !c.demo);
  const areas = [...new Set(clients.map(c => (c.area || '').trim()).filter(Boolean))].sort();
  const box = (name, opts) => `<div class="check-grid upd-grid">${opts.map(([v, l]) => `<label><input type="checkbox" data-t="${name}" value="${esc(v)}"> ${esc(l)}</label>`).join('')}</div>`;
  openModal({
    title: 'New Client Update', wide: true,
    body: `<div class="field"><label>Start From</label><select id="updTpl">${UPD_TEMPLATES.map(t => `<option value="${t.id}">${esc(t.name)}</option>`).join('')}</select>
        <div class="small muted" style="margin-top:6px">The ready-made messages are a starting point. Check them against the current guidance before sending: rules change.</div></div>
      ${field('Title', 'title', '')}
      ${field('Message', 'body', '', { type: 'textarea' })}
      <h3 class="mt">Who It Is For</h3><p class="small muted">Leave a group empty to include everyone. Clients must match every group you tick.</p>
      <div class="field"><label>Business Type</label>${box('sectors', CLIENT_SECTORS.map(s => [s, s]))}</div>
      ${areas.length ? `<div class="field"><label>Area</label>${box('areas', areas.map(a => [a, a]))}</div>` : ''}
      <div class="grid2"><div class="field"><label>Employees</label>${box('employees', CLIENT_EMPLOYEES.map(e => [e, e]))}</div>
        <div class="field"><label>Tallest Building</label>${box('heights', CLIENT_HEIGHTS.map(([v, l]) => [v, l.split(' (')[0]]))}</div></div>
      <div class="field"><label>Takes The Service</label>${box('services', CLIENT_SERVICES)}</div>
      <label class="checkrow"><input type="checkbox" id="updSleep"> Only Where People Sleep On Site</label>
      <div class="upd-who" id="updWho"></div>`,
    buttons: [{ label: 'Cancel' }, { label: 'Post And Open Email', cls: 'primary', onClick: m => { updSend(m); return false; } }],
    onOpen: m => {
      const tpl = $('#updTpl', m), refresh = () => updRefresh(m);
      const apply = () => {
        const t = UPD_TEMPLATES.find(x => x.id === tpl.value);
        $('[name=title]', m).value = t.title; $('[name=body]', m).value = t.body;
        $$('[data-t]', m).forEach(cb => { cb.checked = ((t.target || {})[cb.dataset.t] || []).includes(cb.value); });
        $('#updSleep', m).checked = !!(t.target || {}).sleeping;
        refresh();
      };
      tpl.onchange = apply;
      $$('[data-t], #updSleep', m).forEach(cb => cb.onchange = refresh);
      $('[name=body]', m).style.minHeight = '220px';
      apply();
    }
  });
}

function updReadTarget(m) {
  const t = { sectors: [], areas: [], employees: [], heights: [], services: [], sleeping: $('#updSleep', m).checked };
  $$('[data-t]:checked', m).forEach(cb => t[cb.dataset.t].push(cb.value));
  return t;
}
function updRefresh(m) {
  const t = updReadTarget(m);
  const hits = Store.list('clients').filter(c => updMatches(c, t));
  const noEmail = hits.filter(c => !c.email && !c.noUpdates).length, optOut = hits.filter(c => c.noUpdates).length;
  $('#updWho', m).innerHTML = `<b>${hits.length} client${hits.length === 1 ? '' : 's'} match</b> (${esc(updTargetText(t))})${hits.length ? ': ' + esc(hits.map(c => c.name).join(', ')) : ''}
    ${optOut ? `<div class="small muted">${optOut} do not want update emails: they will see it in their portal only.</div>` : ''}
    ${noEmail ? `<div class="small muted">${noEmail} have no email on their client record; their portal logins will still be emailed.</div>` : ''}`;
}

async function updSend(m) {
  const title = $('[name=title]', m).value.trim(), body = $('[name=body]', m).value.trim();
  if (!title || !body) { toast('Enter a title and a message'); return; }
  const t = updReadTarget(m);
  const hits = Store.list('clients').filter(c => updMatches(c, t));
  if (!hits.length) { toast('No clients match who it is for'); return; }
  const recips = await updRecipients(hits);
  const date = today();
  const batch = Store.upsert('notices', { kind: 'batch', date, title, body, target: t, clientIds: hits.map(c => c.id), clientNames: hits.map(c => c.name) });
  hits.forEach(c => Store.upsert('notices', { kind: 'notice', batchId: batch.id, clientId: c.id, date, title, body }));
  closeModal();
  toast(`Posted to ${hits.length} client portal${hits.length === 1 ? '' : 's'}`);
  viewUpdates();
  if (recips.length) updEmail(batch, recips);
}
