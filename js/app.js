'use strict';

/* Compliance Plus — app shell: routing, dashboard, due list, scanning,
   search and settings. */

let cleanups = [];
function registerCleanup(fn) { cleanups.push(fn); }
function runCleanups() { for (const fn of cleanups) { try { fn(); } catch (e) { console.warn(e); } } cleanups = []; }

function go(hash) {
  if (location.hash === hash) router(); else location.hash = hash;
}

function setCrumbs(list) {
  $('#crumbs').innerHTML = list.map(([label, href], i) =>
    href && i < list.length - 1 ? `<a href="${href}">${esc(label)}</a>` : `<span>${esc(label)}</span>`).join(' › ');
  document.title = `${list[list.length - 1][0]} · ${Store.settings.businessName}`;
}

function bindRowLinks(root = document) {
  $$('[data-href]', root).forEach(el => {
    if (el._bound) return;
    el._bound = true;
    el.addEventListener('click', e => { if (e.target.closest('a, button, input, select')) return; go(el.dataset.href); });
  });
}

function notFound(msg) {
  setCrumbs([['Not Found']]);
  $('#view').innerHTML = `<div class="card empty"><h3>Not Found</h3><p>${msg || 'That record is not on this device.'}</p><a class="btn" href="#/">Back To Dashboard</a></div>`;
}

const ROUTES = [
  [/^#?\/?$/, () => viewDashboard(), 'dashboard'],
  [/^#\/clients$/, () => viewClients(), 'clients'],
  [/^#\/client\/([^/]+)$/, id => viewClient(id), 'clients'],
  [/^#\/site\/([^/]+)(?:\/(\w+))?$/, (id, tab) => viewSite(id, tab), 'clients'],
  [/^#\/item\/([^/]+)$/, id => viewItem(id), 'clients'],
  [/^#\/inspect\/([^/]+)(?:\/([^/]+))?$/, (id, x) => viewInspect(id, x), 'clients'],
  [/^#\/assessment\/([^/]+)$/, id => viewAssessment(id), 'clients'],
  [/^#\/i\/(.+)$/, ref => viewByRef(ref), 'scan'],
  [/^#\/due$/, () => viewDue(), 'due'],
  [/^#\/scan$/, () => viewScan(), 'scan'],
  [/^#\/search\/(.*)$/, q => viewSearch(q), ''],
  [/^#\/settings$/, () => viewSettings(), 'settings'],
  [/^#\/account$/, () => viewAccount(), 'account']
];

let appStarted = false;

function clientRouteAllowed(h) {
  if (/^#\/(clients|due|settings|inspect)/.test(h)) return false;
  const m = h.match(/^#\/client\/([^/]+)/);
  if (m && decodeURIComponent(m[1]) !== Cloud.clientId) return false;
  return true;
}

function router() {
  if (!appStarted) return;
  runCleanups();
  closeModal();
  document.body.classList.remove('printing');
  $('#printArea').innerHTML = '';
  let h = location.hash || '#/';
  if (Cloud.isClient() && !clientRouteAllowed(h)) { location.replace('#/'); h = '#/'; }
  for (const [re, fn, nav] of ROUTES) {
    const m = h.match(re);
    if (m) {
      $$('#nav a').forEach(a => a.classList.toggle('active', a.dataset.nav === nav));
      const prev = router.last;
      router.last = h;
      try { fn(...m.slice(1).map(x => (x === undefined ? undefined : decodeURIComponent(x)))); }
      catch (e) { console.error(e); $('#view').innerHTML = `<div class="card"><h3>Something Went Wrong</h3><pre class="small">${esc(e.stack || e.message)}</pre></div>`; }
      if (prev !== h) window.scrollTo(0, 0);
      return;
    }
  }
  notFound('That page does not exist.');
}

/* ---------- Dashboard ---------- */
function viewDashboard() {
  if (Cloud.isClient()) return viewClient(Cloud.clientId);
  setCrumbs([['Dashboard']]);
  const items = Store.list('items').filter(i => !i.archived);
  const states = items.map(it => ({ it, st: itemState(it) }));
  const clients = Store.list('clients'), sites = Store.list('sites');
  const monthStart = today().slice(0, 8) + '01';
  const thisMonth = Store.list('inspections').filter(x => x.date >= monthStart).length;
  const overdue = states.filter(x => x.st.overdue);
  const defects = states.filter(x => x.st.outcome === 'fail');
  const dueSoon = states.filter(x => x.st.overdue || x.st.dueSoon).sort((a, b) => a.st.due.localeCompare(b.st.due));
  const recent = [...Store.list('inspections')].sort((a, b) => (b.date + (b.createdAt || '')).localeCompare(a.date + (a.createdAt || ''))).slice(0, 8);
  const s = Store.settings;
  const siteName = id => (Store.get('sites', id) || {}).name || '';
  // Compliance score: of the items inspected, the share whose latest result is a pass (advisories count as half).
  const done = states.filter(x => x.st.last);
  const inspected = done.length;
  const pts = done.reduce((n, x) => n + (x.st.outcome === 'pass' ? 1 : x.st.outcome === 'advisory' ? .5 : 0), 0);
  const score = inspected ? Math.round(pts / inspected * 100) : 0;
  const scoreColour = !inspected ? '#cfc2cb' : score >= 85 ? 'var(--lime-2)' : score >= 60 ? '#e0a020' : '#b42318';
  const scoreText = inspected ? `${inspected} of ${items.length} items inspected` : 'No inspections yet';

  $('#view').innerHTML = `
    <div class="spread dash-hello"><div><h1>${esc(s.businessName)}</h1><div class="muted">${esc(s.tagline || '')}</div></div>
      <div class="row"><a class="btn" href="#/scan">Scan QR</a><button class="btn primary" id="dashAddClient">+ New Client</button></div></div>
    ${!clients.length ? `<div class="card mb"><h2>Getting Started</h2>
      <ol>
        <li>Fill in your business details under <a href="#/settings">Settings</a> (these appear on reports and labels).</li>
        <li>Add a <b>client</b>, then a <b>site</b> (building) for them.</li>
        <li>On the site's <b>Plan &amp; 3D</b> tab, upload the client's floor plan (or draw the rooms) and tap to add each fire door, appliance, extinguisher and so on.</li>
        <li>Print the <b>QR labels</b> and stick one on each item.</li>
        <li>On site, scan a label (or open the item) and tap <b>Inspect</b>. When done, create the <b>client report</b> as a PDF.</li>
      </ol>
      <div class="row"><button class="btn primary" id="startClient">Add First Client</button>${Cloud.signedIn ? '' : '<button class="btn" id="loadDemo">Load Demo Data To Try It Out</button>'}</div></div>` : ''}
    <div class="dash-stats">
      <a class="dash-stat" href="#/clients"><span class="dash-stat-lbl">Clients &amp; Sites</span><span class="dash-stat-num">${clients.length}</span>
        <span class="dash-stat-sub">${sites.length} ${sites.length === 1 ? 'site' : 'sites'} · ${items.length} items</span><span class="dash-stat-ic">${themeIconSafe('clients')}</span></a>
      <div class="dash-stat"><span class="dash-stat-lbl">Compliance Score</span>
        <div class="dash-ring-wrap"><span class="dash-stat-sub">${scoreText}</span><span class="dash-ring" style="--pct:${score};--ring:${scoreColour}">${inspected ? score + '%' : '–'}</span></div></div>
      <a class="dash-stat ${overdue.length ? 'alert' : ''}" href="#/due"><span class="dash-stat-lbl">Overdue</span><span class="dash-stat-num">${overdue.length}</span>
        <span class="dash-stat-sub">${dueSoon.length - overdue.length} more due in 30 days</span><span class="dash-stat-ic ${overdue.length ? 'red' : 'lime'}">${themeIconSafe('due')}</span></a>
      <div class="dash-stat ${defects.length ? 'alert' : ''}"><span class="dash-stat-lbl">Open Defects</span><span class="dash-stat-num">${defects.length}</span>
        <span class="dash-stat-sub">${thisMonth} ${thisMonth === 1 ? 'inspection' : 'inspections'} this month</span><span class="dash-stat-ic ${defects.length ? '' : 'lime'}">${themeIconSafe('alert')}</span></div>
    </div>
    <div class="dash-row">
      <div class="card barred"><div class="card-bar"><h3>Latest Results</h3><a href="#/due">Due &amp; Overdue</a></div>
        ${dashResultBars(states)}</div>
      ${dashCalendarCard(states, siteName)}
    </div>
    <div class="grid2" style="align-items:start;gap:14px">
      <div class="card barred"><div class="card-bar"><h3>Due &amp; Overdue (30 Days)</h3><a href="#/due">View All</a></div>
        ${dueSoon.length ? `<table class="list"><tbody>${dueSoon.slice(0, 10).map(({ it, st }) => `<tr class="click" data-href="#/item/${it.id}">
          <td>${typeChip(it.type)}</td><td><b>${esc(it.ref)}</b><div class="small muted">${esc(siteName(it.siteId))}</div></td><td>${dueBadge(st)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">Nothing due in the next 30 days.</p>'}</div>
      <div class="card barred"><div class="card-bar"><h3>Open Defects</h3></div>
        ${defects.length ? `<table class="list"><tbody>${defects.slice(0, 10).map(({ it, st }) => `<tr class="click" data-href="#/item/${it.id}">
          <td>${typeChip(it.type)}</td><td><b>${esc(it.ref)}</b> ${esc(itemTitle(it))}<div class="small muted">${esc(siteName(it.siteId))} · ${esc(st.last.action || failedChecksText(it, st.last).join('; '))}</div></td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">No open defects.</p>'}</div>
    </div>
    <div class="card barred" style="margin-top:14px"><div class="card-bar"><h3>Recent Inspections</h3></div>
      ${recent.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Date</th><th>Item</th><th>Site</th><th>Inspector</th><th>Result</th></tr></thead><tbody>
        ${recent.map(x => { const it = Store.get('items', x.itemId); if (!it) return ''; return `<tr class="click" data-href="#/item/${it.id}"><td>${esc(fmtDate(x.date))}</td><td>${typeChip(it.type)} <b>${esc(it.ref)}</b> ${esc(itemTitle(it))}</td><td>${esc(siteName(it.siteId))}</td><td>${esc(x.inspector || '')}</td><td>${outcomeBadge(x.outcome)}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted">No inspections yet.</p>'}</div>`;
  const addC = () => clientForm();
  $('#dashAddClient').onclick = addC;
  if ($('#startClient')) $('#startClient').onclick = addC;
  if ($('#loadDemo')) $('#loadDemo').onclick = () => { const site = loadDemoData(); toast('Demo data loaded'); go(`#/site/${site.id}/plan`); };
  bindRowLinks();
}

function themeIconSafe(name) { return typeof themeIcon === 'function' ? themeIcon(name, 26) : ''; }

/* Dashboard card: how many items stand at each latest result. */
function dashResultBars(states) {
  const rows = [['Pass', 'pass', '#16794b'], ['Advisory', 'advisory', '#c88100'], ['Fail', 'fail', '#b42318'], ['Not Inspected', 'untested', '#a898a4']]
    .map(([name, key, colour]) => ({ name, colour, n: states.filter(x => x.st.outcome === key).length }));
  const known = rows.reduce((t, r) => t + r.n, 0);
  if (states.length - known > 0) rows.push({ name: 'Other', colour: '#7a6b77', n: states.length - known });
  const max = Math.max(1, ...rows.map(r => r.n));
  if (!states.length) return '<p class="muted">No items yet. Add them on a site\'s Plan &amp; 3D tab.</p>';
  return rows.map(r => `<div class="dash-bar"><span class="dash-bar-name">${esc(r.name)}</span>
    <span class="dash-bar-track"><span class="dash-bar-fill" style="width:${Math.round(r.n / max * 100)}%;background:${r.colour}${r.n ? '' : ';min-width:0'}"></span></span>
    <b class="dash-bar-n">${r.n}</b></div>`).join('') + `<div class="small muted" style="margin-top:8px">${states.length} ${states.length === 1 ? 'item' : 'items'} in all.</div>`;
}

/* Dashboard card: this month, with a dot on each day something falls due. */
function dashCalendarCard(states, siteName) {
  const now = new Date(), y = now.getFullYear(), m = now.getMonth(), todayN = now.getDate();
  const ym = today().slice(0, 7), t = today();
  const byDay = {};
  states.forEach(({ st }) => { if (st.due && st.due.slice(0, 7) === ym) { const d = Number(st.due.slice(8, 10)); byDay[d] = byDay[d] || { n: 0, over: false }; byDay[d].n++; if (st.overdue) byDay[d].over = true; } });
  const lead = (new Date(y, m, 1).getDay() + 6) % 7, days = new Date(y, m + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="dash-day dash-blank"></span>');
  for (let d = 1; d <= days; d++) {
    const b = byDay[d];
    cells.push(`<span class="dash-day${d === todayN ? ' dash-today' : ''}${b ? ' dash-has' : ''}${b && b.over ? ' dash-over' : ''}" title="${b ? b.n + ' due' : ''}">${d}</span>`);
  }
  const next = states.filter(x => x.st.due && x.st.due >= t).sort((a, b) => a.st.due.localeCompare(b.st.due)).slice(0, 3);
  const list = next.map(({ it, st }) => `<a class="dash-next" href="#/item/${it.id}"><b>${esc(new Date(st.due + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }))}</b><span>${esc(it.ref)} · ${esc(itemTitle(it))}${siteName(it.siteId) ? ' · ' + esc(siteName(it.siteId)) : ''}</span></a>`).join('');
  const dows = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(d => `<span class="dash-dow">${d}</span>`).join('');
  return `<div class="card barred"><div class="card-bar"><h3>${esc(now.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }))}</h3><a href="#/due">All Due Dates</a></div>
    <div class="dash-cal">${dows}${cells.join('')}</div>
    <div class="dash-nexts">${list || '<div class="small muted">Nothing is due yet.</div>'}</div></div>`;
}

/* ---------- Due & overdue ---------- */
function viewDue() {
  setCrumbs([['Due & Overdue']]);
  const horizon = addDays(today(), 60);
  const rows = Store.list('items').filter(i => !i.archived).map(it => ({ it, st: itemState(it) }))
    .filter(x => x.st.due && x.st.due <= horizon).sort((a, b) => a.st.due.localeCompare(b.st.due));
  const never = Store.list('items').filter(i => !i.archived && !lastInspection(i.id));
  // Only the latest assessment / maintenance check of each kind per site counts towards what's due.
  const latestOf = {};
  for (const a of Store.list('assessments')) {
    const key = `${a.siteId}|${a.kind}|${a.kind === 'log' ? a.frequency : ''}`;
    if (!latestOf[key] || (a.date || '') > (latestOf[key].date || '')) latestOf[key] = a;
  }
  const reviews = Object.values(latestOf).filter(a => a.reviewDate && a.reviewDate <= horizon).sort((a, b) => a.reviewDate.localeCompare(b.reviewDate));
  const where = it => { const s = siteOf(it); const c = s ? Store.get('clients', s.clientId) : null; return `${c ? c.name + ' · ' : ''}${s ? s.name : ''}`; };
  $('#view').innerHTML = `<h1>Due &amp; Overdue</h1><p class="muted">Items due for inspection in the next 60 days, plus anything overdue.</p>
    <div class="table-wrap"><table class="list"><thead><tr><th>Due</th><th>Ref</th><th>Item</th><th>Client · Site</th><th>Location</th><th>Last Result</th><th></th></tr></thead><tbody>
    ${rows.map(({ it, st }) => `<tr class="click" data-href="#/item/${it.id}"><td>${dueBadge(st)}</td><td>${typeChip(it.type)} <b>${esc(it.ref)}</b></td><td>${esc(itemTitle(it))}</td>
      <td>${esc(where(it))}</td><td>${esc(locationText(it, true))}</td><td>${outcomeBadge(st.outcome)}</td><td><a class="btn small primary" href="#/inspect/${it.id}">Inspect</a></td></tr>`).join('') || '<tr><td colspan="7" class="empty">Nothing due.</td></tr>'}
    </tbody></table></div>
    ${reviews.length ? `<h2 class="mt">Risk Assessment Reviews &amp; Maintenance Checks</h2><div class="table-wrap"><table class="list"><tbody>${reviews.map(a => `<tr class="click" data-href="#/assessment/${a.id}">
      <td>${a.reviewDate < today() ? `<span class="badge b-overdue">${esc(fmtDate(a.reviewDate))}</span>` : esc(fmtDate(a.reviewDate))}</td><td>${a.kind === 'log' ? 'Maintenance Check Due' : a.kind === 'fra' ? 'Fire Risk Assessment Review' : 'H&amp;S Risk Assessment Review'}</td><td>${esc((Store.get('sites', a.siteId) || {}).name || '')}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${never.length ? `<h2 class="mt">Never Inspected (${never.length})</h2><div class="table-wrap"><table class="list"><tbody>${never.slice(0, 100).map(it => `<tr class="click" data-href="#/item/${it.id}">
      <td>${typeChip(it.type)} <b>${esc(it.ref)}</b></td><td>${esc(itemTitle(it))}</td><td>${esc(where(it))}</td><td><a class="btn small primary" href="#/inspect/${it.id}">Inspect</a></td></tr>`).join('')}</tbody></table></div>` : ''}`;
  bindRowLinks();
}

/* ---------- QR scan & lookup ---------- */
function findItemByRef(ref) {
  const r = String(ref || '').trim().toUpperCase();
  return Store.list('items').find(i => i.ref.toUpperCase() === r) || null;
}

function viewByRef(ref) {
  const it = findItemByRef(ref);
  if (it) { location.replace(`#/item/${it.id}`); return; }
  notFound(`Item <b>${esc(ref)}</b> is not stored on this device. At the moment records are kept on the device that created them — once the portal is connected to the online database, any signed-in device (and the client) will be able to open it.`);
}

function viewScan() {
  setCrumbs([['Scan QR']]);
  const supported = 'BarcodeDetector' in window;
  $('#view').innerHTML = `<h1>Scan QR Label</h1>
    <div class="grid2" style="align-items:start">
      <div class="card">
        ${supported ? `<video class="scanner" id="cam" playsinline muted></video><div class="row mt"><button class="btn primary" id="startCam">Start Camera</button><span class="small muted" id="camMsg"></span></div>`
          : `<p>This browser cannot scan from inside the portal, but your phone's normal <b>camera app</b> can — point it at a label and tap the link that appears. It opens the item straight in the portal.</p>`}
      </div>
      <div class="card"><h3>Or Type The Reference</h3>
        <div class="row"><input id="refIn" placeholder="${esc(Store.settings.refPrefix)}-00001" style="flex:1"><button class="btn primary" id="refGo">Open</button></div>
        <p class="small muted mt">The reference is printed under each QR code.</p></div>
    </div>`;
  $('#refGo').onclick = () => {
    const v = $('#refIn').value.trim();
    const ref = /^\d+$/.test(v) ? `${Store.settings.refPrefix}-${v.padStart(5, '0')}` : v;
    const it = findItemByRef(ref);
    if (it) go(`#/item/${it.id}`); else toast(`${ref} not found on this device`);
  };
  $('#refIn').onkeydown = e => { if (e.key === 'Enter') $('#refGo').click(); };
  if (supported) {
    $('#startCam').onclick = async () => {
      $('#camMsg').textContent = 'Point the camera at a QR label…';
      const stop = await startScanner($('#cam'), text => {
        stop();
        const ref = refFromScan(text);
        const it = ref && findItemByRef(ref);
        if (it) go(`#/item/${it.id}`);
        else { $('#camMsg').textContent = ref ? `${ref} is not on this device` : 'That QR code is not a Compliance Plus label'; }
      }, err => { $('#camMsg').textContent = err === 'camera' ? 'Camera permission was refused.' : 'Scanning is not supported here.'; });
      registerCleanup(stop);
    };
  }
}

/* ---------- Search ---------- */
function viewSearch(q) {
  setCrumbs([['Search']]);
  const t = q.toLowerCase();
  const clients = Store.list('clients').filter(c => `${c.name} ${c.contact} ${c.email}`.toLowerCase().includes(t));
  const sites = Store.list('sites').filter(s => `${s.name} ${s.address} ${s.postcode}`.toLowerCase().includes(t));
  const items = Store.list('items').filter(i => `${i.ref} ${itemTitle(i)} ${detailSummary(i)} ${roomName(i)}`.toLowerCase().includes(t)).slice(0, 100);
  $('#view').innerHTML = `<h1>Results For "${esc(q)}"</h1>
    ${clients.length ? `<h2>Clients</h2><div class="cards">${clients.map(c => `<div class="tile link-card" data-href="#/client/${c.id}"><b>${esc(c.name)}</b></div>`).join('')}</div>` : ''}
    ${sites.length ? `<h2 class="mt">Sites</h2><div class="cards">${sites.map(s => `<div class="tile link-card" data-href="#/site/${s.id}"><b>${esc(s.name)}</b><div class="small muted">${esc(s.address || '')}</div></div>`).join('')}</div>` : ''}
    ${items.length ? `<h2 class="mt">Items</h2><div class="table-wrap"><table class="list"><tbody>${items.map(it => `<tr class="click" data-href="#/item/${it.id}"><td>${typeChip(it.type)} <b>${esc(it.ref)}</b></td><td>${esc(itemTitle(it))}</td><td>${esc(locationText(it))}</td><td>${outcomeBadge(itemState(it).outcome)}</td></tr>`).join('')}</tbody></table></div>` : ''}
    ${!clients.length && !sites.length && !items.length ? '<div class="card empty">Nothing found.</div>' : ''}`;
  bindRowLinks();
}

/* ---------- Settings ---------- */
async function viewSettings() {
  setCrumbs([['Settings']]);
  const s = Store.settings;
  let usage = '';
  if (navigator.storage && navigator.storage.estimate) {
    const e = await navigator.storage.estimate().catch(() => null);
    if (e) usage = `Using ${(e.usage / 1048576).toFixed(1)} MB of about ${(e.quota / 1073741824).toFixed(1)} GB available on this device.`;
  }
  const hasDemo = Store.list('clients').some(c => c.demo);
  $('#view').innerHTML = `<h1>Settings</h1>
    <div class="grid2" style="align-items:start">
      <div class="card" id="bizForm"><h2>Business Details</h2>
        <p class="small muted">Shown on reports, QR labels and risk assessments.</p>
        ${field('Business Name', 'businessName', s.businessName, { required: true })}
        ${field('Tagline', 'tagline', s.tagline)}
        <div class="grid2">${field('Inspector / Assessor Name', 'assessorName', s.assessorName)}${field('Phone', 'phone', s.phone, { type: 'tel' })}</div>
        ${field('Qualifications & Accreditations', 'qualifications', s.qualifications, { placeholder: 'e.g. FDIS Certified Fire Door Inspector · NEBOSH Fire Certificate · City & Guilds 2377-77 PAT' })}
        <div class="grid2">${field('Email', 'email', s.email, { type: 'email' })}${field('Website', 'website', s.website)}</div>
        ${field('Business Address', 'address', s.address)}
        <div class="field"><label>Logo (For Reports)</label><div class="row">${s.logo ? `<img src="${s.logo}" style="max-height:48px;border:1px solid var(--line);border-radius:6px;padding:2px">` : ''}
          <label class="btn small" style="color:inherit;font-size:.85rem">Choose Image<input type="file" id="logoIn" accept="image/*" hidden></label>${s.logo ? '<button class="btn small danger" id="logoRm">Remove</button>' : ''}</div></div>
        ${field('Report Limitations / Disclaimer', 'reportDisclaimer', s.reportDisclaimer, { type: 'textarea' })}
        <h3>QR Codes</h3>
        ${field('Portal Web Address', 'portalUrl', s.portalUrl, { placeholder: portalBaseUrl(), hint: 'The address the QR codes point to. Set this once the portal is online (e.g. https://portal.complianceplus.co.uk/) <b>before</b> printing labels for clients.' })}
        <div class="grid2">${field('Reference Prefix', 'refPrefix', s.refPrefix, { hint: 'Item refs look like ' + esc(s.refPrefix) + '-00001' })}${field('Next Reference Number', 'nextRef', s.nextRef, { type: 'number', attrs: 'min="1"' })}</div>
        <button class="btn primary" id="saveBiz">Save Settings</button>
      </div>
      <div>
        <div class="card"><h2>Backup</h2>
          <p class="small">${Cloud.signedIn ? 'Your records are stored online and kept on this device for working offline. A backup file is an extra safety copy.' : 'Everything is currently saved <b>on this device only</b> (in this browser).'} Download a backup regularly — for example after each site visit — and keep it somewhere safe such as OneDrive.</p>
          <p class="small muted">${usage}</p>
          <div class="row"><button class="btn primary" id="exportBtn">Download Backup</button><label class="btn" style="color:inherit;font-size:inherit">Restore From Backup<input type="file" id="importIn" accept=".json,application/json" hidden></label></div>
        </div>
        <div class="card"><h2>Demo Data</h2>
          <p class="small">Load a sample business centre with plans, items, inspections and risk assessments to see how everything works.</p>
          <div class="row">${hasDemo ? '<button class="btn" id="rmDemo">Remove Demo Data</button>' : '<button class="btn" id="addDemo">Load Demo Data</button>'}</div>
        </div>
        <div class="card local-only"><h2>Erase Everything</h2>
          <p class="small">Permanently removes all clients, sites, items, inspections and photos from this device.</p>
          <button class="btn danger" id="wipe">Erase All Data</button>
        </div>
        <p class="small muted">Compliance Plus Portal v${esc((window.CP_CONFIG || {}).version || '')}</p>
      </div>
    </div>`;
  $('#saveBiz').onclick = () => {
    const v = formValues($('#bizForm'));
    if (!v.businessName) { toast('Enter the business name'); return; }
    v.nextRef = Math.max(1, parseInt(v.nextRef, 10) || 1);
    v.refPrefix = (v.refPrefix || 'CP').toUpperCase().replace(/[^A-Z0-9]/g, '') || 'CP';
    Object.assign(s, v);
    Store.touchSettings();
    applyBranding();
    toast('Settings saved');
  };
  $('#logoIn').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    const url = await readFileAsDataUrl(f);
    const img = await loadImage(url);
    if (!img) { toast('That file is not an image'); return; }
    const k = Math.min(1, 600 / img.width);
    const c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    s.logo = c.toDataURL('image/png'); Store.touchSettings(); viewSettings();
  };
  if ($('#logoRm')) $('#logoRm').onclick = () => { s.logo = ''; Store.touchSettings(); viewSettings(); };
  $('#exportBtn').onclick = async () => {
    await Store.flush();
    const data = await Store.exportAll();
    download(`Compliance Plus Backup ${today()}.json`, JSON.stringify(data));
    toast('Backup downloaded');
  };
  $('#importIn').onchange = async e => {
    const f = e.target.files[0]; if (!f) return;
    if (!(await confirmBox('Restore Backup', 'This replaces <b>everything</b> on this device with the contents of the backup file. Continue?', 'Restore'))) return;
    try { await Store.importAll(JSON.parse(await f.text())); invalidateState(); applyBranding(); toast('Backup restored'); go('#/'); }
    catch (err) { toast(err.message || 'That file could not be restored'); }
  };
  if ($('#addDemo')) $('#addDemo').onclick = () => { const site = loadDemoData(); toast('Demo data loaded'); go(`#/site/${site.id}/plan`); };
  if ($('#rmDemo')) $('#rmDemo').onclick = async () => { if (await confirmBox('Remove Demo Data', 'Remove the demo client and everything attached to it?', 'Remove')) { removeDemoData(); toast('Demo data removed'); viewSettings(); } };
  $('#wipe').onclick = () => {
    openModal({
      title: 'Erase All Data',
      body: `<p>This cannot be undone. Download a backup first if you might need anything.</p>${field('Type ERASE To Confirm', 'confirm', '')}`,
      buttons: [{ label: 'Cancel' }, { label: 'Erase Everything', cls: 'primary', onClick: async m => {
        if (formValues(m).confirm !== 'ERASE') { toast('Type ERASE to confirm'); return false; }
        await Store.wipe(); invalidateState(); applyBranding(); toast('All data erased'); go('#/');
      } }]
    });
  };
}

function applyBranding() {
  $('#brandName').textContent = Store.settings.businessName;
  updateSyncNote();
  if (typeof themeProfile === 'function') themeProfile();
}

function updateSyncNote() {
  const el = $('#storageNote');
  if (!el) return;
  if (Cloud.configured && Cloud.signedIn) {
    el.innerHTML = `<div>${esc(Cloud.email)}</div><div class="sync-${Cloud.status}">${esc(syncStatusText())}</div>`;
  } else {
    el.textContent = Store.persistent ? 'Saved on this device · Download backups in Settings' : 'Warning: this browser is not saving data';
  }
  const acc = $('#accSync');
  if (acc) acc.textContent = syncStatusText();
}

function startApp() {
  hideAuth();
  const p = Cloud.profile;
  document.body.classList.toggle('role-client', !!p && p.role === 'client');
  document.body.classList.toggle('role-staff', !p || p.role === 'staff');
  document.body.classList.toggle('cloud-on', Cloud.configured);
  applyBranding();
  appStarted = true;
  router();
}

/* After a successful sign-in (or on load with a saved sign-in). */
async function afterSignIn() {
  const p = Cloud.profile || await Cloud.loadProfile();
  if (!p) { showLogin('Your account could not be loaded. Check your internet connection and try again.'); return; }
  if (p.role === 'pending') { showPending(); return; }
  const otherUser = Store.meta.userId && Store.meta.userId !== p.id;
  const offerUpload = p.role === 'staff' && !otherUser && !Store.meta.lastPull && Store.list('clients').length > 0;
  await Cloud.begin();
  startApp();
  if (offerUpload) {
    const n = Store.list('clients').length;
    if (await confirmBox('Upload This Device\'s Records', `This device has <b>${n} client${n === 1 ? '' : 's'}</b> saved before you signed in. Upload them to your online account so your other devices can see them?`, 'Upload')) {
      Store.markAllDirty();
    }
  }
  Cloud.syncNow();
}

/* ---------- Start up ---------- */
document.addEventListener('DOMContentLoaded', async () => {
  await Store.init();
  applyBranding();
  window.addEventListener('hashchange', router);
  window.addEventListener('cp-sync-status', updateSyncNote);
  window.addEventListener('cp-remote-change', () => {
    applyBranding();
    const h = location.hash || '#/';
    const editing = /^#\/(inspect|assessment)/.test(h) || (/\/plan$|^#\/site\/[^/]+$/.test(h) && Cloud.isStaff());
    if (!appStarted || editing || $('#modalRoot').innerHTML || document.body.classList.contains('printing')) return;
    const y = window.scrollY;
    router();
    window.scrollTo(0, y);
  });
  window.addEventListener('cp-save-error', () => toast('Could not save — the device may be out of storage'));
  $('#quickSearch').addEventListener('keydown', e => {
    if (e.key !== 'Enter') return;
    const q = e.target.value.trim();
    if (!q) return;
    const it = findItemByRef(q) || (/^\d+$/.test(q) ? findItemByRef(`${Store.settings.refPrefix}-${q.padStart(5, '0')}`) : null);
    e.target.value = '';
    e.target.blur();
    go(it ? `#/item/${it.id}` : `#/search/${encodeURIComponent(q)}`);
  });
  window.addEventListener('beforeunload', () => { Store.flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') Store.flush(); });
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});

  if (!Cloud.configured) { startApp(); return; }
  let info = null;
  try { info = await Cloud.init(); } catch (e) { console.warn(e); }
  if (info && info.error) return showLogin(info.error);
  if (!Cloud.signedIn) return showLogin();
  if (info && (info.type === 'invite' || info.type === 'recovery')) return showSetPassword(info.type);
  afterSignIn();
});
