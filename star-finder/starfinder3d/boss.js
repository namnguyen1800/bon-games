// SINH TU DONG boi tools/make_boss_js.py — DUNG SUA TAY (sua ban mau roi chay lai script).
// Hinh boss Vua Sam cua ban mau da duyet: than may cuon + tia dien + vuong mien + 13 mat ve tay (12 mat cua mau + 'happy').
window.SFBoss = (function () {
  const TAU = Math.PI * 2;
  function create(o) { // o: { G: bo do hoa (SFG), scene, R: ban kinh than boss tinh bang o }
    const G = o.G, scene = o.scene, TEX = G.TEX, BGU = THREE.BufferGeometryUtils, rnd = G.rnd;
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    if (!TEX.z) { TEX.z = G.canvasTex(128, 128, function (g) { g.font = '700 104px "Fredoka", "Arial Rounded MT Bold", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 14; g.strokeStyle = '#1e2a48'; g.strokeText('Z', 64, 68); g.fillStyle = '#e8f0ff'; g.fillText('Z', 64, 68); }); }
  const BOSS_FACES = ['sleep', 'wake', 'roar', 'grumpy', 'scheme', 'gloat', 'swoop', 'hurt', 'rage', 'panic', 'dizzy', 'sad', 'happy'];
  function faceCanvases(name) {
    const P = document.createElement('canvas'), Q = document.createElement('canvas'); P.width = P.height = Q.width = Q.height = 512;
    const p = P.getContext('2d'), g = Q.getContext('2d'); p.lineCap = p.lineJoin = g.lineCap = g.lineJoin = 'round';
    const DK = '#090d1c', EX = [178, 334], EY = 230;
    function socket(cx, cy, rx, ry, rot) { p.save(); p.translate(cx, cy); p.rotate(rot || 0); p.fillStyle = DK; p.beginPath(); p.ellipse(0, 0, rx + 11, ry + 11, 0, 0, TAU); p.fill(); p.restore(); }
    function eye(cx, cy, rx, ry, o) { // mắt phát sáng; o: rot, lid (0..1 che từ trên), lidTilt, pupil [dx,dy,r], col
      o = o || {}; socket(cx, cy, rx, ry, o.rot);
      g.save(); g.translate(cx, cy); g.rotate(o.rot || 0);
      g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU);
      if (o.lid) { g.save(); g.clip(); g.beginPath(); g.rect(-rx - 4, -ry - 4 + o.lid * ry * 2, rx * 2 + 8, ry * 2 + 8); g.restore(); g.save(); g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU); g.clip(); g.beginPath(); g.rotate(o.lidTilt || 0); g.rect(-rx * 2, -ry - 4 + o.lid * ry * 2, rx * 4, ry * 4); g.clip(); }
      else { g.save(); g.clip(); }
      const gr = g.createRadialGradient(0, -ry * 0.2, 2, 0, 0, Math.max(rx, ry) * 1.05); gr.addColorStop(0, '#fffef0'); gr.addColorStop(0.45, o.col || '#ffe14d'); gr.addColorStop(1, o.col2 || '#ff9f0a');
      g.fillStyle = gr; g.fillRect(-rx - 5, -ry - 5, rx * 2 + 10, ry * 2 + 10); g.restore();
      if (o.lid) { p.save(); p.translate(cx, cy); p.rotate((o.rot || 0) + (o.lidTilt || 0)); p.strokeStyle = DK; p.lineWidth = 14; p.beginPath(); p.moveTo(-rx - 6, -ry + o.lid * ry * 2); p.lineTo(rx + 6, -ry + o.lid * ry * 2); p.stroke(); p.restore(); }
      if (o.pupil) { const q = o.pupil, r0 = o.rot || 0, px = cx + q[0] * Math.cos(r0) - q[1] * Math.sin(r0), py = cy + q[0] * Math.sin(r0) + q[1] * Math.cos(r0); // khoét lỗ con ngươi trên lớp sáng (đang ở hệ toạ độ của mắt) + tô đen trên lớp nét
        g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(q[0], q[1], q[2], 0, TAU); g.fill(); g.restore(); p.fillStyle = DK; p.beginPath(); p.arc(px, py, q[2], 0, TAU); p.fill(); }
      g.restore();
    }
    function brow(cx, cy, len, ang, w) { p.save(); p.translate(cx, cy); p.rotate(ang); p.strokeStyle = DK; p.lineWidth = w || 26; p.beginPath(); p.moveTo(-len / 2, 4); p.quadraticCurveTo(0, -8, len / 2, 0); p.stroke(); p.restore(); }
    function mouthPath(fn, fill) { p.save(); p.beginPath(); fn(p); p.closePath(); p.fillStyle = fill || '#120914'; p.fill(); p.lineWidth = 8; p.strokeStyle = DK; p.stroke(); p.restore(); }
    function teeth(list) { p.fillStyle = '#f8fafc'; p.strokeStyle = '#cbd5e1'; p.lineWidth = 2; for (const t of list) { p.beginPath(); p.moveTo(t[0] - t[2], t[1]); p.lineTo(t[0] + t[2], t[1]); p.lineTo(t[0], t[1] + t[3]); p.closePath(); p.fill(); p.stroke(); } }
    function tongue(cx, cy, rx, ry) { p.save(); p.fillStyle = '#e8435a'; p.beginPath(); p.ellipse(cx, cy, rx, ry, 0, 0, TAU); p.fill(); p.restore(); }
    function closedArc(cx, cy, w, up, glow) { const c = glow ? g : p; c.save(); c.strokeStyle = glow ? '#ffe14d' : DK; c.lineWidth = glow ? 16 : 14; c.beginPath(); c.moveTo(cx - w, cy); c.quadraticCurveTo(cx, cy + (up ? -w * 0.9 : w * 0.7), cx + w, cy); c.stroke(); c.restore();
      if (glow) { p.save(); p.strokeStyle = DK; p.lineWidth = 30; p.beginPath(); p.moveTo(cx - w, cy); p.quadraticCurveTo(cx, cy + (up ? -w * 0.9 : w * 0.7), cx + w, cy); p.stroke(); p.restore(); } }
    function drop(cx, cy, s, colr) { p.save(); p.fillStyle = colr || '#9fd4ff'; p.strokeStyle = '#1e3a5f'; p.lineWidth = 3; p.beginPath(); p.moveTo(cx, cy - s * 1.6); p.quadraticCurveTo(cx + s, cy - s * 0.2, cx + s * 0.8, cy + s * 0.4); p.arc(cx, cy + s * 0.4, s * 0.8, 0, Math.PI); p.quadraticCurveTo(cx - s, cy - s * 0.2, cx, cy - s * 1.6); p.fill(); p.stroke(); p.fillStyle = 'rgba(255,255,255,.8)'; p.beginPath(); p.arc(cx - s * 0.3, cy + s * 0.2, s * 0.22, 0, TAU); p.fill(); p.restore(); }
    function spiral(cx, cy, r) { p.fillStyle = DK; p.beginPath(); p.arc(cx, cy, r + 12, 0, TAU); p.fill(); g.save(); g.strokeStyle = '#ffe14d'; g.lineWidth = 9; g.beginPath(); for (let a = 0; a < TAU * 2.6; a += 0.1) { const rr = r * a / (TAU * 2.6); g.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } g.stroke(); g.restore(); }
    switch (name) {
      case 'sleep':
        closedArc(EX[0], EY + 10, 44, false); closedArc(EX[1], EY + 10, 44, false);
        brow(EX[0], EY - 58, 70, 0.12, 18); brow(EX[1], EY - 58, 70, -0.12, 18);
        mouthPath(c => c.ellipse(262, 352, 26, 32, 0, 0, TAU));
        break;
      case 'wake':
        eye(EX[0], EY, 54, 58, { pupil: [0, 4, 17] }); eye(EX[1], EY, 54, 58, { pupil: [0, 4, 17] });
        brow(EX[0], EY - 92, 92, -0.25, 22); brow(EX[1], EY - 92, 92, 0.25, 22);
        mouthPath(c => c.ellipse(256, 362, 34, 40, 0, 0, TAU)); tongue(256, 384, 18, 10);
        break;
      case 'roar':
        eye(EX[0], EY + 4, 50, 44, { pupil: [8, 0, 13], lid: 0.12, lidTilt: 0.35 }); eye(EX[1], EY + 4, 50, 44, { pupil: [-8, 0, 13], lid: 0.12, lidTilt: -0.35 });
        brow(EX[0] + 6, EY - 64, 110, 0.5); brow(EX[1] - 6, EY - 64, 110, -0.5);
        mouthPath(c => { c.moveTo(150, 318); c.quadraticCurveTo(256, 296, 362, 318); c.quadraticCurveTo(350, 470, 256, 470); c.quadraticCurveTo(162, 470, 150, 318); });
        tongue(256, 446, 58, 22); teeth([[188, 314, 16, 36], [228, 308, 15, 30], [284, 308, 15, 30], [324, 314, 16, 36]]);
        p.save(); p.fillStyle = '#f8fafc'; for (const tx of [212, 256, 300]) { p.beginPath(); p.moveTo(tx - 13, 466); p.lineTo(tx + 13, 466); p.lineTo(tx, 440); p.closePath(); p.fill(); } p.restore();
        break;
      case 'grumpy':
        eye(EX[0], EY, 52, 46, { pupil: [6, 4, 14] }); eye(EX[1], EY, 52, 46, { pupil: [-6, 4, 14] });
        brow(EX[0] + 4, EY - 64, 112, 0.42); brow(EX[1] - 4, EY - 64, 112, -0.42);
        mouthPath(c => { c.moveTo(186, 336); c.quadraticCurveTo(256, 318, 326, 336); c.quadraticCurveTo(318, 410, 256, 410); c.quadraticCurveTo(194, 410, 186, 336); });
        teeth([[222, 332, 14, 30], [256, 328, 14, 32], [290, 332, 14, 30]]);
        break;
      case 'scheme':
        eye(EX[0], EY + 8, 52, 40, { pupil: [14, 6, 13], lid: 0.42, lidTilt: 0.18 }); eye(EX[1], EY + 8, 52, 40, { pupil: [14, 6, 13], lid: 0.42, lidTilt: -0.18 });
        brow(EX[0], EY - 50, 108, 0.28); brow(EX[1], EY - 76, 108, -0.08);
        mouthPath(c => { c.moveTo(150, 330); c.quadraticCurveTo(256, 362, 362, 318); c.quadraticCurveTo(340, 420, 250, 418); c.quadraticCurveTo(170, 410, 150, 330); });
        p.save(); p.fillStyle = '#f8fafc'; p.beginPath(); p.moveTo(160, 336); p.quadraticCurveTo(256, 366, 352, 326); p.lineTo(346, 348); p.quadraticCurveTo(256, 386, 166, 354); p.closePath(); p.fill();
        p.strokeStyle = '#94a3b8'; p.lineWidth = 3; for (let x = 186; x < 340; x += 26) { p.beginPath(); p.moveTo(x, 338 + (x - 160) * 0.02); p.lineTo(x, 372); p.stroke(); } p.restore();
        break;
      case 'gloat':
        closedArc(EX[0], EY + 14, 46, true, true); closedArc(EX[1], EY + 14, 46, true, true);
        brow(EX[0], EY - 60, 96, -0.18, 22); brow(EX[1], EY - 60, 96, 0.18, 22);
        mouthPath(c => { c.moveTo(160, 314); c.quadraticCurveTo(256, 300, 352, 314); c.quadraticCurveTo(346, 452, 256, 452); c.quadraticCurveTo(166, 452, 160, 314); });
        tongue(256, 430, 56, 24); teeth([[200, 312, 15, 26], [312, 312, 15, 26]]);
        break;
      case 'swoop':
        eye(EX[0], EY + 10, 56, 26, { rot: 0.28, pupil: [4, 2, 11] }); eye(EX[1], EY + 10, 56, 26, { rot: -0.28, pupil: [-4, 2, 11] });
        brow(EX[0] + 10, EY - 36, 120, 0.62, 28); brow(EX[1] - 10, EY - 36, 120, -0.62, 28);
        mouthPath(c => c.roundRect ? c.roundRect(176, 324, 160, 64, 22) : c.rect(176, 324, 160, 64));
        p.save(); p.fillStyle = '#f8fafc'; p.fillRect(186, 332, 140, 48); p.strokeStyle = '#64748b'; p.lineWidth = 4; p.beginPath(); p.moveTo(186, 356); p.lineTo(326, 356); for (let x = 214; x < 326; x += 28) { p.moveTo(x, 332); p.lineTo(x, 380); } p.stroke(); p.restore();
        break;
      case 'hurt':
        p.save(); p.strokeStyle = DK; p.lineWidth = 30; for (const [cx, s] of [[EX[0], 1], [EX[1], -1]]) { p.beginPath(); p.moveTo(cx - 44 * s, EY - 34); p.lineTo(cx + 30 * s, EY + 2); p.lineTo(cx - 44 * s, EY + 36); p.stroke(); } p.restore();
        g.save(); g.strokeStyle = '#ffe14d'; g.lineWidth = 12; for (const [cx, s] of [[EX[0], 1], [EX[1], -1]]) { g.beginPath(); g.moveTo(cx - 44 * s, EY - 34); g.lineTo(cx + 30 * s, EY + 2); g.lineTo(cx - 44 * s, EY + 36); g.stroke(); } g.restore();
        brow(EX[0], EY - 72, 92, -0.38, 22); brow(EX[1], EY - 72, 92, 0.38, 22);
        mouthPath(c => { c.moveTo(200, 370); for (let x = 200; x <= 312; x += 8) c.lineTo(x, 352 + Math.sin(x * 0.12) * 10); c.lineTo(312, 412); c.quadraticCurveTo(256, 432, 200, 412); });
        drop(EX[0] - 70, EY + 70, 16);
        break;
      case 'rage':
        eye(EX[0], EY + 6, 50, 36, { pupil: [8, 2, 12], lid: 0.28, lidTilt: 0.5, col: '#ff8a3d', col2: '#ff2a10' }); eye(EX[1], EY + 6, 50, 36, { pupil: [-8, 2, 12], lid: 0.28, lidTilt: -0.5, col: '#ff8a3d', col2: '#ff2a10' });
        brow(EX[0] + 10, EY - 46, 124, 0.7, 32); brow(EX[1] - 10, EY - 46, 124, -0.7, 32);
        mouthPath(c => { c.moveTo(176, 330); c.lineTo(336, 330); c.lineTo(336, 396); c.lineTo(176, 396); });
        p.save(); p.fillStyle = '#f8fafc'; p.beginPath(); p.moveTo(184, 336); for (let x = 184; x <= 328; x += 18) p.lineTo(x + 9, x % 36 < 18 ? 362 : 352); p.lineTo(328, 336); p.closePath(); p.fill();
        p.beginPath(); p.moveTo(184, 390); for (let x = 184; x <= 328; x += 18) p.lineTo(x + 9, x % 36 < 18 ? 366 : 374); p.lineTo(328, 390); p.closePath(); p.fill(); p.restore();
        p.save(); p.strokeStyle = '#b91c1c'; p.lineWidth = 9; for (const [x, y] of [[96, 120], [416, 120]]) { p.beginPath(); p.moveTo(x - 18, y); p.lineTo(x + 18, y); p.moveTo(x, y - 18); p.lineTo(x, y + 18); p.stroke(); } p.restore();
        break;
      case 'panic':
        eye(EX[0], EY, 58, 64, { pupil: [0, 10, 13], col: '#fff3a0', col2: '#ffd34d' }); eye(EX[1], EY, 58, 64, { pupil: [0, 10, 13], col: '#fff3a0', col2: '#ffd34d' });
        brow(EX[0] + 4, EY - 96, 96, -0.42, 22); brow(EX[1] - 4, EY - 96, 96, 0.42, 22);
        mouthPath(c => { c.moveTo(196, 390); for (let x = 196; x <= 316; x += 6) c.lineTo(x, 372 + Math.sin(x * 0.2) * 8); c.lineTo(316, 410); for (let x = 316; x >= 196; x -= 6) c.lineTo(x, 418 + Math.sin(x * 0.2 + 1) * 6); });
        drop(84, 180, 20); drop(430, 210, 17); drop(118, 330, 13);
        break;
      case 'dizzy':
        spiral(EX[0], EY, 48); spiral(EX[1], EY, 48);
        brow(EX[0], EY - 82, 86, 0.2, 18); brow(EX[1], EY - 82, 86, -0.3, 18);
        mouthPath(c => { c.moveTo(186, 360); for (let x = 186; x <= 326; x += 6) c.lineTo(x, 356 + Math.sin(x * 0.09) * 14); c.lineTo(326, 392); for (let x = 326; x >= 186; x -= 6) c.lineTo(x, 392 + Math.sin(x * 0.09) * 14); });
        tongue(286, 410, 22, 26);
        break;
      case 'happy': // thua roi: het gian, cuoi tit mat, ma hong
        closedArc(EX[0], EY + 14, 46, true, true); closedArc(EX[1], EY + 14, 46, true, true);
        brow(EX[0], EY - 66, 84, -0.3, 18); brow(EX[1], EY - 66, 84, 0.3, 18);
        mouthPath(c => { c.moveTo(176, 330); c.quadraticCurveTo(256, 352, 336, 330); c.quadraticCurveTo(326, 432, 256, 432); c.quadraticCurveTo(186, 432, 176, 330); });
        tongue(256, 412, 44, 18);
        p.save(); p.fillStyle = 'rgba(255,120,150,0.75)'; for (const cx of [108, 404]) { p.beginPath(); p.ellipse(cx, 304, 34, 22, 0, 0, TAU); p.fill(); } p.restore();
        break;
      case 'sad':
        eye(EX[0], EY + 6, 50, 54, { pupil: [0, 14, 24], lid: 0.06, lidTilt: -0.4, col: '#fff7c2', col2: '#ffc93d' }); eye(EX[1], EY + 6, 50, 54, { pupil: [0, 14, 24], lid: 0.06, lidTilt: 0.4, col: '#fff7c2', col2: '#ffc93d' });
        g.save(); g.globalCompositeOperation = 'destination-out'; g.fillStyle = '#000'; for (const cx of EX) { g.beginPath(); g.arc(cx - 8, EY + 8, 7, 0, TAU); g.fill(); } g.restore();
        p.save(); p.fillStyle = '#ffffff'; for (const cx of EX) { p.beginPath(); p.arc(cx - 8, EY + 8, 7, 0, TAU); p.fill(); } p.restore();
        brow(EX[0] + 4, EY - 74, 90, -0.45, 20); brow(EX[1] - 4, EY - 74, 90, 0.45, 20);
        mouthPath(c => { c.moveTo(206, 404); c.quadraticCurveTo(256, 350, 306, 404); c.quadraticCurveTo(256, 386, 206, 404); });
        drop(EX[0] - 40, EY + 82, 14, '#bfe3ff'); drop(EX[1] + 44, EY + 92, 12, '#bfe3ff');
        break;
    }
    const tp = new THREE.CanvasTexture(P), tg = new THREE.CanvasTexture(Q); tp.encoding = THREE.sRGBEncoding; tg.encoding = THREE.sRGBEncoding; tp.anisotropy = tg.anisotropy = 4;
    return { paint: tp, glow: tg };
  }

  function buildBoss() {
    const R = o.R, root = new THREE.Group(), wob = new THREE.Group(); root.add(wob);
    // thân: nhiều cục mây sần (dồn đỉnh, bỏ đường nối để mịn), vùng mặt ở giữa nhẵn hơn
    const L = [[0, 0, 0.12, 0.98, 0.035], [-0.98, 0.18, -0.12, 0.74, 0.1], [0.98, 0.16, -0.12, 0.76, 0.1], [-0.52, 0.66, -0.14, 0.66, 0.1], [0.48, 0.7, -0.2, 0.64, 0.1], [0, 0.82, -0.36, 0.6, 0.1],
      [-1.5, -0.2, -0.22, 0.56, 0.12], [1.55, -0.14, -0.22, 0.57, 0.12], [-1.28, 0.42, -0.45, 0.52, 0.12], [1.3, 0.46, -0.45, 0.52, 0.12], [-0.8, -0.48, 0.02, 0.6, 0.1], [0.8, -0.48, 0.02, 0.62, 0.1],
      [0, -0.6, -0.1, 0.6, 0.1], [-1.9, -0.38, -0.32, 0.38, 0.14], [1.95, -0.32, -0.32, 0.38, 0.14], [-0.2, 0.25, -0.85, 0.92, 0.1], [0.65, 0.12, -0.85, 0.82, 0.1], [-1.0, -0.1, -0.75, 0.72, 0.1], [1.15, -0.05, -0.75, 0.72, 0.1]];
    for (let i = 0; i < 22; i++) { const a = -0.3 + rnd(i * 4.4 + 2) * (Math.PI + 0.6) * (rnd(i * 2.1) < 0.5 ? 1 : -1) * 0 + (i / 22) * TAU, rr = 1.08 + rnd(i * 3.3) * 0.5; L.push([Math.cos(a) * rr * 1.25, Math.sin(a) * rr * 0.7 + 0.05, 0.05 + rnd(i * 5.7) * 0.3, 0.28 + rnd(i * 7.1) * 0.16, 0.14]); }
    const geos = [], tmp = new THREE.Vector3();
    L.forEach(function (l, li) {
      let g = new THREE.IcosahedronGeometry(l[3] * R, li === 0 ? 5 : 4); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = BGU.mergeVertices(g);
      const p = g.attributes.position, cl = new Float32Array(p.count * 3);
      for (let i = 0; i < p.count; i++) { tmp.fromBufferAttribute(p, i); const n = tmp.clone().normalize();
        const f = (G.vnoise(n.x * 3.1 + li * 7, n.y * 3.1) + G.vnoise(n.y * 3.3 + 3, n.z * 3.3 + li) + G.vnoise(n.z * 6.1 + li, n.x * 6.1) * 0.6) / 2.6;
        const d = (f - 0.45) * 2 * l[4]; tmp.addScaledVector(n, d * l[3] * R); tmp.x += l[0] * R; tmp.y += l[1] * R; tmp.z += l[2] * R; p.setXYZ(i, tmp.x, tmp.y, tmp.z);
        const ao = 0.62 + clamp(f * 1.1, 0, 1) * 0.5 + Math.max(0, n.y) * 0.12; cl[i * 3] = ao; cl[i * 3 + 1] = ao; cl[i * 3 + 2] = ao; }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.computeVertexNormals(); geos.push(g);
    });
    const bodyU = { uRim: { value: new THREE.Color(0.25, 0.4, 0.9) }, uTint: { value: new THREE.Color(1, 1, 1) }, uHurt: { value: 0 }, uInner: { value: 0 } };
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x46557a, roughness: 0.96, vertexColors: true, envMapIntensity: 0.5 });
    bodyMat.onBeforeCompile = function (sh) {
      Object.assign(sh.uniforms, bodyU);
      sh.fragmentShader = 'uniform vec3 uRim, uTint; uniform float uHurt, uInner;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', [
        'vec3 vdir = normalize(vViewPosition); float rim = pow(1.0 - clamp(dot(normal, vdir), 0.0, 1.0), 2.6);',
        'gl_FragColor.rgb *= uTint; gl_FragColor.rgb += uRim * rim * 0.55 + vec3(1.0, 0.75, 0.3) * uInner * (0.2 + rim);',
        'gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(1.3, 1.3, 1.5), uHurt * (0.10 + rim * 0.55));',
        '#include <dithering_fragment>'].join('\n'));
    };
    const body = new THREE.Mesh(BGU.mergeBufferGeometries(geos), bodyMat); body.castShadow = true; wob.add(body);
    // mặt: 2 lớp vẽ trên chỏm cầu ôm sát cục giữa (lớp nét + lớp mắt phát sáng)
    const faceGeo = new THREE.SphereGeometry(1.0 * R, 48, 32, Math.PI / 2 - 0.95, 1.9, Math.PI / 2 - 0.8, 1.6); faceGeo.translate(0, 0, 0.12 * R);
    const FACE = {}; for (const f of BOSS_FACES) FACE[f] = faceCanvases(f);
    const paintMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.paint, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const glowMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.glow, color: G.hdr(0xffffff, 3.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
    const paint = new THREE.Mesh(faceGeo, paintMat), glw = new THREE.Mesh(faceGeo, glowMat); paint.renderOrder = 7; glw.renderOrder = 8; wob.add(paint); wob.add(glw);
    const eyeGlows = [-1, 1].map(s => { const sp = G.glow(G.hdr(0xffc94a, 1.6), 1.25 * R, 0.35); sp.position.set(s * 0.36 * R, 0.08 * R, 1.25 * R); wob.add(sp); return sp; });
    // tia điện chạy trên mặt mây: dò bề mặt thật bằng tia chiếu từ ngoài vào
    const ray = new THREE.Raycaster(), arcs = [], arcMat = () => new THREE.MeshBasicMaterial({ color: G.hdr(0xffc23a, 2.4), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
    body.updateMatrixWorld(true);
    const parts = geos.map(function (g) { const m = new THREE.Mesh(g); m.matrixAutoUpdate = false; m.matrixWorld.copy(body.matrixWorld); return m; });
    function surf(dir) { ray.set(dir.clone().multiplyScalar(6 * R), dir.clone().negate()); const h = ray.intersectObjects(parts, false)[0]; return h ? h.point.clone().addScaledVector(h.face.normal, 0.03) : null; }
    function inFace(d) { return d.z > 0.35 && Math.abs(d.x) < 0.52 && d.y > -0.42 && d.y < 0.4; }
    for (let a = 0; a < 26; a++) {
      let d = new THREE.Vector3(rnd(a * 3.1) * 2 - 1, rnd(a * 5.3) * 1.6 - 0.7, 0.2 + rnd(a * 7.7) * 0.9).normalize(); if (inFace(d)) d.x += d.x < 0 ? -0.6 : 0.6; d.normalize();
      const pts = []; let heading = new THREE.Vector3(rnd(a * 2.2) - 0.5, rnd(a * 4.4) - 0.5, 0).normalize();
      for (let k = 0; k < 16; k++) { const p = surf(d); if (p) pts.push(p); heading.add(new THREE.Vector3((rnd(a * 13 + k) - 0.5) * 2.6, (rnd(a * 17 + k) - 0.5) * 2.6, 0)).normalize(); const nd = d.clone().addScaledVector(heading, 0.085); nd.z = Math.max(0.05, nd.z); nd.normalize(); if (!inFace(nd)) d = nd; }
      if (pts.length < 4) continue;
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0), m = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.008 * R, 4), arcMat());
      const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 64, 0.03 * R, 5), new THREE.MeshBasicMaterial({ color: G.hdr(0xffa020, 0.9), transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false }));
      m.renderOrder = halo.renderOrder = 6; m.add(halo); m.userData.phase = rnd(a * 9.1) * 10; wob.add(m); arcs.push(m);
    }
    // vương miện kim loại + đá quý
    const crown = new THREE.Group(), cm = new THREE.MeshStandardMaterial({ color: 0xffc83d, roughness: 0.22, metalness: 1, emissive: 0x6a3c00, emissiveIntensity: 0.4, envMapIntensity: 1.1 });
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.5 * R, 0.44 * R, 0.24 * R, 40, 1, true), cm); band.material.side = THREE.DoubleSide; crown.add(band);
    const rimT = new THREE.Mesh(new THREE.TorusGeometry(0.47 * R, 0.035 * R, 10, 40), cm); rimT.rotation.x = Math.PI / 2; rimT.position.y = -0.12 * R; crown.add(rimT);
    const gemCols = [0xff2448, 0x2f7dff, 0x18c964, 0xff2448, 0x2f7dff];
    for (let i = 0; i < 7; i++) { const a = i / 7 * TAU, c = new THREE.Mesh(new THREE.ConeGeometry(0.11 * R, 0.4 * R, 4), cm); c.position.set(Math.cos(a) * 0.47 * R, 0.3 * R, Math.sin(a) * 0.47 * R); c.rotation.y = -a; c.castShadow = true; crown.add(c);
      const ball = new THREE.Mesh(new THREE.SphereGeometry(0.055 * R, 12, 10), cm); ball.position.set(Math.cos(a) * 0.47 * R, 0.52 * R, Math.sin(a) * 0.47 * R); crown.add(ball); }
    for (let i = 0; i < 5; i++) { const a = -0.55 + i * 0.28 + Math.PI / 2; const gm = new THREE.Mesh(new THREE.OctahedronGeometry(0.085 * R, 1), new THREE.MeshPhysicalMaterial({ color: gemCols[i], roughness: 0.05, metalness: 0, clearcoat: 1, emissive: gemCols[i], emissiveIntensity: 0.45 }));
      gm.position.set(Math.cos(a) * 0.5 * R, 0, Math.sin(a) * 0.5 * R); gm.scale.set(1, 1.2, 0.6); gm.lookAt(0, 0, 0); crown.add(gm); }
    crown.position.set(0.12 * R, 1.12 * R, -0.05 * R); crown.rotation.z = -0.08; wob.add(crown);
    root.visible = false; scene.add(root);
    // chữ Z khi ngủ
    const zs = [0, 1, 2].map(i => { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.z, transparent: true, depthWrite: false })); s.renderOrder = 9; root.add(s); return s; });
    return { root: root, wob: wob, body: body, U: bodyU, mat: bodyMat, paint: paintMat, glow: glowMat, FACE: FACE, face: 'grumpy', arcs: arcs, crown: crown, crownHome: crown.position.clone(), eyeGlows: eyeGlows, zs: zs, R: R,
      crownV: 0, crownA: 0, crownFly: null, deflate: 0, scaleK: 1 };
  }

  function makeRain(n, z0, z1, len, wid, alpha) {
    const pos = new Float32Array(n * 12), seed = new Float32Array(n * 12), cor = new Float32Array(n * 8), idx = [];
    for (let i = 0; i < n; i++) { const s = [Math.random(), Math.random(), Math.random()];
      for (let c = 0; c < 4; c++) { seed.set(s, (i * 4 + c) * 3); cor.set([c % 2 ? 1 : -1, c < 2 ? 0 : 1], (i * 4 + c) * 2); }
      const b = i * 4; idx.push(b, b + 1, b + 2, b + 1, b + 3, b + 2); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aSeed', new THREE.BufferAttribute(seed, 3)); g.setAttribute('aCor', new THREE.BufferAttribute(cor, 2)); g.setIndex(idx);
    const m = new THREE.ShaderMaterial({ uniforms: { uTime: G.shared.uTime, uCam: { value: new THREE.Vector2() }, uA: { value: 0 }, uSlant: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: 'attribute vec3 aSeed; attribute vec2 aCor; uniform float uTime, uSlant; uniform vec2 uCam; varying float vT; varying float vX;'
        + ' void main(){ float W = 56.0, Hh = 34.0; float z = mix(' + z0.toFixed(2) + ', ' + z1.toFixed(2) + ', aSeed.z); float sp = 24.0 + aSeed.x * 12.0;'
        + ' float y = mod(aSeed.y * Hh - uTime * sp, Hh) + uCam.y - 13.0; float x = uCam.x + (fract(aSeed.x * 7.13 + aSeed.z * 3.1) - 0.5) * W - (y - uCam.y) * uSlant;'
        + ' vec2 dir = normalize(vec2(-uSlant, -1.0)); vec2 side = vec2(-dir.y, dir.x); vec3 p = vec3(x, y, z) + vec3(side * aCor.x * ' + wid.toFixed(3) + ' - dir * aCor.y * ' + len.toFixed(2) + ', 0.0);'
        + ' vT = aCor.y; vX = aCor.x; gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0); }',
      fragmentShader: 'uniform float uA; varying float vT; varying float vX; void main(){ float a = (1.0 - vT) * (1.0 - abs(vX)) * uA; gl_FragColor = vec4(vec3(0.62, 0.74, 1.0) * 1.3, a * ' + alpha.toFixed(2) + '); }' });
    const mesh = new THREE.Mesh(g, m); mesh.frustumCulled = false; mesh.renderOrder = 6; scene.add(mesh); return m;
  }
    return { build: buildBoss, FACES: BOSS_FACES, makeRain: makeRain };
  }
  return { create: create };
})();
