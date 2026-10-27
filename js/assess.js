'use strict';

/* Compliance Plus — Fire Risk Assessment and Health & Safety Risk Assessment.
   Changes save automatically as you type. */

function guessPremisesType(site) {
  const use = `${site.buildingUse || ''} ${site.name || ''}`;
  if (/coach|bus|transport|garage|depot|vehicle|haulage|fleet|rail|airport|port|terminal|workshop/i.test(use)) return 'transport';
  if (/office|shop|retail|store|showroom/i.test(use)) return 'offices';
  return 'general';
}

const ASSESS_TITLES = { fra: 'Fire Risk Assessment', hs: 'Health & Safety Risk Assessment', log: 'Fire Safety Maintenance Check' };

function maintNextDue(date, freq) {
  const f = MAINT_FREQ.find(x => x[0] === freq) || MAINT_FREQ[1];
  return f[3] === 'days' ? addDays(date, f[2]) : addMonths(date, f[2]);
}

/* The maintenance checks shown for a frequency: that frequency's own checks, plus (optionally)
   everything more frequent, since e.g. a monthly visit normally covers the weekly checks too. */
function maintChecksFor(freq, cumulative) {
  const idx = MAINT_FREQ.findIndex(x => x[0] === freq);
  const freqs = cumulative ? MAINT_FREQ.slice(0, idx + 1).map(x => x[0]) : [freq];
  return freqs.map(f => ({ freq: f, label: MAINT_FREQ.find(x => x[0] === f)[1], checks: MAINT_CHECKS[f] }));
}

function newAssessment(site, kind) {
  const floors = (site.floors || []).length;
  if (kind === 'log') {
    return Store.upsert('assessments', {
      siteId: site.id, kind, date: today(), assessor: Store.settings.assessorName || '', frequency: 'weekly', cumulative: true,
      title: site.name, reviewDate: maintNextDue(today(), 'weekly'), answers: {}, notes: ''
    });
  }
  const a = {
    premisesType: kind === 'fra' ? guessPremisesType(site) : undefined,
    siteId: site.id, kind, date: today(), assessor: Store.settings.assessorName || '', status: 'Draft',
    title: site.name, reviewDate: addMonths(today(), 12), summary: '',
    info: kind === 'fra'
      ? { use: site.buildingUse || '', floors: floors ? String(floors) : '', responsible: site.responsiblePerson || '' }
      : { activity: `General premises — ${site.name}`, responsible: site.responsiblePerson || '' },
    answers: {}, actions: [], hazards: []
  };
  return Store.upsert('assessments', a);
}

function viewAssessment(id) {
  const a = Store.get('assessments', id);
  if (!a) return notFound();
  const site = Store.get('sites', a.siteId);
  const client = site ? Store.get('clients', site.clientId) : null;
  const isFra = a.kind === 'fra';
  const isLog = a.kind === 'log';
  const title = ASSESS_TITLES[a.kind] || 'Assessment';
  const bodyHtml = () => isFra ? fraReportHtml(a, 1) : isLog ? logReportHtml(a, 1) : hsReportHtml(a, 1);
  if (Cloud.isClient()) {
    setCrumbs([[site ? site.name : 'Site', site ? `#/site/${site.id}/assess` : ''], [title]]);
    $('#view').innerHTML = `<div class="spread mb"><h1>${esc(title)}</h1><button class="btn primary" id="printA">Print / PDF</button></div>
      <div class="card"><div class="report" style="max-width:none">${bodyHtml()}</div></div>`;
    $('#printA').onclick = () => showPrint(`<div class="report">${bodyHtml()}</div>`, { title: `${site ? site.name : ''} - ${title} ${a.date}` });
    return;
  }
  setCrumbs([['Clients & Sites', '#/clients'], [client ? client.name : 'Client', client ? `#/client/${client.id}` : ''], [site ? site.name : 'Site', site ? `#/site/${site.id}/assess` : ''], [title]]);
  let saveTimer = null;
  const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { Store.upsert('assessments', a); const s = $('#saveState'); if (s) s.textContent = 'Saved'; }, 400); };
  const rerender = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };

  const seg = (path, value, opts) => `<div class="seg" data-seg="${path}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${value === v ? 'on-' + v : ''}">${l}</button>`).join('')}</div>`;
  const inp = (label, path, opts = {}) => {
    const val = getPath(a, path) ?? '';
    const id = 'k-' + path.replace(/\W/g, '_');
    let control;
    if (opts.type === 'select') control = `<select id="${id}" data-k="${path}">${opts.blank === false ? '' : '<option value=""></option>'}${opts.options.map(o => {
      const [v, l] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}" ${String(v) === String(val) ? 'selected' : ''}>${esc(l)}</option>`;
    }).join('')}</select>`;
    else if (opts.type === 'textarea') control = `<textarea id="${id}" data-k="${path}" placeholder="${esc(opts.placeholder || '')}">${esc(val)}</textarea>`;
    else control = `<input id="${id}" data-k="${path}" type="${opts.type || 'text'}" value="${esc(val)}" placeholder="${esc(opts.placeholder || '')}">`;
    return `<div class="field">${label ? `<label for="${id}">${esc(label)}</label>` : ''}${control}</div>`;
  };

  function header() {
    return `<div class="spread"><div><h1>${isFra ? 'Fire Risk Assessment' : 'Health &amp; Safety Risk Assessment'}</h1>
        <div class="muted">${esc(site ? site.name : '')} · <span id="saveState">Saved</span></div></div>
        <div class="row"><button class="btn" id="printA">Print / PDF</button><button class="btn danger" id="delA">Delete</button><a class="btn primary" href="#/site/${a.siteId}/assess">Done</a></div></div>
      <div class="card mt"><div class="grid4">
        ${inp('Assessment Date', 'date', { type: 'date' })}${inp('Assessor', 'assessor')}
        ${inp('Status', 'status', { type: 'select', options: ['Draft', 'Final'] })}${inp('Review Date', 'reviewDate', { type: 'date' })}
      </div></div>`;
  }

  /* Escape routes and extinguishers checked against the guides' suggested figures. */
  function renderGuideChecks() {
    a.escape = a.escape || {};
    const g = fraGuideResults(a, site);
    const okBadge = (ok, yes, no) => ok == null ? '<span class="muted">—</span>' : ok ? `<span class="badge b-pass">${yes}</span>` : `<span class="badge b-fail">${no}</span>`;
    return `<div class="card"><h2>Escape Routes And Extinguishers — Guide Checks</h2>
      <p class="small muted">Suggested figures from the HM Government fire risk assessment guides. They are flexible: record your reasoning if you accept a difference.</p>
      <div class="grid4">
        ${inp('Fire Risk Level', 'escape.level', { type: 'select', blank: false, options: FRA_RISK_LEVELS.map(r => [r[0], r[1]]) })}
        ${inp('Escape Routes From The Worst Area', 'escape.routes', { type: 'select', blank: false, options: [['multiple', 'More Than One'], ['single', 'Only One']] })}
        ${a.premisesType === 'transport' ? inp('Seating In Rows?', 'escape.seated', { type: 'select', blank: false, options: [['no', 'No'], ['yes', 'Yes (Waiting Areas)']] }) : '<div></div>'}
        ${inp('Longest Travel Distance Measured (m)', 'escape.travel', { type: 'number' })}
      </div>
      <p class="small">${esc((FRA_RISK_LEVELS.find(r => r[0] === g.level) || [])[2] || '')}</p>
      <div class="kv"><div>Suggested Maximum</div><div><b>${g.limit} m</b> (${g.routes === 'single' ? 'one route only' : 'more than one route'}${g.seated ? ', seating in rows' : ''})</div>
        <div>Travel Distance</div><div>${g.travel == null ? '<span class="muted">Enter the longest distance you measured</span>' : `${g.travel} m ${okBadge(g.travelOk, 'Within Guide', 'Too Long')}`}</div></div>
      <div class="grid2 mt">
        ${inp('Maximum Number Of People', 'escape.occupants', { type: 'number' })}
        ${inp('Clear Width Of Each Exit (mm, comma separated)', 'escape.exits', { placeholder: 'e.g. 850, 1000, 1700' })}
      </div>
      ${g.exits.length ? `<table class="list small"><thead><tr><th>Exit</th><th>Clear Width</th><th>Can Take</th><th>Note</th></tr></thead><tbody>
        ${g.exits.map((x, i) => `<tr><td>${i + 1}</td><td>${x.w} mm</td><td>${x.cap} people</td><td>${x.w < 750 ? 'Below 750 mm minimum' : x.w < 900 ? 'Under 900 mm — too narrow for wheelchairs' : ''}${x.discounted ? ' Widest exit discounted (may be blocked by the fire)' : ''}</td></tr>`).join('')}
        </tbody></table>
        <div class="kv"><div>Exit Capacity</div><div><b>${g.usable} people</b>${g.exits.length > 1 ? ' with the widest exit discounted' : ''} ${g.occupants ? okBadge(g.capOk, 'Enough For ' + g.occupants, 'Not Enough For ' + g.occupants) : ''}</div></div>` : ''}
      <h3 class="mt">Fire Extinguishers (At Least One Per 200 m², Minimum Two Per Floor)</h3>
      ${g.floors.length ? `<table class="list small"><thead><tr><th>Floor</th><th>Floor Area (m²)</th><th>Suggested</th><th>On Plan</th><th></th></tr></thead><tbody>
        ${g.floors.map(f => `<tr><td>${esc(f.floor.name)}</td><td><input type="number" data-area="${f.floor.id}" value="${Math.round(f.area) || ''}" style="width:110px">${f.areaEstimated ? ' <span class="muted">estimated</span>' : ''}</td>
          <td>${f.need}</td><td>${f.have}</td><td>${okBadge(f.ok, 'OK', 'Add ' + (f.need - f.have))}${f.far.length ? `<div class="small">More than ${EXTINGUISHER_MAX_TRAVEL} m from an extinguisher: ${esc(f.far.join(', '))}</div>` : ''}</td></tr>`).join('')}
        </tbody></table>
        <p class="small muted">Counts the extinguishers placed on this site's plans (fire blankets excluded). Distances are straight-line, so walking distances will be longer. Other fire classes (e.g. flammable liquids, cooking oil) need extinguishers of the right type near the hazard.</p>`
        : '<p class="muted">Add floors and extinguishers on the site plan to check provision.</p>'}
    </div>`;
  }

  function renderLog() {
    a.answers = a.answers || {};
    const groups = maintChecksFor(a.frequency || 'weekly', a.cumulative !== false);
    const issues = groups.reduce((n, g) => n + g.checks.filter(c => ((a.answers[g.freq] || {})[c[1]] || {}).v === 'no').length, 0);
    return `<div class="spread"><div><h1>Fire Safety Maintenance Check</h1>
        <div class="muted">${esc(site ? site.name : '')} · <span id="saveState">Saved</span></div></div>
        <div class="row"><button class="btn" id="printA">Print / PDF</button><button class="btn danger" id="delA">Delete</button><a class="btn primary" href="#/site/${a.siteId}/assess">Done</a></div></div>
      <div class="card mt"><div class="grid4">
        ${inp('Date Of Check', 'date', { type: 'date' })}${inp('Checked By', 'assessor')}
        ${inp('Check Type', 'frequency', { type: 'select', blank: false, options: MAINT_FREQ.map(f => [f[0], f[1]]) })}
        ${inp('Next Check Due', 'reviewDate', { type: 'date' })}
      </div>
      <label class="row" style="color:inherit;margin:0"><input type="checkbox" data-check="cumulative" ${a.cumulative !== false ? 'checked' : ''} style="width:auto"> Include the more frequent checks as well</label>
      <p class="small muted mt">Based on the example fire safety maintenance checklist in the HM Government fire risk assessment guides. Any "No" needs following up. ${issues ? `<span class="badge b-fail">${issues} Issue${issues === 1 ? '' : 's'}</span>` : ''}</p></div>
      ${groups.map(g => {
        let lastSec = '';
        return `<div class="card"><h2>${esc(g.label)} Checks</h2>${g.checks.map(([sec, k, q]) => {
          const ans = (a.answers[g.freq] || {})[k] || {};
          const head = sec !== lastSec ? `<h3 class="mt">${esc(sec)}</h3>` : '';
          lastSec = sec;
          return `${head}<div class="check-row"><div class="q">${esc(q)}</div>
            ${seg(`answers.${g.freq}.${k}.v`, ans.v, [['yes', 'Yes'], ['no', 'No'], ['na', 'N/A']])}
            ${ans.v === 'no' || ans.note ? `<div class="note">${inp('', `answers.${g.freq}.${k}.note`, { placeholder: 'What was wrong and what was done' })}</div>` : ''}</div>`;
        }).join('')}</div>`;
      }).join('')}
      <div class="card"><h2>Notes</h2>${inp('', 'notes', { type: 'textarea', placeholder: 'Anything else found, and actions taken' })}</div>`;
  }

  function renderFra() {
    const rating = FRA_MATRIX[`${a.likelihood}|${a.consequence}`];
    a.answers = a.answers || {};
    return `${header()}
      <div class="card"><h2>Premises Information</h2>
        <div class="grid2">${inp('Type Of Premises', 'premisesType', { type: 'select', blank: false, options: FRA_PREMISES })}
          <div class="field"><label>&nbsp;</label><div class="small muted" style="padding-top:8px">Adds the questions and travel distances for this kind of premises from the HM Government fire risk assessment guides.</div></div></div>
        <div class="grid2">${FRA_INFO.map(f => inp(f.label, 'info.' + f.key, f.type === 'select' ? { type: 'select', options: f.options } : {})).join('')}</div>
      </div>
      ${fraSectionsFor(a).map(s => `<div class="card"><h2>${esc(s.title)}</h2>
        ${s.questions.map(([k, q]) => {
          const ans = (a.answers[s.key] || {})[k] || {};
          const linked = (a.actions || []).some(x => x.source === `${s.key}.${k}`);
          return `<div class="check-row"><div class="q">${esc(q)}</div>
            ${seg(`answers.${s.key}.${k}.v`, ans.v, [['yes', 'Yes'], ['no', 'No'], ['na', 'N/A']])}
            <div class="note row" style="flex-wrap:nowrap">${inp('', `answers.${s.key}.${k}.note`, { placeholder: 'Comments / findings' })}
            ${ans.v === 'no' && !linked ? `<button class="btn small" data-addaction="${s.key}.${k}" style="margin-bottom:12px">+ Action</button>` : ''}</div></div>`;
        }).join('')}</div>`).join('')}
      ${renderGuideChecks()}
      <div class="card"><h2>Fire Risk Rating</h2>
        <div class="grid3">
          ${inp('Likelihood Of Fire', 'likelihood', { type: 'select', options: FRA_LIKELIHOOD })}
          ${inp('Potential Consequences To Life', 'consequence', { type: 'select', options: FRA_CONSEQUENCE })}
          <div class="field"><label>Overall Risk</label><div style="padding-top:6px">${rating ? `<span class="badge risk-${rating}" style="font-size:.95rem">${rating}</span>` : '<span class="muted">Choose both</span>'}</div></div>
        </div>
        ${rating ? `<p class="small">${esc(FRA_ACTION_GUIDE[rating])}</p>` : ''}
      </div>
      <div class="card"><div class="spread"><h2 style="margin:0">Action Plan</h2><button class="btn small" id="addAction">+ Add Action</button></div>
        ${(a.actions || []).map((x, i) => `<div class="check-row" style="grid-template-columns:1fr">
          <div class="grid4" style="align-items:end">
            <div style="grid-column:span 2">${inp(`Action ${i + 1}`, `actions.${i}.text`, { type: 'textarea' })}</div>
            ${inp('Priority', `actions.${i}.priority`, { type: 'select', options: ['High', 'Medium', 'Low'] })}
            ${inp('By Whom', `actions.${i}.who`)}
            ${inp('Target Date', `actions.${i}.due`, { type: 'date' })}
            <div class="field row"><label class="row" style="color:inherit;margin:0"><input type="checkbox" data-check="actions.${i}.done" ${x.done ? 'checked' : ''} style="width:auto"> Completed</label>
              <button class="btn small danger" data-del="actions.${i}">Remove</button></div>
          </div></div>`).join('') || '<p class="muted">No actions yet. Answering "No" to a question offers to add one.</p>'}
      </div>
      <div class="card"><h2>Summary</h2>${inp('', 'summary', { type: 'textarea', placeholder: 'Overall findings and significant findings for the responsible person' })}</div>`;
  }

  function renderHs() {
    a.hazards = a.hazards || [];
    return `${header()}
      <div class="card"><h2>Scope</h2><div class="grid3">${HS_INFO.map(f => inp(f.label, 'info.' + f.key)).join('')}</div></div>
      <div class="card"><div class="spread"><h2 style="margin:0">Hazards</h2>
        <div class="row"><select id="preset" style="width:auto"><option value="">Add A Common Hazard…</option>${HS_PRESETS.map((p, i) => `<option value="${i}">${esc(p.hazard)}</option>`).join('')}</select>
        <button class="btn small" id="addHazard">+ Blank Hazard</button></div></div>
        <p class="small muted">Risk = Likelihood × Severity (each 1–5). 1–4 Low · 5–9 Medium · 10–16 High · 20–25 Very High.</p>
        ${a.hazards.map((h, i) => {
          const sc = (+h.l || 0) * (+h.s || 0), band = hsBand(sc);
          return `<div class="card" style="box-shadow:none;background:#fafbfd">
            <div class="spread"><b>Hazard ${i + 1}</b>${sc ? `<span class="badge risk-${band.replace(/\s/g, '')}">${sc} — ${band}</span>` : ''}</div>
            <div class="grid2 mt">${inp('Hazard', `hazards.${i}.hazard`)}${inp('Who Might Be Harmed And How', `hazards.${i}.who`)}</div>
            ${inp('Existing Controls', `hazards.${i}.controls`, { type: 'textarea' })}
            <div class="grid4">${inp('Likelihood (1–5)', `hazards.${i}.l`, { type: 'select', options: ['1', '2', '3', '4', '5'] })}${inp('Severity (1–5)', `hazards.${i}.s`, { type: 'select', options: ['1', '2', '3', '4', '5'] })}
              ${inp('By Whom', `hazards.${i}.by`)}${inp('By When', `hazards.${i}.due`, { type: 'date' })}</div>
            ${inp('Further Action Needed', `hazards.${i}.action`, { type: 'textarea' })}
            <div class="row"><label class="row" style="color:inherit;margin:0"><input type="checkbox" data-check="hazards.${i}.done" ${h.done ? 'checked' : ''} style="width:auto"> Action Completed</label>
              <button class="btn small danger" data-del="hazards.${i}">Remove Hazard</button></div></div>`;
        }).join('') || '<p class="muted">No hazards added yet.</p>'}
      </div>
      <div class="card"><h2>Summary</h2>${inp('', 'summary', { type: 'textarea' })}</div>`;
  }

  function render() {
    $('#view').innerHTML = isFra ? renderFra() : isLog ? renderLog() : renderHs();
    const v = $('#view');
    $$('[data-k]', v).forEach(el => {
      const k = el.dataset.k;
      const redraw = /^(likelihood|consequence|premisesType|frequency)$|\.(l|s)$|^escape\./.test(k);
      const evt = el.tagName === 'SELECT' || el.type === 'date' || (redraw && el.type === 'number') || k === 'escape.exits' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        setPath(a, k, el.value);
        if (isLog && (k === 'date' || k === 'frequency')) a.reviewDate = maintNextDue(a.date || today(), a.frequency || 'weekly');
        const s = $('#saveState'); if (s) s.textContent = 'Saving…';
        persist();
        if (redraw || (isLog && k === 'date')) rerender();
      });
    });
    $$('[data-seg]', v).forEach(sg => $$('button', sg).forEach(b => b.onclick = () => {
      const cur = getPath(a, sg.dataset.seg);
      setPath(a, sg.dataset.seg, cur === b.dataset.v ? '' : b.dataset.v);
      persist(); rerender();
    }));
    $$('[data-check]', v).forEach(el => el.onchange = () => { setPath(a, el.dataset.check, el.checked); persist(); if (el.dataset.check === 'cumulative') rerender(); });
    $$('[data-area]', v).forEach(el => el.onchange = () => { a.escape = a.escape || {}; a.escape.areas = a.escape.areas || {}; a.escape.areas[el.dataset.area] = el.value; persist(); rerender(); });
    $$('[data-del]', v).forEach(b => b.onclick = () => {
      const [coll, idx] = b.dataset.del.split('.');
      a[coll].splice(Number(idx), 1); persist(); rerender();
    });
    $$('[data-addaction]', v).forEach(b => b.onclick = () => {
      const [sk, qk] = b.dataset.addaction.split('.');
      const sec = fraSectionsFor(a).find(s => s.key === sk);
      const q = sec.questions.find(x => x[0] === qk)[1];
      const note = ((a.answers[sk] || {})[qk] || {}).note;
      a.actions = a.actions || [];
      a.actions.push({ id: Store.uid(), source: `${sk}.${qk}`, text: note ? `${note} — ${q}` : `Rectify: ${q}`, priority: 'Medium', who: site ? site.responsiblePerson || '' : '', due: addMonths(today(), 3), done: false });
      persist(); rerender(); toast('Action added to the action plan');
    });
    const addAction = $('#addAction');
    if (addAction) addAction.onclick = () => { a.actions = a.actions || []; a.actions.push({ id: Store.uid(), text: '', priority: 'Medium', who: '', due: addMonths(today(), 3), done: false }); persist(); rerender(); };
    const addHazard = $('#addHazard');
    if (addHazard) addHazard.onclick = () => { a.hazards.push({ id: Store.uid(), hazard: '', who: '', controls: '', l: '', s: '', action: '', by: '', due: '', done: false }); persist(); rerender(); };
    const preset = $('#preset');
    if (preset) preset.onchange = () => {
      const p = HS_PRESETS[Number(preset.value)];
      if (!p) return;
      a.hazards.push({ id: Store.uid(), hazard: p.hazard, who: p.who, controls: p.controls, l: '', s: '', action: '', by: '', due: '', done: false });
      persist(); rerender();
    };
    $('#delA').onclick = async () => {
      if (await confirmBox('Delete', 'Delete this ' + title.toLowerCase() + '? This cannot be undone.')) { Store.remove('assessments', id); go(`#/site/${a.siteId}/assess`); }
    };
    $('#printA').onclick = () => {
      Store.upsert('assessments', a);
      const s = Store.settings;
      const cover = `<div class="page"><div class="cover-band"><div style="font-weight:700">${esc(s.businessName)}</div>
        <h1>${esc(title)}</h1><div>${esc(site ? site.name : '')}</div>
        <div style="opacity:.85">${esc(site ? [site.address, site.postcode].filter(Boolean).join(', ') : '')}</div></div>
        ${client && client.logo ? `<div style="display:flex;align-items:center;gap:5mm;margin-top:5mm"><span class="small" style="color:#555">Prepared for</span><img src="${client.logo}" style="max-height:20mm;max-width:65mm"></div>` : ''}<table class="mt"><tr><th style="width:45mm">Client</th><td>${esc(client ? client.name : '')}</td></tr><tr><th>Assessor</th><td>${esc(a.assessor || '')}${s.qualifications ? ' — ' + esc(s.qualifications) : ''}</td></tr>
        <tr><th>Date</th><td>${esc(fmtDate(a.date))}</td></tr><tr><th>${isLog ? 'Next Check Due' : 'Review Date'}</th><td>${esc(fmtDate(a.reviewDate))}</td></tr>${isLog ? '' : `<tr><th>Status</th><td>${esc(a.status || 'Draft')}</td></tr>`}</table></div>`;
      showPrint(`<div class="report">${cover}${bodyHtml()}</div>`, { title: `${site ? site.name : ''} - ${title} ${a.date}` });
    };
  }

  render();
}
