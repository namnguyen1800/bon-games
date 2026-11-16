// world.js — phần HÌNH 3D của Star Finder (Đợt 1, 2026-11-13). Luật chơi vẫn nằm trong draw_run.html; file này chỉ VẼ.
// Dựng từ bản mẫu đã duyệt (mau_3d_v2.html): trời, núi tuyết, đồi, thông, cỏ, vách đất, nước, thú bông vải nhung.
// Khác bản mẫu: màn chơi không cố định — mỗi món Bon đặt là 1 cụm hình riêng, dời món = dời cụm (không dựng lại),
// chỉ dựng lại đúng món vừa đổi cỡ. Toạ độ: 1 đơn vị = 1 ô (32px); X = px/32; Y = (640 - py)/32 (hướng lên); nhân vật đi trên mặt z = 0.
window.StarWorld = (function () {
  'use strict';
  const TAU = Math.PI * 2;

  function create(opt) {
    const CELL = opt.cell, ROWS = opt.rows, LVB = opt.lvb, WWPX = opt.ww, RC = opt.rc, RV = opt.rv, CHAR3D = opt.char3d, MAXC = opt.maxCols;
    const G = window.SFG.create(opt.canvas, opt.bufW, opt.bufH);
    const scene = G.scene, camera = G.camera, renderer = G.renderer, TEX = G.TEX, BGU = THREE.BufferGeometryUtils;
    const rnd = G.rnd, fbm = G.fbm;
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    const approach = (v, t, d) => v < t ? Math.min(t, v + d) : Math.max(t, v - d);
    const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
    const lin = hex => new THREE.Color(hex);              // hex = sRGB, đổi sang tuyến tính (ColorManagement bật)
    const X = px => px / CELL, Y = py => (LVB - py) / CELL;
    // GY = độ cao mặt đất mặc định (đất nền của game nằm ở hàng 16 → mặt trên cao 2 ô); đồng cỏ phía sau nằm ngang mức này
    const GY = 2, DEPTH = 5, ZF = DEPTH / 2, XA = -44, XB = MAXC + 44, FLAT_FOV = 3, HALF_ROWS = ROWS / 2;
    const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), e4 = new THREE.Euler(), v3a = new THREE.Vector3(), v3b = new THREE.Vector3(), v3c = new THREE.Vector3(), c4 = new THREE.Color(), bb = new THREE.Box3();
    const UPV = new THREE.Vector3(0, 1, 0);
    let ready = false, failed = null; renderer.info.autoReset = false;

    // ---------- khối nhân bản có vùng bao riêng (để card đồ hoạ tự bỏ qua cụm nằm ngoài khung nhìn) ----------
    // Các cụm dùng chung 1 bộ đỉnh; "vỏ" hình học được giữ lại dùng tiếp khi cụm bị gỡ (huỷ vỏ sẽ huỷ luôn bộ đỉnh dùng chung).
    const geoPool = new Map();
    function shareGeo(base) {
      let free = geoPool.get(base); if (!free) geoPool.set(base, free = []);
      let g = free.pop();
      if (!g) { g = new THREE.BufferGeometry(); for (const k in base.attributes) g.setAttribute(k, base.attributes[k]); if (base.index) g.setIndex(base.index); g.userData.base = base; }
      g.boundingSphere = new THREE.Sphere(); return g;
    }
    function inst(base, mat, n, pad, fill, hasColor) {
      const g = shareGeo(base), im = new THREE.InstancedMesh(g, mat, n); bb.makeEmpty();
      for (let i = 0; i < n; i++) { fill(i, m4, c4); im.setMatrixAt(i, m4); if (hasColor) im.setColorAt(i, c4); bb.expandByPoint(v3a.setFromMatrixPosition(m4)); }
      if (n > 0) { bb.getBoundingSphere(g.boundingSphere); g.boundingSphere.radius += pad; }
      im.frustumCulled = true; // three 0.147 tự TẮT cờ này cho khối nhân bản; ở đây vùng bao đã tính theo mọi bản sao nên bật lại được
      return im;
    }
    function disposeNode(root) {
      root.traverse(function (o) {
        if (o.isInstancedMesh) { grassSet.delete(o); geoPool.get(o.geometry.userData.base).push(o.geometry); o.dispose(); }
        else if (o.geometry && !o.geometry.userData.keep) o.geometry.dispose();
        if (o.material && o.material.userData && o.material.userData.own) o.material.dispose();
      });
      if (root.parent) root.parent.remove(root);
    }
    const keep = g => { g.userData.keep = true; return g; };

    // ================= HOẠ TIẾT THÊM =================
    TEX.cloudN = G.pixelTex(256, 256, function (u, v) { // nhiễu lặp được (nước)
      const f = (a, b) => fbm(a, b, 5);
      const n = f(u * 6, v * 6) * (1 - u) * (1 - v) + f(u * 6 - 6, v * 6) * u * (1 - v) + f(u * 6, v * 6 - 6) * (1 - u) * v + f(u * 6 - 6, v * 6 - 6) * u * v;
      const g = clamp((n - 0.2) * 1.6, 0, 1) * 255; return [g, g, g]; }, { repeat: true, srgb: false });
    TEX.rays = G.canvasTex(512, 512, function (g, w, h) { // tia nắng
      g.translate(w / 2, h / 2);
      for (let i = 0; i < 26; i++) { const a = rnd(i * 9.1) * TAU, wd = 0.03 + rnd(i * 3.3) * 0.07, al = 0.08 + rnd(i * 2.2) * 0.22;
        const gr = g.createLinearGradient(0, 0, Math.cos(a) * 256, Math.sin(a) * 256); gr.addColorStop(0, 'rgba(255,250,225,' + al + ')'); gr.addColorStop(1, 'rgba(255,250,225,0)');
        g.fillStyle = gr; g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, 256, a - wd, a + wd); g.closePath(); g.fill(); }
      const r = g.createRadialGradient(0, 0, 0, 0, 0, 256); r.addColorStop(0, 'rgba(255,252,235,0.9)'); r.addColorStop(0.12, 'rgba(255,245,210,0.45)'); r.addColorStop(0.5, 'rgba(255,240,200,0.08)'); r.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = r; g.fillRect(-256, -256, 512, 512); });
    TEX.cloud = G.pixelTex(128, 128, function (u, v) { const d = Math.hypot(u - 0.5, v - 0.5) * 2, n = fbm(u * 4 + 1, v * 4 + 5, 4), a = clamp((1 - d - (1 - n) * 0.32) * 2.6, 0, 1), sh = 0.78 + 0.22 * clamp((0.62 - v) * 2.2, 0, 1) + (n - 0.5) * 0.12; const g = clamp(sh, 0, 1) * 255; return [g, g, Math.min(255, g * 1.04), a * 255]; });
    TEX.star4 = G.pixelTex(64, 64, function (u, v) { const dx = Math.abs(u - 0.5) * 2, dy = Math.abs(v - 0.5) * 2, a = Math.pow(Math.max(0, 1 - Math.sqrt(dx) - Math.sqrt(dy)), 1.2) * 3 + Math.pow(Math.max(0, 1 - Math.hypot(dx, dy) * 2.6), 2); return [255, 255, 255, Math.min(1, a) * 255]; });
    TEX.daisy = G.canvasTex(128, 128, function (g) { g.translate(64, 64);
      for (let i = 0; i < 12; i++) { g.save(); g.rotate(i / 12 * TAU); g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(0, -34, 11, 26, 0, 0, TAU); g.fill(); g.restore(); }
      const c = g.createRadialGradient(0, -4, 2, 0, 0, 18); c.addColorStop(0, '#fff7a8'); c.addColorStop(1, '#f59e0b'); g.fillStyle = c; g.beginPath(); g.arc(0, 0, 16, 0, TAU); g.fill(); });

    // ================= TRỜI =================
    const SUN_DIR = new THREE.Vector3(0.40, 0.17, -0.89).normalize();
    // uLift: ở góc nhìn thẳng (Build/Draw) ống kính hẹp chỉ thấy sát đường chân trời (toàn màu nhạt) → nâng dải màu trời lên
    const skyU = { uLift: { value: 0 }, uTime: G.shared.uTime, uSun: { value: SUN_DIR } };
    const skyMat = new THREE.ShaderMaterial({ uniforms: skyU, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vDir; void main(){ vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform float uLift, uTime; uniform vec3 uSun; varying vec3 vDir;',
        'void main(){',
        '  vec3 d = normalize(vDir); float h = d.y + uLift * (1.0 + d.y * 22.0);',
        '  float t = clamp(h / 0.135, 0.0, 1.0);',
        '  vec3 hor = vec3(0.22, 0.48, 1.0), mid = vec3(0.08, 0.28, 0.90), zen = vec3(0.04, 0.17, 0.72);',
        '  vec3 c = mix(hor, mid, smoothstep(0.0, 0.45, t)); c = mix(c, zen, smoothstep(0.45, 1.0, t));',
        '  if (h < 0.0) c = mix(hor, vec3(0.30, 0.50, 0.62), clamp(-h * 6.0, 0.0, 1.0));',
        '  float s = max(dot(d, uSun), 0.0);',
        '  c += vec3(1.0, 0.86, 0.6) * (pow(s, 6.0) * 0.28 + pow(s, 60.0) * 0.6 + pow(s, 900.0) * 14.0);',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'].join('\n') });
    const sky = new THREE.Mesh(new THREE.SphereGeometry(390, 48, 24), skyMat); sky.renderOrder = -10; sky.frustumCulled = false; scene.add(sky);
    const rays = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.rays, color: G.hdr(0xfff4d8, 1.0), blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, fog: false, opacity: 0.6 }));
    rays.scale.set(130, 130, 1); rays.renderOrder = -5; scene.add(rays);

    // mây bông: mỗi đám = nhiều cụm khói chồng lên, gộp thành 1 hình (1 lượt vẽ / đám)
    const clouds = [];
    (function () {
      const mat = new THREE.MeshBasicMaterial({ map: TEX.cloud, vertexColors: true, transparent: true, depthWrite: false, fog: false });
      for (let i = 0; i < 16; i++) {
        const w = 16 + rnd(i + 1) * 20, n = 6 + Math.floor(rnd(i + 2) * 4), quads = [];
        const add = function (x, y, r, shade, zz) { const g = new THREE.PlaneGeometry(r * 2.6, r * 2.1); g.translate(x, y, zz);
          const cl = new Float32Array(12); for (let k = 0; k < 4; k++) { cl[k * 3] = shade * 0.97; cl[k * 3 + 1] = shade; cl[k * 3 + 2] = shade * 1.06; } g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); quads.push(g); };
        for (let k = 0; k < n; k++) { const t = k / (n - 1), r = (4.6 + rnd(i * 13 + k) * 2.6) * (1 - Math.abs(t - 0.5) * 0.7); add((t - 0.5) * w, 0, r, 1.0, 0); }
        for (let k = 0; k < n - 2; k++) { const t = (k + 0.5) / (n - 2), r = (5.2 + rnd(i * 17 + k) * 3.0) * (1 - Math.abs(t - 0.5) * 1.1); add((t - 0.5) * w * 0.7, 2.4 + r * 0.3, r, 1.3, 0.5); }
        for (let k = 0; k < 3; k++) { const r = 4.2 + rnd(i * 19 + k) * 2.4; add((rnd(i * 23 + k) - 0.5) * w * 0.35, 5.0 + rnd(i * 29 + k) * 2.4, r, 1.5, 1); }
        const m = new THREE.Mesh(BGU.mergeBufferGeometries(quads), mat); quads.forEach(q => q.dispose());
        m.position.set(-90 + (i / 16) * 300 + rnd(i + 70) * 14, 20 + rnd(i + 80) * 15, -235 - rnd(i + 90) * 50);
        m.userData.v = 0.4 + rnd(i + 95) * 0.6; m.frustumCulled = false; m.renderOrder = -4; scene.add(m); clouds.push(m);
      }
    })();

    // ================= NÚI TUYẾT =================
    const fogDay = new THREE.Color(0xb8d4ec);
    const FOG_NEAR = 30, FOG_FAR = 520; scene.fog = new THREE.Fog(fogDay.clone(), FOG_NEAR, FOG_FAR); // sương xanh nhạt phủ đồi xa (như hình đích)
    function heightField(x0, x1, z0, z1, nx, nz, hf, colf, mat) {
      const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0, nx, nz); g.rotateX(-Math.PI / 2);
      const p = g.attributes.position, col = new Float32Array(p.count * 3), c = new THREE.Color();
      for (let i = 0; i < p.count; i++) { const x = p.getX(i) + (x0 + x1) / 2, z = p.getZ(i) + (z0 + z1) / 2, y = hf(x, z); p.setXYZ(i, x, y, z); colf(x, y, z, c); col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(col, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, mat); m.frustumCulled = false; scene.add(m); return m;
    }
    const PEAKS = [];
    for (let i = 0; i < 18; i++) PEAKS.push({ x: -110 + i * 26 + (rnd(i * 4.4) - 0.5) * 16, z: -235 - rnd(i * 2.2) * 50, h: 20 + rnd(i * 6.1) * 16, r: 24 + rnd(i * 1.7) * 16 });
    function mountH(x, z) {
      let h = 0;
      for (const P of PEAKS) { const dx = (x - P.x) / P.r, dz = (z - P.z) / (P.r * 0.9), d = Math.sqrt(dx * dx + dz * dz); if (d < 1.6) { const k = Math.max(0, 1 - d / 1.6); h = Math.max(h, P.h * Math.pow(k, 1.6)); } }
      const ridge = Math.abs(fbm(x * 0.02 + 3, z * 0.02, 4) - 0.5) * 2;
      return h * (0.82 + ridge * 0.3) + fbm(x * 0.06, z * 0.06, 3) * 3 + 3;
    }
    const rockC = lin(0x5878d6), rockD = lin(0x3450a0), snowC = lin(0xffffff), hazeC = lin(0xa8c6f2);
    const mountMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, envMapIntensity: 0.3, fog: false });
    heightField(-220, 440, -330, -170, 250, 64, mountH, function (x, y, z, c) {
      const n = fbm(x * 0.09, z * 0.09, 3), sn = smooth(18 + n * 6, 22 + n * 6, y);
      c.copy(rockD).lerp(rockC, clamp(y / 24 + n * 0.3, 0, 1)).lerp(snowC, sn).lerp(hazeC, 0.10 + smooth(12, 2, y) * 0.32);
    }, mountMat);

    // ================= ĐỒI + ĐỒNG CỎ PHÍA SAU (1 tấm đất liền, mép trước sát lưng màn chơi) =================
    function terrH(x, z) {
      let h = GY - 0.03;
      const k1 = smooth(-9, -34, z), k2 = smooth(-45, -120, z);
      h += k1 * (Math.pow(fbm(x * 0.03 + 10, z * 0.04, 3), 1.4) * 8.5 - 1.9) + k2 * (fbm(x * 0.014 + 4, z * 0.02 + 9, 4) * 6 - 2.2);
      h += smooth(-3, -12, z) * (fbm(x * 0.2, z * 0.2, 3) - 0.5) * 0.5;
      return h;
    }
    const meadowC = lin(0x64a03c), hillC = lin(0x4f9446), hillD = lin(0x34703a), farC = lin(0x78a890);
    const terrain = heightField(-70, XB + 30, -150, -ZF + 0.1, 250, 110, terrH, function (x, y, z, c) {
      const n = fbm(x * 0.07, z * 0.07, 3), k = smooth(-6, -40, z);
      c.copy(meadowC).lerp(hillC, k * 0.9).lerp(hillD, smooth(0.45, 0.6, n) * k).lerp(farC, smooth(-70, -140, z) * 0.6);
      c.multiplyScalar(0.8 + n * 0.4 + (G.vnoise(x * 2.3, z * 2.3) - 0.5) * 0.12);
    }, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, envMapIntensity: 0.4 }));
    terrain.receiveShadow = true;

    // ================= CÂY THÔNG (ảnh cây lông nặn trong Blender) =================
    // 11-14: cây nón dựng bằng code (pineGeo + dải lông + thân trụ) đã gỡ sau khi Nam gật cây Blender — bản cũ còn ở world_v6_backup.js
    const blobMat = new THREE.MeshBasicMaterial({ map: TEX.soft, color: 0x0c2a12, transparent: true, opacity: 0.38, depthWrite: false });
    // 11-14e (Nam: cây "như đồ nhựa / bìa giấy", chọn "tự nặn cây trong Blender"): cây gần = ẢNH của cây thông lông nặn trong Blender
    // (starfinder3d/trees/pines_tex.js, 3 dáng ghép 1 tấm), dựng đứng trong cảnh 3D, quay mặt về máy quay. Máy quay chỉ trượt ngang/nghiêng nhẹ,
    // không bao giờ đi vòng quanh cây → không lộ là tấm phẳng. Ánh sáng + lông đã có sẵn trong ảnh; game chỉ thêm gió lắc + sương theo chiều sâu.
    const pineTex = new THREE.TextureLoader().load(window.SF_PINES || ''); pineTex.encoding = THREE.sRGBEncoding; pineTex.anisotropy = 4;
    // màu ×(1.0, 1.08, 0.94): bù nhẹ bước "màu phim" của game; sương riêng cho cây ảnh = XANH LAM ĐẬM như cây xa trong hình đích (sương trời trắng làm cây bạc như ma)
    const boardHaze = new THREE.Color(0x5a8a86);
    const boardMat = G.hazeify(G.windify(new THREE.MeshBasicMaterial({ map: pineTex, color: new THREE.Color(0.82, 0.86, 0.9), alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide }), 'tree'), 0.0, 0.45, boardHaze);
    function boardGeo(v) { // ô thứ v trong tấm 3 cây. Khung chụp Blender: cao 1.12, rộng 0.7467, gốc cây cách mép dưới 0.04
      const g = new THREE.PlaneGeometry(0.7467, 1.12); g.translate(0, 0.56 - 0.04, 0);
      const uv = g.attributes.uv, ps = g.attributes.position, sw = new Float32Array(uv.count);
      for (let i = 0; i < uv.count; i++) { uv.setX(i, (v + uv.getX(i)) / 3); sw[i] = Math.max(0, ps.getY(i)); }
      g.setAttribute('aSway', new THREE.BufferAttribute(sw, 1)); return g;
    }
    (function () {
      const VARS = [boardGeo(0), boardGeo(1), boardGeo(2)];
      const blobG = new THREE.CircleGeometry(1, 20).rotateX(-Math.PI / 2);
      const BK = 24, buckets = new Map(); let k = 0;
      // 11-14c: rừng mọc thành CỤM, giữa các cụm là khoảng trống nhìn ra đồi (mắt có chỗ nghỉ) — trước đây cây rải đều kín bề ngang thành 1 bức tường.
      // grove(x) = nhiễu chậm theo chiều ngang, dùng CHUNG cho cả 4 hàng → khoảng trống của các hàng trùng nhau. Dưới GROVE_CUT = không có cây (~1/3 bề ngang).
      // Cây ở rìa cụm thấp hơn → cụm có dáng gò; hàng đầu thưa (vài cây "chính"), hàng sau dày hơn nhưng đã phủ sương nên đọc thành 1 mảng.
      const GROVE_CUT = 0.44, grove = function (x) { return G.vnoise(x * 0.052 + 3.7, 1.3) * 0.75 + G.vnoise(x * 0.13 + 9.1, 4.2) * 0.25; };
      for (const row of [{ z0: -4.2, z1: -5.6, step: 7.5, h0: 6.0, h1: 7.8 }, { z0: -7.5, z1: -10, step: 6.5, h0: 5.4, h1: 7.0 }, { z0: -12, z1: -16, step: 5.6, h0: 5.0, h1: 6.6, lo: 1 }, { z0: -18, z1: -26, step: 5.2, h0: 4.6, h1: 6.2, lo: 1 }])
        for (let x = XA + 6 + rnd(k) * 2; x < XB - 6; x += row.step * (0.75 + rnd(k++ * 1.7) * 0.5)) {
          const gv = grove(x); if (gv < GROVE_CUT) continue;
          const z = row.z0 + (row.z1 - row.z0) * rnd(k * 3.3), h = (row.h0 + (row.h1 - row.h0) * rnd(k * 2.1)) * (0.72 + 0.28 * clamp((gv - GROVE_CUT) / 0.1, 0, 1));
          const p = { x: x, z: z, y: terrH(x, z), h: h, v: Math.floor(rnd(k * 4.3) * 3), w: (0.95 + rnd(k * 5.5) * 0.2) * (rnd(k * 9.9) < 0.5 ? -1 : 1), ry: 0 }, b = Math.floor((x - XA) / BK); // w âm = lật ảnh trái-phải cho đỡ giống nhau
          if (!buckets.has(b)) buckets.set(b, []); buckets.get(b).push(p);
        }
      const pm = function (p, m) { q4.setFromAxisAngle(UPV, p.ry); v3b.set(p.h * p.w, p.h, p.h * p.w); v3c.set(p.x, p.y - 0.05, p.z); m.compose(v3c, q4, v3b); };
      buckets.forEach(function (list) {
        for (let v = 0; v < 3; v++) { const sub = list.filter(p => p.v === v); if (!sub.length) continue; scene.add(inst(VARS[v], boardMat, sub.length, 9, function (i, m) { pm(sub[i], m); })); }
        const bl = inst(blobG, blobMat, list.length, 5, function (i, m) { const p = list[i]; m.makeScale(p.h * 0.42, 1, p.h * 0.3); m.setPosition(p.x + p.h * 0.08, p.y + 0.06, p.z + 0.2); }); bl.renderOrder = 1; scene.add(bl);
      });
    })();

    // rừng xa trên đồi: thông nhỏ đơn giản, rất nhiều cây
    const QI = { forest: null, forestN: 0 };
    (function () {
      // 11-14e: rừng xa cũng dùng ảnh cây lông Blender (trước: 2 hình nón nhựa chồng nhau); màu từng cây = độ đậm nhạt nhân lên ảnh, sương xanh lam cố định 30%
      const g = boardGeo(1);
      const mat = G.hazeify(new THREE.MeshBasicMaterial({ map: pineTex, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide }), 0.3, 0.0, boardHaze);
      const spots = [], span = XB + 30 + 60;
      for (let i = 0; i < 14000 && spots.length < 3600; i++) {
        const x = -60 + rnd(i * 1.1) * span, z = -30 - Math.pow(rnd(i * 2.3), 0.8) * 115;
        if (fbm(x * 0.06 + 7, z * 0.07, 3) < 0.5) continue;
        spots.push([x, z]);
      }
      const im = new THREE.InstancedMesh(g, mat, spots.length), c = new THREE.Color();
      spots.forEach(function (s, i) { const h = (2.6 + rnd(i * 3.9) * 1.8) * (1 + smooth(-30, -120, s[1]) * 0.5); m4.makeScale(h * 0.9, h, h * 0.9); m4.setPosition(s[0], terrH(s[0], s[1]) - 0.2, s[1]); im.setMatrixAt(i, m4);
        // 11-14c: màu rừng xa đổi theo MẢNG (nhiễu theo vị trí) thay vì ngẫu nhiên từng cây, nhạt dần sớm hơn → cả dải đọc thành 1 mảng rừng yên, không thành nghìn đỉnh nhọn
        const kf = 0.82 + fbm(s[0] * 0.05 + 2, s[1] * 0.05, 2) * 0.3; c.setRGB(kf * 0.95, kf * 1.02, kf * 0.98); im.setColorAt(i, c); });
      im.frustumCulled = false; scene.add(im); QI.forest = im; QI.forestN = spots.length;
    })();

    // ================= CHẤT LIỆU CỦA MÀN CHƠI =================
    const soilMat = new THREE.MeshStandardMaterial({ map: TEX.soil, bumpMap: TEX.soilBump, bumpScale: 0.09, roughness: 0.96, color: 0xffffff, vertexColors: true, envMapIntensity: 0.35 });
    const innerMat = new THREE.MeshStandardMaterial({ map: TEX.soil, color: 0x9a8a80, roughness: 1 });
    const groundMat = new THREE.MeshStandardMaterial({ map: TEX.ground, color: 0xeeeeb8, roughness: 0.9 });
    const sandMat = new THREE.MeshStandardMaterial({ map: TEX.sand, roughness: 1 });
    const rockMat = new THREE.MeshStandardMaterial({ map: TEX.rock, roughness: 0.82, color: 0xc9cdd6 });
    const rootMat = new THREE.MeshStandardMaterial({ color: 0x5b3a22, roughness: 1 });
    const steelMat = new THREE.MeshStandardMaterial({ color: 0xe8edf3, roughness: 0.18, metalness: 1 }), plateMat = new THREE.MeshStandardMaterial({ color: 0x3a4150, roughness: 0.45, metalness: 0.8 });
    const gold = new THREE.MeshStandardMaterial({ color: 0xffc53d, roughness: 0.22, metalness: 1, emissive: 0x6b3a00, emissiveIntensity: 0.25 });
    const grassMat = G.windify(new THREE.MeshStandardMaterial({ vertexColors: true, side: THREE.DoubleSide, roughness: 0.75, envMapIntensity: 0.5 }), 'grass');
    const flowerMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45, envMapIntensity: 0.8 });
    const daisyMat = new THREE.MeshStandardMaterial({ map: TEX.daisy, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.7 });
    const strokeMat = new THREE.MeshStandardMaterial({ color: 0x161c28, roughness: 0.5, envMapIntensity: 0.7 });
    const featherMat = new THREE.MeshPhysicalMaterial({ color: 0xd9dde6, roughness: 0.6, sheen: 1, sheenColor: new THREE.Color(0xfff6dd), sheenRoughness: 0.4, emissive: 0xfff3d0, emissiveIntensity: 0.05 });
    const grassSet = new Set(); let grassK = 1;
    function addGrass(im) { im.userData.fullN = im.count; im.count = Math.round(im.userData.fullN * grassK); im.receiveShadow = true; grassSet.add(im); return im; }

    // hình dùng chung
    const bladeGeo = (function () {
      // 11-14: gốc→ngọn chênh ít hơn (ngọn vàng chanh 0xc4d84c → xanh nắng 0xa2c24a), bản lá rộng hơn → thảm cỏ liền, mịn như hình đích
      const pos = [], col = [], nor = [], sway = [], idx = [], segs = 3, base = lin(0x2f581a), midc = lin(0x5a8c28), tipc = lin(0x8cb03c);
      for (let s = 0; s <= segs; s++) { const t = s / segs, w = 0.05 * Math.pow(1 - t, 0.9), z = 0.18 * t * t;
        const c = t < 0.5 ? base.clone().lerp(midc, t * 2) : midc.clone().lerp(tipc, (t - 0.5) * 2);
        if (s < segs) { pos.push(-w, t, z, w, t, z); col.push(c.r, c.g, c.b, c.r, c.g, c.b); nor.push(0, 0.92, 0.38, 0, 0.92, 0.38); sway.push(t, t); }
        else { pos.push(0, t, z); col.push(c.r, c.g, c.b); nor.push(0, 0.92, 0.38); sway.push(t); } }
      for (let s = 0; s < segs - 1; s++) { const a = s * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
      const L = (segs - 1) * 2; idx.push(L, L + 1, L + 2);
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3)); g.setAttribute('aSway', new THREE.Float32BufferAttribute(sway, 1)); g.setIndex(idx); return g;
    })();
    function withColor(g, r, gg, b) { const n = g.attributes.position.count, a = new Float32Array(n * 3); for (let i = 0; i < n; i++) { a[i * 3] = r; a[i * 3 + 1] = gg; a[i * 3 + 2] = b; } g.setAttribute('color', new THREE.BufferAttribute(a, 3)); return g; }
    // hoa: cuống + búp tròn (1 hình, cao chuẩn 0.37 ô; màu búp = màu của từng cây)
    const flowerGeo = BGU.mergeBufferGeometries([withColor(new THREE.CylinderGeometry(0.012, 0.016, 0.37, 5).translate(0, 0.185, 0), 0.10, 0.26, 0.06), withColor(new THREE.SphereGeometry(0.075, 10, 7).translate(0, 0.37, 0), 1, 1, 1)]);
    const daisyGeo = new THREE.PlaneGeometry(0.26, 0.26).rotateX(-Math.PI / 2);
    const rockGeo = (function () {
      let g = new THREE.IcosahedronGeometry(1, 2); g.deleteAttribute('normal'); g = BGU.mergeVertices(g);
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) { v3a.fromBufferAttribute(p, i); const k = 0.78 + fbm(v3a.x * 2 + 5, v3a.y * 2 + v3a.z, 3) * 0.45; v3a.multiplyScalar(k); v3a.y *= 0.62; p.setXYZ(i, v3a.x, v3a.y, v3a.z); }
      g.computeVertexNormals(); return g;
    })();
    const FLOWER_COLS = [0xff8a3d, 0xff5fa2, 0xffffff, 0xffd43b, 0xc084fc].map(lin);

    // 1 lá cỏ ở (x, y, z): hgt = cao, kiểu rủ mép (fr = ±1) hay mọc thẳng (fr = 0)
    function bladeAt(m, c, x, y, z, hgt, j, fr) {
      if (fr) e4.set(fr * (1.1 + rnd(j * 4.7) * 0.9), rnd(j * 9.1) * TAU * 0.3, (rnd(j * 2.2 + 1) - 0.5) * 0.6, 'YXZ');
      else e4.set((rnd(j * 3.1) - 0.5) * 0.35, rnd(j * 6.1) * TAU, (rnd(j * 1.3) - 0.5) * 0.3 + (rnd(j * 8.3) - 0.5) * 0.2, 'YXZ');
      q4.setFromEuler(e4); v3c.set(x, y - 0.02, z); v3b.set(1 + rnd(j * 5.5) * 0.6, hgt, 1); m.compose(v3c, q4, v3b);
      // màu theo MẢNG LỚN trên mặt đất (nhiễu theo toạ độ), không ngẫu nhiên từng lá — cách cỏ của Ghost of Tsushima / Zelda; bỏ 6% lá vàng chói (11-14)
      const k = fbm(x * 0.32 + 7.3, z * 0.45 + 1.9, 3), e = (rnd(j * 7.7) - 0.5) * 0.06; const kk = Math.max(0, Math.min(1, (k - 0.3) * 2.2)); c.setRGB((0.66 + kk * 0.5 + e) * 1.22, (0.74 + kk * 0.38 + e) * 1.06, (0.72 + kk * 0.16 + e) * 1.12); // ×: bù đèn "trời mát" (11-14d) để cỏ về đúng màu Nam đã gật
    }
    // cỏ đồng phía sau màn chơi (đứng yên, chia cụm 16 ô)
    (function () {
      for (let x0 = -12; x0 < MAXC + 12; x0 += 16) {
        const n = 16 * 90;
        scene.add(addGrass(inst(bladeGeo, grassMat, n, 1.2, function (i, m, c) { const j = x0 * 977 + i, fx = x0 + rnd(j * 1.71) * 16, fz = -2.55 - Math.pow(rnd(j * 2.93), 1.5) * 10; bladeAt(m, c, fx, terrH(fx, fz), fz, 0.15 + rnd(j * 4.9) * 0.18 + (rnd(j * 6.3) < 0.08 ? 0.16 : 0), j, 0); }, true)));
      }
    })();
    // vách đất phía sau màn chơi (thấy được ở chỗ hố / hồ: không có đất che)
    function faceGeo(width, yTop, yBot, rough, seed, shade) { // mặt vách đất gồ ghề, nằm trong mặt phẳng XY, nhô ra theo +Z
      const h = yTop - yBot, g = new THREE.PlaneGeometry(width, h, Math.max(1, Math.min(360, Math.ceil(width * 3))), Math.max(1, Math.ceil(h * 3)));
      const p = g.attributes.position, uv = g.attributes.uv, cl = new Float32Array(p.count * 3), mid = (yTop + yBot) / 2;
      for (let i = 0; i < p.count; i++) {
        const lx = p.getX(i) + width / 2, ly = p.getY(i) + mid, edge = Math.min(1, lx * 2, (width - lx) * 2, (yTop - ly) * 3);
        const d = (fbm(lx * 0.9 + seed * 7.31, ly * 0.9 + seed * 3.17, 3) - 0.45) * rough * edge;
        p.setXYZ(i, lx - width / 2, ly, d); uv.setXY(i, (lx + seed * 5.7) / 3.2, ly / 3.2);
        const dp = clamp((yTop - ly) / 6, 0, 1), k = (1.05 - dp * 0.5) * shade; cl[i * 3] = k; cl[i * 3 + 1] = k * (1 - dp * 0.08); cl[i * 3 + 2] = k * (1 - dp * 0.1);
      }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); return g;
    }
    (function () {
      const g = faceGeo(XB - XA, GY, -9, 0.3, 91.7, 0.5); g.translate((XA + XB) / 2, 0, -ZF - 0.02); g.computeVertexNormals();
      const m = new THREE.Mesh(g, soilMat); m.receiveShadow = true; m.frustumCulled = false; scene.add(m);
      const floor = new THREE.Mesh(new THREE.PlaneGeometry(XB - XA, DEPTH + 2).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x1a120c })); floor.position.set((XA + XB) / 2, -8.9, 0); floor.frustumCulled = false; scene.add(floor);
    })();

    // ================= CÁC MÓN TRONG MÀN (mỗi món 1 cụm; gốc cụm = góc TRÊN-TRÁI của món, y đi xuống là âm) =================
    function buildBlock(w, h, floating, seed) {
      const grp = new THREE.Group(), d = floating ? 3 : DEPTH, zf = d / 2, bot = floating ? -(h + 0.25) : -(h + 9), sideBot = floating ? bot : -(h + 3);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(w + 0.1, d + 0.1).rotateX(-Math.PI / 2), groundMat); top.position.set(w / 2, 0, 0); top.receiveShadow = true;
      { const a = top.geometry.attributes.uv.array; for (let i = 0; i < a.length; i++) a[i] = a[i] * (i % 2 ? d : w) / 4 + (i % 2 ? 0 : seed * 0.37); }
      grp.add(top);
      const faces = [];
      let f = faceGeo(w, 0, bot, 0.32, seed, 1); f.translate(w / 2, 0, zf); faces.push(f);
      f = faceGeo(d, 0, sideBot, 0.25, seed + 1.7, 0.9); f.rotateY(-Math.PI / 2); faces.push(f);
      f = faceGeo(d, 0, sideBot, 0.25, seed + 2.9, 0.9); f.rotateY(Math.PI / 2); f.translate(w, 0, 0); faces.push(f);
      if (floating) { f = faceGeo(w, 0, bot, 0.32, seed + 4.1, 0.8); f.rotateY(Math.PI); f.translate(w / 2, 0, -zf); faces.push(f); }
      const wg = BGU.mergeBufferGeometries(faces); faces.forEach(g => g.dispose()); wg.computeVertexNormals();
      const wall = new THREE.Mesh(wg, soilMat); wall.receiveShadow = true; grp.add(wall);
      if (floating) { // lõi đất bên trong: đổ bóng xuống đất + làm mặt đáy
        const inner = new THREE.Mesh(new THREE.BoxGeometry(Math.max(0.2, w - 0.34), h + 0.1, d - 0.34), innerMat); inner.position.set(w / 2, -(h + 0.1) / 2 - 0.13, 0); inner.castShadow = true; grp.add(inner);
      }
      // cỏ + hoa + đá + rễ: chia cụm 16 ô theo chiều ngang để cụm ngoài khung nhìn không tốn máy
      const dens = floating ? 130 : 100;
      for (let x0 = 0; x0 < w; x0 += 16) {
        const bw = Math.min(16, w - x0), n = Math.floor(bw * d * dens), nf = Math.floor(bw * 40) * (floating ? 2 : 1), tot = n + nf, stride = Math.max(2, Math.floor(tot / Math.max(1, nf))), s0 = seed * 13.7 + x0 * 31.3;
        grp.add(addGrass(inst(bladeGeo, grassMat, tot, 1.2, function (i, m, c) {
          const j = s0 + i;
          if (i % stride === 0) { // cỏ rủ xuống mép vách (mép trước; khối lơ lửng có cả mép sau)
            const back = floating && rnd(j * 1.37) < 0.5, fx = x0 + rnd(j * 3.7) * bw;
            bladeAt(m, c, fx, -0.02 - rnd(j * 1.9) * 0.05, back ? -zf + 0.04 - rnd(j * 5.1) * 0.08 : zf - 0.04 + rnd(j * 5.1) * 0.08, 0.2 + rnd(j * 2.2) * 0.26, j, back ? -1 : 1);
          } else { // cỏ mọc trên mặt: thấp ở làn đi giữa, cao ở hai bên
            const fx = x0 + rnd(j * 1.37) * bw, fz = -zf + rnd(j * 2.71) * d, lane = Math.abs(fz) < 1.0;
            bladeAt(m, c, fx, 0, fz, lane ? 0.10 + rnd(j * 4.4) * 0.10 : 0.14 + rnd(j * 4.4) * 0.16 + (rnd(j * 6.3) < 0.08 ? 0.14 : 0), j, 0); // thảm ngắn, lác đác bụi cao (11-14)
          }
        }, true)));
        const side = function (j, pad) { const back = rnd(j * 3.1) < 0.6; return back ? -zf + 0.2 + rnd(j * 2.9) * Math.max(0.05, zf - pad) : 1.1 + rnd(j * 5.3) * Math.max(0.05, zf - pad); };
        const nfl = Math.floor(bw * 2.6);
        if (nfl > 0) { const fl = inst(flowerGeo, flowerMat, nfl, 1, function (i, m, c) { const j = s0 + i * 1.91 + 7, s = (0.22 + rnd(j * 3.3) * 0.3) / 0.37; m.makeScale(s, s, s); m.setPosition(x0 + 0.2 + rnd(j * 5.9) * Math.max(0.05, bw - 0.4), 0, side(j, 1.25)); c.copy(FLOWER_COLS[Math.floor(rnd(j * 6.7) * 5)]); }, true); fl.castShadow = true; grp.add(fl); }
        const nd = bw >= 6 ? Math.floor(bw * 0.9) : 0;
        if (nd > 0) grp.add(inst(daisyGeo, daisyMat, nd, 1, function (i, m) { const j = s0 + i * 2.37 + 19, hh = 0.2 + rnd(j * 1.3) * 0.25; e4.set(-0.5 + rnd(j) * 0.3, rnd(j * 3.9) * TAU, 0, 'YXZ'); q4.setFromEuler(e4); v3c.set(x0 + 0.2 + rnd(j * 5.9) * (bw - 0.4), hh, side(j, 1.25)); v3b.set(1, 1, 1); m.compose(v3c, q4, v3b); }, false));
        const nr = Math.floor(bw * 1.1), nrw = floating ? 0 : Math.floor(bw * 0.55);
        if (nr + nrw > 0) { const rk = inst(rockGeo, rockMat, nr + nrw, 1, function (i, m) {
            const j = s0 + i * 3.11 + 41, s = i < nr ? 0.12 + rnd(j * 4.1) * 0.2 : 0.2 + rnd(j * 7.3) * 0.35, inWall = i >= nr;
            e4.set(rnd(j * 3.3) * 0.5, rnd(j * 5.1) * TAU, 0, 'XYZ'); q4.setFromEuler(e4);
            if (inWall) v3c.set(x0 + 0.4 + rnd(j * 2.3) * Math.max(0.05, bw - 0.8), -0.7 - rnd(j * 5.5) * 6, zf - 0.05); else v3c.set(x0 + 0.3 + rnd(j * 7.7) * Math.max(0.05, bw - 0.6), s * 0.12, side(j, 1.4));
            v3b.set(s * 1.15, inWall ? s * 1.25 : s, s * (inWall ? 0.55 : 1)); m.compose(v3c, q4, v3b); }, false); rk.castShadow = true; rk.receiveShadow = true; grp.add(rk); }
        const nrt = Math.floor(bw * (floating ? 0.5 : 0.28)), rg = [];
        for (let i = 0; i < nrt; i++) { const j = s0 + i * 4.9 + 3, len = floating ? Math.min(0.9, h + 0.1) : 1.2 + rnd(j * 8.8) * 1.4, pts = []; let x = x0 + 0.4 + rnd(j) * Math.max(0.05, bw - 0.8), y = -0.15;
          for (let k = 0; k < 7; k++) { pts.push(new THREE.Vector3(x, y, zf + 0.05 + Math.sin(k + i) * 0.03)); x += (rnd(j * 7 + k) - 0.5) * 0.5; y -= len / 6; }
          rg.push(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, 0.035, 5)); }
        if (rg.length) { const m = new THREE.Mesh(BGU.mergeBufferGeometries(rg), rootMat); rg.forEach(g => g.dispose()); m.receiveShadow = true; grp.add(m); }
      }
      return { group: grp };
    }
    function buildSpike(w) {
      const grp = new THREE.Group(), cones = [], plates = [];
      plates.push(new THREE.BoxGeometry(w + 0.1, 0.16, 2.0).translate(w / 2, -0.92, 0));
      for (let i = 0; i < w; i++) for (const z of [-0.45, 0.45]) {
        cones.push(new THREE.ConeGeometry(0.33, 0.82, 20).translate(i + 0.5, -0.43, z));
        plates.push(new THREE.CylinderGeometry(0.36, 0.38, 0.1, 20).translate(i + 0.5, -0.81, z));
      }
      const a = new THREE.Mesh(BGU.mergeBufferGeometries(cones), steelMat), b = new THREE.Mesh(BGU.mergeBufferGeometries(plates), plateMat);
      cones.concat(plates).forEach(g => g.dispose()); a.castShadow = true; b.castShadow = b.receiveShadow = true; grp.add(a); grp.add(b);
      return { group: grp };
    }
    // lửa: 3 lớp ngọn lồng nhau (đỏ / cam / vàng), nhảy múa bằng card đồ hoạ
    const flameMat = new THREE.ShaderMaterial({ uniforms: { uTime: G.shared.uTime }, transparent: true, depthWrite: false, side: THREE.DoubleSide,
      vertexShader: 'attribute float aPh, aK; attribute vec3 aCol; uniform float uTime; varying vec3 vC; varying float vK;'
        + ' void main(){ vec3 p = position; float f = 1.0 + 0.14 * sin(uTime * 9.0 + aPh) + 0.07 * sin(uTime * 20.7 + aPh * 2.3);'
        + ' p.y = -0.9 + (p.y + 0.9) * f; p.x += sin(uTime * 6.3 + aPh * 0.7) * 0.12 * aK * aK; p.z += cos(uTime * 5.1 + aPh) * 0.06 * aK * aK;'
        + ' vC = aCol; vK = aK; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }',
      fragmentShader: 'varying vec3 vC; varying float vK; void main(){ gl_FragColor = vec4(vC * (1.0 - vK * 0.2), 0.96 * (1.0 - vK * vK * 0.3)); }' });
    const logMat = new THREE.MeshStandardMaterial({ color: 0x3b1d0e, roughness: 0.9, emissive: 0xff4a10, emissiveIntensity: 0.9 });
    function buildFire(w) {
      const grp = new THREE.Group(), geos = [];
      const LAY = [[0.41, 0.86, [1.7, 0.14, 0.06]], [0.28, 0.60, [1.9, 0.60, 0.06]], [0.16, 0.36, [2.2, 1.8, 0.55]]];
      for (let i = 0; i < w; i++) for (let L = 0; L < 3; L++) {
        const hw = LAY[L][0], hh = LAY[L][1], col = LAY[L][2], pts = [[0.02, 0], [0.75, 0.08], [1, 0.3], [0.72, 0.55], [0.35, 0.8], [0.0, 1]].map(p => new THREE.Vector2(p[0] * hw, p[1] * hh));
        const g = new THREE.LatheGeometry(pts, 12), n = g.attributes.position.count, ph = new Float32Array(n), kk = new Float32Array(n), cc = new Float32Array(n * 3);
        for (let q = 0; q < n; q++) { ph[q] = i * 2.3 + L * 0.4; kk[q] = g.attributes.position.getY(q) / hh; cc[q * 3] = col[0]; cc[q * 3 + 1] = col[1]; cc[q * 3 + 2] = col[2]; }
        g.setAttribute('aPh', new THREE.BufferAttribute(ph, 1)); g.setAttribute('aK', new THREE.BufferAttribute(kk, 1)); g.setAttribute('aCol', new THREE.BufferAttribute(cc, 3));
        g.scale(1, 1, 0.8); g.translate(i + 0.5, -0.9, L * 0.12); geos.push(g);
      }
      const fl = new THREE.Mesh(BGU.mergeBufferGeometries(geos), flameMat); geos.forEach(g => g.dispose()); fl.renderOrder = 4; grp.add(fl);
      for (const z of [-0.28, 0.28]) { const lg = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, w - 0.12, 8).rotateZ(Math.PI / 2), logMat); lg.position.set(w / 2, -0.9, z); lg.castShadow = true; grp.add(lg); }
      const gl = G.glow(G.hdr(0xff7a1a, 1.0), 1, 0.5); gl.scale.set(w + 2.2, 2.6, 1); gl.position.set(w / 2, -0.45, 0.6); grp.add(gl);
      return { group: grp, w: w, fire: true };
    }
    // nước: mặt nước lấp lánh + mặt cắt phía trước + đáy cát
    const waterU = { uTime: G.shared.uTime, uN: { value: TEX.cloudN }, uC: { value: TEX.caustic }, uSun: { value: SUN_DIR }, uCam: { value: new THREE.Vector3() } };
    const WVERT = 'varying vec3 vW; varying vec2 vUv; void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }';
    const waterMat = new THREE.ShaderMaterial({ uniforms: waterU, transparent: true, depthWrite: false, vertexShader: WVERT, fragmentShader: [
      'uniform float uTime; uniform sampler2D uN, uC; uniform vec3 uSun, uCam; varying vec3 vW; varying vec2 vUv;',
      'float H(vec2 p){ return texture2D(uN, p * 0.07 + vec2(uTime * 0.018, uTime * 0.011)).r + texture2D(uN, p * 0.16 - vec2(uTime * 0.021, -uTime * 0.016)).r * 0.6; }',
      'void main(){',
      '  vec2 p = vW.xz; float e = 0.12;',
      '  vec3 n = normalize(vec3((H(p - vec2(e, 0.0)) - H(p + vec2(e, 0.0))) * 1.1, 1.0, (H(p - vec2(0.0, e)) - H(p + vec2(0.0, e))) * 1.1));',
      '  vec3 v = normalize(uCam - vW); float fr = 0.03 + 0.97 * pow(1.0 - max(dot(n, v), 0.0), 4.0);',
      '  vec3 sh = vec3(0.01, 0.42, 0.50), dp = vec3(0.0, 0.13, 0.30);',
      '  float shore = clamp(1.0 - abs(vUv.x - 0.5) * 2.0, 0.0, 1.0);',
      '  vec3 body = mix(sh, dp, shore * 0.8);',
      '  float r1 = 1.0 - abs(texture2D(uN, p * 0.21 + n.xz * 0.05 + vec2(uTime * 0.015, 0.0)).r - 0.5) * 2.0, r2 = 1.0 - abs(texture2D(uN, p * 0.33 - vec2(0.0, uTime * 0.02)).r - 0.5) * 2.0;',
      '  float cs = pow(r1, 18.0) + pow(r2, 22.0) * 0.8;',
      '  body += vec3(0.35, 1.0, 0.95) * cs * 0.26;',
      '  vec3 c = mix(body, vec3(0.22, 0.50, 0.90), fr * 0.28);',
      '  vec3 r = reflect(-uSun, n); float sp = pow(max(dot(r, v), 0.0), 220.0);',
      '  float r3 = 1.0 - abs(texture2D(uN, p * 0.9 + vec2(uTime * 0.05, -uTime * 0.03)).r - 0.5) * 2.0; float glint = pow(r1 * r3, 22.0) * 2.4 + pow(r2 * r3, 26.0) * 1.8;',
      '  c += vec3(1.0, 0.97, 0.85) * (sp * 6.0 + glint * 4.5);',
      '  gl_FragColor = vec4(c, 0.86);',
      '}'].join('\n') });
    const waterFrontMat = new THREE.ShaderMaterial({ uniforms: waterU, transparent: true, depthWrite: false, side: THREE.DoubleSide, vertexShader: WVERT,
      fragmentShader: 'uniform float uTime; uniform sampler2D uC; varying vec3 vW; varying vec2 vUv; void main(){ float d = clamp(1.0 - vUv.y, 0.0, 1.0); vec3 c = mix(vec3(0.03, 0.42, 0.46), vec3(0.005, 0.10, 0.18), d);'
        + ' float cs = pow(texture2D(uC, vec2((vW.x + vW.z) * 0.25 + uTime * 0.02, vW.y * 0.35 - uTime * 0.03)).r, 2.5); c += vec3(0.3, 0.8, 0.8) * cs * 0.45 * (1.0 - d * 0.6); c += vec3(0.6, 0.9, 1.0) * smoothstep(0.06, 0.0, d) * 0.6;'
        + ' gl_FragColor = vec4(c, 0.78); }' });
    function buildWater(w, h, deep, seed) {
      const grp = new THREE.Group(), top = -0.14, bot = -h;
      if (deep) { const g = faceGeo(w, bot, bot - 9, 0.32, seed, 0.8); g.translate(w / 2, 0, ZF); g.computeVertexNormals(); const m = new THREE.Mesh(g, soilMat); m.receiveShadow = true; grp.add(m); }
      const s = new THREE.Mesh(new THREE.PlaneGeometry(w, DEPTH).rotateX(-Math.PI / 2), waterMat); s.position.set(w / 2, top, 0); s.renderOrder = 3; grp.add(s);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(w, top - bot), waterFrontMat); f.position.set(w / 2, (top + bot) / 2, ZF); f.renderOrder = 4; grp.add(f);
      for (const sx of [0, 1]) { const sd = new THREE.Mesh(new THREE.PlaneGeometry(DEPTH, top - bot).rotateY(Math.PI / 2), waterFrontMat); sd.position.set(sx ? w - 0.01 : 0.01, (top + bot) / 2, 0); sd.renderOrder = 3; grp.add(sd); }
      const fl = new THREE.Mesh(new THREE.BoxGeometry(w, 0.2, DEPTH), sandMat); fl.position.set(w / 2, bot - 0.1, 0); fl.receiveShadow = true; grp.add(fl);
      return { group: grp };
    }
    const springRed = new THREE.MeshPhysicalMaterial({ color: 0xef4444, roughness: 0.35, clearcoat: 0.7, clearcoatRoughness: 0.25 });
    const coilGeo = keep((function () { const pts = []; for (let i = 0; i <= 64; i++) { const t = i / 64, a = t * TAU * 4; pts.push(new THREE.Vector3(Math.cos(a) * 0.26, t, Math.sin(a) * 0.26)); } return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 96, 0.045, 6); })());
    const springBaseGeo = keep(new THREE.BoxGeometry(0.84, 0.14, 1.0)), springPlateGeo = keep(new THREE.CylinderGeometry(0.44, 0.44, 0.14, 24));
    function buildSpring() {
      const grp = new THREE.Group();
      const base = new THREE.Mesh(springBaseGeo, plateMat); base.position.set(0.5, -0.93, 0); base.castShadow = base.receiveShadow = true; grp.add(base);
      const coil = new THREE.Mesh(coilGeo, steelMat); coil.position.set(0.5, -0.86, 0); coil.castShadow = true; grp.add(coil);
      const plate = new THREE.Mesh(springPlateGeo, springRed); plate.castShadow = true; grp.add(plate);
      const node = { group: grp, update: function (st) { // comp 0 = bình thường · 1 = bị nén hết cỡ (lúc baby vừa chạm)
        const a = st.anim.get(node.obj) || 0, comp = a > 0 ? Math.sin(a / 0.35 * Math.PI) : 0, top = -0.375 - comp * 0.28;
        plate.position.set(0.5, top - 0.07, 0); coil.scale.y = Math.max(0.05, top - 0.14 + 0.86);
      } };
      return node;
    }
    const poleGeo = keep(new THREE.CylinderGeometry(0.05, 0.06, 2.3, 10)), poleMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.3, metalness: 0.7 }), flagMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, side: THREE.DoubleSide, roughness: 0.7 });
    function buildStart() {
      const grp = new THREE.Group();
      const pole = new THREE.Mesh(poleGeo, poleMat); pole.position.set(0.3, 0.15, -0.6); pole.castShadow = true; grp.add(pole);
      const knob = new THREE.Mesh(new THREE.SphereGeometry(0.08, 12, 8), gold); knob.position.set(0.3, 1.33, -0.6); grp.add(knob);
      const f = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.46, 8, 2), flagMat); f.position.set(0.72, 1.02, -0.6); f.castShadow = true; grp.add(f);
      return { group: grp, update: function (st) { const p = f.geometry.attributes.position; for (let i = 0; i < p.count; i++) { const fx = p.getX(i) + 0.4; p.setZ(i, Math.sin(st.clock * 6 - fx * 6) * 0.06 * fx); } p.needsUpdate = true; } };
    }
    function starMesh(R, mat) {
      const s = new THREE.Shape(); for (let i = 0; i < 10; i++) { const r = i % 2 ? R * 0.48 : R, a = Math.PI / 2 + i * Math.PI / 5; if (i === 0) s.moveTo(Math.cos(a) * r, Math.sin(a) * r); else s.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
      const g = new THREE.ExtrudeGeometry(s, { depth: R * 0.28, bevelEnabled: true, bevelSize: R * 0.12, bevelThickness: R * 0.14, bevelSegments: 3 }); g.translate(0, 0, -R * 0.14);
      const m = new THREE.Mesh(g, mat || gold); m.castShadow = true; return m;
    }
    const starGeo = keep(starMesh(0.42).geometry);
    function buildStar() {
      const grp = new THREE.Group(), m = new THREE.Mesh(starGeo, gold); m.castShadow = true; grp.add(m);
      const gl = G.glow(G.hdr(0xffe680, 1.6), 3.0, 0.8); grp.add(gl);
      const node = { group: grp }; node.update = function (st) {
        grp.visible = !(st.mode === 'play' && st.got.has(node.idx));
        const y = -0.5 + Math.sin(st.clock * 3 + node.gx * 1.6) * 0.1; m.position.set(0.5, y, 0); m.rotation.y = Math.sin(st.clock * 1.6) * 0.9; m.rotation.z = Math.sin(st.clock * 2) * 0.1; gl.position.set(0.5, y, -0.2); gl.scale.setScalar(3.0 + Math.sin(st.clock * 5) * 0.4);
      };
      return node;
    }
    const wingGeo = keep((function () {
      const s = new THREE.Shape(); s.moveTo(0, 0); s.bezierCurveTo(-0.25, 0.55, -0.7, 0.78, -1, 0.62); s.quadraticCurveTo(-0.98, 0.26, -0.74, 0.24);
      s.quadraticCurveTo(-0.72, 0.02, -0.48, 0.05); s.quadraticCurveTo(-0.42, -0.16, -0.18, -0.1); s.quadraticCurveTo(-0.06, -0.08, 0, 0);
      return new THREE.ExtrudeGeometry(s, { depth: 0.06, bevelEnabled: true, bevelSize: 0.04, bevelThickness: 0.04, bevelSegments: 3, curveSegments: 18 });
    })());
    function wingPair(size, mat) { const g = new THREE.Group(), L = new THREE.Mesh(wingGeo, mat || featherMat), R = new THREE.Mesh(wingGeo, mat || featherMat); L.castShadow = R.castShadow = true; L.scale.setScalar(size); R.scale.set(-size, size, size); g.add(L); g.add(R); g.userData.L = L; g.userData.R = R; return g; }
    function buildWing() {
      const grp = new THREE.Group(), wp = wingPair(0.62); grp.add(wp); const gl = G.glow(G.hdr(0xfff0c0, 1.0), 2.6, 0.35); grp.add(gl);
      const node = { group: grp }; node.update = function (st) {
        grp.visible = !(st.mode === 'play' && st.gotWing.has(node.idx));
        const y = -0.62 + Math.sin(st.clock * 3 + node.gx * 1.6) * 0.1, wf = Math.sin(st.clock * 6) * 0.2; wp.position.set(0.5, y, 0); gl.position.set(0.5, y + 0.2, -0.2);
        wp.userData.L.rotation.z = -0.42 - wf; wp.userData.R.rotation.z = 0.42 + wf;
      };
      return node;
    }
    const BUILDERS = { spring: buildSpring, start: buildStart, star: buildStar, wing: buildWing };
    function keyOf(o) {
      if (o.t === 'block') return 'block|' + o.w + '|' + o.h + '|' + ((ROWS - o.y - o.h) > 0.5 ? 1 : 0);
      if (o.t === 'spike' || o.t === 'fire') { const r = (o.rot | 0) & 3; return o.t + '|' + (r & 1 ? o.h : o.w) + '|' + r; }
      if (o.t === 'water') return 'water|' + o.w + '|' + o.h + '|' + ((ROWS - o.y - o.h) > 0.5 ? 0 : 1);
      if (BUILDERS[o.t]) return o.t;
      return null; // enemy: là nhân vật, dựng riêng
    }
    function makeNode(o, key) {
      const seed = o.x * 7.13 + o.y * 3.71 + o.w * 1.3;
      let n;
      if (o.t === 'block') n = buildBlock(o.w, o.h, (ROWS - o.y - o.h) > 0.5, seed);
      else if (o.t === 'spike' || o.t === 'fire') {
        // Đợt 2: gai/lửa có hướng (o.rot 0 lên · 1 phải · 2 xuống · 3 trái) → dựng dải mũi-lên dài len ô như cũ rồi xoay quanh tâm hộp
        const rot = (o.rot | 0) & 3, len = rot & 1 ? o.h : o.w;
        n = o.t === 'spike' ? buildSpike(len) : buildFire(len);
        if (rot) {
          const outer = new THREE.Group(), pivot = new THREE.Group();
          if (rot & 1) n.group.children.forEach(function (c) { if (c.isSprite) c.scale.set(c.scale.y, c.scale.x, 1); }); // quầng sáng là ảnh luôn quay mặt về máy quay, không xoay theo → đổi ngang/dọc tay
          n.group.position.set(-len / 2, 0.5, 0); pivot.add(n.group); pivot.rotation.z = -rot * Math.PI / 2;
          pivot.position.set(o.w / 2, -o.h / 2, 0); outer.add(pivot); n.group = outer;
        }
        n.rot = rot;
      }
      else if (o.t === 'water') n = buildWater(o.w, o.h, (ROWS - o.y - o.h) <= 0.5, seed);
      else n = BUILDERS[o.t]();
      n.key = key; LG.add(n.group); return n;
    }

    // ---------- đồng bộ màn chơi: giữ cụm cũ nếu món không đổi cỡ, dời cụm nếu món chỉ đổi chỗ ----------
    const LG = new THREE.Group(); scene.add(LG);
    let live = [], bookends = null, bookCols = -1, builtCount = 0;
    const lineMap = new Map();
    function strokeNode(L) { // nét Bon vẽ → dải đen dày (mặt cắt y hệt nét 2D, có bề sâu để nhìn nghiêng ra cây cầu)
      const pts = []; for (let i = 0; i + 1 < L.length; i += 2) { const x = X(L[i]), y = Y(L[i + 1]); if (!pts.length || Math.hypot(x - pts[pts.length - 1].x, y - pts[pts.length - 1].y) > 0.01) pts.push(new THREE.Vector3(x, y, 0)); }
      if (pts.length < 2) return null;
      const g = new THREE.Group(), R = opt.lineW / 2 / CELL, tg = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), Math.min(600, Math.max(8, pts.length * 2)), R, 8, false);
      tg.scale(1, 1, 4.5); tg.computeVertexNormals();
      const tube = new THREE.Mesh(tg, strokeMat); tube.castShadow = true; tube.receiveShadow = true; g.add(tube);
      for (const p of [pts[0], pts[pts.length - 1]]) { const c = new THREE.Mesh(new THREE.SphereGeometry(R, 10, 8).scale(1, 1, 4.5), strokeMat); c.position.copy(p); c.castShadow = true; g.add(c); }
      return g;
    }
    function syncLevel(level, skipLine) {
      // món
      const pool = new Map(); for (const n of live) { let a = pool.get(n.key); if (!a) pool.set(n.key, a = []); a.push(n); }
      const want = [], next = []; let si = 0, wi = 0;
      for (const o of level.objs) { const key = keyOf(o); if (!key) continue; want.push({ o: o, key: key, gx: o.x, gy: ROWS - o.y, idx: o.t === 'star' ? si++ : o.t === 'wing' ? wi++ : 0, n: null }); }
      for (const w of want) { const a = pool.get(w.key); if (!a) continue; const i = a.findIndex(n => n.gx === w.gx && n.gy === w.gy); if (i >= 0) { w.n = a[i]; a.splice(i, 1); } }       // đứng yên
      for (const w of want) if (!w.n) { const a = pool.get(w.key); if (a && a.length) w.n = a.pop(); }                                                                           // chỉ đổi chỗ → dời cụm
      for (const w of want) { if (!w.n) { w.n = makeNode(w.o, w.key); builtCount++; } const n = w.n; n.obj = w.o; n.gx = w.gx; n.gy = w.gy; n.idx = w.idx; n.t = w.o.t; n.group.position.set(w.gx, w.gy, 0); next.push(n); }
      pool.forEach(function (a) { for (const n of a) disposeNode(n.group); });
      live = next;
      // đất ở hai đầu màn (ngoài chỗ chơi) để nhìn nghiêng không thấy hụt
      if (!bookends) { bookends = [buildBlock(10, 2, false, 501.3), buildBlock(10, 2, false, 733.9)]; LG.add(bookends[0].group); LG.add(bookends[1].group); bookends[0].group.position.set(-10, GY, 0); }
      if (bookCols !== level.cols) { bookCols = level.cols; bookends[1].group.position.set(level.cols, GY, 0); }
      // nét vẽ
      const seen = new Set();
      for (const L of level.lines) {
        if (L === skipLine) continue; seen.add(L);
        const e = lineMap.get(L);
        if (e && e.len === L.length) continue;
        if (e && e.mesh) disposeNode(e.mesh);
        const mesh = strokeNode(L); if (mesh) LG.add(mesh); lineMap.set(L, { len: L.length, mesh: mesh });
      }
      lineMap.forEach(function (e, L) { if (!seen.has(L)) { if (e.mesh) disposeNode(e.mesh); lineMap.delete(L); } });
    }

    // ================= ĐÈN + BẦU TRỜI PHẢN CHIẾU =================
    // 11-14d: Nam chọn kiểu đèn "D · Trời mát" (trang ANH_SANG_CHON) — nắng yếu, trời toả sáng mềm đều; trước: trời 0.38 + nắng 1.6 rọi thẳng như đèn flash
    const hemi = new THREE.HemisphereLight(0xdbe8f5, 0x6f8a58, 1.05); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xfff4e6, 0.55); sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048); sun.shadow.camera.left = -22; sun.shadow.camera.right = 22; sun.shadow.camera.top = 18; sun.shadow.camera.bottom = -10;
    sun.shadow.camera.near = 1; sun.shadow.camera.far = 90; sun.shadow.bias = -0.0005; sun.shadow.normalBias = 0.035; scene.add(sun); scene.add(sun.target);
    (function () { // bầu trời mờ dùng để phản chiếu lên kim loại, nước, lông thú
      const pm = new THREE.PMREMGenerator(renderer), es = new THREE.Scene();
      const m = new THREE.ShaderMaterial({ side: THREE.BackSide, vertexShader: 'varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec3 vD; void main(){ vec3 d = normalize(vD); vec3 up = vec3(0.35, 0.58, 0.95), hz = vec3(0.85, 0.92, 1.0), gr = vec3(0.16, 0.30, 0.08);'
          + ' vec3 c = d.y > 0.0 ? mix(hz, up, pow(d.y, 0.6)) : mix(hz * 0.6, gr, pow(-d.y, 0.4)); float s = max(dot(d, normalize(vec3(0.42, 0.5, -0.75))), 0.0); c += vec3(1.0, 0.9, 0.7) * pow(s, 40.0) * 6.0; gl_FragColor = vec4(c, 1.0); }' });
      es.add(new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), m)); scene.environment = pm.fromScene(es, 0.02).texture; pm.dispose();
    })();

    // ================= NHÂN VẬT 3D (thú bông vải nhung) =================
    const TPL = {};
    function b64buf(b64) { const bin = atob(b64), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u.buffer; }
    function loadAll(done) {
      const loader = new THREE.GLTFLoader(), jobs = [], GLB = window.GLB || {};
      for (const who of Object.keys(GLB)) { TPL[who] = {}; for (const part of Object.keys(GLB[who])) jobs.push([who, part]); }
      let left = jobs.length; if (!left) { done(); return; }
      for (const [who, part] of jobs) loader.parse(b64buf(GLB[who][part]), '', function (g) {
        let merged = null; try { merged = mergePart(g.scene); } catch (e) { console.warn('merge', who, part, e); }
        if (!merged) g.scene.traverse(o => { if (o.isMesh) { o.geometry.userData.keep = true; o.castShadow = true; o.receiveShadow = true; o.material = G.plush(o.material); o.material.envMapIntensity = 0.5; } });
        TPL[who][part] = merged || g.scene; if (--left === 0) done();
      }, function (e) { console.warn('GLB', who, part, e); if (--left === 0) done(); });
    }
    function mergePart(root) {
      root.updateMatrixWorld(true);
      const groups = new Map(); let bad = false;
      root.traverse(function (o) {
        if (!o.isMesh) return;
        const m = o.material, key = m.name + '|' + m.color.getHexString() + '|' + m.roughness;
        let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k);
        if (!g.attributes.normal) g.computeVertexNormals();
        g.applyMatrix4(o.matrixWorld);
        if (o.matrixWorld.determinant() < 0) { // mảnh bị lật gương → đảo chiều tam giác cho khỏi bị lộn mặt trong ra ngoài
          const p = g.attributes.position.array, n = g.attributes.normal.array;
          for (let i = 0; i + 8 < p.length; i += 9) for (const a of [p, n]) for (let c = 0; c < 3; c++) { const t = a[i + 3 + c]; a[i + 3 + c] = a[i + 6 + c]; a[i + 6 + c] = t; }
        }
        if (!groups.has(key)) groups.set(key, { mat: m, geos: [] }); groups.get(key).geos.push(g);
      });
      const out = new THREE.Group();
      groups.forEach(function (e) {
        const mg = BGU.mergeBufferGeometries(e.geos); e.geos.forEach(g => g.dispose());
        if (!mg) { bad = true; return; }
        mg.userData.keep = true; const pm = G.plush(e.mat); pm.envMapIntensity = 0.5;
        const mesh = new THREE.Mesh(mg, pm); mesh.castShadow = true; mesh.receiveShadow = true; out.add(mesh);
      });
      return bad ? null : out;
    }
    const FACE_NAMES = ['idle', 'blink', 'flap', 'fall', 'panic', 'wink', 'shock', 'phew', 'ouch', 'dizzy'];
    // Gối không có mặt: biểu cảm bằng dáng thân (chép bảng PILLOW_POSE của game: [dáng, co ngang, co dọc])
    const PILLOW_POSE = { shock: ['idle', 0.78, 1.2], ouch: ['idle', 0.78, 1.2], panic: ['idle', 0.78, 1.2], phew: ['idle', 1.16, 0.8], wink: ['idle', 1.16, 0.8], fall: ['puff', 1, 1] };
    function buildActor(who, sizeCells, enemy) {
      if (!TPL[who] || !(TPL[who].body || TPL[who].idle)) return null;
      const root = new THREE.Group(), turn = new THREE.Group(), model = new THREE.Group();
      root.add(turn); turn.add(model); model.scale.setScalar(sizeCells); model.position.y = (CHAR3D[who] || CHAR3D.froggy).bottom * sizeCells;
      const A = { who: who, made: who, size: sizeCells, root: root, turn: turn, model: model, faces: {}, face: 'idle', yaw: 0.9, extra: {} };
      if (who === 'pillow') {
        A.extra.bodies = {}; for (const k of ['idle', 'puff']) if (TPL.pillow[k]) { const b = TPL.pillow[k].clone(true); b.visible = k === 'idle'; model.add(b); A.extra.bodies[k] = b; }
        A.extra.corners = [['cornerTL', -1, 1, 0], ['cornerTR', 1, 1, 3], ['cornerBL', -1, -1, 1], ['cornerBR', 1, -1, 2]].map(function (c) { const m = TPL.pillow[c[0]].clone(true), h = new THREE.Group(); h.add(m); h.position.set(c[1] * 0.98, c[2] * 0.56, -0.08); model.add(h); return { h: h, sx: c[1], sz: c[2], i: c[3] }; });
      } else {
        model.add(TPL[who].body.clone(true));
        for (const f of FACE_NAMES) if (TPL[who][f]) { A.faces[f] = TPL[who][f].clone(true); A.faces[f].visible = f === 'idle'; model.add(A.faces[f]); }
      }
      if (who === 'chicken') {
        A.extra.hat = TPL.chicken.hat.clone(true); A.extra.hat.position.set(0, 1.02, 0); model.add(A.extra.hat);
        A.extra.legs = [-1, 1].map(s => { const l = TPL.chicken.leg.clone(true); l.position.set(s * 0.3, -0.9, 0); model.add(l); return l; });
        A.extra.petals = [];
        for (let i = 0; i < 6; i++) { const h = new THREE.Group(); h.position.set(0, -0.55, 0); h.rotation.y = i / 6 * TAU + 0.5; const p = TPL.chicken[i % 2 ? 'petalA' : 'petalB'].clone(true); p.position.set(0, 0, 0.42); h.add(p); model.add(h); A.extra.petals.push(p); }
      } else if (who === 'babyfrog') {
        A.extra.crown = TPL.babyfrog.crown.clone(true); A.extra.crown.position.set(0, 0.84, 0); model.add(A.extra.crown);
        A.extra.cup = TPL.babyfrog.cup.clone(true); A.extra.cup.position.set(0.02, -0.32, 0.72); model.add(A.extra.cup);
      }
      // bóng tròn mềm dưới chân (đất nhìn có "chạm"); enemy = bóng ĐỎ để Bon biết đây là "người gác", không phải baby của mình
      const bm = new THREE.MeshBasicMaterial({ map: TEX.soft, color: enemy ? 0xd01818 : 0x000000, transparent: true, opacity: 0.32, depthWrite: false }); bm.userData.own = true;
      const blob = new THREE.Mesh(new THREE.CircleGeometry((enemy ? 0.8 : 0.62) * sizeCells, 24).rotateX(-Math.PI / 2), bm);
      blob.position.y = 0.04; blob.renderOrder = 2; root.add(blob); A.blob = blob; A.blobK = enemy ? 0.75 : 0.34;
      scene.add(root); return A;
    }
    function poseActor(A, b, st, o) {
      const dt = st.dt;
      A.root.visible = !o.hidden;
      A.root.position.set(X(b.x) + (o.shake || 0), o.feetY, 0);
      A.yaw = approach(A.yaw, b.dir * (b.swim ? 1.15 : 0.9), dt * 9); A.turn.rotation.y = A.yaw;
      const s = b.st || o.bob || 0; A.turn.scale.set(1 - s * 0.55, 1 + s, 1 - s * 0.55);
      A.model.rotation.x = approach(A.model.rotation.x, b.swim ? 0.55 : (o.moving ? 0.1 : 0), dt * 4); // đang bơi: chúi người tới trước
      const lift = Math.max(0, (b.skirt[0] + b.skirt[3]) / 2);
      if (A.who === 'pillow') {
        const P = PILLOW_POSE[b.face] || ['idle', 1, 1], bodies = A.extra.bodies, flap = Math.sin(b.wing) * 0.35 * (1 - Math.min(1, lift));
        for (const k in bodies) { bodies[k].visible = k === P[0]; bodies[k].scale.set(P[1], P[2], 1); }
        for (const c of A.extra.corners) { c.h.position.set(c.sx * 0.98 * P[1], c.sz * 0.56 * P[2], -0.08); c.h.rotation.z = c.sx * (flap * (c.sz > 0 ? 1 : 0.6) + Math.max(0, b.skirt[c.i]) * 0.9); }
      } else if (A.face !== b.face && A.faces[b.face]) { A.faces[A.face].visible = false; A.faces[b.face].visible = true; A.face = b.face; }
      if (A.extra.legs) { A.extra.legs[0].rotation.x = Math.sin(b.leg) * 0.7 * (0.25 + lift); A.extra.legs[1].rotation.x = Math.sin(b.leg + Math.PI) * 0.7 * (0.25 + lift); }
      if (A.extra.petals) for (let i = 0; i < 6; i++) A.extra.petals[i].rotation.x = -(0.32 + Math.max(0, b.skirt[i % 4]) * 1.2 + Math.sin(b.wing + i) * 0.05);
      if (A.extra.hat) { A.extra.hat.position.y = 1.02 + b.hat * 0.55; A.extra.hat.rotation.z = -b.hat * 0.25; }
      if (A.extra.crown) { const c = Math.max(-0.15, b.hat); A.extra.crown.position.y = 0.84 + c * 0.6; A.extra.crown.rotation.z = -c * 0.3; }
      if (A.extra.cup) A.extra.cup.rotation.x = -b.skirt[0] * 0.5;
      // bóng dưới chân: bám mặt đất bên dưới, nhạt dần khi bay cao
      const gy = Y(st.groundBelow(b.x, o.feetPy)), hgt = Math.max(0, o.feetY - gy);
      A.blob.visible = gy > -1; A.blob.position.y = gy - o.feetY + 0.05; A.blob.material.opacity = b.swim ? 0 : A.blobK * Math.max(0, 1 - hgt / 5); A.blob.scale.setScalar(1 + hgt * 0.08);
    }
    let heroA = null, heroWings = null, heroWingMat = null, enemyA = [];
    function dropActor(A) { if (A) disposeNode(A.root); }
    function syncActors(st) {
      const hb = st.hero;
      if (!heroA || heroA.who !== hb.id) {
        dropActor(heroA); heroA = buildActor(hb.id, RV / CELL, false);
        if (heroA) { heroWingMat = featherMat.clone(); heroWingMat.transparent = true; heroWingMat.userData.own = true; heroWings = wingPair(1.5, heroWingMat); heroWings.position.set(0, 0.25, -0.62); heroWings.visible = false; heroA.model.add(heroWings); heroA.yaw = hb.dir * 0.9; }
      }
      if (heroA) {
        const blink = (hb.ouchT > 0 || hb.hurtT > 0) && Math.sin(st.clock * 36) > 0.2;
        poseActor(heroA, hb, st, { feetY: Y(hb.y + RC), feetPy: hb.y + RC, moving: st.mode === 'play' && hb.grounded && Math.abs(hb.vx) > 20, hidden: blink, shake: hb.ouchT > 0 ? Math.sin(st.clock * 60) * 0.09 : 0 });
        heroWings.visible = !!hb.hasWing;
        if (hb.hasWing) { const f = Math.sin(hb.wing) * 0.3 + (hb.flapT > 0 ? Math.sin(hb.flapT * 40) * 0.55 : 0); heroWings.userData.L.rotation.set(0, -0.5 - f, -0.35); heroWings.userData.R.rotation.set(0, 0.5 + f, 0.35); heroWingMat.opacity = (!hb.airJump && !hb.grounded) ? 0.45 : 1; }
      }
      const en = st.enemies;
      for (let i = 0; i < en.length; i++) {
        const e = en[i]; let A = enemyA[i];
        if (!A || A.who !== e.id || A.n !== e.n) { dropActor(A); A = enemyA[i] = buildActor(e.id, RV * e.n / CELL, true); if (A) { A.n = e.n; A.yaw = e.dir * 0.9; } }
        if (!A) continue;
        const walking = st.mode === 'play' && e.walk && e.grounded;
        poseActor(A, e, st, { feetY: Y(e.y + e.rc), feetPy: e.y + e.rc, moving: walking, hidden: e.gone, bob: walking ? Math.abs(Math.sin(e.leg)) * 0.06 : 0 });
      }
      while (enemyA.length > en.length) dropActor(enemyA.pop());
    }

    // ================= HẠT SÁNG (màu tuyến tính, nhân sáng để loá) =================
    const colCache = {}; function col(c) { return colCache[c] || (colCache[c] = new THREE.Color().setStyle(c, 'srgb-linear')); }
    let psScale = 1;
    function makePS(max, additive, tex, boost) {
      const geo = new THREE.BufferGeometry(), pos = new Float32Array(max * 3), cc = new Float32Array(max * 4), sz = new Float32Array(max), rot = new Float32Array(max);
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color4', new THREE.BufferAttribute(cc, 4)); geo.setAttribute('size', new THREE.BufferAttribute(sz, 1)); geo.setAttribute('rot', new THREE.BufferAttribute(rot, 1));
      const mat = new THREE.ShaderMaterial({ uniforms: { tex: { value: tex }, scale: { value: 1 }, boost: { value: boost } }, transparent: true, depthWrite: false, blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
        vertexShader: 'attribute float size, rot; attribute vec4 color4; varying vec4 vC; varying float vR; uniform float scale; void main(){ vC = color4; vR = rot; vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = size * scale / -mv.z; gl_Position = projectionMatrix * mv; }',
        fragmentShader: 'uniform sampler2D tex; uniform float boost; varying vec4 vC; varying float vR; void main(){ vec2 p = gl_PointCoord - 0.5; float c = cos(vR), s = sin(vR); p = vec2(c * p.x - s * p.y, s * p.x + c * p.y) + 0.5; vec4 t = texture2D(tex, p); gl_FragColor = vec4(vC.rgb * boost * t.rgb, vC.a * t.a); }' });
      const pts = new THREE.Points(geo, mat); pts.frustumCulled = false; pts.renderOrder = 5; scene.add(pts);
      const alive = [];
      return {
        add: function (p) { if (alive.length >= max) alive.shift(); p.max = p.life; p.c = col(p.col); p.r = p.r || Math.random() * TAU; alive.push(p); },
        count: function () { return alive.length; },
        update: function (dt) {
          let n = 0;
          for (let i = 0; i < alive.length; i++) {
            const p = alive[i]; p.life -= dt; if (p.life <= 0) continue;
            p.vy -= (p.grav || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z += (p.vz || 0) * dt; p.r += (p.spin || 0) * dt;
            if (p.drag) { const k = Math.max(0, 1 - p.drag * dt); p.vx *= k; p.vy *= k; }
            const k = p.life / p.max; alive[n] = p;
            pos[n * 3] = p.x; pos[n * 3 + 1] = p.y; pos[n * 3 + 2] = p.z;
            cc[n * 4] = p.c.r; cc[n * 4 + 1] = p.c.g; cc[n * 4 + 2] = p.c.b; cc[n * 4 + 3] = Math.min(1, k * 1.6) * (p.a === undefined ? 1 : p.a) * (p.fadeIn ? Math.min(1, (p.max - p.life) * 4) : 1);
            sz[n] = p.size * (p.grow ? (1 + (1 - k) * p.grow) : (0.35 + 0.65 * k)); rot[n] = p.r; n++;
          }
          alive.length = n; geo.setDrawRange(0, n); mat.uniforms.scale.value = psScale;
          geo.attributes.position.needsUpdate = true; geo.attributes.color4.needsUpdate = true; geo.attributes.size.needsUpdate = true; geo.attributes.rot.needsUpdate = true;
        } };
    }
    const psAdd = makePS(700, true, TEX.soft, 2.6), psSpark = makePS(500, true, TEX.star4, 2.6), psNorm = makePS(700, false, TEX.soft, 1), psPuff = makePS(200, false, TEX.puff, 1);
    function burst(ps, x, y, n, cols, sp, o) {
      o = o || {};
      for (let i = 0; i < n; i++) { const a = Math.random() * TAU, e = (Math.random() - 0.5) * Math.PI * 0.6, v = sp * (0.4 + Math.random() * 0.8);
        ps.add({ x: x + (Math.random() - 0.5) * (o.spread || 0), y: y + (Math.random() - 0.5) * (o.spreadY || 0), z: (o.z || 0) + (Math.random() - 0.5) * 0.4, vx: Math.cos(a) * Math.cos(e) * v, vy: Math.sin(a) * Math.cos(e) * v + (o.up || 0), vz: Math.sin(e) * v,
          col: Array.isArray(cols) ? cols[i % cols.length] : cols, size: (o.size || 0.3) * (0.7 + Math.random() * 0.6), life: (o.life || 0.6) * (0.7 + Math.random() * 0.6), grav: o.grav || 0, grow: o.grow, a: o.a, drag: o.drag, spin: o.spin }); }
    }
    // sự kiện từ luật chơi → hạt, rung (toạ độ x, y là điểm ảnh của game)
    const FIRE_COLS = ['#ffb84a', '#ff8420', '#ff4a10'], WATER = ['#d6f3ff', '#9be3ff', '#ffffff'], CONFETTI = ['#f43f5e', '#f59e0b', '#22c55e', '#3b82f6', '#a855f7', '#facc15'];
    let shakeT = 0, shakeAmp = 0, lookX = 16, lookY = HALF_ROWS;
    function shake(t, a) { shakeT = Math.max(shakeT, t); shakeAmp = Math.max(shakeAmp, a); }
    function event(type, x, y, o) {
      if (!ready) return;
      const ex = X(x), ey = Y(y);
      switch (type) {
        case 'jump': burst(psNorm, ex, ey, 8, '#e9dcc0', 2.2, { size: 0.3, life: 0.4, grav: 6, a: 0.7 }); break;
        case 'land': burst(psNorm, ex, ey, 10, '#d9c7a3', 3, { size: 0.34, life: 0.5, grav: 8, a: 0.7 }); break;
        case 'flap': burst(psSpark, ex, ey - 0.3, 12, '#ffffff', 3, { size: 0.4, life: 0.55, grav: 5 }); break;
        case 'ouch': if (o === 'water') burst(psNorm, ex, ey, 26, WATER, 6, { size: 0.3, life: 0.7, grav: 22, up: 5, spread: 0.8 }); else burst(psAdd, ex, ey, 18, o === 'fire' ? FIRE_COLS : '#ffffff', 5.5, { size: 0.36, life: 0.6, grav: 10 });
          if (o === 'fire') burst(psPuff, ex, ey, 6, '#6b7280', 1.5, { size: 0.8, life: 0.8, grow: 1.5, a: 0.5, up: 1 }); shake(0.25, 0.2); break;
        case 'bump': burst(psSpark, ex, ey, 10, '#ffe58a', 4.5, { size: 0.5, life: 0.45 }); shake(0.12, 0.13); break;
        case 'wing': burst(psSpark, ex, ey, 16, '#ffffff', 4.5, { size: 0.5, life: 0.5 }); break;
        case 'boing': burst(psSpark, ex, ey, 10, '#fecaca', 4, { size: 0.4, life: 0.4, up: 3 }); break;
        case 'star': burst(psSpark, ex, ey, 26, '#ffe066', 6, { size: 0.6, life: 0.6 }); break;
        case 'splash': burst(psNorm, ex, ey, o === 'big' ? 30 : 14, WATER, o === 'big' ? 7 : 4, { size: 0.3, life: 0.7, grav: 22, up: o === 'big' ? 6 : 3.5, spread: 0.8 }); break;
        case 'stroke': burst(psNorm, ex, ey - 0.3, 6, '#ffffff', 1, { size: 0.2, life: 0.9, up: 2, a: 0.7, spread: 0.6 }); break;
        case 'leap': burst(psNorm, ex, ey, 20, WATER, 6, { size: 0.3, life: 0.7, grav: 22, up: 6, spread: 0.8 }); break;
        case 'enemy_hop': burst(psNorm, ex, ey - 0.3, 10, WATER, 4, { size: 0.26, life: 0.5, grav: 20, up: 3 }); break;
        case 'win': for (let i = 0; i < 110; i++) psNorm.add({ x: lookX + (Math.random() - 0.5) * 18, y: lookY + 5 + Math.random() * 3, z: 1 + Math.random() * 2, vx: (Math.random() - 0.5) * 8, vy: Math.random() * 6, vz: 0, col: CONFETTI[i % 6], size: 0.34, life: 2.4, grav: 9 }); break;
        default: fightEvent(type, ex, ey, o); // Đợt 3: vũ khí, boss, sét
      }
    }

    // ================= ĐỢT 3: VŨ KHÍ, ĐẠN, Ổ KHOÁ, BOSS VUA SẤM, SÉT, MƯA =================
    // Luật chơi nằm ở draw_run.html (st.fight); ở đây chỉ dựng hình. Màn không có vũ khí / boss thì không dựng gì thêm (fightFrame thoát ngay).
    const BR = (opt.bossR || 60) / CELL;
    const hotMat = new THREE.MeshBasicMaterial({ color: G.hdr(0xff8a2a, 2.2) }), coreMat = new THREE.MeshBasicMaterial({ color: G.hdr(0xfff1a8, 3.0) });
    const bladeMat = new THREE.MeshStandardMaterial({ color: 0xf1f5f9, roughness: 0.12, metalness: 1 }), gripMat = new THREE.MeshStandardMaterial({ color: 0x6b3410, roughness: 0.8 });
    const lockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.35, metalness: 0.9 });
    hotMat.name = 'hot'; coreMat.name = 'hot'; bladeMat.name = 'blade'; lockMat.name = 'lock';
    const pebGeo = keep(rockGeo.clone());
    const W_GEO = {
      gunBody: keep(new THREE.BoxGeometry(0.62, 0.3, 0.26)), gunGrip: keep(new THREE.BoxGeometry(0.2, 0.34, 0.2)), gunBarrel: keep(new THREE.CylinderGeometry(0.1, 0.13, 0.34, 14).rotateZ(Math.PI / 2)),
      ball: keep(new THREE.SphereGeometry(1, 16, 12)),
      blade: keep(new THREE.BoxGeometry(0.16, 0.86, 0.05)), tip: keep(new THREE.ConeGeometry(0.113, 0.22, 4).rotateY(Math.PI / 4)), guard: keep(new THREE.BoxGeometry(0.5, 0.09, 0.14)), grip: keep(new THREE.CylinderGeometry(0.055, 0.055, 0.28, 10)),
      lockBody: keep(new THREE.BoxGeometry(0.5, 0.4, 0.2)), lockArc: keep(new THREE.TorusGeometry(0.17, 0.05, 8, 20, Math.PI)),
      slash: keep(new THREE.TorusGeometry(1.5, 0.09, 6, 28, Math.PI * 0.75)),
      ring: keep(new THREE.RingGeometry(1.0, 1.35, 40).rotateX(-Math.PI / 2)), disc: keep(new THREE.CircleGeometry(1.0, 32).rotateX(-Math.PI / 2)), beam: keep(new THREE.CylinderGeometry(0.25, 0.9, 12, 20, 1, true)) };
    function weaponMesh(t) { // 1 món vũ khí, tâm ở gốc toạ độ, cỡ ~0.9 ô
      const g = new THREE.Group();
      const add = function (geo, mat, x, y, z, s, sz) { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (s) m.scale.set(s, s, sz === undefined ? s : sz); m.castShadow = true; g.add(m); return m; };
      if (t === 'gun') { add(W_GEO.gunBody, plateMat, -0.06, 0.04, 0); add(W_GEO.gunGrip, plateMat, -0.22, -0.2, 0); add(W_GEO.gunBarrel, steelMat, 0.36, 0.06, 0); add(W_GEO.ball, hotMat, 0.56, 0.06, 0, 0.13); add(W_GEO.ball, coreMat, 0.6, 0.06, 0, 0.07); }
      else if (t === 'sword') { add(W_GEO.blade, bladeMat, 0, 0.3, 0); add(W_GEO.tip, bladeMat, 0, 0.84, 0, 1, 0.3); add(W_GEO.guard, gold, 0, -0.16, 0); add(W_GEO.grip, gripMat, 0, -0.34, 0); g.rotation.z = -0.5; }
      else for (const q of [[-0.24, -0.12, 0.05, 0.27], [0.22, -0.14, -0.04, 0.24], [0.0, 0.12, 0, 0.26], [0.02, -0.16, 0.26, 0.2]]) { const m = add(pebGeo, rockMat, q[0], q[1], q[2], q[3]); m.rotation.set(q[0] * 5, q[1] * 9, q[2] * 7); }
      return g;
    }
    function buildWeapon(t) {
      return function () {
        const grp = new THREE.Group(), inner = weaponMesh(t), gl = G.glow(G.hdr(t === 'gun' ? 0xffb060 : 0xfff0c0, 1.0), 2.4, 0.35);
        grp.add(inner); grp.add(gl);
        const node = { group: grp }; node.update = function (st) { // đang cầm món này → món trên màn thu nhỏ, mờ quầng (vẫn nằm đó để đổi lại)
          const held = st.mode === 'play' && st.fight && st.fight.weapon === t;
          const y = -0.5 + (t === 'rocks' ? -0.12 : 0.08 + Math.sin(st.clock * 3 + node.gx * 1.6) * 0.1);
          inner.position.set(0.5, y, 0); inner.scale.setScalar(held ? 0.6 : 1); gl.position.set(0.5, y, -0.2); gl.material.opacity = held ? 0.08 : 0.35;
          if (t !== 'rocks') inner.rotation.y = Math.sin(st.clock * 1.4 + node.gx) * 0.5;
        };
        return node;
      };
    }
    BUILDERS.gun = buildWeapon('gun'); BUILDERS.sword = buildWeapon('sword'); BUILDERS.rocks = buildWeapon('rocks');

    const FX3 = new THREE.Group(); scene.add(FX3);
    let autoRockN = null, heldG = null, lockG = null, slashM = null, bossA = null, bossKit = null, rainNear = null, rainFar = null, flashK = 0, stormK = 0;
    const fireM = [], rockM = [], rings = new Map(), boltsG = [];
    const colSleep = lin(0x9aa6c4), colStorm = lin(0x2e3954), colHappy = lin(0xf1f4fb), tintN = new THREE.Color(1, 1, 1), tintR = new THREE.Color(1.9, 0.62, 0.5), fogStorm = new THREE.Color(0x4a5a78), SPARK = ['#fff7c2', '#ffd34d', '#ffffff'];
    function fightInit() { // dựng 1 lần, lúc màn đầu tiên cần tới
      heldG = new THREE.Group(); for (const t of ['gun', 'sword', 'rocks']) { const m = weaponMesh(t); m.scale.setScalar(0.62); m.userData.t = t; heldG.add(m); } FX3.add(heldG);
      lockG = new THREE.Group(); const lb = new THREE.Mesh(W_GEO.lockBody, lockMat), la = new THREE.Mesh(W_GEO.lockArc, lockMat), lk = new THREE.Mesh(W_GEO.ball, plateMat);
      la.position.y = 0.2; lk.scale.setScalar(0.06); lk.position.set(0, 0, 0.11); lb.castShadow = true; lockG.add(lb); lockG.add(la); lockG.add(lk); lockG.visible = false; FX3.add(lockG);
      slashM = new THREE.Mesh(W_GEO.slash, new THREE.MeshBasicMaterial({ color: G.hdr(0xffffff, 2.2), transparent: true, blending: THREE.AdditiveBlending, depthWrite: false })); slashM.material.name = 'slash'; slashM.visible = false; slashM.renderOrder = 6; FX3.add(slashM);
      for (let i = 0; i < 8; i++) {
        const f = new THREE.Group(), a = new THREE.Mesh(W_GEO.ball, hotMat), b = new THREE.Mesh(W_GEO.ball, coreMat); a.scale.setScalar(0.34); b.scale.setScalar(0.19); f.add(a); f.add(b); f.add(G.glow(G.hdr(0xff9a3a, 1.4), 2.2, 0.6)); f.visible = false; FX3.add(f); fireM.push(f);
        const r = new THREE.Mesh(pebGeo, rockMat); r.scale.setScalar(0.3); r.castShadow = true; r.visible = false; FX3.add(r); rockM.push(r);
      }
    }
    function pickFace(B, F) {
      if (B.state === 'sleep') return 'sleep';
      if (B.state === 'intro') return B.t < 0.55 ? 'wake' : 'roar';
      if (B.state === 'happy') return 'happy';
      if (B.hurtT > 0) return 'hurt';
      if (B.gloatT > 0) return 'gloat';
      if (B.phase === 'dive') return 'swoop';
      if (B.hp === 1) return 'panic';
      if (B.phase === 'warn' || B.atkT < 0.8 || F.bolts.some(L => L.phase === 'warn')) return 'scheme';
      if (B.hp <= 2) return 'rage';
      return 'grumpy';
    }
    function drawBoss(B, F, st, dt, clock) { // cách diễn lấy từ bản mẫu đã duyệt (mau_3d_v2.html), thêm lúc "happy"
      const bo = bossA;
      if (!B) { bo.root.visible = false; return; }
      const hb = st.hero, R = bo.R, face = pickFace(B, F), storm = stormK;
      if (face !== bo.face) { bo.face = face; bo.paint.map = bo.FACE[face].paint; bo.glow.map = bo.FACE[face].glow; bo.paint.needsUpdate = bo.glow.needsUpdate = true; }
      bo.root.visible = true;
      let x = X(B.x), y = Y(B.y);
      if (B.state === 'sleep') y += Math.sin(clock * 0.9) * 0.15;
      else if (B.state === 'intro') y += B.t < 0.55 ? Math.sin(Math.min(1, B.t / 0.3) * Math.PI) * 1.2 : 0;
      else if (B.state === 'happy') y += Math.abs(Math.sin(clock * 5)) * 0.7;
      else if (B.phase === 'warn') x += Math.sin(clock * 60) * 0.08; // rung báo trước khi sà xuống
      bo.root.position.set(x, y, 0);
      let rz = Math.sin(clock * 1.1) * 0.04; const ry = B.state === 'fight' ? clamp((hb.x - B.x) / 600, -0.4, 0.4) : 0;
      const br = Math.sin(clock * (face === 'sleep' ? 1.4 : 2.6));
      let sx = 1 + br * 0.025, sy = 1 - br * 0.03;
      if (face === 'sleep') { sx = 1 + br * 0.05; sy = 1 + br * 0.04; }
      if (face === 'wake') { sy = 1.12; sx = 0.92; }
      if (face === 'roar') { const k = 1 + Math.abs(Math.sin(clock * 30)) * 0.04; sx = 1.08 * k; sy = 1.04 * k; }
      if (face === 'gloat' || face === 'happy') { sy = 1 + Math.abs(Math.sin(clock * (face === 'happy' ? 10 : 14))) * 0.08; rz = Math.sin(clock * 7) * 0.08; }
      if (face === 'swoop') { sx = 1.12; sy = 0.9; rz = -Math.sign(hb.x - B.x) * 0.12; }
      if (face === 'hurt') { const k = Math.max(0, B.hurtT) / 0.45; sx = 1 - k * 0.12; sy = 1 + k * 0.1; rz += Math.sin(clock * 50) * 0.06 * k; }
      if (face === 'rage') rz += Math.sin(clock * 40) * 0.02;
      if (face === 'panic') rz += Math.sin(clock * 22) * 0.05;
      bo.wob.scale.set(sx, sy, 1); bo.wob.rotation.set(0, ry, rz);
      // màu thân: ngủ xám sáng, bão xanh than, tức → đỏ, trúng đòn → loé trắng, hết giận → trắng bông
      bo.mat.color.copy(colSleep).lerp(colStorm, storm); if (face === 'happy') bo.mat.color.lerp(colHappy, Math.min(1, B.t * 1.5));
      const angry = face === 'rage' ? 0.85 + 0.15 * Math.sin(clock * 9) : face === 'scheme' && B.hp <= 2 ? 0.6 : 0;
      bo.U.uTint.value.copy(tintN).lerp(tintR, angry);
      bo.U.uHurt.value = face === 'hurt' ? Math.max(0, B.hurtT) / 0.45 : 0;
      bo.U.uRim.value.setRGB(0.12 + 0.3 * storm, 0.2 + 0.42 * storm, 0.45 + 0.75 * storm).multiplyScalar(face === 'sleep' ? 0.5 : 1);
      bo.U.uInner.value = (face === 'scheme' ? 0.35 + 0.25 * Math.sin(clock * 18) : face === 'roar' ? 0.3 : 0) * storm + flashK * 0.3;
      const arcK = face === 'sleep' ? 0.04 : face === 'happy' ? 0.1 : face === 'scheme' || face === 'roar' || face === 'rage' ? 0.75 : 0.36;
      for (const a of bo.arcs) { const on = Math.sin(clock * 7 + a.userData.phase * 3) + Math.sin(clock * 19 + a.userData.phase * 7) * 0.6 > 1.6 - arcK * 2.6; a.visible = on && Math.random() > 0.08; }
      const pale = face === 'wake' || face === 'panic';
      bo.glow.color.setScalar(face === 'sleep' ? 0 : pale ? 1.25 : face === 'rage' ? 3.4 : face === 'happy' ? 2.0 : 2.8);
      for (const e of bo.eyeGlows) { e.visible = face !== 'sleep' && face !== 'hurt' && face !== 'gloat' && face !== 'happy' && !pale; e.material.color.copy(face === 'rage' ? G.hdr(0xff5a20, 1.8) : G.hdr(0xffc94a, 1.6)); }
      // vương miện: lò xo lệch khi trúng đòn
      bo.crownV += (-bo.crownA * 60 - bo.crownV * 7) * dt; bo.crownA += bo.crownV * dt; const tilt = face === 'hurt' ? 0.35 : face === 'panic' ? 0.18 : 0;
      bo.crown.rotation.z = -0.08 + bo.crownA * 0.12 + tilt * Math.sign(bo.crownA || 1) + (face === 'roar' ? Math.sin(clock * 30) * 0.05 : 0);
      bo.crown.position.copy(bo.crownHome); bo.crown.position.x += bo.crownA * 0.08 * R + (face === 'hurt' ? 0.18 * R : 0);
      bo.crown.position.y += (face === 'wake' ? 0.25 * R : 0) + (face === 'gloat' || face === 'happy' ? Math.abs(Math.sin(clock * (face === 'happy' ? 10 : 14))) * 0.12 * R : 0);
      for (let i = 0; i < 3; i++) { const z = bo.zs[i], t = (clock * 0.45 + i / 3) % 1; z.visible = face === 'sleep'; z.position.set(R * (0.9 + t * 1.1), R * (0.2 + t * 1.4), R * 0.6); const s = (0.5 + t * 0.7) * R * 0.45; z.scale.set(s, s, 1); z.material.opacity = Math.sin(t * Math.PI); }
      // khói (tức), mồ hôi (hoảng), sao (mừng), tàn điện (đang đánh)
      if (face === 'rage' && Math.random() < dt * 22) for (const s of [-1, 1]) psPuff.add({ x: x + s * R * 0.9, y: y + R * 1.0, z: 0.5, vx: s * 1.4, vy: 2.6 + Math.random(), vz: 0, col: '#d6dbe4', size: 1.1, life: 1.0, grow: 2.2, a: 0.55, drag: 1 });
      if (face === 'panic' && Math.random() < dt * 10) { const s = Math.random() < 0.5 ? -1 : 1; psNorm.add({ x: x + s * R * 1.1, y: y + R * 0.7, z: R * 0.5, vx: s * (2 + Math.random() * 2), vy: 3 + Math.random() * 2, vz: 0.5, col: '#8fd0ff', size: 0.45, life: 0.9, grav: 14 }); }
      if (face === 'happy' && Math.random() < dt * 14) psSpark.add({ x: x + (Math.random() - 0.5) * R * 3, y: y + (Math.random() - 0.2) * R * 1.6, z: R * 0.6, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, vz: 0, col: SPARK[Math.floor(Math.random() * 3)], size: 0.45, life: 0.7, spin: 2 });
      if (B.state === 'fight' && Math.random() < dt * 18) psSpark.add({ x: x + (Math.random() - 0.5) * R * 2.4, y: y - R * 0.6 - Math.random() * 0.6, z: R * 0.4, vx: (Math.random() - 0.5) * 2, vy: -1.5 - Math.random() * 2, vz: 0, col: '#ffe9a0', size: 0.25, life: 0.35 });
    }
    // ---- Đợt 4: NGƯỜI ĐÁ — đi lạch bạch → nhấc chân (báo) → dậm → ngồi xoa chân (lúc đánh được) → mừng ----
    let rockA = null, curA = null, curKind = null; const dropN = new Map(), lootM = [];
    function rockFace(B) {
      if (B.state === 'sleep') return 'sleep';
      if (B.state === 'intro') return B.t < 0.55 ? 'wake' : 'roar';
      if (B.state === 'happy') return 'happy';
      if (B.hurtT > 0) return 'hurt';
      if (B.phase === 'rest') return 'dizzy';
      if (B.gloatT > 0) return 'gloat';
      if (B.phase === 'lift') return 'scheme';
      if (B.phase === 'stomp') return 'roar';
      if (B.hp === 1) return 'panic';
      if (B.hp <= 2) return 'rage';
      return 'grumpy';
    }
    function drawRock(B, F, st, dt, clock) {
      const bo = rockA;
      if (!B) { bo.root.visible = false; return; }
      const hb = st.hero, R = bo.R, face = rockFace(B), fight = B.state === 'fight';
      if (face !== bo.face) { bo.face = face; bo.paint.map = bo.FACE[face].paint; bo.glow.map = bo.FACE[face].glow; bo.paint.needsUpdate = bo.glow.needsUpdate = true; }
      bo.root.visible = true;
      const side = hb.x >= B.x ? 1 : -1, li = side > 0 ? 1 : 0; // chân nhấc lên = chân phía baby
      // mức ngồi (0 đứng → 1 ngồi bệt) và mức nhấc chân, chuyển mượt
      const sitTo = B.state === 'sleep' ? 0.8 : fight && B.phase === 'rest' ? 1 : 0, liftTo = fight && B.phase === 'lift' ? 1 : 0;
      bo.sit = (bo.sit || 0) + (sitTo - (bo.sit || 0)) * Math.min(1, dt * 9); bo.lift = (bo.lift || 0) + (liftTo - (bo.lift || 0)) * Math.min(1, dt * (liftTo ? 7 : 26));
      const walking = fight && B.phase === 'walk', step = Math.sin(clock * 7);
      let y = Y(B.y), rz = 0, sx = 1, sy = 1;
      if (B.state === 'happy') y += Math.abs(Math.sin(clock * 5)) * 0.6;
      if (B.state === 'intro') y += B.t < 0.55 ? Math.sin(Math.min(1, B.t / 0.3) * Math.PI) * 0.7 : 0;
      bo.root.position.set(X(B.x) + (fight && B.phase === 'lift' ? Math.sin(clock * 50) * 0.03 : 0), y, 0);
      const br = Math.sin(clock * (face === 'sleep' ? 1.4 : 2.4));
      sx = 1 + br * 0.02; sy = 1 - br * 0.025;
      if (walking) rz = step * 0.07;
      if (bo.lift > 0.02) rz = -side * 0.16 * bo.lift; // nghiêng người ra sau khi nhấc chân
      if (fight && B.phase === 'stomp') { sy = 0.9; sx = 1.08; }
      if (face === 'roar' && B.state === 'intro') { const k = 1 + Math.abs(Math.sin(clock * 30)) * 0.04; sx = 1.06 * k; sy = 1.03 * k; }
      if (face === 'hurt') { const k = Math.max(0, B.hurtT) / 0.45; sx = 1 - k * 0.1; sy = 1 + k * 0.08; rz += Math.sin(clock * 50) * 0.06 * k; }
      if (face === 'happy' || face === 'gloat') rz = Math.sin(clock * 7) * 0.08;
      if (face === 'dizzy') rz = Math.sin(clock * 3) * 0.06;
      bo.wob.position.y = bo.wobHome - bo.sit * 0.42 * R + (walking ? Math.abs(step) * 0.06 * R : 0);
      bo.wob.scale.set(sx, sy, 1); bo.wob.rotation.set(0, fight || B.state === 'happy' ? clamp((hb.x - B.x) / 500, -0.45, 0.45) : 0, rz);
      // chân: đi thì nhấc so le; nhấc chân báo trước thì chân phía baby giơ cao; ngồi thì duỗi ra trước
      for (let i = 0; i < 2; i++) {
        const L = bo.legs[i], s = i ? 1 : -1;
        let ly = -0.62 * R, lz = 0.05 * R, rx = 0;
        if (walking) ly += Math.max(0, step * s) * 0.16 * R;
        if (i === li) ly += bo.lift * 0.55 * R;
        lz += bo.sit * 0.45 * R; rx = -bo.sit * 0.9; ly += bo.sit * 0.1 * R;
        L.position.set(s * 0.42 * R, ly, lz); L.rotation.x = rx;
      }
      // tay: đi thì đánh nhẹ; nhấc chân thì giơ cả hai tay; ngồi thì 1 tay xoa chân; mừng thì vẫy
      for (let i = 0; i < 2; i++) {
        const A = bo.arms[i], s = i ? 1 : -1; let az = 0, ax = 0;
        if (walking) ax = -step * s * 0.35;
        if (bo.lift > 0.02) az = s * 1.5 * bo.lift;
        if (bo.sit > 0.5 && fight) { ax = -0.9; if (i === li) ax += Math.sin(clock * 11) * 0.25; }
        if (face === 'happy' || face === 'gloat') az = s * (1.9 + Math.sin(clock * 10 + i) * 0.35);
        if (face === 'hurt') az = s * 0.9;
        A.rotation.set(ax, 0, az);
      }
      bo.top.rotation.z = Math.sin(clock * 2.2) * 0.12 + (walking ? step * 0.15 : 0); bo.flower.rotation.z = face === 'dizzy' || face === 'hurt' ? 0.9 : Math.sin(clock * 3) * 0.2;
      bo.mat.emissive.setScalar(face === 'hurt' ? Math.max(0, B.hurtT) / 0.45 * 0.55 : 0);
      if (face === 'rage' || face === 'panic') bo.mat.emissive.setRGB(0.16 + 0.06 * Math.sin(clock * 9), 0.02, 0);
      const pale = face === 'wake' || face === 'panic';
      bo.glow.color.setScalar(face === 'sleep' ? 0 : pale ? 1.1 : face === 'rage' ? 2.6 : 1.9);
      for (let i = 0; i < 3; i++) { const z = bo.zs[i], t = (clock * 0.45 + i / 3) % 1; z.visible = face === 'sleep'; z.position.set(R * (0.9 + t * 1.1), R * (0.2 + t * 1.4), R * 0.6); const s = (0.5 + t * 0.7) * R * 0.45; z.scale.set(s, s, 1); z.material.opacity = Math.sin(t * Math.PI); }
      // bụi dưới chân lúc đi, sao quay quanh đầu lúc ngồi xoa chân (= dấu "tới lượt bạn"), sao mừng
      if (walking && Math.abs(step) > 0.97 && Math.random() < 0.5) psPuff.add({ x: X(B.x) + (Math.random() - 0.5) * R, y: y - R * 0.95, z: 0.4, vx: (Math.random() - 0.5), vy: 0.6, vz: 0, col: '#d6cdbd', size: 0.7, life: 0.5, grow: 1.4, a: 0.4, drag: 1 });
      if (face === 'dizzy' && Math.random() < dt * 9) { const a = clock * 4 + Math.random() * 6.28; psSpark.add({ x: X(B.x) + Math.cos(a) * R * 0.8, y: y + R * 1.05 + bo.wob.position.y - bo.wobHome, z: R * 0.5 + Math.sin(a) * 0.4, vx: -Math.sin(a) * 1.5, vy: 0.4, vz: 0, col: '#fff3a0', size: 0.4, life: 0.5, spin: 3 }); }
      if (face === 'happy' && Math.random() < dt * 14) psSpark.add({ x: X(B.x) + (Math.random() - 0.5) * R * 3, y: y + (Math.random() - 0.2) * R * 1.6, z: R * 0.6, vx: (Math.random() - 0.5) * 2, vy: 1 + Math.random() * 2, vz: 0, col: SPARK[Math.floor(Math.random() * 3)], size: 0.45, life: 0.7, spin: 2 });
    }
    function dropFrame(F, st, dt, clock) { // bóng báo chỗ đá rơi + tảng đá đang rơi + đá nằm lại cho baby nhặt
      const drops = F.drops || [], loot = F.loot || [];
      for (const D of drops) {
        let n = dropN.get(D);
        if (!n) {
          n = { g: new THREE.Group() };
          const mk = function (geo, col, op, blend) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, depthWrite: false, blending: blend || THREE.NormalBlending, side: THREE.DoubleSide })); m.material.userData.own = true; m.material.name = 'dropWarn'; n.g.add(m); return m; };
          n.shadow = mk(W_GEO.disc, 0x1b2333, 0.5); n.shadow.material.map = TEX.soft; n.ring = mk(W_GEO.ring, G.hdr(0xff8a3a, 1.6), 0.8, THREE.AdditiveBlending);
          n.rock = new THREE.Mesh(pebGeo, rockMat); n.rock.castShadow = true; n.rock.visible = false; n.g.add(n.rock);
          n.g.position.set(X(D.x), Y(D.y) + 0.09, 0.2); n.g.renderOrder = 4; FX3.add(n.g); dropN.set(D, n);
        }
        const kk = D.phase === 'warn' ? 1 - D.warn / D.w0 : 1, pulse = 0.5 + 0.5 * Math.sin(clock * 22 * (0.5 + kk));
        n.shadow.scale.setScalar(0.7 + 0.75 * kk); n.shadow.material.opacity = 0.3 + 0.4 * kk;
        n.ring.scale.setScalar(1.55 - 0.45 * kk); n.ring.material.opacity = (0.3 + 0.6 * pulse) * (0.35 + 0.65 * kk);
        n.rock.visible = D.phase === 'fall';
        if (n.rock.visible) { n.rock.position.set(0, (D.y - D.fy) / CELL + 0.3, 0); n.rock.scale.setScalar(0.85); n.rock.rotation.x += dt * 6; n.rock.rotation.z += dt * 4; }
      }
      dropN.forEach(function (n, D) { if (drops.indexOf(D) < 0) { FX3.remove(n.g); n.shadow.material.dispose(); n.ring.material.dispose(); dropN.delete(D); } });
      for (let i = 0; i < Math.max(loot.length, lootM.length); i++) {
        if (i >= loot.length) { lootM[i].visible = false; continue; }
        if (!lootM[i]) { const m = weaponMesh('rocks'); m.scale.setScalar(0.8); FX3.add(m); lootM.push(m); }
        const L = loot[i], m = lootM[i]; m.visible = L.life > 1 || Math.sin(clock * 22) > 0; // sắp hết thì nhấp nháy
        m.position.set(X(L.x), Y(L.y) + 0.1, 0.25);
      }
    }
    function makeBolt(x0, y0, x1, y1) { // tia sét gãy khúc từ boss xuống đất, tự tắt sau 0.32 giây
      const pts = [], N = 9; for (let i = 0; i <= N; i++) { const k = i / N, j = i === 0 || i === N ? 0 : 1; pts.push(new THREE.Vector3(x0 + (x1 - x0) * k + (Math.random() - 0.5) * 1.3 * j, y0 + (y1 - y0) * k + (Math.random() - 0.5) * 0.4 * j, (Math.random() - 0.5) * 0.6 * j)); }
      const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.0), g = new THREE.Group();
      const core = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.07, 5), new THREE.MeshBasicMaterial({ color: G.hdr(0xfffbe0, 3.2), transparent: true, depthWrite: false }));
      const halo = new THREE.Mesh(new THREE.TubeGeometry(curve, 40, 0.26, 6), new THREE.MeshBasicMaterial({ color: G.hdr(0xffc23a, 1.4), transparent: true, opacity: 0.5, blending: THREE.AdditiveBlending, depthWrite: false }));
      core.material.userData.own = halo.material.userData.own = true; core.material.name = halo.material.name = 'bolt'; core.renderOrder = halo.renderOrder = 7; g.add(halo); g.add(core); FX3.add(g); boltsG.push({ g: g, t: 0.32, core: core, halo: halo });
    }
    function fightEvent(type, ex, ey, o) { // sự kiện Đợt 3 (event() ở trên chuyển xuống)
      switch (type) {
        case 'shoot': burst(psAdd, ex, ey, 6, FIRE_COLS, 3, { size: 0.3, life: 0.25 }); break;
        case 'slash': burst(psSpark, ex, ey, 8, '#ffffff', 4, { size: 0.4, life: 0.3 }); break;
        case 'weapon': burst(psSpark, ex, ey, 16, '#ffffff', 4.5, { size: 0.5, life: 0.5 }); break;
        case 'shot_end': if (o === 'fire') burst(psAdd, ex, ey, 10, FIRE_COLS, 4, { size: 0.34, life: 0.35 }); else burst(psNorm, ex, ey, 8, '#cbd5e1', 3, { size: 0.26, life: 0.4, grav: 10 }); break;
        case 'enemy_poof': burst(psPuff, ex, ey, 10, ['#ffffff', '#e2e8f0'], 2.5, { size: 0.9, life: 0.6, grow: 1.6, a: 0.7 }); burst(psSpark, ex, ey, 14, '#ffe58a', 5, { size: 0.5, life: 0.5 }); shake(0.1, 0.1); break;
        case 'hit_boss': burst(psSpark, ex, ey, 30, SPARK.concat(['#c084fc']), 8.5, { size: 0.6, life: 0.7, grav: 5 }); shake(0.14, 0.16); flashK = Math.max(flashK, 0.25); if (bossA) bossA.crownV += 6; break;
        case 'boss_intro': shake(1.6, 0.09); break;
        case 'boss_fight': shake(0.4, 0.26); if (curKind !== 'rock') flashK = 1; break;
        // Đợt 4 — Người Đá
        case 'rock_lift': burst(psPuff, ex, ey + 0.1, 4, '#d6cdbd', 1.2, { size: 0.6, life: 0.5, grow: 1.3, a: 0.4 }); break;
        case 'stomp': shake(0.5, 0.3); burst(psPuff, ex, ey + 0.15, 14, ['#d6cdbd', '#b8ad9a'], 3.2, { size: 1.0, life: 0.7, grow: 1.6, a: 0.55, up: 0.6 }); break;
        case 'rock_land': shake(0.35, 0.22); burst(psPuff, ex, ey + 0.15, 10, ['#d6cdbd', '#b8ad9a'], 2.6, { size: 0.9, life: 0.6, grow: 1.5, a: 0.5, up: 0.5 }); burst(psNorm, ex, ey + 0.2, 10, '#9a8f80', 4.5, { size: 0.26, life: 0.5, grav: 12, up: 2.5 }); break;
        case 'clang': burst(psSpark, ex, ey, 8, '#ffffff', 3.5, { size: 0.35, life: 0.25 }); break;
        case 'rest': burst(psPuff, ex, ey - BR * 0.8, 8, '#d6cdbd', 2, { size: 0.9, life: 0.6, grow: 1.5, a: 0.45 }); break;
        case 'swoop': burst(psPuff, ex, ey, 8, '#cbd5e1', 2.5, { size: 0.9, life: 0.5, grow: 1.4, a: 0.5 }); break;
        case 'boss_happy': burst(psSpark, ex, ey, 60, SPARK.concat(['#f9a8d4', '#86efac']), 9, { size: 0.7, life: 1.1, grav: 4 }); shake(0.4, 0.2); flashK = 0.6; break;
        case 'bolt': if (o) makeBolt(X(o.fromX), Y(o.fromY) - BR * 0.5, ex, ey); flashK = 1; shake(0.3, 0.25);
          burst(psSpark, ex, ey + 0.1, 26, SPARK, 7, { size: 0.55, life: 0.5, grav: 8, up: 3 }); burst(psPuff, ex, ey + 0.2, 6, '#6b7280', 1.5, { size: 0.9, life: 0.8, grow: 1.5, a: 0.5, up: 1 }); break;
      }
    }
    function fightFrame(st, dt, clock) {
      const F = st.fight; if (!F) return;
      if (!heldG && !(F.weapon || F.shots.length || F.locked || F.autoRock || F.boss)) return;
      if (!heldG) fightInit();
      const play = st.mode === 'play', hb = st.hero;
      // đống đá tự có cạnh Start (màn có boss mà Bon chưa đặt vũ khí)
      if (F.autoRock) { if (!autoRockN) { autoRockN = BUILDERS.rocks(); LG.add(autoRockN.group); } autoRockN.group.visible = true; autoRockN.gx = F.autoRock.x; autoRockN.group.position.set(F.autoRock.x, ROWS - F.autoRock.y, 0); autoRockN.update(st); }
      else if (autoRockN) autoRockN.group.visible = false;
      // món đang cầm: lơ lửng trước mặt baby
      heldG.visible = play && !!F.weapon && !(hb.ouchT > 0);
      if (heldG.visible) { for (const m of heldG.children) m.visible = m.userData.t === F.weapon; heldG.position.set(X(hb.x) + hb.dir * 0.8, Y(hb.y) + 0.12 + Math.sin(clock * 5) * 0.04, 0.55); heldG.scale.x = hb.dir < 0 ? -1 : 1; }
      // đạn lửa + đá ném
      let fi = 0, ri = 0;
      for (const s of F.shots) {
        if (s.k === 'fire') { const m = fireM[fi++]; if (!m) continue; m.visible = true; m.position.set(X(s.x), Y(s.y), 0.3); m.scale.setScalar(1 + Math.sin(clock * 30 + fi) * 0.12);
          const sg = Math.sign(s.vx); psAdd.add({ x: m.position.x - sg * (0.2 + Math.random() * 0.4), y: m.position.y + (Math.random() - 0.5) * 0.3, z: 0.3, vx: -sg * 2 + (Math.random() - 0.5), vy: 0.8 + Math.random() * 1.4, vz: Math.random() - 0.5, col: FIRE_COLS[fi % 3], size: 0.42, life: 0.3, a: 0.7 }); }
        else { const m = rockM[ri++]; if (!m) continue; m.visible = true; m.position.set(X(s.x), Y(s.y), 0.3); m.rotation.z -= dt * 9 * Math.sign(s.vx); m.rotation.x += dt * 5; }
      }
      for (; fi < fireM.length; fi++) fireM[fi].visible = false;
      for (; ri < rockM.length; ri++) rockM[ri].visible = false;
      // nhát chém
      slashM.visible = play && F.slashT > 0;
      if (slashM.visible) { const k = F.slashT / 0.22; slashM.position.set(X(hb.x), Y(hb.y), 0.6); slashM.rotation.set(0, F.slashDir > 0 ? 0 : Math.PI, -Math.PI * 0.375 - 0.6 + (1 - k) * 1.2); slashM.material.opacity = k; }
      // ổ khoá trên star (màn có boss, boss chưa thua)
      let starN = null; if (F.locked) for (const n of live) if (n.t === 'star') { starN = n; break; }
      lockG.visible = !!starN && starN.group.visible;
      if (lockG.visible) { lockG.position.set(starN.gx + 0.5, starN.gy - 0.5 + Math.sin(clock * 3 + starN.gx * 1.6) * 0.1, 0.55); lockG.rotation.y = Math.sin(clock * 1.6) * 0.3; }
      // boss
      stormK = F.storm || 0; if (flashK > 0) flashK = Math.max(0, flashK - dt * 2.6);
      // Đợt 4: mỗi loại boss 1 bộ hình, dựng lần đầu khi màn cần tới; bộ đồ nghề chung (mặt vẽ tay, mưa) lấy từ boss.js
      const bk = F.boss ? (F.boss.kind || 'thunder') : null; curKind = bk;
      if (F.boss && !bossKit && window.SFBoss) bossKit = window.SFBoss.create({ G: G, scene: scene, R: BR });
      if (bk === 'thunder' && !bossA && bossKit) { bossA = bossKit.build(); bossA.body.material.name = 'boss'; }
      if (bk === 'rock' && !rockA && bossKit && window.SFBossRock) rockA = window.SFBossRock.create({ G: G, scene: scene, R: BR, kit: bossKit }).build();
      if (bossA) drawBoss(bk === 'thunder' ? F.boss : null, F, st, dt, clock);
      if (rockA) drawRock(bk === 'rock' ? F.boss : null, F, st, dt, clock);
      curA = bk === 'thunder' ? bossA : bk === 'rock' ? rockA : null;
      dropFrame(F, st, dt, clock);
      // sét báo trước (vòng sáng trên đất) + tia sét
      for (const L of F.bolts) if (L.phase === 'warn') {
        let r = rings.get(L);
        if (!r) { r = new THREE.Group(); const mk = function (geo, col, op, side) { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: col, transparent: true, opacity: op, blending: THREE.AdditiveBlending, depthWrite: false, side: side || THREE.FrontSide })); m.material.userData.own = true; m.material.name = 'boltWarn'; r.add(m); return m; };
          r.userData = { ring: mk(W_GEO.ring, G.hdr(0xfff3a0, 2), 1, THREE.DoubleSide), disc: mk(W_GEO.disc, G.hdr(0xfff3a0, 1.5), 0.2), beam: mk(W_GEO.beam, G.hdr(0xfff7c2, 1.2), 0.1, THREE.DoubleSide) }; r.userData.disc.material.map = TEX.soft; r.userData.beam.position.y = 6;
          r.position.set(X(L.x), Y(L.y) + 0.09, 0); r.renderOrder = 4; FX3.add(r); rings.set(L, r); }
        const kk = 1 - L.warn / 0.85, pulse = 0.5 + 0.5 * Math.sin(clock * 25 * (0.5 + kk));
        r.userData.ring.scale.setScalar(1.5 - 0.5 * kk); r.userData.ring.material.opacity = (0.35 + 0.6 * pulse) * (0.3 + 0.7 * kk); r.userData.disc.material.opacity = 0.12 + 0.4 * kk * pulse; r.userData.beam.material.opacity = 0.04 + 0.12 * kk;
      }
      rings.forEach(function (r, L) { if (L.phase !== 'warn' || F.bolts.indexOf(L) < 0) { FX3.remove(r); disposeNode(r); rings.delete(L); } });
      for (let i = boltsG.length - 1; i >= 0; i--) { const b = boltsG[i]; b.t -= dt; const kk = clamp(b.t / 0.32, 0, 1) * (Math.random() < 0.2 ? 0.4 : 1); b.core.material.opacity = kk; b.halo.material.opacity = 0.5 * kk; if (b.t <= 0) { FX3.remove(b.g); disposeNode(b.g); boltsG.splice(i, 1); } }
      // bão: gió lay cỏ cây, mưa, sương xanh than, đèn dịu lại
      const wd = F.wind ? F.wind.dir * F.wind.str / 110 : 0;
      G.shared.uWind.value = wd * 0.6; G.shared.uGust.value = 0.3 + stormK * 0.9;
      if (stormK > 0.02 && !rainNear && bossKit) { rainNear = bossKit.makeRain(500, 3, 12, 1.15, 0.016, 0.7); rainFar = bossKit.makeRain(1100, -16, 2, 0.9, 0.013, 0.48); rainNear.name = rainFar.name = 'rain'; }
      if (rainNear) for (const rm of [rainNear, rainFar]) { rm.uniforms.uA.value = stormK > 0.1 ? stormK : 0; rm.uniforms.uCam.value.set(lookX, lookY); rm.uniforms.uSlant.value = 0.18 + wd * 0.35; }
      scene.fog.color.copy(fogDay).lerp(fogStorm, stormK * 0.8);
      hemi.intensity = 1.05 - 0.3 * stormK + flashK * 0.9; sun.intensity = 0.55 - 0.3 * stormK + flashK * 1.2;
      if (play && stormK > 0.2 && Math.random() < dt * 30 * stormK) { const rx = lookX + (Math.random() - 0.5) * 22; burst(psNorm, rx, Y(st.groundBelow(rx * CELL, 0)) + 0.05, 3, '#c9dcff', 1.6, { size: 0.12, life: 0.3, grav: 14, up: 1.6, z: (Math.random() - 0.3) * 5, a: 0.7 }); }
    }
    function fightInfo() { // cho bộ kiểm
      return { boss: curA ? [curA.root.position.x, curA.root.position.y, curA.root.visible ? 1 : 0, curA.face] : null, kind: curKind, sit: rockA ? rockA.sit || 0 : 0, lift: rockA ? rockA.lift || 0 : 0, vis: { thunder: !!bossA && bossA.root.visible, rock: !!rockA && rockA.root.visible },
        drops: dropN.size, dropFall: Array.from(dropN.values()).filter(n => n.rock.visible).length, loot: lootM.filter(m => m.visible).length, fire: fireM.filter(m => m.visible).length, rock: rockM.filter(m => m.visible).length,
        lock: lockG && lockG.visible ? 1 : 0, held: heldG && heldG.visible ? heldG.children.filter(m => m.visible).map(m => m.userData.t).join(',') : '', slash: slashM && slashM.visible ? 1 : 0,
        storm: stormK, flash: flashK, rings: rings.size, bolts: boltsG.length, autoRock: autoRockN && autoRockN.group.visible ? 1 : 0, rain: rainNear ? rainNear.uniforms.uA.value : 0 };
    }

    // ================= GÓC NHÌN + VẼ MỖI KHUNG =================
    // Build/Draw: nhìn THẲNG (ống kính rất hẹp, đứng thật xa → gần như phẳng): điểm (x, y) của game trên mặt z = 0 rơi đúng điểm ảnh như bản 2D.
    // Play: nghiêng + lại gần như bản mẫu đã duyệt, máy quay đi theo baby. Đổi mode = lia máy + đổi ống kính cùng lúc.
    const PLAY_DIST = 24, PLAY_UP = 3.6, PLAY_FOV = G.FOV, EXPOSURE = 0.9; // 11-14d trời mát: 0.92 → 0.9
    let viewK = 0, camPX = 16, camPY = 5.2, lastMode = '', frames = 0;
    let fpsAcc = 0, fpsN = 0, fpsShow = 0, quality = 3, qWarm = 6, qBad = 0, fpsLow = 999, dead = 0;
    const QAUTO = !!opt.autoQuality;
    function setQuality(q) {
      quality = clamp(q, 0, 3);
      grassK = [0.35, 0.35, 0.6, 1][quality]; grassSet.forEach(function (im) { im.count = Math.round(im.userData.fullN * grassK); });
      QI.forest.count = Math.round(QI.forestN * [0.5, 0.5, 1, 1][quality]);
      G.setScale([0.65, 0.75, 0.85, 1][quality]); G.setBloom(quality > 0);
      const sh = quality >= 2; if (sun.castShadow !== sh) { sun.castShadow = sh; scene.traverse(function (o) { if (o.material && o.receiveShadow) o.material.needsUpdate = true; }); }
      qWarm = 4; qBad = 0; fpsLow = 999;
    }
    function qualityTick(f) { // gọi mỗi nửa giây: không giữ nổi ~42 khung hình suốt 3 giây → hạ 1 nấc (chỉ hạ, không tăng lại để khỏi nhấp nháy)
      if (qWarm > 0) { qWarm--; return; }
      if (f < fpsLow) fpsLow = f;
      if (!QAUTO) return;
      if (quality > 0) { qBad = f < 42 ? qBad + 1 : 0; if (qBad >= 6) setQuality(quality - 1); }
      else { dead = f < 22 ? dead + 1 : 0; if (dead >= 10 && opt.onGiveUp) opt.onGiveUp('slow'); } // nấc thấp nhất vẫn giật → trả về hình 2D cũ
    }
    function frame(st) {
      if (!ready) return false;
      const dt = st.dt, clock = st.clock, hb = st.hero;
      fpsAcc += st.raw; fpsN++; if (fpsAcc >= 0.5) { fpsShow = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0; qualityTick(fpsShow); }
      G.shared.uTime.value = clock; G.shared.uHero.value.set(X(hb.x), Y(hb.y + RC), 0);
      for (const c of clouds) { c.position.x += c.userData.v * dt; if (c.position.x > lookX + 200) c.position.x -= 320; if (c.position.x < lookX - 120) c.position.x += 320; }
      for (const n of live) { if (n.update) n.update(st);
        if (n.fire && Math.abs(n.gx + n.obj.w / 2 - lookX) < 20 && Math.random() < dt * 5 * n.w) { // tàn lửa bay theo hướng MŨI ngọn lửa (dx, dy), rải dọc đế (px, py)
          const r = n.rot || 0, dx = r === 1 ? 1 : r === 3 ? -1 : 0, dy = r === 0 ? 1 : r === 2 ? -1 : 0, px = dy, py = -dx, s = (Math.random() - 0.5) * n.w, k = Math.random() * 0.3, sd = (Math.random() - 0.5) * 0.6, sp = 1.2 + Math.random() * 1.6;
          psAdd.add({ x: n.gx + n.obj.w / 2 + px * s + dx * k, y: n.gy - n.obj.h / 2 + py * s + dy * k, z: (Math.random() - 0.5) * 0.5, vx: dx * sp + px * sd, vy: dy * sp + py * sd, vz: 0, col: FIRE_COLS[Math.floor(Math.random() * 3)], size: 0.16 + Math.random() * 0.12, life: 0.7, a: 0.9 }); } }
      syncActors(st);
      fightFrame(st, dt, clock);
      // bụi nắng lơ lửng
      if (Math.random() < dt * 8) psSpark.add({ x: lookX + (Math.random() - 0.5) * 26, y: GY + 0.4 + Math.random() * 7, z: -3 + Math.random() * 5, vx: (Math.random() - 0.5) * 0.4, vy: 0.15 + Math.random() * 0.2, vz: 0, col: '#ffd98a', size: 0.12 + Math.random() * 0.12, life: 3, a: 0.6, fadeIn: true, spin: 0.5 });
      // máy quay
      const play = st.mode === 'play', flatX = (st.camX + WWPX / 2) / CELL;
      const flatY = HALF_ROWS - (st.camY || 0) / CELL; // nhìn thẳng (Build/Draw): giữa phần đang xem, kể cả khi đã cuộn lên màn cao
      if (play && lastMode !== 'play') { camPX = flatX; camPY = flatY; }
      lastMode = st.mode;
      const halfW = PLAY_DIST * Math.tan(PLAY_FOV * Math.PI / 360) * camera.aspect, edge = Math.min(halfW - 1, st.cols / 2);
      // dọc: màn 1 tầng như cũ (theo baby 3/4, trần +8 → ty tối đa 13.2); màn cao (Đợt 2) thì quá tầm đó máy quay đuổi nhanh hơn baby (×1.4)
      // tới khi baby nằm dưới tâm 1 ô (thấy được chỗ nhảy tiếp phía trên), dừng ở đỉnh màn
      const tx = clamp(X(hb.x) + 1.5, edge, Math.max(edge, st.cols - edge));
      const up = (st.rows || ROWS) - ROWS, dy = Y(hb.y) - 5.5, T3 = 32 / 3;
      const ty = 5.2 + clamp(dy < T3 ? dy * 0.75 : Math.min(8 + (dy - T3) * 1.4, dy + 1.3), 0, 8 + up);
      if (play) { camPX += (tx - camPX) * Math.min(1, dt * 5); camPY += (ty - camPY) * Math.min(1, dt * 4); }
      viewK = approach(viewK, play ? 1 : 0, dt * 2.6); const vk = viewK * viewK * (3 - 2 * viewK);
      let sx = 0, sy = 0; if (shakeT > 0) { shakeT -= dt; sx = (Math.random() - 0.5) * shakeAmp * 2; sy = (Math.random() - 0.5) * shakeAmp * 2; } else shakeAmp = 0;
      lookX = flatX + (camPX + sx * 0.5 - flatX) * vk; lookY = flatY + (camPY - flatY) * vk;
      const pdx = sx * 0.5, pdy = PLAY_UP + sy, pdl = Math.hypot(pdx, pdy, PLAY_DIST);
      let dxn = pdx / pdl * vk, dyn = pdy / pdl * vk, dzn = 1 + (PLAY_DIST / pdl - 1) * vk; const dl = Math.hypot(dxn, dyn, dzn); dxn /= dl; dyn /= dl; dzn /= dl;
      const fovDeg = FLAT_FOV + (PLAY_FOV - FLAT_FOV) * vk, halfH = HALF_ROWS + (pdl * Math.tan(PLAY_FOV * Math.PI / 360) - HALF_ROWS) * vk, dist = halfH / Math.tan(fovDeg * Math.PI / 360);
      camera.fov = fovDeg; camera.near = Math.max(0.5, dist - 60); camera.far = dist + 900; camera.updateProjectionMatrix();
      camera.position.set(lookX + dxn * dist, lookY + dyn * dist, dzn * dist); camera.lookAt(lookX, lookY, 0); camera.updateMatrixWorld();
      scene.fog.near = FOG_NEAR + dist - pdl; scene.fog.far = FOG_FAR + dist - pdl;
      sky.position.copy(camera.position); rays.position.copy(camera.position).addScaledVector(SUN_DIR, 300);
      skyU.uLift.value = 0.05 * (1 - vk); waterU.uCam.value.copy(camera.position);
      sun.position.set(lookX + 16, 30, 14); sun.target.position.set(lookX, 4, 0); sun.target.updateMatrixWorld();
      psScale = G.innerH() / (2 * Math.tan(camera.fov * Math.PI / 360));
      psAdd.update(dt); psSpark.update(dt); psNorm.update(dt); psPuff.update(dt);
      renderer.info.reset(); G.render({ time: clock, exposure: EXPOSURE * (1 - 0.25 * stormK), tilt: 0.55 * vk, storm: stormK, flash: flashK }); // bão: cả cảnh tối đi một phần tư
      frames++;
      return true;
    }
    // điểm (px, py) của game trên mặt z = 0 → vị trí trong khung vẽ (0..1 từ trái, 0..1 từ trên) — test dùng để so với bản 2D
    function project(px, py) { v3a.set(X(px), Y(py), 0).project(camera); return [v3a.x * 0.5 + 0.5, 0.5 - v3a.y * 0.5]; }
    // đếm tam giác đang nằm trong khung nhìn, chia theo chất liệu (để biết phần nào tốn máy)
    function census() {
      const fr = new THREE.Frustum().setFromProjectionMatrix(new THREE.Matrix4().multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)), out = {};
      scene.traverse(function (o) {
        if (!(o.isMesh || o.isPoints) || !o.geometry) return;
        let vis = true; for (let p = o; p; p = p.parent) if (!p.visible) vis = false; if (!vis) return;
        const g = o.geometry, n = (g.index ? g.index.count : g.attributes.position.count) / 3 * (o.isInstancedMesh ? o.count : 1);
        const name = (o.material && o.material.name) || (o.material && o.material.type) || '?', inF = !o.frustumCulled || fr.intersectsObject(o);
        const e = out[name] || (out[name] = { in: 0, out: 0, meshes: 0 }); if (inF) { e.in += Math.round(n); e.meshes++; } else e.out += Math.round(n);
      });
      return out;
    }
    function info() {
      const byT = {}; for (const n of live) byT[n.t] = (byT[n.t] || 0) + 1;
      let strokes = 0; lineMap.forEach(function (e) { if (e.mesh) strokes++; });
      return { ready: ready, frames: frames, viewK: viewK, objs: live.length, byType: byT, strokes: strokes, built: builtCount,
        nodes: live.map(n => [n.t, n.group.position.x, n.group.position.y, n.group.visible ? 1 : 0]), shown: { star: live.filter(n => n.t === 'star' && n.group.visible).length, wing: live.filter(n => n.t === 'wing' && n.group.visible).length },
        heroPos: heroA ? [heroA.root.position.x, heroA.root.position.y, heroA.root.visible ? 1 : 0] : null, hero: heroA ? heroA.made : null, enemies: enemyA.map(a => a ? a.made + '|' + a.n : null),
        fps: fpsShow, low: fpsLow > 900 ? null : Math.round(fpsLow * 10) / 10, q: quality, auto: QAUTO, scale: G.scale(), tris: renderer.info.render.triangles, calls: renderer.info.render.calls,
        look: [lookX, lookY], buf: [G.BW, G.BH], grass: (function () { let a = 0; grassSet.forEach(function (im) { a += im.count; }); return a; })(), ps: psAdd.count() + psNorm.count() + psSpark.count() + psPuff.count(), fight: fightInfo() };
    }

    opt.canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); ready = false; failed = 'lost'; if (opt.onGiveUp) opt.onGiveUp('lost'); });
    loadAll(function () { if (!opt.chars.every(id => TPL[id] && (TPL[id].body || TPL[id].idle))) { failed = 'glb'; if (opt.onGiveUp) opt.onGiveUp('glb'); return; } ready = !failed; if (opt.quality !== undefined && opt.quality !== null) setQuality(opt.quality); if (ready && opt.onReady) opt.onReady(); });

    soilMat.name = 'soil'; grassMat.name = 'grass'; boardMat.name = 'pine'; blobMat.name = 'treeShadow'; mountMat.name = 'mountain'; terrain.material.name = 'terrain'; QI.forest.material.name = 'farForest';
    groundMat.name = 'groundTop'; rockMat.name = 'rock'; flowerMat.name = 'flower'; daisyMat.name = 'daisy'; rootMat.name = 'root'; strokeMat.name = 'stroke'; innerMat.name = 'inner'; skyMat.name = 'sky'; waterMat.name = 'water'; waterFrontMat.name = 'waterFront'; flameMat.name = 'flame';
    // cho bộ kiểm: hộp bao (đơn vị ô, trục y hướng lên) của từng cụm loại t — để biết gai/lửa xoay có nằm đúng ô, đúng chiều không
    // (bỏ qua quầng sáng: ảnh phẳng luôn quay về máy quay, cố ý to hơn món)
    function boxes(t) { return live.filter(n => n.t === t).map(function (n) {
      const b = new THREE.Box3(), gb = new THREE.Box3(); n.group.updateWorldMatrix(true, true);
      n.group.traverse(function (c) { if (c.isMesh && c.geometry) { if (!c.geometry.boundingBox) c.geometry.computeBoundingBox(); gb.copy(c.geometry.boundingBox).applyMatrix4(c.matrixWorld); b.union(gb); } });
      return [b.min.x, b.min.y, b.max.x, b.max.y]; }); }
    return { census: census, frame: frame, syncLevel: syncLevel, event: event, project: project, info: info, setQuality: setQuality, boxes: boxes, isReady: function () { return ready; }, isFlat: function () { return viewK < 0.02; } };
  }
  return { create: create };
})();
