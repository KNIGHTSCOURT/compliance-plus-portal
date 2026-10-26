'use strict';

/* Compliance Plus — 2D floor plan.
   Units are metres. Rooms are rectangles {x, y, w, d}; items have x, y.
   An optional background drawing (client's floor plan) can be traced over. */

const STATUS_COLORS = { pass: '#2e9e5b', fail: '#d64545', advisory: '#e0a020', untested: '#8a94a6' };
const ROOM_COLORS = ['#dbe8f7', '#e3f1e3', '#f7ecd9', '#efe1f3', '#e0f0f0', '#f6e0e0', '#ececec', '#e8eddc'];

function itemNo(item) {
  const n = parseInt(String(item.ref || '').split('-').pop(), 10);
  return Number.isNaN(n) ? '?' : String(n);
}

function planBounds(floor, items, bgImg) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const add = (ax, ay, bx, by) => { x0 = Math.min(x0, ax); y0 = Math.min(y0, ay); x1 = Math.max(x1, bx); y1 = Math.max(y1, by); };
  for (const r of floor.rooms || []) add(r.x, r.y, r.x + r.w, r.y + r.d);
  for (const it of items || []) if (it.x != null) add(it.x - 0.5, it.y - 0.5, it.x + 0.5, it.y + 0.5);
  const bg = floor.bg;
  if (bg && bgImg && bg.widthM) add(bg.x || 0, bg.y || 0, (bg.x || 0) + bg.widthM, (bg.y || 0) + bg.widthM * bgImg.height / bgImg.width);
  if (!isFinite(x0)) return { x0: 0, y0: 0, x1: 20, y1: 14 };
  return { x0, y0, x1, y1 };
}

function fitView(b, W, H, pad = 40) {
  const w = Math.max(b.x1 - b.x0, 2), h = Math.max(b.y1 - b.y0, 2);
  const scale = Math.min((W - pad * 2) / w, (H - pad * 2) / h);
  return { scale, ox: (W - w * scale) / 2 - b.x0 * scale, oy: (H - h * scale) / 2 - b.y0 * scale };
}

function drawPlan(ctx, W, H, view, floor, items, opts = {}) {
  const S = (x, y) => [view.ox + x * view.scale, view.oy + y * view.scale];
  const k = opts.labelScale || 1;
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, W, H);

  // Background drawing
  const bg = floor.bg;
  if (bg && opts.bgImg && bg.widthM) {
    const [bx, by] = S(bg.x || 0, bg.y || 0);
    const bw = bg.widthM * view.scale, bh = bw * opts.bgImg.height / opts.bgImg.width;
    ctx.globalAlpha = bg.opacity == null ? 0.6 : bg.opacity;
    ctx.drawImage(opts.bgImg, bx, by, bw, bh);
    ctx.globalAlpha = 1;
  }

  // Grid (1 m and 5 m)
  if (opts.grid !== false && view.scale >= 6) {
    const wx0 = Math.floor(-view.ox / view.scale), wx1 = Math.ceil((W - view.ox) / view.scale);
    const wy0 = Math.floor(-view.oy / view.scale), wy1 = Math.ceil((H - view.oy) / view.scale);
    for (let x = wx0; x <= wx1; x++) {
      ctx.strokeStyle = x % 5 === 0 ? 'rgba(120,135,160,.28)' : 'rgba(120,135,160,.12)';
      ctx.beginPath(); const [sx] = S(x, 0); ctx.moveTo(sx + .5, 0); ctx.lineTo(sx + .5, H); ctx.stroke();
    }
    for (let y = wy0; y <= wy1; y++) {
      ctx.strokeStyle = y % 5 === 0 ? 'rgba(120,135,160,.28)' : 'rgba(120,135,160,.12)';
      ctx.beginPath(); const [, sy] = S(0, y); ctx.moveTo(0, sy + .5); ctx.lineTo(W, sy + .5); ctx.stroke();
    }
  }

  // Rooms
  (floor.rooms || []).forEach((r, i) => {
    const [x, y] = S(r.x, r.y);
    const w = r.w * view.scale, h = r.d * view.scale;
    ctx.globalAlpha = opts.bgImg ? 0.45 : 0.9;
    ctx.fillStyle = r.color || ROOM_COLORS[i % ROOM_COLORS.length];
    ctx.fillRect(x, y, w, h);
    ctx.globalAlpha = 1;
    const sel = opts.selectedRoomId === r.id;
    ctx.strokeStyle = sel ? '#e4572e' : '#34495e';
    ctx.lineWidth = sel ? 3 : 2;
    ctx.strokeRect(x, y, w, h);
    if (w > 40 * k && h > 22 * k) {
      ctx.fillStyle = '#1b2433';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const fs = Math.max(10, Math.min(14, view.scale * 0.35 / k)) * k;
      ctx.font = `600 ${fs}px Segoe UI, Arial`;
      ctx.fillText(r.name || 'Room', x + w / 2, y + h / 2 - (h > 40 * k ? 7 * k : 0), w - 6);
      if (h > 40 * k) {
        ctx.font = `${fs - 2}px Segoe UI, Arial`;
        ctx.fillStyle = '#637087';
        ctx.fillText(`${(r.w * r.d).toFixed(1)} m²`, x + w / 2, y + h / 2 + 9 * k, w - 6);
      }
    }
  });

  // Room being drawn
  if (opts.preview) {
    const p = opts.preview;
    const [x, y] = S(Math.min(p.x0, p.x1), Math.min(p.y0, p.y1));
    const w = Math.abs(p.x1 - p.x0) * view.scale, h = Math.abs(p.y1 - p.y0) * view.scale;
    ctx.setLineDash([6, 4]); ctx.strokeStyle = '#e4572e'; ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(228,87,46,.08)'; ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h); ctx.setLineDash([]);
    ctx.fillStyle = '#e4572e'; ctx.font = '600 12px Segoe UI, Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${Math.abs(p.x1 - p.x0).toFixed(2)} × ${Math.abs(p.y1 - p.y0).toFixed(2)} m`, x + 4, y - 4);
  }

  // Items
  const r0 = opts.markerSize || 10;
  for (const it of items || []) {
    if (it.x == null) continue;
    const [x, y] = S(it.x, it.y);
    const status = opts.statusOf ? opts.statusOf(it) : 'untested';
    if (opts.highlightId === it.id) {
      ctx.strokeStyle = '#e4572e'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.arc(x, y, r0 + 9, 0, Math.PI * 2); ctx.stroke();
    }
    const type = ITEM_TYPES[it.type] || ITEM_TYPES.other;
    ctx.fillStyle = type.color;
    ctx.beginPath(); ctx.arc(x, y, r0 + 3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = STATUS_COLORS[status] || STATUS_COLORS.untested;
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(x, y, r0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (opts.selectedItemId === it.id) {
      ctx.strokeStyle = '#13294b'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x, y, r0 + 6, 0, Math.PI * 2); ctx.stroke();
    }
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const label = itemNo(it);
    ctx.font = `700 ${label.length > 2 ? r0 - 2 : r0}px Segoe UI, Arial`;
    ctx.fillText(label, x, y + 0.5);
    if (opts.showCodes) {
      ctx.font = `700 ${9 * k}px Segoe UI, Arial`; ctx.fillStyle = type.color;
      ctx.fillText(type.code, x, y + r0 + 10 * k);
    }
  }

  // Scale bar
  if (opts.scaleBar !== false) {
    const target = 120 * k / view.scale;
    const nice = [0.5, 1, 2, 5, 10, 20, 50].find(n => n >= target) || 100;
    const len = nice * view.scale;
    const x = W - len - 20 * k, y = H - 18 * k;
    ctx.fillStyle = 'rgba(255,255,255,.85)'; ctx.fillRect(x - 8 * k, y - 18 * k, len + 16 * k, 26 * k);
    ctx.strokeStyle = '#1b2433'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x, y); ctx.lineTo(x + len, y); ctx.lineTo(x + len, y - 5); ctx.stroke();
    ctx.fillStyle = '#1b2433'; ctx.font = `600 ${11 * k}px Segoe UI, Arial`; ctx.textAlign = 'center'; ctx.textBaseline = 'bottom';
    ctx.fillText(`${nice} m`, x + len / 2, y - 3);
  }
  ctx.restore();
}

/* Renders a floor plan to a PNG data URL (for reports and item pages). */
function renderPlanImage(floor, items, opts = {}) {
  const W = opts.width || 1600, H = opts.height || 1000;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const ctx = c.getContext('2d');
  const view = fitView(planBounds(floor, items, opts.bgImg), W, H, 50);
  const k = W / 900;
  drawPlan(ctx, W, H, view, floor, items, Object.assign({ markerSize: 13 * k, labelScale: k, showCodes: true }, opts));
  return c.toDataURL('image/png');
}

const loadImage = src => new Promise((resolve) => {
  if (!src) return resolve(null);
  const img = new Image();
  img.onload = () => resolve(img);
  img.onerror = () => resolve(null);
  img.src = src;
});

class PlanEditor {
  constructor(canvas, cfg) {
    this.c = canvas;
    this.ctx = canvas.getContext('2d');
    this.cfg = cfg;
    this.mode = 'select';
    this.view = { scale: 40, ox: 40, oy: 40 };
    this.pointers = new Map();
    this.drag = null;
    this.floor = null;
    this.items = [];
    this.bgImg = null;
    this.selectedRoomId = null;
    this.selectedItemId = null;

    canvas.addEventListener('pointerdown', e => this.down(e));
    canvas.addEventListener('pointermove', e => this.move(e));
    canvas.addEventListener('pointerup', e => this.up(e));
    canvas.addEventListener('pointercancel', e => this.up(e, true));
    canvas.addEventListener('wheel', e => this.wheel(e), { passive: false });
    canvas.addEventListener('contextmenu', e => e.preventDefault());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(canvas);
  }

  destroy() { this.ro.disconnect(); }

  resize() {
    const r = this.c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.W = r.width; this.H = r.height;
    this.c.width = Math.round(r.width * dpr); this.c.height = Math.round(r.height * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!this.fitted && this.floor) { this.fit(); this.fitted = true; }
    this.draw();
  }

  setFloor(floor, items, bgImg) {
    this.floor = floor; this.items = items; this.bgImg = bgImg;
    this.fitted = false;
    if (this.W) { this.fit(); this.fitted = true; }
    this.draw();
  }

  setItems(items) { this.items = items; this.draw(); }
  setBg(img) { this.bgImg = img; this.draw(); }
  setMode(m) { this.mode = m; this.measureA = null; this.hover = null; this.draw(); this.c.style.cursor = m === 'select' ? 'grab' : 'crosshair'; }

  fit() {
    if (!this.W) return;
    this.view = fitView(planBounds(this.floor, this.items, this.bgImg), this.W, this.H, 40);
    this.draw();
  }

  zoom(f, cx = this.W / 2, cy = this.H / 2) {
    const s = Math.max(2, Math.min(400, this.view.scale * f));
    const k = s / this.view.scale;
    this.view.ox = cx - (cx - this.view.ox) * k;
    this.view.oy = cy - (cy - this.view.oy) * k;
    this.view.scale = s;
    this.draw();
  }

  toWorld(px, py) { return { x: (px - this.view.ox) / this.view.scale, y: (py - this.view.oy) / this.view.scale }; }
  local(e) { const r = this.c.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  snap(v, step = 0.25) { return Math.round(v / step) * step; }

  roomAt(w) {
    const rooms = this.floor.rooms || [];
    for (let i = rooms.length - 1; i >= 0; i--) {
      const r = rooms[i];
      if (w.x >= r.x && w.x <= r.x + r.w && w.y >= r.y && w.y <= r.y + r.d) return r;
    }
    return null;
  }

  itemAt(p) {
    let best = null, bd = 16;
    for (const it of this.items) {
      if (it.x == null) continue;
      const d = Math.hypot(this.view.ox + it.x * this.view.scale - p.x, this.view.oy + it.y * this.view.scale - p.y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  down(e) {
    if (!this.floor) return;
    this.c.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.drag = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      return;
    }
    const w = this.toWorld(p.x, p.y);
    const panButton = e.button === 1 || e.button === 2;
    if (this.mode === 'measure' && !panButton) {
      if (!this.measureA) this.measureA = w;
      else {
        const a = this.measureA;
        this.measureA = null; this.hover = null;
        if (this.cfg.onMeasure) this.cfg.onMeasure(a, w);
      }
      this.drag = null;
      this.draw();
      return;
    }
    if (this.mode === 'room' && !panButton) {
      this.drag = { kind: 'newroom', x0: this.snap(w.x), y0: this.snap(w.y), x1: this.snap(w.x), y1: this.snap(w.y) };
    } else if (this.mode === 'item' && !panButton && !this.cfg.locked) {
      this.drag = { kind: 'place', p };
    } else {
      const it = panButton ? null : this.itemAt(p);
      const room = (panButton || it) ? null : this.roomAt(w);
      if (it) this.drag = { kind: 'item', it, p, moved: false };
      else if (room) this.drag = { kind: 'room', room, p, rx: room.x, ry: room.y, w, moved: false };
      else this.drag = { kind: 'pan', p, ox: this.view.ox, oy: this.view.oy, moved: false };
    }
  }

  move(e) {
    if (this.mode === 'measure' && this.measureA) {
      const q = this.local(e);
      this.hover = this.toWorld(q.x, q.y);
      this.draw();
    }
    if (!this.pointers.has(e.pointerId) || !this.drag) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    const d = this.drag;
    if (d.kind === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.view.ox += mid.x - d.mid.x; this.view.oy += mid.y - d.mid.y;
      this.zoom(dist / d.dist, mid.x, mid.y);
      d.dist = dist; d.mid = mid;
      return;
    }
    const w = this.toWorld(p.x, p.y);
    const movedFar = d.p && Math.hypot(p.x - d.p.x, p.y - d.p.y) > 5;
    if (d.kind === 'newroom') { d.x1 = this.snap(w.x); d.y1 = this.snap(w.y); }
    else if (d.kind === 'item' && (d.moved || movedFar)) {
      if (this.cfg.locked) return;
      d.moved = true; d.it.x = Math.round(w.x * 10) / 10; d.it.y = Math.round(w.y * 10) / 10;
    } else if (d.kind === 'room' && (d.moved || movedFar)) {
      if (this.cfg.locked) return;
      d.moved = true; d.room.x = this.snap(d.rx + w.x - d.w.x); d.room.y = this.snap(d.ry + w.y - d.w.y);
    } else if (d.kind === 'pan') {
      d.moved = d.moved || movedFar;
      this.view.ox = d.ox + p.x - d.p.x; this.view.oy = d.oy + p.y - d.p.y;
    }
    this.draw();
  }

  up(e, cancelled) {
    this.pointers.delete(e.pointerId);
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'pinch') { if (this.pointers.size === 0) this.drag = null; return; }
    this.drag = null;
    if (cancelled) { this.draw(); return; }
    if (d.kind === 'newroom') {
      const x = Math.min(d.x0, d.x1), y = Math.min(d.y0, d.y1), w = Math.abs(d.x1 - d.x0), dd = Math.abs(d.y1 - d.y0);
      if (w >= 0.5 && dd >= 0.5) this.cfg.onRoomCreated && this.cfg.onRoomCreated({ x, y, w, d: dd });
    } else if (d.kind === 'place') {
      const w = this.toWorld(d.p.x, d.p.y);
      const pos = { x: Math.round(w.x * 10) / 10, y: Math.round(w.y * 10) / 10 };
      this.cfg.onPlace && this.cfg.onPlace(pos, this.roomAt(pos));
    } else if (d.kind === 'item') {
      if (d.moved) { const r = this.roomAt(d.it); d.it.roomId = r ? r.id : null; this.cfg.onItemMoved && this.cfg.onItemMoved(d.it); }
      else { this.selectedItemId = d.it.id; this.selectedRoomId = null; this.cfg.onPickItem && this.cfg.onPickItem(d.it); }
    } else if (d.kind === 'room') {
      if (d.moved) this.cfg.onChange && this.cfg.onChange();
      else { this.selectedRoomId = d.room.id; this.selectedItemId = null; this.cfg.onPickRoom && this.cfg.onPickRoom(d.room); }
    } else if (d.kind === 'pan' && !d.moved) {
      this.selectedRoomId = null; this.selectedItemId = null;
      this.cfg.onPickNothing && this.cfg.onPickNothing();
    }
    this.draw();
  }

  wheel(e) {
    e.preventDefault();
    const p = this.local(e);
    this.zoom(e.deltaY < 0 ? 1.15 : 1 / 1.15, p.x, p.y);
  }

  draw() {
    if (!this.floor || !this.W) return;
    drawPlan(this.ctx, this.W, this.H, this.view, this.floor, this.items, {
      bgImg: this.bgImg,
      statusOf: this.cfg.statusOf,
      selectedRoomId: this.selectedRoomId,
      selectedItemId: this.selectedItemId,
      highlightId: this.cfg.highlightId,
      preview: this.drag && this.drag.kind === 'newroom' ? this.drag : null,
      markerSize: 11
    });
    if (this.mode === 'measure' && this.measureA) {
      const ctx = this.ctx, v = this.view;
      const a = this.measureA, b = this.hover || a;
      const ax = v.ox + a.x * v.scale, ay = v.oy + a.y * v.scale, bx = v.ox + b.x * v.scale, by = v.oy + b.y * v.scale;
      ctx.strokeStyle = '#e4572e'; ctx.lineWidth = 2; ctx.setLineDash([6, 4]);
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke(); ctx.setLineDash([]);
      ctx.fillStyle = '#e4572e';
      for (const [x, y] of [[ax, ay], [bx, by]]) { ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.fill(); }
      ctx.font = '600 12px Segoe UI, Arial'; ctx.textAlign = 'left'; ctx.textBaseline = 'bottom';
      ctx.fillText(`${Math.hypot(b.x - a.x, b.y - a.y).toFixed(2)} m on plan`, bx + 8, by - 6);
    }
  }
}
