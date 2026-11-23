/* chess_knights.js — chiến binh MẶC GIÁP cho ĐẤU TRƯỜNG (Nam 11-21: "code + GPT vẽ hoa văn giáp").
   Dáng giáp dựng bằng code (mặt tròn xoay / mặt lưới cong mượt), da giáp = tấm "dải hoa văn" GPT vẽ (assets/knight_tex.js):
   mỗi mảnh giáp chọn đúng DẢI (bạc trơn, hoa văn khắc, viền vàng, đinh tán, dây thừng vàng, men xanh, gân bạc, dây da).
   Hợp đồng với chess_view.js (giống chiến binh cũ): đứng ở y=0, mặt nhìn +Z, cao ~1 đơn vị; tay vũ khí tên 'armR',
   tay khiên tên 'armL' (xoay quanh trục X, tay buông = trục −Y); userData.tick(dt) gọi mỗi khung hình (vai + khiên đi theo tay).
   Lưu ý: 'armR' đặt ở −X (tay PHẢI thật) để con bên trái màn hình vung kiếm phía GẦN máy quay — như hình đích. */
(function () {
  'use strict';
  const T = window.THREE, KT = window.KNIGHT_TEX;
  if (!T || !KT) return;
  const TAU = Math.PI * 2, lerp = (a, b, f) => a + (b - a) * f;
  const SHEET_PX = 1024;
  const BAND = { armor: KT.bands.armor, cloth: KT.bands.cloth };
  // tên dải (thứ tự trong tấm GPT vẽ, từ trên xuống)
  const A = { plain: 0, engr: 1, goldB: 2, rivet: 3, rope: 4, fleur: 5, flute: 6, leather: 7 };
  const C = { velvet: 0, fleur: 1, border: 2, fur: 3, tassel: 4, linen: 5 };

  /* ---------- da (texture) ---------- */
  const loader = new T.TextureLoader();
  const texCache = {};
  function tex(key, srgb, clampU) {
    if (texCache[key]) return texCache[key];
    const t = loader.load(KT[key]);
    t.encoding = srgb ? T.sRGBEncoding : T.LinearEncoding;
    t.wrapS = clampU ? T.ClampToEdgeWrapping : T.RepeatWrapping; t.wrapT = T.ClampToEdgeWrapping;
    t.anisotropy = 8;
    texCache[key] = t; return t;
  }
  const MAT = {};
  function mats(c) {
    if (MAT[c]) return MAT[c];
    const w = c === 'w';
    const orm = tex('armorORM', false);
    const armor = new T.MeshStandardMaterial({
      map: tex(w ? 'armorW' : 'armorB', true), normalMap: tex('armorN', false), normalScale: new T.Vector2(0.9, 0.9),
      roughnessMap: orm, metalnessMap: orm, roughness: 1, metalness: 1, envMapIntensity: w ? 1.35 : 1.6
    });
    const cloth = new T.MeshPhysicalMaterial({
      // nhung thẫm như hình đích (đo: áo choàng xanh chói, vùng con trái ra màu (53,62,106) vs đích (107,104,113))
      map: tex(w ? 'clothW' : 'clothB', true), color: w ? 0x6f7488 : 0x8a7a7a, roughness: 0.82, metalness: 0, side: T.DoubleSide,
      sheen: 0.7, sheenRoughness: 0.45, sheenColor: new T.Color(w ? 0x7fa2ff : 0xff6a6a), envMapIntensity: 0.6
    });
    const gold = new T.MeshStandardMaterial({ color: w ? 0xe2b04a : 0xc8902e, metalness: 1, roughness: 0.27, envMapIntensity: 1.5 });
    const blade = new T.MeshStandardMaterial({ color: w ? 0xeef2f8 : 0x5a5e68, metalness: 1, roughness: w ? 0.12 : 0.2, envMapIntensity: 2.0 });
    const dark = new T.MeshStandardMaterial({ color: w ? 0x1b2433 : 0x120d0c, metalness: 0.6, roughness: 0.5 });
    const glowCol = new T.Color(w ? 0x63d4ff : 0xff7a2a);
    const glow = new T.MeshBasicMaterial({ color: glowCol.clone().multiplyScalar(2.6), toneMapped: false });
    const mane = new T.MeshPhysicalMaterial({ color: w ? 0x2a4fb8 : 0x8e1620, roughness: 0.55, sheen: 1, sheenColor: new T.Color(w ? 0x9cc0ff : 0xff5a5a), sheenRoughness: 0.35 });
    const pick = (a, b) => (KT[a] ? a : b);      // bên nào chưa có ảnh riêng thì mượn ảnh bên kia
    const tabard = new T.MeshPhysicalMaterial({ map: tex(pick(w ? 'tabardW' : 'tabardB', w ? 'tabardB' : 'tabardW'), true, true), roughness: 0.8, side: T.DoubleSide, sheen: 0.5, sheenColor: new T.Color(w ? 0x8fb0ff : 0xff7070) });
    const shield = new T.MeshStandardMaterial({ map: tex(pick(w ? 'shieldW' : 'shieldB', 'shieldB'), true, true), roughness: 0.42, metalness: 0.45, envMapIntensity: 1.2 });
    MAT[c] = { armor, cloth, gold, blade, dark, glow, glowCol, mane, tabard, shield };
    return MAT[c];
  }

  /* ---------- mặt lưới có DẢI: pos(u,t) → điểm; mỗi đoạn hàng chọn 1 dải; pháp tuyến mượt xuyên qua chỗ đổi dải ---------- */
  function bandOf(sheet, b) { return BAND[sheet][b]; }
  function gridGeo(o) {
    // o: { cols, rows:[t...], pos(u,t)->[x,y,z], seg:[{band, sheet}] cho mỗi đoạn (rows.length-1), closed, flip, uScale }
    const NC = o.cols, NR = o.rows.length;
    const P = [];
    for (let r = 0; r < NR; r++) { const row = []; for (let c = 0; c <= NC; c++) row.push(o.pos(c / NC, o.rows[r])); P.push(row); }
    const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
    const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
    const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
    const N = [];
    for (let r = 0; r < NR; r++) {
      const row = [];
      for (let c = 0; c <= NC; c++) {
        let cl = c - 1, cr = c + 1;
        if (o.closed) { if (cl < 0) cl = NC - 1; if (cr > NC) cr = 1; } else { cl = Math.max(0, cl); cr = Math.min(NC, cr); }
        const du = sub(P[r][cr], P[r][cl]);
        const dt = sub(P[Math.min(NR - 1, r + 1)][c], P[Math.max(0, r - 1)][c]);
        let n = nrm(cross(du, dt)); if (o.flip) n = [-n[0], -n[1], -n[2]];
        row.push(n);
      }
      N.push(row);
    }
    // gom các đoạn liền nhau cùng dải → v chạy theo độ dài cung trong cả cụm
    const segLen = [];
    for (let r = 0; r < NR - 1; r++) { const d = sub(P[r + 1][0], P[r][0]); segLen.push(Math.hypot(d[0], d[1], d[2])); }
    const runs = []; let cur = null;
    for (let r = 0; r < NR - 1; r++) {
      const s = o.seg[r];
      if (cur && cur.band === s.band && cur.sheet === s.sheet) cur.r1 = r; else { cur = { band: s.band, sheet: s.sheet, r0: r, r1: r }; runs.push(cur); }
    }
    const pos = [], nor = [], uv = [], idx = [];
    for (const run of runs) {
      const [v0, v1] = bandOf(run.sheet, run.band);
      let L = 0; for (let r = run.r0; r <= run.r1; r++) L += segLen[r];
      // số lần lặp ngang: giữ tỉ lệ hoa văn (bề ngang 1 lần lặp = chiều cao cụm × 1024 / số px của dải)
      let width = 0; for (let c = 0; c < NC; c++) { const d = sub(P[run.r0][c + 1], P[run.r0][c]); width += Math.hypot(d[0], d[1], d[2]); }
      const patW = Math.max(1e-4, L) * SHEET_PX / Math.max(1, (v1 - v0) * SHEET_PX) * (o.uScale || 1);
      const rep = Math.max(1, Math.round(width / patW));
      let acc = 0;
      const base = pos.length / 3;
      for (let r = run.r0; r <= run.r1 + 1; r++) {
        const f = L > 0 ? acc / L : 0;
        const v = lerp(v0, v1, o.vDown ? 1 - f : f);
        for (let c = 0; c <= NC; c++) {
          pos.push(...P[r][c]); nor.push(...N[r][c]); uv.push((c / NC) * rep, v);
        }
        if (r <= run.r1) acc += segLen[r];
      }
      const rowsHere = run.r1 - run.r0 + 1;
      for (let r = 0; r < rowsHere; r++) for (let c = 0; c < NC; c++) {
        const a = base + r * (NC + 1) + c, b = a + 1, d = a + NC + 1, e = d + 1;
        if (o.flip) idx.push(a, d, b, b, d, e); else idx.push(a, b, d, b, e, d);
      }
    }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3));
    g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3));
    g.setAttribute('uv', new T.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    return g;
  }
  // Catmull-Rom qua các điểm hồ sơ (r, y, sx, sz, ridge) → mặt tròn xoay mượt
  function cr(p0, p1, p2, p3, f) {
    const f2 = f * f, f3 = f2 * f;
    return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
  }
  function profAt(prof, t) {
    const n = prof.length, i = Math.min(n - 2, Math.max(0, Math.floor(t))), f = t - i;
    const g = (k, key, def) => { const q = prof[Math.max(0, Math.min(n - 1, k))]; return q[key] === undefined ? def : q[key]; };
    const val = (key, def) => cr(g(i - 1, key, def), g(i, key, def), g(i + 1, key, def), g(i + 2, key, def), f);
    return { r: Math.max(0.0004, val('r', 0)), y: val('y', 0), sx: val('sx', 1), sz: val('sz', 1), ridge: val('ridge', 0), zo: val('zo', 0) };
  }
  /* mặt tròn xoay có dải: prof = [{r, y, b(dải của đoạn TỪ điểm này), s:'armor'|'cloth', sx, sz, ridge, zo}] (từ dưới lên) */
  function bandLathe(prof, cols, sub, opt) {
    sub = sub || 3; opt = opt || {};
    const rows = [], seg = [];
    for (let i = 0; i < prof.length - 1; i++) {
      for (let j = 0; j < sub; j++) { rows.push(i + j / sub); seg.push({ band: prof[i].b === undefined ? A.plain : prof[i].b, sheet: prof[i].s || 'armor' }); }
    }
    rows.push(prof.length - 1);
    const a0 = opt.a0 || 0, a1 = opt.a1 === undefined ? TAU : opt.a1;
    return gridGeo({
      cols: cols || 32, rows, seg, closed: a1 - a0 >= TAU - 1e-6, uScale: opt.uScale,
      pos: (u, t) => {
        const p = profAt(prof, t), ang = a0 + (a1 - a0) * u;
        const ca = Math.cos(ang), bulge = p.ridge * Math.pow(Math.max(0, ca), 8);
        return [p.r * p.sx * Math.sin(ang), p.y, p.r * p.sz * ca + bulge + p.zo];
      }
    });
  }
  // khối elip có dải (đầu gối, khuỷu, bàn chân, nắm tay): lat chạy từ dưới (−π/2) lên trên (π/2)
  function bandBlob(rx, ry, rz, band, sheet, cols, rows, lat0, lat1) {
    rows = rows || 10; lat0 = lat0 === undefined ? -Math.PI / 2 : lat0; lat1 = lat1 === undefined ? Math.PI / 2 : lat1;
    const rr = [], seg = [];
    for (let i = 0; i <= rows; i++) { rr.push(i / rows); if (i < rows) seg.push({ band, sheet: sheet || 'armor' }); }
    return gridGeo({
      cols: cols || 20, rows: rr, seg, closed: true,
      pos: (u, t) => { const la = lerp(lat0, lat1, t), ang = TAU * u; return [rx * Math.cos(la) * Math.sin(ang), ry * Math.sin(la), rz * Math.cos(la) * Math.cos(ang)]; }
    });
  }
  // ống mềm theo đường cong (bờm ngựa, dây): bán kính thon dần
  function tubeLoft(pts, r0, r1, cols, rows) {
    const curve = new T.CatmullRomCurve3(pts.map(p => new T.Vector3(p[0], p[1], p[2])));
    const frames = curve.computeFrenetFrames(rows, false);
    const pos = [], nor = [], idx = [];
    for (let i = 0; i <= rows; i++) {
      const f = i / rows, P = curve.getPointAt(f), Nn = frames.normals[i], B = frames.binormals[i], rad = lerp(r0, r1, Math.pow(f, 0.8));
      for (let c = 0; c <= cols; c++) {
        const a = TAU * c / cols, n = Nn.clone().multiplyScalar(Math.cos(a)).add(B.clone().multiplyScalar(Math.sin(a)));
        pos.push(P.x + n.x * rad * 1.6, P.y + n.y * rad, P.z + n.z * rad); nor.push(n.x, n.y, n.z);
      }
    }
    for (let i = 0; i < rows; i++) for (let c = 0; c < cols; c++) { const a = i * (cols + 1) + c, b = a + 1, d = a + cols + 1, e = d + 1; idx.push(a, d, b, b, d, e); }
    const g = new T.BufferGeometry();
    g.setAttribute('position', new T.Float32BufferAttribute(pos, 3)); g.setAttribute('normal', new T.Float32BufferAttribute(nor, 3)); g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }
  function mk(geo, mat, x, y, z) { const m = new T.Mesh(geo, mat); m.position.set(x || 0, y || 0, z || 0); m.castShadow = true; m.receiveShadow = true; return m; }
  /* gộp mọi khối cùng vật liệu trong 1 nhóm (ít lượt vẽ). Chừa nhóm con có tên (tay, vai, khiên) */
  function mergeByMat(grp, keepNames) {
    grp.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(grp.matrixWorld).invert();
    const byMat = new Map(), drop = [];
    grp.traverse(o => {
      if (!o.isMesh || o.userData.noMerge) return;
      let p = o.parent; while (p && p !== grp) { if (keepNames.indexOf(p.name) >= 0) return; p = p.parent; }
      const g = o.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
      const ng = g.index ? g : g;
      for (const k of Object.keys(ng.attributes)) if (['position', 'normal', 'uv'].indexOf(k) < 0) ng.deleteAttribute(k);
      if (!ng.attributes.uv) ng.setAttribute('uv', new T.Float32BufferAttribute(new Float32Array(ng.attributes.position.count * 2), 2));
      if (!ng.index) { const ii = []; for (let i = 0; i < ng.attributes.position.count; i++) ii.push(i); ng.setIndex(ii); }
      if (!byMat.has(o.material)) byMat.set(o.material, []);
      byMat.get(o.material).push(ng); drop.push(o);
    });
    for (const o of drop) o.parent.remove(o);
    for (const [m, list] of byMat) {
      const merged = T.BufferGeometryUtils.mergeBufferGeometries(list, false);
      if (!merged) continue;
      const mesh = new T.Mesh(merged, m); mesh.castShadow = mesh.receiveShadow = true; grp.add(mesh);
    }
  }

  /* ---------- các mảnh dùng chung ---------- */
  const SH_X = 0.168, SH_Y = 0.772;           // khớp vai
  const HIP = 0.47;
  function legs(g, M) {               // mỗi chân 1 nhóm, gốc ở hông → đứng tấn rộng + bước lao tới khi chém (userData.tick)
    for (const sx of [-1, 1]) {
      const leg = new T.Group(); leg.name = sx < 0 ? 'legR' : 'legL'; leg.position.set(sx * 0.07, HIP, 0);
      const y0 = -HIP;
      leg.add(mk(bandBlob(0.042, 0.03, 0.085, A.plain, 'armor', 18, 8, -0.2, Math.PI / 2), M.armor, 0, 0.025 + y0, 0.03));
      leg.add(mk(bandLathe([{ r: 0.04, y: 0.02, b: A.rivet }, { r: 0.037, y: 0.06, b: A.plain }, { r: 0.045, y: 0.15, b: A.plain }, { r: 0.041, y: 0.225, b: A.rope }, { r: 0.044, y: 0.245 }], 24, 3), M.armor, 0, y0, 0));
      leg.add(mk(bandLathe([{ r: 0.04, y: 0.235, b: A.plain }, { r: 0.053, y: 0.255, b: A.goldB }, { r: 0.054, y: 0.29, b: A.plain }, { r: 0.043, y: 0.31 }], 24, 3), M.armor, 0, y0, 0.006));
      leg.add(mk(bandBlob(0.006, 0.032, 0.028, A.goldB, 'armor', 12, 6), M.armor, sx * 0.052, 0.272 + y0, 0.01));
      leg.add(mk(bandLathe([{ r: 0.046, y: 0.3, b: A.rope }, { r: 0.05, y: 0.315, b: A.flute }, { r: 0.058, y: 0.4, b: A.flute }, { r: 0.062, y: 0.47 }], 24, 3), M.armor, 0, y0, 0));
      leg.rotation.z = sx * 0.1;
      g.add(leg);
    }
  }
  /* cử động phụ mỗi khung hình (dùng chung cho mẫu gốc + bản sao): vai nhấc theo tay, khiên giữ mặt hướng tới trước,
     chân giữ đứng trên sàn khi thân nghiêng (xoay ngược) + bước lao tới khi nghiêng chém */
  function rigTick(o) {
    const armR = o.getObjectByName('armR'), armL = o.getObjectByName('armL'), shieldG = o.getObjectByName('shield');
    const legR = o.getObjectByName('legR'), legL = o.getObjectByName('legL');
    const pads = []; o.traverse(x => { if (x.name === 'pauldron') pads.push(x); });
    const pR = pads.find(p => p.position.x < 0), pL = pads.find(p => p.position.x > 0);
    return () => {
      if (pR && armR) pR.rotation.x = (armR.rotation.x + 0.35) * 0.32;
      if (pL && armL) pL.rotation.x = (armL.rotation.x + 0.2) * 0.32;
      if (shieldG && armL) shieldG.rotation.x = -(armL.rotation.x + 0.2) * 0.92;
      const lean = o.parent ? o.parent.rotation.x : 0, stride = 0.16 + Math.max(0, lean) * 0.9;
      if (legR) legR.rotation.x = -lean - stride;
      if (legL) legL.rotation.x = -lean + stride * 0.8;
    };
  }
  function torso(g, M, opt) {
    // váy giáp 3 tầng (mỗi tầng loe ở mép dưới)
    const fauld = [[0.5, 0.565, 0.118, 0.13, A.engr], [0.445, 0.508, 0.127, 0.14, A.fleur], [0.39, 0.452, 0.136, 0.15, A.goldB]];
    for (const [y0, y1, rt, rb, band] of fauld) {
      g.add(mk(bandLathe([{ r: rb, y: y0, b: A.rope, sz: 0.8 }, { r: rb - 0.002, y: y0 + 0.008, b: band, sz: 0.8 }, { r: rt, y: y1, sz: 0.8 }], 32, 2), M.armor));
    }
    // giáp ngực: eo vàng → ngực bạc trơn có gờ giữa → mép trên khắc → viền cổ dây thừng
    g.add(mk(bandLathe([
      { r: 0.112, y: 0.55, b: A.goldB, sz: 0.74 }, { r: 0.117, y: 0.6, b: A.plain, sz: 0.74, ridge: 0.004 },
      { r: 0.136, y: 0.66, b: A.plain, sz: 0.76, ridge: 0.014 }, { r: 0.145, y: 0.71, b: A.plain, sz: 0.74, ridge: 0.016 },
      { r: 0.138, y: 0.748, b: A.engr, sz: 0.7, ridge: 0.01 }, { r: 0.11, y: 0.778, b: A.rope, sz: 0.68 }, { r: 0.07, y: 0.795, sz: 0.8 }
    ], 40, 3), M.armor));
    // thắt lưng da + khoá vàng
    g.add(mk(bandLathe([{ r: 0.121, y: 0.548, b: A.leather, sz: 0.76 }, { r: 0.121, y: 0.578, sz: 0.76 }], 32, 1), M.armor));
    g.add(mk(new T.BoxGeometry(0.04, 0.034, 0.012), M.gold, 0, 0.563, 0.094));
    const gem = mk(new T.OctahedronGeometry(0.012), M.glow, 0, 0.563, 0.102); gem.scale.set(1, 1.3, 0.6); g.add(gem);
    // gờ cổ (gorget) gân bạc
    g.add(mk(bandLathe([{ r: 0.078, y: 0.785, b: A.flute }, { r: 0.066, y: 0.82, b: A.rope }, { r: 0.056, y: 0.835 }], 28, 2), M.armor));
    // huy chương vàng giữa ngực
    g.add(mk(bandBlob(0.026, 0.026, 0.008, A.goldB, 'armor', 16, 6), M.armor, 0, 0.69, 0.118));
  }
  function pauldron(side, M) {      // vai: 3 lá giáp chồng; nhóm riêng (xoay theo tay một phần)
    const p = new T.Group(); p.name = 'pauldron';
    // vỏ dẹt (nửa elip mỏng) chồng lớp như vảy — bản đầu là nửa quả cầu, ảnh chụp ra vai tròn như quả bóng
    const lames = [[0.07, 0.0, A.engr], [0.075, -0.02, A.plain], [0.08, -0.04, A.rivet]];
    for (const [r, dy, band] of lames) {
      const geo = bandBlob(r, r * 0.46, r * 0.86, band, 'armor', 22, 7, 0, Math.PI / 2);
      const m = mk(geo, M.armor, side * (0.014 - dy * 0.3), dy, 0); m.rotation.z = -side * (0.42 - dy * 3); p.add(m);
    }
    const rim = mk(bandLathe([{ r: 0.09, y: -0.075, b: A.rope }, { r: 0.092, y: -0.062 }], 22, 1, { a0: -1.9, a1: 1.9 }), M.armor, side * 0.02, 0, 0);
    rim.rotation.z = -side * 0.45; rim.rotation.y = side * Math.PI / 2; p.add(rim);
    p.position.set(side * SH_X, SH_Y + 0.012, 0);
    return p;
  }
  function armGroup(side, M, name) {   // nhóm tay: gốc ở khớp vai, tay buông theo −Y
    const a = new T.Group(); a.name = name;
    const R = 1.22;                    // tay dày hơn (ảnh chụp bản đầu: tay mảnh so với thân giáp)
    a.add(mk(bandLathe([{ r: 0.034 * R, y: -0.135, b: A.flute }, { r: 0.037 * R, y: -0.07, b: A.flute }, { r: 0.04 * R, y: -0.012, b: A.rope }, { r: 0.04 * R, y: 0.0 }], 20, 2), M.armor));
    a.add(mk(bandBlob(0.042 * R, 0.04 * R, 0.042 * R, A.goldB, 'armor', 18, 8), M.armor, 0, -0.148, -0.004));
    const fan = mk(bandBlob(0.006, 0.034 * R, 0.03 * R, A.engr, 'armor', 12, 6), M.armor, side * 0.04 * R, -0.15, -0.006); a.add(fan);
    a.add(mk(bandLathe([{ r: 0.036 * R, y: -0.29, b: A.rope }, { r: 0.034 * R, y: -0.275, b: A.engr }, { r: 0.029 * R, y: -0.2, b: A.engr }, { r: 0.033 * R, y: -0.165 }], 20, 2), M.armor));
    const fist = mk(bandBlob(0.035 * R, 0.042 * R, 0.04 * R, A.rivet, 'armor', 18, 8), M.armor, 0, -0.315, 0.008); a.add(fist);
    a.position.set(side * SH_X, SH_Y, 0);
    return a;
  }
  function cape(g, M, opt) {          // áo choàng sau lưng, loe dần, có nếp; viền thêu vàng ở gấu
    const rows = [], seg = [];
    const NR = 14;
    for (let i = 0; i <= NR; i++) { rows.push(i / NR); if (i < NR) seg.push({ band: i >= NR - 2 ? C.border : C.velvet, sheet: 'cloth' }); }
    const top = opt.top || 0.79, bot = opt.bot || 0.07;
    const geo = gridGeo({
      cols: 28, rows, seg, vDown: true,
      pos: (u, t) => {
        // áo choàng rủ sát lưng, loe vừa phải, nếp gấp sâu dần về gấu (bản đầu loe như cái nón → nhìn ngang ra tam giác to)
        const th = lerp(-1.75, 1.75, u);
        const r = 0.12 + 0.11 * Math.pow(t, 1.1) + 0.022 * Math.sin(th * 7.5 + t * 1.6) * Math.pow(t, 0.8);
        const y = lerp(top, bot, t);
        return [Math.sin(th) * r * 1.1, y, -Math.cos(th) * r * 0.78 - 0.015 - 0.035 * t];
      }
    });
    g.add(mk(geo, M.cloth));
  }
  function tabard(g, M) {             // vạt áo trước có huy hiệu sư tử (ảnh cắt từ ảnh nhân vật GPT vẽ)
    const s = new T.Shape(); const w = 0.066, top = 0.0, bot = -0.33, tip = -0.38;
    s.moveTo(-w, top); s.lineTo(w, top); s.lineTo(w * 0.92, bot); s.lineTo(0, tip); s.lineTo(-w * 0.92, bot); s.closePath();
    const geo = new T.ShapeGeometry(s, 4);
    const p = geo.attributes.position, uv = geo.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      uv.setXY(i, (x + w) / (2 * w), (y - tip) / (top - tip));
      p.setZ(i, -x * x * 3.2 + (y < -0.2 ? (y + 0.2) * 0.12 : 0));
    }
    geo.computeVertexNormals();
    const m = mk(geo, M.tabard, 0, 0.56, 0.126); m.userData.noMerge = true; g.add(m);
  }
  function furCollar(g, M) {
    const geo = gridGeo({
      cols: 36, rows: [0, 0.25, 0.5, 0.75, 1], seg: [0, 1, 2, 3].map(() => ({ band: C.fur, sheet: 'cloth' })), closed: true,
      pos: (u, t) => {
        const a = TAU * u, b = lerp(-Math.PI * 0.95, Math.PI * 0.95, t);
        const fluff = 1 + 0.16 * Math.sin(a * 13) * Math.sin(b * 3 + a * 5);
        const R = 0.118, rr = 0.046 * fluff;
        return [Math.sin(a) * (R + rr * Math.cos(b)) * 1.22, 0.795 + rr * Math.sin(b) * 0.85, Math.cos(a) * (R + rr * Math.cos(b)) * 0.86 - 0.006];
      }
    });
    g.add(mk(geo, M.cloth));
  }

  /* ---------- vũ khí (dựng dọc +Y, chuôi ở gốc — như chiến binh cũ) ---------- */
  function sword(M, len, wid, kind) {
    const s = new T.Group(); s.name = 'sword';     // KHÔNG gộp vào tay: hiệu ứng lửa/sét tìm lưỡi theo tên 'blade'
    const sh = new T.Shape();
    sh.moveTo(-wid, 0); sh.lineTo(wid, 0); sh.lineTo(wid * 0.82, len * 0.86); sh.lineTo(0, len); sh.lineTo(-wid * 0.82, len * 0.86); sh.closePath();
    const bg = new T.ExtrudeGeometry(sh, { depth: 0.002, bevelEnabled: true, bevelThickness: 0.0055, bevelSize: 0.0045, bevelSegments: 1, curveSegments: 4 });
    bg.translate(0, 0, -0.001);
    const blade = mk(bg, M.blade, 0, 0.1, 0); blade.name = 'blade'; blade.userData.len = len; s.add(blade);
    const rune = mk(new T.BoxGeometry(wid * 0.24, len * 0.8, 0.0122), M.glow, 0, 0.1 + len * 0.42, 0); rune.name = 'rune'; s.add(rune);
    // chắn tay vàng cong + đá quý
    const gs = new T.Shape();
    gs.moveTo(-0.075, 0.012); gs.quadraticCurveTo(-0.04, -0.004, 0, 0.0); gs.quadraticCurveTo(0.04, -0.004, 0.075, 0.012);
    gs.quadraticCurveTo(0.083, 0.03, 0.07, 0.03); gs.quadraticCurveTo(0.04, 0.016, 0, 0.022); gs.quadraticCurveTo(-0.04, 0.016, -0.07, 0.03); gs.quadraticCurveTo(-0.083, 0.03, -0.075, 0.012);
    const gg = new T.ExtrudeGeometry(gs, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.003, bevelSegments: 2, curveSegments: 8 });
    gg.translate(0, 0.072, -0.008);
    s.add(mk(gg, M.gold));
    const gem = mk(new T.OctahedronGeometry(0.013), M.glow, 0, 0.088, 0.012); gem.scale.set(0.8, 1.2, 0.5); s.add(gem);
    s.add(mk(bandLathe([{ r: 0.014, y: -0.02, b: A.leather }, { r: 0.015, y: 0.07 }], 12, 1), M.armor));
    s.add(mk(new T.SphereGeometry(0.02, 14, 10), M.gold, 0, -0.03, 0));
    return s;
  }
  function kiteShield(M) {
    const g = new T.Group(); g.name = 'shield';
    const s = new T.Shape(); const W = 0.115, Ht = 0.17, Hb = -0.2;
    s.moveTo(-W, Ht * 0.7); s.quadraticCurveTo(0, Ht * 1.12, W, Ht * 0.7); s.quadraticCurveTo(W * 1.04, -0.02, W * 0.55, Hb * 0.55); s.quadraticCurveTo(W * 0.2, Hb * 0.85, 0, Hb);
    s.quadraticCurveTo(-W * 0.2, Hb * 0.85, -W * 0.55, Hb * 0.55); s.quadraticCurveTo(-W * 1.04, -0.02, -W, Ht * 0.7);
    const geo = new T.ExtrudeGeometry(s, { depth: 0.008, bevelEnabled: true, bevelThickness: 0.007, bevelSize: 0.008, bevelSegments: 2, curveSegments: 12 });
    const p = geo.attributes.position, uv = geo.attributes.uv;
    const minX = -W, maxX = W, minY = Hb, maxY = Ht * 0.92;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i), y = p.getY(i);
      uv.setXY(i, (x - minX) / (maxX - minX), (y - minY) / (maxY - minY));
      p.setZ(i, p.getZ(i) - x * x * 2.4);          // khiên cong lồi
    }
    geo.computeVertexNormals();
    const face = new T.Mesh(geo, [M.shield, M.gold]); face.castShadow = face.receiveShadow = true;
    g.add(face);
    return g;
  }

  /* ---------- MŨ ---------- */
  function kingHelm(g, M) {
    g.add(mk(bandLathe([
      { r: 0.054, y: 0.825, b: A.plain, sz: 1.05 }, { r: 0.071, y: 0.85, b: A.plain, sz: 1.08 }, { r: 0.078, y: 0.9, b: A.goldB, sz: 1.08 },
      { r: 0.078, y: 0.918, b: A.plain, sz: 1.08 }, { r: 0.074, y: 0.955, b: A.plain, sz: 1.06 }, { r: 0.05, y: 0.972, sz: 1.04 }, { r: 0.002, y: 0.978, sz: 1 }
    ], 36, 3), M.armor));
    // khe mắt tối + vệt sáng xanh
    const slit = mk(new T.CylinderGeometry(0.0805, 0.0805, 0.014, 24, 1, true, -0.85, 1.7), M.dark, 0, 0.912, 0); slit.scale.z = 1.08; slit.userData.noMerge = true; g.add(slit);
    const eye = mk(new T.CylinderGeometry(0.0812, 0.0812, 0.004, 24, 1, true, -0.6, 1.2), M.glow, 0, 0.912, 0); eye.scale.z = 1.08; g.add(eye);
    // chữ thập vàng trên mặt mũ
    g.add(mk(new T.BoxGeometry(0.01, 0.07, 0.006), M.gold, 0, 0.872, 0.083));
    // vương miện: vòng vàng + 8 gai + chữ thập trên đỉnh
    g.add(mk(bandLathe([{ r: 0.071, y: 0.952, b: A.goldB, sz: 1.06 }, { r: 0.075, y: 0.986, sz: 1.06 }], 32, 1), M.armor));
    for (let i = 0; i < 8; i++) {
      const a = i * TAU / 8, big = i % 2 === 0;
      const sp = mk(new T.ConeGeometry(big ? 0.012 : 0.008, big ? 0.05 : 0.032, 8), M.gold, Math.sin(a) * 0.072, 0.986 + (big ? 0.025 : 0.016), Math.cos(a) * 0.076);
      g.add(sp);
      if (big) g.add(mk(new T.SphereGeometry(0.007, 8, 6), M.gold, Math.sin(a) * 0.072, 1.016, Math.cos(a) * 0.076));
    }
    const cs = new T.Shape();
    const q = 0.009, L = 0.034;
    cs.moveTo(-q, -L); cs.lineTo(q, -L); cs.lineTo(q, -q); cs.lineTo(L * 0.8, -q); cs.lineTo(L * 0.8, q); cs.lineTo(q, q); cs.lineTo(q, L); cs.lineTo(-q, L); cs.lineTo(-q, q); cs.lineTo(-L * 0.8, q); cs.lineTo(-L * 0.8, -q); cs.lineTo(-q, -q); cs.closePath();
    const cg = new T.ExtrudeGeometry(cs, { depth: 0.006, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
    cg.translate(0, 0, -0.003);
    g.add(mk(cg, M.gold, 0, 1.04, 0));
    g.add(mk(new T.OctahedronGeometry(0.008), M.glow, 0, 1.04, 0.007));
  }
  function horseHelm(g, M) {          // mũ đầu ngựa: ống loft theo sống mũi, mặt cắt elip thon dần
    const spine = [[0, 0.83, -0.012], [0, 0.885, -0.008], [0, 0.94, 0.012], [0, 0.958, 0.05], [0, 0.94, 0.1], [0, 0.912, 0.142], [0, 0.895, 0.168]];
    const secW = [0.062, 0.064, 0.06, 0.052, 0.044, 0.038, 0.03], secH = [0.066, 0.062, 0.058, 0.054, 0.05, 0.044, 0.036];
    const curve = new T.CatmullRomCurve3(spine.map(p => new T.Vector3(p[0], p[1], p[2])));
    const NR = 18, rows = [], seg = [];
    for (let i = 0; i <= NR; i++) { rows.push(i / NR); if (i < NR) seg.push({ band: i === 12 ? A.goldB : (i < 3 ? A.flute : A.plain), sheet: 'armor' }); }
    const at = (arr, f) => { const x = f * (arr.length - 1), i = Math.min(arr.length - 2, Math.floor(x)); return lerp(arr[i], arr[i + 1], x - i); };
    const geo = gridGeo({
      cols: 28, rows, seg, closed: true, flip: true,
      pos: (u, t) => {
        const P = curve.getPointAt(t), Tn = curve.getTangentAt(t);
        const side = new T.Vector3(1, 0, 0), up = new T.Vector3().crossVectors(Tn, side).normalize();
        const a = TAU * u, cap = t > 0.94 ? Math.cos((t - 0.94) / 0.06 * Math.PI / 2) : 1;
        const w = at(secW, t) * cap, h = at(secH, t) * cap;
        return [P.x + side.x * Math.sin(a) * w + up.x * Math.cos(a) * h, P.y + up.y * Math.cos(a) * h, P.z + up.z * Math.cos(a) * h];
      }
    });
    g.add(mk(geo, M.armor));
    // tai, mắt sáng, lỗ mũi, sống mũi vàng
    for (const sx of [-1, 1]) {
      const ear = mk(new T.ConeGeometry(0.014, 0.05, 8), M.armor, sx * 0.032, 0.99, 0.005); ear.rotation.set(-0.25, 0, -sx * 0.25); g.add(ear);
      const eye = mk(new T.SphereGeometry(0.0085, 10, 8), M.glow, sx * 0.05, 0.93, 0.07); eye.scale.set(0.6, 0.7, 1); g.add(eye);
      g.add(mk(new T.SphereGeometry(0.007, 8, 6), M.dark, sx * 0.016, 0.886, 0.168));
    }
    const ridge = [];
    for (let i = 0; i <= 10; i++) { const t = 0.15 + i * 0.075, P = curve.getPointAt(Math.min(1, t)), Tn = curve.getTangentAt(Math.min(1, t)); const up = new T.Vector3().crossVectors(Tn, new T.Vector3(1, 0, 0)).normalize(); ridge.push([P.x + up.x * 0.05, P.y + up.y * (0.052 - i * 0.0012), P.z + up.z * 0.05]); }
    g.add(mk(new T.TubeGeometry(new T.CatmullRomCurve3(ridge.map(p => new T.Vector3(p[0], p[1], p[2]))), 20, 0.0045, 6, false), M.gold));
    // bờm: nhiều sợi đỏ chảy từ đỉnh đầu xuống lưng
    for (let i = 0; i < 11; i++) {
      const f = i / 10, x = (f - 0.5) * 0.03, z0 = 0.03 - f * 0.05, sway = Math.sin(i * 1.7) * 0.012;
      const pts = [[x, 0.975 - f * 0.012, z0], [x * 1.6 + sway, 0.96, z0 - 0.05], [x * 2.2 + sway, 0.9, -0.085 - f * 0.01], [x * 2.8 - sway, 0.8, -0.11], [x * 3.2 + sway * 1.5, 0.68, -0.115 + Math.sin(i) * 0.01]];
      g.add(mk(tubeLoft(pts, 0.009, 0.0025, 6, 14), M.mane));
    }
  }

  /* ---------- lắp chiến binh ---------- */
  function build(t, c) {
    const M = mats(c);
    const g = new T.Group();
    legs(g, M);
    torso(g, M);
    cape(g, M, {});
    tabard(g, M);
    if (t === 'k') { kingHelm(g, M); furCollar(g, M); }
    else horseHelm(g, M);
    const pR = pauldron(-1, M), pL = pauldron(1, M);
    g.add(pR, pL);
    const armR = armGroup(-1, M, 'armR'), armL = armGroup(1, M, 'armL');
    g.add(armR, armL);
    // vũ khí trong tay phải (−X): trục +Y của kiếm → phía trước khi tay buông (như chiến binh cũ)
    const w = t === 'k' ? sword(M, 0.6, 0.026, 'great') : sword(M, 0.48, 0.021, 'long');
    // xoay quanh trục dọc lưỡi 90° trước: lưỡi bẻ cạnh theo hướng chém (mặt phẳng lưỡi hướng ra hai bên)
    // chúc mũi xuống thêm 0,6 rad: lúc đứng kiếm cầm chéo xuống (bản đầu chĩa ngang như cây gậy), lúc vung vẫn chém ngang ngực
    w.position.set(0, -0.318, 0.012); w.rotation.set(Math.PI / 2 + 0.6, Math.PI / 2, 0); armR.add(w);
    let shieldG = null;
    if (t === 'n') { shieldG = kiteShield(M); shieldG.position.set(0.045, -0.2, 0.05); armL.add(shieldG); }
    armR.rotation.x = -0.35; armL.rotation.x = -0.2;
    // gộp mảnh đứng yên (thân, từng tay, từng vai) cho ít lượt vẽ
    const legGroups = [g.getObjectByName('legR'), g.getObjectByName('legL')];
    for (const sub of [armR, armL, pR, pL, ...legGroups]) mergeByMat(sub, ['shield', 'sword']);
    mergeByMat(g, ['armR', 'armL', 'pauldron', 'shield', 'sword', 'legR', 'legL']);
    g.userData.tick = rigTick(g);
    g.userData.knight = true;
    return g;
  }
  const TPL = {};
  window.ChessKnights = {
    has: t => t === 'k' || t === 'n',
    make(t, c) {
      const k = t + c;
      if (!TPL[k]) TPL[k] = build(t, c);
      // nhân bản: chia sẻ hình + vật liệu, nhưng tick phải trỏ vào nhóm của BẢN SAO
      const o = TPL[k].clone(true);
      o.userData.tick = rigTick(o);
      o.traverse(x => { if (x.isMesh) x.userData.shared = true; });
      return o;
    },
    _mats: mats
  };
})();
