'use strict';

/* Compliance Plus - quotes, the price list and the leaflet (v1.7.0).
   Everything is kept in the 'quotes' collection, which only staff can read online (rows have no client_id):
     - id 'price-list' (kind 'prices') holds your rates, the next quote number and the leaflet wording;
     - every other record (kind 'quote') is one quote.
   A quote is worked out from a few answers (site size, doors, PAT items, which assessments, miles) plus any
   extra lines you type, so the price always follows your price list.  Prices are before VAT. */

const Q_DEFAULT_PRICES = {
  hourlyRate: 45, minCharge: 95,
  doorEach: 25, doorMin: 150, minsDoor: 15,
  patEach: 1.75, patEach2: 1.25, patTierFrom: 150, patMin: 60, minsPat: 3,
  fraSmall: 295, fraMedium: 495, fraLarge: 895, fraReview: 195,
  hrsFraSmall: 4, hrsFraMedium: 7, hrsFraLarge: 14,
  hsraSmall: 275, hsraMedium: 450, hsraLarge: 750,
  hrsHsraSmall: 3.5, hrsHsraMedium: 6, hrsHsraLarge: 11,
  planSmall: 95, planMedium: 195, planLarge: 395,
  hrsPlanSmall: 1.5, hrsPlanMedium: 3, hrsPlanLarge: 6,
  labelEach: 0.5,
  milesFree: 10, mileRate: 0.45, mph: 30,
  bundleDiscount: 10,
  vatRegistered: false, vatRate: 20,
  validDays: 30,
  terms: 'Prices are fixed for the work described. Payment is due within 14 days of the report being issued. Any extra work found on the day (for example more doors or items than listed) is charged at the rates above, and will be agreed with you first. Access to all areas is needed on the day; a return visit to reach locked areas is charged as a new visit.',
  nextQuote: 1,
  leafletArea: 'Stafford & Staffordshire',
  leafletIntro: 'One local inspector for your fire doors, fire and health & safety risk assessments and PAT testing, with every result kept in your own online portal.',
  leafletPrices: true
};

const Q_SIZES = [['small', 'Small'], ['medium', 'Medium'], ['large', 'Large']];
const Q_SIZE_HELP = 'Small: up to about 300 m², one or two floors, simple layout. Medium: about 300–1,500 m² or up to three floors. Large: over 1,500 m², four or more floors, sleeping accommodation or a complex use.';
const Q_STATUS = ['Draft', 'Sent', 'Accepted', 'Declined'];

function qPrices() {
  const rec = Store.get('quotes', 'price-list');
  return Object.assign({}, Q_DEFAULT_PRICES, rec || {});
}
function qSavePrices(p) { Store.upsert('quotes', Object.assign({}, p, { id: 'price-list', kind: 'prices' })); }
function qMoney(n) { return '£' + (Math.round((Number(n) || 0) * 100) / 100).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
function qNum(v) { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
function qSizeFromArea(m2) { return m2 > 1500 ? 'large' : m2 > 300 ? 'medium' : 'small'; }
function qCap(k) { return k.charAt(0).toUpperCase() + k.slice(1); }

/* Works out the lines, totals and the time it should take. */
function qCompute(q, P) {
  const s = q.size || 'small', S = qCap(s), lines = [];
  let hours = 0, services = 0;
  const sizeLbl = (Q_SIZES.find(x => x[0] === s) || [s, s])[1];
  if (q.fra === 'new') { lines.push({ desc: `Fire Risk Assessment (${sizeLbl} Premises) With Written Report And Action Plan`, qty: 1, unit: P['fra' + S] }); hours += P['hrsFra' + S]; services++; }
  if (q.fra === 'review') { lines.push({ desc: 'Fire Risk Assessment Review (Update Of An Existing Assessment)', qty: 1, unit: P.fraReview }); hours += P['hrsFra' + S] / 2; services++; }
  if (q.hsra) { lines.push({ desc: `Health & Safety Risk Assessment (${sizeLbl} Premises) With Written Report`, qty: 1, unit: P['hsra' + S] }); hours += P['hrsHsra' + S]; services++; }
  const doors = Math.max(0, Math.round(qNum(q.doors)));
  if (doors) {
    services++; hours += doors * P.minsDoor / 60;
    if (doors * P.doorEach < P.doorMin) lines.push({ desc: `Fire Door Inspection, ${doors} Door${doors === 1 ? '' : 's'} (Minimum Charge)`, qty: 1, unit: P.doorMin });
    else lines.push({ desc: 'Fire Door Inspection With Photos, Gap Readings And Report (Per Door)', qty: doors, unit: P.doorEach });
  }
  const pat = Math.max(0, Math.round(qNum(q.pat)));
  if (pat) {
    services++; hours += pat * P.minsPat / 60;
    const unit = pat >= P.patTierFrom ? P.patEach2 : P.patEach;
    if (pat * unit < P.patMin) lines.push({ desc: `PAT Testing, ${pat} Item${pat === 1 ? '' : 's'} (Minimum Charge)`, qty: 1, unit: P.patMin });
    else lines.push({ desc: 'PAT Testing With Pass Labels And Test Register (Per Item)', qty: pat, unit });
  }
  if (q.plan) { lines.push({ desc: '3D Site Plan And Online Compliance Portal Set-Up (One-Off)', qty: 1, unit: P['plan' + S] }); hours += P['hrsPlan' + S]; }
  if (q.labels && doors + pat > 0) lines.push({ desc: 'QR Code Labels Supplied And Fitted (Per Item)', qty: doors + pat, unit: P.labelEach });
  const visits = Math.max(1, Math.round(qNum(q.visits) || 1));
  const miles = Math.max(0, qNum(q.miles));
  const extraMiles = Math.max(0, miles - P.milesFree) * 2 * visits;
  if (extraMiles > 0) lines.push({ desc: `Travel (${Math.round(extraMiles)} Miles Return Beyond ${P.milesFree} Free Each Way${visits > 1 ? ', ' + visits + ' Visits' : ''})`, qty: Math.round(extraMiles), unit: P.mileRate });
  hours += (miles * 2 * visits) / (P.mph || 30);
  for (const x of q.extra || []) if (x.desc || qNum(x.unit)) lines.push({ desc: x.desc || 'Other', qty: qNum(x.qty) || 1, unit: qNum(x.unit), custom: true });
  lines.forEach(l => { l.amount = Math.round(l.qty * l.unit * 100) / 100; });
  let sub = lines.reduce((t, l) => t + l.amount, 0);
  if (lines.length && sub < P.minCharge) { const top = Math.round((P.minCharge - sub) * 100) / 100; lines.push({ desc: 'Minimum Visit Charge Top-Up', qty: 1, unit: top, amount: top }); sub = P.minCharge; }
  const discPct = qNum(q.discount);
  let discount = 0;
  if (discPct > 0 && sub > 0) { discount = Math.round(sub * discPct) / 100; lines.push({ desc: `Discount (${discPct}%)`, qty: 1, unit: -discount, amount: -discount }); }
  const net = Math.round((sub - discount) * 100) / 100;
  const vat = P.vatRegistered ? Math.round(net * P.vatRate) / 100 : 0;
  const total = Math.round((net + vat) * 100) / 100;
  return { lines, sub, discount, net, vat, total, hours: Math.round(hours * 10) / 10, perHour: hours ? net / hours : 0, services, monthly: Math.round(total / 12 * 100) / 100 };
}

/* ---------------- list ---------------- */
function viewQuotes() {
  setCrumbs([['Quotes']]);
  const qs = Store.list('quotes').filter(q => q.kind === 'quote').sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.number || '').localeCompare(a.number || ''));
  const P = qPrices();
  const won = qs.filter(q => q.status === 'Accepted'), open = qs.filter(q => q.status === 'Sent');
  const sum = list => list.reduce((t, q) => t + qCompute(q, P).net, 0);
  $('#view').innerHTML = `
    <div class="spread dash-hello"><div><h1>Quotes</h1><div class="muted">Price up a job from your price list and print a branded quote.</div></div>
      <div class="row"><a class="btn" href="#/quotes/prices">Price List</a><button class="btn" id="qLeaflet">Print Leaflet</button><button class="btn primary" id="qNew">+ New Quote</button></div></div>
    <div class="dash-stats">
      <div class="dash-stat"><span class="dash-stat-lbl">Quotes</span><span class="dash-stat-num">${qs.length}</span><span class="dash-stat-sub">${qs.filter(q => q.status === 'Draft').length} still in draft</span><span class="dash-stat-ic berry">${themeIconSafe('quotes')}</span></div>
      <div class="dash-stat"><span class="dash-stat-lbl">Waiting For A Reply</span><span class="dash-stat-num">${open.length}</span><span class="dash-stat-sub">${qMoney(sum(open))} before VAT</span><span class="dash-stat-ic">${themeIconSafe('due')}</span></div>
      <div class="dash-stat"><span class="dash-stat-lbl">Won</span><span class="dash-stat-num">${won.length}</span><span class="dash-stat-sub">${qMoney(sum(won))} before VAT</span><span class="dash-stat-ic lime">${themeIconSafe('check')}</span></div>
    </div>
    <div class="card barred"><div class="card-bar"><h3>All Quotes</h3></div>
      ${qs.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>No.</th><th>Date</th><th>Customer</th><th>Work</th><th>Before VAT</th><th>Status</th></tr></thead><tbody>
        ${qs.map(q => { const c = qCompute(q, P); return `<tr class="click" data-href="#/quote/${q.id}"><td><b>${esc(q.number || '')}</b></td><td>${esc(fmtDate(q.date))}</td>
          <td>${esc((q.customer || {}).name || '—')}<div class="small muted">${esc(q.siteName || '')}</div></td><td class="small">${esc(qSummary(q))}</td><td>${qMoney(c.net)}</td><td>${qStatusBadge(q.status)}</td></tr>`; }).join('')}
      </tbody></table></div>` : '<p class="muted">No quotes yet. Check your <a href="#/quotes/prices">Price List</a>, then press <b>+ New Quote</b>.</p>'}</div>`;
  $('#qNew').onclick = () => qCreate();
  $('#qLeaflet').onclick = () => qLeafletDialog();
  bindRowLinks();
}

function qStatusBadge(s) {
  const cls = { Accepted: 'b-pass', Declined: 'b-fail', Sent: 'b-due' }[s] || 'b-untested';
  return `<span class="badge ${cls}">${esc(s || 'Draft')}</span>`;
}
function qSummary(q) {
  const bits = [];
  if (q.fra === 'new') bits.push('FRA'); if (q.fra === 'review') bits.push('FRA Review');
  if (q.hsra) bits.push('H&S RA');
  if (qNum(q.doors)) bits.push(qNum(q.doors) + ' Fire Doors');
  if (qNum(q.pat)) bits.push(qNum(q.pat) + ' PAT Items');
  if (q.plan) bits.push('3D Plan');
  if ((q.extra || []).length) bits.push('+ Extras');
  return bits.join(' · ') || '—';
}

function qCreate(clientId) {
  const P = qPrices();
  const number = 'Q-' + String(P.nextQuote || 1).padStart(4, '0');
  qSavePrices(Object.assign(P, { nextQuote: (P.nextQuote || 1) + 1 }));
  const c = clientId ? Store.get('clients', clientId) : null;
  const q = Store.upsert('quotes', { kind: 'quote', number, date: today(), status: 'Draft', clientId: c ? c.id : '',
    customer: c ? { name: c.name || '', contact: c.contact || '', email: c.email || '', phone: c.phone || '', address: c.address || '' } : { name: '', contact: '', email: '', phone: '', address: '' },
    siteName: '', siteAddress: '', area: '', size: 'small', fra: 'new', hsra: false, doors: 0, pat: 0, plan: true, labels: true, miles: 0, visits: 1, discount: 0, extra: [], notes: '' });
  go('#/quote/' + q.id);
}

/* ---------------- one quote ---------------- */
function viewQuote(id) {
  const q = Store.get('quotes', id);
  if (!q || q.kind !== 'quote') return notFound('That quote is not on this device.');
  setCrumbs([['Quotes', '#/quotes'], [q.number || 'Quote']]);
  const P = qPrices();
  const cu = q.customer || {};
  const clients = Store.list('clients').filter(c => !c.demo).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  $('#view').innerHTML = `<div id="qRoot">
    <div class="spread dash-hello"><div><div class="row"><h1 style="margin:0">Quote ${esc(q.number || '')}</h1>${qStatusBadge(q.status)}</div><div class="muted">${esc(cu.name || 'New customer')}${q.siteName ? ' · ' + esc(q.siteName) : ''}</div></div>
      <div class="row"><button class="btn danger" id="qDel">Delete</button><button class="btn" id="qCopy">Copy</button><button class="btn primary" id="qPrint">Print / PDF Quote</button></div></div>
    <div class="grid2" style="align-items:start;gap:14px">
      <div>
        <div class="card" id="qCust"><h3>Customer</h3>
          ${field('Existing Client (Optional)', 'clientId', q.clientId || '', { type: 'select', options: clients.map(c => [c.id, c.name]), hint: 'Pick one to fill in their details, or leave blank for a new customer.' })}
          ${field('Customer / Company Name', 'name', cu.name)}
          <div class="grid2">${field('Contact Name', 'contact', cu.contact)}${field('Phone', 'phone', cu.phone, { type: 'tel' })}</div>
          ${field('Email', 'email', cu.email, { type: 'email' })}
          ${addrFields('Billing Address', 'address', addrParts(cu, 'address'))}
        </div>
        <div class="card" id="qSite"><h3>The Site And The Work</h3>
          ${field('Site Name', 'siteName', q.siteName, { placeholder: 'e.g. Depot, Main Office' })}
          ${addrFields('Site Address', 'siteAddress', addrParts(q, 'siteAddress'))}
          <div class="grid2">${field('Floor Area (m², Rough)', 'area', q.area, { type: 'number', attrs: 'min="0"', hint: 'Sets the size for you.' })}
            ${field('Site Size', 'size', q.size, { type: 'select', blank: false, options: Q_SIZES })}</div>
          <p class="small muted" style="margin-top:-6px">${esc(Q_SIZE_HELP)}</p>
          ${field('Fire Risk Assessment', 'fra', q.fra || '', { type: 'select', blank: false, options: [['', 'Not Needed'], ['new', 'New Assessment'], ['review', 'Review Of Existing Assessment']] })}
          <label class="checkrow"><input type="checkbox" name="hsra" ${q.hsra ? 'checked' : ''}> Health &amp; Safety Risk Assessment</label>
          <div class="grid2">${field('Fire Doors To Inspect', 'doors', q.doors, { type: 'number', attrs: 'min="0"' })}${field('PAT Items (Rough Count)', 'pat', q.pat, { type: 'number', attrs: 'min="0"' })}</div>
          <label class="checkrow"><input type="checkbox" name="plan" ${q.plan ? 'checked' : ''}> 3D Plan And Online Portal Set-Up</label>
          <label class="checkrow"><input type="checkbox" name="labels" ${q.labels ? 'checked' : ''}> QR Labels On Each Door And Item</label>
          <div class="grid2">${field('Distance From You (Miles, One Way)', 'miles', q.miles, { type: 'number', attrs: 'min="0" step="0.5"' })}${field('Number Of Visits', 'visits', q.visits || 1, { type: 'number', attrs: 'min="1"' })}</div>
        </div>
        <div class="card"><div class="spread"><h3 style="margin:0">Extra Lines</h3><button class="btn small" id="qAddLine">+ Add Line</button></div>
          <p class="small muted">Anything not covered above, e.g. emergency lighting check, signage supply, fire extinguisher check.</p>
          <div id="qExtra"></div></div>
      </div>
      <div>
        <div class="card barred"><div class="card-bar"><h3>Price</h3></div><div id="qTotals"></div></div>
        <div class="card" id="qMeta"><h3>Quote Details</h3>
          <div class="grid2">${field('Quote Date', 'date', q.date, { type: 'date' })}${field('Status', 'status', q.status || 'Draft', { type: 'select', blank: false, options: Q_STATUS })}</div>
          <div class="grid2">${field('Discount (%)', 'discount', q.discount || 0, { type: 'number', attrs: 'min="0" max="100" step="0.5"' })}
            ${field('Payment', 'billing', q.billing || 'once', { type: 'select', blank: false, options: [['once', 'One-Off Job'], ['annual', 'Yearly Package (Show Monthly Price)']] })}</div>
          ${field('Notes On The Quote', 'notes', q.notes, { type: 'textarea', placeholder: 'e.g. Visit can be out of hours. Assumes access to all areas on the day.' })}
          <div id="qWin"></div>
        </div>
      </div>
    </div></div>`;

  const save = () => {
    const c = formValues($('#qCust')), s = formValues($('#qSite')), m = formValues($('#qMeta'));
    q.clientId = c.clientId || '';
    q.customer = addrApply({ name: c.name, contact: c.contact, phone: c.phone, email: c.email }, 'address', addrRead(c, 'address'));
    addrApply(q, 'siteAddress', addrRead(s, 'siteAddress'));
    Object.assign(q, { siteName: s.siteName, area: s.area, size: s.size, fra: s.fra, hsra: !!s.hsra, doors: qNum(s.doors), pat: qNum(s.pat), plan: !!s.plan, labels: !!s.labels, miles: qNum(s.miles), visits: Math.max(1, qNum(s.visits) || 1) });
    Object.assign(q, { date: m.date || today(), status: m.status, discount: qNum(m.discount), billing: m.billing, notes: m.notes });
    q.extra = $$('#qExtra .q-line').map(r => ({ desc: $('[data-k=desc]', r).value.trim(), qty: qNum($('[data-k=qty]', r).value) || 1, unit: qNum($('[data-k=unit]', r).value) }));
    Store.upsert('quotes', q);
    paint();
  };
  const paint = () => {
    const c = qCompute(q, P);
    $('#qTotals').innerHTML = c.lines.length ? `<table class="list"><tbody>${c.lines.map(l => `<tr><td>${esc(l.desc)}<div class="small muted">${l.qty} × ${qMoney(l.unit)}</div></td><td style="text-align:right;white-space:nowrap">${qMoney(l.amount)}</td></tr>`).join('')}</tbody></table>
      <div class="q-tot"><span>Total Before VAT</span><b>${qMoney(c.net)}</b></div>
      ${P.vatRegistered ? `<div class="q-tot"><span>VAT At ${P.vatRate}%</span><b>${qMoney(c.vat)}</b></div><div class="q-tot big"><span>Total</span><b>${qMoney(c.total)}</b></div>` : `<div class="q-tot big"><span>Total</span><b>${qMoney(c.total)}</b></div><div class="small muted">Not VAT registered (change this in the Price List).</div>`}
      ${q.billing === 'annual' ? `<div class="q-tot"><span>Or Monthly (Over 12 Months)</span><b>${qMoney(c.monthly)}</b></div>` : ''}
      <div class="q-check ${c.perHour && c.perHour < P.hourlyRate ? 'warn' : ''}"><b>Your check (not printed):</b> about ${c.hours} hours including travel and report writing, so roughly <b>${qMoney(c.perHour)} an hour</b> against your target of ${qMoney(P.hourlyRate)}.${c.perHour && c.perHour < P.hourlyRate ? ' This job is under your target rate.' : ''}
        ${c.services >= 3 && !qNum(q.discount) ? `<br>Three or more services: you could offer your ${P.bundleDiscount}% package discount.` : ''}</div>`
      : '<p class="muted">Choose the work on the left to build the price.</p>';
    $('#qWin').innerHTML = q.status === 'Accepted' && !q.clientId ? `<div class="fd-box good"><div class="fd-box-h">Quote Accepted</div><p class="small">Set this customer up as a client, with the site ready for its plan.</p><button class="btn primary small" id="qToClient">Create Client And Site</button></div>` : '';
    if (typeof accQuoteButton === 'function') $('#qWin').insertAdjacentHTML('beforeend', accQuoteButton(q));
    if ($('#qInvoice')) $('#qInvoice').onclick = () => { save(); invFromQuote(q); };
    if ($('#qToClient')) $('#qToClient').onclick = () => qToClient(q);
  };
  const lineRow = x => `<div class="q-line"><input data-k="desc" placeholder="Description" value="${esc(x.desc || '')}"><input data-k="qty" type="number" min="0" step="any" placeholder="Qty" value="${esc(x.qty ?? 1)}"><input data-k="unit" type="number" step="0.01" placeholder="£ Each" value="${esc(x.unit ?? '')}"><button class="btn small danger" data-rm title="Remove">×</button></div>`;
  $('#qExtra').innerHTML = (q.extra || []).map(lineRow).join('');
  $('#qAddLine').onclick = () => { $('#qExtra').insertAdjacentHTML('beforeend', lineRow({})); save(); };
  $('#qExtra').addEventListener('click', e => { if (e.target.closest('[data-rm]')) { e.target.closest('.q-line').remove(); save(); } });
  $('#qRoot').addEventListener('input', e => {
    if (e.target.name === 'area' && qNum(e.target.value) > 0) { const sel = $('#qSite [name=size]'); sel.value = qSizeFromArea(qNum(e.target.value)); }
    clearTimeout(viewQuote.t); viewQuote.t = setTimeout(save, 250);
  });
  $('#qRoot').addEventListener('change', e => {
    if (e.target.name === 'clientId' && e.target.value) {
      const c = Store.get('clients', e.target.value);
      if (c) {
        const f = $('#qCust'), ap = addrParts(c, 'address');
        [['name', c.name], ['contact', c.contact], ['phone', c.phone], ['email', c.email]].forEach(([k, v]) => { $(`[name=${k}]`, f).value = v || ''; });
        ADDR_BOXES.forEach(([k]) => { $(`[name=address__${k}]`, f).value = ap[k] || ''; });
      }
    }
    save();
  });
  $('#qPrint').onclick = () => { save(); qPrint(q); };
  $('#qCopy').onclick = () => {
    const P2 = qPrices(); const number = 'Q-' + String(P2.nextQuote || 1).padStart(4, '0');
    qSavePrices(Object.assign(P2, { nextQuote: (P2.nextQuote || 1) + 1 }));
    const copy = Store.upsert('quotes', Object.assign(JSON.parse(JSON.stringify(q)), { id: undefined, createdAt: undefined, number, date: today(), status: 'Draft' }));
    toast('Copied as ' + number); go('#/quote/' + copy.id);
  };
  $('#qDel').onclick = async () => { if (await confirmBox('Delete Quote', `Delete quote <b>${esc(q.number)}</b>?`)) { Store.remove('quotes', q.id); toast('Quote deleted'); go('#/quotes'); } };
  paint();
}

function qToClient(q) {
  const cu = q.customer || {};
  if (!cu.name) { toast('Enter the customer name first'); return; }
  const billParts = addrParts(cu, 'address'), siteParts = q.siteAddress ? addrParts(q, 'siteAddress') : billParts;
  const client = Store.upsert('clients', addrApply({ name: cu.name, contact: cu.contact || '', phone: cu.phone || '', email: cu.email || '', area: billParts.town || '', notes: `From quote ${q.number}.` }, 'address', billParts));
  const site = Store.upsert('sites', addrApply({ clientId: client.id, name: q.siteName || 'Main Site', floors: [{ id: Store.uid(), name: 'Ground Floor', level: 0, height: 2.6, rooms: [] }] }, 'address', siteParts, 'postcode'));
  // Never 'siteId' on a quote: the sync would then share the quote with that client's login.
  q.clientId = client.id; q.wonSiteId = site.id; Store.upsert('quotes', q);
  if (typeof invalidateState === 'function') invalidateState();
  toast('Client and site created'); go('#/site/' + site.id + '/plan');
}

/* ---------------- the printed quote ---------------- */
function qBizBlock(s) {
  return [s.address, s.phone, s.email, s.website].filter(Boolean).map(esc).join('<br>');
}
function qPrint(q) {
  const P = qPrices(), s = Store.settings, c = qCompute(q, P), cu = q.customer || {};
  const valid = addDays(q.date || today(), P.validDays || 30);
  const html = `<div class="report qt"><div class="page">
    <div class="qt-head"><div class="qt-brand">${s.logo ? `<img src="${s.logo}" alt="">` : `<img src="icon.svg" alt="">`}<div><div class="qt-name">${esc(s.businessName)}</div><div class="qt-tag">${esc(s.tagline || '')}</div></div></div>
      <div class="qt-biz">${qBizBlock(s)}</div></div>
    <div class="qt-band"><h1>Quotation</h1><div class="qt-meta"><div><span>Quote No.</span><b>${esc(q.number)}</b></div><div><span>Date</span><b>${esc(fmtDate(q.date))}</b></div><div><span>Valid Until</span><b>${esc(fmtDate(valid))}</b></div></div></div>
    <div class="qt-two"><div><h3>For</h3><b>${esc(cu.name || '')}</b>${cu.contact ? '<br>' + esc(cu.contact) : ''}${cu.address ? '<br>' + esc(cu.address).replace(/\n/g, '<br>') : ''}${cu.email ? '<br>' + esc(cu.email) : ''}${cu.phone ? '<br>' + esc(cu.phone) : ''}</div>
      <div><h3>Site</h3><b>${esc(q.siteName || '—')}</b>${q.siteAddress ? '<br>' + esc(q.siteAddress) : ''}${q.area ? `<br>About ${esc(q.area)} m²` : ''}</div></div>
    <table class="qt-table"><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th><th class="r">Amount</th></tr></thead><tbody>
      ${c.lines.map(l => `<tr><td>${esc(l.desc)}</td><td class="r">${l.qty}</td><td class="r">${qMoney(l.unit)}</td><td class="r">${qMoney(l.amount)}</td></tr>`).join('')}
    </tbody></table>
    <div class="qt-totals"><div><span>Total Before VAT</span><b>${qMoney(c.net)}</b></div>
      ${P.vatRegistered ? `<div><span>VAT At ${P.vatRate}%</span><b>${qMoney(c.vat)}</b></div>` : ''}
      <div class="qt-grand"><span>Total${P.vatRegistered ? '' : ' (No VAT Charged)'}</span><b>${qMoney(c.total)}</b></div>
      ${q.billing === 'annual' ? `<div><span>Or Monthly Over 12 Months</span><b>${qMoney(c.monthly)}</b></div>` : ''}</div>
    <div class="qt-inc"><h3>Included</h3><ul>
      ${q.fra ? '<li>Fire risk assessment carried out in line with the Regulatory Reform (Fire Safety) Order 2005, with a written report and a prioritised action plan.</li>' : ''}
      ${q.hsra ? '<li>Health &amp; safety risk assessment with a written report and action plan.</li>' : ''}
      ${qNum(q.doors) ? '<li>Fire door inspection of each door listed: leaf, frame, gaps, seals, hinges, closer, glazing and signage, with photos and a pass / fail result.</li>' : ''}
      ${qNum(q.pat) ? '<li>PAT testing with a pass label on each item and a full test register.</li>' : ''}
      ${q.plan ? '<li>Your own login to our online compliance portal, with a 3D plan of the site showing where every door and item is.</li>' : ''}
      ${q.labels ? '<li>A QR code label on each door and item: scan it to see its full history.</li>' : ''}
      <li>Reports supplied as PDFs, and reminders before anything falls due again.</li></ul></div>
    ${q.notes ? `<div class="qt-notes"><h3>Notes</h3><p>${esc(q.notes).replace(/\n/g, '<br>')}</p></div>` : ''}
    <div class="qt-terms"><h3>Terms</h3><p>${esc(P.terms)}</p>${s.qualifications ? `<p><b>Qualifications:</b> ${esc(s.qualifications)}</p>` : ''}</div>
    <div class="qt-sign"><div>Accepted By (Name)</div><div>Signature</div><div>Date</div></div>
  </div></div>`;
  showPrint(html, { title: `Quote ${q.number} - ${cu.name || ''}` });
}

/* ---------------- price list ---------------- */
function viewPriceList() {
  setCrumbs([['Quotes', '#/quotes'], ['Price List']]);
  const P = qPrices();
  const n = (label, k, step = '0.01', hint) => field(label, k, P[k], { type: 'number', attrs: `min="0" step="${step}"`, hint });
  $('#view').innerHTML = `
    <div class="spread dash-hello"><div><h1>Price List</h1><div class="muted">Your rates before VAT. Only you can see these; quotes are worked out from them.</div></div>
      <div class="row"><button class="btn" id="pReset">Back To Starting Prices</button><button class="btn primary" id="pSave">Save Price List</button></div></div>
    <div class="grid2" style="align-items:start;gap:14px" id="pForm">
      <div>
        <div class="card"><h3>Your Target</h3>
          <div class="grid2">${n('Target Hourly Rate (£)', 'hourlyRate', '1', 'Each quote shows what it works out at per hour.')}${n('Minimum Charge Per Visit (£)', 'minCharge', '1')}</div>
          <div class="grid2">${n('Package Discount (%)', 'bundleDiscount', '0.5', 'Suggested when three or more services are booked.')}${n('Quote Valid For (Days)', 'validDays', '1')}</div>
          <label class="checkrow"><input type="checkbox" name="vatRegistered" ${P.vatRegistered ? 'checked' : ''}> VAT Registered</label>
          ${n('VAT Rate (%)', 'vatRate', '0.5')}
        </div>
        <div class="card"><h3>Fire Doors</h3>
          <div class="grid3">${n('Per Door (£)', 'doorEach')}${n('Minimum (£)', 'doorMin', '1')}${n('Minutes Per Door', 'minsDoor', '1')}</div></div>
        <div class="card"><h3>PAT Testing</h3>
          <div class="grid2">${n('Per Item (£)', 'patEach')}${n('Per Item, Large Jobs (£)', 'patEach2')}</div>
          <div class="grid3">${n('Large Job From (Items)', 'patTierFrom', '1')}${n('Minimum (£)', 'patMin', '1')}${n('Minutes Per Item', 'minsPat', '0.5')}</div></div>
        <div class="card"><h3>Travel And Labels</h3>
          <div class="grid3">${n('Free Miles (Each Way)', 'milesFree', '1')}${n('Per Mile Beyond (£)', 'mileRate')}${n('Average Speed (mph)', 'mph', '1')}</div>
          ${n('QR Label Per Item (£)', 'labelEach')}</div>
      </div>
      <div>
        <div class="card"><h3>Fire Risk Assessments</h3>
          <div class="grid3">${n('Small (£)', 'fraSmall', '1')}${n('Medium (£)', 'fraMedium', '1')}${n('Large (£)', 'fraLarge', '1')}</div>
          <div class="grid3">${n('Hours, Small', 'hrsFraSmall', '0.5')}${n('Hours, Medium', 'hrsFraMedium', '0.5')}${n('Hours, Large', 'hrsFraLarge', '0.5')}</div>
          ${n('Review Of An Existing Assessment (£)', 'fraReview', '1')}</div>
        <div class="card"><h3>Health &amp; Safety Risk Assessments</h3>
          <div class="grid3">${n('Small (£)', 'hsraSmall', '1')}${n('Medium (£)', 'hsraMedium', '1')}${n('Large (£)', 'hsraLarge', '1')}</div>
          <div class="grid3">${n('Hours, Small', 'hrsHsraSmall', '0.5')}${n('Hours, Medium', 'hrsHsraMedium', '0.5')}${n('Hours, Large', 'hrsHsraLarge', '0.5')}</div></div>
        <div class="card"><h3>3D Plan And Portal Set-Up</h3>
          <div class="grid3">${n('Small (£)', 'planSmall', '1')}${n('Medium (£)', 'planMedium', '1')}${n('Large (£)', 'planLarge', '1')}</div>
          <div class="grid3">${n('Hours, Small', 'hrsPlanSmall', '0.5')}${n('Hours, Medium', 'hrsPlanMedium', '0.5')}${n('Hours, Large', 'hrsPlanLarge', '0.5')}</div></div>
        <div class="card"><h3>Terms Printed On Quotes</h3>${field('Terms', 'terms', P.terms, { type: 'textarea' })}</div>
        <p class="small muted">${esc(Q_SIZE_HELP)} Hours include the visit and writing the report, not travel (travel time is added from the miles).</p>
      </div>
    </div>`;
  $('#pSave').onclick = () => {
    const v = formValues($('#pForm'));
    const out = Object.assign({}, P);
    for (const k of Object.keys(Q_DEFAULT_PRICES)) {
      if (!(k in v)) continue;
      out[k] = typeof Q_DEFAULT_PRICES[k] === 'number' ? qNum(v[k]) : v[k];
    }
    qSavePrices(out); toast('Price list saved');
  };
  $('#pReset').onclick = async () => {
    if (!(await confirmBox('Starting Prices', 'Put every rate back to the starting prices? Your quote numbers and leaflet wording are kept.', 'Reset'))) return;
    const keep = { nextQuote: P.nextQuote, leafletArea: P.leafletArea, leafletIntro: P.leafletIntro, leafletPrices: P.leafletPrices };
    qSavePrices(Object.assign({}, Q_DEFAULT_PRICES, keep)); viewPriceList(); toast('Starting prices restored');
  };
}

/* ---------------- leaflet ---------------- */
function qLeafletDialog() {
  const P = qPrices();
  openModal({
    title: 'Print Leaflet',
    body: `<p class="small muted">A double-sided A4 leaflet using your business details from Settings. Print it double-sided (flip on long edge).</p>
      ${field('Area You Cover', 'leafletArea', P.leafletArea)}
      ${field('Opening Line', 'leafletIntro', P.leafletIntro, { type: 'textarea' })}
      <label class="checkrow"><input type="checkbox" name="leafletPrices" ${P.leafletPrices ? 'checked' : ''}> Show "From" Prices</label>
      ${!Store.settings.phone && !Store.settings.email ? '<div class="fd-box warn"><div class="fd-box-h">No Contact Details Yet</div><p class="small">Add your phone and email in Settings first, or the leaflet will have no way to contact you.</p></div>' : ''}`,
    buttons: [{ label: 'Cancel', onClick: () => true }, { label: 'Make Leaflet', cls: 'primary', onClick: m => {
      const v = formValues(m);
      qSavePrices(Object.assign(qPrices(), { leafletArea: v.leafletArea, leafletIntro: v.leafletIntro, leafletPrices: !!v.leafletPrices }));
      setTimeout(qPrintLeaflet, 0); return true;
    } }]
  });
}

async function qPrintLeaflet() {
  const P = qPrices(), s = Store.settings;
  const from = (n, unit) => P.leafletPrices ? `<div class="lf-from">From <b>${qMoney(n).replace('.00', '')}</b>${unit ? ' ' + unit : ''}</div>` : '';
  const qrTarget = s.website ? (/^https?:/i.test(s.website) ? s.website : 'https://' + s.website) : s.phone ? 'tel:' + s.phone.replace(/\s+/g, '') : s.email ? 'mailto:' + s.email : '';
  const qr = qrTarget ? await qrDataUrl(qrTarget, 300) : '';
  const ic = name => (typeof themeIcon === 'function' ? themeIcon(name, 30) : '');
  const contact = `<div class="lf-contact"><div><div class="lf-call">Book A Free Chat And Quote</div>
      ${s.phone ? `<div class="lf-big">${esc(s.phone)}</div>` : ''}${s.email ? `<div>${esc(s.email)}</div>` : ''}${s.website ? `<div>${esc(s.website)}</div>` : ''}${s.assessorName ? `<div class="lf-who">Ask for ${esc(s.assessorName)}</div>` : ''}</div>
    ${qr ? `<img src="${qr}" alt="">` : ''}</div>`;
  const html = `<div class="lf">
  <div class="lf-page">
    <div class="lf-hero">
      <div class="lf-brand">${s.logo ? `<img src="${s.logo}" alt="">` : '<img src="icon.svg" alt="">'}<div><div class="lf-name">${esc(s.businessName)}</div><div class="lf-area">${esc(P.leafletArea || '')}</div></div></div>
      <h1>Fire Safety &amp; Compliance,<br><span>Done Properly And Kept Up To Date</span></h1>
      <p>${esc(P.leafletIntro || '')}</p>
    </div>
    <div class="lf-services">
      <div class="lf-svc"><div class="lf-ic">${ic('door')}</div><h2>Fire Door Inspections</h2><p>Every door checked: leaf, frame, gaps, seals, hinges, closer, glazing and signs, with photos and a clear pass or fail.</p>${from(P.doorEach, 'per door')}</div>
      <div class="lf-svc"><div class="lf-ic">${ic('flame')}</div><h2>Fire Risk Assessments</h2><p>A written assessment of your premises with a prioritised action plan, as the law requires of every business.</p>${from(P.fraSmall)}</div>
      <div class="lf-svc"><div class="lf-ic">${ic('check')}</div><h2>Health &amp; Safety Risk Assessments</h2><p>Hazards found, risks rated and practical actions set out in plain English.</p>${from(P.hsraSmall)}</div>
      <div class="lf-svc"><div class="lf-ic">${ic('alert')}</div><h2>PAT Testing</h2><p>Portable appliances tested and labelled, with a full register you can show your insurer.</p>${from(P.patEach, 'per item')}</div>
    </div>
    <div class="lf-who-box"><h3>Who We Help</h3><div class="lf-tags">
      <span>Offices &amp; Shops</span><span>Industrial Units &amp; Depots</span><span>Blocks Of Flats &amp; Managing Agents</span><span>Landlords &amp; HMOs</span><span>Pubs, Cafés &amp; Restaurants</span><span>Churches, Halls &amp; Community Buildings</span><span>Care, Health &amp; Childcare</span></div></div>
    ${contact}
  </div>
  <div class="lf-page">
    <div class="lf-portal"><h2>Your Own Online Compliance Portal</h2><p>Most inspectors leave you a PDF. We give you a login.</p>
      <div class="lf-feats">
        <div><b>A 3D Plan Of Your Building</b><span>See exactly where every fire door, extinguisher and appliance is.</span></div>
        <div><b>A QR Code On Every Item</b><span>Scan a door or appliance with a phone to see its full history.</span></div>
        <div><b>Reminders Before Things Are Due</b><span>No more missed inspections or out-of-date assessments.</span></div>
        <div><b>Every Report In One Place</b><span>Download PDFs for your insurer, landlord or the fire service at any time.</span></div>
      </div></div>
    <div class="lf-steps"><h2>How It Works</h2><ol>
      <li><b>Free Chat And Quote</b><span>Tell us about your premises; you get a fixed price.</span></li>
      <li><b>One Visit</b><span>We do the doors, assessments and testing together where we can.</span></li>
      <li><b>Report And Portal</b><span>Your reports, action plan and portal login.</span></li>
      <li><b>We Remind You</b><span>Re-inspections booked before they fall due.</span></li></ol></div>
    <div class="lf-law"><h2>Did You Know?</h2><ul>
      <li>Under the <b>Regulatory Reform (Fire Safety) Order 2005</b>, the person responsible for a business or the common parts of a building must have a suitable and sufficient fire risk assessment, and keep it under review.</li>
      <li>In blocks of flats over 11 metres, the <b>Fire Safety (England) Regulations 2022</b> require communal fire doors to be checked every three months, and flat entrance doors every year where possible.</li>
      <li>The <b>Electricity at Work Regulations 1989</b> require electrical equipment to be kept safe; PAT testing is the usual way to show it is.</li></ul></div>
    ${s.qualifications ? `<div class="lf-quals">${esc(s.qualifications)}</div>` : ''}
    ${contact}
  </div></div>`;
  showPrint(html, { title: `${s.businessName} Leaflet` });
}
