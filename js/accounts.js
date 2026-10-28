'use strict';

/* Compliance Plus - Accounts (v2.0.0).
   Everything is kept in the 'accounts' collection, which only staff can read online (rows never have a client_id).
   Record kinds:
     settings  (id 'acc-settings')  business type, year start, invoice numbering, bank details for invoices, VAT details
     bankacct  a bank, cash or card account with its opening balance
     invoice   a sales invoice (lines, customer, dates); paid / overdue is worked out from its payments
     payment   money in: against an invoice, or other income / capital put in
     expense   money out: a purchase with category, VAT, business-use share and a receipt picture
     transfer  money moved between your own accounts
     mileage   business miles at the HMRC approved rates (45p for the first 10,000 miles in a year, then 25p)
     banktx    a line imported from a bank statement, matched to a payment / expense / transfer or set aside
   VAT on/off and the VAT rate are shared with the Quotes price list. */

const ACC = 'accounts';
const ACC_DEFAULTS = {
  structure: 'sole',            // 'sole' = sole trader, 'ltd' = limited company
  basis: 'cash',                // 'cash' basis or 'accrual' (traditional) for profit
  yearStart: '04-06',           // month-day the accounting year starts: 6 April = the tax year
  payDays: 14, nextInvoice: 1, invPrefix: 'INV-',
  bankName: '', accountName: '', sortCode: '', accountNo: '',
  vatNumber: '', vatScheme: 'standard', vatCash: false, flatRate: 0,
  companyNo: '', utr: '',
  invoiceFooter: 'Thank you for your business.',
  otherIncome: 0
};

/* HMRC self-employment expense headings. pl:false = not a business cost (kept out of profit). */
const ACC_EXP_CATS = [
  ['goods', 'Materials & Stock (Labels, Signs, Parts)', true],
  ['travel', 'Car, Van & Travel', true],
  ['staff', 'Wages, Staff & Subcontractors', true],
  ['premises', 'Rent, Rates, Power & Premises Insurance', true],
  ['repairs', 'Repairs & Maintenance', true],
  ['office', 'Phone, Internet, Software & Office', true],
  ['advert', 'Advertising & Marketing', true],
  ['interest', 'Bank Charges & Loan Interest', true],
  ['prof', 'Accountancy, Legal & Professional Fees', true],
  ['insurance', 'Business Insurance (PI, Public Liability)', true],
  ['training', 'Training, Accreditation & Memberships', true],
  ['equipment', 'Equipment & Tools (Testers, Laptop, Ladders)', true],
  ['other', 'Other Allowable Expenses', true],
  ['drawings', 'Drawings / Personal (Not A Business Cost)', false],
  ['tax', 'Income Tax, NI Or Corporation Tax Paid', false],
  ['vatpaid', 'VAT Paid To HMRC', false],
  ['loanrepay', 'Loan Repayment (Not The Interest)', false]
];
const ACC_IN_CATS = [
  ['sales', 'Sales (No Invoice)', true],
  ['otherinc', 'Other Business Income', true],
  ['capital', 'Money Put In By You (Not Income)', false],
  ['loan', 'Loan Received (Not Income)', false],
  ['vatrefund', 'VAT Refund From HMRC (Not Income)', false]
];
const ACC_METHODS = ['Bank Transfer', 'Card', 'Cash', 'Cheque', 'Direct Debit', 'Other'];

const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const accMoney = n => qMoney(n);
const accCat = (list, k) => (list.find(c => c[0] === k) || [k, k, true]);

function accAll(kind) { return Store.list(ACC).filter(r => r.kind === kind); }
function accSettings() { return Object.assign({}, ACC_DEFAULTS, Store.get(ACC, 'acc-settings') || {}); }
function accSaveSettings(s) { Store.upsert(ACC, Object.assign({}, s, { id: 'acc-settings', kind: 'settings' })); }
function accVat() { const P = qPrices(); return { on: !!P.vatRegistered, rate: qNum(P.vatRate) || 20 }; }
function accBanks() {
  let list = accAll('bankacct');
  if (!list.length) list = [Store.upsert(ACC, { kind: 'bankacct', name: 'Business Bank Account', type: 'bank', opening: 0, openDate: accYearStart(today()) })];
  return list.sort((a, b) => (a.order || 0) - (b.order || 0) || (a.name || '').localeCompare(b.name || ''));
}
function accBankName(id) { return (Store.get(ACC, id) || {}).name || '—'; }

/* ---------- accounting years ---------- */
function accYearStart(iso, S) {
  S = S || accSettings();
  const [mm, dd] = String(S.yearStart || '04-06').split('-');
  const y = +String(iso).slice(0, 4);
  const start = `${y}-${mm}-${dd}`;
  return iso < start ? `${y - 1}-${mm}-${dd}` : start;
}
function accYearEnd(start) { return addDays(addMonths(start, 12), -1); }
function accYearName(start) {
  const end = accYearEnd(start);
  return start.slice(5) === '04-06' ? `Tax Year ${start.slice(0, 4)}/${end.slice(2, 4)}` : `Year To ${fmtDate(end)}`;
}
function accYears() {
  const S = accSettings(), now = accYearStart(today(), S);
  let first = now;
  for (const r of Store.list(ACC)) if (r.date && /^\d{4}-\d\d-\d\d$/.test(r.date)) { const y = accYearStart(r.date, S); if (y < first) first = y; }
  const out = [];
  for (let y = now; y >= first; y = addMonths(y, -12)) { out.push(y); if (out.length > 30) break; }
  return out;
}
/* the period picked on the accounts pages (remembered while the portal is open) */
const accView = { from: null, to: null };
function accPeriod() {
  if (!accView.from) { accView.from = accYearStart(today()); accView.to = accYearEnd(accView.from); }
  return { from: accView.from, to: accView.to };
}
const inPeriod = (d, p) => d && d >= p.from && d <= p.to;
function accPeriodPicker() {
  const p = accPeriod();
  const years = accYears();
  const sel = years.find(y => y === p.from && accYearEnd(y) === p.to) || 'custom';
  return `<div class="acc-period"><select id="accYear">${years.map(y => `<option value="${y}" ${sel === y ? 'selected' : ''}>${esc(accYearName(y))}</option>`).join('')}
    <option value="custom" ${sel === 'custom' ? 'selected' : ''}>Other Dates…</option></select>
    <span class="acc-dates ${sel === 'custom' ? '' : 'hide'}"><input type="date" id="accFrom" value="${p.from}"> to <input type="date" id="accTo" value="${p.to}"></span></div>`;
}
function accBindPeriod(redraw) {
  const y = $('#accYear'); if (!y) return;
  y.onchange = () => {
    if (y.value === 'custom') { $('.acc-dates').classList.remove('hide'); return; }
    accView.from = y.value; accView.to = accYearEnd(y.value); redraw();
  };
  const set = () => { const f = $('#accFrom').value, t = $('#accTo').value; if (f && t && f <= t) { accView.from = f; accView.to = t; redraw(); } };
  $('#accFrom').onchange = set; $('#accTo').onchange = set;
}

/* ---------- invoices ---------- */
function invVat(inv) { const V = accVat(); return { on: inv && inv.vatOn !== undefined ? !!inv.vatOn : V.on, rate: V.rate }; }
function invTotals(inv) {
  const V = invVat(inv);
  let net = 0, vat = 0;
  const lines = (inv.lines || []).filter(l => l.desc || qNum(l.unit)).map(l => {
    const amount = r2(qNum(l.qty || 1) * qNum(l.unit));
    const rate = V.on ? (l.vatRate === undefined || l.vatRate === '' ? V.rate : qNum(l.vatRate)) : 0;
    const v = r2(amount * rate / 100);
    net += amount; vat += v;
    return Object.assign({}, l, { amount, rate, vat: v });
  });
  net = r2(net); vat = r2(vat);
  return { lines, net, vat, total: r2(net + vat) };
}
function invPayments(inv) { return accAll('payment').filter(p => p.invoiceId === inv.id).sort((a, b) => (a.date || '').localeCompare(b.date || '')); }
function invState(inv) {
  const t = invTotals(inv);
  const paid = r2(invPayments(inv).reduce((s, p) => s + qNum(p.amount), 0));
  const due = r2(t.total - paid);
  let status = inv.status || 'Draft';
  if (status === 'Void') return { status, t, paid, due: 0 };
  if (status !== 'Draft') {
    if (due <= 0.004 && t.total > 0) status = 'Paid';
    else if (inv.dueDate && inv.dueDate < today()) status = 'Overdue';
    else if (paid > 0) status = 'Part Paid';
    else status = 'Sent';
  }
  return { status, t, paid, due: status === 'Draft' ? 0 : Math.max(0, due) };
}
function invBadge(status) {
  const cls = { Paid: 'b-pass', Overdue: 'b-fail', 'Part Paid': 'b-advisory', Sent: 'b-due' }[status] || 'b-untested';
  return `<span class="badge ${cls}">${esc(status)}</span>`;
}
function invNextNumber() {
  const S = accSettings();
  const n = S.nextInvoice || 1;
  accSaveSettings(Object.assign(S, { nextInvoice: n + 1 }));
  return (S.invPrefix || 'INV-') + String(n).padStart(4, '0');
}
function invNew(base) {
  const S = accSettings(), d = today();
  const inv = Object.assign({ kind: 'invoice', vatOn: accVat().on, number: invNextNumber(), date: d, dueDate: addDays(d, qNum(S.payDays) || 14), status: 'Draft', customer: {}, lines: [{ desc: '', qty: 1, unit: '' }] }, base || {});
  return Store.upsert(ACC, inv);
}
function invForClient(clientId) {
  const c = Store.get('clients', clientId) || {};
  const cu = addrApply({ name: c.name || '', contact: c.contact || '', email: c.email || '', phone: c.phone || '' }, 'address', addrParts(c, 'address'));
  const inv = invNew({ clientId, customer: cu });
  go('#/invoice/' + inv.id);
}
function invFromQuote(q) {
  const existing = accAll('invoice').find(i => i.quoteId === q.id);
  if (existing) { go('#/invoice/' + existing.id); return; }
  const c = qCompute(q, qPrices());
  const cu = Object.assign({}, q.customer || {});
  const inv = invNew({ quoteId: q.id, clientId: q.clientId || '', customer: cu, siteName: q.siteName || '', poRef: '',
    lines: c.lines.map(l => ({ desc: l.desc, qty: l.qty, unit: l.unit })),
    notes: `For the work in quote ${q.number}${q.siteName ? ' at ' + q.siteName : ''}.` });
  toast('Invoice ' + inv.number + ' created from the quote');
  go('#/invoice/' + inv.id);
}
function accQuoteButton(q) {
  if (q.status !== 'Accepted') return '';
  const inv = accAll('invoice').find(i => i.quoteId === q.id);
  return inv ? `<p class="small" style="margin-top:10px">Invoiced: <a href="#/invoice/${inv.id}">${esc(inv.number)}</a></p>`
    : '<button class="btn small" id="qInvoice" style="margin-top:10px">Create Invoice From This Quote</button>';
}

/* ---------- bank balances ---------- */
function accMovements(bankId) {
  const b = Store.get(ACC, bankId) || {};
  const out = [];
  for (const p of accAll('payment')) if (p.bankId === bankId) out.push({ date: p.date, desc: accPaymentLabel(p), amount: qNum(p.amount), rec: p });
  for (const e of accAll('expense')) if (e.bankId === bankId) out.push({ date: e.date, desc: `${e.supplier || 'Expense'}${e.desc ? ' – ' + e.desc : ''}`, amount: -qNum(e.total), rec: e });
  for (const t of accAll('transfer')) {
    if (t.fromId === bankId) out.push({ date: t.date, desc: 'Transfer To ' + accBankName(t.toId), amount: -qNum(t.amount), rec: t });
    if (t.toId === bankId) out.push({ date: t.date, desc: 'Transfer From ' + accBankName(t.fromId), amount: qNum(t.amount), rec: t });
  }
  out.sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.rec.createdAt || '').localeCompare(b.rec.createdAt || ''));
  let bal = qNum(b.opening);
  for (const m of out) { if (!b.openDate || m.date >= b.openDate) bal = r2(bal + m.amount); m.balance = bal; }
  return { list: out, balance: bal };
}
function accPaymentLabel(p) {
  const inv = p.invoiceId ? Store.get(ACC, p.invoiceId) : null;
  if (inv) return `${inv.number} – ${(inv.customer || {}).name || ''}`;
  return `${p.from || accCat(ACC_IN_CATS, p.category)[1]}${p.ref ? ' – ' + p.ref : ''}`;
}

/* ---------- mileage ---------- */
function accMileageValues() {
  // 45p for the first 10,000 business miles in each tax year, then 25p (HMRC approved rates for cars and vans)
  const list = accAll('mileage').sort((a, b) => (a.date || '').localeCompare(b.date || '') || (a.createdAt || '').localeCompare(b.createdAt || ''));
  const run = {};
  const vals = new Map();
  for (const m of list) {
    const y = accYearStart(m.date || today(), { yearStart: '04-06' });
    const before = run[y] || 0, miles = qNum(m.miles);
    const hi = Math.max(0, Math.min(miles, 10000 - before)), lo = miles - hi;
    vals.set(m.id, r2(hi * 0.45 + lo * 0.25));
    run[y] = before + miles;
  }
  return vals;
}

/* ---------- profit & loss ---------- */
function accPL(p, basisOverride) {
  const S = accSettings(), basis = basisOverride || S.basis;
  const V = accVat();
  const inc = { sales: 0, other: 0, nonPL: 0, salesList: [] };
  if (basis === 'accrual') {
    for (const inv of accAll('invoice')) {
      const st = invState(inv);
      if (st.status === 'Draft' || st.status === 'Void' || !inPeriod(inv.date, p)) continue;
      inc.sales += st.t.net;
    }
    for (const pay of accAll('payment')) if (!pay.invoiceId && inPeriod(pay.date, p)) {
      const c = accCat(ACC_IN_CATS, pay.category);
      const net = r2(qNum(pay.amount) - qNum(pay.vat));
      if (!c[2]) inc.nonPL += qNum(pay.amount); else if (pay.category === 'sales') inc.sales += net; else inc.other += net;
    }
  } else {
    for (const pay of accAll('payment')) if (inPeriod(pay.date, p)) {
      if (pay.invoiceId) {
        const inv = Store.get(ACC, pay.invoiceId);
        // take the VAT share out of each payment
        const t = inv ? invTotals(inv) : null;
        const share = t && t.total ? t.net / t.total : 1;
        inc.sales += r2(qNum(pay.amount) * share);
      } else {
        const c = accCat(ACC_IN_CATS, pay.category);
        const net = r2(qNum(pay.amount) - qNum(pay.vat));
        if (!c[2]) inc.nonPL += qNum(pay.amount); else if (pay.category === 'sales') inc.sales += net; else inc.other += net;
      }
    }
  }
  const cats = {}; let exp = 0, nonPL = 0, privateShare = 0;
  for (const e of accAll('expense')) if (inPeriod(e.date, p)) {
    const c = accCat(ACC_EXP_CATS, e.category);
    const net = r2(qNum(e.total) - (V.on ? qNum(e.vat) : 0));
    if (!c[2]) { nonPL += qNum(e.total); continue; }
    const pct = e.businessPct === undefined || e.businessPct === '' ? 100 : qNum(e.businessPct);
    const allow = r2(net * pct / 100);
    privateShare += r2(net - allow);
    cats[e.category || 'other'] = r2((cats[e.category || 'other'] || 0) + allow);
    exp += allow;
  }
  const mv = accMileageValues();
  let mileage = 0, miles = 0;
  for (const m of accAll('mileage')) if (inPeriod(m.date, p)) { mileage += mv.get(m.id) || 0; miles += qNum(m.miles); }
  mileage = r2(mileage);
  inc.sales = r2(inc.sales); inc.other = r2(inc.other);
  const income = r2(inc.sales + inc.other);
  const expenses = r2(exp + mileage);
  return { basis, income, sales: inc.sales, other: inc.other, nonPLIn: r2(inc.nonPL), cats, mileage, miles, expenses, profit: r2(income - expenses), nonPLOut: r2(nonPL), privateShare: r2(privateShare) };
}

/* rough tax to put aside: sole trader income tax + Class 4 NI (England; thresholds frozen to 2028), or corporation tax */
function accTaxEstimate(profit) {
  const S = accSettings();
  if (S.structure === 'ltd') {
    const P = Math.max(0, profit);
    let ct;
    if (P <= 50000) ct = P * 0.19;
    else if (P >= 250000) ct = P * 0.25;
    else ct = P * 0.25 - (250000 - P) * 3 / 200;
    return { lines: [['Corporation Tax (Estimate)', r2(ct)]], total: r2(ct) };
  }
  const other = Math.max(0, qNum(S.otherIncome));
  const total = Math.max(0, profit) + other;
  let pa = 12570;
  if (total > 100000) pa = Math.max(0, pa - (total - 100000) / 2);
  const band = (x, lo, hi) => Math.max(0, Math.min(x, hi) - lo);
  const taxOn = x => { const t = Math.max(0, x - pa); return band(t, 0, 37700) * 0.2 + band(t, 37700, 125140 - pa) * 0.4 + Math.max(0, t - (125140 - pa)) * 0.45; };
  const it = r2(taxOn(total) - taxOn(other));
  const P = Math.max(0, profit);
  const ni = r2(band(P, 12570, 50270) * 0.06 + Math.max(0, P - 50270) * 0.02);
  return { lines: [['Income Tax On This Profit', it], ['Class 4 National Insurance', ni]], total: r2(it + ni) };
}

/* ---------- VAT return ---------- */
function accVatReturn(p) {
  const S = accSettings(), V = accVat();
  let outVat = 0, sales = 0, inVat = 0, purchases = 0, gross = 0;
  if (S.vatCash) {
    for (const pay of accAll('payment')) if (inPeriod(pay.date, p)) {
      const c = accCat(ACC_IN_CATS, pay.category);
      if (pay.invoiceId) {
        const inv = Store.get(ACC, pay.invoiceId); const t = inv ? invTotals(inv) : null;
        const share = t && t.total ? qNum(pay.amount) / t.total : 0;
        outVat += t ? t.vat * share : 0; sales += t ? t.net * share : qNum(pay.amount); gross += qNum(pay.amount);
      } else if (c[2]) { outVat += qNum(pay.vat); sales += qNum(pay.amount) - qNum(pay.vat); gross += qNum(pay.amount); }
    }
  } else {
    for (const inv of accAll('invoice')) {
      const st = invState(inv);
      if (st.status === 'Draft' || st.status === 'Void' || !inPeriod(inv.date, p)) continue;
      outVat += st.t.vat; sales += st.t.net; gross += st.t.total;
    }
    for (const pay of accAll('payment')) if (!pay.invoiceId && inPeriod(pay.date, p) && accCat(ACC_IN_CATS, pay.category)[2]) {
      outVat += qNum(pay.vat); sales += qNum(pay.amount) - qNum(pay.vat); gross += qNum(pay.amount);
    }
  }
  for (const e of accAll('expense')) if (inPeriod(e.date, p) && accCat(ACC_EXP_CATS, e.category)[2]) {
    const pct = e.businessPct === undefined || e.businessPct === '' ? 100 : qNum(e.businessPct);
    inVat += qNum(e.vat) * pct / 100; purchases += (qNum(e.total) - qNum(e.vat)) * pct / 100;
  }
  const flat = S.vatScheme === 'flat';
  const b1 = r2(flat ? gross * qNum(S.flatRate) / 100 : outVat);
  const b4 = r2(flat ? 0 : inVat);
  return { on: V.on, flat, boxes: [b1, 0, b1, b4, r2(b1 - b4), Math.floor(flat ? gross : sales), Math.floor(flat ? 0 : purchases), 0, 0] };
}
function accVatQuarters() {
  // calendar quarters going back two years; HMRC may give you different "stagger" months, so other dates can be picked too
  const out = [];
  const d = new Date(today() + 'T12:00:00');
  let y = d.getFullYear(), q = Math.floor(d.getMonth() / 3);
  for (let i = 0; i < 8; i++) {
    const from = `${y}-${String(q * 3 + 1).padStart(2, '0')}-01`;
    out.push([from, addDays(addMonths(from, 3), -1)]);
    q--; if (q < 0) { q = 3; y--; }
  }
  return out;
}

/* ---------- shared bits ---------- */
function accTabs(active) {
  const tabs = [['', 'Overview'], ['invoices', 'Invoices'], ['money-in', 'Money In'], ['expenses', 'Expenses'], ['mileage', 'Mileage'], ['bank', 'Bank'], ['reports', 'Reports & Tax'], ['settings', 'Settings']];
  return `<nav class="tabs">${tabs.map(([k, l]) => `<a href="#/accounts${k ? '/' + k : ''}" class="${active === k ? 'active' : ''}">${l}</a>`).join('')}</nav>`;
}
function accHead(title, sub, buttons, tab) {
  return `<div class="spread dash-hello"><div><h1>${esc(title)}</h1><div class="muted">${sub}</div></div><div class="row">${buttons || ''}</div></div>${accTabs(tab)}`;
}
function accBankOptions(sel) { return accBanks().map(b => [b.id, b.name]); }
function accDownload(name, text, type) {
  const blob = new Blob([text], { type: type || 'text/csv' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
function accCsv(rows) {
  return rows.map(r => r.map(v => { const s = String(v ?? ''); return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; }).join(',')).join('\r\n');
}

/* ---------- Overview ---------- */
function viewAccounts() {
  setCrumbs([['Accounts']]);
  const p = accPeriod(), pl = accPL(p), V = accVat();
  const invs = accAll('invoice').map(i => ({ i, st: invState(i) }));
  const owed = invs.filter(x => x.st.due > 0);
  const overdue = owed.filter(x => x.st.status === 'Overdue');
  const owedSum = r2(owed.reduce((s, x) => s + x.st.due, 0));
  const banks = accBanks().map(b => ({ b, bal: accMovements(b.id).balance }));
  const tax = accTaxEstimate(pl.profit);
  const unmatched = accAll('banktx').filter(t => !t.link && !t.ignored).length;
  let vatLine = '';
  if (V.on) {
    const qs = accVatQuarters(); const cur = { from: qs[0][0], to: qs[0][1] };
    const vr = accVatReturn(cur);
    vatLine = `<div class="acc-kv"><span>VAT For This Quarter So Far</span><b>${accMoney(vr.boxes[4])}</b></div>`;
  }
  const recent = [...accAll('payment').map(x => ({ d: x.date, t: 'in', x })), ...accAll('expense').map(x => ({ d: x.date, t: 'out', x }))]
    .sort((a, b) => (b.d || '').localeCompare(a.d || '') || (b.x.createdAt || '').localeCompare(a.x.createdAt || '')).slice(0, 8);
  $('#view').innerHTML = `${accHead('Accounts', 'Invoices, money in and out, bank, VAT and tax for your business. Only you can see this.',
    '<button class="btn" id="aExp">+ Expense</button><button class="btn" id="aIn">+ Money In</button><button class="btn primary" id="aInv">+ New Invoice</button>', '')}
    ${accPeriodPicker()}
    <div class="dash-stats">
      <div class="dash-stat"><span class="dash-stat-lbl">Income</span><span class="dash-stat-num">${accMoney(pl.income).replace(/\.\d\d$/, '')}</span><span class="dash-stat-sub">${pl.basis === 'cash' ? 'Money received' : 'Invoiced'} in this period</span><span class="dash-stat-ic lime">${themeIconSafe('quotes')}</span></div>
      <div class="dash-stat"><span class="dash-stat-lbl">Expenses</span><span class="dash-stat-num">${accMoney(pl.expenses).replace(/\.\d\d$/, '')}</span><span class="dash-stat-sub">Including ${accMoney(pl.mileage)} mileage</span><span class="dash-stat-ic berry">${themeIconSafe('check')}</span></div>
      <div class="dash-stat ${pl.profit < 0 ? 'alert' : ''}"><span class="dash-stat-lbl">Profit</span><span class="dash-stat-num">${accMoney(pl.profit).replace(/\.\d\d$/, '')}</span><span class="dash-stat-sub">Put aside about ${accMoney(tax.total)} for tax</span><span class="dash-stat-ic">${themeIconSafe('dashboard')}</span></div>
      <a class="dash-stat ${overdue.length ? 'alert' : ''}" href="#/accounts/invoices"><span class="dash-stat-lbl">Owed To You</span><span class="dash-stat-num">${accMoney(owedSum).replace(/\.\d\d$/, '')}</span><span class="dash-stat-sub">${owed.length} unpaid, ${overdue.length} overdue</span><span class="dash-stat-ic ${overdue.length ? 'red' : 'lime'}">${themeIconSafe('due')}</span></a>
    </div>
    <div class="dash-row">
      <div class="card barred"><div class="card-bar"><h3>Bank & Cash</h3><a href="#/accounts/bank">Bank</a></div>
        ${banks.map(x => `<div class="acc-kv"><span><a href="#/accounts/bank/${x.b.id}">${esc(x.b.name)}</a></span><b class="${x.bal < 0 ? 'neg' : ''}">${accMoney(x.bal)}</b></div>`).join('')}
        ${vatLine}
        ${unmatched ? `<p class="small" style="margin-top:10px"><a href="#/accounts/bank">${unmatched} bank statement line${unmatched === 1 ? '' : 's'} still to match</a></p>` : ''}
        <div class="row" style="margin-top:12px"><button class="btn small" id="aMiles">+ Mileage</button><button class="btn small" id="aTransfer">+ Transfer</button></div></div>
      <div class="card barred"><div class="card-bar"><h3>Unpaid Invoices</h3><a href="#/accounts/invoices">All Invoices</a></div>
        ${owed.length ? `<table class="list"><tbody>${owed.sort((a, b) => (a.i.dueDate || '').localeCompare(b.i.dueDate || '')).slice(0, 8).map(x => `<tr class="click" data-href="#/invoice/${x.i.id}"><td><b>${esc(x.i.number)}</b><div class="small muted">${esc((x.i.customer || {}).name || '')}</div></td><td class="small">Due ${esc(fmtDate(x.i.dueDate))}</td><td>${invBadge(x.st.status)}</td><td style="text-align:right">${accMoney(x.st.due)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted">Nothing owed to you right now.</p>'}</div>
    </div>
    <div class="card barred" style="margin-top:14px"><div class="card-bar"><h3>Latest Money In And Out</h3></div>
      ${recent.length ? `<table class="list"><tbody>${recent.map(r => r.t === 'in'
        ? `<tr><td>${esc(fmtDate(r.d))}</td><td>${esc(accPaymentLabel(r.x))}</td><td class="small muted">${esc(accBankName(r.x.bankId))}</td><td class="acc-in" style="text-align:right">+${accMoney(r.x.amount)}</td></tr>`
        : `<tr class="click" data-exp="${r.x.id}"><td>${esc(fmtDate(r.d))}</td><td>${esc(r.x.supplier || '')}<div class="small muted">${esc(accCat(ACC_EXP_CATS, r.x.category)[1])}</div></td><td class="small muted">${esc(accBankName(r.x.bankId))}</td><td style="text-align:right">−${accMoney(r.x.total)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="muted">Nothing yet. Start with <b>Settings</b> (your bank details for invoices), then add invoices and expenses as they happen, or import a bank statement on the <b>Bank</b> tab.</p>'}</div>`;
  accBindPeriod(viewAccounts);
  $('#aInv').onclick = () => { const inv = invNew(); go('#/invoice/' + inv.id); };
  $('#aIn').onclick = () => accPaymentForm({});
  $('#aExp').onclick = () => accExpenseForm({});
  $('#aMiles').onclick = () => accMileageForm({});
  $('#aTransfer').onclick = () => accTransferForm({});
  $$('[data-exp]').forEach(r => { r.onclick = () => accExpenseForm(Store.get(ACC, r.dataset.exp)); });
  bindRowLinks();
}

/* ---------- Invoices list ---------- */
function viewInvoices() {
  setCrumbs([['Accounts', '#/accounts'], ['Invoices']]);
  const p = accPeriod();
  const f = viewInvoices.filter || 'all';
  let list = accAll('invoice').filter(i => inPeriod(i.date, p) || invState(i).due > 0).map(i => ({ i, st: invState(i) }));
  if (f === 'unpaid') list = list.filter(x => x.st.due > 0);
  if (f === 'overdue') list = list.filter(x => x.st.status === 'Overdue');
  if (f === 'draft') list = list.filter(x => x.st.status === 'Draft');
  list.sort((a, b) => (b.i.date || '').localeCompare(a.i.date || '') || (b.i.number || '').localeCompare(a.i.number || ''));
  const tot = list.reduce((s, x) => s + (x.st.status === 'Void' || x.st.status === 'Draft' ? 0 : x.st.t.total), 0);
  $('#view').innerHTML = `${accHead('Invoices', 'Unpaid invoices from earlier years are always shown.', '<button class="btn primary" id="aInv">+ New Invoice</button>', 'invoices')}
    <div class="spread">${accPeriodPicker()}<div class="seg" id="invF">${[['all', 'All'], ['unpaid', 'Unpaid'], ['overdue', 'Overdue'], ['draft', 'Draft']].map(([k, l]) => `<button type="button" data-f="${k}" class="${f === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="card barred"><div class="card-bar"><h3>${list.length} Invoice${list.length === 1 ? '' : 's'} · ${accMoney(tot)}</h3></div>
    ${list.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>No.</th><th>Date</th><th>Customer</th><th>Due</th><th style="text-align:right">Total</th><th style="text-align:right">Still Owed</th><th>Status</th></tr></thead><tbody>
      ${list.map(x => `<tr class="click" data-href="#/invoice/${x.i.id}"><td><b>${esc(x.i.number)}</b></td><td>${esc(fmtDate(x.i.date))}</td><td>${esc((x.i.customer || {}).name || '—')}</td><td>${esc(fmtDate(x.i.dueDate))}</td><td style="text-align:right">${accMoney(x.st.t.total)}</td><td style="text-align:right">${x.st.due ? accMoney(x.st.due) : '—'}</td><td>${invBadge(x.st.status)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">No invoices here. Press <b>+ New Invoice</b>, or open an accepted quote and press <b>Create Invoice From This Quote</b>.</p>'}</div>`;
  accBindPeriod(viewInvoices);
  $$('#invF button').forEach(b => { b.onclick = () => { viewInvoices.filter = b.dataset.f; viewInvoices(); }; });
  $('#aInv').onclick = () => { const inv = invNew(); go('#/invoice/' + inv.id); };
  bindRowLinks();
}

/* ---------- One invoice ---------- */
function viewInvoice(id) {
  const inv = Store.get(ACC, id);
  if (!inv || inv.kind !== 'invoice') return notFound('That invoice is not on this device.');
  setCrumbs([['Accounts', '#/accounts'], ['Invoices', '#/accounts/invoices'], [inv.number || 'Invoice']]);
  const V = invVat(inv);
  const cu = inv.customer || {};
  const clients = Store.list('clients').filter(c => !c.demo).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const st0 = invState(inv);
  $('#view').innerHTML = `<div id="invRoot">
    <div class="spread dash-hello"><div><div class="row"><h1 style="margin:0">Invoice ${esc(inv.number)}</h1><span id="invBadge">${invBadge(st0.status)}</span></div><div class="muted">${esc(cu.name || 'New customer')}</div></div>
      <div class="row"><button class="btn danger" id="iDel">Delete</button><button class="btn" id="iCopy">Copy</button><button class="btn" id="iEmail">Email</button><button class="btn primary" id="iPrint">Print / PDF</button></div></div>
    <div class="grid2" style="align-items:start;gap:14px">
      <div>
        <div class="card" id="iCust"><h3>Bill To</h3>
          ${field('Client', 'clientId', inv.clientId || '', { type: 'select', options: clients.map(c => [c.id, c.name]), hint: 'Pick a client to fill in their details, or type a new customer below.' })}
          ${field('Customer / Company Name', 'name', cu.name)}
          <div class="grid2">${field('Contact Name', 'contact', cu.contact)}${field('Email', 'email', cu.email, { type: 'email' })}</div>
          ${addrFields('Billing Address', 'address', addrParts(cu, 'address'))}
        </div>
        <div class="card"><div class="spread"><h3 style="margin:0">Lines</h3><button class="btn small" id="iAdd">+ Add Line</button></div>
          <div class="acc-line acc-line-h"><span>Description</span><span>Qty</span><span>Price Each</span>${V.on ? '<span>VAT %</span>' : ''}<span></span></div>
          <div id="iLines"></div></div>
      </div>
      <div>
        <div class="card barred"><div class="card-bar"><h3>Total</h3></div><div id="iTotals"></div></div>
        <div class="card" id="iMeta"><h3>Invoice Details</h3>
          <div class="grid2">${field('Invoice Date', 'date', inv.date, { type: 'date' })}${field('Payment Due', 'dueDate', inv.dueDate, { type: 'date' })}</div>
          <div class="grid2">${field('Status', 'status', inv.status === 'Draft' || inv.status === 'Void' ? inv.status : 'Sent', { type: 'select', blank: false, options: [['Draft', 'Draft (Not Sent Yet)'], ['Sent', 'Sent To Customer'], ['Void', 'Cancelled (Void)']] })}${field('Their Order / PO Ref', 'poRef', inv.poRef)}</div>
          ${field('Notes On The Invoice', 'notes', inv.notes, { type: 'textarea' })}
        </div>
        <div class="card barred"><div class="card-bar"><h3>Payments</h3><button class="btn" id="iPay">+ Record Payment</button></div><div id="iPays"></div></div>
      </div>
    </div></div>`;
  const lineRow = l => `<div class="acc-line"><input data-k="desc" placeholder="Description" value="${esc(l.desc || '')}"><input data-k="qty" type="number" step="any" min="0" value="${esc(l.qty ?? 1)}"><input data-k="unit" type="number" step="0.01" placeholder="£" value="${esc(l.unit ?? '')}">${V.on ? `<select data-k="vatRate">${[[V.rate, V.rate + '%'], [5, '5%'], [0, '0%'], ['exempt', 'Exempt']].map(([v, t]) => `<option value="${v}" ${String(l.vatRate === undefined || l.vatRate === '' ? V.rate : l.vatRate) === String(v) ? 'selected' : ''}>${t}</option>`).join('')}</select>` : ''}<button class="btn small danger" data-rm title="Remove">×</button></div>`;
  $('#iLines').innerHTML = (inv.lines || []).map(lineRow).join('');
  const paint = () => {
    const st = invState(inv), t = st.t;
    $('#invBadge').innerHTML = invBadge(st.status);
    $('#iTotals').innerHTML = `<div class="q-tot"><span>Total Before VAT</span><b>${accMoney(t.net)}</b></div>
      ${V.on ? `<div class="q-tot"><span>VAT</span><b>${accMoney(t.vat)}</b></div>` : ''}
      <div class="q-tot big"><span>Total${V.on ? '' : ' (No VAT)'}</span><b>${accMoney(t.total)}</b></div>
      ${st.paid ? `<div class="q-tot"><span>Paid So Far</span><b>${accMoney(st.paid)}</b></div><div class="q-tot big"><span>Still Owed</span><b>${accMoney(Math.max(0, r2(t.total - st.paid)))}</b></div>` : ''}`;
    const pays = invPayments(inv);
    $('#iPays').innerHTML = pays.length ? `<table class="list"><tbody>${pays.map(x => `<tr><td>${esc(fmtDate(x.date))}</td><td class="small">${esc(x.method || '')} · ${esc(accBankName(x.bankId))}${x.ref ? ' · ' + esc(x.ref) : ''}</td><td style="text-align:right">${accMoney(x.amount)}</td><td><button class="btn small" data-pay="${x.id}">Edit</button></td></tr>`).join('')}</tbody></table>` : '<p class="muted small">No payments yet.</p>';
    $$('[data-pay]').forEach(b => { b.onclick = () => accPaymentForm(Store.get(ACC, b.dataset.pay), () => paint()); });
  };
  const save = () => {
    const c = formValues($('#iCust')), m = formValues($('#iMeta'));
    inv.clientId = c.clientId || '';
    inv.customer = addrApply({ name: c.name, contact: c.contact, email: c.email }, 'address', addrRead(c, 'address'));
    inv.lines = $$('#iLines .acc-line').map(r => {
      const l = { desc: $('[data-k=desc]', r).value.trim(), qty: qNum($('[data-k=qty]', r).value) || 1, unit: $('[data-k=unit]', r).value === '' ? '' : qNum($('[data-k=unit]', r).value) };
      const vr = $('[data-k=vatRate]', r); if (vr) l.vatRate = vr.value === 'exempt' ? 0 : qNum(vr.value), l.exempt = vr.value === 'exempt';
      return l;
    });
    const wasDraft = inv.status === 'Draft';
    Object.assign(inv, { date: m.date || today(), dueDate: m.dueDate || inv.dueDate, status: m.status, poRef: m.poRef, notes: m.notes });
    if (wasDraft && m.status === 'Sent' && !inv.sentAt) inv.sentAt = today();
    Store.upsert(ACC, inv);
    paint();
  };
  $('#iAdd').onclick = () => { $('#iLines').insertAdjacentHTML('beforeend', lineRow({})); save(); $$('#iLines [data-k=desc]').pop().focus(); };
  $('#iLines').addEventListener('click', e => { if (e.target.closest('[data-rm]')) { e.target.closest('.acc-line').remove(); save(); } });
  $('#invRoot').addEventListener('input', e => { clearTimeout(viewInvoice.t); viewInvoice.t = setTimeout(save, 250); });
  $('#invRoot').addEventListener('change', e => {
    if (e.target.name === 'clientId' && e.target.value) {
      const c = Store.get('clients', e.target.value);
      if (c) {
        const f = $('#iCust'), ap = addrParts(c, 'address');
        [['name', c.name], ['contact', c.contact], ['email', c.email]].forEach(([k, v]) => { $(`[name=${k}]`, f).value = v || ''; });
        ADDR_BOXES.forEach(([k]) => { $(`[name=address__${k}]`, f).value = ap[k] || ''; });
      }
    }
    if (e.target.name === 'date' && e.target.value) $('#iMeta [name=dueDate]').value = addDays(e.target.value, qNum(accSettings().payDays) || 14);
    save();
  });
  $('#iPay').onclick = () => { save(); const st = invState(inv); accPaymentForm({ invoiceId: inv.id, amount: st.status === 'Draft' ? st.t.total : st.due || st.t.total }, () => { if (inv.status === 'Draft') { inv.status = 'Sent'; Store.upsert(ACC, inv); $('#iMeta [name=status]').value = 'Sent'; } paint(); }); };
  $('#iPrint').onclick = () => { save(); invPrint(inv); };
  $('#iEmail').onclick = () => { save(); invEmail(inv); };
  $('#iCopy').onclick = () => {
    const copy = invNew({ clientId: inv.clientId, customer: JSON.parse(JSON.stringify(inv.customer || {})), lines: JSON.parse(JSON.stringify(inv.lines || [])), notes: inv.notes, poRef: '' });
    toast('Copied as ' + copy.number); go('#/invoice/' + copy.id);
  };
  $('#iDel').onclick = async () => {
    if (invPayments(inv).length) { toast('This invoice has payments: delete those first, or mark it Cancelled'); return; }
    if (await confirmBox('Delete Invoice', `Delete invoice <b>${esc(inv.number)}</b>? If it has been sent, mark it <b>Cancelled (Void)</b> instead so the number is not missing from your records.`)) { Store.remove(ACC, inv.id); toast('Invoice deleted'); go('#/accounts/invoices'); }
  };
  paint();
}

function invPrint(inv) {
  const S = accSettings(), s = Store.settings, V = invVat(inv), st = invState(inv), t = st.t, cu = inv.customer || {};
  const bank = S.accountNo || S.sortCode ? `<div class="qt-notes"><h3>How To Pay</h3><p>Bank transfer to <b>${esc(S.accountName || s.businessName)}</b>${S.bankName ? ', ' + esc(S.bankName) : ''}<br>Sort code <b>${esc(S.sortCode)}</b> · Account number <b>${esc(S.accountNo)}</b><br>Please use <b>${esc(inv.number)}</b> as the reference.</p></div>` : '';
  const html = `<div class="report qt"><div class="page">
    <div class="qt-head"><div class="qt-brand">${s.logo ? `<img src="${s.logo}" alt="">` : '<img src="icon.svg" alt="">'}<div><div class="qt-name">${esc(s.businessName)}</div><div class="qt-tag">${esc(s.tagline || '')}</div></div></div>
      <div class="qt-biz">${qBizBlock(s)}${V.on && S.vatNumber ? '<br>VAT No. ' + esc(S.vatNumber) : ''}${S.structure === 'ltd' && S.companyNo ? '<br>Company No. ' + esc(S.companyNo) : ''}</div></div>
    <div class="qt-band"><h1>${inv.status === 'Void' ? 'Invoice (Cancelled)' : V.on ? 'VAT Invoice' : 'Invoice'}</h1><div class="qt-meta"><div><span>Invoice No.</span><b>${esc(inv.number)}</b></div><div><span>Date</span><b>${esc(fmtDate(inv.date))}</b></div><div><span>Payment Due</span><b>${esc(fmtDate(inv.dueDate))}</b></div></div></div>
    <div class="qt-two"><div><h3>Bill To</h3><b>${esc(cu.name || '')}</b>${cu.contact ? '<br>' + esc(cu.contact) : ''}${cu.address ? '<br>' + esc(cu.address) : ''}</div>
      <div>${inv.poRef ? `<h3>Your Reference</h3><b>${esc(inv.poRef)}</b>` : ''}</div></div>
    <table class="qt-table"><thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Price</th>${V.on ? '<th class="r">VAT</th>' : ''}<th class="r">Amount</th></tr></thead><tbody>
      ${t.lines.map(l => `<tr><td>${esc(l.desc)}</td><td class="r">${l.qty ?? 1}</td><td class="r">${accMoney(l.unit)}</td>${V.on ? `<td class="r">${l.exempt ? 'Exempt' : l.rate + '%'}</td>` : ''}<td class="r">${accMoney(l.amount)}</td></tr>`).join('')}
    </tbody></table>
    <div class="qt-totals"><div><span>Total Before VAT</span><b>${accMoney(t.net)}</b></div>
      ${V.on ? `<div><span>VAT</span><b>${accMoney(t.vat)}</b></div>` : ''}
      <div class="qt-grand"><span>Total${V.on ? '' : ' (No VAT Charged)'}</span><b>${accMoney(t.total)}</b></div>
      ${st.paid ? `<div><span>Paid</span><b>${accMoney(st.paid)}</b></div><div class="qt-grand"><span>Amount Due</span><b>${accMoney(Math.max(0, r2(t.total - st.paid)))}</b></div>` : ''}</div>
    ${inv.notes ? `<div class="qt-notes"><h3>Notes</h3><p>${esc(inv.notes).replace(/\n/g, '<br>')}</p></div>` : ''}
    ${bank}
    ${S.invoiceFooter ? `<div class="qt-terms"><p>${esc(S.invoiceFooter)}</p></div>` : ''}
  </div></div>`;
  showPrint(html, { title: `Invoice ${inv.number} - ${cu.name || ''}` });
}

function invEmail(inv) {
  const S = accSettings(), s = Store.settings, st = invState(inv), cu = inv.customer || {};
  if (!cu.email) { toast('Add the customer email first'); return; }
  const body = `Dear ${cu.contact || cu.name || 'Sir or Madam'},\n\nPlease find attached invoice ${inv.number} for ${accMoney(st.t.total)}, due by ${fmtDate(inv.dueDate)}.\n\n` +
    (S.accountNo ? `Payment by bank transfer to ${S.accountName || s.businessName}, sort code ${S.sortCode}, account ${S.accountNo}, reference ${inv.number}.\n\n` : '') +
    `Many thanks,\n${s.assessorName || ''}\n${s.businessName}${s.phone ? '\n' + s.phone : ''}`;
  location.href = `mailto:${encodeURIComponent(cu.email)}?subject=${encodeURIComponent(`Invoice ${inv.number} from ${s.businessName}`)}&body=${encodeURIComponent(body)}`;
  toast('Save the invoice as a PDF (Print / PDF) and attach it to the email');
  if (inv.status === 'Draft') { inv.status = 'Sent'; inv.sentAt = today(); Store.upsert(ACC, inv); setTimeout(() => router(), 400); }
}

/* ---------- Money in ---------- */
function accPaymentForm(p, after) {
  p = Object.assign({ kind: 'payment', date: today(), method: 'Bank Transfer', category: 'sales' }, p);
  const V = accVat();
  const open = accAll('invoice').map(i => ({ i, st: invState(i) })).filter(x => x.st.due > 0 || x.i.id === p.invoiceId);
  const banks = accBanks();
  if (!p.bankId) p.bankId = banks[0].id;
  openModal({
    title: p.id ? 'Edit Money In' : 'Money In',
    body: `${field('Paying Invoice', 'invoiceId', p.invoiceId || '', { type: 'select', options: open.map(x => [x.i.id, `${x.i.number} – ${(x.i.customer || {}).name || ''} (${accMoney(x.st.due)} owed)`]), hint: 'Leave blank for money that is not for an invoice.' })}
      <div class="grid2">${field('Date Received', 'date', p.date, { type: 'date' })}${field('Amount (£)', 'amount', p.amount ?? '', { type: 'number', attrs: 'step="0.01" min="0"' })}</div>
      <div class="grid2">${field('Paid Into', 'bankId', p.bankId, { type: 'select', blank: false, options: banks.map(b => [b.id, b.name]) })}${field('How', 'method', p.method, { type: 'select', blank: false, options: ACC_METHODS })}</div>
      <div id="pNoInv">
        ${field('What Is It?', 'category', p.category, { type: 'select', blank: false, options: ACC_IN_CATS.map(c => [c[0], c[1]]) })}
        <div class="grid2">${field('From', 'from', p.from, { placeholder: 'Who paid you' })}${V.on ? field('VAT Included (£)', 'vat', p.vat ?? '', { type: 'number', attrs: 'step="0.01" min="0"' }) : '<div></div>'}</div>
      </div>
      ${field('Reference', 'ref', p.ref, { placeholder: 'As shown on the bank statement' })}`,
    onOpen: m => {
      const sync = () => { $('#pNoInv', m).style.display = $('[name=invoiceId]', m).value ? 'none' : ''; };
      $('[name=invoiceId]', m).onchange = () => { const x = open.find(o => o.i.id === $('[name=invoiceId]', m).value); if (x && !$('[name=amount]', m).value) $('[name=amount]', m).value = x.st.due; sync(); };
      sync();
    },
    buttons: [
      ...(p.id ? [{ label: 'Delete', cls: 'danger', onClick: async () => { if (await confirmBox('Delete Payment', 'Delete this money in?')) { accUnlinkTx(p.id); Store.remove(ACC, p.id); toast('Deleted'); after ? after() : router(); } return true; } }] : []),
      { label: 'Cancel' },
      { label: 'Save', cls: 'primary', onClick: m => {
        const v = formValues(m);
        if (!(qNum(v.amount) > 0)) { toast('Enter the amount'); return false; }
        Object.assign(p, v, { amount: r2(v.amount), vat: v.invoiceId ? 0 : r2(v.vat) });
        if (p.invoiceId) { delete p.category; delete p.from; }
        Store.upsert(ACC, p);
        if (p.bankTxId) { const tx = Store.get(ACC, p.bankTxId); if (tx) { tx.link = { kind: 'payment', id: p.id }; Store.upsert(ACC, tx); } }
        toast('Money in saved');
        after ? after(p) : router();
      } }
    ]
  });
}

function viewMoneyIn() {
  setCrumbs([['Accounts', '#/accounts'], ['Money In']]);
  const p = accPeriod();
  const list = accAll('payment').filter(x => inPeriod(x.date, p)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const tot = list.reduce((s, x) => s + qNum(x.amount), 0);
  $('#view').innerHTML = `${accHead('Money In', 'Payments for invoices and any other money received.', '<button class="btn primary" id="aIn">+ Money In</button>', 'money-in')}
    ${accPeriodPicker()}
    <div class="card barred"><div class="card-bar"><h3>${list.length} Payment${list.length === 1 ? '' : 's'} · ${accMoney(tot)}</h3></div>
    ${list.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Date</th><th>From / For</th><th>Type</th><th>Into</th><th style="text-align:right">Amount</th></tr></thead><tbody>
      ${list.map(x => `<tr class="click" data-pay="${x.id}"><td>${esc(fmtDate(x.date))}</td><td>${esc(accPaymentLabel(x))}</td><td class="small">${x.invoiceId ? 'Invoice Payment' : esc(accCat(ACC_IN_CATS, x.category)[1])}</td><td class="small">${esc(accBankName(x.bankId))}</td><td style="text-align:right">${accMoney(x.amount)}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Nothing received in this period.</p>'}</div>`;
  accBindPeriod(viewMoneyIn);
  $('#aIn').onclick = () => accPaymentForm({});
  $$('[data-pay]').forEach(r => { r.onclick = () => accPaymentForm(Store.get(ACC, r.dataset.pay)); });
}

/* ---------- Expenses ---------- */
function accExpenseForm(e, after) {
  e = Object.assign({ kind: 'expense', date: today(), category: 'other', businessPct: 100 }, e);
  const V = accVat();
  const banks = accBanks();
  if (!e.bankId) e.bankId = banks[0].id;
  let receipt = e.receipt || '';
  const suppliers = [...new Set(accAll('expense').map(x => x.supplier).filter(Boolean))].sort();
  const rBox = () => receipt ? (receipt.startsWith('data:application/pdf') ? '<div class="small">PDF receipt attached. <a href="#" id="rOpen">Open</a></div>' : `<img src="${receipt}" class="acc-receipt" id="rOpen" alt="Receipt">`) + '<button class="btn small danger" id="rRm" type="button">Remove</button>' : '<div class="small muted">No receipt yet.</div>';
  openModal({
    title: e.id ? 'Edit Expense' : 'New Expense',
    wide: true,
    body: `<div class="grid2">${field('Date Paid', 'date', e.date, { type: 'date' })}${field('Supplier / Shop', 'supplier', e.supplier, { attrs: 'list="accSup"' })}</div>
      <datalist id="accSup">${suppliers.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      ${field('Category', 'category', e.category, { type: 'select', blank: false, options: ACC_EXP_CATS.map(c => [c[0], c[1]]) })}
      ${field('What Was It For?', 'desc', e.desc)}
      <div class="grid2">${field('Total Paid (£)', 'total', e.total ?? '', { type: 'number', attrs: 'step="0.01" min="0"' })}
        ${V.on ? field('VAT On The Receipt (£)', 'vat', e.vat ?? '', { type: 'number', attrs: 'step="0.01" min="0"', hint: '<a href="#" id="vat20">Work out 20% VAT from the total</a>. Leave 0 if the receipt shows no VAT.' }) : '<div></div>'}</div>
      <div class="grid2">${field('Paid From', 'bankId', e.bankId, { type: 'select', blank: false, options: banks.map(b => [b.id, b.name]) })}
        ${field('Business Use (%)', 'businessPct', e.businessPct, { type: 'number', attrs: 'min="0" max="100" step="1"', hint: 'e.g. 50 for a phone also used personally.' })}</div>
      ${field('Reference / Invoice No.', 'ref', e.ref)}
      <div class="field"><label>Receipt</label><div id="rWrap" class="row">${rBox()}</div>
        <label class="btn small" style="margin-top:6px">Add Photo Or PDF<input type="file" id="rIn" accept="image/*,application/pdf" hidden></label></div>`,
    onOpen: m => {
      const bind = () => {
        const rm = $('#rRm', m); if (rm) rm.onclick = () => { receipt = ''; $('#rWrap', m).innerHTML = rBox(); bind(); };
        const op = $('#rOpen', m); if (op) op.onclick = ev => { ev.preventDefault(); const w = window.open(); if (w) w.document.write(receipt.startsWith('data:application/pdf') ? `<iframe src="${receipt}" style="border:0;width:100%;height:100vh"></iframe>` : `<img src="${receipt}" style="max-width:100%">`); };
      };
      bind();
      $('#rIn', m).onchange = async ev => {
        const f = ev.target.files[0]; if (!f) return;
        if (f.type === 'application/pdf') { if (f.size > 1500000) { toast('That PDF is too big (1.5 MB max): take a photo instead'); return; } receipt = await readFileAsDataUrl(f); }
        else receipt = await compressImage(f, 1400, 0.7);
        $('#rWrap', m).innerHTML = rBox(); bind();
      };
      const v20 = $('#vat20', m); if (v20) v20.onclick = ev => { ev.preventDefault(); $('[name=vat]', m).value = r2(qNum($('[name=total]', m).value) / 6).toFixed(2); };
    },
    buttons: [
      ...(e.id ? [{ label: 'Delete', cls: 'danger', onClick: async () => { if (await confirmBox('Delete Expense', 'Delete this expense?')) { accUnlinkTx(e.id); Store.remove(ACC, e.id); toast('Deleted'); after ? after() : router(); } return true; } }] : []),
      { label: 'Cancel' },
      { label: 'Save Expense', cls: 'primary', onClick: m => {
        const v = formValues(m);
        if (!(qNum(v.total) > 0)) { toast('Enter the total paid'); return false; }
        if (qNum(v.vat) > qNum(v.total)) { toast('The VAT is more than the total'); return false; }
        Object.assign(e, v, { total: r2(v.total), vat: r2(v.vat), businessPct: v.businessPct === '' ? 100 : Math.min(100, Math.max(0, qNum(v.businessPct))), receipt });
        Store.upsert(ACC, e);
        if (e.bankTxId) { const tx = Store.get(ACC, e.bankTxId); if (tx) { tx.link = { kind: 'expense', id: e.id }; Store.upsert(ACC, tx); } }
        toast('Expense saved');
        after ? after(e) : router();
      } }
    ]
  });
}

function viewExpenses() {
  setCrumbs([['Accounts', '#/accounts'], ['Expenses']]);
  const p = accPeriod(), f = viewExpenses.cat || '';
  let list = accAll('expense').filter(x => inPeriod(x.date, p));
  const byCat = {};
  list.forEach(x => { byCat[x.category] = (byCat[x.category] || 0) + qNum(x.total); });
  if (f) list = list.filter(x => x.category === f);
  list.sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const tot = list.reduce((s, x) => s + qNum(x.total), 0);
  const noReceipt = list.filter(x => !x.receipt && accCat(ACC_EXP_CATS, x.category)[2]).length;
  $('#view').innerHTML = `${accHead('Expenses', 'Everything the business pays for, with receipts.', '<button class="btn primary" id="aExp">+ Expense</button>', 'expenses')}
    <div class="spread">${accPeriodPicker()}<select id="eCat"><option value="">All Categories</option>${ACC_EXP_CATS.filter(c => byCat[c[0]]).map(c => `<option value="${c[0]}" ${f === c[0] ? 'selected' : ''}>${esc(c[1])} (${accMoney(byCat[c[0]])})</option>`).join('')}</select></div>
    <div class="card barred"><div class="card-bar"><h3>${list.length} Expense${list.length === 1 ? '' : 's'} · ${accMoney(tot)}</h3></div>
    ${noReceipt ? `<p class="small" style="color:var(--fail)">${noReceipt} without a receipt. Keep receipts for at least 5 years after the 31 January tax return deadline.</p>` : ''}
    ${list.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Date</th><th>Supplier</th><th>Category</th><th>Paid From</th><th style="text-align:right">Total</th><th></th></tr></thead><tbody>
      ${list.map(x => `<tr class="click" data-exp="${x.id}"><td>${esc(fmtDate(x.date))}</td><td>${esc(x.supplier || '—')}<div class="small muted">${esc(x.desc || '')}</div></td><td class="small">${esc(accCat(ACC_EXP_CATS, x.category)[1])}${qNum(x.businessPct) < 100 && x.businessPct !== '' && x.businessPct !== undefined ? ` · ${x.businessPct}% business` : ''}</td><td class="small">${esc(accBankName(x.bankId))}</td><td style="text-align:right">${accMoney(x.total)}${qNum(x.vat) ? `<div class="small muted">VAT ${accMoney(x.vat)}</div>` : ''}</td><td class="small">${x.receipt ? '📎' : ''}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">No expenses in this period.</p>'}</div>`;
  accBindPeriod(viewExpenses);
  $('#eCat').onchange = ev => { viewExpenses.cat = ev.target.value; viewExpenses(); };
  $('#aExp').onclick = () => accExpenseForm({});
  $$('[data-exp]').forEach(r => { r.onclick = () => accExpenseForm(Store.get(ACC, r.dataset.exp)); });
}

/* ---------- Mileage ---------- */
function accMileageForm(m) {
  m = Object.assign({ kind: 'mileage', date: today(), ret: true }, m);
  const clients = Store.list('clients').filter(c => !c.demo).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const places = [...new Set(accAll('mileage').flatMap(x => [x.from, x.to]).filter(Boolean))].sort();
  openModal({
    title: m.id ? 'Edit Journey' : 'Business Journey',
    body: `<div class="grid2">${field('Date', 'date', m.date, { type: 'date' })}${field('Client (Optional)', 'clientId', m.clientId || '', { type: 'select', options: clients.map(c => [c.id, c.name]) })}</div>
      <datalist id="accPl">${places.map(x => `<option value="${esc(x)}">`).join('')}</datalist>
      <div class="grid2">${field('From', 'from', m.from, { attrs: 'list="accPl"' })}${field('To', 'to', m.to, { attrs: 'list="accPl"' })}</div>
      ${field('Why', 'purpose', m.purpose, { placeholder: 'e.g. Fire door inspection, quote visit' })}
      <div class="grid2">${field('Miles One Way', 'oneWay', m.oneWay ?? m.miles ?? '', { type: 'number', attrs: 'step="0.1" min="0"' })}<div class="field"><label>&nbsp;</label><label class="checkrow"><input type="checkbox" name="ret" ${m.ret ? 'checked' : ''}> Return Journey (Doubles It)</label></div></div>
      <p class="small muted">Claimed at HMRC's approved rate: 45p a mile for the first 10,000 business miles in a tax year, then 25p. If you claim mileage for a vehicle, don't also put its fuel, insurance or repairs in Expenses.</p>`,
    buttons: [
      ...(m.id ? [{ label: 'Delete', cls: 'danger', onClick: async () => { if (await confirmBox('Delete Journey', 'Delete this journey?')) { Store.remove(ACC, m.id); router(); } return true; } }] : []),
      { label: 'Cancel' },
      { label: 'Save', cls: 'primary', onClick: el => {
        const v = formValues(el);
        if (!(qNum(v.oneWay) > 0)) { toast('Enter the miles'); return false; }
        Object.assign(m, v, { oneWay: qNum(v.oneWay), miles: r2(qNum(v.oneWay) * (v.ret ? 2 : 1)) });
        Store.upsert(ACC, m); toast('Journey saved'); router();
      } }
    ]
  });
}
function viewMileage() {
  setCrumbs([['Accounts', '#/accounts'], ['Mileage']]);
  const p = accPeriod(), vals = accMileageValues();
  const list = accAll('mileage').filter(x => inPeriod(x.date, p)).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const miles = list.reduce((s, x) => s + qNum(x.miles), 0), val = list.reduce((s, x) => s + (vals.get(x.id) || 0), 0);
  $('#view').innerHTML = `${accHead('Mileage', 'Business journeys in your own vehicle, claimed at HMRC rates.', '<button class="btn primary" id="aMiles">+ Journey</button>', 'mileage')}
    ${accPeriodPicker()}
    <div class="card barred"><div class="card-bar"><h3>${Math.round(miles).toLocaleString('en-GB')} Miles · ${accMoney(val)}</h3></div>
    ${list.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Date</th><th>Journey</th><th>Why</th><th style="text-align:right">Miles</th><th style="text-align:right">Claim</th></tr></thead><tbody>
      ${list.map(x => `<tr class="click" data-m="${x.id}"><td>${esc(fmtDate(x.date))}</td><td>${esc(x.from || '')} → ${esc(x.to || '')}${x.ret ? ' and back' : ''}</td><td class="small">${esc(x.purpose || '')}${x.clientId ? `<div class="muted">${esc((Store.get('clients', x.clientId) || {}).name || '')}</div>` : ''}</td><td style="text-align:right">${x.miles}</td><td style="text-align:right">${accMoney(vals.get(x.id))}</td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">No journeys in this period.</p>'}</div>`;
  accBindPeriod(viewMileage);
  $('#aMiles').onclick = () => accMileageForm({});
  $$('[data-m]').forEach(r => { r.onclick = () => accMileageForm(Store.get(ACC, r.dataset.m)); });
}

/* ---------- Transfers ---------- */
function accTransferForm(t, after) {
  t = Object.assign({ kind: 'transfer', date: today() }, t);
  const banks = accBanks();
  if (banks.length < 2) { toast('Add a second account on the Bank tab first (e.g. Cash or a savings account)'); return; }
  openModal({
    title: t.id ? 'Edit Transfer' : 'Move Money Between Your Accounts',
    body: `<div class="grid2">${field('Date', 'date', t.date, { type: 'date' })}${field('Amount (£)', 'amount', t.amount ?? '', { type: 'number', attrs: 'step="0.01" min="0"' })}</div>
      <div class="grid2">${field('From', 'fromId', t.fromId || banks[0].id, { type: 'select', blank: false, options: banks.map(b => [b.id, b.name]) })}${field('To', 'toId', t.toId || banks[1].id, { type: 'select', blank: false, options: banks.map(b => [b.id, b.name]) })}</div>
      ${field('Note', 'note', t.note)}`,
    buttons: [
      ...(t.id ? [{ label: 'Delete', cls: 'danger', onClick: async () => { if (await confirmBox('Delete Transfer', 'Delete this transfer?')) { accUnlinkTx(t.id); Store.remove(ACC, t.id); router(); } return true; } }] : []),
      { label: 'Cancel' },
      { label: 'Save', cls: 'primary', onClick: m => {
        const v = formValues(m);
        if (!(qNum(v.amount) > 0)) { toast('Enter the amount'); return false; }
        if (v.fromId === v.toId) { toast('Pick two different accounts'); return false; }
        Object.assign(t, v, { amount: r2(v.amount) });
        Store.upsert(ACC, t);
        if (t.bankTxId) { const tx = Store.get(ACC, t.bankTxId); if (tx) { tx.link = { kind: 'transfer', id: t.id }; Store.upsert(ACC, tx); } }
        toast('Transfer saved'); after ? after(t) : router();
      } }
    ]
  });
}

/* ---------- Bank ---------- */
function accBankForm(b) {
  b = Object.assign({ kind: 'bankacct', type: 'bank', opening: 0, openDate: accYearStart(today()) }, b);
  openModal({
    title: b.id ? 'Edit Account' : 'New Account',
    body: `${field('Name', 'name', b.name, { placeholder: 'e.g. Business Current Account, Cash, Savings' })}
      ${field('Type', 'type', b.type, { type: 'select', blank: false, options: [['bank', 'Bank Account'], ['savings', 'Savings Account'], ['cash', 'Cash'], ['card', 'Credit Card']] })}
      <div class="grid2">${field('Balance On The Start Date (£)', 'opening', b.opening, { type: 'number', attrs: 'step="0.01"', hint: 'Use a minus for money owed on a credit card.' })}${field('Start Date', 'openDate', b.openDate, { type: 'date' })}</div>`,
    buttons: [
      ...(b.id ? [{ label: 'Delete', cls: 'danger', onClick: async () => {
        const used = Store.list(ACC).some(r => r.bankId === b.id || r.fromId === b.id || r.toId === b.id);
        if (used) { toast('This account has money in or out recorded against it, so it cannot be deleted'); return true; }
        if (await confirmBox('Delete Account', `Delete <b>${esc(b.name)}</b>?`)) { Store.remove(ACC, b.id); go('#/accounts/bank'); } return true; } }] : []),
      { label: 'Cancel' },
      { label: 'Save', cls: 'primary', onClick: m => {
        const v = formValues(m);
        if (!v.name) { toast('Enter a name'); return false; }
        Object.assign(b, v, { opening: r2(v.opening) });
        Store.upsert(ACC, b); router();
      } }
    ]
  });
}

function viewBank(bankId) {
  if (bankId) return viewBankAccount(bankId);
  setCrumbs([['Accounts', '#/accounts'], ['Bank']]);
  const banks = accBanks();
  const tx = accAll('banktx');
  $('#view').innerHTML = `${accHead('Bank', 'Your accounts, their balances, and statement lines to match.', '<button class="btn" id="bTr">+ Transfer</button><button class="btn primary" id="bNew">+ New Account</button>', 'bank')}
    <div class="cards">${banks.map(b => {
      const mv = accMovements(b.id), left = tx.filter(t => t.bankId === b.id && !t.link && !t.ignored).length;
      return `<div class="card link-card" data-href="#/accounts/bank/${b.id}"><div class="small muted">${esc({ bank: 'Bank Account', savings: 'Savings', cash: 'Cash', card: 'Credit Card' }[b.type] || '')}</div><h3 style="margin:2px 0 6px">${esc(b.name)}</h3>
        <div class="acc-bal ${mv.balance < 0 ? 'neg' : ''}">${accMoney(mv.balance)}</div><div class="small muted">${mv.list.length} entries${left ? ` · <b style="color:var(--accent)">${left} statement line${left === 1 ? '' : 's'} to match</b>` : ''}</div></div>`;
    }).join('')}</div>
    <div class="card mt"><h3>Importing A Bank Statement</h3><p class="small">Open an account above and press <b>Import Statement</b>. Download a CSV file from your online banking first. The portal reads the date, description and amount, skips lines already imported, and suggests a match for each line (a payment for an unpaid invoice of the same amount, an expense you have already entered, and so on). Lines you don't recognise can become an expense or money in with one click.</p></div>`;
  $('#bNew').onclick = () => accBankForm({});
  $('#bTr').onclick = () => accTransferForm({});
  bindRowLinks();
}

function viewBankAccount(id) {
  const b = Store.get(ACC, id);
  if (!b || b.kind !== 'bankacct') return notFound('That account is not on this device.');
  setCrumbs([['Accounts', '#/accounts'], ['Bank', '#/accounts/bank'], [b.name]]);
  const tab = viewBankAccount.tab || 'match';
  const mv = accMovements(id);
  const tx = accAll('banktx').filter(t => t.bankId === id).sort((a, c) => (c.date || '').localeCompare(a.date || '') || (a.seq || 0) - (c.seq || 0));
  const todo = tx.filter(t => !t.link && !t.ignored);
  const stmtBal = tx.find(t => t.balance !== undefined && t.balance !== '' && t.balance !== null);
  const linked = accLinkedIds();
  let body;
  if (tab === 'match') {
    body = todo.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Date</th><th>Statement Says</th><th style="text-align:right">Amount</th><th>Match</th></tr></thead><tbody>
      ${todo.map(t => { const s = accSuggest(t, linked); return `<tr><td>${esc(fmtDate(t.date))}</td><td class="small">${esc(t.desc)}</td><td style="text-align:right" class="${t.amount > 0 ? 'acc-in' : ''}">${t.amount > 0 ? '+' : '−'}${accMoney(Math.abs(t.amount))}</td>
        <td><div class="row" style="gap:6px">${s ? `<button class="btn small primary" data-tx="${t.id}" data-do="match">${esc(s.label)}</button>` : ''}
          ${t.amount > 0 ? `<button class="btn small" data-tx="${t.id}" data-do="in">Money In…</button>` : `<button class="btn small" data-tx="${t.id}" data-do="exp">Expense…</button>`}
          <button class="btn small" data-tx="${t.id}" data-do="tr">Transfer…</button><button class="btn small" data-tx="${t.id}" data-do="ignore" title="Not needed, e.g. already covered">Skip</button></div></td></tr>`; }).join('')}
    </tbody></table></div>` : `<p class="muted">${tx.length ? 'Every imported statement line is matched.' : 'No statement imported yet. Press <b>Import Statement</b>.'}</p>`;
  } else if (tab === 'register') {
    body = mv.list.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Date</th><th>Details</th><th style="text-align:right">In</th><th style="text-align:right">Out</th><th style="text-align:right">Balance</th><th></th></tr></thead><tbody>
      <tr><td>${esc(fmtDate(b.openDate))}</td><td class="muted">Starting balance</td><td></td><td></td><td style="text-align:right">${accMoney(b.opening)}</td><td></td></tr>
      ${mv.list.map(m => `<tr><td>${esc(fmtDate(m.date))}</td><td>${esc(m.desc)}</td><td style="text-align:right" class="acc-in">${m.amount > 0 ? accMoney(m.amount) : ''}</td><td style="text-align:right">${m.amount < 0 ? accMoney(-m.amount) : ''}</td><td style="text-align:right">${accMoney(m.balance)}</td><td class="small">${linked.has(m.rec.id) ? '✓' : ''}</td></tr>`).join('')}
    </tbody></table></div><p class="small muted">✓ = matched to a bank statement line.</p>` : '<p class="muted">No money in or out recorded for this account yet.</p>';
  } else {
    const done = tx.filter(t => t.link || t.ignored);
    body = done.length ? `<div class="table-wrap"><table class="list"><thead><tr><th>Date</th><th>Statement Says</th><th style="text-align:right">Amount</th><th>Matched To</th><th></th></tr></thead><tbody>
      ${done.map(t => `<tr><td>${esc(fmtDate(t.date))}</td><td class="small">${esc(t.desc)}</td><td style="text-align:right">${t.amount > 0 ? '+' : '−'}${accMoney(Math.abs(t.amount))}</td><td class="small">${t.ignored ? '<span class="muted">Skipped</span>' : esc(accLinkLabel(t.link))}</td><td><button class="btn small" data-undo="${t.id}">Undo</button></td></tr>`).join('')}
    </tbody></table></div>` : '<p class="muted">Nothing matched yet.</p>';
  }
  $('#view').innerHTML = `<div class="spread dash-hello"><div><h1>${esc(b.name)}</h1><div class="muted">Balance in the portal <b>${accMoney(mv.balance)}</b>${stmtBal ? ` · last statement balance <b>${accMoney(stmtBal.balance)}</b> on ${esc(fmtDate(stmtBal.date))}` : ''}</div></div>
      <div class="row"><button class="btn" id="bEdit">Edit Account</button><label class="btn primary">Import Statement<input type="file" id="bImp" accept=".csv,text/csv" hidden></label></div></div>
    ${accTabs('bank')}
    <div class="seg" id="bTab" style="margin-bottom:12px">${[['match', `To Match (${todo.length})`], ['register', 'All Money In And Out'], ['done', 'Matched Lines']].map(([k, l]) => `<button type="button" data-t="${k}" class="${tab === k ? 'on' : ''}">${l}</button>`).join('')}</div>
    <div class="card">${body}</div>`;
  $$('#bTab button').forEach(x => { x.onclick = () => { viewBankAccount.tab = x.dataset.t; viewBankAccount(id); }; });
  $('#bEdit').onclick = () => accBankForm(b);
  $('#bImp').onchange = async ev => { const f = ev.target.files[0]; if (f) accImportCsv(id, await f.text()); };
  const redraw = () => viewBankAccount(id);
  $$('[data-tx]').forEach(x => {
    x.onclick = () => {
      const t = Store.get(ACC, x.dataset.tx), d = x.dataset.do;
      if (d === 'ignore') { t.ignored = true; Store.upsert(ACC, t); redraw(); return; }
      if (d === 'match') { accApplySuggestion(t, accSuggest(t, accLinkedIds())); redraw(); return; }
      if (d === 'in') accPaymentForm({ date: t.date, amount: t.amount, bankId: id, ref: t.desc, from: t.desc.slice(0, 40), bankTxId: t.id }, redraw);
      if (d === 'exp') accExpenseForm({ date: t.date, total: -t.amount, bankId: id, supplier: t.desc.slice(0, 40), ref: t.desc, bankTxId: t.id }, redraw);
      if (d === 'tr') accTransferForm(t.amount > 0 ? { date: t.date, amount: t.amount, toId: id, fromId: (accBanks().find(z => z.id !== id) || {}).id, bankTxId: t.id } : { date: t.date, amount: -t.amount, fromId: id, toId: (accBanks().find(z => z.id !== id) || {}).id, bankTxId: t.id }, redraw);
    };
  });
  $$('[data-undo]').forEach(x => { x.onclick = () => { const t = Store.get(ACC, x.dataset.undo); delete t.link; delete t.ignored; Store.upsert(ACC, t); redraw(); }; });
}

function accLinkedIds() { const s = new Set(); for (const t of accAll('banktx')) if (t.link) s.add(t.link.id); return s; }
function accUnlinkTx(recId) { for (const t of accAll('banktx')) if (t.link && t.link.id === recId) { delete t.link; Store.upsert(ACC, t); } }
function accLinkLabel(l) {
  const r = l && Store.get(ACC, l.id);
  if (!r) return 'Deleted record';
  if (r.kind === 'payment') return 'Money in: ' + accPaymentLabel(r);
  if (r.kind === 'expense') return `Expense: ${r.supplier || ''} (${accCat(ACC_EXP_CATS, r.category)[1]})`;
  if (r.kind === 'transfer') return `Transfer ${accBankName(r.fromId)} → ${accBankName(r.toId)}`;
  return r.kind;
}
const dayGap = (a, b) => Math.abs((new Date(a + 'T12:00:00') - new Date(b + 'T12:00:00')) / 86400000);
function accSuggest(t, linked) {
  const amt = Math.abs(t.amount), near = r => r.date && dayGap(r.date, t.date) <= 10 && !linked.has(r.id);
  if (t.amount > 0) {
    const p = accAll('payment').find(x => x.bankId === t.bankId && Math.abs(qNum(x.amount) - amt) < 0.005 && near(x));
    if (p) return { label: 'Match: ' + accPaymentLabel(p).slice(0, 30), kind: 'payment', id: p.id };
    const words = String(t.desc || '').toUpperCase();
    const invs = accAll('invoice').map(i => ({ i, st: invState(i) })).filter(x => x.st.due > 0 && Math.abs(x.st.due - amt) < 0.005);
    const inv = invs.find(x => words.includes(String(x.i.number).toUpperCase())) || invs[0];
    if (inv) return { label: `Paid ${inv.i.number} (${(inv.i.customer || {}).name || ''})`.slice(0, 42), kind: 'invoice', id: inv.i.id };
  } else {
    const e = accAll('expense').find(x => x.bankId === t.bankId && Math.abs(qNum(x.total) - amt) < 0.005 && near(x));
    if (e) return { label: 'Match: ' + (e.supplier || 'Expense').slice(0, 30), kind: 'expense', id: e.id };
  }
  const tr = accAll('transfer').find(x => (t.amount > 0 ? x.toId : x.fromId) === t.bankId && Math.abs(qNum(x.amount) - amt) < 0.005 && near(x));
  if (tr) return { label: 'Match: Transfer', kind: 'transfer', id: tr.id };
  // same supplier as before: offer to repeat the category
  if (t.amount < 0) {
    const key = String(t.desc || '').toUpperCase().replace(/[^A-Z ]/g, '').trim().split(/\s+/).slice(0, 2).join(' ');
    const prev = key.length >= 4 && accAll('expense').filter(x => x.ref && x.ref.toUpperCase().replace(/[^A-Z ]/g, '').includes(key)).sort((a, b) => (b.date || '').localeCompare(a.date || ''))[0];
    if (prev) return { label: `Expense: ${accCat(ACC_EXP_CATS, prev.category)[1]}`.slice(0, 42), kind: 'repeat', id: prev.id };
  }
  return null;
}
function accApplySuggestion(t, s) {
  if (!s) return;
  if (s.kind === 'invoice') {
    const p = Store.upsert(ACC, { kind: 'payment', invoiceId: s.id, date: t.date, amount: r2(t.amount), bankId: t.bankId, method: 'Bank Transfer', ref: t.desc, bankTxId: t.id });
    const inv = Store.get(ACC, s.id); if (inv && inv.status === 'Draft') { inv.status = 'Sent'; Store.upsert(ACC, inv); }
    t.link = { kind: 'payment', id: p.id };
  } else if (s.kind === 'repeat') {
    const prev = Store.get(ACC, s.id);
    const e = Store.upsert(ACC, { kind: 'expense', date: t.date, supplier: prev.supplier, category: prev.category, desc: prev.desc || '', total: r2(-t.amount), vat: 0, businessPct: prev.businessPct ?? 100, bankId: t.bankId, ref: t.desc, bankTxId: t.id });
    t.link = { kind: 'expense', id: e.id };
    toast('Expense added: open it from Expenses to add the VAT or receipt');
  } else t.link = { kind: s.kind, id: s.id };
  Store.upsert(ACC, t);
}

/* bank statement CSV: finds the date, description and amount (or paid in / paid out) columns by their headings */
function accParseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') { if (ch === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(c => String(c).trim()));
}
function accParseDate(s) {
  s = String(s || '').trim();
  let m = s.match(/^(\d{4})-(\d\d)-(\d\d)/); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? '20' + m[3] : m[3]; return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  m = s.match(/^(\d{1,2})[\s-]([A-Za-z]{3})[A-Za-z]*[\s-](\d{2,4})$/);
  if (m) { const mo = 'janfebmaraprmayjunjulaugsepoctnovdec'.indexOf(m[2].toLowerCase()) / 3 + 1; const y = m[3].length === 2 ? '20' + m[3] : m[3]; if (mo > 0) return `${y}-${String(mo).padStart(2, '0')}-${m[1].padStart(2, '0')}`; }
  return '';
}
function accParseAmount(s) {
  s = String(s ?? '').trim(); if (!s) return null;
  let neg = /^\(.*\)$/.test(s) || /^-/.test(s) || /DR$/i.test(s);
  const n = parseFloat(s.replace(/[£$,\s()]|CR$|DR$/gi, '').replace(/^-/, ''));
  if (!Number.isFinite(n)) return null;
  return neg ? -n : n;
}
function accImportCsv(bankId, text) {
  const rows = accParseCsv(text);
  const hi = rows.findIndex(r => r.some(c => /date/i.test(c)));
  if (hi < 0) { toast('No "Date" column found in that file'); return; }
  const h = rows[hi].map(c => String(c).trim().toLowerCase());
  const col = re => h.findIndex(c => re.test(c));
  const cDate = col(/date/), cDesc = col(/desc|details|narrative|payee|transaction|reference|memo|name/);
  const cAmt = col(/^amount|^value|amount \(|^£/), cIn = col(/paid in|money in|credit|^in$|receipts|deposits/), cOut = col(/paid out|money out|debit|^out$|payments|withdrawals/), cBal = col(/balance/);
  if (cAmt < 0 && cIn < 0 && cOut < 0) { toast('No amount columns found in that file'); return; }
  const existing = new Set(accAll('banktx').filter(t => t.bankId === bankId).map(t => t.key));
  let added = 0, dup = 0, bad = 0, seq = 0;
  const seen = {};
  for (const r of rows.slice(hi + 1)) {
    const date = accParseDate(r[cDate]);
    let amt = cAmt >= 0 ? accParseAmount(r[cAmt]) : null;
    if (amt === null) { const i = cIn >= 0 ? accParseAmount(r[cIn]) : null, o = cOut >= 0 ? accParseAmount(r[cOut]) : null; amt = i ? Math.abs(i) : o ? -Math.abs(o) : null; }
    if (!date || amt === null || amt === 0) { bad++; continue; }
    const desc = cDesc >= 0 ? String(r[cDesc] || '').trim() : r.filter((_, i) => i !== cDate && i !== cAmt && i !== cBal).join(' ').trim();
    const base = `${date}|${r2(amt)}|${desc.toUpperCase()}`;
    seen[base] = (seen[base] || 0) + 1;
    const key = base + '|' + seen[base];  // two identical lines on one day both count
    if (existing.has(key)) { dup++; continue; }
    const bal = cBal >= 0 ? accParseAmount(r[cBal]) : null;
    Store.upsert(ACC, { kind: 'banktx', bankId, date, desc, amount: r2(amt), balance: bal === null ? undefined : bal, key, seq: seq++ });
    added++;
  }
  toast(`${added} line${added === 1 ? '' : 's'} imported${dup ? `, ${dup} already there` : ''}${bad ? `, ${bad} skipped` : ''}`);
  viewBankAccount.tab = 'match'; viewBankAccount(bankId);
}

/* ---------- Reports ---------- */
function viewAccReports() {
  setCrumbs([['Accounts', '#/accounts'], ['Reports & Tax']]);
  const S = accSettings(), V = accVat(), p = accPeriod();
  const basis = viewAccReports.basis || S.basis;
  const pl = accPL(p, basis), tax = accTaxEstimate(pl.profit);
  const catRows = ACC_EXP_CATS.filter(c => c[2] && pl.cats[c[0]]).map(c => `<div class="acc-kv"><span>${esc(c[1])}</span><b>${accMoney(pl.cats[c[0]])}</b></div>`).join('');
  const invs = accAll('invoice').map(i => ({ i, st: invState(i) })).filter(x => x.st.due > 0);
  const age = x => Math.max(0, dayGap(today(), x.i.dueDate || x.i.date) * (x.i.dueDate < today() ? 1 : 0));
  const buckets = [['Not Due Yet', x => !(x.i.dueDate < today())], ['1–30 Days Late', x => x.i.dueDate < today() && age(x) <= 30], ['31–60 Days Late', x => age(x) > 30 && age(x) <= 60], ['61–90 Days Late', x => age(x) > 60 && age(x) <= 90], ['Over 90 Days Late', x => age(x) > 90]];
  const vq = viewAccReports.vq || accVatQuarters()[1].join('|');
  const [vf, vt] = vq.split('|');
  const vr = V.on ? accVatReturn({ from: vf, to: vt }) : null;
  const vatBoxes = ['VAT due on sales', 'VAT due on EU acquisitions', 'Total VAT due', 'VAT reclaimed on purchases', 'Net VAT to pay (or reclaim)', 'Sales before VAT', 'Purchases before VAT', 'Goods supplied to EU', 'Goods acquired from EU'];
  $('#view').innerHTML = `${accHead('Reports & Tax', 'Profit, tax to put aside, VAT and who owes you. Check the figures with an accountant before filing.', '<button class="btn" id="rPrint">Print / PDF</button>', 'reports')}
    <div class="spread">${accPeriodPicker()}<div class="seg" id="rBasis">${[['cash', 'Cash Basis'], ['accrual', 'Invoice Basis']].map(([k, l]) => `<button type="button" data-b="${k}" class="${basis === k ? 'on' : ''}">${l}</button>`).join('')}</div></div>
    <div class="grid2" style="align-items:start;gap:14px">
      <div class="card barred" id="rPL"><div class="card-bar"><h3>Profit & Loss</h3></div>
        <p class="small muted">${esc(fmtDate(p.from))} to ${esc(fmtDate(p.to))} · ${basis === 'cash' ? 'cash basis: income when the money arrives' : 'invoice basis: income on the invoice date'}</p>
        <div class="acc-kv"><span>Sales</span><b>${accMoney(pl.sales)}</b></div>
        ${pl.other ? `<div class="acc-kv"><span>Other Business Income</span><b>${accMoney(pl.other)}</b></div>` : ''}
        <div class="acc-kv acc-total"><span>Total Income</span><b>${accMoney(pl.income)}</b></div>
        ${catRows}
        ${pl.mileage ? `<div class="acc-kv"><span>Mileage (${Math.round(pl.miles).toLocaleString('en-GB')} Miles At HMRC Rates)</span><b>${accMoney(pl.mileage)}</b></div>` : ''}
        <div class="acc-kv acc-total"><span>Total Expenses</span><b>${accMoney(pl.expenses)}</b></div>
        <div class="acc-kv acc-total big"><span>${pl.profit < 0 ? 'Loss' : 'Net Profit'}</span><b>${accMoney(pl.profit)}</b></div>
        ${pl.privateShare ? `<p class="small muted">${accMoney(pl.privateShare)} of costs left out as the personal share.</p>` : ''}
        ${pl.nonPLOut || pl.nonPLIn ? `<p class="small muted">Not in profit: ${accMoney(pl.nonPLOut)} drawings, tax, VAT and loan repayments paid out; ${accMoney(pl.nonPLIn)} capital, loans and VAT refunds in.</p>` : ''}
      </div>
      <div>
        <div class="card barred"><div class="card-bar"><h3>${S.structure === 'ltd' ? 'Corporation Tax To Put Aside' : 'Tax To Put Aside'}</h3></div>
          ${tax.lines.map(([l, v]) => `<div class="acc-kv"><span>${esc(l)}</span><b>${accMoney(v)}</b></div>`).join('')}
          <div class="acc-kv acc-total"><span>Total</span><b>${accMoney(tax.total)}</b></div>
          <p class="small muted">${S.structure === 'ltd' ? 'Rough estimate at 19% for profits up to £50,000, 25% over £250,000, with marginal relief between. Your accountant works out the real figure.' : `Rough estimate for England at the current rates (£12,570 personal allowance, 20% / 40% / 45% income tax, 6% / 2% Class 4 NI)${qNum(S.otherIncome) ? `, with your other income of ${accMoney(S.otherIncome)}` : ', assuming this is your only income (add other income in Settings)'}. Payments on account can also be due. Use it to decide how much to keep back, not for your return.`}</p>
          ${S.structure !== 'ltd' ? `<details class="cu-note"><summary>Self Assessment Figures</summary><p class="small">On the self-employment pages: turnover <b>${accMoney(pl.sales + pl.other)}</b>, allowable expenses <b>${accMoney(pl.expenses)}</b>, net profit <b>${accMoney(pl.profit)}</b>. Expenses by category are on the left. If turnover is under £90,000 you can give total expenses as one figure.</p></details>` : ''}
        </div>
        ${V.on ? `<div class="card barred"><div class="card-bar"><h3>VAT Return</h3></div>
          <div class="grid2">${field('Quarter', 'vq', vq, { type: 'select', blank: false, options: accVatQuarters().map(([f, t]) => [f + '|' + t, `${fmtDate(f)} – ${fmtDate(t)}`]) })}<div class="small muted" style="padding-top:28px">${S.vatScheme === 'flat' ? `Flat rate scheme at ${S.flatRate}%` : S.vatCash ? 'Cash accounting' : 'Standard (invoice date)'}</div></div>
          ${vr.boxes.map((v, i) => `<div class="acc-kv"><span>Box ${i + 1} · ${vatBoxes[i]}</span><b>${i >= 5 ? '£' + v.toLocaleString('en-GB') : accMoney(v)}</b></div>`).join('')}
          <p class="small muted">Submit through HMRC-recognised Making Tax Digital software or your accountant. Check the quarter dates match the ones HMRC gave you.${S.vatScheme === 'flat' ? ' Flat rate: Box 4 only covers single capital purchases over £2,000, add those yourself.' : ''}</p></div>` : ''}
        <div class="card barred"><div class="card-bar"><h3>Who Owes You</h3></div>
          ${buckets.map(([l, fn]) => { const xs = invs.filter(fn); return `<div class="acc-kv"><span>${l} (${xs.length})</span><b>${accMoney(xs.reduce((s, x) => s + x.st.due, 0))}</b></div>`; }).join('')}
          <div class="acc-kv acc-total"><span>Total Owed</span><b>${accMoney(invs.reduce((s, x) => s + x.st.due, 0))}</b></div></div>
        <div class="card barred"><div class="card-bar"><h3>Download For Your Accountant</h3></div>
          <p class="small muted">Spreadsheet (CSV) files for the period picked above.</p>
          <div class="row" style="flex-wrap:wrap;gap:6px"><button class="btn small" data-csv="inv">Invoices</button><button class="btn small" data-csv="in">Money In</button><button class="btn small" data-csv="exp">Expenses</button><button class="btn small" data-csv="miles">Mileage</button><button class="btn small" data-csv="bank">Bank Lines</button><button class="btn small" data-csv="pl">Profit & Loss</button></div></div>
      </div>
    </div>`;
  accBindPeriod(viewAccReports);
  $$('#rBasis button').forEach(x => { x.onclick = () => { viewAccReports.basis = x.dataset.b; viewAccReports(); }; });
  const vs = $('[name=vq]'); if (vs) vs.onchange = () => { viewAccReports.vq = vs.value; viewAccReports(); };
  $('#rPrint').onclick = () => accPrintReport(p, pl, tax, basis);
  $$('[data-csv]').forEach(x => { x.onclick = () => accExport(x.dataset.csv, p, pl); });
}

function accExport(what, p, pl) {
  const tag = `${p.from}_to_${p.to}`;
  const sel = k => accAll(k).filter(x => inPeriod(x.date, p)).sort((a, b) => (a.date || '').localeCompare(b.date || ''));
  let rows;
  if (what === 'inv') rows = [['Number', 'Date', 'Due', 'Customer', 'Net', 'VAT', 'Total', 'Paid', 'Owed', 'Status'], ...sel('invoice').map(i => { const st = invState(i); return [i.number, i.date, i.dueDate, (i.customer || {}).name, st.t.net, st.t.vat, st.t.total, st.paid, st.due, st.status]; })];
  if (what === 'in') rows = [['Date', 'Invoice', 'From / Customer', 'Type', 'Amount', 'VAT', 'Account', 'Method', 'Reference'], ...sel('payment').map(x => { const inv = x.invoiceId ? Store.get(ACC, x.invoiceId) : null; return [x.date, inv ? inv.number : '', inv ? (inv.customer || {}).name : x.from, inv ? 'Invoice Payment' : accCat(ACC_IN_CATS, x.category)[1], x.amount, x.vat || 0, accBankName(x.bankId), x.method, x.ref]; })];
  if (what === 'exp') rows = [['Date', 'Supplier', 'Category', 'Description', 'Total', 'VAT', 'Net', 'Business %', 'Account', 'Reference', 'Receipt Kept'], ...sel('expense').map(x => [x.date, x.supplier, accCat(ACC_EXP_CATS, x.category)[1], x.desc, x.total, x.vat || 0, r2(qNum(x.total) - qNum(x.vat)), x.businessPct ?? 100, accBankName(x.bankId), x.ref, x.receipt ? 'Yes' : 'No'])];
  if (what === 'miles') { const v = accMileageValues(); rows = [['Date', 'From', 'To', 'Return', 'Purpose', 'Miles', 'Claim'], ...sel('mileage').map(x => [x.date, x.from, x.to, x.ret ? 'Yes' : 'No', x.purpose, x.miles, v.get(x.id)])]; }
  if (what === 'bank') rows = [['Account', 'Date', 'Description', 'Amount', 'Balance', 'Matched To'], ...sel('banktx').map(t => [accBankName(t.bankId), t.date, t.desc, t.amount, t.balance ?? '', t.ignored ? 'Skipped' : t.link ? accLinkLabel(t.link) : ''])];
  if (what === 'pl') rows = [['Profit & Loss', `${p.from} to ${p.to}`, pl.basis], ['Sales', pl.sales], ['Other Income', pl.other], ['Total Income', pl.income], ...ACC_EXP_CATS.filter(c => pl.cats[c[0]]).map(c => [c[1], pl.cats[c[0]]]), ['Mileage', pl.mileage], ['Total Expenses', pl.expenses], ['Net Profit', pl.profit]];
  accDownload(`compliance-plus-${what}-${tag}.csv`, accCsv(rows));
}

function accPrintReport(p, pl, tax, basis) {
  const s = Store.settings;
  const row = (l, v, cls) => `<tr class="${cls || ''}"><td>${esc(l)}</td><td class="r">${accMoney(v)}</td></tr>`;
  const html = `<div class="report qt"><div class="page">
    <div class="qt-head"><div class="qt-brand">${s.logo ? `<img src="${s.logo}" alt="">` : '<img src="icon.svg" alt="">'}<div><div class="qt-name">${esc(s.businessName)}</div><div class="qt-tag">Profit & Loss · ${esc(fmtDate(p.from))} to ${esc(fmtDate(p.to))} · ${basis === 'cash' ? 'Cash Basis' : 'Invoice Basis'}</div></div></div></div>
    <table class="qt-table" style="margin-top:8mm"><tbody>
      ${row('Sales', pl.sales)}${pl.other ? row('Other Business Income', pl.other) : ''}${row('Total Income', pl.income, 'acc-print-total')}
      ${ACC_EXP_CATS.filter(c => pl.cats[c[0]]).map(c => row(c[1], pl.cats[c[0]])).join('')}
      ${pl.mileage ? row(`Mileage (${Math.round(pl.miles)} miles)`, pl.mileage) : ''}
      ${row('Total Expenses', pl.expenses, 'acc-print-total')}${row(pl.profit < 0 ? 'Loss' : 'Net Profit', pl.profit, 'acc-print-total')}
      ${tax.lines.map(([l, v]) => row(l + ' (Estimate)', v)).join('')}
    </tbody></table>
    <p style="font-size:8.5pt;color:#76687a;margin-top:6mm">Prepared from the Compliance Plus portal on ${esc(fmtDate(today()))}. Tax figures are rough estimates.</p>
  </div></div>`;
  showPrint(html, { title: `Profit and Loss ${p.from} to ${p.to}` });
}

/* ---------- Settings ---------- */
function viewAccSettings() {
  setCrumbs([['Accounts', '#/accounts'], ['Settings']]);
  const S = accSettings(), P = qPrices();
  const [mm, dd] = String(S.yearStart).split('-');
  $('#view').innerHTML = `${accHead('Accounts Settings', 'How your business is set up. Only you can see these.', '<button class="btn primary" id="sSave">Save Settings</button>', 'settings')}
    <div class="grid2" style="align-items:start;gap:14px" id="sForm">
      <div>
        <div class="card"><h3>Your Business</h3>
          ${field('Business Type', 'structure', S.structure, { type: 'select', blank: false, options: [['sole', 'Sole Trader (Self-Employed)'], ['ltd', 'Limited Company']] })}
          <div class="grid2">${field('Year Starts (Day)', 'ysDay', +dd, { type: 'number', attrs: 'min="1" max="31"' })}${field('Year Starts (Month)', 'ysMonth', +mm, { type: 'select', blank: false, options: ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'].map((n, i) => [i + 1, n]) })}</div>
          <p class="small muted" style="margin-top:-6px">Sole traders: 6 April, the start of the tax year. Limited companies: the day after your company year end.</p>
          ${field('Profit Worked Out On', 'basis', S.basis, { type: 'select', blank: false, options: [['cash', 'Cash Basis (Money In And Out When It Happens)'], ['accrual', 'Invoice Basis (Traditional Accounting)']], hint: 'Cash basis is the normal choice for a sole trader. Limited companies use invoice basis.' })}
          <div class="grid2">${field('Company Number', 'companyNo', S.companyNo)}${field('UTR (Tax Reference)', 'utr', S.utr)}</div>
          ${field('Other Taxable Income This Year (£)', 'otherIncome', S.otherIncome, { type: 'number', attrs: 'step="1" min="0"', hint: 'e.g. a job or pension. Only used for the tax-to-put-aside estimate.' })}
        </div>
        <div class="card"><h3>VAT</h3>
          <label class="checkrow"><input type="checkbox" name="vatRegistered" ${P.vatRegistered ? 'checked' : ''}> VAT Registered (Also Used On Quotes)</label>
          <div class="grid2">${field('VAT Rate (%)', 'vatRate', P.vatRate, { type: 'number', attrs: 'step="0.5" min="0"' })}${field('VAT Number', 'vatNumber', S.vatNumber)}</div>
          ${field('VAT Scheme', 'vatScheme', S.vatScheme, { type: 'select', blank: false, options: [['standard', 'Standard'], ['flat', 'Flat Rate Scheme']] })}
          <div class="grid2">${field('Flat Rate (%)', 'flatRate', S.flatRate, { type: 'number', attrs: 'step="0.1" min="0"' })}<div class="field"><label>&nbsp;</label><label class="checkrow"><input type="checkbox" name="vatCash" ${S.vatCash ? 'checked' : ''}> Cash Accounting Scheme</label></div></div>
          <p class="small muted">You must register for VAT if your sales go over £90,000 in any 12 months in a row.</p>
        </div>
      </div>
      <div>
        <div class="card"><h3>Invoices</h3>
          <div class="grid2">${field('Number Starts With', 'invPrefix', S.invPrefix)}${field('Next Number', 'nextInvoice', S.nextInvoice, { type: 'number', attrs: 'min="1"' })}</div>
          ${field('Days To Pay', 'payDays', S.payDays, { type: 'number', attrs: 'min="0"' })}
          ${field('Message At The Bottom', 'invoiceFooter', S.invoiceFooter, { type: 'textarea' })}
        </div>
        <div class="card"><h3>Bank Details Printed On Invoices</h3>
          ${field('Account Name', 'accountName', S.accountName)}
          ${field('Bank', 'bankName', S.bankName)}
          <div class="grid2">${field('Sort Code', 'sortCode', S.sortCode, { placeholder: '00-00-00' })}${field('Account Number', 'accountNo', S.accountNo)}</div>
          <p class="small muted">Kept in your private accounts records, not in the settings your clients' logins can read.</p>
        </div>
      </div>
    </div>`;
  $('#sSave').onclick = () => {
    const v = formValues($('#sForm'));
    const day = Math.min(31, Math.max(1, Math.round(qNum(v.ysDay)) || 1)), mon = Math.min(12, Math.max(1, Math.round(qNum(v.ysMonth)) || 4));
    const n = Object.assign(S, {
      structure: v.structure, basis: v.basis, yearStart: `${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
      companyNo: v.companyNo, utr: v.utr, otherIncome: qNum(v.otherIncome),
      vatNumber: v.vatNumber, vatScheme: v.vatScheme, flatRate: qNum(v.flatRate), vatCash: !!v.vatCash,
      invPrefix: v.invPrefix || 'INV-', nextInvoice: Math.max(1, Math.round(qNum(v.nextInvoice)) || 1), payDays: Math.max(0, Math.round(qNum(v.payDays))), invoiceFooter: v.invoiceFooter,
      accountName: v.accountName, bankName: v.bankName, sortCode: v.sortCode, accountNo: v.accountNo
    });
    accSaveSettings(n);
    qSavePrices(Object.assign(P, { vatRegistered: !!v.vatRegistered, vatRate: qNum(v.vatRate) || 20 }));
    accView.from = null;
    toast('Accounts settings saved');
  };
}

/* invoices on a client's page (staff only) */
function accClientCard(c) {
  if (typeof Cloud !== 'undefined' && Cloud.isClient && Cloud.isClient()) return '';
  const list = accAll('invoice').filter(i => i.clientId === c.id).map(i => ({ i, st: invState(i) })).sort((a, b) => (b.i.date || '').localeCompare(a.i.date || ''));
  const owed = list.reduce((s, x) => s + x.st.due, 0);
  return `<div class="card barred mt"><div class="card-bar"><h3>Invoices${owed ? ' · ' + accMoney(owed) + ' Owed' : ''}</h3><button class="btn" onclick="invForClient('${c.id}')">+ New Invoice</button></div>
    ${list.length ? `<table class="list"><tbody>${list.slice(0, 10).map(x => `<tr class="click" data-href="#/invoice/${x.i.id}"><td><b>${esc(x.i.number)}</b></td><td>${esc(fmtDate(x.i.date))}</td><td style="text-align:right">${accMoney(x.st.t.total)}</td><td>${invBadge(x.st.status)}</td></tr>`).join('')}</tbody></table>` : '<p class="muted small">No invoices for this client yet.</p>'}</div>`;
}
