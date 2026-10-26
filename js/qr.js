'use strict';

/* Compliance Plus — QR codes, label sheets and scanning.
   Each item's QR code holds a web link: <portal address>#/i/<item ref>.
   Scanning it with any phone camera opens that item in the portal. */

const LABEL_LAYOUTS = {
  L7160: { name: '21 Per Sheet — 63.5 × 38.1 mm (Avery L7160)', cols: 3, rows: 7, w: 63.5, h: 38.1, top: 15.15, left: 7.25, hp: 66.04, vp: 38.1 },
  L7163: { name: '14 Per Sheet — 99.1 × 38.1 mm (Avery L7163)', cols: 2, rows: 7, w: 99.1, h: 38.1, top: 15.15, left: 4.65, hp: 101.6, vp: 38.1 },
  L7651: { name: '65 Per Sheet — 38.1 × 21.2 mm (Avery L7651, Small)', cols: 5, rows: 13, w: 38.1, h: 21.2, top: 10.7, left: 4.65, hp: 40.64, vp: 21.2 }
};

function portalBaseUrl() {
  const s = Store.settings.portalUrl;
  if (s) return s.replace(/#.*$/, '').replace(/\/?$/, '/');
  return location.origin + location.pathname.replace(/[^/]*$/, '');
}

function itemQrUrl(item) {
  return `${portalBaseUrl()}#/i/${encodeURIComponent(item.ref)}`;
}

function qrDataUrl(text, px = 300) {
  return new Promise(resolve => {
    if (!window.QRCode || !QRCode.toDataURL) return resolve('');
    QRCode.toDataURL(text, { width: px, margin: 1, errorCorrectionLevel: 'M' }, (err, url) => resolve(err ? '' : url));
  });
}

/* Pulls an item ref out of anything a scanner returns (full link or bare ref). */
function refFromScan(text) {
  if (!text) return null;
  const m = String(text).match(/#\/i\/([^?#\s]+)/);
  if (m) return decodeURIComponent(m[1]);
  const t = String(text).trim();
  return /^[A-Za-z0-9]+-\d+$/.test(t) ? t.toUpperCase() : null;
}

async function buildLabelSheets(items, layoutKey, startPos, opts = {}) {
  const L = LABEL_LAYOUTS[layoutKey] || LABEL_LAYOUTS.L7160;
  const perPage = L.cols * L.rows;
  const small = L.h < 25;
  const s = Store.settings;
  const qrMm = L.h - 3;
  const pages = [];
  let slot = Math.max(0, (startPos || 1) - 1);
  let page = [];
  for (const item of items) {
    if (slot >= perPage) { pages.push(page); page = []; slot = 0; }
    const col = slot % L.cols, row = Math.floor(slot / L.cols);
    const url = await qrDataUrl(itemQrUrl(item), 360);
    const type = ITEM_TYPES[item.type] || ITEM_TYPES.other;
    const loc = opts.locationOf ? opts.locationOf(item) : '';
    const st = opts.stateOf ? opts.stateOf(item) : null;
    let text;
    if (small) {
      text = `<div class="lr" style="font-size:8pt">${esc(item.ref)}</div><div style="font-size:6pt">${esc(type.label)}</div>`;
    } else {
      const result = opts.withResult && st && st.last
        ? `<div style="font-size:7pt;margin-top:1mm"><b style="color:${STATUS_COLORS[st.outcome]}">${esc(OUTCOME_LABEL[st.outcome] || '')}</b> ${esc(fmtDate(st.last.date))}${st.due ? ` · Next ${esc(fmtDate(st.due))}` : ''}</div>`
        : '';
      text = `<div class="lb" style="font-size:7pt">${esc(s.businessName)}</div>
        <div class="lr" style="font-size:11pt">${esc(item.ref)}</div>
        <div style="font-size:7.5pt;font-weight:700;color:${type.color}">${esc(type.label)}${item.name ? ' — ' + esc(item.name) : ''}</div>
        <div style="font-size:6.5pt;color:#444;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(loc)}</div>
        ${result}
        <div style="font-size:6pt;color:#666;margin-top:.5mm">Scan For Inspection Record${s.phone ? ' · ' + esc(s.phone) : ''}</div>`;
    }
    page.push(`<div class="label" style="left:${L.left + col * L.hp}mm;top:${L.top + row * L.vp}mm;width:${L.w}mm;height:${L.h}mm">
      <img src="${url}" style="width:${qrMm}mm;height:${qrMm}mm" alt=""><div class="lt">${text}</div></div>`);
    slot++;
  }
  if (page.length) pages.push(page);
  return pages.map(p => `<div class="labels-page">${p.join('')}</div>`).join('');
}

/* Camera scanner. Uses the browser's built-in barcode reader where available
   (Chrome / Edge on Android, Windows, Mac). Returns a stop function. */
async function startScanner(video, onResult, onError) {
  if (!('BarcodeDetector' in window)) { onError('unsupported'); return () => {}; }
  let stream, stopped = false;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  } catch (e) { onError('camera'); return () => {}; }
  video.srcObject = stream;
  await video.play().catch(() => {});
  const detector = new BarcodeDetector({ formats: ['qr_code'] });
  const tick = async () => {
    if (stopped) return;
    try {
      const codes = await detector.detect(video);
      if (codes.length) { onResult(codes[0].rawValue); return; }
    } catch (e) { /* frame not ready */ }
    setTimeout(tick, 250);
  };
  tick();
  return () => { stopped = true; stream.getTracks().forEach(t => t.stop()); };
}
