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
      fragmentShader: 'uniform vec3 col; uniform float k; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(max(0.0, 1.0-abs(dot(vN,vV))), 2.2); gl_FragColor = vec4(col*f*1.6*k, f*k); }',
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
    // mỗi lần đặt máy quay = 1 lượt mới; cú xoay của lượt CŨ đang chạy dở thì thôi kéo máy quay. 11-24: đổi kiểu bàn / xoay iPad giữa lúc
    // máy quay đang xoay theo lượt (0,95 giây) → máy quay được đặt ngay về chỗ mới rồi bị cú xoay cũ kéo về góc nghiêng (bàn phẳng bị nhìn
    // nghiêng, cú chạm lúc đó tính sai ô). Phép thử: test_mau "đổi sang bàn phẳng giữa lúc máy quay đang xoay".
    let camGen = 0;
    function placeBoardCam(animate) {
      const to = camPose(), gen = ++camGen;
      if (!animate) { boardCam.position.copy(to.pos); boardCam.quaternion.copy(to.quat); boardCam.fov = to.fov; boardCam.updateProjectionMatrix(); return; }
      const p0 = boardCam.position.clone(), q0 = boardCam.quaternion.clone(), f0 = boardCam.fov;
      // xoay vòng qua phía trên bàn (đi thẳng qua giữa sẽ chui xuống mặt bàn)
      tween(0.95, k => {
        if (gen !== camGen) return;
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
    /* ảnh GPT vẽ cho đấu trường (assets/arena_tex.js): phông 360° lâu đài + trời giông, cẩm thạch trắng/đen */
    const AT = window.ARENA_TEX || null;
    const texLoader = new T.TextureLoader();
    function marbleChecker() {          // 2×2 ô cẩm thạch (trắng/đen) + chỉ vàng mảnh giữa các ô → lặp khắp sàn
      const cv = document.createElement('canvas'); cv.width = cv.height = 1024;
      const t = new T.CanvasTexture(cv); t.encoding = T.sRGBEncoding; t.wrapS = t.wrapT = T.RepeatWrapping; t.anisotropy = 8;
      const iw = new Image(), ib = new Image(); let n = 0;
      const draw = () => {
        if (++n < 2) return;
        const g = cv.getContext('2d'), q = 512;
        for (let r = 0; r < 2; r++) for (let f = 0; f < 2; f++) g.drawImage((r + f) % 2 ? ib : iw, f * q, r * q, q, q);
        g.fillStyle = '#c99a3e';                 // chỉ vàng: mỗi mép 3px → ghép 2 ô thành vạch 6px
        for (const p of [0, q - 3, q, 1024 - 3]) { g.fillRect(p, 0, 3, 1024); g.fillRect(0, p, 1024, 3); }
        t.needsUpdate = true;
      };
      iw.onload = draw; ib.onload = draw; iw.src = AT.marbleW; ib.src = AT.marbleB;
      return t;
    }
    /* sàn GƯƠNG: vẽ đấu trường lần nữa từ máy quay soi qua mặt sàn vào 1 tấm ảnh nhỏ, rồi cộng vào màu sàn */
    const mirror = { rt: null, cam: new T.PerspectiveCamera(), mat: new T.Matrix4(), uni: null, clip: [new T.Plane(new T.Vector3(0, 1, 0), 0)] };
    function setupMirror(floorMat) {
      mirror.rt = new T.WebGLRenderTarget(640, 640, { type: R.capabilities.isWebGL2 ? T.HalfFloatType : T.UnsignedByteType });
      mirror.uni = { tReflect: { value: mirror.rt.texture }, uReflMat: { value: mirror.mat }, uReflK: { value: 0 } };
      floorMat.onBeforeCompile = sh => {
        Object.assign(sh.uniforms, mirror.uni);
        sh.vertexShader = 'uniform mat4 uReflMat; varying vec4 vReflUv;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n  vReflUv = uReflMat * modelMatrix * vec4(transformed, 1.0);');
        sh.fragmentShader = 'uniform sampler2D tReflect; uniform float uReflK; varying vec4 vReflUv;\n' + sh.fragmentShader.replace('#include <output_fragment>', [
          '#include <output_fragment>',
          '  vec2 ruv = vReflUv.xy / vReflUv.w;',
          '  vec3 refl = texture2D(tReflect, ruv).rgb * 0.36 + (texture2D(tReflect, ruv + vec2(0.0018, 0.0)).rgb + texture2D(tReflect, ruv - vec2(0.0018, 0.0)).rgb',
          '            + texture2D(tReflect, ruv + vec2(0.0, 0.003)).rgb + texture2D(tReflect, ruv - vec2(0.0, 0.003)).rgb) * 0.16;',
          '  refl = mix(vec3(dot(refl, vec3(0.2126, 0.7152, 0.0722))), refl, 0.6);',   // bớt rực (đo: sàn rực 33% vs đích 16%)
          '  gl_FragColor.rgb += refl * uReflK;'].join('\n'));
      };
    }
    function updateMirror(cam) {
      if (!mirror.rt || !arena.floor) return;
      cam.updateMatrixWorld();
      const p = new T.Vector3().setFromMatrixPosition(cam.matrixWorld);
      const q = new T.Quaternion(); cam.getWorldQuaternion(q);
      const fwd = new T.Vector3(0, 0, -1).applyQuaternion(q), up = new T.Vector3(0, 1, 0).applyQuaternion(q);
      const mc = mirror.cam;
      mc.position.set(p.x, -p.y, p.z); mc.up.set(up.x, -up.y, up.z);
      mc.lookAt(p.x + fwd.x, -(p.y + fwd.y), p.z + fwd.z);
      mc.fov = cam.fov; mc.aspect = cam.aspect; mc.near = cam.near; mc.far = cam.far; mc.updateProjectionMatrix(); mc.updateMatrixWorld();
      mirror.mat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1).multiply(mc.projectionMatrix).multiply(mc.matrixWorldInverse);
      arena.floor.visible = false;
      const au = R.shadowMap.autoUpdate; R.shadowMap.autoUpdate = false;
      const cp = R.clippingPlanes; R.clippingPlanes = mirror.clip;      // bỏ phần nằm dưới mặt sàn (đáy phông)
      R.setRenderTarget(mirror.rt); R.clear(); R.render(arena.scene, mc); R.setRenderTarget(null);
      R.clippingPlanes = cp; R.shadowMap.autoUpdate = au;
      arena.floor.visible = true;
      mirror.uni.uReflK.value = 0.55;
    }
    /* hậu kỳ đấu trường (học từ Star Finder gfx.js): ảnh HDR → loá sáng → lượt cuối (phơi sáng, viền tối, ACES, gamma) */
    const FinalShader = {
      uniforms: { tDiffuse: { value: null }, uExposure: { value: 1.12 }, uFlash: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse; uniform float uExposure, uFlash; varying vec2 vUv;',
        'vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }',
        'void main(){',
        '  vec3 c = texture2D(tDiffuse, vUv).rgb * uExposure * (1.0 + uFlash * 0.15);',
        '  vec2 q = vUv - 0.5; float vig = smoothstep(0.9, 0.28, length(q * vec2(1.0, 1.08)));',
        '  c *= mix(0.55, 1.0, vig);',
        '  c = aces(c);',
        '  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'].join('\n')
    };
    const PP = { composer: null, rpass: null, bloom: null, final: null };
    function setupComposer() {
      if (PP.composer || !T.EffectComposer || !T.UnrealBloomPass || !R.capabilities.isWebGL2) return;
      const rt = new T.WebGLRenderTarget(PX, PX, { type: T.HalfFloatType, samples: 4 });
      PP.composer = new T.EffectComposer(R, rt);
      PP.rpass = new T.RenderPass(arena.scene, new T.PerspectiveCamera());
      PP.composer.addPass(PP.rpass);
      PP.bloom = new T.UnrealBloomPass(new T.Vector2(PX / 2, PX / 2), 0.6, 0.55, 0.9);
      PP.composer.addPass(PP.bloom);
      PP.final = new T.ShaderPass(FinalShader); PP.composer.addPass(PP.final);
      PP.composer.setSize(PX, PX);
    }
    /* bản đồ phản chiếu cho giáp: chính phông lâu đài (sáng thêm) + mảng trời lạnh trên đầu + lửa ấm hai bên */
    function arenaEnvFrom(pano) {
      const s = new T.Scene();
      s.add(new T.Mesh(new T.SphereGeometry(10, 48, 24), new T.MeshBasicMaterial({ map: pano, side: T.BackSide, color: new T.Color(1.7, 1.7, 1.8) })));
      const panel = (w, h, x, y, z, col, k) => { const m = new T.Mesh(new T.PlaneGeometry(w, h), new T.MeshBasicMaterial({ color: new T.Color(col).multiplyScalar(k), side: T.DoubleSide })); m.position.set(x, y, z); m.lookAt(0, 0, 0); s.add(m); };
      panel(11, 4, -3, 8.5, 2, 0xc8d8ff, 2.6);
      panel(4, 3, -8.5, 1.5, -1, 0xff9a4a, 2.6); panel(4, 3, 8.5, 1.5, -1, 0xff9a4a, 2.6);
      panel(9, 3, 0, 3, 9, 0x9aaedc, 1.2);
      panel(14, 14, 0, -6, 0, 0x262a34, 1.0);
      return pm.fromScene(s, 0.02).texture;
    }
    function buildArena() {
      if (arena.scene) return;
      const A = new T.Scene(); arena.scene = A;
      A.background = new T.Color(0x121722);
      A.fog = new T.Fog(0x1a2130, 9, 40);
      A.environment = makeEnv('arena');
      arena.hemi = new T.HemisphereLight(0x8094c8, 0x1c1612, 0.4); A.add(arena.hemi);
      // đèn chính lạnh từ trên trái (như ánh chớp trong hình đích) — đổ bóng
      const moon = new T.DirectionalLight(0xd4e2ff, 2.1); moon.position.set(-4, 9, 6); moon.castShadow = true;
      moon.shadow.mapSize.set(1024, 1024); Object.assign(moon.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 30 });
      moon.shadow.bias = -0.0005; moon.shadow.normalBias = 0.02; A.add(moon, moon.target); arena.moon = moon;
      const rim = new T.DirectionalLight(0xff9a50, 1.5); rim.position.set(5, 3, -5); A.add(rim);           // viền ấm phải-sau
      const rimC = new T.DirectionalLight(0x9fc0ff, 1.1); rimC.position.set(-5, 4, -6); A.add(rimC);      // viền lạnh trái-sau
      // sàn cẩm thạch bóng có phản chiếu
      const floorMat = new T.MeshStandardMaterial({ color: 0x5e5e64, roughness: 0.15, metalness: 0.0, envMapIntensity: 0.55 });
      // lệch nửa ô: ô ngay trước máy quay là ô ĐEN như hình đích (đo: ô trắng ở đó sáng 172 vs đích 110)
      if (AT) { const mt = marbleChecker(); mt.repeat.set(18.8, 18.8); mt.offset.set(0.5, 0); floorMat.map = mt; }
      const floor = new T.Mesh(new T.PlaneGeometry(64, 64), floorMat);
      floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; A.add(floor); arena.floor = floor;
      setupMirror(floorMat);
      // phông lâu đài cong quanh phía sau (90°), đặt quanh máy quay
      if (AT) {
        const pano = texLoader.load(AT.pano, t => { A.environment = arenaEnvFrom(t); arena.envReady = true; }, undefined, () => { arena.envReady = true; });
        pano.encoding = T.sRGBEncoding; pano.wrapS = T.RepeatWrapping; pano.repeat.x = -1;   // nhìn từ bên trong → lật ngang cho cờ xanh nằm bên trái
        const ARC = Math.PI * 0.5, RB = 34, H0 = -11.5, H1 = 21.5;
        const bg = new T.Mesh(new T.CylinderGeometry(RB, RB, H1 - H0, 64, 1, true, Math.PI - ARC / 2, ARC),
          new T.MeshBasicMaterial({ map: pano, side: T.BackSide, fog: false, depthWrite: false }));
        bg.position.set(0, (H0 + H1) / 2, 5.6); bg.renderOrder = -1; A.add(bg); arena.sky = bg;
      }
      const st = stoneTex(); st.wrapS = st.wrapT = T.RepeatWrapping;
      const stoneMat = new T.MeshStandardMaterial({ map: st, roughness: 0.95, color: 0xb8b2a8 });
      const box = (w, h, d, x, z, ry) => { const g = new T.BoxGeometry(w, h, d); const m = new T.Mesh(g, stoneMat); m.position.set(x, h / 2, z); m.rotation.y = ry || 0; m.castShadow = m.receiveShadow = true; A.add(m); return m; };
      // lò lửa hai bên mép khung (như hình đích): bệ đá + chậu + lửa nhiều lớp + đèn cam
      const fireMat = c => new T.SpriteMaterial({ map: TEX.glow, color: c, transparent: true, blending: T.AdditiveBlending, depthWrite: false });
      for (const [x, z] of [[-3.3, -3.4], [3.3, -3.4], [-5.6, -9.5], [5.6, -9.5]]) {     // lùi ra sau (máy quay thấp + khung rộng → bản cũ đứng sát mép, cột đá cam rực)
        box(0.5, 1.15, 0.5, x, z);
        // chậu ánh lửa hắt (emissive): lò gần nằm sát mép khung, chậu kim loại tối soi phông tối → ló vào thành mảng ĐEN
        // hình tam giác ở mép phải (thấy trên ảnh chụp bản 3 + 4, 11-22) — có ánh lửa thì đọc ra là miệng lò như hình đích
        const bowl = new T.Mesh(new T.CylinderGeometry(0.5, 0.28, 0.32, 20), new T.MeshStandardMaterial({ color: 0x5a4630, metalness: 1, roughness: 0.32, emissive: 0x7a2c08, emissiveIntensity: 0.9 }));
        bowl.position.set(x, 1.31, z); A.add(bowl);
        const f1 = new T.Sprite(fireMat(0xff4a10)), f2 = new T.Sprite(fireMat(0xff9a2a)), f3 = new T.Sprite(fireMat(0xffe7a0));
        for (const f of [f1, f2, f3]) { f.position.set(x, 1.78, z); A.add(f); }
        arena.fires.push({ f1, f2, f3, x, z, ph: rnd(0, 6) });
      }
      for (const sx of [-1, 1]) { const L = new T.PointLight(0xff8a3a, 2.1, 14, 2); L.position.set(sx * 3.3, 2.3, -3.4); A.add(L); arena.fireLights.push(L); }
      // đèn sét có sẵn trong cảnh từ đầu (tắt, cường độ 0). Bản 4 lúc đầu chỉ thêm vào lúc sét giáng → số đèn đổi → máy dịch lại
      // chương trình vẽ của cả bộ giáp ngay khoảnh khắc đẹp nhất (đo 11-22: đứng hình 3,1 giây đúng lúc sét, 50 → 83 chương trình)
      A.add(boltLight);
      if (!AT) arena.envReady = true;
      setupComposer();
      // tàn lửa bay lên
      const N = 230, pos = new Float32Array(N * 3);
      for (let i = 0; i < N; i++) { pos[i * 3] = rnd(-9, 9); pos[i * 3 + 1] = rnd(0, 7); pos[i * 3 + 2] = rnd(-9, 2); }
      const eg = new T.BufferGeometry(); eg.setAttribute('position', new T.BufferAttribute(pos, 3));
      arena.embers = new T.Points(eg, new T.PointsMaterial({ size: 0.07, map: TEX.glow, color: 0xff9a40, transparent: true, blending: T.AdditiveBlending, depthWrite: false }));
      arena.embers.frustumCulled = false; A.add(arena.embers);
    }
    function stepArena(dt, t) {
      for (const f of arena.fighters) if (f.model.userData.tick) f.model.userData.tick(dt);
      for (const F of arena.fires) {
        const k = 1 + Math.sin(t * 13 + F.ph) * 0.12 + Math.sin(t * 7.3 + F.ph * 2) * 0.1;
        F.f1.scale.set(1.5 * k, 1.9 * k, 1); F.f2.scale.set(1.0 * k, 1.4 * k, 1); F.f3.scale.set(0.5 * k, 0.7 * k, 1);
        F.f2.position.y = 1.7 + Math.sin(t * 9 + F.ph) * 0.04;
      }
      for (const L of arena.fireLights) L.intensity = 2.1 + Math.sin(t * 11 + L.position.x) * 0.35;   // 3,0 rọi cột đá cam rực ở hai mép
      stepArenaFx(dt, t);
      const p = arena.embers.geometry.attributes.position;
      for (let i = 0; i < p.count; i++) { let y = p.getY(i) + dt * (0.5 + (i % 5) * 0.12); if (y > 7) y = 0; p.setY(i, y); p.setX(i, p.getX(i) + Math.sin(t + i) * dt * 0.15); }
      p.needsUpdate = true;
      // chớp giông xa
      arena.nextFlash -= dt;
      if (arena.nextFlash <= 0) { arena.flashT = 0.18; arena.nextFlash = rnd(2.2, 5); }
      if (arena.flashT > 0) arena.flashT -= dt;
      const fl = arena.flashT > 0 ? (Math.sin(arena.flashT * 60) > 0 ? 1 : 0.4) : 0;
      // sét giáng: chỉ loé nhẹ toàn cảnh (đo: loé mạnh làm khung sét sáng 161 vs đích 104 — hình đích giữ trời tối, chỉ tia sét sáng)
      arena.hemi.intensity = 0.4 + fl * 0.9 + (arena.flashK || 0) * 0.45;
      if (arena.sky) arena.sky.material.color.setScalar(1.0 + fl * 0.6 + (arena.flashK || 0) * 0.18);   // đo: 1,0 → trời 111 vs đích 83; 0,78 → 73 (quá tối)
    }

    /* ---------- HIỆU ỨNG ĐÒN ĐÁNH trong đấu trường (hình đích "đòn chém"): vệt lửa theo lưỡi kiếm, lửa + tia điện
       bám lưỡi lúc vung, sét từ trời giáng xuống chỗ trúng, tia lửa toé hình quạt có vệt, vòng sóng dưới sàn, chậm lại
       lúc trúng. Mọi kích thước đã tính theo toạ độ ĐẤU TRƯỜNG (chiến binh ×ARENA_K). ---------- */
    const trailMat = new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide, toneMapped: false,
      uniforms: { uTime: { value: 0 }, uQ: { value: 3.2 }, uLo: { value: 0.3 } },
      vertexShader: 'attribute float aAge; attribute float aSide; varying float vAge; varying float vSide; varying vec3 vW;\n' +
        'void main(){ vAge = aAge; vSide = aSide; vW = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      // bản 4: ảnh bản 3 ra "dải khói mờ" → lưỡi lửa SẮC: nhiễu kéo dài dọc đường chém (vệt sao chổi), ngưỡng hẹp tách từng lưỡi,
      // thang màu đỏ thẫm → cam → vàng → trắng nóng; mép trước sát lưỡi kiếm sáng gắt
      fragmentShader: [
        'uniform float uTime, uQ, uLo; varying float vAge; varying float vSide; varying vec3 vW;',
        'float hs(vec2 p){ p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }',
        'float ns(vec2 p){ vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);',
        '  return mix(mix(hs(i), hs(i + vec2(1.0, 0.0)), f.x), mix(hs(i + vec2(0.0, 1.0)), hs(i + vec2(1.0, 1.0)), f.x), f.y); }',
        'float fb(vec2 p){ float s = 0.0, a = 0.5; for (int i = 0; i < 4; i++) { s += a * ns(p); p = p * 2.03 + vec2(1.7, 9.2); a *= 0.5; } return s; }',
        // lần đo 1 bản 4: nhiễu kéo dãn dọc đường chém → sọc song song, đuôi tan thành sợi dây. Giờ nhiễu theo TOẠ ĐỘ THẬT
        // (ô vuông vức, cuộn xoáy, bốc lên trên) → đuôi vỡ thành từng búi lửa rồi tắt; sát lưỡi kiếm trắng nóng
        'void main(){',
        '  float age = clamp(vAge, 0.0, 1.0), a = 1.0 - age;',
        '  vec2 q = vec2(vW.x + vW.z * 0.5, vW.y) * uQ;',
        '  vec2 wv = vec2(fb(q * 0.7 + vec2(0.0, -uTime * 1.6)), fb(q * 0.7 + vec2(5.2, -uTime * 1.3)));',
        // nhiễu kéo giãn độ tương phản (lần đo 2: đặc thành một đám vàng chói — gần như chỗ nào cũng vượt ngưỡng)
        '  float n = smoothstep(uLo, 0.76, fb(q + wv * 2.0 + vec2(0.0, -uTime * 3.0)));',
        // mép dải lửa mềm hơn (lần đo 4: mép dải chồng lên nhau lộ thành đường thẳng cứng)
        '  float env = smoothstep(0.0, 0.38, vSide) * (1.0 - smoothstep(0.74, 1.0, vSide));',
        '  float lead = exp(-age * 9.0);',
        '  float heat = n * env * pow(a, 0.5) + lead * 0.28 * env - age * 0.42;',
        '  float m = smoothstep(0.3, 0.34, heat);',
        '  vec3 c = mix(vec3(0.62, 0.05, 0.0), vec3(1.0, 0.34, 0.02), smoothstep(0.33, 0.48, heat));',
        '  c = mix(c, vec3(1.0, 0.7, 0.18), smoothstep(0.5, 0.7, heat));',
        '  c = mix(c, vec3(1.0, 0.94, 0.78), smoothstep(0.78, 0.98, heat));',
        '  gl_FragColor = vec4(c * m * (0.65 + heat * 1.05), 1.0);',
        '}'].join('\n')
    });
    /* dải sáng luôn quay mặt về máy quay, bề rộng tính theo ĐIỂM ẢNH (sét, tia điện trên lưỡi): lõi trắng mảnh + quầng màu.
       (bản 3 dùng ống tròn 3D → nhìn như ống đèn neon trơn, không ra tia sét) */
    // vệt lửa cho chiến binh TRANH (11-23): cung vung rộng gần gấp đôi bản 3D → cùng độ nhiễu thì vỡ thành từng búi rời (ảnh chụp
    // khung chạm) → búi to hơn (uQ 1,9) + ngưỡng thấp hơn (uLo 0,18) cho dòng lửa đặc như hình đích. Cùng chương trình vẽ với trailMat.
    const trailMatSpr = trailMat.clone(); trailMatSpr.uniforms.uQ.value = 1.9; trailMatSpr.uniforms.uLo.value = 0.18;
    function ribbonMat(glow, core) {
      return new T.ShaderMaterial({
        transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false, side: T.DoubleSide,
        uniforms: { uRes: { value: new T.Vector2(PX, PX) }, uGlow: { value: new T.Color(glow) }, uCore: { value: new T.Color(core) }, uOp: { value: 1 } },
        vertexShader: [
          'attribute vec3 aOther; attribute float aSide; attribute float aW; uniform vec2 uRes; varying float vS;',
          'void main(){',
          '  vec4 c0 = projectionMatrix * modelViewMatrix * vec4(position, 1.0);',
          '  vec4 c1 = projectionMatrix * modelViewMatrix * vec4(aOther, 1.0);',
          '  vec2 d = (c1.xy / c1.w - c0.xy / c0.w) * uRes; float L = length(d); d = L > 1e-5 ? d / L : vec2(1.0, 0.0);',
          '  c0.xy += vec2(-d.y, d.x) * aSide * aW / uRes * 2.0 * c0.w;',
          '  vS = aSide; gl_Position = c0; }'].join('\n'),
        fragmentShader: [
          'uniform vec3 uGlow; uniform vec3 uCore; uniform float uOp; varying float vS;',
          // s kẹp ≤ 1: mép nét, khử răng cưa (MSAA) tính màu ở tâm điểm ảnh NẰM NGOÀI nét → |vS| > 1 → pow(số âm) = không-phải-số
          // → điểm ảnh ĐEN tuyệt đối dọc mép tia sét (đo 11-22 trên ảnh PNG: (0,0,0) hai bên mỗi nhánh — tưởng do nén JPEG)
          'void main(){ float s = min(abs(vS), 1.0); float core = smoothstep(0.4, 0.0, s); float glow = pow(1.0 - s, 2.3);',
          '  gl_FragColor = vec4((uCore * core + uGlow * glow) * uOp, 1.0); }'].join('\n')
      });
    }
    function ribbonGeo(lines) {          // lines: [{ pts:[Vector3], w0, w1 }] → 1 hình; bề rộng (điểm ảnh) thon từ w0 → w1
      const pos = [], oth = [], side = [], wid = [], idx = [], q = new T.Vector3();
      let base = 0;
      for (const L of lines) {
        const n = L.pts.length; if (n < 2) continue;
        for (let i = 0; i < n; i++) {
          const p = L.pts[i];
          if (i < n - 1) q.copy(L.pts[i + 1]); else q.copy(p).multiplyScalar(2).sub(L.pts[i - 1]);
          const w = L.w0 + (L.w1 - L.w0) * (i / (n - 1));
          pos.push(p.x, p.y, p.z, p.x, p.y, p.z); oth.push(q.x, q.y, q.z, q.x, q.y, q.z); side.push(-1, 1); wid.push(w, w);
          if (i < n - 1) { const a = base + i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
        }
        base += n * 2;
      }
      const g = new T.BufferGeometry();
      g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('aOther', new T.Float32BufferAttribute(oth, 3));
      g.setAttribute('aSide', new T.Float32BufferAttribute(side, 1)); g.setAttribute('aW', new T.Float32BufferAttribute(wid, 1));
      g.setIndex(idx); return g;
    }
    // đường gãy khúc kiểu tia sét: chia đôi từng đoạn + đẩy lệch ngẫu nhiên, mỗi tầng lệch ít đi (nhiều khúc nhỏ trong khúc lớn)
    function jag(a, b, levels, rough) {
      let pts = [a.clone(), b.clone()], disp = a.distanceTo(b) * rough;
      const d = new T.Vector3(), r = new T.Vector3();
      for (let l = 0; l < levels; l++) {
        const out = [pts[0]];
        for (let i = 0; i < pts.length - 1; i++) {
          const p = pts[i], q = pts[i + 1], m = p.clone().lerp(q, 0.5);
          d.subVectors(q, p).normalize();
          r.set(rnd(-1, 1), rnd(-1, 1), rnd(-1, 1)); r.addScaledVector(d, -r.dot(d));
          if (r.lengthSq() > 1e-8) m.addScaledVector(r.normalize(), rnd(-disp, disp));
          out.push(m, q);
        }
        pts = out; disp *= 0.55;
      }
      return pts;
    }
    const arcMat = ribbonMat(new T.Color(0.3, 0.55, 1.7), new T.Color(2.0, 2.3, 3.0));
    const trails = [];
    const _v1 = new T.Vector3(), _v2 = new T.Vector3(), _v3 = new T.Vector3();
    function startTrail(f) {
      const blade = f.model && f.model.getObjectByName('blade');
      if (!blade || !arena.scene || f.trail) return;
      const MAXV = 240, geo = new T.BufferGeometry();
      geo.setAttribute('position', new T.BufferAttribute(new Float32Array(MAXV * 3), 3));
      geo.setAttribute('aAge', new T.BufferAttribute(new Float32Array(MAXV), 1));
      geo.setAttribute('aSide', new T.BufferAttribute(new Float32Array(MAXV), 1));
      const idx = []; for (let i = 0; i < MAXV / 2 - 1; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      geo.setIndex(idx); geo.setDrawRange(0, 0);
      const mesh = new T.Mesh(geo, f.spr ? trailMatSpr : trailMat); mesh.frustumCulled = false; arena.scene.add(mesh);
      // lửa + tia điện bám lưỡi kiếm lúc vung
      const len = blade.userData.len || 0.5, deco = new T.Group(), flames = [];
      for (let i = 0; i < 6; i++) {
        const s = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: i % 2 ? 0xff7a1a : 0xffb040, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
        s.position.set(0, len * (0.25 + i * 0.14), 0); deco.add(s); flames.push(s);
      }
      // tia điện xanh quấn lưỡi (hình đích): dải sáng gãy khúc, vẽ lại mỗi khung
      const arc = new T.Mesh(new T.BufferGeometry(), arcMat); arc.frustumCulled = false; arc.renderOrder = 4; deco.add(arc);
      blade.add(deco);
      f.trail = { f, blade, len, mesh, geo, samples: [], live: true, deco, flames, arc, born: clock.g };
      trails.push(f.trail);
    }
    function stopTrail(f) { if (f && f.trail) { f.trail.live = false; f.trail.hold = false; f.trail = null; } }
    function stepTrails(t) {
      trailMat.uniforms.uTime.value = t; trailMatSpr.uniforms.uTime.value = t;
      const LIFE = 0.42;                       // bản 3: 0,34 — vệt tan quá nhanh, lúc sét giáng đã gần hết lửa
      for (let ti = trails.length - 1; ti >= 0; ti--) {
        const tr = trails[ti];
        if (tr.hold && tr.lastT !== undefined) { const d = t - tr.lastT; for (const s of tr.samples) s.t += d; }   // đang giữ: vệt lửa không già đi
        tr.lastT = t;
        if (tr.live && tr.blade.parent) {
          // cập nhật cả chuỗi cha (thân → kiếm → lưỡi) vừa bị khung xương đổi trong khung này; updateMatrixWorld(true) chỉ đi XUỐNG
          // nên lưỡi lấy ma trận cũ của khung trước → mẫu cuối (lúc chém trúng) bị lỡ, đuôi lửa dừng trên đầu
          tr.blade.updateWorldMatrix(true, false);
          // dải lửa từ 0,3 lưỡi tới quá mũi một chút (bản 3: chỉ 0,8 → 1,06 → dải hẹp như sợi khói); lưỡi lửa do shader cắt mép
          const b = tr.blade.localToWorld(new T.Vector3(0, tr.len * 0.3, 0)), tip = tr.blade.localToWorld(new T.Vector3(0, tr.len * 1.12, 0));
          const sh = tr.f.rig.armR ? tr.f.rig.armR.getWorldPosition(new T.Vector3()) : b.clone();
          const last = tr.samples[tr.samples.length - 1];
          if (!last || last.tip.distanceToSquared(tip) > 1e-5) tr.samples.push({ b, tip, sh, t });
          // lửa + điện bám lưỡi
          tr.flames.forEach((s, i) => { const k = (0.7 + 0.4 * Math.sin(t * 31 + i * 1.9)) * tr.len * 0.3; s.scale.set(k * 0.7, k, 1); s.material.opacity = 0.7; });
          if (tr.arc.geometry) tr.arc.geometry.dispose();
          const L = tr.len, lines = [];
          for (let j = 0; j < 2; j++) lines.push({ pts: jag(new T.Vector3(rnd(-0.012, 0.012), L * rnd(0.08, 0.2), 0), new T.Vector3(rnd(-0.01, 0.01), L * rnd(0.92, 1.05), rnd(-0.01, 0.01)), 4, 0.06), w0: 3.2, w1: 1.2 });
          tr.arc.geometry = ribbonGeo(lines); tr.arc.visible = Math.sin(t * 50) > -0.4;
        } else if (tr.deco.parent) tr.deco.parent.remove(tr.deco);
        while (tr.samples.length && t - tr.samples[0].t > LIFE) tr.samples.shift();
        if (!tr.live && !tr.samples.length) { arena.scene.remove(tr.mesh); tr.geo.dispose(); trails.splice(ti, 1); continue; }
        // dải lửa: chèn 4 điểm giữa 2 mẫu, giữ đúng bán kính quanh vai (vệt cong tròn theo đường vung)
        const pos = tr.geo.attributes.position, ag = tr.geo.attributes.aAge, sd = tr.geo.attributes.aSide;
        let n = 0; const MAXP = pos.count / 2;
        const put = (bp, tp, age) => { if (n >= MAXP) return; pos.setXYZ(n * 2, bp.x, bp.y, bp.z); pos.setXYZ(n * 2 + 1, tp.x, tp.y, tp.z); ag.setX(n * 2, age); ag.setX(n * 2 + 1, age); sd.setX(n * 2, 0); sd.setX(n * 2 + 1, 1); n++; };
        const S = tr.samples;
        for (let i = 0; i < S.length; i++) {
          if (i > 0) {
            const A0 = S[i - 1], A1 = S[i];
            for (let j = 1; j < 4; j++) {
              const f = j / 4, sh = _v3.lerpVectors(A0.sh, A1.sh, f);
              const r0 = A0.tip.distanceTo(A0.sh), r1 = A1.tip.distanceTo(A1.sh), q0 = A0.b.distanceTo(A0.sh), q1 = A1.b.distanceTo(A1.sh);
              const tp = _v1.lerpVectors(A0.tip, A1.tip, f).sub(sh).normalize().multiplyScalar(r0 + (r1 - r0) * f).add(sh);
              const bp = _v2.lerpVectors(A0.b, A1.b, f).sub(sh).normalize().multiplyScalar(q0 + (q1 - q0) * f).add(sh);
              put(bp, tp, (t - (A0.t + (A1.t - A0.t) * f)) / LIFE);
            }
          }
          put(S[i].b, S[i].tip, (t - S[i].t) / LIFE);
        }
        pos.needsUpdate = ag.needsUpdate = sd.needsUpdate = true;
        tr.geo.setDrawRange(0, Math.max(0, n - 1) * 6);
      }
    }
    // sét từ trời giáng xuống điểm trúng (bản 4): thân chính gãy khúc nhiều tầng + 9 nhánh (có nhánh con) + điện toé quanh
    // chỗ trúng; dải sáng mảnh lõi trắng quầng xanh; nháy 3 lần, mỗi lần một hình mới; loé cả đấu trường
    const boltMat = ribbonMat(new T.Color(0.42, 0.62, 2.0), new T.Color(2.6, 2.75, 3.2));
    const boltLight = new T.PointLight(0xbcd4ff, 0, 9, 2);
    function boltMeshes(at) {
      const top = new T.Vector3(at.x + rnd(-0.5, 0.7), 13, at.z - 3.5);
      const main = jag(top, at, 7, 0.09);
      const lines = [{ pts: main, w0: 8, w1: 10.5 }];
      // nhánh mọc ở khúc sét LỌT KHUNG. Đo 11-22: máy quay đấu trường thấp, chỉ thấy ~1/7 dưới cùng của thân sét → bản cũ cho nhánh
      // mọc ở điểm 14…108 (trên 128) = toàn bộ ngoài khung; ảnh chỉ thấy 2-3 nhánh con thò xuống dù code có 9 nhánh
      const cam = cut.views[0] && cut.views[0].cam, pool = [];
      if (cam) for (let i = 8; i < main.length - 4; i++) { const v = main[i].clone().project(cam); if (Math.abs(v.x) < 0.97 && Math.abs(v.y) < 0.93) pool.push(i); }
      if (pool.length < 8) for (let i = 14; i < main.length - 20; i++) pool.push(i);
      for (let k = 0; k < 9; k++) {
        const i0 = pool[(Math.random() * pool.length) | 0], s = main[i0];
        const dir = main[Math.min(main.length - 1, i0 + 6)].clone().sub(s).normalize();
        const len = rnd(0.6, 2.2) * (1 - i0 / main.length * 0.5);
        const end = s.clone().addScaledVector(dir, len * 0.6).add(new T.Vector3(rnd(-1, 1) * len * 0.7, -rnd(0.2, 0.7) * len, rnd(-0.4, 0.4) * len));
        const br = jag(s, end, 5, 0.18);
        lines.push({ pts: br, w0: 4.2, w1: 0.9 });
        if (Math.random() < 0.5) {
          const s2 = br[(br.length * rnd(0.3, 0.7)) | 0];
          const e2 = s2.clone().add(new T.Vector3(rnd(-0.6, 0.6), -rnd(0.2, 0.6), rnd(-0.3, 0.3)).multiplyScalar(len * 0.6));
          lines.push({ pts: jag(s2, e2, 4, 0.2), w0: 2.5, w1: 0.7 });
        }
      }
      for (let k = 0; k < 6; k++) {               // điện toé quanh chỗ trúng
        const e = at.clone().add(new T.Vector3(rnd(-0.5, 0.5), rnd(-0.35, 0.45), rnd(-0.4, 0.4)));
        lines.push({ pts: jag(at, e, 4, 0.25), w0: 3.2, w1: 0.7 });
      }
      const m = new T.Mesh(ribbonGeo(lines), boltMat); m.frustumCulled = false; m.renderOrder = 5;
      return m;
    }
    async function skyBolt(at) {
      if (!arena.scene) return;
      sfx('zap', 1);
      if (!boltLight.parent) arena.scene.add(boltLight);
      boltLight.position.copy(at).add(new T.Vector3(0, 0.6, 0.6));
      let g = null;
      const drop = () => { if (g) { arena.scene.remove(g); g.geometry.dispose(); g = null; } };
      for (let i = 0; i < 3; i++) {
        drop(); g = boltMeshes(at); arena.scene.add(g);
        boltMat.uniforms.uOp.value = 1;
        arena.flashK = i === 0 ? 1 : 0.6; boltLight.intensity = 4.5;      // 9 → rọi Mã trắng xoá (đo: con phải 141 vs đích 114)
        await wait(0.06);
        arena.flashK = 0.15; boltLight.intensity = 1.5; boltMat.uniforms.uOp.value = 0.5;
        await wait(0.04);
      }
      boltMat.uniforms.uOp.value = 1;
      await tween(0.18, k => { boltMat.uniforms.uOp.value = 1 - k; arena.flashK = 0.15 * (1 - k); boltLight.intensity = 3 * (1 - k); });
      drop();
      boltMat.uniforms.uOp.value = 1; arena.flashK = 0; boltLight.intensity = 0;
    }
    // tia lửa toé hình quạt (hướng ra khỏi người chém) — dùng chung danh sách tia lửa, thêm vệt kéo dài
    function fan(at, dir, n, color, power) {
      const col = new T.Color(color || 0xffb347);
      for (let i = 0; i < n; i++) {
        if (spList.length >= SPARK_N) spList.shift();
        const v = dir.clone().multiplyScalar(rnd(1.5, 4.5)).add(new T.Vector3(rnd(-1.6, 1.6), rnd(-0.6, 2.4), rnd(-1.6, 1.6))).multiplyScalar(power || 1);
        spList.push({ p: at.clone().add(new T.Vector3(rnd(-0.05, 0.05), rnd(-0.08, 0.08), rnd(-0.05, 0.05))), v, life: rnd(0.3, 0.75), max: 0.75, c: col });
      }
    }
    const streakGeo = new T.BufferGeometry();
    streakGeo.setAttribute('position', new T.BufferAttribute(new Float32Array(SPARK_N * 6), 3));
    streakGeo.setAttribute('color', new T.BufferAttribute(new Float32Array(SPARK_N * 6), 3));
    const streaks = new T.LineSegments(streakGeo, new T.LineBasicMaterial({ vertexColors: true, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
    streaks.frustumCulled = false;
    function stepStreaks() {
      const P = streakGeo.attributes.position, Cc = streakGeo.attributes.color;
      let n = 0;
      for (const s of spList) {
        const a = Math.max(0, s.life / s.max) * 2.2;
        P.setXYZ(n * 2, s.p.x, s.p.y, s.p.z); P.setXYZ(n * 2 + 1, s.p.x - s.v.x * 0.03, s.p.y - s.v.y * 0.03, s.p.z - s.v.z * 0.03);
        Cc.setXYZ(n * 2, s.c.r * a, s.c.g * a, s.c.b * a); Cc.setXYZ(n * 2 + 1, s.c.r * a * 0.2, s.c.g * a * 0.1, 0); n++;
        if (n >= SPARK_N) break;
      }
      streakGeo.setDrawRange(0, n * 2); P.needsUpdate = Cc.needsUpdate = true;
    }
    // vòng sóng chấn động trên sàn
    const ringTex = canvasTex(256, (g, s) => {
      const r = g.createRadialGradient(s / 2, s / 2, s * 0.3, s / 2, s / 2, s / 2);
      r.addColorStop(0, 'rgba(255,255,255,0)'); r.addColorStop(0.72, 'rgba(255,220,160,0.25)'); r.addColorStop(0.9, 'rgba(255,240,210,1)'); r.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = r; g.fillRect(0, 0, s, s);
    });
    function shockRing(at, K) {
      const m = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: ringTex, color: new T.Color(1.6, 1.3, 1.0), transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
      m.rotation.x = -Math.PI / 2; m.position.copy(at); m.position.y = 0.025; fxGrp.add(m);
      tween(0.55, k => { m.scale.setScalar((0.4 + k * 3.2) * (K || 1)); m.material.opacity = 1 - k; }, EASE.out).then(() => { fxGrp.remove(m); m.geometry.dispose(); m.material.dispose(); });
    }
    function slowMo(sec) { arena.slowT = sec; }
    /* MẪU "MƯỢT HƠN" (11-23, bản sao chess-muot): MÁY QUAY BIẾT DIỄN — chạy theo GIỜ THẬT (quay chậm / khựng nhịp không làm máy đứng).
       z = độ cận (1 = khung gốc), (fx, fy) = điểm nhìn trên mặt phẳng hai con đứng, w = máy xoay về điểm nhìn bao nhiêu (0..1).
       Máy trôi mềm về đích (rate lớn = tới nhanh); punch = giật cận chỗ chạm, tự tắt dần. */
    const camFx = { z: 1, fx: 0, fy: 1.08, w: 0, tz: 1, tfx: 0, tfy: 1.08, tw: 0, rate: 4, punch: 0, px: 0, py: 1.08, pz: 0 };
    // mẫu 2 (11-23): Nam chê máy chạy/rung (chóng mặt) → 3 lệnh dưới để TRỐNG, máy đứng yên, không khựng nhịp
    function camAim() {}
    function camPunch() {}
    function hitStop() {}
    function stepCam(dt) {
      const a = 1 - Math.exp(-dt * camFx.rate);
      camFx.z += (camFx.tz - camFx.z) * a; camFx.fx += (camFx.tfx - camFx.fx) * a;
      camFx.fy += (camFx.tfy - camFx.fy) * a; camFx.w += (camFx.tw - camFx.w) * a;
      camFx.punch = Math.max(0, camFx.punch - dt / 0.32);
    }
    // tranh có lực: co giãn khi đổi dáng (lấy đà rướn lên, chém bè ra…) rồi tự về 1 theo giờ thật
    function sprSquash(f, sx, sy) { const S = sprOf(f); if (S) { S.sq = S.sq || { x: 1, y: 1 }; S.sq.x = sx; S.sq.y = sy; } }
    function sprFlash(f, amt) {              // bị trúng: loé trắng rồi tắt
      const S = sprOf(f); if (!S) return;
      const set = v => { for (const c of Object.values(S.cards)) c.material.color.setScalar(v); };
      set(1 + amt); tween(0.14, k => set(1 + amt * (1 - k)), EASE.out).then(() => set(1));
    }
    function sprGhost(f, op) {               // bóng mờ kéo theo lúc lao tới: chụp tấm đang hiện, mờ dần tại chỗ (dùng chung chương trình vẽ tranh)
      const S = sprOf(f); if (!S) return;
      const card = S.cards[S.pose]; if (!card) return;
      card.updateWorldMatrix(true, false);
      const g = new T.Mesh(card.geometry, sprMat(card.material.map));
      g.material.color.setRGB(1.25, 0.95, 0.7); g.material.opacity = op; g.renderOrder = 1; g.frustumCulled = false;
      card.matrixWorld.decompose(g.position, g.quaternion, g.scale);
      arena.scene.add(g);
      tween(0.14, k => { g.material.opacity = op * (1 - k); }, EASE.out).then(() => { arena.scene.remove(g); g.material.dispose(); });
    }
    function stepArenaFx(dt, t) {
      // vệt lửa tan theo giờ TRONG CẢNH: lúc quay chậm (sét giáng) đuôi lửa còn đầy như hình đích — lần đo 3: tan theo giờ thật → lúc sét chỉ còn búi lửa lưa thưa
      stepTrails(clock.g);
      stepStreaks();
      stepCam(dt);
      const back = 1 - Math.exp(-dt * 11);
      for (const f of arena.fighters) if (f.spr && f.root.visible) {   // tranh: thở nhẹ (cao lên / hạ xuống 0,6%) + co giãn theo dáng
        const q = f.spr.sq || (f.spr.sq = { x: 1, y: 1 });
        q.x += (1 - q.x) * back; q.y += (1 - q.y) * back;
        f.model.scale.y = (1 + Math.sin(t * 2.3 + f.spr.breath) * 0.006) * q.y;
        f.model.scale.x = (f.spr.mirror ? -1 : 1) * q.x;
      }
      if (arena.slowT > 0) { arena.slowT -= dt; if (speed <= 1) speed = arena.slowT > 0 ? 0.32 : 1; }
      if (arena.stopT > 0) { arena.stopT -= dt; if (speed <= 1) speed = arena.stopT > 0 ? 0.03 : (arena.slowT > 0 ? 0.32 : 1); }
    }
    function fighterFrom(src, x, opt) {
      // 11-23: Vua + Mã có TRANH ChatGPT vẽ → chiến binh tranh (⚙ "Nhân vật lúc đánh nhau" = 3D thì vẫn dựng giáp code như bản 4)
      const set = !(opt && opt.art3d) && sprSetFor(src.t, src.c);
      if (set) return makeSprFighter(src, x, set);
      const root = new T.Group(), pivot = new T.Group();
      // chiến binh MẶC GIÁP (chess_knights.js) cho loại đã dựng xong; loại chưa có → chiến binh hoạt hình cũ
      const KN = window.ChessKnights;
      const obj = KN && KN.has(src.t) ? KN.make(src.t, src.c) : warriorTemplate(src.t, src.c).clone(true);
      if (src.t === 'x') obj.add(emojiSprite(src.def, 0.78));
      pivot.add(obj); root.add(pivot);
      root.scale.setScalar(ARENA_K);
      root.position.set(x, TOP, 0);
      // chiến binh giáp xoay chéo ~24° về phía máy quay như hình đích (thấy ngực + mặt mũ, không chỉ thấy lưng áo choàng)
      const turn = obj.userData.knight ? 0.42 : 0;
      root.rotation.y = x < 0 ? Math.PI / 2 - turn : -Math.PI / 2 + turn;
      if (obj.userData.pose) {                // dáng giáp: đối thủ nằm lệch ±turn trong toạ độ mẫu; máy quay ở phía tay phải (con trái) / tay trái (con phải)
        obj.userData.pose.oppYaw = x < 0 ? turn : -turn;
        obj.userData.pose.camX = x < 0 ? -1 : 1;
        obj.userData.tick();
      }
      arena.scene.add(root);
      const f = { root, pivot, model: obj, rig: { armR: obj.getObjectByName('armR') || null, armL: obj.getObjectByName('armL') || null, orb: obj.getObjectByName('orb') || null }, t: src.t, c: src.c, id: src.id, def: src.def, k: ARENA_K };
      arena.fighters.push(f);
      return f;
    }
    // khoảng cách hai con trong đấu trường: có chiến binh giáp → xa hơn một chút (hình đích: hai người cách ~1 thân, kiếm chạm mép khiên)
    function arenaGap(ta, tb, ca, cb) {
      // chiến binh tranh: gốc = gót chân SAU → đứng xa tâm hơn (tranh chém rất dài); một bên tranh một bên 3D → đứng gần lại
      const sa = sprSetFor(ta, ca || 'w'), sb = sprSetFor(tb, cb || 'b');
      if (sa && sb) return SPR_STAND;
      if (sa || sb) return SPR_MIX;
      const KN = window.ChessKnights; return KN && (KN.has(ta) || KN.has(tb)) ? 0.9 : 0.82;
    }

    /* ---------- CHIẾN BINH TRANH (11-23 — Nam: "nhân vật quá xấu, con ngựa quá xấu, nhờ chatgpt phụ" → chọn "Dùng luôn tranh ChatGPT vẽ")
       Mỗi con = 6 tấm tranh ChatGPT vẽ (thủ thế · lấy đà · chém · đỡ · trúng đòn · gục gối), đã tách nền + chỉnh đều cỡ theo cỡ đầu
       (assets/spr_kn.js do tools/make_sprites.py sinh). Tranh là tấm phẳng quay về máy quay, đứng trong đấu trường 3D thật (sàn gương soi
       bóng). Động tác = đổi tấm thật nhanh (mờ chéo vài phần trăm giây) + lướt tới / lùi / nghiêng; lửa, sét, tia lửa, khiên nứt vẫn là
       hiệu ứng 3D, bám MỐC trên tranh (mũi kiếm, tâm khiên, chỗ đỡ, ngực). Gốc mỗi tấm = gót chân SAU: đổi dáng mà chân sau đứng yên,
       lao tới thì chân trước vươn ra. Con bên trái quay mặt sang phải; tranh vẽ quay hướng kia thì lật ngang. ---------- */
    const SPR = window.CHESS_SPR || null;
    const SPR_STAND = 1.52, SPR_MIX = 1.2;   // gót chân sau cách tâm (ảnh ghép 11-23: khung "thủ thế" như mẫu đã cho Nam xem)
    const sprOf = m => (m && m.spr) ? m.spr : null;
    function sprSetFor(t, c) { return cfg.art !== '3d' && SPR && SPR.sets[t + '_' + c] ? SPR.sets[t + '_' + c] : null; }
    const sprTex = {};
    function sprTexture(key, name, P) {        // ảnh → texture: nạp 1 lần, mọi trận dùng chung (đừng dispose: nạp lại = khựng)
      const id = key + '/' + name;
      if (!sprTex[id]) { const tx = texLoader.load(P.src); tx.encoding = T.sRGBEncoding; tx.anisotropy = 4; sprTex[id] = tx; }
      return sprTex[id];
    }
    // hậu kỳ đấu trường (phơi sáng 1,12 → ACES → gamma) làm tranh vẽ sẵn bạc màu + nhạt tương phản → tấm tranh trả trước màu theo phép
    // NGƯỢC của hậu kỳ để ra đúng màu ChatGPT vẽ. uComp: 1 = bù đủ, 0 = không bù (đo trên ảnh chụp: tools/look_paint.py)
    const sprUni = { uComp: { value: 1 } };
    function sprMat(map) {
      const m = new T.MeshBasicMaterial({ map, transparent: true, depthWrite: false, side: T.DoubleSide, fog: false });
      m.onBeforeCompile = sh => {
        sh.uniforms.uComp = sprUni.uComp;
        sh.fragmentShader = 'uniform float uComp;\nvec3 sprInvAces(vec3 t){ vec3 a = 2.51 - 2.43 * t, b = 0.03 - 0.59 * t, c = -0.14 * t; return (-b + sqrt(b * b - 4.0 * a * c)) / (2.0 * a); }\n' +
          sh.fragmentShader.replace('#include <tonemapping_fragment>',
            'gl_FragColor.rgb = mix(gl_FragColor.rgb, sprInvAces(min(gl_FragColor.rgb, vec3(0.9))) / 1.12, uComp);\n#include <tonemapping_fragment>');
      };
      m.customProgramCacheKey = () => 'sprComp';
      return m;
    }
    // điểm trên tranh (điểm ảnh, y xuống) → toạ độ trong nhóm tranh (gốc = gót chân sau, y lên)
    const sprLocal = (P, pt, z) => new T.Vector3((pt[0] - P.bf[0]) * SPR.wpp, (P.bf[1] - pt[1]) * SPR.wpp, z || 0.02);
    function sprCard(key, name, P) {
      const m = new T.Mesh(new T.PlaneGeometry(P.w * SPR.wpp, P.h * SPR.wpp), sprMat(sprTexture(key, name, P)));
      m.position.set((P.w / 2 - P.bf[0]) * SPR.wpp, (P.bf[1] - P.h / 2) * SPR.wpp, 0);
      m.frustumCulled = false; m.renderOrder = 2; m.name = 'card_' + name;
      return m;
    }
    function makeSprFighter(src, x, set) {
      const key = src.t + '_' + src.c;
      const root = new T.Group(), pivot = new T.Group(), model = new T.Group();
      const want = x < 0 ? 1 : -1;                         // con bên trái quay mặt sang phải
      if (set.face !== want) model.scale.x = -1;           // tranh vẽ quay hướng kia → lật ngang
      const cards = {};
      for (const name in set.poses) {
        const c = sprCard(key, name, set.poses[name]); const on = name === 'stance';
        c.visible = on; c.material.opacity = on ? 1 : 0; cards[name] = c; model.add(c);
      }
      // kiếm ẢO (vô hình) cho vệt lửa + sét + lửa bám lưỡi: đặt theo mũi kiếm / ngực của dáng, quét vòng lúc chém
      const blade = new T.Object3D(); blade.name = 'blade'; blade.userData.len = 0.5; model.add(blade);
      const shoulder = new T.Object3D(); shoulder.name = 'armR'; model.add(shoulder);
      model.userData.spr = true;
      pivot.add(model); root.add(pivot);
      root.position.set(x, TOP, 0);
      arena.scene.add(root);
      const f = { root, pivot, model, rig: { armR: shoulder, armL: null, orb: null }, t: src.t, c: src.c, id: src.id, def: src.def, k: ARENA_K,
        spr: { key, set, cards, pose: 'stance', want, mirror: model.scale.x < 0, blade, shoulder, tok: 0, attach: [], breath: rnd(0, 6) } };
      sprBlade(f, 'stance');
      arena.fighters.push(f);
      return f;
    }
    function setBladeFrom(S, c, t) {          // c = tâm vung (ngực), t = mũi kiếm — toạ độ trong nhóm tranh
      const d = t.clone().sub(c), r = d.length() || 0.01, dir = d.divideScalar(r);
      S.blade.position.copy(c).addScaledVector(dir, r * 0.38);
      S.blade.quaternion.setFromUnitVectors(_up, dir);
      S.blade.userData.len = r * 0.62; S.shoulder.position.copy(c);
    }
    const _up = new T.Vector3(0, 1, 0);
    function sprBlade(f, name) { const S = sprOf(f), P = S.set.poses[name]; if (P && P.tip && P.chest) setBladeFrom(S, sprLocal(P, P.chest), sprLocal(P, P.tip)); }
    function sprSwing(f, k, toPose, fromPose, mode, cAt) {   // 0 = kiếm ở dáng lấy đà → 1 = dáng chém: quét vòng QUA ĐỈNH ĐẦU (đường ngắn nhất giữa 2 góc)
      // mẫu 2: mode 'flat' = chém ngang (vòng quét DẸT ngang ngực) · 'line' = đâm (lưỡi duỗi thẳng ra trước) · cAt = tâm vung đặt sẵn (nhảy chém)
      const S = sprOf(f), A = S.set.poses[fromPose || 'windup'], B = S.set.poses[toPose || 'strike'];
      if (!A || !B || !A.tip || !B.tip) return;
      const ca = sprLocal(A, A.chest), ta = sprLocal(A, A.tip), cb = sprLocal(B, B.chest), tb = sprLocal(B, B.tip);
      const c = cAt ? cAt.clone() : ca.clone().lerp(cb, k);
      if (mode === 'line') { const d = tb.clone().sub(cb), r = d.length(); setBladeFrom(S, c, c.clone().addScaledVector(d.normalize(), r * (0.35 + 0.65 * k))); return; }
      const a0 = Math.atan2(ta.y - ca.y, ta.x - ca.x), a1 = Math.atan2(tb.y - cb.y, tb.x - cb.x);
      let da = a1 - a0; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI;
      const r = ta.distanceTo(ca) + (tb.distanceTo(cb) - ta.distanceTo(ca)) * k, ang = a0 + da * k;
      const sy = mode === 'flat' ? 0.3 + 0.7 * k * k : 1;     // dẹt giữa đường vung, cuối đường trùng đúng mũi kiếm trong tranh
      setBladeFrom(S, c, c.clone().add(new T.Vector3(Math.cos(ang) * r, Math.sin(ang) * r * sy, 0)));
    }
    function sprPose(f, name, dur) {        // đổi dáng: tấm mới hiện dần, tấm cũ mờ dần (chạm = bỏ qua → tween xong ngay, vẫn đúng tấm cuối)
      const S = sprOf(f); if (!S || !S.cards[name]) return Promise.resolve();
      if (arena.sprLog) arena.sprLog.push({ id: f.id, t: f.t, c: f.c, pose: name, at: performance.now() });
      if (S.pose === name && S.cards[name].material.opacity >= 1) return Promise.resolve();
      const tok = ++S.tok, to = S.cards[name], P = S.set.poses[name];
      S.pose = name; sprBlade(f, name);
      // mẫu "mượt hơn": đổi dáng có lực — lấy đà rướn lên, chém bè ra, đỡ lún xuống, trúng đòn co lại (tự về 1 theo giờ thật)
      const SQ = { windup: [0.95, 1.05], strike: [1.09, 0.95], block: [1.04, 0.97], hit: [0.92, 1.05], kneel: [1.05, 0.94],
        jump: [0.94, 1.07], slash: [1.08, 0.95], thrust: [1.1, 0.95], dodge: [0.94, 1.03],
        raise: [0.97, 1.04], coil: [1.04, 0.97], chamber: [1.03, 0.98], recover: [0.99, 1.01] }[name];
      if (SQ && dur) sprSquash(f, SQ[0], SQ[1]);
      for (const a of S.attach) { const pt = P[a.mark] || P.chest; a.obj.position.copy(sprLocal(P, pt, a.obj.position.z)); }
      to.visible = true;
      const others = Object.values(S.cards).filter(c => c !== to), o0 = others.map(c => c.material.opacity), t0 = to.material.opacity;
      const end = () => { if (tok !== S.tok) return; to.material.opacity = 1; for (const c of others) { c.material.opacity = 0; c.visible = false; } };
      if (!dur) { end(); return Promise.resolve(); }
      return tween(dur, k => { if (tok !== S.tok) return; to.material.opacity = t0 + (1 - t0) * k; others.forEach((c, i) => { c.material.opacity = o0[i] * (1 - k); }); }, EASE.lin).then(end);
    }
    function sprMark(f, mark) {              // mốc của dáng ĐANG đứng → toạ độ thế giới (null nếu dáng không có mốc đó)
      const S = sprOf(f), P = S.set.poses[S.pose]; if (!P || !P[mark]) return null;
      f.root.updateWorldMatrix(true, true);
      return f.model.localToWorld(sprLocal(P, P[mark], 0.04));
    }
    const sprContact = D => sprMark(D, 'shield') || sprMark(D, 'parry') || sprMark(D, 'chest');
    function sprTipX(A, pose, rootX) {       // mũi kiếm (trục x thế giới) nếu A đứng dáng `pose` với gốc ở rootX
      const S = sprOf(A), P = S.set.poses[pose]; if (!P || !P.tip) return rootX;
      return rootX + sprLocal(P, P.tip).x * (S.mirror ? -1 : 1);
    }
    function sprOrder(top, under) {          // con đang chém vẽ ĐÈ lên con kia (lưỡi kiếm chồng lên mặt khiên như hình đích)
      for (const [f, o] of [[top, 3], [under, 2]]) if (sprOf(f)) for (const c of Object.values(f.spr.cards)) c.renderOrder = o;
    }
    /* ---------- MẪU 2 (11-23): nhiều kiểu đánh + lùi né + đòn kết TRÚNG NGƯỜI (Nam: "đánh thì chỉ có 1 kiểu", "đòn kết thúc phải trúng
       đối thủ, kiếm đâm trúng, hoặc chém trúng làm đôi"). Dáng mới ChatGPT vẽ: jump (nhảy chém), slash (chém ngang), dodge (lùi né),
       thrust (đâm). Thiếu dáng nào thì tự lùi về chém thẳng. ---------- */
    const sprHas = (f, pose) => !!(sprOf(f) && sprOf(f).set.poses[pose]);
    const sprSgn = f => (sprOf(f).mirror ? -1 : 1);
    // kiểu đánh theo LƯỢT trong trận (bộ đếm arena.plan đặt lại mỗi trận): chém ngang → nhảy chém → chém thẳng → đâm → … — trận 2 hiệp
    // (4 nhát) đủ cả 4 kiểu; con thiếu dáng nào thì bỏ kiểu đó
    const SPR_PLAN = ['slash', 'jump', 'strike', 'thrust'];
    function sprPlan(f, i) { const K = (arena.planOrder || SPR_PLAN).filter(k => sprHas(f, k)); return K.length ? K[i % K.length] : 'strike'; }
    /* 11-24 DÁNG CHUYỂN TIẾP (Nam: "vẫn còn hơi giật" → chọn "Đổi dáng cái rụp"). Mỗi đòn đi qua 4–5 tấm thay vì 3, mỗi lần đổi tấm là
       sang một tấm GẦN GIỐNG tấm trước (ChatGPT vẽ 8 tấm mới, mỗi con 4):
         chém thẳng: thủ → lấy đà → kiếm dựng qua đỉnh đầu (raise) → chém → đứng dậy thu kiếm (recover) → thủ
         nhảy chém:  thủ → lấy đà → nhảy → kiếm qua đỉnh đầu lúc rơi (raise) → chém → recover → thủ
         chém ngang: thủ → lấy đà → raise → chém ngang → recover → thủ
         đâm:        thủ → rút kiếm về hông mũi chĩa tới (chamber) → đâm → recover → thủ
       Con thiếu tấm nào thì bỏ qua tấm đó (về đúng như mẫu 2). Tấm "vặn người kéo kiếm ra SAU ngang hông" (coil) ChatGPT đã vẽ
       nhưng KHÔNG dùng: soi từng khung 11-24 — gót sau đứng ±1,52 mà khung chỉ ±1,75 → lưỡi kiếm chĩa ra sau nằm trọn NGOÀI khung
       suốt lúc lấy đà (thấy người khom, mất kiếm). */
    const WIND = { strike: 'windup', jump: 'windup', slash: 'windup', thrust: 'chamber' };
    const sprWind = (f, kind) => (sprHas(f, WIND[kind]) ? WIND[kind] : 'windup');
    function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; }
    function sprChestW(f, pose, rootX, rootY) { const P = sprOf(f).set.poses[pose], l = sprLocal(P, P.chest); return new T.Vector3(rootX + l.x * sprSgn(f), rootY + l.y, 0); }
    function splitPoly(w, h, c, n) {         // hình chữ nhật tâm 0 (rộng w, cao h) cắt bởi đường qua c, pháp tuyến n → 2 đa giác + 2 đầu mút đường cắt
      const R = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]];
      const side = p => (p[0] - c[0]) * n[0] + (p[1] - c[1]) * n[1];
      const A = [], B = [], cut = [];
      for (let i = 0; i < 4; i++) {
        const p = R[i], q = R[(i + 1) % 4], sp = side(p), sq = side(q);
        (sp >= 0 ? A : B).push(p);
        if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq), x = [p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]; A.push(x); B.push(x); cut.push(x); }
      }
      return { A, B, cut };
    }
    function polyGeo(poly, w, h, off) {      // đa giác lồi → tam giác quạt; toạ độ ảnh (uv) tính lại theo vị trí trong tấm
      const pos = [], uv = [];
      for (let i = 1; i < poly.length - 1; i++) for (const p of [poly[0], poly[i], poly[i + 1]]) { pos.push(p[0] - off[0], p[1] - off[1], 0); uv.push(p[0] / w + 0.5, p[1] / h + 0.5); }
      const g = new T.BufferGeometry(); g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
      return g;
    }
    let splitGlowMat = null;
    function splitGlowMats() {               // mép cắt cháy: tạo 1 lần (bước dịch sẵn gọi trước → nhát chém làm đôi không phải dịch / nạp gì mới)
      if (splitGlowMat) return;
      const tx = canvasTex(64, (g, s) => { const gr = g.createLinearGradient(0, 0, 0, s); gr.addColorStop(0, 'rgba(255,90,0,0)'); gr.addColorStop(0.5, 'rgba(255,230,160,1)'); gr.addColorStop(1, 'rgba(255,90,0,0)'); g.fillStyle = gr; g.fillRect(0, 0, s, s); });
      splitGlowMat = new T.MeshBasicMaterial({ map: tx, color: new T.Color(2.2, 1.5, 1.0), transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, side: T.DoubleSide });
      warm.keep.push(splitGlowMat);
    }
    // đoạn đường cắt nằm trên THÂN NGƯỜI (độ trong của tranh > ~40%) → [t0, t1] theo tỉ lệ từ a tới b. Đo 11-23 lần 1: mép cháy dài bằng
    // nguyên tấm tranh (cả chỗ trống quanh người) → lúc nửa trên xoay, 2 vệt sáng dài chéo nhau thành dấu X to giữa đấu trường
    const sprAlphaCv = {};
    function sprAlphaSpan(map, a, b, w, h) {
      const img = map && map.image; if (!img || !img.width) return [0, 1];
      let A = sprAlphaCv[map.uuid];
      if (!A) {                                // ảnh thu 1/4 cho nhẹ; ảnh data-URI cùng nguồn → đọc được điểm ảnh
        const c = document.createElement('canvas'); c.width = Math.max(1, img.width >> 2); c.height = Math.max(1, img.height >> 2);
        const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(img, 0, 0, c.width, c.height);
        A = sprAlphaCv[map.uuid] = { d: g.getImageData(0, 0, c.width, c.height).data, w: c.width, h: c.height };
      }
      let t0 = -1, t1 = -1;
      for (let i = 0; i <= 160; i++) {
        const t = i / 160, x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
        const px = Math.min(A.w - 1, Math.max(0, ((x / w + 0.5) * A.w) | 0)), py = Math.min(A.h - 1, Math.max(0, ((0.5 - y / h) * A.h) | 0));
        if (A.d[(py * A.w + px) * 4 + 3] > 100) { if (t0 < 0) t0 = t; t1 = t; }
      }
      return t0 < 0 ? [0, 1] : [t0, t1];
    }
    function sprSplit(D, A, at) {            // CHÉM LÀM ĐÔI: cắt tấm tranh con thua theo đường chém → 2 mảnh, mép cắt cháy đỏ, KHÔNG máu
      const S = sprOf(D), card = S.cards[S.pose]; if (!card) return;
      const P = S.set.poses[S.pose], w = P.w * SPR.wpp, h = P.h * SPR.wpp;
      D.root.updateWorldMatrix(true, true);
      const lp = card.worldToLocal(at.clone());
      const tilt = 0.2 * (S.mirror ? -1 : 1) * (Math.sign(D.root.position.x - A.root.position.x) || 1);
      const { A: up, B: lo, cut } = splitPoly(w, h, [lp.x, Math.max(-h * 0.3, Math.min(h * 0.3, lp.y))], [Math.sin(tilt), Math.cos(tilt)]);
      if (cut.length !== 2) return;
      splitGlowMats();
      const mid = [(cut[0][0] + cut[1][0]) / 2, (cut[0][1] + cut[1][1]) / 2];
      const len = Math.hypot(cut[1][0] - cut[0][0], cut[1][1] - cut[0][1]), ang = Math.atan2(cut[1][1] - cut[0][1], cut[1][0] - cut[0][0]);
      const [s0, s1] = sprAlphaSpan(card.material.map, cut[0], cut[1], w, h), sm = (s0 + s1) / 2;   // mép cháy chỉ trên thân người
      const gx = cut[0][0] + (cut[1][0] - cut[0][0]) * sm - mid[0], gy = cut[0][1] + (cut[1][1] - cut[0][1]) * sm - mid[1];
      const glows = [];
      const halves = [up, lo].map(poly => {
        const g = new T.Group(); g.position.set(card.position.x + mid[0], card.position.y + mid[1], card.position.z); D.model.add(g);
        const m = new T.Mesh(polyGeo(poly, w, h, mid), sprMat(card.material.map)); m.renderOrder = card.renderOrder; m.frustumCulled = false; g.add(m);
        const e = new T.Mesh(new T.PlaneGeometry(Math.max(0.1, (s1 - s0) * len * 1.08), 0.06), splitGlowMat.clone());
        e.rotation.z = ang; e.position.set(gx, gy, 0.01); e.renderOrder = 7; e.frustumCulled = false; g.add(e); glows.push(e);
        return g;
      });
      for (const c of Object.values(S.cards)) c.visible = false;
      const away = (Math.sign(D.root.position.x - A.root.position.x) || 1) * (S.mirror ? -1 : 1);
      const [U, L] = halves, u0 = U.position.clone(), l0 = L.position.clone(), K = D.k || 1;
      sfx('heavy', 0.7); burst(at, 70, 0xff8a3a, 1.0 * K); fan(at, new T.Vector3(Math.sign(D.root.position.x - A.root.position.x) || 1, 0.2, 0).normalize(), 90, 0xffb347, 1.2);
      S.split = (async () => {
        await wait(0.12);                        // mảnh trên đứng yên một tích tắc rồi mới trượt theo nhát chém
        await tween(0.55, k => {
          // nửa trên trượt RA khỏi nửa dưới rồi mới rơi (đo 11-23 lần 1: trượt 0,32 + rơi 0,42 + xoay 1,0 → nửa trên rơi chồng lên nửa dưới, rối)
          U.position.set(u0.x + away * 0.55 * k, u0.y + 0.06 * Math.sin(k * Math.PI) - 0.36 * k * k * k, u0.z); U.rotation.z = -away * 0.75 * k * k;
          L.position.set(l0.x - away * 0.03 * k, l0.y - 0.05 * k, l0.z); L.rotation.z = away * 0.14 * k;
          for (const e of glows) e.material.opacity = 1 - 0.55 * k;          // mép cháy nguội dần trong lúc nửa trên trượt
        }, EASE.lin);
        const c = D.root.position.clone(); c.y = 0.4 * K; burst(c, 40, 0xff8a3a, 0.7 * K); sfx('poof', 0.6);
        await tween(0.75, k => {
          for (const g of halves) g.traverse(o => { if (o.material) o.material.opacity = (glows.indexOf(o) >= 0 ? 0.45 : 1) * (1 - k); });
          U.position.y -= 0.005; L.position.y -= 0.004;
          if (Math.random() < 0.4) burst(c, 2, 0xff9a40, 0.4 * K);
        }, EASE.in);
        for (const g of halves) { D.model.remove(g); g.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); }
      })();
    }
    function sprShove(D, dS, push) {         // trúng / đỡ đòn: dạt ra sau một chút rồi về chỗ
      const x0 = D.root.position.x;
      return tween(0.07, k => { D.root.position.x = x0 + dS * push * k; }, EASE.out).then(() => tween(0.22, k => { D.root.position.x = x0 + dS * push * (1 - k); }));
    }
    /* vết nứt khiên cho Mã tranh: lưới nứt toả từ chỗ trúng (vẽ 2 lượt cùng hình: quầng cam mờ + lõi vàng trắng) + mảnh khiên văng */
    let sprCrackMat = null, sprChipMat = null;
    function sprCrackMats() {
      if (sprCrackMat) return;
      let seed = 7; const rr = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
      const tx = canvasTex(256, (g, s) => {
        const draw = (w, col, blur) => {
          seed = 7; g.strokeStyle = col; g.shadowColor = 'rgba(255,70,0,1)'; g.shadowBlur = blur; g.lineCap = 'round'; g.lineJoin = 'round';
          const br = (x, y, a, len, lw, dep) => {
            if (dep > 3 || len < 5) return;
            let px = x, py = y; g.lineWidth = lw; g.beginPath(); g.moveTo(px, py);
            const n = 3 + ((rr() * 3) | 0);
            for (let i = 0; i < n; i++) { a += (rr() - 0.5) * 0.9; px += Math.cos(a) * len / n; py += Math.sin(a) * len / n; g.lineTo(px, py); }
            g.stroke();
            if (rr() < 0.75) br(px, py, a + (rr() - 0.5) * 1.4, len * 0.55, lw * 0.62, dep + 1);
            if (rr() < 0.45) br(x + (px - x) * 0.5, y + (py - y) * 0.5, a + (rr() < 0.5 ? 1 : -1) * (0.6 + rr() * 0.6), len * 0.5, lw * 0.6, dep + 1);
          };
          for (let i = 0; i < 9; i++) br(s / 2, s / 2, i / 9 * Math.PI * 2 + rr() * 0.4, s * (0.28 + rr() * 0.16), w, 0);
        };
        draw(7, 'rgba(255,80,20,0.75)', 14);
        draw(2.4, 'rgba(255,236,180,1)', 4);
      });
      sprCrackMat = new T.MeshBasicMaterial({ map: tx, color: new T.Color(2.2, 1.5, 1.0), transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false, side: T.DoubleSide });
      // mảnh khiên: sẫm, ánh than hồng (lần 1 màu 0x5a1c1c dưới đèn ra HỒNG NHẠT như giấy vụn)
      sprChipMat = new T.MeshStandardMaterial({ color: 0x2a1412, emissive: 0x5a1600, roughness: 0.45, metalness: 0.7 });
      warm.keep.push(sprCrackMat, sprChipMat);   // giữ sống: dispose = máy xoá chương trình vẽ → trận sau phải dịch lại
    }
    function sprCrack(D, A) {
      const P0 = sprOf(D).set.poses[sprOf(D).pose]; if (!P0 || !P0.shield) return;
      sprCrackMats();
      const m = new T.Mesh(new T.PlaneGeometry(0.62, 0.62), sprCrackMat); m.renderOrder = 6; m.frustumCulled = false;
      m.position.copy(sprLocal(P0, P0.shield, 0.06)); m.rotation.z = rnd(0, 6.28);
      D.model.add(m); sprOf(D).attach.push({ obj: m, mark: 'shield' });
      tween(0.22, k => { m.scale.setScalar(0.35 + 0.65 * k); }, EASE.out);
      const p = sprMark(D, 'shield'), away = new T.Vector3(Math.sign(D.root.position.x - A.root.position.x) || 1, 0, 0), K = D.k || 1;
      for (let i = 0; i < 14; i++) {
        const o = new T.Mesh(new T.TetrahedronGeometry(rnd(0.012, 0.03) * K), sprChipMat);
        o.position.copy(p).add(new T.Vector3(rnd(-0.08, 0.08), rnd(-0.1, 0.12), rnd(0, 0.1)));
        addDebris(o, away.clone().multiplyScalar(rnd(0.8, 2.6)).add(new T.Vector3(rnd(-1.1, 1.1), rnd(0.6, 2.6), rnd(-0.3, 0.5))), new T.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)), rnd(1.0, 1.6));
      }
      sprCrackMat.opacity = 1;
    }
    /* ĐÒN ĐÁNH TRANH — mẫu 2 (11-23), 4 kiểu (con thiếu dáng nào → chém thẳng như bản 5):
       · strike chém thẳng: lấy đà (lùi nửa bước) → lao tới tấm "chém", chân sau đứng yên, gốc trượt sao cho mũi kiếm vào đúng chỗ chạm
         (tâm khiên / chỗ đỡ / ngực); kiếm ảo quét vòng qua đỉnh đầu kéo vệt lửa
       · slash chém ngang: như trên nhưng tấm "chém ngang", vòng quét DẸT ngang ngực; chỗ chạm theo độ cao lưỡi
       · jump nhảy chém: lấy đà → bật lên tấm "nhảy" bay cung ~0,42 về phía trước → rơi xuống đổi tấm "chém", mũi kiếm vào chỗ chạm
       · thrust đâm: tấm "đâm", lưỡi duỗi thẳng ra trước
       Bên bị đánh (opt.react 'auto'): đòn CHÉM XUỐNG (chém thẳng / nhảy chém) → lùi né (tấm "lùi né" ngả người ra sau + lùi + nảy nhẹ
       đúng lúc kiếm tới → lưỡi bổ xuống khoảng trống trước mặt, chỉ tiếng vút); đòn NGANG (chém ngang / đâm) → đỡ (khiên/kiếm → tia lửa).
       Đo 11-23 lần 2: né đòn ngang thì lưỡi ngang ngực luôn quẹt qua kiếm giơ cao / khiên của người né → nhìn như đỡ, không như né.
       Đòn kết chết thật (opt.final + opt.fin, cả hai là tranh): bên thua KHÔNG giơ khiên → kiếm trúng NGƯỜI — fin 'stab' đâm xuyên:
       đúng lúc mũi kiếm tới, người thua đổi tấm "trúng đòn" (ngả ra sau, khiên dạt ra sau lưng, bụng hở — đo 11-23: ở dáng thủ thế khiên
       Mã che ngang ngực → lưỡi lút vào KHIÊN) và vẽ ĐÈ lên kiếm → lưỡi lút vào bụng, tia lửa toé ra sau lưng; fin 'split' chém ngang
       làm đôi (sprSplit). Đòn kết không chết (hurt) giữ như bản 5: đỡ khiên + khiên nứt. Máy quay ĐỨNG YÊN (Nam 11-23: rung = chóng mặt). */
    // lùi né: gót chân sau đứng cách mép khung ~0,23 (khung ±1,75 ở z=0) mà tấm "lùi né" còn chìa ra sau gót ~0,18 → chỉ lùi 0,12
    // (bản đầu lùi 0,24: Vua lòi nửa người ra ngoài mép trái); kiếm người đánh dừng TRƯỚC ngực chỗ đối thủ vừa đứng 0,35 (bản đầu 0,1:
    // mũi kiếm dừng ngay đầu gối chân co của người né → nhìn như trúng)
    const DODGE_BACK = 0.12, DODGE_SHORT = 0.35;
    function sprDodge(D, dS) {  // lùi né: tấm "lùi né" + lùi ra sau + nảy nhẹ; trả chỗ đứng cũ để về lại sau khi kiếm trượt
      const x0 = D.root.position.x, y0 = D.root.position.y;
      sprPose(D, 'dodge', 0.05);
      return tween(0.2, k => { D.root.position.x = x0 + dS * DODGE_BACK * EASE.out(k); D.root.position.y = y0 + 0.06 * Math.sin(k * Math.PI); }, EASE.lin).then(() => ({ x0, y0 }));
    }
    async function sprStrike(A, D, opt) {
      const p0x = A.root.position.x, y0 = A.root.position.y, dS = Math.sign(D.root.position.x - p0x) || 1, sD = !!sprOf(D);
      const fin = opt.final && sD ? (opt.fin || null) : null;
      const i = arena.plan || 0; if (!opt.final) arena.plan = i + 1;                     // lượt thứ i trong trận
      let kind = fin === 'stab' ? 'thrust' : fin === 'split' ? 'slash' : opt.final ? 'strike' : (opt.kind || sprPlan(A, i));
      if (!sprHas(A, kind)) kind = 'strike';
      const land = kind === 'jump' ? 'strike' : kind;          // dáng lúc kiếm chạm (nhảy chém đáp xuống bằng tấm "chém")
      const dodge = !opt.final && sD && sprHas(D, 'dodge') && (opt.react === 'dodge' || (opt.react === 'auto' && land === 'strike'));
      const stab = fin === 'stab' && sprHas(D, 'hit');           // đâm: người thua đổi tấm "trúng đòn" đúng lúc mũi kiếm tới
      sfx('whoosh', 0.7, rnd(0.9, 1.15));
      sprOrder(A, D);
      // bên bị đánh: đỡ → giơ khiên · lùi né / đòn kết chết thật → đứng thủ thế (KHÔNG giơ khiên → kiếm trúng người)
      const guard = sD ? sprPose(D, (dodge || fin) ? 'stance' : 'block', 0.07) : (opt.block || opt.final ? shield(D, true, 0.18) : Promise.resolve());
      const wind = sprWind(A, kind);                             // tấm lấy đà theo kiểu đòn (chém ngang: coil · đâm: chamber · còn lại: windup)
      await Promise.all([sprPose(A, wind, 0.08), tween(0.2, k => { A.root.position.x = p0x - dS * 0.06 * k; }, EASE.out), guard]);
      let at;
      if (stab) { at = sprChestW(D, 'hit', D.root.position.x, D.root.position.y); at.z = 0.04; }   // ngực ở dáng "trúng đòn"
      else if (fin || dodge) at = sprMark(D, 'chest');
      else at = sD ? sprContact(D) : strikePoint(A, D);
      if (land === 'slash' || land === 'thrust') {            // lưỡi nằm ngang: chỗ chạm theo độ cao lưỡi (tia lửa / vết cắt đúng chỗ lưỡi đi qua)
        const P = sprOf(A).set.poses[land], ty = y0 + sprLocal(P, P.tip).y;
        at.y = Math.max(at.y - 0.25, Math.min(at.y + 0.25, ty));
      }
      // mũi kiếm vào QUÁ chỗ chạm: đỡ 3 cm · đâm xuyên 16 cm · chém ngang qua hết người · lùi né: dừng TRƯỚC ngực chỗ đối thủ vừa đứng
      const past = fin === 'stab' ? 0.16 : fin === 'split' ? 0.34 : dodge ? -DODGE_SHORT : 0.03;
      let step = at.x - sprTipX(A, land, p0x) + dS * past;
      // bị né: người đánh không được LÙI quá 0,12 lúc ra đòn (tranh "đâm" / "chém" dài ~2,2–2,7 → muốn kiếm dừng trước người né thì
      // phải lùi tới 0,5: đo 11-23, Mã vừa đâm vừa lùi ra nửa người ngoài mép khung)
      step = dS * Math.max(dodge ? -0.12 : -0.6, Math.min(fin ? 1.2 : 0.9, step * dS));
      const xb = A.root.position.x, xe = p0x + step;
      let dodging = null;
      if (kind === 'jump') {
        // tâm vung (ngực) đi êm từ ngực lúc lấy đà tới ngực lúc đáp; gốc tranh đặt theo tâm đó (gốc tấm "nhảy" = chân THẤP nhất,
        // khác chân sau của tấm khác → đặt theo gốc thì người giật lùi nửa thân lúc đổi tấm)
        const sg = sprSgn(A), PS = sprOf(A).set.poses, cw = sprChestW(A, 'windup', xb, y0), ce = sprChestW(A, land, xe, y0), H = 0.42;
        const place = (pose, cx) => { A.root.position.x = cx - sprLocal(PS[pose], PS[pose].chest).x * sg; };
        sfx('whoosh', 0.6, 0.75);
        sprPose(A, 'jump', 0.04);
        let gi = 0;
        await tween(0.24, k => {
          place('jump', cw.x + (ce.x - cw.x) * 0.75 * k); A.root.position.y = y0 + H * Math.sin(k * Math.PI / 2);
          if (k >= 0.4 * (gi + 1) && gi < 2) sprGhost(A, 0.24 - 0.1 * gi++);
        }, EASE.out);
        if (dodge) dodging = sprDodge(D, dS);
        if (cut.arena) startTrail(A);
        const c0 = sprChestW(A, 'jump', A.root.position.x, A.root.position.y);
        const mid = sprHas(A, 'raise') ? 'raise' : null;       // 11-24: lúc rơi kiếm đi qua đỉnh đầu (tấm raise) rồi mới tới tấm chém
        let pose = 'jump';
        await tween(mid ? 0.19 : 0.15, k => {
          const cx = c0.x + (ce.x - c0.x) * k, cy = c0.y + (ce.y - c0.y) * k;
          A.root.position.y = y0 + H * (1 - k * k);
          if (mid && pose === 'jump' && k >= 0.3) { pose = mid; sprPose(A, mid, 0.03); }
          if (pose !== land && k >= (mid ? 0.62 : 0.45)) { pose = land; sprPose(A, land, 0.03); }
          place(pose, cx);
          sprSwing(A, k, land, 'jump', null, new T.Vector3((cx - A.root.position.x) * sg, cy - A.root.position.y, 0.02));
        }, EASE.lin);
        A.root.position.y = y0; A.root.position.x = xe;
        sprSwing(A, 1, land, 'jump');
        sfx('land', 0.55);
      } else {
        const mode = land === 'slash' ? 'flat' : land === 'thrust' ? 'line' : null;
        // 11-24: tấm đánh KHÔNG hiện ngay lúc bắt đầu lao (mẫu 2: lấy đà → chém trong 0,04 giây = "cái rụp"). Chém thẳng / chém ngang:
        // nửa đầu nhát lao là tấm kiếm qua đỉnh đầu (raise) rồi mới tới tấm chém. Đâm: giữ tấm rút kiếm (chamber) tới SW rồi đổi.
        // Chém ngang đi qua raise thì kiếm ảo quét TRÒN như chém thẳng: vòng dẹt 'flat' bắt đầu ở 30% độ dài → hụt 1 khúc lúc đổi tấm.
        // Kiếm ẢO (vệt lửa) quét NỐI 2 tấm đúng quanh lúc đổi tấm → lửa lấp khoảng giữa 2 hình (như khung nhoè trong phim hoạt hình).
        // Mẫu 2: tấm chém hiện từ đầu nhát lao còn kiếm ảo quét vòng ở 30% thời gian CUỐI (EASE.in) → hình và lửa lệch nhau.
        const mid = (land === 'strike' || land === 'slash') && sprHas(A, 'raise') ? 'raise' : null;
        const from = mid || wind, SW = mid ? 0.5 : 0.45;
        const swing = raw => {                                 // raw = giờ của nhát lao 0..1 → vị trí kiếm ảo
          if (!mid) return sprSwing(A, EASE.io(Math.max(0, Math.min(1, (raw - SW + 0.2) / 0.45))), land, wind, mode);
          if (raw < SW) return sprSwing(A, EASE.io(raw / SW), mid, wind);
          sprSwing(A, EASE.io(Math.min(1, (raw - SW) / 0.35)), land, mid);
        };
        swing(0);
        if (cut.arena) startTrail(A);
        if (mid) sprPose(A, mid, 0.035);
        if (dodge) dodging = sprDodge(D, dS);
        // 2 bóng mờ kéo theo lúc lao tới. Lần quay 1: 3 bóng đậm 0,42/0,32/0,22 sống 0,2 giây → ảnh chụp thấy cả 2 con nhân đôi nhoè
        let pose = from, gk = 0.35, gi = 0;
        await tween(mid ? 0.17 : 0.15, (k, raw) => {
          A.root.position.x = xb + (xe - xb) * k;
          if (pose !== land && raw >= SW) { pose = land; sprPose(A, land, 0.035); }
          swing(raw);
          if (k >= gk && gi < 2) { sprGhost(A, 0.26 - 0.11 * gi++); gk += 0.35; }
          if (stab && k >= 0.7 && sprOf(D).pose !== 'hit') { sprPose(D, 'hit', 0.03); sprOrder(D, A); }   // mũi kiếm sắp tới: ngả ra sau, vẽ đè lên kiếm
        }, EASE.in);
        sprSwing(A, 1, land, from, mid ? null : mode);
      }
      // đòn kết: giữ lửa bám lưỡi + vệt lửa bùng lại, đứng yên cùng tia sét (như knightStrike)
      if (opt.final && A.trail) {
        const tr = A.trail, t0 = clock.g; tr.hold = true;
        for (const s of tr.samples) s.t = t0 - (t0 - s.t) * 0.35;
        wait(0.12).then(() => { if (A.trail === tr) stopTrail(A); });
      } else stopTrail(A);
      if (dodge) {
        sfx('whoosh', 0.9, 1.3);                               // chém hụt: chỉ tiếng vút, không tia lửa
      } else if (fin) {
        hitFx(A, D, true, at); sprFlash(D, 1.1);
        if (fin === 'stab') {
          sfx('heavy', 1);
          if (stab) sprPose(D, 'hit', 0.02);
          sprOrder(D, A);                                      // người thua vẽ ĐÈ lên kiếm → lưỡi lút vào người
          const tipW = sprMark(A, 'tip');                      // tia lửa toé ra SAU LƯNG chỗ mũi kiếm xuyên qua
          if (tipW) fan(tipW, new T.Vector3(dS, 0.15, 0).normalize(), 60, 0xff9a40, 1.0);
        } else sprSplit(D, A, at);                             // chém ngang làm đôi (sprSplit tự có tiếng + tia lửa)
      } else if (opt.block) {
        hitFx(A, D, false, at); sfx(Math.random() < 0.5 ? 'clash' : 'clash2', 0.85, rnd(0.9, 1.1));
        if (sD) { sprSquash(D, 0.95, 1.03); sprFlash(D, 0.45); }
        await (sD ? sprShove(D, dS, 0.05) : lean(D, -0.22, 0.08));
      } else if (opt.final) {
        hitFx(A, D, true, at); sfx('heavy', 1);
        if (sD) { sprCrack(D, A); sprFlash(D, 1.1); }
      }
      // đòn kết: GIỮ khoảnh khắc kiếm chạm suốt lúc sét giáng (~0,45 giây trong cảnh) như hình đích. Đo 11-23 lần 1: chỉ giữ
      // 0,16 → khung sét chụp được Vua đã thu kiếm, Mã đã ngả ra sau, tia sét rơi vào khoảng trống giữa hai người
      await wait(opt.final ? 0.45 : 0.05);
      if (opt.final && sD && fin !== 'split') sprShove(D, dS, 0.1);
      // 11-24: về thủ thế qua tấm "đứng dậy thu kiếm" (recover) — mẫu 2 đổi thẳng tấm đánh (người choãi, kiếm duỗi) → thủ thế trong 0,08 giây
      const back = [sprHas(A, 'recover') ? sprPose(A, 'recover', 0.04).then(() => wait(0.09)).then(() => sprPose(A, 'stance', 0.07)) : sprPose(A, 'stance', 0.08),
        tween(0.26, k => { A.root.position.x = xe + (p0x - xe) * k; })];
      if (dodging) back.push(dodging.then(o => Promise.all([sprPose(D, 'stance', 0.1), tween(0.28, k => { D.root.position.x = o.x0 + dS * DODGE_BACK * (1 - k); D.root.position.y = o.y0; })])));
      else if (opt.block) back.push(sD ? sprPose(D, 'stance', 0.08) : Promise.all([lean(D, 0, 0.16), shield(D, false, 0.16)]));
      if (opt.final && sD && fin !== 'split') back.push(sprPose(D, 'hit', 0.05));     // đòn kết: bên trúng ngả ra sau (die() / hurt() lo tiếp)
      await Promise.all(back);
      sprBlade(A, 'stance');
    }
    function arenaCamPose(cam, side, aspect) {
      // khung như hình đích: máy quay thấp ngang ngực, hai người đánh chiếm ~nửa chiều cao khung
      // đo trên hình đích: chiến binh cao ~½ khung, chân tường ở ~62% từ trên → máy quay THẤP ngang gối, ngước nhẹ lên
      cam.position.set(0, 0.72, 5.6); cam.up.set(0, 1, 0); cam.lookAt(0, 1.08, 0);
      const roll = side === 'side' ? (orient === 'portrait' ? Math.PI / 2 : 0) : viewerInfo(side).roll;
      cam.rotateZ(roll);
      const rot90 = Math.abs(Math.abs(roll) - Math.PI / 2) < 0.01;
      const effA = rot90 ? 1 / aspect : aspect, d = 5.6;
      const fovH = 2 * Math.atan(1.75 / d), fovW = 2 * Math.atan(1.75 / effA / d);
      cam.fov = Math.max(fovH, fovW) * 180 / Math.PI; cam.aspect = aspect; cam.updateProjectionMatrix();
    }
    function enterArena(cap) {
      arena.scene.add(sparks, fxGrp, flashLight, streaks);
      sparks.material.size = 0.13;
      cut.active = true; cut.arena = true; cut.views = []; cut.shake = 0;
      // mẫu "mượt hơn": vào trận khung hơi rộng rồi máy từ từ tiến lại (đẩy máy vào ~2 giây)
      Object.assign(camFx, { z: 0.86, fx: 0, fy: 1.08, w: 0, tz: 1, tfx: 0, tfy: 1.08, tw: 0, rate: 1.3, punch: 0, pz: 0 }); arena.stopT = 0;
      const mk = (side, vp) => { const cam = new T.PerspectiveCamera(40, vp.w / vp.h, 0.1, 220); arenaCamPose(cam, side, vp.w / vp.h); cut.views.push({ cam, vp, to: { pos: cam.position.clone() } }); };
      if (cfg.cutscene === 'split') {
        if (orient === 'portrait') { mk('w', { x: 0, y: 0, w: PX, h: PX / 2 }); mk('b', { x: 0, y: PX / 2, w: PX, h: PX / 2 }); }
        else { mk('w', { x: 0, y: 0, w: PX / 2, h: PX }); mk('b', { x: PX / 2, y: 0, w: PX / 2, h: PX }); }
      } else mk(cfg.cutscene === 'side' ? 'side' : cap, { x: 0, y: 0, w: PX, h: PX });
    }
    function exitArena() {
      for (const f of arena.fighters) { stopTrail(f); arena.scene.remove(f.root); }
      arena.fighters = [];
      for (const tr of trails.splice(0, trails.length)) { arena.scene.remove(tr.mesh); tr.geo.dispose(); }
      arena.scene.remove(streaks); arena.slowT = 0; arena.flashK = 0; arena.stopT = 0;
      sparks.material.size = 0.09;
      scene.add(sparks, fxGrp, flashLight);
      cut.active = false; cut.arena = false; cut.views = []; cut.shake = 0;
    }
    /* màn chuyển cảnh: loé sáng vàng trắng phủ khung vẽ */
    const veil = document.createElement('div');
    veil.style.cssText = 'position:absolute;inset:0;pointer-events:none;opacity:0;border-radius:10px;background:radial-gradient(circle at 50% 50%, #fff8e6 0%, #ffd27a 38%, #3a1a08 100%);';
    host.appendChild(veil);
    async function veilTo(o, dur) { const o0 = +veil.style.opacity || 0; await tween(dur, k => { veil.style.opacity = String(o0 + (o - o0) * k); }, EASE.lin); }
    setTimeout(() => { try { buildArena(); } catch (e) { /* dựng lúc cần */ } }, 1200);

    /* ---------- DỊCH SẴN đấu trường lúc bàn cờ đứng yên (bản 4, đo 11-22) ----------
       Máy chỉ dịch chương trình vẽ (shader) của một thứ vào lần ĐẦU nó được VẼ. Đo (tools/look_slash.py chromium x fps 2):
       trận đầu mỗi lần mở trang đứng hình 3,3 giây lúc vào đấu trường + 3,1 giây đúng lúc sét; trận thứ hai mượt.
       Giờ: mỗi khung lúc bàn cờ đứng yên (không ai đang đi quân / đánh nhau) vẽ ngầm MỘT phần đấu trường theo đúng đường vẽ
       thật (gương + hậu kỳ, đủ bộ đèn như enterArena) rồi vẽ đè bàn cờ lên → người chơi không thấy, máy dịch dần từng phần.
       Vật liệu dùng để dịch sẵn KHÔNG dispose: dispose = máy xoá luôn chương trình vẽ → trận sau phải dịch lại. */
    const warm = { steps: null, i: 0, cur: null, n: 0, done: false, cam: null, keep: [], t0: 0, ms: 0, quietT: 0 };
    // chỉ dịch sẵn khi KHÔNG ai chạm màn hình + không có gì đang chuyển động ≥ WARM_QUIET giây (đo 11-22: bước dịch sẵn chạy ngay
    // sau cú chạm → cú chạm ăn quân tới trễ 1,9 giây; chạm bỏ qua trận rồi trang còn bận 0,5–1,7 giây)
    const WARM_QUIET = 1.5;
    addEventListener('pointerdown', () => { warm.quietT = performance.now(); }, true);
    function warmSteps() {
      const S = [];
      S.push(() => []);                                   // cảnh trống: sàn gương, phông, lò lửa, tàn lửa, tia lửa, đèn
      let n = 0;
      for (const t of ['k', 'n', 'q', 'r', 'b', 'p']) for (const c of ['w', 'b']) for (const art3d of (sprSetFor(t, c) ? [false, true] : [false])) {
        S.push(() => {                                    // từng chiến binh (tranh / giáp / hoạt hình), đủ 2 màu; loại có tranh thì dịch cả bản 3D (⚙ đổi được)
          const f = fighterFrom({ t, c, id: -900 - (n++) }, c === 'w' ? -0.9 : 0.9, { art3d });
          arena.fighters.splice(arena.fighters.indexOf(f), 1);
          const out = [f.root];
          if (f.spr) {                                    // tranh: mở đủ 6 tấm (tấm ẩn thì máy không nạp ảnh lên card đồ hoạ → trận đầu khựng)
            for (const cd of Object.values(f.spr.cards)) { cd.visible = true; cd.material.opacity = 1; }
            sprCrackMats(); splitGlowMats();
            const ck = new T.Mesh(new T.PlaneGeometry(0.5, 0.5), sprCrackMat); ck.position.set(0, 1, 0.3);
            const ch = new T.Mesh(new T.TetrahedronGeometry(0.05), sprChipMat); ch.position.set(0.2, 0.8, 0.3);
            const sg = new T.Mesh(new T.PlaneGeometry(0.4, 0.07), splitGlowMat); sg.position.set(-0.2, 1.1, 0.3);   // mẫu 2: mép cắt cháy (chém làm đôi)
            out.push(ck, ch, sg);
          }
          const cr = f.model.getObjectByName('crack');
          if (cr) { cr.visible = true; cr.material.uniforms.uReveal.value = 1; warm.keep.push(cr.material); }
          const sh = f.model.getObjectByName('shield'), face = sh && sh.getObjectByName('shieldFace');
          const fm = face && (Array.isArray(face.material) ? face.material[0] : face.material);
          if (fm && f.model.userData.knight) {           // mảnh khiên văng: cùng vật liệu mặt khiên nhưng hình khác
            const o = new T.Mesh(new T.TetrahedronGeometry(0.05), fm); o.castShadow = true;
            f.root.updateWorldMatrix(true, true); sh.getWorldPosition(o.position); o.position.z += 0.3;
            out.push(o);
          }
          return out;
        });
      }
      S.push(() => {                                      // vệt lửa theo lưỡi kiếm · sét · tia điện quấn lưỡi
        // mẫu 2: đọc sẵn độ trong của tranh "thủ thế" (chém làm đôi cắt tấm này) → nhát chém đầu tiên khỏi khựng ~50 ms lúc đọc ảnh
        for (const id in sprTex) if (/\/stance$/.test(id)) sprAlphaSpan(sprTex[id], [0, 0], [0, 0], 1, 1);
        const g = new T.BufferGeometry();
        g.setAttribute('position', new T.BufferAttribute(new Float32Array([-0.3, 1.2, 0, -0.3, 1.6, 0, 0.3, 1.2, 0, 0.3, 1.6, 0]), 3));
        g.setAttribute('aAge', new T.BufferAttribute(new Float32Array([0.2, 0.2, 0.1, 0.1]), 1));
        g.setAttribute('aSide', new T.BufferAttribute(new Float32Array([0, 1, 0, 1]), 1));
        g.setIndex([0, 1, 2, 1, 3, 2]);
        const tr = new T.Mesh(g, trailMat); tr.frustumCulled = false;
        const rib = (mat, y) => { const m = new T.Mesh(ribbonGeo([{ pts: [new T.Vector3(-0.4, y, 0), new T.Vector3(0, y + 0.1, 0), new T.Vector3(0.4, y, 0)], w0: 4, w1: 1 }]), mat); m.frustumCulled = false; return m; };
        return [tr, rib(boltMat, 1.4), rib(arcMat, 1.0)];
      });
      S.push(() => {                                      // lửa bám lưỡi · vòng sóng · vệt tia lửa · xúc xắc hai màu
        const fl = new T.Sprite(new T.SpriteMaterial({ map: TEX.glow, color: 0xff7a1a, transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
        fl.position.set(0, 1.2, 0); fl.scale.setScalar(0.3);
        const ring = new T.Mesh(new T.PlaneGeometry(1, 1), new T.MeshBasicMaterial({ map: ringTex, color: new T.Color(1.6, 1.3, 1.0), transparent: true, blending: T.AdditiveBlending, depthWrite: false, toneMapped: false }));
        ring.rotation.x = -Math.PI / 2; ring.position.set(0, 0.025, 0.5);
        warm.keep.push(ring.material);                    // giữ 1 vật liệu sống: vòng sóng thật dùng xong dispose → khỏi dịch lại mỗi trận
        const lg = new T.BufferGeometry();
        lg.setAttribute('position', new T.BufferAttribute(new Float32Array([0, 1, 0, 0.2, 1.2, 0]), 3));
        lg.setAttribute('color', new T.BufferAttribute(new Float32Array([1, 0.7, 0.3, 0.2, 0.1, 0]), 3));
        const st = new T.LineSegments(lg, streaks.material); st.frustumCulled = false;
        const dW = makeDie('w', ARENA_K), dB = makeDie('b', ARENA_K);   // makeDie tự gắn vào fxGrp (đang nằm trong đấu trường)
        dW.position.set(-0.5, 0.3, 1); dB.position.set(0.5, 0.3, 1);
        return [fl, ring, st, dW, dB];
      });
      return S;
    }
    function warmStep() {
      if (warm.done || !arena.scene || !arena.envReady) return;
      if (!warm.steps) {
        warm.steps = warmSteps(); warm.cam = new T.PerspectiveCamera(40, 1, 0.1, 220); arenaCamPose(warm.cam, 'w', 1); warm.t0 = performance.now();
        // gương soi từ máy quay trận thật chỉ thấy NỬA DƯỚI chiến binh (đo: mặt khiên + lửa bám lưỡi còn phải dịch giữa trận khi
        // mảnh khiên / người gục rơi xuống gần sàn) → lúc dịch sẵn, gương soi từ máy quay trên cao nhìn xuống: thấy trọn mọi thứ
        warm.camM = new T.PerspectiveCamera(50, 1, 0.1, 220); warm.camM.position.set(0, 5.5, 6.5); warm.camM.lookAt(0, 0.9, 0);
      }
      if (!warm.cur) {                                   // bước kế: vật của bước dựng 1 lần, các khung sau dùng lại
        const step = warm.steps[warm.i];
        if (!step) { warm.done = true; warm.ms = performance.now() - warm.t0; return; }
        warm.cur = { step, objs: null, mats: null, k: 0 };
      }
      const C = warm.cur, hid = [];
      arena.scene.add(sparks, fxGrp, flashLight, streaks);            // như enterArena: đúng bộ đèn + vật của trận thật
      let objs = [];
      try {
        if (!C.objs) C.objs = C.step() || [];
        objs = C.objs;
        for (const o of objs) if (!o.parent) arena.scene.add(o);
        // mỗi khung chỉ vẽ MỘT vật liệu của bước (vật khác của bước tạm ẩn) → lỡ trùng lúc người chơi chạm thì chỉ trễ bằng
        // thời gian dịch 1 vật liệu (đo 11-22: dịch nguyên 1 chiến binh mỗi khung chặn trang 0,5–2,4 giây lúc máy bận)
        const pool = [], uu = x => (Array.isArray(x.material) ? x.material : [x.material]).map(m => m.uuid);
        for (const r of (objs.length ? objs : [arena.scene])) r.traverse(x => { if (x.visible && x.material && (x.isMesh || x.isSprite || x.isPoints || x.isLine)) pool.push(x); });
        if (!C.mats) C.mats = [...new Set(pool.flatMap(uu))];
        const target = C.mats[C.k];
        for (const x of pool) if (uu(x).indexOf(target) < 0) { x.visible = false; hid.push(x); }
        R.setScissorTest(false); R.setViewport(0, 0, PX, PX);
        if (PP.composer && cfg.cutscene !== 'split') {
          updateMirror(warm.camM); PP.rpass.camera = warm.cam; PP.final.uniforms.uFlash.value = 0; PP.composer.render();
        } else { if (mirror.uni) mirror.uni.uReflK.value = 0; R.render(arena.scene, warm.cam); }
        warm.n++;
      } catch (e) {
        warm.done = true; console.error('dịch sẵn đấu trường hỏng:', e);   // trận thật vẫn tự dịch như cũ; bộ thử bắt lỗi này
      }
      for (const x of hid) x.visible = true;
      for (const o of objs) if (o.parent) o.parent.remove(o);
      arena.scene.remove(streaks); scene.add(sparks, fxGrp, flashLight);  // như exitArena: trả về bàn cờ
      if (!warm.done && ++C.k >= (C.mats ? C.mats.length : 0)) { warm.cur = null; warm.i++; }
    }

    /* ---------- vẽ ---------- */
    function render() {
      if (!cut.active) {
        R.setScissorTest(false); R.setViewport(0, 0, PX, PX); R.render(scene, boardCam); return;
      }
      const sh = cut.shake;
      if (cut.arena && cut.views.length === 1 && PP.composer) {     // đấu trường 1 khung: sàn gương + loá sáng + lượt màu cuối
        // mẫu 2 (11-23): máy quay ĐỨNG YÊN như bản 5 — mẫu 1 cho máy cận/giật/rung → Nam: "rung lắc gây chóng mặt"
        const v = cut.views[0], p0 = v.cam.position.clone();
        if (sh > 0) v.cam.position.add(new T.Vector3(rnd(-sh, sh), rnd(-sh, sh), rnd(-sh, sh)));
        R.setScissorTest(false); R.setViewport(0, 0, PX, PX);
        updateMirror(v.cam);
        PP.rpass.camera = v.cam; PP.final.uniforms.uFlash.value = arena.flashK || 0;
        PP.composer.render();
        v.cam.position.copy(p0);
        return;
      }
      if (mirror.uni) mirror.uni.uReflK.value = 0;                  // khung chia đôi: không có ảnh gương
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
    const clock = { t: 0, g: 0 };          // t = giờ thật · g = giờ TRONG CẢNH (chậm lại lúc quay chậm, nhanh lên lúc tua)
    function loop(now) {
      const raw = Math.min(0.05, (now - lastT) / 1000); lastT = now;
      const dt = raw * speed;
      clock.t += raw; clock.g += dt;
      stepTweens(dt);
      stepFx(dt);
      idle(clock.t);
      if (cut.arena) stepArena(raw, clock.t);
      updateBadges();
      updateIconBadges();
      for (const o of markGrp.children) if (o.userData.pulse) o.material.opacity = 0.6 + 0.35 * Math.sin(clock.t * 5);
      if (cut.active || playing || tweens.length) warm.quietT = performance.now();
      else if (!warm.done && performance.now() - warm.quietT > WARM_QUIET * 1000) warmStep();   // đứng yên đủ lâu → dịch sẵn 1 vật liệu
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
    // chiến binh MẶC GIÁP (chess_knights.js bản 4): nghiêng = nghiêng THÂN quanh khớp chậu (bàn chân vẫn bám sàn);
    // giơ khiên / thủ = dáng "guard"; vung tay kiểu cũ = bỏ (đòn chém giáp có đường riêng: knightStrike)
    async function lean(m, ang, dur, ez) {
      if (kp(m)) return poseTo(m, { lean: ang * 0.6 }, dur, ez);
      if (sprOf(m)) {                            // tranh: nghiêng TRONG mặt tranh quanh gót chân sau (âm = ngả ra sau, xa đối thủ)
        const z0 = m.pivot.rotation.z, z1 = -ang * 0.22 * m.spr.want;
        return tween(dur, k => { m.pivot.rotation.z = z0 + (z1 - z0) * k; }, ez);
      }
      const a0 = m.pivot.rotation.x, a1 = ang; await tween(dur, k => { m.pivot.rotation.x = a0 + (a1 - a0) * k; }, ez);
    }
    async function armSwing(m, a1, dur) { if (kp(m) || sprOf(m) || !m.rig || !m.rig.armR) return wait(dur); const a0 = m.rig.armR.rotation.x; await tween(dur, k => { m.rig.armR.rotation.x = a0 + (a1 - a0) * k; }); }
    async function shield(m, up, dur) {
      if (sprOf(m)) return sprPose(m, up ? 'block' : 'stance', Math.min(0.08, dur));
      if (kp(m)) { const o = arena.fighters.find(f => f !== m); return up && o ? knightGuard(m, o, Math.max(0.08, dur)) : knightRest(m, Math.max(0.08, dur)); }
      if (!m.rig || !m.rig.armL) return wait(dur); const a0 = m.rig.armL.rotation.x, a1 = up ? -1.45 : -0.2; await tween(dur, k => { m.rig.armL.rotation.x = a0 + (a1 - a0) * k; });
    }
    const contactPt = (A, D) => A.root.position.clone().lerp(D.root.position, 0.5).setY(0.55 * (A.k || 1));

    /* ---------- DÁNG chiến binh giáp: chỉ đổi con số trong model.userData.pose, khung xương tự tính góc khớp ---------- */
    const kp = m => (m && m.model && m.model.userData.knight) ? m.model.userData.pose : null;
    const KPOSE = () => window.ChessKnights.POSE;
    function poseTo(m, to, dur, ez) {        // tween các số / mảng số của dáng thân
      const P = kp(m); if (!P) return wait(dur);
      const from = {};
      for (const key in to) from[key] = Array.isArray(to[key]) ? P[key].slice() : P[key];
      return tween(dur, f => {
        for (const key in to) {
          const a = from[key], b = to[key];
          if (Array.isArray(b)) { for (let i = 0; i < b.length; i++) P[key][i] = a[i] + (b[i] - a[i]) * f; } else P[key] = a + (b - a) * f;
        }
      }, ez);
    }
    function swordTo(m, keys, dur, ez) {      // kiếm đi từ chỗ đang cầm qua lần lượt các khoá (đường vung cong)
      const P = kp(m); if (!P) return wait(dur);
      P.swk = [window.ChessKnights.swordNow(P)].concat(keys); P.swu = 0;
      return tween(dur, f => { P.swu = f; }, ez);
    }
    function shieldTo(m, key, dur, ez) {
      const P = kp(m); if (!P || !key) return wait(dur);
      const a = JSON.parse(JSON.stringify(P.shk));
      return tween(dur, f => { P.shk = { p: [0, 1, 2].map(i => a.p[i] + (key.p[i] - a.p[i]) * f), yaw: a.yaw + (key.yaw - a.yaw) * f, pitch: a.pitch + (key.pitch - a.pitch) * f }; }, ez);
    }
    function knightGuard(D, A, dur) {        // thủ trước đòn: Mã giơ khiên quay vào người chém; Vua (không khiên) đỡ bằng kiếm
      const P = kp(D), PO = KPOSE(), two = !!D.model.userData.twoHand;
      P.target = A.root.position.clone().setY(0.78 * (A.k || 1));
      const jobs = [poseTo(D, PO.body.guard, dur, EASE.out)];
      if (two) jobs.push(swordTo(D, [PO.swK.parry], dur, EASE.out));
      else jobs.push(shieldTo(D, PO.shield.guard, dur, EASE.out), swordTo(D, [PO.swN.guard], dur, EASE.out), tween(dur, f => { P.shAimW = f; }));
      return Promise.all(jobs);
    }
    function knightRest(D, dur) {
      const P = kp(D), PO = KPOSE(), two = !!D.model.userData.twoHand, w0 = P.shAimW;
      const jobs = [poseTo(D, PO.body.ready, dur), swordTo(D, [two ? PO.swK.rest : PO.swN.rest], dur)];
      if (!two) jobs.push(shieldTo(D, PO.shield.rest, dur), tween(dur, f => { P.shAimW = w0 * (1 - f); }));
      return Promise.all(jobs);
    }
    // điểm chém: giữa mặt khiên (Mã) · khúc giữa lưỡi kiếm đang đỡ (Vua) · ngực con hoạt hình
    function strikePoint(A, D) {
      const sh = kp(D) && D.model.getObjectByName('shield');
      if (sh) { D.root.updateWorldMatrix(true, true); return sh.localToWorld(new T.Vector3(0, 0.02, 0.02)); }
      const bl = kp(D) && D.model.getObjectByName('blade');
      if (bl) { D.root.updateWorldMatrix(true, true); return bl.localToWorld(new T.Vector3(0, (bl.userData.len || 0.4) * 0.35, 0)); }
      return contactPt(A, D);
    }
    // đòn kết trúng khiên: vết nứt đỏ rực toả ra từ chỗ trúng + mảnh khiên văng (hình đích "đỡ đòn")
    function shieldCrack(D, A) {
      const cr = D.model.getObjectByName('crack'), sh = D.model.getObjectByName('shield');
      if (!cr || !sh) return;
      cr.visible = true;
      const U = cr.material.uniforms;
      tween(0.26, f => { U.uReveal.value = f; U.uHeat.value = 3.2 - f * 0.8; }, EASE.out).then(() => tween(1.6, f => { U.uHeat.value = (2.4 - f * 1.1) * (0.85 + 0.15 * Math.sin(f * 40)); }, EASE.lin));
      const face = sh.getObjectByName('shieldFace'), mat = face && Array.isArray(face.material) ? face.material[0] : null;
      const p = sh.getWorldPosition(new T.Vector3()), away = p.clone().sub(A.root.position).setY(0).normalize(), K = D.k || 1;
      for (let i = 0; i < 16; i++) {
        const o = new T.Mesh(new T.TetrahedronGeometry(rnd(0.012, 0.03) * K), mat || new T.MeshStandardMaterial({ color: 0x3a2420 }));
        o.castShadow = true;
        o.position.copy(p).add(new T.Vector3(rnd(-0.06, 0.06), rnd(-0.08, 0.1), rnd(-0.06, 0.06)).multiplyScalar(K));
        addDebris(o, away.clone().multiplyScalar(rnd(0.8, 2.6)).add(new T.Vector3(rnd(-1.1, 1.1), rnd(0.6, 2.6), rnd(-1.1, 1.1))), new T.Vector3(rnd(-12, 12), rnd(-12, 12), rnd(-12, 12)), rnd(1.0, 1.6));
      }
    }
    /* ĐÒN CHÉM GIÁP (hình đích "đòn chém"): lấy đà vặn vai, kiếm vòng qua vai phải → lao tới chân trước bước dài, thân đổ tới,
       kiếm quét qua đỉnh đầu rồi NGẮM thẳng vào khiên / kiếm đỡ của đối thủ (điểm chạm ~2/3 lưỡi) → trúng → thu thế */
    async function knightStrike(A, D, opt) {
      const P = kp(A), PO = KPOSE(), KN = window.ChessKnights, two = !!A.model.userData.twoHand, SW = two ? PO.swK : PO.swN;
      const dKn = !!kp(D);
      sfx('whoosh', 0.7, rnd(0.9, 1.15));
      const guard = dKn ? knightGuard(D, A, 0.2) : (opt.block ? shield(D, true, 0.2) : Promise.resolve());
      await Promise.all([poseTo(A, PO.body.windup, 0.2, EASE.out), swordTo(A, [SW.windup], 0.2, EASE.out), guard]);
      const at = strikePoint(A, D);
      P.target = at; P.aimReach = 0.075 + KN.bladeLen(A.model) * 0.64;
      // bước tới một nhịp (đo ảnh tĩnh: không bước thì tay với không tới, điểm chạm trượt ra mũi kiếm, mũi xuyên qua khiên)
      const p0 = A.root.position.clone(), dS = D.root.position.clone().sub(p0).setY(0).normalize(), STEP = 0.14;
      if (cut.arena) startTrail(A);            // vệt lửa chỉ ở nhát chém xuống (như hình đích)
      await Promise.all([
        tween(0.14, f => { A.root.position.copy(p0).addScaledVector(dS, STEP * f); }, EASE.in),
        poseTo(A, PO.body.lunge, 0.14, EASE.in),
        swordTo(A, [SW.mid, SW.strike], 0.14, EASE.in),
        tween(0.14, f => { P.aimW = Math.max(0, (f - 0.45) / 0.55); P.fLy = Math.sin(Math.min(1, f * 1.1) * Math.PI) * 0.06; }, EASE.lin)
      ]);
      P.aimW = 1; P.fLy = 0;
      // đòn kết: giữ lửa bám lưỡi + đầu vệt lửa nóng thêm 0,12 giây trong cảnh (đang quay chậm → ~0,4 giây thật) để lúc sét giáng
      // vẫn còn lửa cùng sét như hình đích (đo 11-22: tắt lửa ngay lúc chạm → khung sét chỉ còn 1 búi lửa)
      // + lúc chạm, cả vệt lửa BÙNG lại (tuổi từng đoạn còn 35%: phần đặc chỉ có giữa nhát vung, tới lúc chạm đã vỡ thành búi)
      // rồi ĐỨNG yên cùng tia sét suốt lúc giữ, sau đó mới tàn — như tranh hình đích: vệt lửa đặc + sét cùng một khoảnh khắc
      if (opt.final && A.trail) {
        const tr = A.trail, t0 = clock.g; tr.hold = true;
        for (const s of tr.samples) s.t = t0 - (t0 - s.t) * 0.35;
        wait(0.12).then(() => { if (A.trail === tr) stopTrail(A); });
      } else stopTrail(A);
      if (opt.block) {
        hitFx(A, D, false, at); sfx(Math.random() < 0.5 ? 'clash' : 'clash2', 0.85, rnd(0.9, 1.1));
        await (dKn ? poseTo(D, PO.body.recoil, 0.09, EASE.out) : lean(D, -0.22, 0.08));
      } else if (opt.final) {
        hitFx(A, D, true, at); sfx('heavy', 1);
        if (dKn) { shieldCrack(D, A); poseTo(D, PO.body.recoil, 0.12, EASE.out); }
      }
      await wait(opt.final ? 0.14 : 0.05);
      const back = [poseTo(A, PO.body.ready, 0.24), swordTo(A, [SW.rest], 0.24), tween(0.24, f => { P.aimW = 1 - f; A.root.position.copy(p0).addScaledVector(dS, STEP * (1 - f)); })];
      if (opt.block) back.push(dKn ? knightRest(D, 0.24) : Promise.all([lean(D, 0, 0.16), shield(D, false, 0.16)]));
      await Promise.all(back);
      P.aimW = 0; P.target = null;
    }
    function hitFx(A, D, heavy, atIn) {
      const at = atIn ? atIn.clone() : contactPt(A, D);
      if (cut.arena) {                         // đấu trường: tia lửa quạt + loé; đòn kết thêm sét trời, vòng sóng, chậm lại, rung
        const dir = D.root.position.clone().sub(A.root.position).setY(0).normalize();
        fan(at, dir, heavy ? 120 : 60, 0xffb347, heavy ? 1.35 : 0.95);
        burst(at, heavy ? 36 : 16, 0xfff0c8, 1.0);
        flash(at, heavy ? 0.75 : 0.5);           // loé nhỏ: bản đầu 2,2 phủ trắng cả nửa khung
        if (heavy) {
          shockRing(D.root.position.clone(), A.k);
          if (A.model && A.model.getObjectByName('blade')) skyBolt(at);
          slowMo(0.28);
          // mẫu 2 (11-23): bỏ rung màn hình ở đòn kết — Nam: "màn hình rung lắc gây chóng mặt"
        }
        return;
      }
      const col = style === 'crystal' ? (A.c === 'w' ? 0x7ff4ff : 0xe39bff) : 0xffd27a;
      burst(at, heavy ? 70 : 28, col, heavy ? 1.3 : 0.8);
      flash(at, heavy ? 1.3 : 0.6);
      if (heavy) { cut.shake = 0.06; tween(0.3, k => { cut.shake = 0.06 * (1 - k); }); }
    }
    async function strike(A, D, opt) {       // A ra đòn, D đỡ (opt.block) hoặc trúng (opt.final)
      opt = opt || {};
      if (sprOf(A)) return sprStrike(A, D, opt);
      if (kp(A)) return knightStrike(A, D, opt);
      const p0 = A.root.position.clone(), dir = D.root.position.clone().sub(p0).setY(0).normalize();
      const K = A.k || 1;                      // đấu trường: chiến binh to gấp K → bước tới, nhảy cao cũng gấp K
      // chiến binh giáp tay + kiếm dài gần gấp đôi → bước tới ít (bản đầu: kiếm chém xuyên qua sau lưng đối thủ)
      const reach = (opt.final ? 0.26 : 0.18) * K * (A.model && A.model.userData.knight ? 0.3 : 1);
      const kind = A.t;
      sfx('whoosh', 0.7, rnd(0.9, 1.15));
      if (kind === 'n' && !(A.model && A.model.userData.knight)) {   // mã hoạt hình: nhảy lên rồi đá xuống (Mã mặc giáp thì vung kiếm như dưới)
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
        if (cut.arena) startTrail(A);          // vệt lửa chỉ ở nhát chém xuống (như hình đích)
        // chiến binh giáp dừng nhát chém ngang ngực đối thủ (vào khiên) — vung hết tới 0,35 thì kiếm dài cắm xuống sàn
        const endA = A.model && A.model.userData.knight ? -0.5 : 0.35;
        await Promise.all([tween(0.11, k => { A.root.position.copy(p0).addScaledVector(dir, reach * k); }, EASE.in), lean(A, 0.42, 0.11), armSwing(A, endA, 0.11)]);
        stopTrail(A);
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
      if (sprOf(A) && sprOf(D)) {            // mẫu 2: cặp tranh — mỗi nhát một kiểu đánh (sprPlan), bên bị đánh lúc đỡ lúc lùi né
        for (const [X, Y] of [[A, D], [D, A]]) await strike(X, Y, { block: true, react: 'auto' });
        return;
      }
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
      const SS = sprOf(M);
      if (SS && SS.split) {                    // mẫu 2: bị chém làm đôi — 2 mảnh tự trượt / rơi / tan (sprSplit) → xong thì ẩn, khỏi gục gối
        await SS.split; SS.split = null;
        M.root.visible = false; M.busy = false;
        return;
      }
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
          if (sprOf(M)) {                    // chiến binh tranh: mảnh vỡ theo bảng màu giáp trong tranh (không dán cả tấm ảnh lên mảnh)
            const pal = M.c === 'w' ? [0xc8ccd6, 0xa9b0bf, 0xd4a640, 0x2a3f9a] : [0x2b2a2e, 0x3a3236, 0x8a1c24, 0xc08a34];
            fm = new T.MeshStandardMaterial({ color: pal[(Math.random() * pal.length) | 0], roughness: 0.4, metalness: 0.6 });
          } else if (sm.vertexColors) {          // chiến binh gộp màu theo đỉnh → mảnh vỡ lấy màu áo / da / viền của đúng bên
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
        if (sprOf(M)) {
          // chiến binh tranh: gục gối → ngả nhẹ ra sau → tàn lửa bốc lên → chìm + mờ dần vào sàn. Đo 11-23 lần 1: đổ kiểu 3D (xoay 88°
          // quanh đầu gối) với tấm tranh phẳng = như bức ảnh bị xoay ngang, lăn ra ngoài mép khung, chỉ còn một mẩu mỏng
          sfx('land', 0.7);
          await sprPose(M, 'kneel', 0.09);
          await wait(0.5);
          const S = sprOf(M), away = Math.sign(pos.x - attackerPos.x) || 1, z0 = M.pivot.rotation.z, SK = M.k || 1;
          sfx('fall', 0.9);
          await tween(0.35, k => { M.pivot.rotation.z = z0 - away * 0.28 * k; M.root.position.x = pos.x + away * 0.06 * k; }, EASE.in);
          const c = M.root.position.clone(); c.y = 0.35 * SK;
          burst(c, 60, 0xff8a3a, 0.7 * SK); sfx('poof', 0.6);
          const y0 = M.root.position.y, cards = Object.values(S.cards);
          await tween(0.9, k => {
            M.root.position.y = y0 - k * 0.55 * SK; const o = 1 - k * k;
            for (const cd of cards) if (cd.visible) cd.material.opacity = Math.min(cd.material.opacity, o);
            if (S.attach.length && sprCrackMat) sprCrackMat.opacity = o;
            if (Math.random() < 0.5) burst(c, 2, 0xff9a40, 0.4 * SK);
          }, EASE.in);
          M.root.visible = false; M.busy = false;
          return;
        }
        if (kp(M)) {                            // chiến binh giáp: gục một gối, buông kiếm/khiên xuống, rồi mới đổ
          const PO = KPOSE(), two = !!M.model.userData.twoHand, P = kp(M);
          P.aimW = 0; P.shAimW = 0;
          sfx('land', 0.7);
          await Promise.all([poseTo(M, PO.body.kneel, 0.34, EASE.out), swordTo(M, [two ? PO.swK.down : PO.swN.down], 0.34, EASE.out), two ? Promise.resolve() : shieldTo(M, PO.shield.down, 0.34, EASE.out)]);
          await wait(0.28);
        }
        const away = pos.clone().sub(attackerPos).setY(0).normalize();
        const axis = new T.Vector3(away.z, 0, -away.x);
        const q0 = M.root.quaternion.clone();
        await tween(0.42, k => {
          M.root.quaternion.copy(q0); M.root.rotateOnWorldAxis(axis, k * Math.PI / 2 * 0.98);
          M.root.position.copy(pos).addScaledVector(away, k * 0.08);
        }, EASE.in);
        sfx('fall', 0.9);
        await tween(0.14, k => { M.root.position.y = TOP + Math.sin(k * Math.PI) * 0.06; });
        if (M.model && (M.model.userData.knight || M.model.userData.spr)) {   // giáp / tranh: không sao chóng mặt — tàn lửa bốc lên rồi chìm vào sàn
          const SK = M.k || 1, c = M.root.position.clone(); c.y = 0.25 * SK;
          burst(c, 60, 0xff8a3a, 0.7 * SK); sfx('poof', 0.6);
          await wait(0.45);
          const y0 = M.root.position.y;
          await tween(0.75, k => { M.root.position.y = y0 - k * 0.45 * SK; if (Math.random() < 0.5) burst(c, 2, 0xff9a40, 0.4 * SK); }, EASE.in);
          M.root.visible = false; M.busy = false;
          return;
        }
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
      if (sprOf(M)) {                             // tranh: tấm "trúng đòn" + tim bay lên, rồi về thủ thế
        const heart = new T.Sprite(new T.SpriteMaterial({ map: TEX.heart, transparent: true, depthWrite: false })); fxGrp.add(heart);
        const p = sprMark(M, 'chest') || M.root.position.clone().setY(1.1); heart.scale.set(0.42, 0.42, 1);
        await Promise.all([sprPose(M, 'hit', 0.05), tween(0.9, k => { heart.position.set(p.x, p.y + 0.3 + k * 0.6, p.z + 0.2); heart.material.opacity = 1 - k; })]);
        fxGrp.remove(heart);
        await sprPose(M, 'stance', 0.1);
        return;
      }
      const heart = new T.Sprite(new T.SpriteMaterial({ map: TEX.heart, transparent: true, depthWrite: false })); fxGrp.add(heart);
      const HK = M.k || 1, p = M.root.position.clone(); heart.scale.set(0.3 * HK, 0.3 * HK, 1);
      await Promise.all([lean(M, -0.4, 0.12), tween(0.9, k => { heart.position.set(p.x, (1.1 + k * 0.6) * HK, p.z); heart.material.opacity = 1 - k; })]);
      await lean(M, 0, 0.2);
      fxGrp.remove(heart);
    }

    /* ---------- ĐẠO DIỄN CẢNH ĐÁNH NHAU ---------- */
    let cfg = { death: 'topple', battleLen: 'long', cutscene: 'toward', fight: 'arena', art: 'paint' };   // art: 'paint' tranh ChatGPT (11-23) / '3d' giáp code (bản 4)
    // mẫu 2: kiểu đòn kết chết thật — Nam chọn 11-23 "Chém trúng làm đôi" → mặc định 'split'; ?fin=stab|split ép MỌI con (bộ thử / so)
    // 11-25 Nam chọn (popup "Đòn kết Tốt"): Tốt cầm giáo thắng → mỗi trận BỐC NGẪU NHIÊN đâm xuyên hoặc chém làm đôi; Vua, Mã giữ chém đôi
    const FIN_Q = (/[?&]fin=(stab|split)\b/.exec(location.search) || [])[1] || null;
    const finFor = w => FIN_Q || (w.t === 'p' ? (Math.random() < 0.5 ? 'stab' : 'split') : 'split');
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
        const gap = arenaGap(A0.t, D0.t, A0.c, D0.c);
        A = fighterFrom(A0, -gap); D = fighterFrom(D0, gap);
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
      // mẫu 2: bộ đếm kiểu đánh đặt lại mỗi trận + thứ tự 4 kiểu BỐC NGẪU NHIÊN mỗi trận (Nam 11-23 "Thứ tự đòn ngẫu nhiên" — bản đầu
      // trận nào cũng chém ngang → nhảy → chém thẳng → đâm). ?order=fixed giữ thứ tự cũ (bộ thử / quay phim so sánh)
      arena.plan = 0;
      // hooks.order (11-25, như hooks.fin): bộ thử ép thứ tự đòn của 1 trận — đo mũi giáo lúc bị đỡ khỏi phụ thuộc thứ tự bốc
      arena.planOrder = hooks.order ? hooks.order.slice() : /[?&]order=fixed\b/.test(location.search) ? SPR_PLAN.slice() : shuffle(SPR_PLAN.slice());
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
      // đòn kết — mẫu 2: con thua CHẾT THẬT thì kiếm trúng NGƯỜI (đâm xuyên / chém làm đôi); chỉ trúng đòn còn sống thì như bản 5
      const dieEv = follow.find(e => e.type === 'die');
      const fin = dieEv && dieEv.id === loser.id ? (hooks.fin || finFor(winner)) : null;   // hooks.fin: bộ thử ép từng kiểu (như hooks.win)
      arena.fin = fin;                                           // bộ thử đọc kiểu đòn kết vừa bốc (debug.arena.fin)
      await strike(winner, loser, { final: true, magic: true, fin });
      const hitEv = follow.find(e => e.type === 'hit');
      const bounceEv = follow.find(e => e.type === 'bounce');
      if (dieEv && cut.arena) camAim(0.96, 0, 1.08, 0.15, 1.0);   // mẫu "mượt hơn": máy lùi ra từ từ trong lúc con thua gục
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
      const win = (hooks && hooks.win) || (Math.random() < 0.6 ? 'a' : 'd');   // bộ thử chụp ép bên thắng bằng hooks.win
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
      get warmed() { return warm.done; },
      debug: {
        meshes, scene, renderer: R, boardCam, cut, tweens, arena, wallGrp, iconBadgeGrp, warm,
        finFor,                    // 11-25 luật đòn kết theo con thắng — bộ thử lấy mẫu: Tốt bốc ngẫu nhiên đâm/chém đôi, Vua/Mã chém đôi
        // bộ thử chụp ảnh: dựng 2 chiến binh đứng yên trong đấu trường (không diễn trận) — tools/look_knights.py
        showArena(ta, td, ca, cb) { buildArena(); for (const f of arena.fighters.slice()) arena.scene.remove(f.root); arena.fighters = []; ca = ca || 'w'; cb = cb || 'b'; const gap = arenaGap(ta, td, ca, cb); const A = fighterFrom({ t: ta, c: ca, id: -11 }, -gap), D = fighterFrom({ t: td, c: cb, id: -12 }, gap); enterArena(ca); return { A, D }; },
        // chiến binh tranh (11-23): đặt ngay một dáng · đọc dáng/lật/vị trí · bật sổ ghi đổi dáng (bộ thử) · chỉnh mức bù màu (đo ảnh)
        sprPose(f, name) { return sprPose(f, name, 0); },
        spr(f) { const S = sprOf(f); return S ? { pose: S.pose, mirror: S.mirror, x: +f.root.position.x.toFixed(3), cards: Object.keys(S.cards).length, attach: S.attach.length, split: !!S.split } : null; },
        sprLog(on) { arena.sprLog = on ? [] : null; },
        get sprLogData() { return arena.sprLog ? arena.sprLog.slice() : null; },
        sprComp(v) { sprUni.uComp.value = v; },
        sprMark(f, m) { const v = sprMark(f, m); return v ? [+v.x.toFixed(3), +v.y.toFixed(3)] : null; },
        sprTipX: (f, pose) => sprTipX(f, pose, f.root.position.x),
        get sprAlphaRead() { return Object.keys(sprAlphaCv).length; },     // mẫu 2: số tranh đã đọc sẵn độ trong (chém làm đôi)
        hideArena() { exitArena(); },
        // đặt ngay một dáng có tên cho chiến binh giáp (bộ chụp ảnh tools/look_knights.py): thân / kiếm / khiên
        knPose(f, body, sw, sh) {
          const P = kp(f), PO = KPOSE(); if (!P) return false;
          if (body && PO.body[body]) Object.assign(P, JSON.parse(JSON.stringify(PO.body[body])));
          const S = f.model.userData.twoHand ? PO.swK : PO.swN;
          if (sw && S[sw]) { P.swk = [JSON.parse(JSON.stringify(S[sw]))]; P.swu = 0; }
          if (sh && PO.shield[sh]) P.shk = JSON.parse(JSON.stringify(PO.shield[sh]));
          return true;
        },
        strikePoint
      }
    };
  }

  window.ChessView = { create, HEIGHT };
}());
