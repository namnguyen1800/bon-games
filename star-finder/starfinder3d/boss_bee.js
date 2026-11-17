// Đợt 4 — boss ONG CHÚA (Queen Bee): ong tròn kiểu thú bông, vàng sọc đen, 2 cánh trong suốt, vương miện vàng nhỏ, 2 râu, ôm 1 tổ ong nâu ở dưới bụng;
// mặt vẽ tay mượn bộ 13 mặt của Vua Sấm (boss.js → faceCanvases). Kèm hình 1 chú ong nhỏ (đàn ong bay ra = 3 chú này).
// Chỉ dựng hình. Cách diễn (bay / tổ rung / thả đàn ong / ôm tổ nghỉ / mừng) nằm ở world.js → drawBee. Viết tay (khác boss.js là file sinh tự động).
window.SFBossBee = (function () {
  function create(o) { // o: { G, scene, R (bán kính thân, tính bằng ô), kit (SFBoss.create(...) — để mượn faceCanvases + TEX.z) }
    const G = o.G, scene = o.scene, R = o.R, kit = o.kit, BGU = THREE.BufferGeometryUtils, TEX = G.TEX;
    // 1 cục tròn mềm sọc ngang: vàng / đen theo độ cao (stripes = số sọc đen), sọc hơi gợn cho đỡ cứng
    function blob(r, detail, seed, stripes) {
      let g = new THREE.IcosahedronGeometry(r, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = BGU.mergeVertices(g);
      const p = g.attributes.position, cl = new Float32Array(p.count * 3), v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i); const n = v.clone().normalize();
        const f = G.vnoise(n.x * 3 + seed, n.z * 3 - seed);
        v.addScaledVector(n, (f - 0.5) * 0.02 * r); p.setXYZ(i, v.x, v.y, v.z);
        const band = stripes ? Math.sin((n.y + 0.06 * Math.sin(n.x * 6)) * Math.PI * stripes) : 1;
        const dark = stripes && band > 0.55 && n.y < 0.62 ? 1 : 0;   // sọc đen, chừa đỉnh đầu vàng
        const k = 0.92 + f * 0.14;
        cl[i * 3] = (dark ? 0.13 : 0.99) * k; cl[i * 3 + 1] = (dark ? 0.12 : 0.8) * k; cl[i * 3 + 2] = (dark ? 0.16 : 0.18) * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.computeVertexNormals(); return g;
    }
    const wingMat = new THREE.MeshStandardMaterial({ color: 0xe0f2fe, transparent: true, opacity: 0.55, roughness: 0.2, metalness: 0.1, side: THREE.DoubleSide, depthWrite: false });
    function wing(len) { const m = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), wingMat); m.scale.set(len, len * 0.55, len * 0.08); return m; }
    function build() {
      const root = new THREE.Group(), wob = new THREE.Group(); root.add(wob);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.75, metalness: 0, envMapIntensity: 0.3 });
      bodyMat.name = 'boss';
      const body = new THREE.Mesh(blob(0.95 * R, 4, 1.7, 2.6), bodyMat); body.castShadow = true; wob.add(body);
      // mặt: 2 lớp vẽ trên chỏm cầu ôm sát mặt trước (giống các boss khác)
      const faceGeo = new THREE.SphereGeometry(0.985 * R, 48, 32, Math.PI / 2 - 0.9, 1.8, Math.PI / 2 - 0.78, 1.5);
      const FACE = {}; for (const f of kit.FACES) FACE[f] = kit.faceCanvases(f);
      const paintMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.paint, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const glowMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.glow, color: G.hdr(0xffffff, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
      const paint = new THREE.Mesh(faceGeo, paintMat), glw = new THREE.Mesh(faceGeo, glowMat); paint.renderOrder = 7; glw.renderOrder = 8; wob.add(paint); wob.add(glw);
      // 2 cánh trong suốt sau lưng (đập nhanh khi bay), gốc cánh ở vai
      const wings = [-1, 1].map(function (s) { const g = new THREE.Group(); g.position.set(s * 0.45 * R, 0.55 * R, -0.45 * R); const w = wing(0.62 * R); w.position.set(s * 0.55 * R, 0.2 * R, 0); g.add(w); wob.add(g); return g; });
      // vương miện vàng nhỏ + 2 râu cong
      const gold = new THREE.MeshStandardMaterial({ color: 0xfacc15, emissive: 0x5a3a00, emissiveIntensity: 0.4, roughness: 0.3, metalness: 0.6 });
      const crown = new THREE.Group(); crown.position.set(0, 0.98 * R, 0.05 * R); wob.add(crown);
      const band = new THREE.Mesh(new THREE.CylinderGeometry(0.24 * R, 0.27 * R, 0.13 * R, 20, 1, true), gold); band.material.side = THREE.DoubleSide; crown.add(band);
      for (let i = 0; i < 5; i++) { const a = i / 5 * Math.PI * 2, c = new THREE.Mesh(new THREE.ConeGeometry(0.06 * R, 0.17 * R, 6), gold); c.position.set(Math.cos(a) * 0.24 * R, 0.14 * R, Math.sin(a) * 0.24 * R); crown.add(c); }
      const black = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 });
      const antennae = [-1, 1].map(function (s) {
        const g = new THREE.Group(); g.position.set(s * 0.32 * R, 0.82 * R, 0.35 * R); wob.add(g);
        const st = new THREE.Mesh(new THREE.CylinderGeometry(0.025 * R, 0.025 * R, 0.4 * R, 6), black); st.position.y = 0.2 * R; st.rotation.z = -s * 0.35; g.add(st);
        const tip = new THREE.Mesh(new THREE.SphereGeometry(0.07 * R, 10, 8), black); tip.position.set(s * 0.14 * R, 0.4 * R, 0); g.add(tip);
        return g;
      });
      // tổ ong ôm dưới bụng: mấy vòng nâu cam chồng lên nhau, lỗ tổ sẫm ở mặt trước
      const hiveMat = new THREE.MeshStandardMaterial({ color: 0xc97a1a, roughness: 0.7, emissive: 0x3a1800, emissiveIntensity: 0.2 });
      const hive = new THREE.Group(); hive.position.set(0, -0.86 * R, 0.55 * R); wob.add(hive);
      for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.TorusGeometry((0.26 - Math.abs(i - 1.3) * 0.06) * R, 0.09 * R, 10, 22), hiveMat); t.rotation.x = Math.PI / 2; t.position.y = (0.18 - i * 0.12) * R; t.castShadow = true; hive.add(t); }
      const plug = new THREE.Mesh(new THREE.SphereGeometry(0.22 * R, 14, 10), hiveMat); plug.scale.y = 1.3; hive.add(plug);
      const door = new THREE.Mesh(new THREE.CircleGeometry(0.075 * R, 14), new THREE.MeshBasicMaterial({ color: 0x2a1405 })); door.position.set(0, -0.04 * R, 0.29 * R); hive.add(door);
      // 2 tay nhỏ ôm tổ
      const arms = [-1, 1].map(function (s, k) { const g = new THREE.Group(); g.position.set(s * 0.6 * R, -0.45 * R, 0.5 * R); const h = new THREE.Mesh(blob(0.14 * R, 2, 9 + k, 0), bodyMat); h.position.set(-s * 0.1 * R, -0.18 * R, 0.05 * R); h.castShadow = true; g.add(h); wob.add(g); return g; });
      root.visible = false; scene.add(root);
      const zs = [0, 1, 2].map(function () { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.z, transparent: true, depthWrite: false })); s.renderOrder = 9; root.add(s); return s; });
      return { kind: 'bee', root: root, wob: wob, body: body, mat: bodyMat, paint: paintMat, glow: glowMat, FACE: FACE, face: 'grumpy', wings: wings, antennae: antennae, arms: arms, hive: hive, hiveMat: hiveMat, crown: crown, zs: zs, R: R };
    }
    // 1 chú ong nhỏ (cho đàn ong): thân sọc + 2 cánh, cỡ ~0.5 ô
    function buildMini() {
      const g = new THREE.Group(), mat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.7 });
      const b = new THREE.Mesh(blob(0.22, 2, 3.3, 1.6), mat); b.scale.set(1.25, 1, 1); b.castShadow = true; g.add(b);
      const ws = [-1, 1].map(function (s) { const w = wing(0.18); w.position.set(0, 0.2, -0.05); w.rotation.y = s * 0.6; g.add(w); return w; });
      g.userData.wings = ws; return g;
    }
    return { build: build, buildMini: buildMini };
  }
  return { create: create };
})();
