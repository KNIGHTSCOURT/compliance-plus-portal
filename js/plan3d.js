'use strict';

/* Compliance Plus — 3D building view (Three.js r128).
   Built from the same floors, rooms and item positions as the 2D plans:
   plan x → 3D x, plan y → 3D z, floors stacked by level. */

class Plan3D {
  constructor(container, cfg = {}) {
    this.cfg = cfg;
    this.container = container;
    this.renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.domElement.style.touchAction = 'none';
    container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0xeef2f7);
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 2000);
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 0.85));
    const sun = new THREE.DirectionalLight(0xffffff, 0.55);
    sun.position.set(30, 60, 20);
    this.scene.add(sun);
    this.grid = new THREE.GridHelper(400, 400, 0xc9d1dc, 0xe1e6ee);
    this.grid.position.y = -0.2;
    this.scene.add(this.grid);
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.orbit = { target: new THREE.Vector3(), radius: 40, theta: Math.PI / 4, phi: Math.PI / 3.2 };
    this.pickables = [];
    this.pointers = new Map();
    this.dirty = true;

    const el = this.renderer.domElement;
    this._down = e => this.down(e);
    this._move = e => this.move(e);
    this._up = e => this.up(e);
    this._wheel = e => this.wheel(e);
    el.addEventListener('pointerdown', this._down);
    el.addEventListener('pointermove', this._move);
    el.addEventListener('pointerup', this._up);
    el.addEventListener('pointercancel', this._up);
    el.addEventListener('wheel', this._wheel, { passive: false });
    el.addEventListener('contextmenu', e => e.preventDefault());
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(container);
    this.resize();
    const loop = () => {
      this.raf = requestAnimationFrame(loop);
      if (this.dirty) { this.dirty = false; this.renderer.render(this.scene, this.camera); }
    };
    loop();
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.ro.disconnect();
    this.clear();
    this.renderer.dispose();
    this.renderer.domElement.remove();
  }

  resize() {
    const w = this.container.clientWidth || 800, h = this.container.clientHeight || 500;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.dirty = true;
  }

  clear() {
    this.group.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    this.scene.remove(this.group);
    this.group = new THREE.Group();
    this.scene.add(this.group);
    this.pickables = [];
  }

  textSprite(text, opts = {}) {
    const c = document.createElement('canvas');
    const ctx = c.getContext('2d');
    const fs = opts.fontSize || 44;
    ctx.font = `600 ${fs}px Segoe UI, Arial`;
    const tw = Math.ceil(ctx.measureText(text).width);
    if (opts.circle) {
      c.width = c.height = fs * 2;
      ctx.fillStyle = opts.bg || '#13294b';
      ctx.beginPath(); ctx.arc(fs, fs, fs - 3, 0, Math.PI * 2); ctx.fill();
      ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.stroke();
    } else {
      c.width = tw + 28; c.height = fs + 22;
      ctx.fillStyle = opts.bg || 'rgba(255,255,255,.88)';
      ctx.fillRect(0, 0, c.width, c.height);
    }
    ctx.font = `700 ${fs}px Segoe UI, Arial`;
    ctx.fillStyle = opts.color || '#1b2433';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(text, c.width / 2, c.height / 2 + 2);
    const tex = new THREE.CanvasTexture(c);
    const mat = new THREE.SpriteMaterial({ map: tex, depthTest: !opts.onTop, transparent: true });
    const s = new THREE.Sprite(mat);
    const h = opts.height || 0.6;
    s.scale.set(h * c.width / c.height, h, 1);
    if (opts.onTop) s.renderOrder = 10;
    return s;
  }

  /* site: {floors}, items: all site items, opts: {floorId, explode, bgImages: Map(photoId -> Image), highlightId} */
  build(site, items, opts = {}) {
    this.clear();
    const floors = [...(site.floors || [])].sort((a, b) => (a.level || 0) - (b.level || 0));
    const explode = opts.explode || 1;
    let elev = 0;
    const statusOf = this.cfg.statusOf || (() => 'untested');
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf3f5f9, transparent: true, opacity: 0.55, depthWrite: false, side: THREE.DoubleSide });
    const lineMat = new THREE.LineBasicMaterial({ color: 0x34495e });

    for (const floor of floors) {
      const h = floor.height || 2.6;
      const show = !opts.floorId || opts.floorId === 'all' || opts.floorId === floor.id;
      if (show) {
        const fItems = items.filter(i => i.floorId === floor.id);
        const bgImg = floor.bg && floor.bg.photoId && opts.bgImages ? opts.bgImages.get(floor.bg.photoId) : null;
        const b = planBounds(floor, fItems, bgImg);
        const pad = 0.4;
        const slab = new THREE.Mesh(
          new THREE.BoxGeometry(b.x1 - b.x0 + pad * 2, 0.15, b.y1 - b.y0 + pad * 2),
          new THREE.MeshStandardMaterial({ color: 0xd3d9e3 })
        );
        slab.position.set((b.x0 + b.x1) / 2, elev - 0.08, (b.y0 + b.y1) / 2);
        this.group.add(slab);

        if (bgImg && floor.bg.widthM) {
          const tex = new THREE.Texture(bgImg);
          tex.needsUpdate = true;
          const wm = floor.bg.widthM, hm = wm * bgImg.height / bgImg.width;
          const plane = new THREE.Mesh(new THREE.PlaneGeometry(wm, hm), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0.9 }));
          plane.rotation.x = -Math.PI / 2;
          plane.position.set((floor.bg.x || 0) + wm / 2, elev + 0.004, (floor.bg.y || 0) + hm / 2);
          this.group.add(plane);
        }

        (floor.rooms || []).forEach((r, i) => {
          if (!bgImg) {
            const fl = new THREE.Mesh(new THREE.PlaneGeometry(r.w, r.d), new THREE.MeshStandardMaterial({ color: new THREE.Color(r.color || ROOM_COLORS[i % ROOM_COLORS.length]) }));
            fl.rotation.x = -Math.PI / 2;
            fl.position.set(r.x + r.w / 2, elev + 0.006, r.y + r.d / 2);
            this.group.add(fl);
          }
          const t = 0.1;
          const walls = [
            [r.x + r.w / 2, r.y, r.w, t], [r.x + r.w / 2, r.y + r.d, r.w, t],
            [r.x, r.y + r.d / 2, t, r.d], [r.x + r.w, r.y + r.d / 2, t, r.d]
          ];
          for (const [cx, cz, w, d] of walls) {
            const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
            m.position.set(cx, elev + h / 2, cz);
            m.renderOrder = 1;
            this.group.add(m);
          }
          const pts = [];
          const corners = [[r.x, r.y], [r.x + r.w, r.y], [r.x + r.w, r.y + r.d], [r.x, r.y + r.d]];
          for (let k = 0; k < 4; k++) {
            const [ax, az] = corners[k], [bx, bz] = corners[(k + 1) % 4];
            pts.push(ax, elev + 0.02, az, bx, elev + 0.02, bz, ax, elev + h, az, bx, elev + h, bz, ax, elev, az, ax, elev + h, az);
          }
          const g = new THREE.BufferGeometry();
          g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
          this.group.add(new THREE.LineSegments(g, lineMat));
          if (r.name && opts.roomLabels !== false) {
            const s = this.textSprite(r.name, { height: Math.min(0.55, Math.max(0.3, r.w / 8)) });
            s.position.set(r.x + r.w / 2, elev + 0.35, r.y + r.d / 2);
            this.group.add(s);
          }
        });

        const fl = this.textSprite(floor.name || 'Floor', { bg: '#13294b', color: '#fff', height: 0.8 });
        fl.position.set(b.x0 - 0.2, elev + h + 0.6, b.y0 - 0.2);
        this.group.add(fl);

        for (const it of fItems) {
          if (it.x == null) continue;
          const status = statusOf(it);
          const hi = opts.highlightId === it.id;
          const pinH = it.type === 'fire-door' ? 1.1 : it.type === 'alarm' || it.type === 'emergency-light' ? Math.max(1.4, h - 0.4) : 1.4;
          const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, pinH), new THREE.MeshBasicMaterial({ color: 0x34495e }));
          stalk.position.set(it.x, elev + pinH / 2, it.y);
          this.group.add(stalk);
          const ball = new THREE.Mesh(new THREE.SphereGeometry(hi ? 0.38 : 0.24, 20, 14), new THREE.MeshStandardMaterial({ color: new THREE.Color(STATUS_COLORS[status] || STATUS_COLORS.untested), emissive: hi ? 0x441100 : 0x000000 }));
          ball.position.set(it.x, elev + pinH, it.y);
          ball.userData.item = it;
          this.group.add(ball);
          this.pickables.push(ball);
          const type = ITEM_TYPES[it.type] || ITEM_TYPES.other;
          const tag = this.textSprite(itemNo(it), { circle: true, bg: type.color, color: '#fff', height: hi ? 0.75 : 0.5, onTop: true });
          tag.position.set(it.x, elev + pinH + (hi ? 0.75 : 0.55), it.y);
          tag.userData.item = it;
          this.group.add(tag);
          this.pickables.push(tag);
        }
      }
      elev += (h + 0.3) * (opts.floorId && opts.floorId !== 'all' ? 0 : explode);
      if (opts.floorId && opts.floorId !== 'all' && !show) elev = 0;
    }
    if (opts.keepCamera !== true) this.frame();
    this.dirty = true;
  }

  frame() {
    const box = new THREE.Box3().setFromObject(this.group);
    if (box.isEmpty()) return;
    const c = box.getCenter(new THREE.Vector3());
    const r = box.getSize(new THREE.Vector3()).length() / 2;
    const vHalf = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const hHalf = Math.atan(Math.tan(vHalf) * this.camera.aspect);
    this.orbit.target.copy(c);
    this.orbit.radius = Math.max(8, (r * 0.92) / Math.sin(Math.min(vHalf, hHalf)));
    this.updateCamera();
  }

  setView(name) {
    if (name === 'top') { this.orbit.phi = 0.02; this.orbit.theta = 0; }
    else { this.orbit.phi = Math.PI / 3.2; this.orbit.theta = Math.PI / 4; }
    this.frame();
  }

  updateCamera() {
    const o = this.orbit;
    this.camera.position.set(
      o.target.x + o.radius * Math.sin(o.phi) * Math.sin(o.theta),
      o.target.y + o.radius * Math.cos(o.phi),
      o.target.z + o.radius * Math.sin(o.phi) * Math.cos(o.theta)
    );
    this.camera.lookAt(o.target);
    this.dirty = true;
  }

  local(e) { const r = this.renderer.domElement.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height }; }

  down(e) {
    this.renderer.domElement.setPointerCapture(e.pointerId);
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.drag = { kind: 'pinch', dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, moved: true };
    } else {
      this.drag = { kind: (e.button === 2 || e.shiftKey) ? 'pan' : 'rotate', last: p, start: p, moved: false };
    }
  }

  pan(dx, dy) {
    const o = this.orbit;
    const k = o.radius * 0.0015;
    const right = new THREE.Vector3(Math.cos(o.theta), 0, -Math.sin(o.theta));
    const fwd = new THREE.Vector3(Math.sin(o.theta), 0, Math.cos(o.theta));
    o.target.addScaledVector(right, -dx * k);
    o.target.addScaledVector(fwd, -dy * k);
  }

  move(e) {
    if (!this.pointers.has(e.pointerId) || !this.drag) return;
    const p = this.local(e);
    this.pointers.set(e.pointerId, p);
    const d = this.drag;
    if (d.kind === 'pinch' && this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      this.orbit.radius = Math.max(2, Math.min(600, this.orbit.radius * d.dist / dist));
      this.pan(mid.x - d.mid.x, mid.y - d.mid.y);
      d.dist = dist; d.mid = mid;
      this.updateCamera();
      return;
    }
    const dx = p.x - d.last.x, dy = p.y - d.last.y;
    d.last = p;
    if (Math.hypot(p.x - d.start.x, p.y - d.start.y) > 5) d.moved = true;
    if (d.kind === 'rotate') {
      this.orbit.theta -= dx * 0.008;
      this.orbit.phi = Math.max(0.02, Math.min(Math.PI / 2 - 0.03, this.orbit.phi - dy * 0.008));
    } else if (d.kind === 'pan') this.pan(dx, dy);
    this.updateCamera();
  }

  up(e) {
    this.pointers.delete(e.pointerId);
    const d = this.drag;
    if (this.pointers.size === 0) this.drag = null;
    if (!d || d.moved || d.kind === 'pinch') return;
    const p = this.local(e);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(new THREE.Vector2((p.x / p.w) * 2 - 1, -(p.y / p.h) * 2 + 1), this.camera);
    const hit = ray.intersectObjects(this.pickables, false)[0];
    if (hit && this.cfg.onPick) this.cfg.onPick(hit.object.userData.item);
  }

  wheel(e) {
    e.preventDefault();
    this.orbit.radius = Math.max(2, Math.min(600, this.orbit.radius * (e.deltaY > 0 ? 1.12 : 1 / 1.12)));
    this.updateCamera();
  }

  snapshot() {
    this.renderer.render(this.scene, this.camera);
    return this.renderer.domElement.toDataURL('image/png');
  }
}
