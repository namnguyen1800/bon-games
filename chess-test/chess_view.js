/* chess_view.js — phần HÌNH 3D (three r147) của mẫu cờ vua Bon.
   Chỉ vẽ + diễn: nhận trạng thái từ chess_core, diễn sự kiện (đi, đánh nhau, xúc xắc, chết…).
   Ba kiểu hình: 'classic' (gỗ cổ điển) · 'warriors' (chiến binh hoạt hình) · 'crystal' (pha lê phát sáng).
   Toạ độ: 1 ô = 1 đơn vị; cột a..h = x −3.5..3.5; hàng 1..8 = z 3.5..−3.5 (Trắng ở z dương). */
(function () {
  'use strict';
  const T = window.THREE;
  T.ColorManagement.legacyMode = false;

  const PX = 1200;                      // cỡ khung vẽ CỐ ĐỊNH (co giãn bằng CSS — né tật đen màn khi đổi cỡ)
  const TOP = 0.02;                     // mặt ô cờ
  const sqX = s => (s & 7) - 3.5, sqZ = s => 3.5 - (s >> 3);
  const sqV = (s, y) => new T.Vector3(sqX(s), y === undefined ? TOP : y, sqZ(s));
  const V2 = (x, y) => new T.Vector2(x, y);
  const rnd = (a, b) => a + Math.random() * (b - a);
  const EASE = {
    io: t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
    out: t => 1 - Math.pow(1 - t, 3),
    in: t => t * t * t,
    lin: t => t,
    back: t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); }
  };
  const VAL = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 10 };

  /* ---------- tween (có tua nhanh + BỎ QUA: chạm màn hình lúc đang diễn → mọi bước còn lại xong ngay) ---------- */
  const tweens = [];
  let speed = 1, skipping = false;
  function tween(dur, fn, ez) {
    if (skipping) { fn(1, 1); return Promise.resolve(); }
    return new Promise(res => tweens.push({ t: 0, dur: Math.max(1e-4, dur), fn, ez: ez || EASE.io, res }));
  }
  function finishAllTweens() {
    const list = tweens.splice(0, tweens.length);
    for (const w of list) { w.fn(w.ez(1), 1); w.res(); }
  }
  const wait = d => tween(d, () => {});
  function stepTweens(dt) {
    const list = tweens.splice(0, tweens.length);
    const keep = [];
    for (const w of list) {
      w.t += dt;
      const k = Math.min(1, w.t / w.dur);
      w.fn(w.ez(k), k);
      if (k >= 1) w.res(); else keep.push(w);
    }
    tweens.push(...keep);
  }

  /* ---------- hình vẽ bằng canvas (sao, khói, quầng sáng, mặt xúc xắc) ---------- */
  function canvasTex(size, draw) {
    const c = document.createElement('canvas'); c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new T.CanvasTexture(c); t.encoding = T.sRGBEncoding; return t;
  }
  const TEX = {};
  function initTex() {
    TEX.glow = canvasTex(128, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(255,255,255,1)'); r.addColorStop(0.25, 'rgba(255,255,255,0.55)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, s, s);
    });
    TEX.star = canvasTex(128, (g, s) => {
      g.translate(s / 2, s / 2); g.beginPath();
      for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? s * 0.2 : s * 0.46; g.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
      g.closePath(); g.fillStyle = '#ffd84a'; g.fill(); g.lineWidth = s * 0.05; g.strokeStyle = '#b8860b'; g.stroke();
    });
    TEX.smoke = canvasTex(128, (g, s) => {
      for (let i = 0; i < 9; i++) {
        const x = s / 2 + rnd(-s * 0.2, s * 0.2), y = s / 2 + rnd(-s * 0.2, s * 0.2), rr = rnd(s * 0.18, s * 0.32);
        const r = g.createRadialGradient(x, y, 0, x, y, rr);
        r.addColorStop(0, 'rgba(245,245,245,0.75)'); r.addColorStop(1, 'rgba(245,245,245,0)');
        g.fillStyle = r; g.fillRect(0, 0, s, s);
      }
    });
    TEX.heart = canvasTex(128, (g, s) => {
      g.translate(s / 2, s * 0.56); g.scale(s / 128, s / 128); g.beginPath();
      g.moveTo(0, 35); g.bezierCurveTo(-60, -5, -38, -55, 0, -22); g.bezierCurveTo(38, -55, 60, -5, 0, 35);
      g.fillStyle = '#ff3b5c'; g.fill(); g.lineWidth = 5; g.strokeStyle = '#8a0f25'; g.stroke();
    });
    TEX.dice = {};
    for (const [side, pip] of [['w', '#1f5fbf'], ['b', '#c0262e']]) {
      TEX.dice[side] = [];
      for (let v = 1; v <= 6; v++) {
        TEX.dice[side][v] = canvasTex(128, (g, s) => {
          g.fillStyle = '#fbf8f1'; g.fillRect(0, 0, s, s);
          g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 6; g.strokeRect(3, 3, s - 6, s - 6);
          const P = { 1: [[.5, .5]], 2: [[.27, .27], [.73, .73]], 3: [[.27, .27], [.5, .5], [.73, .73]], 4: [[.27, .27], [.73, .27], [.27, .73], [.73, .73]],
            5: [[.27, .27], [.73, .27], [.5, .5], [.27, .73], [.73, .73]], 6: [[.27, .25], [.73, .25], [.27, .5], [.73, .5], [.27, .75], [.73, .75]] }[v];
          g.fillStyle = pip;
          for (const [x, y] of P) { g.beginPath(); g.arc(x * s, y * s, s * 0.1, 0, Math.PI * 2); g.fill(); }
        });
      }
    }
  }
  /* ---------- hình quân PHẲNG kiểu chess.com (Nam 11-21) — bộ cburnett trong assets/icons.js ---------- */
  const ICON = {};
  function iconTex(key) {                 // 'wk', 'bq'… → ảnh 256px vẽ từ SVG
    if (ICON[key]) return ICON[key];
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding; t.anisotropy = 4;
    const img = new Image();
    img.onload = () => { const g = cv.getContext('2d'); g.clearRect(0, 0, 256, 256); g.drawImage(img, 6, 6, 244, 244); t.needsUpdate = true; ICON._ok = (ICON._ok || 0) + 1; };
    img.src = (window.CHESS_ICONS || {})[key] || '';
    ICON[key] = t; return t;
  }
  function drawCustomShape(g, s, c, emoji) {   // quân Bon tự chế: thân ĐỎ, đế màu đội (trắng / đen), emoji Bon chọn
    const k = s / 256;
    g.save(); g.scale(k, k);
    g.lineJoin = 'round'; g.lineWidth = 9; g.strokeStyle = '#111';
    g.beginPath(); g.ellipse(128, 212, 88, 26, 0, 0, Math.PI * 2);
    g.fillStyle = c === 'w' ? '#fafafa' : '#262626'; g.fill(); g.stroke();
    const grd = g.createLinearGradient(60, 40, 196, 210); grd.addColorStop(0, '#ff5a63'); grd.addColorStop(1, '#b8101e');
    g.beginPath(); g.moveTo(70, 200); g.bezierCurveTo(70, 150, 92, 132, 96, 112); g.arc(128, 92, 56, Math.PI * 0.82, Math.PI * 0.18, false);
    g.bezierCurveTo(164, 132, 186, 150, 186, 200); g.closePath();
    g.fillStyle = grd; g.fill(); g.stroke();
    g.font = '86px "Apple Color Emoji","Segoe UI Emoji","Noto Color Emoji",sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(emoji || '⭐', 128, 104);
    g.restore();
  }
  const CUSTOM_TEX = {};
  function customTex(def, c) {
    const key = c + '|' + (def && def.emoji);
    if (!CUSTOM_TEX[key]) CUSTOM_TEX[key] = canvasTex(256, (g, s) => drawCustomShape(g, s, c, def && def.emoji));
    return CUSTOM_TEX[key];
  }
  let BRICK = null;
  function brickTex() {                   // ô tường: gạch đá xám
    if (BRICK) return BRICK;
    BRICK = canvasTex(256, (g, s) => {
      g.fillStyle = '#5b544c'; g.fillRect(0, 0, s, s);
      const rows = 5, h = s / rows;
      for (let r = 0; r < rows; r++) {
        const off = (r % 2) * h * 0.9, w = h * 1.8;
        for (let x = -off; x < s; x += w) {
          const v = 120 + ((r * 37 + Math.round(x) * 13) % 40);
          g.fillStyle = `rgb(${v},${v - 6},${v - 14})`;
          g.fillRect(x + 4, r * h + 4, w - 8, h - 8);
          g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x + 4, r * h + 4, w - 8, 5);
          g.fillStyle = 'rgba(0,0,0,0.22)'; g.fillRect(x + 4, r * h + h - 9, w - 8, 5);
        }
      }
      g.strokeStyle = '#2b2622'; g.lineWidth = 10; g.strokeRect(5, 5, s - 10, s - 10);
    });
    return BRICK;
  }
  function badgeIconTex(c, t, def) {      // huy hiệu tròn to (kiểu nhìn "từ trên xuống + huy hiệu")
    const key = 'bdg' + c + t + (def ? def.emoji : '');
    if (ICON[key]) return ICON[key];
    const cv = document.createElement('canvas'); cv.width = cv.height = 256;
    const g = cv.getContext('2d'), tex = new T.CanvasTexture(cv); tex.encoding = T.sRGBEncoding;
    const ring = () => { g.clearRect(0, 0, 256, 256); g.beginPath(); g.arc(128, 128, 118, 0, Math.PI * 2); g.fillStyle = t === 'x' ? '#7a0f18' : (c === 'w' ? '#1d3c6e' : '#f1e5cf'); g.fill(); g.lineWidth = 12; g.strokeStyle = '#ffcf6a'; g.stroke(); };
    ring();
    if (t === 'x') { drawCustomShape(g, 256, c, def && def.emoji); tex.needsUpdate = true; }
    else {
      const img = new Image();
      img.onload = () => { ring(); g.drawImage(img, 30, 26, 196, 196); tex.needsUpdate = true; };
      img.src = (window.CHESS_ICONS || {})[c + t] || '';
    }
    ICON[key] = tex; return tex;
  }

  function woodTex(key, rep) {
    const t = new T.TextureLoader().load(window.CHESS_TEX[key]);
    t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
    if (rep) t.repeat.set(rep[0], rep[1]);
    return t;
  }

  /* ---------- quân cờ tiện tròn (kiểu cổ điển + pha lê dùng chung hình) ---------- */
  function arc(cx, cy, rx, ry, a0, a1, n) {
    const o = [];
    for (let i = 0; i <= n; i++) { const a = a0 + (a1 - a0) * i / n; o.push(V2(cx + rx * Math.cos(a), cy + ry * Math.sin(a))); }
    return o;
  }
  const baseProf = R => [V2(0, 0), V2(R, 0), V2(R, 0.045), V2(R * 0.97, 0.07), V2(R * 0.9, 0.082), V2(R * 0.86, 0.105), V2(R * 0.9, 0.125), V2(R * 0.85, 0.15), V2(R * 0.72, 0.172)];
  const lathe = (pts, seg) => { const g = new T.LatheGeometry(pts.map(p => V2(Math.max(0.0005, p.x), p.y)), seg || 48); g.computeVertexNormals(); return g; };
  const PROF = {
    p: () => baseProf(0.33).concat([V2(0.2, 0.2), V2(0.155, 0.28), V2(0.13, 0.38), V2(0.12, 0.45), V2(0.19, 0.48), V2(0.2, 0.495), V2(0.15, 0.51), V2(0.1, 0.53)],
      arc(0, 0.64, 0.135, 0.135, -0.95, Math.PI / 2, 14)),
    r: () => baseProf(0.35).concat([V2(0.25, 0.2), V2(0.215, 0.3), V2(0.2, 0.55), V2(0.235, 0.6), V2(0.27, 0.635), V2(0.27, 0.78), V2(0.19, 0.78), V2(0.19, 0.72), V2(0.0005, 0.72)]),
    n: () => baseProf(0.34).concat([V2(0.24, 0.2), V2(0.22, 0.26), V2(0.0005, 0.27)]),
    b: () => baseProf(0.33).concat([V2(0.2, 0.2), V2(0.15, 0.3), V2(0.115, 0.56), V2(0.19, 0.6), V2(0.2, 0.617), V2(0.12, 0.64)],
      arc(0, 0.79, 0.125, 0.17, -1.2, Math.PI / 2, 16), [V2(0.0005, 0.96)]),
    q: () => baseProf(0.36).concat([V2(0.22, 0.2), V2(0.16, 0.32), V2(0.125, 0.62), V2(0.215, 0.675), V2(0.225, 0.695), V2(0.155, 0.72), V2(0.145, 0.78), V2(0.2, 0.92), V2(0.205, 0.95), V2(0.15, 0.965), V2(0.0005, 0.975)]),
    k: () => baseProf(0.37).concat([V2(0.23, 0.2), V2(0.17, 0.32), V2(0.14, 0.66), V2(0.23, 0.72), V2(0.24, 0.74), V2(0.17, 0.765), V2(0.155, 0.82), V2(0.21, 0.98), V2(0.215, 1.0), V2(0.15, 1.03), V2(0.11, 1.075), V2(0.0005, 1.085)])
  };
  const HEIGHT = { p: 0.78, r: 0.82, n: 0.98, b: 1.0, q: 1.12, k: 1.33, x: 0.85 };
  function horseHead() {
    const s = new T.Shape();
    s.moveTo(-0.19, 0.25); s.lineTo(0.15, 0.25);
    s.quadraticCurveTo(0.17, 0.36, 0.11, 0.46);
    s.quadraticCurveTo(0.2, 0.52, 0.26, 0.6);
    s.quadraticCurveTo(0.31, 0.68, 0.24, 0.72);
    s.quadraticCurveTo(0.14, 0.76, 0.07, 0.8);
    s.lineTo(0.065, 0.93); s.lineTo(0.0, 0.86); s.lineTo(-0.065, 0.95); s.lineTo(-0.1, 0.84);
    s.quadraticCurveTo(-0.2, 0.74, -0.23, 0.56);
    s.quadraticCurveTo(-0.24, 0.4, -0.19, 0.25);
    const g = new T.ExtrudeGeometry(s, { depth: 0.16, bevelEnabled: true, bevelThickness: 0.035, bevelSize: 0.03, bevelSegments: 4, curveSegments: 10 });
    g.translate(0, 0, -0.08);
    g.rotateY(-Math.PI / 2);                // hình nhìn nghiêng → mũi ngựa hướng +z (phía trước của quân)
    g.computeVertexNormals();
    return g;
  }
  const GEO = {};
  function turnedGeo(t) {
    if (GEO[t]) return GEO[t];
    const parts = [{ g: lathe(PROF[t]()), m: 'main' }];
    if (t === 'r') {
      for (let i = 0; i < 6; i++) {
        const b = new T.BoxGeometry(0.085, 0.085, 0.075), a = i * Math.PI / 3;
        b.rotateY(-a); b.translate(Math.sin(a) * 0.23, 0.82, Math.cos(a) * 0.23);
        parts.push({ g: b, m: 'main' });
      }
    } else if (t === 'n') {
      parts.push({ g: horseHead(), m: 'main' });
      const eye = new T.SphereGeometry(0.022, 12, 8);
      for (const sx of [-1, 1]) { const e = eye.clone(); e.translate(sx * 0.095, 0.7, 0.13); parts.push({ g: e, m: 'accent' }); }
    } else if (t === 'b') {
      const slit = new T.BoxGeometry(0.02, 0.1, 0.3); slit.rotateY(Math.PI / 4); slit.translate(0, 0.86, 0);
      parts.push({ g: slit, m: 'accent' });
      const ball = new T.SphereGeometry(0.045, 16, 12); ball.translate(0, 0.985, 0); parts.push({ g: ball, m: 'main' });
    } else if (t === 'q') {
      for (let i = 0; i < 9; i++) {
        const a = i * Math.PI * 2 / 9, sp = new T.SphereGeometry(0.036, 12, 10);
        sp.translate(Math.sin(a) * 0.185, 0.975, Math.cos(a) * 0.185); parts.push({ g: sp, m: 'main' });
      }
      const top = new T.SphereGeometry(0.062, 16, 12); top.translate(0, 1.04, 0); parts.push({ g: top, m: 'main' });
    } else if (t === 'k') {
      const v = new T.BoxGeometry(0.06, 0.24, 0.06); v.translate(0, 1.2, 0);
      const h = new T.BoxGeometry(0.18, 0.06, 0.06); h.translate(0, 1.22, 0);
      parts.push({ g: v, m: 'main' }, { g: h, m: 'main' });
    }
    const by = {};
    for (const p of parts) (by[p.m] = by[p.m] || []).push(p.g.index ? p.g.toNonIndexed() : p.g);
    GEO[t] = Object.keys(by).map(m => ({ g: by[m].length > 1 ? T.BufferGeometryUtils.mergeBufferGeometries(by[m]) : by[m][0], m }));
    return GEO[t];
  }
  const CORE = {};
  const coreGeo = t => CORE[t] || (CORE[t] = lathe(PROF[t]().map(p => V2(p.x * 0.38, p.y * 0.8 + 0.05)), 24));

  /* ---------- chiến binh hoạt hình (kiểu B) — ghép từ khối, tay cầm vũ khí cử động được ---------- */
  const WPAL = {
    w: { cloth: 0x3d7fe0, cloth2: 0xf5efe2, skin: 0xffdcc0, metal: 0xdfe5ee, trim: 0xf3c34b, base: 0xf5efe2, stone: 0xd9d4c8, horse: 0xf7f2ea, mane: 0xc9b38a },
    b: { cloth: 0xd2363f, cloth2: 0x2f2c36, skin: 0xffd3ae, metal: 0x77727f, trim: 0xe3b23c, base: 0x2f2c36, stone: 0x5f5a66, horse: 0x5a3d2e, mane: 0x2a1c14 }
  };
  const matCache = {};
  function wm(hex, rough, metal, emiss) {
    const k = hex + '|' + rough + '|' + metal + '|' + (emiss || 0);
    if (!matCache[k]) matCache[k] = new T.MeshStandardMaterial({ color: hex, roughness: rough === undefined ? 0.55 : rough, metalness: metal || 0, emissive: emiss || 0, emissiveIntensity: emiss ? 1.2 : 0 });
    return matCache[k];
  }
  function mesh(g, m, x, y, z) { const o = new T.Mesh(g, m); o.position.set(x || 0, y || 0, z || 0); o.castShadow = true; o.receiveShadow = true; return o; }
  function eyes(grp, y, z, spread, r) {
    for (const sx of [-1, 1]) {
      grp.add(mesh(new T.SphereGeometry(r || 0.028, 14, 10), wm(0x15151a, 0.3), sx * (spread || 0.058), y, z));
      grp.add(mesh(new T.SphereGeometry((r || 0.028) * 0.35, 8, 6), wm(0xffffff, 0.2), sx * (spread || 0.058) + 0.008, y + 0.01, z + 0.022));
    }
  }
  function arm(P, side, withSkin) {
    const pivot = new T.Group();
    const a = mesh(new T.CapsuleGeometry(0.045, 0.13, 6, 12), wm(P.cloth, 0.6));
    a.position.y = -0.09; pivot.add(a);
    if (withSkin !== false) pivot.add(mesh(new T.SphereGeometry(0.05, 14, 10), wm(P.skin, 0.6), 0, -0.19, 0));
    return pivot;
  }
  /* quân tự chế ở kiểu chiến binh: dáng lính, áo ĐỎ, đế + viền theo màu đội */
  const XPAL = {
    w: Object.assign({}, WPAL.w, { cloth: 0xd8202f, cloth2: 0xf5efe2 }),
    b: Object.assign({}, WPAL.b, { cloth: 0xd8202f, cloth2: 0x2f2c36 })
  };
  function buildWarrior(t, c, palOverride) {
    const P = palOverride || WPAL[c], g = new T.Group(), rig = {};
    g.add(mesh(new T.CylinderGeometry(0.33, 0.35, 0.07, 36), wm(P.base, 0.4), 0, 0.035, 0));
    const ring = mesh(new T.TorusGeometry(0.335, 0.018, 8, 40), wm(P.trim, 0.3, 0.8), 0, 0.07, 0); ring.rotation.x = Math.PI / 2; g.add(ring);
    const body = (h, rTop, rBot, col) => g.add(mesh(lathe([V2(0.0005, 0.07), V2(rBot, 0.07), V2(rBot * 0.95, 0.07 + h * 0.4), V2(rTop, 0.07 + h), V2(0.0005, 0.07 + h + 0.02)], 32), wm(col, 0.62)));
    const head = (y, r) => { const h = mesh(new T.SphereGeometry(r || 0.16, 24, 18), wm(P.skin, 0.6), 0, y, 0); g.add(h); eyes(g, y + 0.01, (r || 0.16) * 0.88); return h; };
    if (t === 'n') {                                  // ngựa con
      const hb = mesh(new T.SphereGeometry(0.2, 24, 18), wm(P.horse, 0.6), 0, 0.36, -0.03); hb.scale.set(1, 0.92, 1.35); g.add(hb);
      for (const [x, z] of [[-0.11, 0.13], [0.11, 0.13], [-0.11, -0.19], [0.11, -0.19]]) g.add(mesh(new T.CylinderGeometry(0.045, 0.05, 0.22, 12), wm(P.horse, 0.6), x, 0.17, z));
      const neck = mesh(new T.CylinderGeometry(0.08, 0.11, 0.26, 14), wm(P.horse, 0.6), 0, 0.53, 0.14); neck.rotation.x = 0.55; g.add(neck);
      const hd = mesh(new T.SphereGeometry(0.12, 20, 14), wm(P.horse, 0.6), 0, 0.66, 0.23); hd.scale.set(0.95, 0.9, 1.5); g.add(hd);
      g.add(mesh(new T.SphereGeometry(0.07, 14, 10), wm(0xf1c9b5, 0.6), 0, 0.62, 0.38));
      for (const sx of [-1, 1]) { const e = mesh(new T.ConeGeometry(0.035, 0.1, 10), wm(P.horse, 0.6), sx * 0.06, 0.79, 0.18); e.rotation.z = -sx * 0.25; g.add(e); }
      for (let i = 0; i < 6; i++) g.add(mesh(new T.SphereGeometry(0.045, 10, 8), wm(P.mane, 0.8), 0, 0.73 - i * 0.055, 0.12 - i * 0.04));
      eyes(g, 0.7, 0.32, 0.075, 0.024);
      g.add(mesh(new T.BoxGeometry(0.26, 0.06, 0.24), wm(P.cloth, 0.5), 0, 0.53, -0.04));
      const tail = mesh(new T.ConeGeometry(0.05, 0.22, 10), wm(P.mane, 0.8), 0, 0.38, -0.34); tail.rotation.x = -2.3; g.add(tail);
      rig.armR = null;
    } else if (t === 'r') {                           // tháp đá biết đi
      g.add(mesh(new T.CylinderGeometry(0.24, 0.27, 0.55, 28), wm(P.stone, 0.85), 0, 0.345, 0));
      g.add(mesh(new T.CylinderGeometry(0.27, 0.27, 0.08, 28), wm(P.stone, 0.85), 0, 0.66, 0));
      for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; const b = mesh(new T.BoxGeometry(0.1, 0.1, 0.08), wm(P.stone, 0.85), Math.sin(a) * 0.22, 0.74, Math.cos(a) * 0.22); b.rotation.y = a; g.add(b); }
      g.add(mesh(new T.BoxGeometry(0.2, 0.12, 0.02), wm(P.cloth, 0.5), 0, 0.4, 0.265));
      eyes(g, 0.53, 0.255, 0.07, 0.032);
      rig.armR = arm(P); rig.armR.position.set(0.27, 0.45, 0.02); g.add(rig.armR);
      const hm = new T.Group(); hm.add(mesh(new T.CylinderGeometry(0.018, 0.018, 0.34, 8), wm(0x7a5636, 0.7), 0, 0, 0));
      hm.add(mesh(new T.BoxGeometry(0.16, 0.1, 0.1), wm(P.metal, 0.35, 0.7), 0, 0.17, 0)); hm.position.set(0, -0.2, 0.06); hm.rotation.x = Math.PI / 2;
      rig.armR.add(hm);
      rig.armL = arm(P); rig.armL.position.set(-0.27, 0.45, 0.02); g.add(rig.armL);
    } else {
      const H = { p: 0.3, b: 0.42, q: 0.42, k: 0.45 }[t];
      if (t === 'q') g.add(mesh(lathe([V2(0.0005, 0.07), V2(0.3, 0.07), V2(0.22, 0.2), V2(0.15, 0.38), V2(0.13, 0.49), V2(0.0005, 0.5)], 32), wm(P.cloth, 0.55)));
      else body(H, t === 'p' ? 0.17 : 0.16, t === 'b' ? 0.27 : 0.24, t === 'b' ? P.cloth2 : P.cloth);
      const hy = 0.07 + H + 0.14;
      head(hy, t === 'p' ? 0.15 : 0.16);
      rig.armR = arm(P); rig.armR.position.set(0.2, 0.07 + H - 0.02, 0); g.add(rig.armR);
      rig.armL = arm(P); rig.armL.position.set(-0.2, 0.07 + H - 0.02, 0); g.add(rig.armL);
      if (t === 'p') {
        const helm = mesh(new T.SphereGeometry(0.165, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), wm(P.metal, 0.35, 0.7), 0, hy + 0.02, 0); g.add(helm);
        g.add(mesh(new T.CylinderGeometry(0.17, 0.17, 0.03, 24), wm(P.metal, 0.35, 0.7), 0, hy + 0.02, 0));
        g.add(mesh(new T.SphereGeometry(0.04, 10, 8), wm(P.cloth, 0.5), 0, hy + 0.19, 0));
        const sp = new T.Group();
        sp.add(mesh(new T.CylinderGeometry(0.015, 0.015, 0.62, 8), wm(0x8a6a44, 0.7), 0, 0, 0));
        sp.add(mesh(new T.ConeGeometry(0.04, 0.12, 10), wm(P.metal, 0.3, 0.8), 0, 0.37, 0));
        sp.position.set(0, -0.19, 0.04); sp.rotation.x = Math.PI / 2; rig.armR.add(sp);
        const sh = mesh(new T.CylinderGeometry(0.12, 0.12, 0.03, 24), wm(P.cloth, 0.5), 0, -0.17, 0.06); sh.rotation.x = Math.PI / 2; rig.armL.add(sh);
        const sr = mesh(new T.TorusGeometry(0.12, 0.014, 8, 24), wm(P.trim, 0.3, 0.8), 0, -0.17, 0.076); rig.armL.add(sr);
      } else if (t === 'b') {
        const hat = mesh(lathe([V2(0.0005, 0), V2(0.15, 0), V2(0.14, 0.08), V2(0.1, 0.2), V2(0.04, 0.3), V2(0.0005, 0.32)], 24), wm(P.cloth, 0.55), 0, hy + 0.08, 0); g.add(hat);
        const sl = mesh(new T.BoxGeometry(0.02, 0.16, 0.24), wm(P.trim, 0.3, 0.6), 0, hy + 0.2, 0); sl.rotation.y = Math.PI / 4; g.add(sl);
        const st = new T.Group(); st.add(mesh(new T.CylinderGeometry(0.016, 0.016, 0.7, 8), wm(0x7a5636, 0.7), 0, 0, 0));
        rig.orb = mesh(new T.SphereGeometry(0.06, 16, 12), wm(c === 'w' ? 0x8fe3ff : 0xff8fa0, 0.2, 0, c === 'w' ? 0x39b8ff : 0xff3b5c), 0, 0.38, 0); st.add(rig.orb);
        st.position.set(0, -0.19, 0.05); st.rotation.x = Math.PI / 2; rig.armR.add(st);
      } else if (t === 'q') {
        g.add(mesh(new T.SphereGeometry(0.17, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.55), wm(c === 'w' ? 0xf2c46b : 0x3a2418, 0.7), 0, hy + 0.015, -0.015));
        const tiara = mesh(new T.TorusGeometry(0.11, 0.018, 8, 24), wm(P.trim, 0.25, 0.9), 0, hy + 0.15, 0); tiara.rotation.x = Math.PI / 2; g.add(tiara);
        for (let i = 0; i < 5; i++) { const a = i * Math.PI * 2 / 5; g.add(mesh(new T.ConeGeometry(0.025, 0.09, 8), wm(P.trim, 0.25, 0.9), Math.sin(a) * 0.11, hy + 0.2, Math.cos(a) * 0.11)); }
        const wd = new T.Group(); wd.add(mesh(new T.CylinderGeometry(0.012, 0.012, 0.32, 8), wm(P.trim, 0.3, 0.8), 0, 0, 0));
        rig.orb = mesh(new T.OctahedronGeometry(0.06), wm(0xfff2a8, 0.2, 0, 0xffd84a), 0, 0.19, 0); wd.add(rig.orb);
        wd.position.set(0, -0.19, 0.04); wd.rotation.x = Math.PI / 2; rig.armR.add(wd);
      } else {                                         // vua
        const cape = mesh(new T.CylinderGeometry(0.18, 0.27, H, 20, 1, true, Math.PI * 0.6, Math.PI * 0.8), wm(c === 'w' ? 0x7a2ea8 : 0x1f1f2a, 0.7), 0, 0.07 + H / 2, -0.01);
        cape.material = cape.material.clone(); cape.material.side = T.DoubleSide; g.add(cape);
        g.add(mesh(new T.SphereGeometry(0.1, 16, 10, 0, Math.PI * 2, Math.PI * 0.5, Math.PI * 0.5), wm(0xf3f3f3, 0.9), 0, hy - 0.03, 0.07));
        g.add(mesh(new T.CylinderGeometry(0.135, 0.135, 0.09, 24), wm(P.trim, 0.25, 0.9), 0, hy + 0.15, 0));
        for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3; g.add(mesh(new T.ConeGeometry(0.03, 0.09, 8), wm(P.trim, 0.25, 0.9), Math.sin(a) * 0.12, hy + 0.23, Math.cos(a) * 0.12)); }
        g.add(mesh(new T.BoxGeometry(0.04, 0.16, 0.04), wm(P.trim, 0.25, 0.9), 0, hy + 0.3, 0));
        g.add(mesh(new T.BoxGeometry(0.12, 0.04, 0.04), wm(P.trim, 0.25, 0.9), 0, hy + 0.31, 0));
        const sw = new T.Group();
        sw.add(mesh(new T.BoxGeometry(0.035, 0.42, 0.012), wm(P.metal, 0.25, 0.9), 0, 0.27, 0));
        sw.add(mesh(new T.BoxGeometry(0.14, 0.025, 0.03), wm(P.trim, 0.3, 0.9), 0, 0.06, 0));
        sw.add(mesh(new T.CylinderGeometry(0.016, 0.016, 0.09, 8), wm(0x5a3a22, 0.7), 0, 0.0, 0));
        sw.position.set(0, -0.19, 0.04); sw.rotation.x = Math.PI / 2; rig.armR.add(sw);
      }
    }
    if (rig.armR) { rig.armR.rotation.x = -0.35; rig.armR.name = 'armR'; }
    if (rig.armL) { rig.armL.rotation.x = -0.2; rig.armL.name = 'armL'; }
    if (rig.orb) rig.orb.name = 'orb';
    return { obj: g, rig };
  }
  /* mỗi loại chiến binh dựng 1 lần, gộp các mảnh đứng yên theo vật liệu (ít lượt vẽ), rồi nhân bản */
  const WTPL = {};
  let toyMat = null;
  /* gộp MỌI mảnh cứng của một nhóm (thân / tay phải / tay trái) thành 1 khối, màu từng mảnh giữ bằng màu đỉnh.
     Đo 11-18: gộp theo vật liệu vẫn ~20 lượt vẽ/con → kiểu chiến binh 30 hình/giây; gộp hết còn 3 lượt/con. */
  function mergeRigid(grp) {
    grp.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(grp.matrixWorld).invert();
    const geos = [], drop = [];
    grp.traverse(o => {
      if (!o.isMesh || o === grp || o.name === 'orb') return;
      let p = o.parent, inside = true;
      while (p && p !== grp) { if (p.name === 'armR' || p.name === 'armL') { inside = false; break; } p = p.parent; }
      if (!inside) return;
      const g = o.geometry.clone();
      g.applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const ng = g.index ? g.toNonIndexed() : g;
      const col = (Array.isArray(o.material) ? o.material[0] : o.material).color;
      const n = ng.attributes.position.count, arr = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { arr[i * 3] = col.r; arr[i * 3 + 1] = col.g; arr[i * 3 + 2] = col.b; }
      ng.setAttribute('color', new T.BufferAttribute(arr, 3));
      for (const k of Object.keys(ng.attributes)) if (['position', 'normal', 'uv', 'color'].indexOf(k) < 0) ng.deleteAttribute(k);
      geos.push(ng); drop.push(o);
    });
    for (const o of drop) o.parent.remove(o);
    if (!geos.length) return;
    if (!toyMat) toyMat = new T.MeshStandardMaterial({ vertexColors: true, roughness: 0.5, metalness: 0.12, side: T.DoubleSide });
    const m = new T.Mesh(T.BufferGeometryUtils.mergeBufferGeometries(geos), toyMat);
    m.castShadow = m.receiveShadow = true;
    grp.add(m);
  }
  function warriorTemplate(t, c) {
    const k = t + c;
    if (WTPL[k]) return WTPL[k];
    const obj = (t === 'x' ? buildWarrior('p', c, XPAL[c]) : buildWarrior(t, c)).obj;
    for (const nm of ['armR', 'armL']) { const a = obj.getObjectByName(nm); if (a) mergeRigid(a); }
    mergeRigid(obj);
    obj.traverse(o => { if (o.isMesh) o.userData.shared = true; });
    WTPL[k] = obj;
    return obj;
  }

  /* ---------- vỏ phát sáng viền (kiểu pha lê) ---------- */
  function rimMat(hex) {
    return new T.ShaderMaterial({
      uniforms: { col: { value: new T.Color(hex) }, k: { value: 1.0 } },
      vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }',
      fragmentShader: 'uniform vec3 col; uniform float k; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0-abs(dot(vN,vV)), 2.2); gl_FragColor = vec4(col*f*1.6*k, f*k); }',
      transparent: true, blending: T.AdditiveBlending, depthWrite: false
    });
  }

  /* ======================================================================= */
  function create(host, opts) {
    opts = opts || {};
    const rawSfx = opts.sfx || (() => {});
    const sfx = (k, v, r) => { if (!skipping) rawSfx(k, v, r); };   // đang bỏ qua → im, khỏi dồn cả chục tiếng một lúc
    initTex();
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = PX;
    canvas.className = 'chess3d';
    host.appendChild(canvas);
    const testMode = /[?&]test\b/.test(location.search);   // ?test → giữ khung hình để bộ thử chụp được
    const R = new T.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: testMode });
    R.setPixelRatio(1); R.setSize(PX, PX, false);
    R.outputEncoding = T.sRGBEncoding; R.toneMapping = T.ACESFilmicToneMapping; R.toneMappingExposure = 1.0;
    R.shadowMap.enabled = true; R.shadowMap.type = T.PCFSoftShadowMap;
    const scene = new T.Scene();
    const pm = new T.PMREMGenerator(R);
    /* phòng chụp TỐI, đèn hắt ở hai bên: nhìn thẳng từ trên xuống, mặt bàn bóng phản chiếu trần tối
       (phòng sáng kiểu RoomEnvironment làm cả bàn bạc như phủ sương — ảnh chụp bản đầu bắt được) */
    const envCache = {};
    function makeEnv(st) {
      if (envCache[st]) return envCache[st];
      const s = new T.Scene();
      s.add(new T.Mesh(new T.BoxGeometry(40, 20, 40), new T.MeshBasicMaterial({ color: st === 'crystal' ? 0x06050b : 0x15110d, side: T.BackSide })));
      const panel = (w, h, x, y, z, col, k) => {
        const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(k), side: T.DoubleSide }));
        m.position.set(x, y, z); m.lookAt(0, 1, 0); s.add(m);
      };
      if (st === 'crystal') {
        panel(12, 5, -14, 4, 4, 0x39e6ff, 2.4); panel(12, 5, 14, 4, -4, 0xff4fd8, 2.4); panel(16, 3, 0, 3, 15, 0x8a7dff, 1.5); panel(6, 6, 6, 9, -3, 0xffffff, 0.5);
      } else if (st === 'arena') {        // đấu trường: trời giông xanh lạnh phía trên + lửa lò cam hai bên
        panel(18, 6, -10, 12, -6, 0x9fb6ff, 1.6); panel(10, 4, -14, 2, 2, 0xff9a4a, 2.2); panel(10, 4, 14, 2, 2, 0xff9a4a, 2.2); panel(20, 5, 0, 4, 16, 0x5a6a90, 0.9);
      } else {
        panel(12, 7, -14, 5, 6, 0xfff0dc, 2.8); panel(12, 7, 14, 5, -6, 0xe6efff, 2.0); panel(18, 4, 0, 3, 16, 0xfff6ea, 1.4); panel(18, 4, 0, 3, -16, 0xfff6ea, 1.0); panel(7, 7, 6, 9.5, -2, 0xfff4e6, 0.8);
      }
      envCache[st] = pm.fromScene(s, 0.04).texture;
      return envCache[st];
    }

    const hemi = new T.HemisphereLight(0xfff3e2, 0x2a2018, 0.35);
    const key = new T.DirectionalLight(0xffffff, 1.5);
    key.position.set(3.2, 10, 4.2); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -6.5, right: 6.5, top: 6.5, bottom: -6.5, near: 1, far: 30 });
    key.shadow.bias = -0.0004; key.shadow.normalBias = 0.02;
    scene.add(hemi, key, key.target);
    const flashLight = new T.PointLight(0xfff0c0, 0, 4, 2); scene.add(flashLight);

    /* --- máy quay bàn cờ. Kiểu nhìn (⚙, Nam 11-18 "làm mẫu cả ba rồi mình chọn"):
         'top' từ trên xuống · 'tiltTurn' nghiêng, xoay về người tới lượt · 'tiltFixed' nghiêng cố định phía Trắng ·
         'topBadge' từ trên xuống + huy hiệu to quay về chủ quân. Kiểu bàn PHẲNG luôn nhìn từ trên xuống. --- */
    const boardCam = new T.PerspectiveCamera(22, 1, 0.1, 100);
    const camTmp = new T.PerspectiveCamera(22, 1, 0.1, 100);
    let orient = 'portrait', viewMode = 'top', camSide = 'w';
    const isTilt = () => style !== 'flat' && (viewMode === 'tiltTurn' || viewMode === 'tiltFixed');
    function camPose() {
      if (!isTilt()) {
        camTmp.position.set(0, 26.2, 0);
        camTmp.up.set(orient === 'portrait' ? 0 : -1, 0, orient === 'portrait' ? -1 : 0);
        camTmp.lookAt(0, 0, 0);
        return { pos: camTmp.position.clone(), quat: camTmp.quaternion.clone(), fov: style === 'flat' ? 19 : 22 };   // bàn phẳng không có khung gỗ → phóng to cho kín
      }
      const side = viewMode === 'tiltFixed' ? 'w' : camSide, zs = side === 'w' ? 1 : -1;
      camTmp.position.set(0, 12.4, 11.0 * zs); camTmp.up.set(0, 1, 0); camTmp.lookAt(0, 0, 0.75 * zs);
      camTmp.rotateZ(viewerInfo(side).roll);
      return { pos: camTmp.position.clone(), quat: camTmp.quaternion.clone(), fov: 30 };
    }
    function placeBoardCam(animate) {
      const to = camPose();
      if (!animate) { boardCam.position.copy(to.pos); boardCam.quaternion.copy(to.quat); boardCam.fov = to.fov; boardCam.updateProjectionMatrix(); return; }
      const p0 = boardCam.position.clone(), q0 = boardCam.quaternion.clone(), f0 = boardCam.fov;
      // xoay vòng qua phía trên bàn (đi thẳng qua giữa sẽ chui xuống mặt bàn)
      tween(0.95, k => {
        boardCam.position.lerpVectors(p0, to.pos, k); boardCam.position.y += Math.sin(k * Math.PI) * 9;
        boardCam.quaternion.slerpQuaternions(q0, to.quat, k);
        boardCam.fov = f0 + (to.fov - f0) * k; boardCam.updateProjectionMatrix();
      });
    }

    /* --- nhóm đối tượng --- */
    const boardGrp = new T.Group(), pieceGrp = new T.Group(), markGrp = new T.Group(), fxGrp = new T.Group();
    const wallGrp = new T.Group(), iconBadgeGrp = new T.Group();
    scene.add(boardGrp, pieceGrp, markGrp, fxGrp, wallGrp, iconBadgeGrp);
    let style = 'classic';
    placeBoardCam();

    /* ---------- ô tường (Nam 11-21): phẳng = ô gạch · 3D = khối đá thấp ---------- */
    let wallKey = '';
    function refreshWalls(S) {
      const key = style + '|' + (S && S.walls ? S.walls.map(w => (w ? 1 : 0)).join('') : '');
      if (key === wallKey) return;
      wallKey = key;
      while (wallGrp.children.length) wallGrp.remove(wallGrp.children[0]);
      if (!S || !S.walls) return;
      const flatW = style === 'flat';
      const mat = flatW ? new T.MeshBasicMaterial({ map: brickTex(), toneMapped: false })
        : new T.MeshStandardMaterial({ map: brickTex(), roughness: 0.9 });
      const geo = flatW ? new T.PlaneGeometry(0.985, 0.985).rotateX(-Math.PI / 2) : new T.BoxGeometry(0.97, 0.32, 0.97);
      for (let q = 0; q < 64; q++) {
        if (!S.walls[q]) continue;
        const m = new T.Mesh(geo, mat);
        m.position.copy(sqV(q, flatW ? TOP + 0.003 : TOP + 0.16));
        m.castShadow = m.receiveShadow = !flatW;
        wallGrp.add(m);
      }
    }

    /* ---------- huy hiệu to quay về chủ quân (kiểu nhìn 'topBadge') ---------- */
    const badgeRot = c => (orient === 'portrait' ? (c === 'w' ? 0 : Math.PI) : (c === 'w' ? -Math.PI / 2 : Math.PI / 2));
    function refreshIconBadges() {
      while (iconBadgeGrp.children.length) iconBadgeGrp.remove(iconBadgeGrp.children[0]);
      if (viewMode !== 'topBadge' || style === 'flat') return;
      for (const m of meshes.values()) {
        const sp = new T.Sprite(new T.SpriteMaterial({ map: badgeIconTex(m.c, m.t, m.def), transparent: true, depthTest: false, depthWrite: false, rotation: badgeRot(m.c) }));
        sp.scale.set(0.66, 0.66, 1); sp.renderOrder = 5; sp.userData.rec = m;
        iconBadgeGrp.add(sp);
      }
      updateIconBadges();
    }
    function updateIconBadges() {
      for (const sp of iconBadgeGrp.children) {
        const m = sp.userData.rec;
        sp.visible = m.root.visible && !cut.active;
        sp.position.copy(m.root.position); sp.position.y += (HEIGHT[m.t] || 1) * 1.15 + 0.12;
      }
    }
    const meshes = new Map();       // id → {root, pivot, model, t, c, rig}
    let lastState = null;

    /* ---------- bàn cờ theo kiểu ---------- */
    function disposeGroup(g) {
      g.traverse(o => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
      while (g.children.length) g.remove(g.children[0]);
    }
    function squaresGeo(light, jitterSeed) {
      const geos = [];
      let seed = jitterSeed || 7;
      const r = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
      for (let s = 0; s < 64; s++) {
        const isLight = ((s & 7) + (s >> 3)) % 2 === 1;
        if (isLight !== light) continue;
        const g = new T.PlaneGeometry(0.985, 0.985); g.rotateX(-Math.PI / 2);
        const uv = g.attributes.uv, u0 = r() * 0.7, v0 = r() * 0.7, rot = (s % 2 === 0);
        for (let i = 0; i < uv.count; i++) {
          let u = uv.getX(i), v = uv.getY(i);
          if (rot) { const tmp = u; u = v; v = tmp; }
          uv.setXY(i, u0 + u * 0.28, v0 + v * 0.28);
        }
        g.translate(sqX(s), TOP, sqZ(s));
        geos.push(g);
      }
      return T.BufferGeometryUtils.mergeBufferGeometries(geos);
    }
    function buildFlatBoard() {      // bàn PHẲNG kiểu chess.com Nam gửi (11-21): ô kem / xanh lá, viền tối, không đèn
      const board = canvasTex(1024, (g, s) => {
        const q = s / 8;
        for (let r = 0; r < 8; r++) for (let f = 0; f < 8; f++) {
          g.fillStyle = (f + r) % 2 === 1 ? '#eeeed2' : '#769656';
          g.fillRect(f * q, (7 - r) * q, q, q);
        }
      });
      board.anisotropy = 8;
      const mk = (w, col, map, y) => {
        const m = new T.Mesh(new T.PlaneGeometry(w, w), new T.MeshBasicMaterial({ color: col, map: map || null, toneMapped: false }));
        m.rotation.x = -Math.PI / 2; m.position.y = y; boardGrp.add(m); return m;
      };
      mk(160, 0x1d1a17, null, -0.33);
      mk(8.42, 0x2b2622, null, TOP - 0.004);
      mk(8, 0xffffff, board, TOP - 0.002);
      scene.background = new T.Color(0x1d1a17);
      R.toneMappingExposure = 1.0;
    }
    function buildBoard() {
      disposeGroup(boardGrp);
      if (style === 'flat') { buildFlatBoard(); return; }
      const ebony = woodTex('ebony', [2.2, 2.2]), oak = woodTex('oak'), mah = woodTex('mahogany');
      let frameMat, lightMat, darkMat, tableMat, lineMat = null, inlay = null;
      if (style === 'classic') {
        frameMat = new T.MeshPhysicalMaterial({ map: ebony, color: 0xb59a88, roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 });
        lightMat = new T.MeshPhysicalMaterial({ map: oak, color: 0xffffff, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 });
        darkMat = new T.MeshPhysicalMaterial({ map: mah, color: 0xd8b8a8, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.2 });
        tableMat = new T.MeshStandardMaterial({ color: 0x2a1d15, roughness: 0.92 });
        inlay = new T.MeshStandardMaterial({ color: 0xe0b860, metalness: 1, roughness: 0.3 });
      } else if (style === 'warriors') {
        frameMat = new T.MeshPhysicalMaterial({ map: mah, color: 0xe2b48f, roughness: 0.45, clearcoat: 0.5 });
        lightMat = new T.MeshStandardMaterial({ map: oak, color: 0xfff1d2, roughness: 0.6 });
        darkMat = new T.MeshStandardMaterial({ map: oak, color: 0x79b65e, roughness: 0.6 });
        tableMat = new T.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.9 });
        inlay = new T.MeshStandardMaterial({ color: 0xf3c34b, metalness: 0.8, roughness: 0.35 });
      } else {
        frameMat = new T.MeshPhysicalMaterial({ map: ebony, color: 0x6a6670, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08 });
        lightMat = new T.MeshPhysicalMaterial({ map: ebony, color: 0xc8c2dc, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.12 });
        darkMat = new T.MeshPhysicalMaterial({ map: ebony, color: 0x3a3644, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.12 });
        tableMat = new T.MeshStandardMaterial({ color: 0x07070c, roughness: 0.6 });
        lineMat = new T.MeshBasicMaterial({ color: new T.Color(0x3cf0ff).multiplyScalar(1.6), toneMapped: false });
        inlay = new T.MeshBasicMaterial({ color: new T.Color(0xff4fd8).multiplyScalar(1.6), toneMapped: false });
      }
      const table = new T.Mesh(new T.PlaneGeometry(160, 160), tableMat); table.rotation.x = -Math.PI / 2; table.position.y = -0.33; table.receiveShadow = true; boardGrp.add(table);
      scene.background = tableMat.color.clone().multiplyScalar(style === 'crystal' ? 1 : 0.55);   // chân trời lúc cận cảnh trùng màu bàn, khỏi dải đen
      const frame = new T.Mesh(new T.BoxGeometry(9.4, 0.34, 9.4), frameMat); frame.position.y = 0.012 - 0.17; frame.castShadow = frame.receiveShadow = true; boardGrp.add(frame);
      const lq = new T.Mesh(squaresGeo(true, 11), lightMat), dq = new T.Mesh(squaresGeo(false, 29), darkMat);
      lq.receiveShadow = dq.receiveShadow = true; boardGrp.add(lq, dq);
      if (inlay) for (const [w, d, x, z] of [[8.22, 0.06, 0, 4.11], [8.22, 0.06, 0, -4.11], [0.06, 8.22, 4.11, 0], [0.06, 8.22, -4.11, 0]]) {
        const b = new T.Mesh(new T.BoxGeometry(w, 0.012, d), inlay); b.position.set(x, 0.014, z); boardGrp.add(b);
      }
      if (lineMat) {
        for (let i = 1; i < 8; i++) {
          const a = new T.Mesh(new T.BoxGeometry(8, 0.006, 0.012), lineMat); a.position.set(0, 0.016, 4 - i); boardGrp.add(a);
          const b = new T.Mesh(new T.BoxGeometry(0.012, 0.006, 8), lineMat); b.position.set(4 - i, 0.016, 0); boardGrp.add(b);
        }
        const halo = new T.SpriteMaterial({ map: TEX.glow, color: 0xff4fd8, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.16 });
        for (let i = 0; i < 4; i++) for (let j = 0; j < 9; j++) {
          const sp = new T.Sprite(halo); const t = -4 + j;
          sp.position.set(i < 2 ? t : (i === 2 ? 4.11 : -4.11), 0.03, i < 2 ? (i ? -4.11 : 4.11) : t); sp.scale.set(0.8, 0.8, 1); boardGrp.add(sp);
        }
      }
      hemi.intensity = style === 'crystal' ? 0.3 : 0.35;
      key.intensity = style === 'crystal' ? 1.25 : (style === 'warriors' ? 1.7 : 1.5);
      R.toneMappingExposure = style === 'crystal' ? 1.15 : 1.0;
    }

    /* ---------- vật liệu quân cổ điển / pha lê ---------- */
    let pmats = null;
    function pieceMats() {
      if (style === 'classic') {
        const oak = woodTex('oak', [1, 1]), eb = woodTex('ebony', [1, 1]);
        return {
          w: { main: new T.MeshPhysicalMaterial({ map: oak, color: 0xfff2dc, roughness: 0.36, clearcoat: 0.8, clearcoatRoughness: 0.14 }), accent: new T.MeshStandardMaterial({ color: 0x3a2a1e, roughness: 0.5 }) },
          b: { main: new T.MeshPhysicalMaterial({ map: eb, color: 0x9c8070, roughness: 0.3, clearcoat: 0.9, clearcoatRoughness: 0.1 }), accent: new T.MeshStandardMaterial({ color: 0xe8d6b0, roughness: 0.5 }) }
        };
      }
      /* kính GIẢ (trong suốt + phản chiếu + tự phát sáng nhẹ), không dùng transmission:
         transmission bắt vẽ thêm cả cảnh một lượt mỗi khung → đo 11-18 chỉ còn 25 hình/giây */
      const glass = (tint, att) => new T.MeshPhysicalMaterial({ color: new T.Color(tint).lerp(new T.Color(att), 0.45), metalness: 0, roughness: 0.06, transparent: true, opacity: 0.62, depthWrite: false, clearcoat: 1, clearcoatRoughness: 0.04, envMapIntensity: 2.0, emissive: new T.Color(att), emissiveIntensity: 0.32 });
      return {
        w: { main: glass(0xe6fbff, 0x5fdcff), accent: new T.MeshBasicMaterial({ color: new T.Color(0x9ff4ff).multiplyScalar(1.4), toneMapped: false }), core: 0x45e6ff },
        b: { main: glass(0xf6e4ff, 0xb15cff), accent: new T.MeshBasicMaterial({ color: new T.Color(0xf1b0ff).multiplyScalar(1.4), toneMapped: false }), core: 0xd06bff }
      };
    }
    const FLATGEO = (() => { const g = new T.PlaneGeometry(0.94, 0.94); g.rotateX(-Math.PI / 2); g.rotateY(Math.PI); return g; })();
    const XMAT = {};
    function emojiSprite(def, h) {     // emoji Bon chọn, nổi trên đầu quân tự chế (kiểu 3D)
      const sp = new T.Sprite(new T.SpriteMaterial({ map: badgeTex((def && def.emoji) || '⭐'), transparent: true, depthWrite: false }));
      sp.scale.set(0.42, 0.42, 1); sp.position.y = h + 0.22; return sp;
    }
    function buildModel(t, c, def) {
      if (style === 'flat') {        // hình phẳng nằm trên ô, đầu hình quay về phía địch (= xuôi với người ngồi bên đó)
        const g = new T.Group();
        const m = new T.Mesh(FLATGEO, new T.MeshBasicMaterial({ map: t === 'x' ? customTex(def, c) : iconTex(c + t), transparent: true, toneMapped: false, depthWrite: false }));
        m.position.y = 0.03; m.renderOrder = 2; m.userData.shared = true; g.add(m);
        return { obj: g, rig: {} };
      }
      if (style === 'warriors') {
        const obj = warriorTemplate(t, c).clone(true);
        if (t === 'x') obj.add(emojiSprite(def, 0.78));
        return { obj, rig: { armR: obj.getObjectByName('armR') || null, armL: obj.getObjectByName('armL') || null, orb: obj.getObjectByName('orb') || null } };
      }
      if (t === 'x') {                // cổ điển / pha lê: dáng tốt, màu ĐỎ, đế màu đội
        const g = new T.Group();
        const key = style + c;
        if (!XMAT[key]) XMAT[key] = new T.MeshPhysicalMaterial({ color: 0xd11f2e, roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15, emissive: style === 'crystal' ? 0x5a0008 : 0x000000 });
        const body = new T.Mesh(turnedGeo('p')[0].g, XMAT[key]); body.castShadow = body.receiveShadow = true; body.userData.shared = true; g.add(body);
        const plate = new T.Mesh(new T.CylinderGeometry(0.36, 0.37, 0.05, 36), new T.MeshStandardMaterial({ color: c === 'w' ? 0xf4f1ea : 0x1c1a20, roughness: 0.5 }));
        plate.position.y = 0.025; plate.receiveShadow = true; g.add(plate);
        g.add(emojiSprite(def, 0.7));
        return { obj: g, rig: {} };
      }
      const g = new T.Group(), M = pmats[c];
      for (const part of turnedGeo(t)) {
        const m = new T.Mesh(part.g, M[part.m]); m.castShadow = true; m.receiveShadow = true; m.userData.shared = true; g.add(m);
      }
      if (style === 'crystal') {
        const core = new T.Mesh(coreGeo(t), new T.MeshBasicMaterial({ color: new T.Color(M.core).multiplyScalar(1.3), toneMapped: false, transparent: true, opacity: 0.85 }));
        core.userData.shared = true;
        g.add(core);
        const shell = new T.Mesh(turnedGeo(t)[0].g, rimMat(M.core)); shell.scale.set(1.04, 1.02, 1.04); shell.userData.shared = true; g.add(shell);
        const glow = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: M.core, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.55 }));
        glow.scale.set(1.05, 1.05, 1); glow.position.y = 0.03; g.add(glow);
        return { obj: g, rig: { core } };
      }
      return { obj: g, rig: {} };
    }
    const facing = c => (c === 'w' ? Math.PI : 0);     // mặt quân Trắng nhìn về phía Đen (−z)
    function makePiece(p) {
      const root = new T.Group(), pivot = new T.Group();
      const b = buildModel(p.t, p.c, p.def);
      if (viewMode === 'topBadge' && style !== 'flat') b.obj.scale.setScalar(1.15);   // "quân cao to hơn"
      pivot.add(b.obj); root.add(pivot);
      root.rotation.y = facing(p.c);
      pieceGrp.add(root);
      const rec = { root, pivot, model: b.obj, rig: b.rig, t: p.t, c: p.c, id: p.id, def: p.def, defKey: p.def ? p.def.emoji : '', phase: Math.random() * 6 };
      meshes.set(p.id, rec);
      return rec;
    }
    function removePiece(id) {
      const m = meshes.get(id);
      if (!m) return;
      pieceGrp.remove(m.root);
      m.root.traverse(o => { if (o.geometry && !o.userData.shared) o.geometry.dispose(); });
      meshes.delete(id);
    }
    function sync(S) {
      lastState = S;
      const seen = new Set();
      for (let s = 0; s < 64; s++) {
        const p = S.board[s];
        if (!p) continue;
        seen.add(p.id);
        let m = meshes.get(p.id);
        if (m && (m.t !== p.t || m.c !== p.c || m.defKey !== (p.def ? p.def.emoji : ''))) { removePiece(p.id); m = null; }
        if (!m) m = makePiece(p);
        m.root.position.copy(sqV(s));
        m.root.rotation.set(0, facing(p.c), 0);
        m.root.scale.set(1, 1, 1); m.root.visible = true;
        m.pivot.rotation.set(0, 0, 0); m.pivot.position.set(0, 0, 0);
        m.lives = p.lives || 1; m.cards = p.cards || [];
      }
      for (const id of Array.from(meshes.keys())) if (!seen.has(id)) removePiece(id);
      refreshBadges(S);
      refreshWalls(S);
      refreshIconBadges();
      if (S.turn !== camSide) { camSide = S.turn; if (viewMode === 'tiltTurn' && style !== 'flat') placeBoardCam(true); }
    }
    function rebuildPieces() { for (const id of Array.from(meshes.keys())) removePiece(id); if (lastState) sync(lastState); }
    function setStyle(st) {
      style = st;
      scene.environment = st === 'flat' ? null : makeEnv(st);
      buildBoard();
      pmats = (style === 'warriors' || style === 'flat') ? null : pieceMats();
      wallKey = '';
      placeBoardCam();
      rebuildPieces();
    }
    function setView(v) {
      if (v === viewMode) return;
      viewMode = v;
      placeBoardCam();
      rebuildPieces();
    }

    /* ---------- dấu hiệu trên bàn: nước đi được, ô chọn, nước vừa đi, chiếu, Select ---------- */
    const COL = () => (style === 'crystal' ? 0x5ff4ff : style === 'warriors' ? 0x6cf06a : 0xffd36a);
    function clearMarks() { while (markGrp.children.length) markGrp.remove(markGrp.children[0]); }
    let marks = { sel: -1, moves: [], last: null, check: -1, chosen: [] };
    function drawMarks() {
      clearMarks();
      const c = COL();
      if (marks.last) for (const s of marks.last) {
        const q = new T.Mesh(new T.PlaneGeometry(0.985, 0.985), new T.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: style === 'crystal' ? 0.16 : 0.22, depthWrite: false }));
        q.rotation.x = -Math.PI / 2; q.position.copy(sqV(s, TOP + 0.002)); markGrp.add(q);
      }
      if (marks.sel >= 0) {
        const g = new T.Mesh(new T.PlaneGeometry(1.3, 1.3), new T.MeshBasicMaterial({ map: TEX.glow, color: c, transparent: true, blending: T.AdditiveBlending, depthWrite: false, opacity: 0.9 }));
        g.rotation.x = -Math.PI / 2; g.position.copy(sqV(marks.sel, TOP + 0.004)); markGrp.add(g);
      }
      for (const mv of marks.moves) {
        let o;
        if (mv.kind === 'capture') o = new T.Mesh(new T.RingGeometry(0.4, 0.47, 40), new T.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.85, depthWrite: false }));
        else if (mv.kind === 'swap') o = new T.Mesh(new T.RingGeometry(0.36, 0.44, 6), new T.MeshBasicMaterial({ color: 0x7fb6ff, transparent: true, opacity: 0.9, depthWrite: false }));
        else o = new T.Mesh(new T.CircleGeometry(0.14, 28), new T.MeshBasicMaterial({ color: c, transparent: true, opacity: 0.85, depthWrite: false }));
        o.rotation.x = -Math.PI / 2; o.position.copy(sqV(mv.to, TOP + 0.006)); markGrp.add(o);
      }
      if (marks.check >= 0) {
        const g = new T.Mesh(new T.PlaneGeometry(1.5, 1.5), new T.MeshBasicMaterial({ map: TEX.glow, color: 0xff2a2a, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
        g.rotation.x = -Math.PI / 2; g.position.copy(sqV(marks.check, TOP + 0.005)); markGrp.add(g);
      }
      for (const s of marks.chosen) {
        const r = new T.Mesh(new T.RingGeometry(0.42, 0.5, 40), new T.MeshBasicMaterial({ color: 0xffc83d, transparent: true, opacity: 0.95, depthWrite: false }));
        r.rotation.x = -Math.PI / 2; r.position.copy(sqV(s, TOP + 0.007)); r.userData.pulse = true; markGrp.add(r);
      }
    }
    function setMarks(m) { Object.assign(marks, m); drawMarks(); }

    /* huy hiệu thẻ (emoji nhỏ trên đầu quân có thẻ) */
    const badgeGrp = new T.Group(); scene.add(badgeGrp);
    let badgesOn = true;
    const badgeTexCache = {};
    function badgeTex(txt) {
      if (badgeTexCache[txt]) return badgeTexCache[txt];
      const t = canvasTex(128, (g, s) => {
        g.fillStyle = 'rgba(20,20,30,0.78)'; g.beginPath(); g.arc(s / 2, s / 2, s * 0.46, 0, Math.PI * 2); g.fill();
        g.strokeStyle = '#ffd36a'; g.lineWidth = 6; g.stroke();
        g.font = `${Math.round(s * 0.5)}px "Apple Color Emoji","Segoe UI Emoji",sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillStyle = '#fff'; g.fillText(txt, s / 2, s * 0.54);
      });
      badgeTexCache[txt] = t; return t;
    }
    function refreshBadges(S) {
      while (badgeGrp.children.length) badgeGrp.remove(badgeGrp.children[0]);
      if (!badgesOn || !S) return;
      for (let s = 0; s < 64; s++) {
        const p = S.board[s];
        if (!p || !p.cards || !p.cards.length) continue;
        const em = p.cards.map(c => c.emoji || '✨').slice(0, 3);
        em.forEach((e, i) => {
          const sp = new T.Sprite(new T.SpriteMaterial({ map: badgeTex(e), transparent: true, depthWrite: false, depthTest: false }));
          sp.scale.set(0.36, 0.36, 1);
          sp.position.copy(sqV(s, (HEIGHT[p.t] || 1) + 0.25)); sp.position.x += (i - (em.length - 1) / 2) * 0.34;
          sp.userData.pid = p.id; badgeGrp.add(sp);
        });
      }
    }
    function updateBadges() {
      for (const sp of badgeGrp.children) {
        const m = meshes.get(sp.userData.pid);
        sp.visible = !!(m && m.root.visible) && !cut.active;
      }
    }

    /* ---------- hiệu ứng: tia lửa, loé sáng, mảnh vỡ, sao, khói ---------- */
    const SPARK_N = 400;
    const spGeo = new T.BufferGeometry();
    const spPos = new Float32Array(SPARK_N * 3), spCol = new Float32Array(SPARK_N * 3);
    spGeo.setAttribute('position', new T.BufferAttribute(spPos, 3));
    spGeo.setAttribute('color', new T.BufferAttribute(spCol, 3));
    const sparks = new T.Points(spGeo, new T.PointsMaterial({ size: 0.09, map: TEX.glow, vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
    sparks.frustumCulled = false; scene.add(sparks);
    const spList = [];
    function burst(at, n, color, power) {
      const col = new T.Color(color || 0xffd27a);
      for (let i = 0; i < n; i++) {
        if (spList.length >= SPARK_N) spList.shift();
        const v = new T.Vector3(rnd(-1, 1), rnd(-0.2, 1), rnd(-1, 1)).normalize().multiplyScalar(rnd(1.2, 3.2) * (power || 1));
        spList.push({ p: at.clone(), v, life: rnd(0.25, 0.55), max: 0.55, c: col });
      }
    }
    const debris = [];
    function addDebris(o, v, spin, life) { fxGrp.add(o); debris.push({ o, v, spin, life, max: life }); }
    function flash(at, power) {
      flashLight.position.copy(at); flashLight.intensity = 2.2 * (power || 1);
      const sp = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: 0xfff1c4, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      sp.position.copy(at); fxGrp.add(sp);
      tween(0.28, k => { sp.scale.setScalar(0.3 + 1.2 * k * (power || 1)); sp.material.opacity = 0.9 * (1 - k); flashLight.intensity = 2.2 * (power || 1) * (1 - k); }, EASE.out).then(() => fxGrp.remove(sp));
    }
    function stepFx(dt) {
      let n = 0;
      for (let i = spList.length - 1; i >= 0; i--) {
        const s = spList[i]; s.life -= dt;
        if (s.life <= 0) { spList.splice(i, 1); continue; }
        s.v.y -= 6 * dt; s.p.addScaledVector(s.v, dt);
      }
      for (const s of spList) {
        const a = Math.max(0, s.life / s.max);
        spPos[n * 3] = s.p.x; spPos[n * 3 + 1] = s.p.y; spPos[n * 3 + 2] = s.p.z;
        spCol[n * 3] = s.c.r * a; spCol[n * 3 + 1] = s.c.g * a; spCol[n * 3 + 2] = s.c.b * a; n++;
      }
      for (let i = n; i < SPARK_N; i++) { spPos[i * 3 + 1] = -99; }
      spGeo.attributes.position.needsUpdate = true; spGeo.attributes.color.needsUpdate = true;
      for (let i = debris.length - 1; i >= 0; i--) {
        const d = debris[i]; d.life -= dt;
        d.v.y -= 9 * dt; d.o.position.addScaledVector(d.v, dt);
        if (d.o.position.y < TOP + 0.03) { d.o.position.y = TOP + 0.03; d.v.y *= -0.35; d.v.x *= 0.7; d.v.z *= 0.7; }
        d.o.rotation.x += d.spin.x * dt; d.o.rotation.y += d.spin.y * dt; d.o.rotation.z += d.spin.z * dt;
        if (d.o.material && d.o.material.transparent) d.o.material.opacity = Math.min(1, d.life / 0.5);
        if (d.life <= 0) { fxGrp.remove(d.o); debris.splice(i, 1); }
      }
    }

    /* ---------- máy quay cận cảnh ---------- */
    const cut = { active: false, mode: 'toward', blend: 0, views: [], shake: 0 };
    const tmpCam = new T.PerspectiveCamera(38, 1, 0.05, 60);
    function viewerInfo(side) {   // hướng ngồi + độ xoay hình cho từng người
      const vec = new T.Vector3(0, 0, side === 'w' ? 1 : -1);
      const roll = orient === 'portrait' ? (side === 'w' ? 0 : Math.PI) : (side === 'w' ? Math.PI / 2 : -Math.PI / 2);
      return { vec, roll };
    }
    function cutPose(mid, dir, vi, aspect) {
      let perp = new T.Vector3(-dir.z, 0, dir.x);
      if (perp.dot(vi.vec) < 0) perp.negate();
      const back = perp.multiplyScalar(2.75).add(vi.vec.clone().multiplyScalar(0.6));
      const pos = mid.clone().add(back); pos.y += 1.55;
      tmpCam.position.copy(pos); tmpCam.up.set(0, 1, 0); tmpCam.lookAt(mid.x, mid.y + 0.36, mid.z); tmpCam.rotateZ(vi.roll);
      const fov = aspect >= 1 ? 36 : 36 / Math.max(0.5, aspect) * 0.62;
      return { pos, quat: tmpCam.quaternion.clone(), fov };
    }
    function setupCut(mode, mid, dir, capturerSide) {
      cut.mode = mode; cut.views = [];
      const mk = (side, vp, overrideVec) => {
        const vi = viewerInfo(side); if (overrideVec) vi.vec = overrideVec;
        const asp = vp.w / vp.h;
        const cam = new T.PerspectiveCamera(22, asp, 0.05, 80);
        const pose = cutPose(mid, dir, vi, asp);
        cam.position.copy(boardCam.position); cam.quaternion.copy(boardCam.quaternion);
        cut.views.push({ cam, vp, from: { pos: boardCam.position.clone(), quat: boardCam.quaternion.clone(), fov: boardCam.fov }, to: pose });
      };
      if (mode === 'split') {
        if (orient === 'portrait') { mk('w', { x: 0, y: 0, w: PX, h: PX / 2 }); mk('b', { x: 0, y: PX / 2, w: PX, h: PX / 2 }); }
        else { mk('w', { x: 0, y: 0, w: PX / 2, h: PX }); mk('b', { x: PX / 2, y: 0, w: PX / 2, h: PX }); }
      } else if (mode === 'side') {
        const vi = viewerInfo('w');
        const v = { x: 0, y: 0, w: PX, h: PX };
        const cam = new T.PerspectiveCamera(22, 1, 0.05, 80);
        const sideVec = orient === 'portrait' ? new T.Vector3(1, 0, 0) : new T.Vector3(0, 0, 1);
        const pose = cutPose(mid, dir, { vec: sideVec, roll: orient === 'portrait' ? Math.PI / 2 : 0 }, 1);
        void vi;
        cam.position.copy(boardCam.position); cam.quaternion.copy(boardCam.quaternion);
        cut.views.push({ cam, vp: v, from: { pos: boardCam.position.clone(), quat: boardCam.quaternion.clone(), fov: boardCam.fov }, to: pose });
      } else mk(capturerSide, { x: 0, y: 0, w: PX, h: PX });
    }
    function applyCutBlend(k) {
      for (const v of cut.views) {
        v.cam.position.lerpVectors(v.from.pos, v.to.pos, k);
        v.cam.quaternion.slerpQuaternions(v.from.quat, v.to.quat, k);
        v.cam.fov = v.from.fov + (v.to.fov - v.from.fov) * k;
        v.cam.updateProjectionMatrix();
      }
    }

    /* ======================= ĐẤU TRƯỜNG — cut-screen (Nam 11-21: "khi đánh nhau thì chuyển cảnh đánh nhau,
       như kiểu cut-screen trong mấy cái game"). Cảnh riêng, dựng 1 lần, chỉ vẽ lúc đang đánh. ======================= */
    const arena = { scene: null, cam: null, fighters: [], fires: [], fireLights: [], embers: null, sky: null, flashT: 0, nextFlash: 2, moon: null, hemi: null };
    const ARENA_K = 1.8;                 // chiến binh trong đấu trường to gấp 1,8 lần quân trên bàn
    function marbleTex() {
      return canvasTex(1024, (g, s) => {
        const q = s / 4;
        for (let r = 0; r < 4; r++) for (let f = 0; f < 4; f++) {
          const light = (r + f) % 2 === 0, x = f * q, y = r * q;
          const gr = g.createLinearGradient(x, y, x + q, y + q);
          if (light) { gr.addColorStop(0, '#f1efe9'); gr.addColorStop(1, '#d9d6cf'); } else { gr.addColorStop(0, '#22232a'); gr.addColorStop(1, '#14151a'); }
          g.fillStyle = gr; g.fillRect(x, y, q, q);
          g.save(); g.beginPath(); g.rect(x, y, q, q); g.clip();
          for (let v = 0; v < 7; v++) {          // vân đá
            g.strokeStyle = light ? `rgba(120,118,126,${rnd(0.08, 0.28)})` : `rgba(190,190,205,${rnd(0.05, 0.18)})`;
            g.lineWidth = rnd(0.8, 3.2); g.beginPath();
            let px = x + rnd(0, q), py = y + rnd(0, q * 0.2); g.moveTo(px, py);
            for (let k = 0; k < 4; k++) { const nx = px + rnd(-q * 0.35, q * 0.35), ny = py + q * 0.3; g.quadraticCurveTo(px + rnd(-40, 40), py + q * 0.15, nx, ny); px = nx; py = ny; }
            g.stroke();
          }
          g.restore();
        }
        g.strokeStyle = '#c9a24a'; g.lineWidth = 5;
        for (let i = 0; i <= 4; i++) { g.beginPath(); g.moveTo(i * q, 0); g.lineTo(i * q, s); g.stroke(); g.beginPath(); g.moveTo(0, i * q); g.lineTo(s, i * q); g.stroke(); }
      });
    }
    function stoneTex() {
      return canvasTex(512, (g, s) => {
        g.fillStyle = '#3d4049'; g.fillRect(0, 0, s, s);
        const rows = 8, h = s / rows;
        for (let r = 0; r < rows; r++) {
          const off = (r % 2) * h, w = h * 2;
          for (let x = -off; x < s; x += w) {
            const v = 72 + ((r * 31 + Math.round(x) * 7) % 34);
            g.fillStyle = `rgb(${v},${v + 3},${v + 12})`; g.fillRect(x + 3, r * h + 3, w - 6, h - 6);
            g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x + 3, r * h + h - 8, w - 6, 5);
          }
        }
      });
    }
    function skyTex() {
      return canvasTex(1024, (g, s) => {
        const gr = g.createLinearGradient(0, 0, 0, s);   // nửa trên = trời (chân trời ở giữa ảnh)
        gr.addColorStop(0, '#141a2c'); gr.addColorStop(0.3, '#2c3450'); gr.addColorStop(0.44, '#565a78'); gr.addColorStop(0.49, '#8a6e78'); gr.addColorStop(0.52, '#3a3540'); gr.addColorStop(1, '#101014');
        g.fillStyle = gr; g.fillRect(0, 0, s, s);
        for (let i = 0; i < 90; i++) {            // mây giông
          const x = rnd(0, s), y = rnd(s * 0.05, s * 0.47), r = rnd(40, 140);
          const c = g.createRadialGradient(x, y, 0, x, y, r);
          const l = Math.round(rnd(55, 115));
          c.addColorStop(0, `rgba(${l},${l + 6},${l + 22},0.55)`); c.addColorStop(1, 'rgba(0,0,0,0)');
          g.fillStyle = c; g.fillRect(x - r, y - r, r * 2, r * 2);
        }
      });
    }
    function bannerTex(col, glyph) {
      return canvasTex(256, (g, s) => {
        g.fillStyle = col; g.fillRect(0, 0, s, s);
        g.strokeStyle = '#d9b25a'; g.lineWidth = 12; g.strokeRect(14, 6, s - 28, s - 12);
        g.fillStyle = '#e8c46a'; g.font = '150px "Segoe UI Symbol","Apple Symbols",serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
        g.fillText(glyph, s / 2, s / 2 + 6);
      });
    }
    function buildArena() {
      if (arena.scene) return;
      const A = new T.Scene(); arena.scene = A;
      A.background = new T.Color(0x151824);
      A.fog = new T.Fog(0x1c2030, 10, 46);
      A.environment = makeEnv('arena');
      arena.hemi = new T.HemisphereLight(0x8ea4d6, 0x2a221c, 0.55); A.add(arena.hemi);
      const moon = new T.DirectionalLight(0xc4d4ff, 1.35); moon.position.set(-5, 9, 4); moon.castShadow = true;
      moon.shadow.mapSize.set(1024, 1024); Object.assign(moon.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, near: 1, far: 30 });
      moon.shadow.bias = -0.0005; A.add(moon, moon.target); arena.moon = moon;
      const rim = new T.DirectionalLight(0xff9a50, 0.9); rim.position.set(4, 3, -6); A.add(rim);
      const mt = marbleTex(); mt.wrapS = mt.wrapT = T.RepeatWrapping; mt.repeat.set(8, 8); mt.anisotropy = 8;
      const floor = new T.Mesh(new T.PlaneGeometry(64, 64), new T.MeshStandardMaterial({ map: mt, color: 0x96928c, roughness: 0.12, metalness: 0.05, envMapIntensity: 1.4 }));
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; A.add(floor);
      const sky = new T.Mesh(new T.SphereGeometry(90, 32, 16), new T.MeshBasicMaterial({ map: skyTex(), side: T.BackSide, fog: false }));
      sky.position.y = 0; A.add(sky); arena.sky = sky;
      const st = stoneTex(); st.wrapS = st.wrapT = T.RepeatWrapping;
      const stoneMat = new T.MeshStandardMaterial({ map: st, roughness: 0.95, color: 0xc9c2b6 });
      const box = (w, h, d, x, z, ry) => { const g = new T.BoxGeometry(w, h, d); const m = new T.Mesh(g, stoneMat); m.position.set(x, h / 2, z); m.rotation.y = ry || 0; m.castShadow = m.receiveShadow = true; A.add(m); return m; };
      // tường thành đổ nát vòng phía sau: đoạn cao thấp, tháp có răng cưa, lỗ cổng tối
      for (let i = -7; i <= 7; i++) {
        const a = i * 0.16, R0 = 19, x = Math.sin(a) * R0, z = -Math.cos(a) * R0 + 2;
        const h = 2.6 + ((i * 7 + 11) % 5) * 0.8 + (Math.abs(i) % 3 === 0 ? 3.2 : 0);
        box(2.4, h, 1.4, x, z, -a);
        if (Math.abs(i) % 3 === 0) for (let k = -1; k <= 1; k++) box(0.5, 0.6, 1.5, x + Math.cos(a) * k * 0.8, z + Math.sin(a) * k * 0.8, -a).position.y = h + 0.3;
        if (i % 2 === 0) { const hole = new T.Mesh(new T.PlaneGeometry(1.1, 2.0), new T.MeshBasicMaterial({ color: 0x07070a })); hole.position.set(x * 0.95, 1.0, z + 0.72); hole.rotation.y = -a; A.add(hole); }
      }
      for (const sx of [-1, 1]) {        // cột + cờ hai bên: xanh (Trắng) trái, đỏ (Đen) phải — nằm trong khung như hình đích
        box(0.8, 6.8, 0.8, sx * 3.9, -6.2);
        const ban = new T.Mesh(new T.PlaneGeometry(1.3, 3.0), new T.MeshStandardMaterial({ map: bannerTex(sx < 0 ? '#1f3f8f' : '#8f1a24', sx < 0 ? '♔' : '♞'), side: T.DoubleSide, roughness: 0.85, emissive: 0x111111 }));
        ban.position.set(sx * 3.9, 4.4, -5.78); A.add(ban);
      }
      // lò lửa: bệ đá + chậu + lửa (3 lớp sáng cộng) + đèn cam
      const fireMat = c => new T.SpriteMaterial({ map: TEX.glow, color: c, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
      for (const [x, z] of [[-2.9, -2.6], [2.9, -2.6], [-4.6, -7.2], [4.6, -7.2]]) {
        box(0.55, 1.1, 0.55, x, z);
        const bowl = new T.Mesh(new T.CylinderGeometry(0.55, 0.32, 0.35, 18), new T.MeshStandardMaterial({ color: 0x2d2622, metalness: 0.8, roughness: 0.35 }));
        bowl.position.set(x, 1.28, z); A.add(bowl);
        const f1 = new T.Sprite(fireMat(0xff5a14)), f2 = new T.Sprite(fireMat(0xffa030)), f3 = new T.Sprite(fireMat(0xfff0b0));
        for (const f of [f1, f2, f3]) { f.position.set(x, 1.75, z); A.add(f); }
        arena.fires.push({ f1, f2, f3, x, z, ph: rnd(0, 6) });
      }
      for (const sx of [-1, 1]) { const L = new T.PointLight(0xff8a3a, 2.4, 13, 2); L.position.set(sx * 2.9, 2.0, -2.6); A.add(L); arena.fireLights.push(L); }
      // tàn lửa bay lên
      const N = 140, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { pos[i * 3] = rnd(-9, 9); pos[i * 3 + 1] = rnd(0, 7); pos[i * 3 + 2] = rnd(-9, 2); }
      const eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(pos, 3));
      arena.embers = new T.Points(eg, new T.PointsMaterial({ size: 0.07, map: TEX.glow, color: 0xff9a40, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      arena.embers.frustumCulled = false; A.add(arena.embers);
    }
    function stepArena(dt, t) {
      for (const F of arena.fires) {
        const k = 1 + Math.sin(t * 13 + F.ph) * 0.12 + Math.sin(t * 7.3 + F.ph * 2) * 0.1;
        F.f1.scale.set(1.5 * k, 1.9 * k, 1); F.f2.scale.set(1.0 * k, 1.4 * k, 1); F.f3.scale.set(0.5 * k, 0.7 * k, 1);
        F.f2.position.y = 1.7 + Math.sin(t * 9 + F.ph) * 0.04;
      }
      for (const L of arena.fireLights) L.intensity = 2.2 + Math.sin(t * 11 + L.position.x) * 0.35;
      const p = arena.embers.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * (0.5 + (i % 5) * 0.12); if (y > 7) y = 0; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(t + i) * dt * 0.15); }
      p.needsUpdate = true;
      // chớp giông xa
      arena.nextFlash -= dt;
      if (arena.nextFlash <= 0) { arena.flashT = 0.18; arena.nextFlash = rnd(2.2, 5); }
      if (arena.flashT > 0) arena.flashT -= dt;
      const fl = arena.flashT > 0 ? (Math.sin(arena.flashT * 60) > 0 ? 1 : 0.4) : 0;
      arena.hemi.intensity = 0.55 + fl * 0.9;
      arena.sky.material.color.setScalar(1 + fl * 0.7);
    }
    function fighterFrom(src, x) {
      const root = new T.Group(), pivot = new T.Group();
      const obj = warriorTemplate(src.t, src.c).clone(true);
      if (src.t === 'x') obj.add(emojiSprite(src.def, 0.78));
      pivot.add(obj); root.add(pivot);
      root.scale.setScalar(ARENA_K);
      root.position.set(x, TOP, 0); root.rotation.y = x < 0 ? Math.PI / 2 : -Math.PI / 2;
      arena.scene.add(root);
      const f = { root, pivot, model: obj, rig: { armR: obj.getObjectByName('armR') || null, armL: obj.getObjectByName('armL') || null, orb: obj.getObjectByName('orb') || null }, t: src.t, c: src.c, id: src.id, def: src.def, k: ARENA_K };
      arena.fighters.push(f);
      return f;
    }
    function arenaCamPose(cam, side, aspect) {
      // khung như hình đích: máy quay thấp ngang ngực, hai người đánh chiếm ~nửa chiều cao khung
      cam.position.set(0, 1.25, 5.2); cam.up.set(0, 1, 0); cam.lookAt(0, 0.95, 0);
      const roll = side === 'side' ? (orient === 'portrait' ? Math.PI / 2 : 0) : viewerInfo(side).roll;
      cam.rotateZ(roll);
      const rot90 = Math.abs(Math.abs(roll) - Math.PI / 2) < 0.01;
      const effA = rot90 ? 1 / aspect : aspect, d = 5.2;
      const fovH = 2 * Math.atan(1.75 / d), fovW = 2 * Math.atan(1.95 / effA / d);
      cam.fov = Math.max(fovH, fovW) * 180 / Math.PI; cam.aspect = aspect; cam.updateProjectionMatrix();
    }
    function enterArena(cap) {
      arena.scene.add(sparks, fxGrp, flashLight);
      cut.active = true; cut.arena = true; cut.views = []; cut.shake = 0;
      const mk = (side, vp) => { const cam = new T.PerspectiveCamera(40, vp.w / vp.h, 0.1, 220); arenaCamPose(cam, side, vp.w / vp.h); cut.views.push({ cam, vp, to: { pos: cam.position.clone() } }); };
      if (cfg.cutscene === 'split') {
        if (orient === 'portrait') { mk('w', { x: 0, y: 0, w: PX, h: PX / 2 }); mk('b', { x: 0, y: PX / 2, w: PX, h: PX / 2 }); }
        else { mk('w', { x: 0, y: 0, w: PX / 2, h: PX }); mk('b', { x: PX / 2, y: 0, w: PX / 2, h: PX }); }
      } else mk(cfg.cutscene === 'side' ? 'side' : cap, { x: 0, y: 0, w: PX, h: PX });
    }
    function exitArena() {
      for (const f of arena.fighters) arena.scene.remove(f.root);
      arena.fighters = [];
      scene.add(sparks, fxGrp, flashLight);
      cut.active = false; cut.arena = false; cut.views = []; cut.shake = 0;
    }
    /* màn chuyển cảnh: loé sáng vàng trắng phủ khung vẽ */
    const veil = document.createElement('div');
    veil.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;border-radius:10px;background:radial-gradient(circle at 50% 50%, #fff8e6 0%, #ffd27a 38%, #3a1a08 100%);';
    host.appendChild(veil);
    async function veilTo(o, dur) { const o0 = +veil.style.opacity || 0; await tween(dur, k => { veil.style.opacity = String(o0 + (o - o0) * k); }, EASE.lin); }
    setTimeout(() => { try { buildArena(); } catch (e) { /* dựng lúc cần */ } }, 1200);

    /* ---------- vẽ ---------- */
    function render() {
      if (!cut.active) {
        R.setScissorTest(false); R.setViewport(0, 0, PX, PX); R.render(scene, boardCam); return;
      }
      const sh = cut.shake;
      if (cut.views.length > 1) R.setScissorTest(true);
      for (const v of cut.views) {
        const p0 = v.cam.position.clone();
        if (sh > 0) v.cam.position.add(new T.Vector3(rnd(-sh, sh), rnd(-sh, sh), rnd(-sh, sh)));
        R.setViewport(v.vp.x, v.vp.y, v.vp.w, v.vp.h);
        if (cut.views.length > 1) R.setScissor(v.vp.x, v.vp.y, v.vp.w, v.vp.h);
        R.render(cut.arena ? arena.scene : scene, v.cam);
        v.cam.position.copy(p0);
      }
      R.setScissorTest(false);
    }
    let lastT = performance.now(), frames = 0, fpsT = 0, fps = 0;
    const clock = { t: 0 };
    function loop(now) {
      const raw = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      const dt = raw * speed;
      clock.t += raw;
      stepTweens(dt);
      stepFx(dt);
      idle(clock.t);
      if (cut.arena) stepArena(raw, clock.t);
      updateBadges();
      updateIconBadges();
      for (const o of markGrp.children) if (o.userData.pulse) o.material.opacity = 0.6 + 0.35 * Math.sin(clock.t * 5);
      render();
      frames++; fpsT += raw; if (fpsT >= 1) { fps = frames / fpsT; frames = 0; fpsT = 0; }
      requestAnimationFrame(loop);
    }
    function idle(t) {
      for (const m of meshes.values()) {
        if (m.busy) continue;
        if (style === 'warriors') { const k = 1 + Math.sin(t * 2.2 + m.phase) * 0.018; m.model.scale.set(1, k, 1); }
        if (m.rig && m.rig.core) m.rig.core.material.opacity = 0.6 + 0.3 * Math.sin(t * 2 + m.phase);
      }
    }

    /* ---------- diễn: đi quân ---------- */
    const yawTo = (from, to) => Math.atan2(to.x - from.x, to.z - from.z);
    async function turnTo(m, yaw, dur) {
      const y0 = m.root.rotation.y;
      let d = yaw - y0; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2;
      await tween(dur || 0.2, k => { m.root.rotation.y = y0 + d * k; });
    }
    async function slide(m, to, dur, hop) {
      const p0 = m.root.position.clone();
      await tween(dur, k => { m.root.position.lerpVectors(p0, to, k); m.root.position.y = TOP + Math.sin(k * Math.PI) * (hop || 0); });
    }
    async function animMove(id, from, to, castle) {
      const m = meshes.get(id); if (!m) return;
      m.busy = true;
      const dist = sqV(from).distanceTo(sqV(to));
      await slide(m, sqV(to), Math.min(0.5, 0.22 + dist * 0.05), m.t === 'n' ? 0.55 : (castle ? 0.15 : 0.22));
      sfx('move', 0.9); m.busy = false;
    }

    /* ---------- diễn: đòn đánh ---------- */
    async function lean(m, ang, dur, ez) { const a0 = m.pivot.rotation.x; await tween(dur, k => { m.pivot.rotation.x = a0 + (ang - a0) * k; }, ez); }
    async function armSwing(m, a1, dur) { if (!m.rig || !m.rig.armR) return wait(dur); const a0 = m.rig.armR.rotation.x; await tween(dur, k => { m.rig.armR.rotation.x = a0 + (a1 - a0) * k; }); }
    async function shield(m, up, dur) { if (!m.rig || !m.rig.armL) return wait(dur); const a0 = m.rig.armL.rotation.x, a1 = up ? -1.45 : -0.2; await tween(dur, k => { m.rig.armL.rotation.x = a0 + (a1 - a0) * k; }); }
    const contactPt = (A, D) => A.root.position.clone().lerp(D.root.position, 0.5).setY(0.55 * (A.k || 1));
    function hitFx(A, D, heavy) {
      const at = contactPt(A, D);
      const col = style === 'crystal' ? (A.c === 'w' ? 0x7ff4ff : 0xe39bff) : 0xffd27a;
      burst(at, heavy ? 70 : 28, col, heavy ? 1.3 : 0.8);
      flash(at, heavy ? 1.3 : 0.6);
      if (heavy) { cut.shake = 0.06; tween(0.3, k => { cut.shake = 0.06 * (1 - k); }); }
    }
    async function strike(A, D, opt) {       // A ra đòn, D đỡ (opt.block) hoặc trúng (opt.final)
      opt = opt || {};
      const p0 = A.root.position.clone(), dir = D.root.position.clone().sub(p0).setY(0).normalize();
      const K = A.k || 1;                      // đấu trường: chiến binh to gấp K → bước tới, nhảy cao cũng gấp K
      const reach = (opt.final ? 0.26 : 0.18) * K;
      const kind = A.t;
      sfx('whoosh', 0.7, rnd(0.9, 1.15));
      if (kind === 'n') {                      // mã: nhảy lên rồi đá xuống
        await Promise.all([tween(0.22, k => { A.root.position.y = TOP + Math.sin(k * Math.PI / 2) * 0.45 * K; A.root.position.addScaledVector(dir, 0.005 * K); }), lean(A, -0.5, 0.22)]);
        await Promise.all([tween(0.12, k => { A.root.position.y = TOP + (1 - k) * 0.45 * K; }, EASE.in), lean(A, 0.45, 0.12)]);
      } else if (kind === 'q' && (opt.final || opt.magic)) {   // hậu: xoay tròn rồi phóng sét
        sfx('magic', 0.8);
        await tween(0.45, k => { A.root.rotation.y += 0.4; A.root.position.y = TOP + Math.sin(k * Math.PI) * 0.25 * K; });
        await turnTo(A, yawTo(A.root.position, D.root.position), 0.06);
        await bolt(A, D);
      } else if (kind === 'p') {               // tốt: đâm giáo hai nhát nhanh
        await Promise.all([lean(A, -0.25, 0.1), armSwing(A, -1.6, 0.1)]);
        for (let i = 0; i < 2; i++) {
          await Promise.all([tween(0.07, k => { A.root.position.copy(p0).addScaledVector(dir, reach * k); }), lean(A, 0.35, 0.07), armSwing(A, 0.2, 0.07)]);
          if (i === 0 && !opt.final) { hitFx(A, D, false); sfx(opt.block ? 'clash' : 'punch', 0.7); }
          await tween(0.07, k => { A.root.position.copy(p0).addScaledVector(dir, reach * (1 - k * 0.6)); });
        }
      } else {                                  // còn lại: lấy đà rồi lao vào
        await Promise.all([lean(A, -0.32, 0.14), armSwing(A, -2.3, 0.14)]);
        await Promise.all([tween(0.11, k => { A.root.position.copy(p0).addScaledVector(dir, reach * k); }, EASE.in), lean(A, 0.42, 0.11), armSwing(A, 0.35, 0.11)]);
      }
      if (opt.block) {
        await shield(D, true, 0.04);
        hitFx(A, D, false); sfx(Math.random() < 0.5 ? 'clash' : 'clash2', 0.85, rnd(0.9, 1.1));
        await Promise.all([lean(D, -0.22, 0.08), tween(0.08, () => {})]);
      } else if (opt.final) {
        hitFx(A, D, true); sfx(style === 'warriors' ? 'heavy' : (style === 'crystal' ? 'zap' : 'heavy'), 1);
      }
      const pNow = A.root.position.clone();
      await Promise.all([tween(0.16, k => { A.root.position.lerpVectors(pNow, p0, k); A.root.position.y = TOP; }), lean(A, 0, 0.16), armSwing(A, -0.35, 0.16), opt.block ? Promise.all([lean(D, 0, 0.16), shield(D, false, 0.16)]) : Promise.resolve()]);
    }
    async function bolt(A, D) {
      const BK = A.k || 1;
      const a = A.root.position.clone(); a.y = (HEIGHT[A.t] || 1) * 0.85 * BK;
      const d = D.root.position.clone(); d.y = 0.5 * BK;
      const col = A.c === 'w' ? 0x8fe8ff : 0xffa3c8;
      const mat = new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(2), toneMapped: false, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
      let tube = null;
      sfx('zap', 0.9);
      for (let i = 0; i < 4; i++) {
        if (tube) fxGrp.remove(tube);
        const pts = [];
        for (let j = 0; j <= 8; j++) { const p = a.clone().lerp(d, j / 8); if (j > 0 && j < 8) p.add(new T.Vector3(rnd(-0.12, 0.12), rnd(-0.12, 0.12), rnd(-0.12, 0.12)).multiplyScalar(BK)); pts.push(p); }
        tube = new T.Mesh(new T.TubeGeometry(new T.CatmullRomCurve3(pts), 24, 0.025 * BK, 6, false), mat);
        fxGrp.add(tube);
        burst(d, 10, col, 0.6);
        await wait(0.07);
      }
      fxGrp.remove(tube);
    }
    async function exchange(A, D) {          // một hiệp: A đánh – D đỡ, D đánh trả – A đỡ
      await strike(A, D, { block: true });
      await strike(D, A, { block: true });
    }

    /* ---------- diễn: xúc xắc ---------- */
    function makeDie(side, k) {
      const mats = [3, 4, 1, 6, 2, 5].map(v => new T.MeshStandardMaterial({ map: TEX.dice[side][v], roughness: 0.35 }));
      const d = new T.Mesh(new T.BoxGeometry(0.3, 0.3, 0.3), mats); d.castShadow = true;
      d.scale.setScalar(k || 1); d.userData.k = k || 1;
      fxGrp.add(d); return d;
    }
    const FACE = { 1: [0, 0, 0], 6: [Math.PI, 0, 0], 2: [-Math.PI / 2, 0, 0], 5: [Math.PI / 2, 0, 0], 3: [0, 0, Math.PI / 2], 4: [0, 0, -Math.PI / 2] };
    const DICE_DUR = 1.45;     // Nam 11-21: "dice xoay lâu hơn 1 chút" (bản cũ 0,75 giây — mà còn bị tua ×4 vì lỗi cú chạm)
    async function rollDie(die, from, to, v) {
      sfx('dice', 0.8);
      const e = FACE[v], yaw = rnd(0, Math.PI * 2);
      const spin = new T.Vector3(rnd(7, 11), rnd(5, 9), rnd(7, 11));
      let lastK = 0;
      const dk = die.userData.k || 1;
      await tween(DICE_DUR, k => {
        const dts = (k - lastK) * DICE_DUR; lastK = k;
        die.position.lerpVectors(from, to, EASE.out(k));
        die.position.y = TOP + 0.15 * dk + Math.abs(Math.sin(k * Math.PI * 3.2)) * 0.8 * dk * Math.pow(1 - k, 1.3);
        if (k < 0.84) { const f = 1.4 * (1 - k * 0.7); die.rotation.x += spin.x * dts * f; die.rotation.y += spin.y * dts * f; die.rotation.z += spin.z * dts * f; }
        else { const q = (k - 0.84) / 0.16; die.rotation.set(die.rotation.x + (e[0] - die.rotation.x) * q, yaw, die.rotation.z + (e[2] - die.rotation.z) * q); }
      }, EASE.lin);
      die.rotation.set(e[0], 0, e[2]); die.rotateOnWorldAxis(new T.Vector3(0, 1, 0), yaw);
      die.position.y = TOP + 0.15;
      sfx('land', 0.8);
    }

    /* ---------- diễn: chết ---------- */
    async function die(M, attackerPos, deathType) {
      M.busy = true;
      const pos = M.root.position.clone();
      if (deathType === 'shatter') {
        sfx(style === 'crystal' ? 'glass' : (style === 'warriors' ? 'poof' : 'woodbrk'), 1);
        const meshesIn = []; M.root.traverse(o => { if (o.isMesh && o.material && !o.material.isShaderMaterial) meshesIn.push(o); });
        const mat = (meshesIn[0] && meshesIn[0].material) || new T.MeshStandardMaterial({ color: 0xcccccc });
        const MK = M.k || 1, h = (HEIGHT[M.t] || 1) * MK;
        M.root.visible = false;
        for (let i = 0; i < 46; i++) {
          const src = meshesIn[(Math.random() * meshesIn.length) | 0];
          const m2 = src ? src.material : mat;
          const sm = Array.isArray(m2) ? m2[0] : m2;
          let fm;
          if (sm.vertexColors) {          // chiến binh gộp màu theo đỉnh → mảnh vỡ lấy màu áo / da / viền của đúng bên
            const P = WPAL[M.c], pal = [P.cloth, P.cloth, P.cloth2, P.skin, P.trim, P.metal];
            fm = new T.MeshStandardMaterial({ color: pal[(Math.random() * pal.length) | 0], roughness: 0.5 });
          } else fm = sm.clone();
          fm.transparent = true;
          const o = new T.Mesh(new T.TetrahedronGeometry(rnd(0.035, 0.08) * MK), fm); o.castShadow = true;
          const a = rnd(0, Math.PI * 2), r = rnd(0, 0.22) * MK;
          o.position.set(pos.x + Math.cos(a) * r, rnd(0.05, h), pos.z + Math.sin(a) * r);
          const out = new T.Vector3(Math.cos(a), 0, Math.sin(a));
          const away = pos.clone().sub(attackerPos).setY(0).normalize();
          addDebris(o, out.multiplyScalar(rnd(0.6, 1.8)).add(away.multiplyScalar(rnd(0.8, 2))).setY(rnd(1.2, 3.2)), new T.Vector3(rnd(-9, 9), rnd(-9, 9), rnd(-9, 9)), rnd(1.4, 2.0));
        }
        burst(pos.clone().setY(0.5 * MK), 40, style === 'crystal' ? 0xbff8ff : 0xffe2a0, 1.1 * MK);
        await wait(1.2);
      } else if (deathType === 'topple') {
        const away = pos.clone().sub(attackerPos).setY(0).normalize();
        const axis = new T.Vector3(away.z, 0, -away.x);
        const q0 = M.root.quaternion.clone();
        await tween(0.42, k => {
          M.root.quaternion.copy(q0); M.root.rotateOnWorldAxis(axis, k * Math.PI / 2 * 0.98);
          M.root.position.copy(pos).addScaledVector(away, k * 0.08);
        }, EASE.in);
        sfx('fall', 0.9);
        await tween(0.14, k => { M.root.position.y = TOP + Math.sin(k * Math.PI) * 0.06; });
        sfx('dizzy', 0.8);
        const SK = M.k || 1, stars = [];
        for (let i = 0; i < 5; i++) { const s = new T.Sprite(new T.SpriteMaterial({ map: TEX.star, transparent: true, depthWrite: false })); s.scale.set(0.16 * SK, 0.16 * SK, 1); fxGrp.add(s); stars.push(s); }
        const c = M.root.position.clone(); c.y = 0.42 * SK;
        await tween(1.1, k => { stars.forEach((s, i) => { const a = k * 9 + i * Math.PI * 2 / 5; s.position.set(c.x + Math.cos(a) * 0.25 * SK, c.y + Math.sin(k * 20 + i) * 0.03 * SK, c.z + Math.sin(a) * 0.25 * SK); }); }, EASE.lin);
        stars.forEach(s => fxGrp.remove(s));
        sfx('poof', 0.9);
        const puff = new T.Sprite(new T.SpriteMaterial({ map: TEX.smoke, transparent: true, depthWrite: false })); puff.position.copy(c); fxGrp.add(puff);
        const s0 = M.root.scale.clone();
        await tween(0.5, k => { puff.scale.setScalar((0.4 + k * 1.3) * SK); puff.material.opacity = 1 - k * 0.9; M.root.scale.copy(s0).multiplyScalar(Math.max(0.001, 1 - k * 1.6)); }, EASE.out);
        fxGrp.remove(puff); M.root.visible = false;
      } else {                                  // 'bow' — cúi chào rồi bay về hộp
        const yaw0 = M.root.rotation.y;
        await turnTo(M, yawTo(pos, attackerPos), 0.15);
        for (let i = 0; i < 2; i++) { await lean(M, 0.42, 0.18); await lean(M, 0, 0.16); }
        sfx('fly', 0.8);
        const boxX = (M.c === 'w' ? 1 : -1) * 5.4, boxZ = (M.c === 'w' ? 1 : -1) * 3.6;
        const p0 = M.root.position.clone(), p1 = new T.Vector3(boxX, 0.4, boxZ);
        await tween(0.9, k => {
          M.root.position.lerpVectors(p0, p1, k); M.root.position.y = TOP + Math.sin(k * Math.PI) * 1.6 + k * 0.4;
          M.root.scale.setScalar(1 - k * 0.55); M.root.rotation.y = yaw0 + k * Math.PI * 2;
          if (Math.random() < 0.6) burst(M.root.position.clone().setY(M.root.position.y + 0.4), 2, 0xfff1a8, 0.3);
        }, EASE.io);
        M.root.visible = false;
      }
      M.busy = false;
    }
    async function hurt(M) {                   // trúng đòn nhưng còn mạng
      sfx('punch', 0.9);
      const heart = new T.Sprite(new T.SpriteMaterial({ map: TEX.heart, transparent: true, depthWrite: false })); fxGrp.add(heart);
      const HK = M.k || 1, p = M.root.position.clone(); heart.scale.set(0.3 * HK, 0.3 * HK, 1);
      await Promise.all([lean(M, -0.4, 0.12), tween(0.9, k => { heart.position.set(p.x, (1.1 + k * 0.6) * HK, p.z); heart.material.opacity = 1 - k; })]);
      await lean(M, 0, 0.2);
      fxGrp.remove(heart);
    }

    /* ---------- ĐẠO DIỄN CẢNH ĐÁNH NHAU ---------- */
    let cfg = { death: 'topple', battleLen: 'long', cutscene: 'toward', fight: 'arena' };
    function exchangesFor(at, dt) {
      if (cfg.battleLen === 'short') return 1;
      let n = { p: 1, n: 2, b: 2, r: 2, q: 3, k: 3 }[dt] || 1;
      if ((VAL[dt] || 1) > (VAL[at] || 1)) n += 1;
      return Math.min(4, n);
    }
    async function runBattle(b, follow, Sb, hooks) {
      hooks = hooks || {};
      const A0 = meshes.get(b.a), D0 = meshes.get(b.d);
      if (!A0 || !D0) return;
      A0.busy = D0.busy = true;
      // cut-screen sang đấu trường riêng (mặc định, Nam 11-21) — hoặc kiểu cũ: sà máy quay xuống ngay trên bàn
      const inArena = cfg.fight !== 'board' || style === 'flat';
      let A = A0, D = D0, stage, pd, mid, dir;
      const pa = A0.root.position.clone();
      if (inArena) {
        buildArena();
        await veilTo(1, 0.22);
        A = fighterFrom(A0, -0.85); D = fighterFrom(D0, 0.85);
        enterArena(A0.c);
        stage = A.root.position.clone(); pd = D.root.position.clone();
        dir = pd.clone().sub(stage).setY(0).normalize(); mid = stage.clone().lerp(pd, 0.5);
        await veilTo(0, 0.3);
        sfx('whoosh', 0.5);
        await Promise.all([lean(A, -0.16, 0.22), lean(D, -0.16, 0.22)]);
        await Promise.all([lean(A, 0, 0.18), lean(D, 0, 0.18)]);
      } else {
        cut.active = true;
        pd = D.root.position.clone();
        dir = pd.clone().sub(pa).setY(0).normalize();
        stage = pd.clone().addScaledVector(dir, -0.7); stage.y = TOP;
        mid = stage.clone().lerp(pd, 0.5);
        setupCut(cfg.cutscene, mid, dir, A.c);
        const yawA = yawTo(stage, pd), yawD = yawTo(pd, stage);
        await Promise.all([tween(0.6, k => applyCutBlend(k)), slide(A, stage, 0.55, 0.2), turnTo(A, yawA, 0.5), turnTo(D, yawD, 0.5)]);
      }
      const K = A.k || 1;
      let winner = b.winner === 'a' ? A : D, loser = b.winner === 'a' ? D : A;
      if (b.mode === 'dice') {
        const dA = makeDie(A.c, K), dD = makeDie(D.c, K);
        // xúc xắc rơi PHÍA TRƯỚC mỗi con (về phía máy quay) — bản đầu rơi sau lưng quân, ảnh chụp bắt được
        const camP = cut.views[0].to.pos, camDir = camP.clone().sub(mid).setY(0).normalize();
        const landA = stage.clone().addScaledVector(camDir, 0.62 * K).addScaledVector(dir, -0.12 * K);
        const landD = pd.clone().addScaledVector(camDir, 0.62 * K).addScaledVector(dir, 0.12 * K);
        dA.visible = dD.visible = false;
        await strike(A, D, { block: true });
        const rolls = b.rolls && b.rolls.length ? b.rolls : [[2, 1]];
        for (let i = 0; i < rolls.length; i++) {
          const [va, vd] = rolls[i];
          dA.visible = true;
          await rollDie(dA, stage.clone().setY(0.9 * K), landA, va);
          hooks.dice && hooks.dice(A.c, va, null);
          await Promise.all([shield(D, true, 0.15), lean(D, -0.15, 0.15)]);
          dD.visible = true;
          await rollDie(dD, pd.clone().setY(0.9 * K), landD, vd);
          hooks.dice && hooks.dice(D.c, vd, null);
          await Promise.all([shield(D, false, 0.15), lean(D, 0, 0.15)]);
          if (va === vd) { sfx('select', 0.7); await wait(0.45); dA.visible = dD.visible = false; hooks.dice && hooks.dice(null, 0, 'tie'); }
        }
        const last = rolls[rolls.length - 1];
        hooks.dice && hooks.dice(b.winner === 'a' ? A.c : D.c, Math.max(last[0], last[1]), 'win');
        const wd = b.winner === 'a' ? dA : dD;
        const gl = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: 0xffe066, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
        gl.position.copy(wd.position); fxGrp.add(gl);
        sfx('check', 0.6);
        await tween(0.6, k => gl.scale.setScalar(0.6 + Math.sin(k * Math.PI) * 0.6));
        fxGrp.remove(gl);
        const n = 2 + (Math.random() < 0.5 ? 1 : 0);
        for (let i = 0; i < n; i++) await (i % 2 ? strike(D, A, { block: true }) : strike(A, D, { block: true }));
        fxGrp.remove(dA); fxGrp.remove(dD);
      } else {
        const n = exchangesFor(A.t, D.t);
        for (let i = 0; i < n; i++) await exchange(A, D);
      }
      // đòn kết
      await strike(winner, loser, { final: true, magic: true });
      const dieEv = follow.find(e => e.type === 'die');
      const hitEv = follow.find(e => e.type === 'hit');
      const bounceEv = follow.find(e => e.type === 'bounce');
      if (dieEv) await die(dieEv.id === A.id ? A : D, (dieEv.id === A.id ? D : A).root.position.clone(), cfg.death);
      else if (hitEv) await hurt(hitEv.id === A.id ? A : D);
      else if (bounceEv) { sfx('punch', 0.8); await lean(A, -0.5, 0.15); await lean(A, 0, 0.2); }
      if (inArena) {                 // về lại bàn cờ: con chết biến mất, con thắng vào ô
        await wait(0.35);
        await veilTo(1, 0.2);
        exitArena();
        if (dieEv) (dieEv.id === A0.id ? A0 : D0).root.visible = false;
        await veilTo(0, 0.3);
        const mvA = follow.find(e => e.type === 'move' && e.id === A0.id);
        if (!(dieEv && dieEv.id === A0.id) && mvA) await slide(A0, sqV(mvA.to), 0.35, 0.15);
        A0.busy = D0.busy = false;
        speed = 1;
        return;
      }
      // con tấn công vào ô hoặc về chỗ cũ
      const mv = follow.find(e => e.type === 'move' && e.id === A.id);
      const aliveA = !(dieEv && dieEv.id === A.id);
      if (aliveA) {
        if (mv) await slide(A, sqV(mv.to), 0.35, 0.15);
        else await slide(A, pa, 0.4, 0.2);
        await turnTo(A, facing(A.c), 0.2);
      }
      if (D.root.visible) await turnTo(D, facing(D.c), 0.2);
      await tween(0.5, k => applyCutBlend(1 - k));
      cut.active = false; cut.views = [];
      A.busy = D.busy = false;
      speed = 1;
    }

    /* ---------- diễn nguyên một lượt (danh sách sự kiện của chess_core.play) ---------- */
    let playing = false;
    async function play(ev, Sb, Sa, hooks) {
      playing = true;
      try {
        for (let i = 0; i < ev.length; i++) {
          const e = ev[i];
          if (e.type === 'battle') {
            const follow = [];
            let j = i + 1;
            while (j < ev.length && ['die', 'hit', 'bounce', 'move'].indexOf(ev[j].type) >= 0 && !(ev[j].type === 'move' && ev[j].castle)) { follow.push(ev[j]); j++; }
            await runBattle(e, follow, Sb, hooks);
            i = j - 1;
          } else if (e.type === 'move') {
            await animMove(e.id, e.from, e.to, e.castle);
          } else if (e.type === 'promote') {
            sfx('magic', 0.9); const m = meshes.get(e.id);
            if (m) { burst(m.root.position.clone().setY(0.6), 60, 0xfff1a8, 1); await tween(0.3, k => m.root.scale.setScalar(1 - k * 0.6)); }
            sync(Sa);
            const m2 = meshes.get(e.id); if (m2) { m2.root.scale.setScalar(0.4); await tween(0.35, k => m2.root.scale.setScalar(0.4 + 0.6 * k), EASE.back); }
          } else if (e.type === 'swap') {
            const A = meshes.get(e.a), B = meshes.get(e.b);
            if (A && B) {
              sfx('magic', 0.8);
              const pa = sqV(e.from), pb = sqV(e.to);
              await Promise.all([slide(A, pb, 0.6, 0.9), slide(B, pa, 0.6, 0.5)]);
              burst(pa.clone().setY(0.5), 25, 0x9fd0ff, 0.6); burst(pb.clone().setY(0.5), 25, 0x9fd0ff, 0.6);
            }
          } else if (e.type === 'revive') {
            sync(Sa);
            const m = meshes.get(e.id);
            if (m) { sfx('magic', 1); m.root.position.y = -0.9; burst(sqV(e.to, 0.4), 50, 0xb8ffb0, 1); await tween(0.6, k => { m.root.position.y = -0.9 + 0.92 * k; }, EASE.back); }
          }
        }
      } finally {
        endSkip();
        sync(Sa);
        playing = false;
        speed = 1;
      }
    }
    /* chạm màn hình lúc đang diễn → bỏ qua cả cảnh đánh + xúc xắc (Nam 11-21) */
    function skip() {
      if (!playing || skipping) return;
      skipping = true;
      finishAllTweens();
    }
    function endSkip() {
      if (!skipping) return;
      skipping = false;
      spList.length = 0;
      for (const d of debris.splice(0, debris.length)) fxGrp.remove(d.o);
      flashLight.intensity = 0;
    }

    /* ---------- chạm để chọn ô ---------- */
    const ray = new T.Raycaster(), plane = new T.Plane(new T.Vector3(0, 1, 0), -TOP), hit = new T.Vector3();
    function pick(clientX, clientY) {
      const r = canvas.getBoundingClientRect();
      const nd = new T.Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
      ray.setFromCamera(nd, boardCam);
      if (isTilt()) {        // bàn nghiêng: thân quân che ô phía sau → chạm trúng THÂN quân thì lấy ô của quân đó
        for (const h of ray.intersectObjects(pieceGrp.children, true)) {
          let o = h.object; while (o && o.parent !== pieceGrp) o = o.parent;
          if (!o || !o.visible) continue;
          const f = Math.floor(o.position.x + 4), rr = Math.floor(4 - o.position.z);
          if (f >= 0 && f < 8 && rr >= 0 && rr < 8) return rr * 8 + f;
        }
      }
      if (!ray.ray.intersectPlane(plane, hit)) return -1;
      const f = Math.floor(hit.x + 4), rr = Math.floor(4 - hit.z);
      if (f < 0 || f > 7 || rr < 0 || rr > 7) return -1;
      return rr * 8 + f;
    }

    /* ---------- trận thử (nút ⚙ — chỉ có trong mẫu) ---------- */
    async function demo(ta, td, mode, hooks) {
      if (playing) return;
      const sa = 27, sd = 36;                  // d4 đánh e5
      const hidden = [];
      for (const m of meshes.values()) { const p = m.root.position; for (const s of [sa, sd]) if (Math.abs(p.x - sqX(s)) < 0.1 && Math.abs(p.z - sqZ(s)) < 0.1 && m.root.visible) { m.root.visible = false; hidden.push(m); } }
      const A = makePiece({ id: -1, t: ta, c: 'w' }), D = makePiece({ id: -2, t: td, c: 'b' });
      A.root.position.copy(sqV(sa)); D.root.position.copy(sqV(sd));
      const win = Math.random() < 0.6 ? 'a' : 'd';
      let rolls = [];
      if (mode === 'dice') {
        const a = 1 + ((Math.random() * 6) | 0); let d = 1 + ((Math.random() * 6) | 0);
        if (Math.random() < 0.25) rolls.push([a, a]);
        if (d === a) d = a === 6 ? 5 : a + 1;
        rolls.push(win === 'a' ? [Math.max(a, d), Math.min(a, d)] : [Math.min(a, d), Math.max(a, d)]);
      }
      playing = true;
      try {
        await runBattle({ a: -1, d: -2, mode, rolls, winner: win, from: sa, at: sd, to: sd },
          win === 'a' ? [{ type: 'die', id: -2 }, { type: 'move', id: -1, from: sa, to: sd }] : [{ type: 'die', id: -1 }], null, hooks);
        await wait(0.3);
      } finally {
        endSkip();
        removePiece(-1); removePiece(-2);
        for (const m of hidden) m.root.visible = true;
        playing = false;
      }
    }

    function screenOf(sq) {           // toạ độ màn hình của tâm một ô (cho bộ thử bấm chuột thật)
      const v = sqV(sq).project(boardCam), r = canvas.getBoundingClientRect();
      return { x: r.left + (v.x + 1) / 2 * r.width, y: r.top + (1 - v.y) / 2 * r.height };
    }
    setStyle('classic');
    requestAnimationFrame(loop);
    return {
      canvas, sync, setStyle, get style() { return style; }, setMarks, pick, play, demo, screenOf,
      get marks() { return JSON.parse(JSON.stringify(marks)); }, get speed() { return speed; },
      setCfg(c) { if (c.view) setView(c.view); const rest = Object.assign({}, c); delete rest.view; Object.assign(cfg, rest); },
      get cfg() { return Object.assign({ view: viewMode }, cfg); },
      setOrientation(o) { if (o !== orient) { orient = o; placeBoardCam(); refreshIconBadges(); } }, get orientation() { return orient; },
      get iconsLoaded() { return ICON._ok || 0; }, get inArena() { return !!cut.arena; },
      fastForward() { if (playing) speed = 4; }, skip, get skipping() { return skipping; }, get playing() { return playing; },
      setBadges(on) { badgesOn = on; refreshBadges(lastState); },
      get fps() { return fps; },
      debug: { meshes, scene, renderer: R, boardCam, cut, tweens, arena, wallGrp, iconBadgeGrp }
    };
  }

  window.ChessView = { create, HEIGHT };
}());
