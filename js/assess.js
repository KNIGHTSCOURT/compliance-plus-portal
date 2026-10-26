'use strict';

/* Compliance Plus — Fire Risk Assessment and Health & Safety Risk Assessment.
   Changes save automatically as you type. */

function newAssessment(site, kind) {
  const floors = (site.floors || []).length;
  const a = {
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
  if (Cloud.isClient()) {
    setCrumbs([[site ? site.name : 'Site', site ? `#/site/${site.id}/assess` : ''], [isFra ? 'Fire Risk Assessment' : 'H&S Risk Assessment']]);
    $('#view').innerHTML = `<div class="spread mb"><h1>${isFra ? 'Fire Risk Assessment' : 'Health &amp; Safety Risk Assessment'}</h1><button class="btn primary" id="printA">Print / PDF</button></div>
      <div class="card"><div class="report" style="max-width:none">${isFra ? fraReportHtml(a, 1) : hsReportHtml(a, 1)}</div></div>`;
    $('#printA').onclick = () => showPrint(`<div class="report">${isFra ? fraReportHtml(a, 1) : hsReportHtml(a, 1)}</div>`, { title: `${site ? site.name : ''} - ${isFra ? 'Fire Risk Assessment' : 'H&S Risk Assessment'} ${a.date}` });
    return;
  }
  setCrumbs([['Clients & Sites', '#/clients'], [client ? client.name : 'Client', client ? `#/client/${client.id}` : ''], [site ? site.name : 'Site', site ? `#/site/${site.id}/assess` : ''], [isFra ? 'Fire Risk Assessment' : 'H&S Risk Assessment']]);
  let saveTimer = null;
  const persist = () => { clearTimeout(saveTimer); saveTimer = setTimeout(() => { Store.upsert('assessments', a); const s = $('#saveState'); if (s) s.textContent = 'Saved'; }, 400); };
  const rerender = () => { const y = window.scrollY; render(); window.scrollTo(0, y); };

  const seg = (path, value, opts) => `<div class="seg" data-seg="${path}">${opts.map(([v, l]) => `<button type="button" data-v="${v}" class="${value === v ? 'on-' + v : ''}">${l}</button>`).join('')}</div>`;
  const inp = (label, path, opts = {}) => {
    const val = getPath(a, path) ?? '';
    const id = 'k-' + path.replace(/\W/g, '_');
    let control;
    if (opts.type === 'select') control = `<select id="${id}" data-k="${path}"><option value=""></option>${opts.options.map(o => `<option ${o === val ? 'selected' : ''}>${esc(o)}</option>`).join('')}</select>`;
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

  function renderFra() {
    const rating = FRA_MATRIX[`${a.likelihood}|${a.consequence}`];
    a.answers = a.answers || {};
    return `${header()}
      <div class="card"><h2>Premises Information</h2><div class="grid2">
        ${FRA_INFO.map(f => inp(f.label, 'info.' + f.key, f.type === 'select' ? { type: 'select', options: f.options } : {})).join('')}
      </div></div>
      ${FRA_SECTIONS.map(s => `<div class="card"><h2>${esc(s.title)}</h2>
        ${s.questions.map(([k, q]) => {
          const ans = (a.answers[s.key] || {})[k] || {};
          const linked = (a.actions || []).some(x => x.source === `${s.key}.${k}`);
          return `<div class="check-row"><div class="q">${esc(q)}</div>
            ${seg(`answers.${s.key}.${k}.v`, ans.v, [['yes', 'Yes'], ['no', 'No'], ['na', 'N/A']])}
            <div class="note row" style="flex-wrap:nowrap">${inp('', `answers.${s.key}.${k}.note`, { placeholder: 'Comments / findings' })}
            ${ans.v === 'no' && !linked ? `<button class="btn small" data-addaction="${s.key}.${k}" style="margin-bottom:12px">+ Action</button>` : ''}</div></div>`;
        }).join('')}</div>`).join('')}
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
    $('#view').innerHTML = isFra ? renderFra() : renderHs();
    const v = $('#view');
    $$('[data-k]', v).forEach(el => {
      const evt = el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
      el.addEventListener(evt, () => {
        setPath(a, el.dataset.k, el.value);
        const s = $('#saveState'); if (s) s.textContent = 'Saving…';
        persist();
        if (/^(likelihood|consequence)$|\.(l|s)$/.test(el.dataset.k)) rerender();
      });
    });
    $$('[data-seg]', v).forEach(sg => $$('button', sg).forEach(b => b.onclick = () => {
      const cur = getPath(a, sg.dataset.seg);
      setPath(a, sg.dataset.seg, cur === b.dataset.v ? '' : b.dataset.v);
      persist(); rerender();
    }));
    $$('[data-check]', v).forEach(el => el.onchange = () => { setPath(a, el.dataset.check, el.checked); persist(); });
    $$('[data-del]', v).forEach(b => b.onclick = () => {
      const [coll, idx] = b.dataset.del.split('.');
      a[coll].splice(Number(idx), 1); persist(); rerender();
    });
    $$('[data-addaction]', v).forEach(b => b.onclick = () => {
      const [sk, qk] = b.dataset.addaction.split('.');
      const sec = FRA_SECTIONS.find(s => s.key === sk);
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
      if (await confirmBox('Delete Assessment', 'Delete this risk assessment? This cannot be undone.')) { Store.remove('assessments', id); go(`#/site/${a.siteId}/assess`); }
    };
    $('#printA').onclick = () => {
      Store.upsert('assessments', a);
      const s = Store.settings;
      const cover = `<div class="page"><div class="cover-band"><div style="font-weight:700">${esc(s.businessName)}</div>
        <h1>${isFra ? 'Fire Risk Assessment' : 'Health &amp; Safety Risk Assessment'}</h1><div>${esc(site ? site.name : '')}</div>
        <div style="opacity:.85">${esc(site ? [site.address, site.postcode].filter(Boolean).join(', ') : '')}</div></div>
        <table class="mt"><tr><th style="width:45mm">Client</th><td>${esc(client ? client.name : '')}</td></tr><tr><th>Assessor</th><td>${esc(a.assessor || '')}${s.qualifications ? ' — ' + esc(s.qualifications) : ''}</td></tr>
        <tr><th>Date</th><td>${esc(fmtDate(a.date))}</td></tr><tr><th>Review Date</th><td>${esc(fmtDate(a.reviewDate))}</td></tr><tr><th>Status</th><td>${esc(a.status || 'Draft')}</td></tr></table></div>`;
      const body = isFra ? fraReportHtml(a, 1) : hsReportHtml(a, 1);
      showPrint(`<div class="report">${cover}${body}</div>`, { title: `${site ? site.name : ''} - ${isFra ? 'Fire Risk Assessment' : 'H&S Risk Assessment'} ${a.date}` });
    };
  }

  render();
}
