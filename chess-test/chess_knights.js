/* chess_knights.js — chiến binh MẶC GIÁP cho ĐẤU TRƯỜNG (Nam 11-21: "code + GPT vẽ hoa văn giáp").
   Dáng giáp dựng bằng code (mặt tròn xoay / mặt lưới cong mượt), da giáp = tấm "dải hoa văn" GPT vẽ (assets/knight_tex.js):
   mỗi mảnh giáp chọn đúng DẢI (bạc trơn, hoa văn khắc, viền vàng, đinh tán, dây thừng vàng, men xanh, gân bạc, dây da).
   BẢN 4 (11-22 — Nam chọn "sửa Vua + Mã trước"): có KHỚP như người (hông, gối, cổ chân, vai, khuỷu) và DÁNG điều khiển
   bằng con số trong userData.pose: thân hạ / tiến / nghiêng / vặn, chỗ đặt hai bàn chân, đường vung kiếm, chỗ giơ khiên.
   chess_view.js chỉ đổi các con số theo thời gian; userData.tick() mỗi khung hình tính NGƯỢC ra góc từng khớp:
   bàn chân luôn đặt trên sàn (gối tự gập), hai tay luôn nắm chuôi kiếm / quai khiên (khuỷu tự gập).
   Toạ độ mẫu: đứng ở y=0, mặt nhìn +Z, cao ~1; tay PHẢI ('armR') ở −X (con bên trái màn hình vung kiếm phía gần máy quay). */
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
  /* khớp + chiều dài xương (đơn vị mẫu) */
  const SH_X = 0.168, SH_Y = 0.772;          // khớp vai (trong thân)
  const HIP = 0.47, HX = 0.07;               // khớp hông: độ cao lúc đứng thẳng, lệch ngang
  const L1 = 0.2, L2 = 0.215, ANK = 0.055;   // đùi, cẳng chân, độ cao cổ chân
  const LA1 = 0.148, LA2 = 0.167;            // cánh tay trên (vai → khuỷu), cẳng tay (khuỷu → giữa nắm tay)

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
  function crom(p0, p1, p2, p3, f) {
    const f2 = f * f, f3 = f2 * f;
    return 0.5 * ((2 * p1) + (-p0 + p2) * f + (2 * p0 - 5 * p1 + 4 * p2 - p3) * f2 + (-p0 + 3 * p1 - 3 * p2 + p3) * f3);
  }
  function profAt(prof, t) {
    const n = prof.length, i = Math.min(n - 2, Math.max(0, Math.floor(t))), f = t - i;
    const g = (k, key, def) => { const q = prof[Math.max(0, Math.min(n - 1, k))]; return q[key] === undefined ? def : q[key]; };
    const val = (key, def) => crom(g(i - 1, key, def), g(i, key, def), g(i + 1, key, def), g(i + 2, key, def), f);
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
  /* gộp mọi khối cùng vật liệu trong 1 nhóm (ít lượt vẽ). Chừa nhóm con có tên (xương con, vai, kiếm, khiên) */
  function mergeByMat(grp, keepNames) {
    grp.updateMatrixWorld(true);
    const inv = new T.Matrix4().copy(grp.matrixWorld).invert();
    const byMat = new Map(), drop = [];
    grp.traverse(o => {
      if (!o.isMesh || o.userData.noMerge) return;
      let p = o.parent; while (p && p !== grp) { if (keepNames.indexOf(p.name) >= 0) return; p = p.parent; }
      const ng = o.geometry.clone().applyMatrix4(new T.Matrix4().multiplyMatrices(inv, o.matrixWorld));
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

  /* ---------- CHÂN: đùi (gốc ở hông) → cẳng chân (gốc ở gối) → bàn chân (gốc ở cổ chân) ---------- */
  function legs(g, M) {
    for (const sx of [-1, 1]) {
      const s = sx < 0 ? 'R' : 'L';
      const thigh = new T.Group(); thigh.name = 'leg' + s; thigh.position.set(sx * HX, HIP, 0);
      const shin = new T.Group(); shin.name = 'shin' + s; shin.position.set(0, -L1, 0); thigh.add(shin);
      const foot = new T.Group(); foot.name = 'foot' + s; foot.position.set(0, -L2, 0); shin.add(foot);
      // (số đo cũ tính từ SÀN → dời về gốc của từng xương)
      thigh.add(mk(bandLathe([{ r: 0.046, y: 0.3, b: A.rope }, { r: 0.05, y: 0.315, b: A.flute }, { r: 0.058, y: 0.4, b: A.flute }, { r: 0.062, y: 0.47 }], 24, 3), M.armor, 0, -HIP, 0));
      // ốp gối + cánh quạt + bi khớp (đi theo đùi, che chỗ gập)
      thigh.add(mk(bandLathe([{ r: 0.04, y: 0.235, b: A.plain }, { r: 0.053, y: 0.255, b: A.goldB }, { r: 0.054, y: 0.29, b: A.plain }, { r: 0.043, y: 0.31 }], 24, 3), M.armor, 0, -HIP, 0.006));
      thigh.add(mk(bandBlob(0.006, 0.032, 0.028, A.goldB, 'armor', 12, 6), M.armor, sx * 0.052, 0.272 - HIP, 0.01));
      thigh.add(mk(bandBlob(0.045, 0.046, 0.048, A.plain, 'armor', 16, 8), M.armor, 0, -L1, 0));
      // ống giáp cẳng chân
      shin.add(mk(bandLathe([{ r: 0.04, y: 0.02, b: A.rivet }, { r: 0.037, y: 0.06, b: A.plain }, { r: 0.045, y: 0.15, b: A.plain }, { r: 0.041, y: 0.225, b: A.rope }, { r: 0.044, y: 0.245 }], 24, 3), M.armor, 0, -(HIP - L1), 0));
      // bàn chân giáp (luôn nằm phẳng trên sàn)
      foot.add(mk(bandBlob(0.042, 0.03, 0.085, A.plain, 'armor', 18, 8, -0.2, Math.PI / 2), M.armor, 0, 0.025 - ANK, 0.03));
      g.add(thigh);
    }
  }
  function torso(g, M) {
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
  function pauldron(side, M) {      // vai: 3 lá giáp chồng; nhóm riêng (nhấc theo cánh tay một phần)
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
  /* TAY: cánh tay trên (gốc ở vai, buông theo −Y) → cẳng tay 'foreR'/'foreL' (gốc ở khuỷu) có nắm tay ở đầu */
  function armGroup(side, M, name) {
    const a = new T.Group(); a.name = name;
    const f = new T.Group(); f.name = name === 'armR' ? 'foreR' : 'foreL'; f.position.set(0, -LA1, 0); a.add(f);
    const R = 1.22;                    // tay dày hơn (ảnh chụp bản đầu: tay mảnh so với thân giáp)
    a.add(mk(bandLathe([{ r: 0.034 * R, y: -0.135, b: A.flute }, { r: 0.037 * R, y: -0.07, b: A.flute }, { r: 0.04 * R, y: -0.012, b: A.rope }, { r: 0.04 * R, y: 0.0 }], 20, 2), M.armor));
    const e = LA1;                     // số đo cũ tính từ vai → trong cẳng tay cộng thêm LA1
    f.add(mk(bandBlob(0.042 * R, 0.04 * R, 0.042 * R, A.goldB, 'armor', 18, 8), M.armor, 0, -0.148 + e, -0.004));
    f.add(mk(bandBlob(0.006, 0.034 * R, 0.03 * R, A.engr, 'armor', 12, 6), M.armor, side * 0.04 * R, -0.15 + e, -0.006));
    f.add(mk(bandLathe([{ r: 0.036 * R, y: -0.29 + e, b: A.rope }, { r: 0.034 * R, y: -0.275 + e, b: A.engr }, { r: 0.029 * R, y: -0.2 + e, b: A.engr }, { r: 0.033 * R, y: -0.165 + e }], 20, 2), M.armor));
    f.add(mk(bandBlob(0.035 * R, 0.042 * R, 0.04 * R, A.rivet, 'armor', 18, 8), M.armor, 0, -0.315 + e, 0.008));
    a.position.set(side * SH_X, SH_Y, 0);
    return a;
  }
  /* áo choàng sau lưng, loe dần, có nếp; viền thêu vàng ở gấu. Nhóm RIÊNG 'capeG' xoay quanh mép cổ áo:
     thân đổ tới thì áo vẫn rủ thẳng + tung ra sau khi lao tới (pose.flare) — lộ chân sau như hình đích */
  const CAPE_Y = 0.79, CAPE_Z = -0.11;
  function cape(g, M, opt) {
    const cg = new T.Group(); cg.name = 'capeG'; cg.position.set(0, CAPE_Y, CAPE_Z); g.add(cg);
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
    cg.add(mk(geo, M.cloth, 0, -CAPE_Y, -CAPE_Z));
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

  /* ---------- vũ khí: kiếm dựng dọc +Y, gốc toạ độ ở chuôi; đặt THẲNG trong thân (không con của tay) — tay tự tìm tới chuôi ---------- */
  function sword(M, len, wid, two) {
    const s = new T.Group(); s.name = 'sword';     // KHÔNG gộp: hiệu ứng lửa/sét tìm lưỡi theo tên 'blade'
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
    // chuôi bọc da: kiếm HAI TAY (Vua) chuôi dài đủ hai nắm tay
    const hl = two ? 0.11 : 0.02;
    s.add(mk(bandLathe([{ r: 0.014, y: -hl, b: A.leather }, { r: 0.015, y: 0.07 }], 12, 1), M.armor));
    s.add(mk(new T.SphereGeometry(0.02, 14, 10), M.gold, 0, -hl - 0.012, 0));
    s.userData.grip = two ? [0.03, -0.065] : [0.025];      // chỗ nắm trên chuôi (tay phải, tay trái)
    return s;
  }

  /* ---------- vết NỨT phát sáng trên khiên (hình đích "đỡ đòn"): vẽ 1 lần trên canvas ----------
     kênh đỏ = vết nứt, kênh xanh lá = thứ tự lộ ra (gần điểm trúng trước) → uReveal 0→1 cho vết nứt toả dần ra mép */
  let CRACK_TEX = null;
  function crackTex() {
    if (CRACK_TEX) return CRACK_TEX;
    const S = 512, cv = document.createElement('canvas'); cv.width = cv.height = S;
    const g = cv.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, S, S);
    g.lineCap = 'round'; g.lineJoin = 'round';
    const cx = S * 0.47, cy = S * 0.4;
    let seed = 9; const R = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const seg = (x0, y0, x1, y1, w) => {
      const d = Math.min(1, Math.hypot((x0 + x1) / 2 - cx, (y0 + y1) / 2 - cy) / (S * 0.6));
      g.strokeStyle = 'rgb(255,' + Math.round(d * 255) + ',0)'; g.lineWidth = w;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
    };
    function crack(x, y, ang, len, w, depth) {
      const n = 7 + ((R() * 4) | 0), step = len / n;
      for (let i = 0; i < n; i++) {
        ang += (R() - 0.5) * 0.95;
        const nx = x + Math.cos(ang) * step, ny = y + Math.sin(ang) * step;
        seg(x, y, nx, ny, Math.max(1.6, w * (1 - i / n * 0.65)));
        if (depth > 0 && R() < 0.3) crack(nx, ny, ang + (R() < 0.5 ? -1 : 1) * (0.5 + R() * 0.7), len * (0.3 + R() * 0.3), w * 0.6, depth - 1);
        x = nx; y = ny;
      }
    }
    for (let i = 0; i < 11; i++) crack(cx, cy, i / 11 * TAU + R() * 0.4, S * (0.3 + R() * 0.28), 8, 2);
    for (const rr of [0.09, 0.18]) {      // vòng nứt quanh điểm trúng
      let a0 = R() * 6;
      for (let k = 0; k < 9; k++) { const a1 = a0 + 0.45 + R() * 0.35, r0 = S * rr * (0.9 + R() * 0.2), r1 = S * rr * (0.9 + R() * 0.2); seg(cx + Math.cos(a0) * r0, cy + Math.sin(a0) * r0, cx + Math.cos(a1) * r1, cy + Math.sin(a1) * r1, 4.5); a0 = a1 + R() * 0.3; }
    }
    const t = new T.CanvasTexture(cv); t.encoding = T.LinearEncoding;
    CRACK_TEX = t; return t;
  }
  function crackMat() {
    return new T.ShaderMaterial({
      transparent: true, depthWrite: false, blending: T.AdditiveBlending, toneMapped: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
      uniforms: { uMap: { value: crackTex() }, uReveal: { value: 0 }, uHeat: { value: 0 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: 'uniform sampler2D uMap; uniform float uReveal; uniform float uHeat; varying vec2 vUv;\n' +
        'void main(){ vec4 c = texture2D(uMap, vUv); float m = c.r * step(c.g, uReveal + 0.002);\n' +
        '  vec3 hot = mix(vec3(1.0, 0.25, 0.02), vec3(1.0, 0.86, 0.5), smoothstep(0.55, 1.0, c.r));\n' +
        '  gl_FragColor = vec4(hot * m * uHeat, 1.0); }'
    });
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
    const face = new T.Mesh(geo, [M.shield, M.gold]); face.castShadow = face.receiveShadow = true; face.name = 'shieldFace';
    g.add(face);
    // lớp vết nứt (ẩn; chess_view bật khi trúng đòn kết) = CHÍNH hai mặt khiên (nhóm 0 của hình đùn), vẽ đè nhờ độ lệch sâu.
    // (bản đầu dựng tấm phẳng riêng: mặt khiên chỉ cong ở mép, giữa là tam giác phẳng → tấm nứt nằm SAU mặt khiên, chỉ ló viền)
    const cg = geo.clone(), g0 = geo.groups[0];
    cg.clearGroups(); cg.setDrawRange(g0.start, g0.count);
    const crack = new T.Mesh(cg, crackMat()); crack.name = 'crack'; crack.visible = false; crack.renderOrder = 2; crack.userData.noMerge = true;
    g.add(crack);
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
  /* mũ ĐẦU NGỰA (bản 4 — ảnh chụp bản 3: nhìn xa như mũ tròn đen, chưa ra mõm): đầu dài cúi chéo xuống như ngựa thật,
     má/hàm phình phía dưới, mặt cắt hơi vuông (giáp gò), tai dựng, mắt lửa, sống mũi vàng, lỗ mũi + miệng, bờm đỏ dày */
  function horseHelm(g, M) {
    // ảnh chụp lần 1 bản 4: mõm thon nhọn như mỏ chim → mõm to tròn, đầu mõm cụt, có môi dưới; tai to dựng TRƯỚC bờm
    const spine = [[0, 0.9, -0.05], [0, 0.93, 0.01], [0, 0.922, 0.075], [0, 0.89, 0.14], [0, 0.856, 0.195], [0, 0.838, 0.232]];
    const W = [0.068, 0.07, 0.062, 0.05, 0.045, 0.043], H = [0.082, 0.09, 0.08, 0.064, 0.057, 0.053];
    const curve = new T.CatmullRomCurve3(spine.map(p => new T.Vector3(p[0], p[1], p[2])));
    const at = (arr, f) => { const x = f * (arr.length - 1), i = Math.min(arr.length - 2, Math.floor(x)); return lerp(arr[i], arr[i + 1], x - i); };
    const side = new T.Vector3(1, 0, 0), upV = new T.Vector3();
    const upAt = t => upV.crossVectors(curve.getTangentAt(t), side).normalize();
    const NR = 24, rows = [], seg = [];
    for (let i = 0; i <= NR; i++) { rows.push(i / NR); if (i < NR) seg.push({ band: (i === 15 || i === 16) ? A.goldB : (i < 4 ? A.flute : A.plain), sheet: 'armor' }); }
    const geo = gridGeo({
      cols: 32, rows, seg, closed: true, flip: true,
      pos: (u, t) => {
        const P = curve.getPointAt(t), up = upAt(t);
        const a = TAU * u, sa = Math.sin(a), ca = Math.cos(a);
        const cap = t > 0.95 ? Math.pow(Math.max(0, 1 - Math.pow((t - 0.95) / 0.05, 2)), 0.35) : 1;     // đầu mõm cụt, tròn
        const sx = Math.sign(sa) * Math.pow(Math.abs(sa), 0.8), sy = Math.sign(ca) * Math.pow(Math.abs(ca), 0.8);
        const jowl = ca < 0 ? (Math.exp(-Math.pow((t - 0.28) / 0.13, 2)) * 0.028 + Math.exp(-Math.pow((t - 0.9) / 0.045, 2)) * 0.011) * Math.pow(-ca, 1.4) : 0;   // má phình + môi dưới
        const w = at(W, t) * cap, h = at(H, t) * cap, v = sy * h - jowl;
        return [P.x + sx * w, P.y + up.y * v, P.z + up.z * v];
      }
    });
    g.add(mk(geo, M.armor));
    g.add(mk(bandBlob(0.067, 0.08, 0.04, A.flute, 'armor', 24, 8), M.armor, 0, 0.9, -0.045));     // nắp gáy
    // sống mũi vàng chạy từ trán xuống mõm
    const ridge = [];
    for (let i = 0; i <= 12; i++) {
      const t = Math.min(0.97, 0.12 + i * 0.07), P = curve.getPointAt(t), up = upAt(t), h = at(H, t) * (t > 0.92 ? 0.85 : 1) + 0.002;
      ridge.push(new T.Vector3(P.x, P.y + up.y * h, P.z + up.z * h));
    }
    g.add(mk(new T.TubeGeometry(new T.CatmullRomCurve3(ridge), 24, 0.0048, 6, false), M.gold));
    const Pe = curve.getPointAt(0.36).clone(), we = at(W, 0.36), Pn = curve.getPointAt(0.95).clone();
    const Pt = curve.getPointAt(0.3).clone();
    for (const sx of [-1, 1]) {
      const ear = mk(new T.ConeGeometry(0.021, 0.088, 10), M.armor, sx * 0.04, Pt.y + 0.11, Pt.z + 0.004); ear.rotation.set(-0.12, 0, -sx * 0.22); ear.scale.z = 0.7; g.add(ear);
      const earIn = mk(new T.ConeGeometry(0.011, 0.06, 8), M.gold, sx * 0.04, Pt.y + 0.104, Pt.z + 0.012); earIn.rotation.copy(ear.rotation); earIn.scale.z = 0.5; g.add(earIn);
      const eye = mk(new T.SphereGeometry(0.012, 12, 8), M.glow, sx * (we - 0.002), Pe.y + 0.01, Pe.z + 0.004); eye.scale.set(0.45, 0.7, 1.5); eye.rotation.y = sx * 0.35; g.add(eye);
      const brow = mk(new T.BoxGeometry(0.008, 0.008, 0.05), M.gold, sx * (we + 0.001), Pe.y + 0.026, Pe.z); brow.rotation.x = 0.25; g.add(brow);
      const nos = mk(new T.SphereGeometry(0.0085, 10, 8), M.dark, sx * 0.017, Pn.y - 0.006, Pn.z + 0.016); nos.scale.set(0.8, 1, 0.6); g.add(nos);
    }
    const mouth = mk(new T.BoxGeometry(0.048, 0.005, 0.07), M.dark, 0, 0.806, 0.2); mouth.rotation.x = 0.5; g.add(mouth);
    // bờm đỏ: mọc dọc đỉnh đầu từ SAU tai ra gáy, dựng lên rồi chảy xuống lưng
    for (let i = 0; i < 20; i++) {
      const f = i / 19, t0 = 0.24 - f * 0.24, P0 = curve.getPointAt(t0), up0 = upAt(t0), h0 = at(H, t0) - 0.006;
      const ry = P0.y + up0.y * h0, rz = P0.z + up0.z * h0;
      const x = Math.sin(i * 2.3) * 0.012, sway = Math.sin(i * 1.7) * 0.018, lift = 0.035 + 0.02 * Math.sin(f * Math.PI);
      const pts = [[x, ry, rz], [x * 1.4 + sway * 0.2, ry + lift, rz - 0.035], [x * 2 + sway * 0.6, ry + lift * 0.6, rz - 0.1], [x * 2.6 - sway, 0.84 - f * 0.03, -0.165 - f * 0.012], [x * 3 + sway * 1.3, 0.69 - f * 0.05, -0.175 + Math.sin(i) * 0.012]];
      g.add(mk(tubeLoft(pts, 0.013, 0.0028, 6, 16), M.mane));
    }
  }

  /* ---------- KHUNG XƯƠNG: tính ngược 2 khúc (đùi–cẳng chân, cánh tay–cẳng tay) ---------- */
  const UP = new T.Vector3(0, 1, 0);
  const _d = new T.Vector3(), _p = new T.Vector3(), _y = new T.Vector3(), _z = new T.Vector3(), _x = new T.Vector3(), _w = new T.Vector3();
  const _m4 = new T.Matrix4(), _qi = new T.Quaternion();
  // gốc R, đích E, dài a + b, hướng gập "pole" → khớp giữa J + đầu mút thật Eo (kẹp trong tầm với); trả về hướng gập
  function solve2(R, E, a, b, pole, J, Eo) {
    _d.subVectors(E, R); let L = _d.length();
    if (L < 1e-6) { _d.set(0, -1, 0); L = 1e-6; } else _d.multiplyScalar(1 / L);
    L = Math.min(a + b - 1e-4, Math.max(Math.abs(a - b) + 1e-4, L));
    _p.copy(pole).addScaledVector(_d, -pole.dot(_d));
    if (_p.lengthSq() < 1e-8) _p.set(0, 0, 1).addScaledVector(_d, -_d.z);
    _p.normalize();
    const ca = (a * a + L * L - b * b) / (2 * a * L), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    J.copy(R).addScaledVector(_d, ca * a).addScaledVector(_p, sa * a);
    Eo.copy(R).addScaledVector(_d, L);
    return _p;
  }
  // xương trên đặt tại R: trục −Y chĩa tới J, trục +Z gần zRef nhất
  function aimBone(bone, R, J, zRef) {
    _y.subVectors(R, J).normalize();
    _z.copy(zRef).addScaledVector(_y, -zRef.dot(_y));
    if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
    _z.normalize();
    _x.crossVectors(_y, _z);
    _m4.makeBasis(_x, _y, _z); bone.quaternion.setFromRotationMatrix(_m4);
  }
  // xương dưới (con của xương trên, gốc tại J): gập quanh trục X của nó cho tới khi chĩa vào Eo
  function bendBone(lower, upperQ, J, Eo) {
    _w.subVectors(Eo, J).normalize().applyQuaternion(_qi.copy(upperQ).invert());
    lower.rotation.set(Math.atan2(-_w.z, -_w.y), 0, 0);
  }
  // kiếm tại vị trí swu (0..1) trên chuỗi khoá swk: {p:[x,y,z] (chỗ tay phải), yaw, pitch (hướng lưỡi), roll}
  function swordAt(P) {
    const ks = P.swk, n = ks.length - 1;
    if (n <= 0) return ks[0];
    const x = Math.min(n - 1e-6, Math.max(0, P.swu * n)), i = Math.floor(x), f = x - i, a = ks[i], b = ks[i + 1];
    return { p: [lerp(a.p[0], b.p[0], f), lerp(a.p[1], b.p[1], f), lerp(a.p[2], b.p[2], f)], yaw: lerp(a.yaw, b.yaw, f), pitch: lerp(a.pitch, b.pitch, f), roll: lerp(a.roll || 0, b.roll || 0, f) };
  }
  function rig(o) {
    const body = o.getObjectByName('body'), bi = o.getObjectByName('bodyIn');
    const legsR = ['R', 'L'].map(s => ({ s, sx: s === 'R' ? -1 : 1, th: o.getObjectByName('leg' + s), sh: o.getObjectByName('shin' + s), ft: o.getObjectByName('foot' + s) }));
    const armsR = ['R', 'L'].map(s => ({ sx: s === 'R' ? -1 : 1, up: o.getObjectByName('arm' + s), fo: o.getObjectByName('fore' + s) }));
    const sw = o.getObjectByName('sword'), shG = o.getObjectByName('shield'), capeG = o.getObjectByName('capeG');
    const pads = []; o.traverse(x => { if (x.name === 'pauldron') pads.push(x); });
    for (const a of armsR) a.pad = pads.find(p => Math.sign(p.position.x) === a.sx) || null;
    const grip = (sw && sw.userData.grip) || [0], two = grip.length > 1;
    const hip = new T.Vector3(), ank = new T.Vector3(), J = new T.Vector3(), Eo = new T.Vector3(), pole = new T.Vector3(), zr = new T.Vector3();
    const S = new T.Vector3(), G = new T.Vector3(), dir = new T.Vector3(), H = new T.Vector3(), tgt = new T.Vector3();
    const xa = new T.Vector3(), za = new T.Vector3(), ya = new T.Vector3(), tmp = new T.Vector3();
    const qF = new T.Quaternion(), qA = new T.Quaternion(), qS = new T.Quaternion(), M4 = new T.Matrix4();
    const REACH = LA1 + LA2 - 0.012;
    function armIK(a, Ht) {
      S.set(a.sx * SH_X, SH_Y, 0);
      pole.set(a.sx * 0.55, -0.75, -0.35);                         // khuỷu chĩa xuống, ra ngoài, ra sau
      zr.copy(solve2(S, Ht, LA1, LA2, pole, J, Eo)).negate();        // mặt trước cánh tay ngược hướng khuỷu
      aimBone(a.up, S, J, zr);
      bendBone(a.fo, a.up.quaternion, J, Eo);
      if (a.pad) {                                                   // vai giáp nhấc theo cánh tay trên
        tmp.set(0, -1, 0).applyQuaternion(a.up.quaternion);
        const fr = Math.atan2(tmp.z, -tmp.y), sr = Math.atan2(a.sx * tmp.x, -tmp.y);
        a.pad.rotation.set(-Math.max(-0.4, fr) * 0.3, 0, a.sx * Math.max(0, sr) * 0.35);
      }
    }
    return function tick() {
      const P = o.userData.pose; if (!P) return;
      // 1) thân: hạ / tiến / nghiêng / vặn quanh khớp chậu
      body.position.set(0, HIP + P.y, P.z);
      body.rotation.set(P.lean, P.twist, P.roll, 'YXZ');
      // áo choàng: gần như rủ thẳng dù thân đổ tới, tung ra sau theo flare
      if (capeG) capeG.rotation.set(-P.lean * 0.85 + (P.flare || 0), 0, -P.roll * 0.6);
      // 2) chân: bàn chân đặt trên sàn → tính ngược ra gối (gối chĩa theo mũi chân)
      for (const L of legsR) {
        hip.set(L.sx * HX, 0, 0).applyEuler(body.rotation).add(body.position);
        const f = L.s === 'R' ? P.fR : P.fL;
        ank.set(f[0], ANK + ((L.s === 'R' ? P.fRy : P.fLy) || 0), f[1]);
        const fy = P.twist * 0.45 + L.sx * 0.16;
        pole.set(Math.sin(fy), 0.05, Math.cos(fy));
        L.th.position.copy(hip);
        const pp = solve2(hip, ank, L1, L2, pole, J, Eo);
        aimBone(L.th, hip, J, pp);
        bendBone(L.sh, L.th.quaternion, J, Eo);
        qF.setFromAxisAngle(UP, fy);                                 // bàn chân phẳng trên sàn, mũi theo fy
        qA.copy(L.th.quaternion).multiply(L.sh.quaternion).invert();
        L.ft.quaternion.copy(qA).multiply(qF);
      }
      if (!sw) return;
      // 3) kiếm: điểm trên đường vung → xoay về phía đối thủ (oppYaw) → ngắm vào điểm đích (nếu có)
      const k = swordAt(P), oy = P.oppYaw || 0, c = Math.cos(oy), s = Math.sin(oy);
      G.set(k.p[0] * c + k.p[2] * s, k.p[1], -k.p[0] * s + k.p[2] * c);
      let yaw = k.yaw + oy, pitch = k.pitch;
      const hasT = !!P.target && (P.aimW > 0 || P.shAimW > 0);
      if (hasT) { bi.updateWorldMatrix(true, false); tgt.set(P.target.x, P.target.y, P.target.z); bi.worldToLocal(tgt); }
      if (hasT && P.aimW > 0 && P.aimReach > 0) {                                      // kéo chuôi tới/lui: điểm chạm rơi vào ~2/3 lưỡi
        dir.subVectors(tgt, G); const dl = dir.length();
        if (dl > 1e-4) G.addScaledVector(dir, (dl - P.aimReach) / dl * P.aimW);
      }
      S.set(-SH_X, SH_Y, 0); const ds = G.distanceTo(S);
      if (ds > REACH) G.sub(S).multiplyScalar(REACH / ds).add(S);                     // chuôi luôn trong tầm tay phải
      if (hasT && P.aimW > 0) {                                                        // ngắm SAU khi kẹp: lưỡi luôn đi qua điểm đích
        dir.subVectors(tgt, G); const dl = dir.length();
        if (dl > 1e-4) {
          dir.multiplyScalar(1 / dl);
          let yA = Math.atan2(dir.x, dir.z); while (yA - yaw > Math.PI) yA -= TAU; while (yA - yaw < -Math.PI) yA += TAU;
          yaw = lerp(yaw, yA, P.aimW); pitch = lerp(pitch, Math.asin(Math.max(-1, Math.min(1, dir.y))), P.aimW);
        }
      }
      dir.set(Math.cos(pitch) * Math.sin(yaw), Math.sin(pitch), Math.cos(pitch) * Math.cos(yaw));
      xa.crossVectors(dir, UP); if (xa.lengthSq() < 1e-6) xa.set(1, 0, 0); xa.normalize();
      za.crossVectors(xa, dir);
      // xoay quanh lưỡi: mặt bản kiếm quay về phía máy quay (camX = phía máy quay trong toạ độ mẫu)
      const r = (k.roll || 0) - (P.camX || -1) * Math.PI / 2, cR = Math.cos(r), sR = Math.sin(r);
      ya.copy(xa).multiplyScalar(cR).addScaledVector(za, -sR);
      tmp.copy(xa).multiplyScalar(sR).addScaledVector(za, cR);
      M4.makeBasis(ya, dir, tmp); sw.quaternion.setFromRotationMatrix(M4);
      sw.position.copy(G).addScaledVector(dir, -grip[0]);
      // 4) tay phải ôm chuôi; tay trái ôm chuôi dưới (kiếm 2 tay) hoặc cầm khiên
      armIK(armsR[0], G);
      if (two) { H.copy(G).addScaledVector(dir, grip[1] - grip[0]); armIK(armsR[1], H); }
      else if (shG) {
        const q = P.shk;
        H.set(q.p[0] * c + q.p[2] * s, q.p[1], -q.p[0] * s + q.p[2] * c);
        armIK(armsR[1], H);
        let sy = q.yaw + oy, sp = q.pitch;
        if (hasT && P.shAimW > 0) {                                  // mặt khiên quay vào người đang chém
          tmp.subVectors(tgt, H).normalize();
          let yA = Math.atan2(tmp.x, tmp.z); while (yA - sy > Math.PI) yA -= TAU; while (yA - sy < -Math.PI) yA += TAU;
          sy = lerp(sy, yA, P.shAimW); sp = lerp(sp, Math.asin(Math.max(-1, Math.min(1, tmp.y))) + 0.1, P.shAimW);
          // nghiêng mặt khiên về phía máy quay (ảnh lần 1: khiên quay thẳng vào Vua → máy quay chỉ thấy cạnh mỏng, vết nứt mất)
          sy += (P.camX || -1) * 0.6 * P.shAimW;
        }
        za.set(Math.cos(sp) * Math.sin(sy), Math.sin(sp), Math.cos(sp) * Math.cos(sy));
        xa.crossVectors(UP, za).normalize(); ya.crossVectors(za, xa);
        M4.makeBasis(xa, ya, za); qS.setFromRotationMatrix(M4);                     // hướng mặt khiên trong thân
        qA.copy(armsR[1].up.quaternion).multiply(armsR[1].fo.quaternion).invert();
        shG.quaternion.copy(qA).multiply(qS);                                     // khiên là con của cẳng tay trái
        shG.position.set(0, -0.08, 0).add(tmp.set(0, 0, 0.034).applyQuaternion(shG.quaternion));
      }
    };
  }

  /* ---------- DÁNG (con số chess_view.js đổi theo thời gian) — tác giả viết như thể đối thủ đứng thẳng trước mặt (+Z) ---------- */
  const BODY = {
    stance: { y: -0.015, z: 0, lean: 0, twist: 0, roll: 0, flare: 0, fR: [-0.09, -0.04], fL: [0.09, 0.05] },
    ready:  { y: -0.04, z: 0, lean: 0.05, twist: -0.15, roll: 0, flare: 0.05, fR: [-0.1, -0.12], fL: [0.1, 0.1] },        // thủ thế, tấn vừa
    windup: { y: -0.07, z: -0.03, lean: -0.08, twist: -0.45, roll: 0.03, flare: 0.12, fR: [-0.12, -0.2], fL: [0.1, 0.11] },  // lấy đà: vặn vai phải ra sau
    // lao tới: chân sau duỗi dài (ảnh lần 1: chân sau bị áo choàng che), chân trước bước dài gập gối, thân đổ tới, áo tung ra sau
    lunge:  { y: -0.15, z: 0.04, lean: 0.3, twist: 0.32, roll: -0.04, flare: 0.6, fR: [-0.13, -0.25], fL: [0.1, 0.25] },
    // thủ: vai trái (khiên) ra trước, tấn thấp, đổ người vào khiên (lần đo 3: Mã thủ còn đứng thẳng so với hình đích)
    guard:  { y: -0.09, z: -0.01, lean: 0.12, twist: -0.34, roll: 0, flare: 0.1, fR: [-0.11, -0.2], fL: [0.12, 0.15] },
    recoil: { y: -0.1, z: -0.06, lean: -0.22, twist: -0.24, roll: 0.06, flare: 0.32, fR: [-0.11, -0.22], fL: [0.12, 0.1] },   // bị dội lùi
    kneel:  { y: -0.2, z: 0.02, lean: 0.32, twist: -0.1, roll: 0.04, flare: 0.12, fR: [-0.1, -0.23], fL: [0.1, 0.16] }          // gục một gối
  };
  const SWK = {     // Vua: kiếm HAI TAY (p = chỗ tay phải trên chuôi, yaw/pitch = hướng lưỡi)
    rest:   { p: [0.0, 0.62, 0.19], yaw: 0.15, pitch: 0.55, roll: 0 },
    windup: { p: [-0.12, 0.95, 0.06], yaw: -2.7, pitch: 0.45, roll: 0.3 },
    mid:    { p: [-0.08, 1.0, 0.18], yaw: -0.9, pitch: 0.9, roll: 0.2 },
    strike: { p: [-0.02, 0.73, 0.27], yaw: 0.1, pitch: 0.05, roll: 0 },
    parry:  { p: [0.0, 0.73, 0.23], yaw: 0.6, pitch: 0.75, roll: 0 },
    down:   { p: [0.02, 0.5, 0.2], yaw: 0.1, pitch: -0.9, roll: 0 }
  };
  const SWN = {     // Mã: kiếm MỘT TAY (tay trái cầm khiên)
    rest:   { p: [-0.2, 0.52, 0.12], yaw: 0.2, pitch: -0.35, roll: 0 },
    guard:  { p: [-0.24, 0.56, -0.02], yaw: 0.45, pitch: -0.45, roll: 0 },
    windup: { p: [-0.2, 0.98, -0.04], yaw: -2.6, pitch: 0.5, roll: 0.3 },
    mid:    { p: [-0.14, 1.0, 0.14], yaw: -0.9, pitch: 0.85, roll: 0.2 },
    strike: { p: [-0.06, 0.74, 0.28], yaw: 0.15, pitch: 0.05, roll: 0 },
    down:   { p: [-0.2, 0.45, 0.1], yaw: 0.3, pitch: -1.0, roll: 0 }
  };
  const SHD = {     // khiên: chỗ nắm tay trái + hướng mặt khiên
    rest:  { p: [0.16, 0.56, 0.15], yaw: 0.25, pitch: -0.1 },
    guard: { p: [0.08, 0.7, 0.24], yaw: 0.0, pitch: 0.12 },
    down:  { p: [0.18, 0.45, 0.08], yaw: 0.4, pitch: -0.3 }
  };
  const POSE = { body: BODY, swK: SWK, swN: SWN, shield: SHD };
  const cp = v => JSON.parse(JSON.stringify(v));
  function defaultPose(t) {
    const P = Object.assign({ fRy: 0, fLy: 0, aimW: 0, aimReach: 0, target: null, shAimW: 0, oppYaw: 0, camX: -1, swu: 0 }, cp(BODY.ready));
    P.swk = [cp((t === 'k' ? SWK : SWN).rest)];
    P.shk = cp(SHD.rest);
    return P;
  }

  /* ---------- lắp chiến binh ---------- */
  function build(t, c) {
    const M = mats(c);
    const g = new T.Group();
    const body = new T.Group(); body.name = 'body'; body.position.set(0, HIP, 0); g.add(body);     // khớp chậu: thân xoay quanh đây
    const bi = new T.Group(); bi.name = 'bodyIn'; bi.position.set(0, -HIP, 0); body.add(bi);       // toạ độ bên trong = toạ độ mẫu
    legs(g, M);
    torso(bi, M);
    cape(bi, M, {});
    tabard(bi, M);
    if (t === 'k') { kingHelm(bi, M); furCollar(bi, M); } else horseHelm(bi, M);
    const pR = pauldron(-1, M), pL = pauldron(1, M);
    bi.add(pR, pL);
    const armR = armGroup(-1, M, 'armR'), armL = armGroup(1, M, 'armL');
    bi.add(armR, armL);
    const two = t === 'k';
    // kiếm ngắn lại so với bản 3 (đo hình đích: cả cây ~½ chiều cao người; bản 3 dài ~⅔ → chém xuyên qua đối thủ)
    bi.add(two ? sword(M, 0.47, 0.026, true) : sword(M, 0.4, 0.021, false));
    if (!two) armL.getObjectByName('foreL').add(kiteShield(M));
    // gộp mảnh đứng yên trong từng xương cho ít lượt vẽ; xương con, vai, kiếm, khiên giữ riêng
    const by = n => g.getObjectByName(n);
    for (const s of ['R', 'L']) {
      mergeByMat(by('leg' + s), ['shin' + s]); mergeByMat(by('shin' + s), ['foot' + s]); mergeByMat(by('foot' + s), []);
      mergeByMat(by('arm' + s), ['fore' + s]); mergeByMat(by('fore' + s), ['shield', 'sword']);
    }
    mergeByMat(pR, []); mergeByMat(pL, []);
    mergeByMat(bi, ['armR', 'armL', 'pauldron', 'shield', 'sword', 'capeG']);
    g.userData.knight = true; g.userData.twoHand = two; g.userData.kind = t;
    return g;
  }
  const TPL = {};
  window.ChessKnights = {
    has: t => t === 'k' || t === 'n',
    make(t, c) {
      const k = t + c;
      if (!TPL[k]) TPL[k] = build(t, c);
      // nhân bản: chia sẻ hình + vật liệu; dáng + hàm tick là CỦA RIÊNG bản sao (clone chép userData bằng JSON → mất hàm)
      const o = TPL[k].clone(true);
      o.userData.pose = defaultPose(t);
      o.userData.tick = rig(o);
      o.traverse(x => { if (x.isMesh) x.userData.shared = true; });
      const cr = o.getObjectByName('crack'); if (cr) { cr.material = crackMat(); cr.visible = false; }   // vết nứt riêng từng con
      o.userData.tick();
      return o;
    },
    POSE,
    swordNow: P => cp(swordAt(P)),
    bladeLen: o => { const b = o.getObjectByName('blade'); return b ? b.userData.len : 0.4; },
    _mats: mats
  };
})();
