'use strict';

/* Compliance Plus — client report.
   Builds a printable A4 report for one site. The browser's Print → Save As PDF
   turns it into the PDF sent to the client. */

async function render3DSnapshot(site, items, bgImages) {
  const box = document.createElement('div');
  box.style.cssText = 'position:fixed;left:-5000px;top:0;width:1400px;height:900px';
  document.body.appendChild(box);
  let url = '';
  try {
    const v = new Plan3D(box, { statusOf: it => itemState(it).outcome });
    v.resize();
    v.build(site, items, { bgImages, explode: 2.4, roomLabels: true });
    url = v.snapshot();
    v.dispose();
  } catch (e) { console.warn('3D snapshot failed', e); }
  box.remove();
  return url;
}

async function photoTags(ids, max = 6) {
  const out = [];
  for (const id of (ids || []).slice(0, max)) {
    const src = await Store.getPhoto(id);
    if (src) out.push(`<img src="${src}" alt="">`);
  }
  return out.length ? `<div class="photo-grid">${out.join('')}</div>` : '';
}

function failedChecksText(item, insp) {
  if (insp.fd) return [...fdFindings(item, insp), ...fdCaveats(item, insp).map(c => 'Could not verify: ' + c)];
  const type = ITEM_TYPES[item.type] || ITEM_TYPES.other;
  const out = [];
  for (const c of type.checks) {
    const a = insp.answers && insp.answers[c.key];
    if (a && a.v === 'fail') out.push(c.q + (a.note ? ` — ${a.note}` : ''));
  }
  for (const r of type.readings) {
    const v = insp.readings && insp.readings[r.key];
    if (evaluateReading(r, v, item.details) === 'fail') out.push(`${r.label}: ${v} ${r.unit} (limit ${readingLimitText(r, item.details)})`);
  }
  return out;
}

async function buildReport(siteId, opts) {
  const site = Store.get('sites', siteId);
  const client = Store.get('clients', site.clientId) || {};
  const s = Store.settings;
  const from = opts.from || '0000-01-01', to = opts.to || '9999-12-31';
  const items = Store.list('items').filter(i => i.siteId === siteId && !i.archived).sort((a, b) => a.ref.localeCompare(b.ref));
  const inRange = it => Store.list('inspections')
    .filter(x => x.itemId === it.id && x.date >= from && x.date <= to)
    .sort((a, b) => b.date.localeCompare(a.date))[0] || null;
  const rows = items.map(it => ({ it, insp: inRange(it) }));
  const inspected = rows.filter(r => r.insp);
  const count = o => inspected.filter(r => r.insp.outcome === o).length;
  const dates = inspected.map(r => r.insp.date).sort();
  const visit = dates.length ? (dates[0] === dates[dates.length - 1] ? fmtDate(dates[0]) : `${fmtDate(dates[0])} to ${fmtDate(dates[dates.length - 1])}`) : 'Not Recorded';
  const assessor = opts.assessor || s.assessorName || '';
  const reportRef = opts.reportRef || `${s.refPrefix}-R-${(opts.issueDate || today()).replace(/-/g, '')}`;
  const sec = opts.sections || {};
  const pages = [];
  let secNo = 0;
  const N = () => ++secNo;

  // Cover
  pages.push(`<div class="page cover">
    <div class="cover-band">
      ${s.logo ? `<img src="${s.logo}" alt="" style="max-height:22mm;max-width:70mm;background:#fff;padding:2mm;border-radius:3px">` : `<div style="font-size:16pt;font-weight:700">${esc(s.businessName)}</div>`}
      <h1>${esc(opts.title || 'Fire Safety & Compliance Inspection Report')}</h1>
      <div style="font-size:13pt">${esc(site.name)}</div>
      <div style="opacity:.85">${esc([site.address, site.postcode].filter(Boolean).join(', '))}</div>
    </div>
    <div class="cover-meta">
      ${client.logo ? `<div style="display:flex;align-items:center;gap:5mm;margin-bottom:5mm"><div class="small" style="color:#555">Prepared for</div><img src="${client.logo}" style="max-height:22mm;max-width:70mm"></div>` : ''}
      <table>
        <tr><th style="width:45mm">Client</th><td>${esc(client.name || '')}</td></tr>
        <tr><th>Client Contact</th><td>${esc([client.contact, client.email, client.phone].filter(Boolean).join(' · '))}</td></tr>
        <tr><th>Premises</th><td>${esc(site.name)}${site.buildingUse ? ` — ${esc(site.buildingUse)}` : ''}</td></tr>
        <tr><th>Responsible Person</th><td>${esc(site.responsiblePerson || '')}</td></tr>
        <tr><th>Date Of Inspection</th><td>${esc(visit)}</td></tr>
        <tr><th>Report Issued</th><td>${esc(fmtDate(opts.issueDate || today()))}</td></tr>
        <tr><th>Report Reference</th><td>${esc(reportRef)}</td></tr>
        <tr><th>Inspected By</th><td>${esc(assessor)}${s.qualifications ? `<br><span style="color:#555">${esc(s.qualifications)}</span>` : ''}</td></tr>
      </table>
    </div>
    <div style="margin-top:auto;font-size:9pt;color:#555;border-top:1px solid #ccd;padding-top:4mm">
      <b>${esc(s.businessName)}</b>${s.address ? ' · ' + esc(s.address) : ''}<br>
      ${esc([s.phone, s.email, s.website].filter(Boolean).join(' · '))}
    </div>
  </div>`);

  // Summary
  const byType = {};
  for (const r of rows) {
    const k = r.it.type;
    byType[k] = byType[k] || { total: 0, pass: 0, fail: 0, advisory: 0, none: 0 };
    byType[k].total++;
    if (!r.insp) byType[k].none++; else byType[k][r.insp.outcome]++;
  }
  const fails = inspected.filter(r => r.insp.outcome === 'fail');
  pages.push(`<div class="page">
    <h2>${N()}. Summary</h2>
    <p>${esc(assessor || s.businessName)} carried out an inspection at <b>${esc(site.name)}</b> on ${esc(visit)}.
      This report sets out the items inspected, their condition, the defects found and the actions recommended.
      Each item carries a QR label with the reference shown in this report; scanning the label shows its inspection record.</p>
    <div class="sumgrid">
      <div><b>${inspected.length}</b>Items Inspected</div>
      <div><b style="color:#2e9e5b">${count('pass')}</b>Satisfactory</div>
      <div><b style="color:#d64545">${count('fail')}</b>Defects Requiring Action</div>
      <div><b style="color:#b07d00">${count('advisory')}</b>Advisory</div>
    </div>
    <table><tr><th>Item Type</th><th>Total</th><th>Satisfactory</th><th>Defective</th><th>Advisory</th><th>Not Inspected</th></tr>
      ${Object.entries(byType).map(([k, v]) => `<tr><td>${esc((ITEM_TYPES[k] || ITEM_TYPES.other).label)}</td><td>${v.total}</td><td>${v.pass}</td><td>${v.fail}</td><td>${v.advisory}</td><td>${v.none}</td></tr>`).join('')}
    </table>
    ${fails.length ? `<h3>Items Requiring Action</h3><table><tr><th>No.</th><th>Ref</th><th>Item</th><th>Location</th><th>Recommended Action</th></tr>
      ${fails.map(r => `<tr><td>${itemNo(r.it)}</td><td>${esc(r.it.ref)}</td><td>${esc(itemTitle(r.it))}</td><td>${esc(locationText(r.it, true))}</td><td>${esc(r.insp.action || failedChecksText(r.it, r.insp).join('; '))}</td></tr>`).join('')}</table>` : '<p><b>No defects requiring action were found.</b></p>'}
    ${opts.summary ? `<h3>Assessor's Comments</h3><p>${esc(opts.summary).replace(/\n/g, '<br>')}</p>` : ''}
  </div>`);

  // Plans
  if (sec.plans !== false && (site.floors || []).length) {
    const bgImages = new Map();
    for (const f of site.floors) if (f.bg && f.bg.photoId) bgImages.set(f.bg.photoId, await loadImage(await Store.getPhoto(f.bg.photoId)));
    let html = '';
    const pn = N();
    if (sec.threeD !== false) {
      const snap = await render3DSnapshot(site, items, bgImages);
      if (snap) html += `<div class="page"><h2>${pn}. Building Overview</h2><p class="small">3D view of the premises showing the location of every item inspected. Pin colours: green satisfactory, red defective, amber advisory, grey not inspected.</p><img class="plan-img" src="${snap}" alt=""></div>`;
    }
    const floors = [...site.floors].sort((a, b) => (a.level || 0) - (b.level || 0));
    for (const f of floors) {
      const fItems = items.filter(i => i.floorId === f.id);
      const img = renderPlanImage(f, fItems, { bgImg: f.bg && f.bg.photoId ? bgImages.get(f.bg.photoId) : null, statusOf: it => { const r = inRange(it); return r ? r.outcome : 'untested'; }, width: 1600, height: 1100 });
      html += `<div class="page"><h2>${pn}. Plan — ${esc(f.name)}</h2>
        <img class="plan-img" src="${img}" alt="">
        <table><tr><th>No.</th><th>Ref</th><th>Item</th><th>Room</th><th>Result</th></tr>
        ${fItems.map(it => { const r = inRange(it); return `<tr><td>${itemNo(it)}</td><td>${esc(it.ref)}</td><td>${esc(itemTitle(it))}</td><td>${esc(roomName(it))}</td><td>${esc(r ? OUTCOME_LABEL[r.outcome] : 'Not Inspected')}</td></tr>`; }).join('') || '<tr><td colspan="5">No items on this floor.</td></tr>'}
        </table></div>`;
    }
    pages.push(html);
  }

  // Fire doors
  const doors = rows.filter(r => r.it.type === 'fire-door');
  if (sec.doors !== false && doors.length) {
    pages.push(`<div class="page"><h2>${N()}. Fire Door Schedule</h2>
      <p class="small">Fire doors were inspected visually and operationally against the manufacturer's certification and current guidance (BS 8214, Approved Document B and the Fire Safety (England) Regulations 2022 where applicable). Gaps are measured in millimetres: head / hinge side / closing side / threshold.</p>
      <table><tr><th>No.</th><th>Ref</th><th>Location</th><th>Rating</th><th>Use</th><th>Gaps (mm)</th><th>Result</th><th>Defects</th><th>Next Due</th></tr>
      ${doors.map(({ it, insp }) => {
        const g = insp ? insp.readings || {} : {};
        return `<tr><td>${itemNo(it)}</td><td>${esc(it.ref)}</td><td>${esc(locationText(it, true))}</td><td>${esc(it.details.rating || '')}</td><td>${esc(it.details.use || '')}</td>
        <td>${insp ? [g.gapHead, g.gapHinge, g.gapLock, g.gapThreshold].map(v => v === undefined || v === '' ? '–' : esc(v)).join(' / ') : ''}</td>
        <td>${insp ? `<b style="color:${STATUS_COLORS[insp.outcome]}">${esc(insp.fd ? insp.fd.result : OUTCOME_LABEL[insp.outcome])}</b>` : 'Not Inspected'}</td>
        <td>${insp ? esc(failedChecksText(it, insp).join('; ')) : ''}</td><td>${insp ? esc(fmtDate(insp.nextDue)) : ''}</td></tr>`;
      }).join('')}</table></div>`);
  }

  // PAT
  const pat = rows.filter(r => r.it.type === 'pat');
  if (sec.pat !== false && pat.length) {
    const rd = (insp, k) => insp && insp.readings && insp.readings[k] !== undefined && insp.readings[k] !== '' ? esc(insp.readings[k]) : '–';
    pages.push(`<div class="page"><h2>${N()}. Portable Appliance Register</h2>
      <p class="small">In-service inspection and testing carried out in line with the IET Code of Practice for In-service Inspection and Testing of Electrical Equipment. Earth continuity in Ω, insulation resistance in MΩ, leakage / touch current in mA.</p>
      <table><tr><th>No.</th><th>Ref</th><th>Appliance</th><th>Make / Model / Serial</th><th>Class</th><th>Location</th><th>Earth</th><th>Insul.</th><th>Leak.</th><th>Result</th><th>Retest</th></tr>
      ${pat.map(({ it, insp }) => `<tr><td>${itemNo(it)}</td><td>${esc(it.ref)}</td><td>${esc(it.details.appliance || it.name || '')}</td>
        <td>${esc([it.details.make, it.details.model, it.details.serial].filter(Boolean).join(' / '))}</td><td>${esc((it.details.class || '').replace('Class ', ''))}</td>
        <td>${esc(locationText(it, true))}</td><td>${rd(insp, 'earth')}</td><td>${rd(insp, 'insulation')}</td><td>${rd(insp, 'leakage')}</td>
        <td>${insp ? `<b style="color:${STATUS_COLORS[insp.outcome]}">${OUTCOME_LABEL[insp.outcome]}</b>` : 'Not Tested'}</td><td>${insp ? esc(fmtDate(insp.nextDue)) : ''}</td></tr>`).join('')}
      </table></div>`);
  }

  // Other equipment
  const others = rows.filter(r => !['fire-door', 'pat'].includes(r.it.type));
  if (sec.other !== false && others.length) {
    pages.push(`<div class="page"><h2>${N()}. Other Fire Safety Equipment And Hazard Points</h2>
      <table><tr><th>No.</th><th>Ref</th><th>Type</th><th>Details</th><th>Location</th><th>Result</th><th>Defects</th><th>Next Due</th></tr>
      ${others.map(({ it, insp }) => `<tr><td>${itemNo(it)}</td><td>${esc(it.ref)}</td><td>${esc((ITEM_TYPES[it.type] || ITEM_TYPES.other).label)}</td>
        <td>${esc(detailSummary(it))}</td><td>${esc(locationText(it, true))}</td>
        <td>${insp ? `<b style="color:${STATUS_COLORS[insp.outcome]}">${OUTCOME_LABEL[insp.outcome]}</b>` : 'Not Inspected'}</td>
        <td>${insp ? esc(failedChecksText(it, insp).join('; ')) : ''}</td><td>${insp ? esc(fmtDate(insp.nextDue)) : ''}</td></tr>`).join('')}
      </table></div>`);
  }

  // Defects with photos
  const defects = inspected.filter(r => r.insp.outcome !== 'pass');
  if (sec.defects !== false && defects.length) {
    let html = `<div class="page"><h2>${N()}. Defects, Observations And Photographs</h2>`;
    for (const { it, insp } of defects) {
      html += `<div class="defect"><b>${itemNo(it)}. ${esc(it.ref)} — ${esc(itemTitle(it))}</b> <span style="color:${STATUS_COLORS[insp.outcome]};font-weight:700">(${OUTCOME_LABEL[insp.outcome]})</span><br>
        <span class="small">${esc(locationText(it, true))} · Inspected ${esc(fmtDate(insp.date))}</span>
        <ul style="margin:3px 0 3px 16px;padding:0">${failedChecksText(it, insp).map(t => `<li>${esc(t)}</li>`).join('')}</ul>
        ${insp.notes ? `<div><b>Notes:</b> ${esc(insp.notes)}</div>` : ''}
        ${insp.action ? `<div><b>Recommended Action:</b> ${esc(insp.action)}</div>` : ''}
        ${sec.photos !== false ? await photoTags(insp.photos) : ''}</div>`;
    }
    pages.push(html + '</div>');
  }

  // Fire safety systems recorded for the site
  const sys = site.systems || {};
  if (sec.systems !== false && SYSTEM_GROUPS.some(g => Object.values(sys[g.key] || {}).some(v => v))) {
    pages.push(`<div class="page"><h2>${N()}. Fire Safety Systems</h2>
      ${SYSTEM_GROUPS.map(g => {
        const vals = sys[g.key] || {};
        const rows = g.fields.filter(f => vals[f.key]).map(f => `<tr><th style="width:62mm">${esc(f.label)}</th><td>${esc(f.type === 'date' ? fmtDate(vals[f.key]) : vals[f.key])}</td></tr>`).join('');
        return rows ? `<h3>${esc(g.title)}</h3><table>${rows}</table>` : '';
      }).join('')}
      <p class="small">Information provided by the client or seen on site at the time of the inspection.</p></div>`);
  }

  // Risk assessments
  const fra = opts.fraId ? Store.get('assessments', opts.fraId) : null;
  if (fra) pages.push(fraReportHtml(fra, N()));
  const hs = opts.hsId ? Store.get('assessments', opts.hsId) : null;
  if (hs) pages.push(hsReportHtml(hs, N()));

  // Maintenance checks: the latest of each type up to the report date
  if (sec.logs) {
    const logs = Store.list('assessments').filter(x => x.siteId === siteId && x.kind === 'log' && x.date <= to);
    const latest = MAINT_FREQ.map(f => logs.filter(x => x.frequency === f[0]).sort((p, q) => q.date.localeCompare(p.date))[0]).filter(Boolean);
    if (latest.length) {
      const nn = N();
      pages.push(`<div class="page"><h2>${nn}. Fire Safety Maintenance Checks</h2>
        <table><tr><th>Check</th><th>Last Done</th><th>By</th><th>Issues Found</th><th>Next Due</th></tr>
        ${latest.map(l => {
          const issues = maintChecksFor(l.frequency, l.cumulative !== false).flatMap(g => g.checks.filter(c => (((l.answers || {})[g.freq] || {})[c[1]] || {}).v === 'no').map(c => c[2] + (((l.answers[g.freq] || {})[c[1]] || {}).note ? ` (${l.answers[g.freq][c[1]].note})` : '')));
          return `<tr><td>${esc((MAINT_FREQ.find(f => f[0] === l.frequency) || [])[1] || '')}</td><td>${esc(fmtDate(l.date))}</td><td>${esc(l.assessor || '')}</td><td>${issues.length ? esc(issues.join('; ')) : 'None'}</td><td>${l.reviewDate && l.reviewDate < today() ? '<b style="color:#d64545">Overdue</b> ' : ''}${esc(fmtDate(l.reviewDate))}</td></tr>`;
        }).join('')}</table></div>`);
    }
  }

  // Sign off
  pages.push(`<div class="page"><h2>Declaration And Limitations</h2>
    <p>${esc(s.reportDisclaimer)}</p>
    <table>
      <tr><th style="width:45mm">Inspected By</th><td>${esc(assessor)}</td></tr>
      <tr><th>Qualifications</th><td>${esc(s.qualifications || '')}</td></tr>
      <tr><th>For And On Behalf Of</th><td>${esc(s.businessName)}</td></tr>
      <tr><th>Date</th><td>${esc(fmtDate(opts.issueDate || today()))}</td></tr>
      <tr><th>Signature</th><td style="height:18mm"></td></tr>
      <tr><th>Recommended Next Inspection</th><td>${esc(opts.nextVisit ? fmtDate(opts.nextVisit) : '')}</td></tr>
    </table></div>`);

  return `<div class="report">${pages.join('')}</div>`;
}

/* Rough floor area from the plan: the walls' outline, or the rooms drawn. Can be overridden in the FRA. */
function estimateFloorArea(f) {
  const ws = f.walls || [];
  if (ws.length) {
    const xs = ws.flatMap(w => [w[0], w[2]]), ys = ws.flatMap(w => [w[1], w[3]]);
    return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys));
  }
  return (f.rooms || []).filter(r => r.lx == null).reduce((s, r) => s + r.w * r.d, 0);
}

/* Escape route and extinguisher checks against the HM Government guides' suggested figures. */
function fraGuideResults(a, site) {
  const e = a.escape || {};
  const level = e.level || 'normal';
  const routes = e.routes === 'single' ? 'single' : 'multiple';
  const seated = a.premisesType === 'transport' && e.seated === 'yes';
  const limit = (seated ? TRAVEL_LIMITS.seated : TRAVEL_LIMITS.other)[routes][level];
  const travel = e.travel === '' || e.travel == null ? null : Number(e.travel);
  const widths = String(e.exits || '').split(/[,;\s]+/).map(Number).filter(n => n > 0);
  const exits = widths.map(w => ({ w, cap: exitCapacity(w, level), discounted: false }));
  if (exits.length > 1) exits.reduce((m, x) => (x.cap > m.cap ? x : m), exits[0]).discounted = true;
  const usable = exits.filter(x => !x.discounted).reduce((s, x) => s + x.cap, 0);
  const occupants = Number(e.occupants) || null;
  const floors = [...((site && site.floors) || [])].sort((x, y) => (x.level || 0) - (y.level || 0)).map(f => {
    const ext = Store.list('items').filter(i => i.floorId === f.id && i.type === 'extinguisher' && !i.archived && (i.details || {}).medium !== 'Fire Blanket');
    const given = Number(((e.areas || {})[f.id]));
    const area = given || estimateFloorArea(f);
    const need = extinguishersNeeded(area);
    const placed = ext.filter(i => i.x != null);
    const far = placed.length ? (f.rooms || []).filter(r => {
      const px = r.lx != null ? r.lx : r.x + r.w / 2, py = r.ly != null ? r.ly : r.y + r.d / 2;
      return Math.min(...placed.map(i => Math.hypot(i.x - px, i.y - py))) > EXTINGUISHER_MAX_TRAVEL;
    }).map(r => r.name) : [];
    return { floor: f, area, areaEstimated: !given, need, have: ext.length, ok: need ? ext.length >= need : null, far };
  });
  return {
    level, routes, seated, limit, travel, travelOk: travel == null || Number.isNaN(travel) ? null : travel <= limit,
    exits, usable, occupants, capOk: occupants && exits.length ? usable >= occupants : null, floors
  };
}

function fraGuideReportHtml(a) {
  const site = Store.get('sites', a.siteId);
  const g = fraGuideResults(a, site);
  const yn = ok => ok == null ? '—' : ok ? '<b style="color:#2e9e5b">Within guide</b>' : '<b style="color:#d64545">Outside guide</b>';
  return `<h3>Escape Routes And Extinguishers — Guide Checks</h3>
    <p class="small">Compared with the suggested figures in the ${esc(FRA_GUIDE_REF)}. These figures are flexible and depend on the overall risk.</p>
    <table>
      <tr><th style="width:55mm">Fire Risk Level</th><td>${esc((FRA_RISK_LEVELS.find(r => r[0] === g.level) || [])[1] || '')}</td></tr>
      <tr><th>Escape Routes</th><td>${g.routes === 'single' ? 'Only one route' : 'More than one route'}${g.seated ? ' · seating in rows' : ''}</td></tr>
      <tr><th>Travel Distance</th><td>${g.travel == null ? 'Not measured' : `${g.travel} m`} — suggested maximum ${g.limit} m. ${yn(g.travelOk)}</td></tr>
      ${g.exits.length ? `<tr><th>Exits (Clear Width)</th><td>${g.exits.map(x => `${x.w} mm (${x.cap} people${x.discounted ? ', discounted as widest' : ''})`).join('; ')}</td></tr>
      <tr><th>Exit Capacity</th><td>${g.usable} people${g.occupants ? ` for up to ${g.occupants} people — ${yn(g.capOk)}` : ''}</td></tr>` : ''}
    </table>
    ${g.floors.length ? `<table><tr><th>Floor</th><th>Area (m²)</th><th>Extinguishers Suggested</th><th>Found</th><th>Notes</th></tr>
      ${g.floors.map(f => `<tr><td>${esc(f.floor.name)}</td><td>${Math.round(f.area) || '—'}${f.areaEstimated ? ' (est.)' : ''}</td><td>${f.need}</td><td>${f.have}</td><td>${f.ok == null ? '' : f.ok ? 'Sufficient number' : `Add ${f.need - f.have}`}${f.far.length ? `; over ${EXTINGUISHER_MAX_TRAVEL} m from an extinguisher: ${esc(f.far.join(', '))}` : ''}</td></tr>`).join('')}
    </table>` : ''}`;
}

function logReportHtml(a, n) {
  const groups = maintChecksFor(a.frequency || 'weekly', a.cumulative !== false);
  const freqLabel = (MAINT_FREQ.find(f => f[0] === a.frequency) || MAINT_FREQ[1])[1];
  return `<div class="page"><h2>${n}. Fire Safety Maintenance Check — ${esc(freqLabel)}</h2>
    <p class="small">Checked ${esc(fmtDate(a.date))} by ${esc(a.assessor || '')}. Next check due ${esc(fmtDate(a.reviewDate))}. Based on the example maintenance checklist in the ${esc(FRA_GUIDE_REF)}.</p>
    ${groups.map(g => `<h3>${esc(g.label)} Checks</h3><table><tr><th>Area</th><th>Check</th><th style="width:14mm">Result</th><th>Comments</th></tr>
      ${g.checks.map(([sec, k, q]) => { const ans = ((a.answers || {})[g.freq] || {})[k] || {}; const v = (ans.v || '').toUpperCase();
        return `<tr><td>${esc(sec)}</td><td>${esc(q)}</td><td><b style="color:${ans.v === 'no' ? '#d64545' : 'inherit'}">${esc(v)}</b></td><td>${esc(ans.note || '')}</td></tr>`; }).join('')}</table>`).join('')}
    ${a.notes ? `<h3>Notes</h3><p>${esc(a.notes).replace(/\n/g, '<br>')}</p>` : ''}</div>`;
}

function fraReportHtml(a, n) {
  const rating = FRA_MATRIX[`${a.likelihood}|${a.consequence}`];
  const ptype = (FRA_PREMISES.find(p => p[0] === a.premisesType) || [])[1];
  let html = `<div class="page"><h2>${n}. Fire Risk Assessment</h2>
    <p class="small">Carried out under the Regulatory Reform (Fire Safety) Order 2005, following the structure of PAS 79-1${ptype && a.premisesType !== 'general' ? ` and the HM Government guide for ${esc(ptype.split(' (')[0])}` : ''}. Assessment date ${esc(fmtDate(a.date))} by ${esc(a.assessor || '')}. Status: ${esc(a.status || 'Draft')}.</p>
    <table>${ptype ? `<tr><th style="width:55mm">Type Of Premises</th><td>${esc(ptype)}</td></tr>` : ''}${FRA_INFO.map(f => `<tr><th style="width:55mm">${esc(f.label)}</th><td>${esc((a.info || {})[f.key] || '')}</td></tr>`).join('')}</table>`;
  for (const sct of fraSectionsFor(a)) {
    html += `<h3>${esc(sct.title)}</h3><table><tr><th>Question</th><th style="width:16mm">Answer</th><th>Comments</th></tr>
      ${sct.questions.map(([k, q]) => { const ans = ((a.answers || {})[sct.key] || {})[k] || {}; return `<tr><td>${esc(q)}</td><td><b>${esc((ans.v || '').toUpperCase())}</b></td><td>${esc(ans.note || '')}</td></tr>`; }).join('')}</table>`;
  }
  if (a.escape) html += fraGuideReportHtml(a);
  html += `<h3>Fire Risk Rating</h3>
    <table><tr><th>Likelihood Of Fire</th><td>${esc(a.likelihood || '')}</td><th>Potential Consequences</th><td>${esc(a.consequence || '')}</td></tr>
    <tr><th>Overall Risk</th><td colspan="3"><span class="badge risk-${esc(rating || '')}">${esc(rating || 'Not Rated')}</span> ${esc(FRA_ACTION_GUIDE[rating] || '')}</td></tr></table>
    <h3>Action Plan</h3>
    <table><tr><th>No.</th><th>Action Required</th><th>Priority</th><th>By Whom</th><th>Target Date</th><th>Done</th></tr>
    ${(a.actions || []).map((x, i) => `<tr><td>${i + 1}</td><td>${esc(x.text)}</td><td>${esc(x.priority || '')}</td><td>${esc(x.who || '')}</td><td>${esc(fmtDate(x.due))}</td><td>${x.done ? 'Yes' : ''}</td></tr>`).join('') || '<tr><td colspan="6">No actions.</td></tr>'}
    </table>
    ${a.summary ? `<h3>Summary</h3><p>${esc(a.summary).replace(/\n/g, '<br>')}</p>` : ''}
    <p><b>Review Date:</b> ${esc(fmtDate(a.reviewDate))}</p></div>`;
  return html;
}

function hsReportHtml(a, n) {
  return `<div class="page"><h2>${n}. Health And Safety Risk Assessment</h2>
    <p class="small">Prepared following the HSE five steps to risk assessment under the Management of Health and Safety at Work Regulations 1999. Assessment date ${esc(fmtDate(a.date))} by ${esc(a.assessor || '')}. Risk = Likelihood (1–5) × Severity (1–5).</p>
    <table>${HS_INFO.map(f => `<tr><th style="width:55mm">${esc(f.label)}</th><td>${esc((a.info || {})[f.key] || '')}</td></tr>`).join('')}</table>
    <table><tr><th>Hazard</th><th>Who Might Be Harmed</th><th>Existing Controls</th><th>L</th><th>S</th><th>Risk</th><th>Further Action</th><th>By Whom / When</th><th>Done</th></tr>
    ${(a.hazards || []).map(h => { const sc = (Number(h.l) || 0) * (Number(h.s) || 0); const band = hsBand(sc); return `<tr><td>${esc(h.hazard)}</td><td>${esc(h.who)}</td><td>${esc(h.controls)}</td><td>${esc(h.l || '')}</td><td>${esc(h.s || '')}</td><td><span class="badge risk-${band.replace(/\s/g, '')}">${sc || ''} ${esc(band)}</span></td><td>${esc(h.action || '')}</td><td>${esc([h.by, fmtDate(h.due)].filter(x => x && x !== '—').join(' · '))}</td><td>${h.done ? 'Yes' : ''}</td></tr>`; }).join('') || '<tr><td colspan="9">No hazards recorded.</td></tr>'}
    </table>
    ${a.summary ? `<h3>Summary</h3><p>${esc(a.summary).replace(/\n/g, '<br>')}</p>` : ''}
    <p><b>Review Date:</b> ${esc(fmtDate(a.reviewDate))}</p></div>`;
}
