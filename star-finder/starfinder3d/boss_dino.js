// Đợt 4 — boss KHỦNG LONG LỐC XOÁY (Twister Dino): khủng long tròn kiểu thú bông, xanh lá, bụng kem, hàng gai cam trên lưng, đuôi mập, 2 tay tí hon, 2 chân;
// mặt vẽ tay mượn bộ 13 mặt của Vua Sấm (boss.js → faceCanvases). Chỉ dựng hình. Cách diễn (đi / lấy đà / xoay tít / chóng mặt / mừng) nằm ở world.js → drawDino.
// Viết tay (khác boss.js là file sinh tự động).
window.SFBossDino = (function () {
  function create(o) { // o: { G, scene, R (bán kính thân, tính bằng ô), kit (SFBoss.create(...) — để mượn faceCanvases + TEX.z) }
    const G = o.G, scene = o.scene, R = o.R, kit = o.kit, BGU = THREE.BufferGeometryUtils, TEX = G.TEX;
    const c01 = function (v) { return Math.min(1, Math.max(0, v)); };
    // 1 cục tròn mềm: hình cầu gợn rất nhẹ, màu theo đỉnh. belly = có mảng bụng kem ở mặt trước-dưới
    function blob(r, detail, seed, belly) {
      let g = new THREE.IcosahedronGeometry(r, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = BGU.mergeVertices(g);
      const p = g.attributes.position, cl = new Float32Array(p.count * 3), v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i); const n = v.clone().normalize();
        const f = G.vnoise(n.x * 3 + seed, n.y * 3 - seed);
        v.addScaledVector(n, (f - 0.5) * 0.03 * r); p.setXYZ(i, v.x, v.y, v.z);
        const b = belly ? c01((n.z - 0.2) * 2.4) * c01((-n.y - 0.12) * 3.2) : 0;          // bụng kem
        const spot = !b && n.z < 0.35 && G.vnoise(n.x * 7 + seed, n.y * 7 + n.z * 5) > 0.7 ? 0.78 : 1; // đốm sẫm ở lưng / hông
        const k = (0.88 + f * 0.18) * spot * (0.88 + 0.12 * n.y);                      // lưng trên sáng hơn chút
        cl[i * 3] = (0.2 * (1 - b) + 0.98 * b) * k; cl[i * 3 + 1] = (0.66 * (1 - b) + 0.92 * b) * k; cl[i * 3 + 2] = (0.28 * (1 - b) + 0.62 * b) * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.computeVertexNormals(); return g;
    }
    function build() {
      const root = new THREE.Group(), wob = new THREE.Group(); root.add(wob); wob.position.y = 0.25 * R;
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xd8e2d4, vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.25 });
      bodyMat.name = 'boss';
      const body = new THREE.Mesh(blob(0.95 * R, 4, 2.1, true), bodyMat); body.castShadow = true; wob.add(body);
      // mặt: 2 lớp vẽ trên chỏm cầu ôm sát mặt trước (giống Vua Sấm / Người Đá)
      const faceGeo = new THREE.SphereGeometry(0.985 * R, 48, 32, Math.PI / 2 - 0.9, 1.8, Math.PI / 2 - 0.78, 1.5);
      const FACE = {}; for (const f of kit.FACES) FACE[f] = kit.faceCanvases(f);
      const paintMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.paint, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const glowMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.glow, color: G.hdr(0xffffff, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
      const paint = new THREE.Mesh(faceGeo, paintMat), glw = new THREE.Mesh(faceGeo, glowMat); paint.renderOrder = 7; glw.renderOrder = 8; wob.add(paint); wob.add(glw);
      // hàng gai cam: 5 cái xoè ngang trên đỉnh đầu như cái mào (nhìn thẳng thấy đủ cả 5 — 11-15: xếp dọc ra sau lưng thì nhìn thẳng chỉ thấy 1 cái), cái giữa to nhất
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6, emissive: 0x4a1a00, emissiveIntensity: 0.3 });
      const spikes = [0, 1, 2, 3, 4].map(function (i) {
        const a = (i - 2) * 0.36, k = 1 - Math.abs(i - 2) * 0.17;
        const c = new THREE.Mesh(new THREE.ConeGeometry(0.17 * R * k, 0.46 * R * k, 7), spikeMat);
        c.position.set(Math.sin(a) * 1.04 * R, Math.cos(a) * 1.04 * R, -0.05 * R); c.rotation.z = -a; c.castShadow = true; wob.add(c); return c;
      });
      // đuôi mập: 2 cục thon dần, chìa sang bên (nhìn từ trước vẫn thấy), vẫy được
      const tail = new THREE.Group(); tail.position.set(-0.62 * R, -0.42 * R, -0.3 * R); wob.add(tail);
      const t1 = new THREE.Mesh(blob(0.4 * R, 3, 5.2, false), bodyMat); t1.scale.set(1.5, 0.8, 0.8); t1.position.set(-0.32 * R, 0, 0); t1.castShadow = true; tail.add(t1);
      const t2 = new THREE.Mesh(blob(0.24 * R, 3, 7.7, false), bodyMat); t2.scale.set(1.7, 0.75, 0.75); t2.position.set(-0.86 * R, 0.1 * R, 0); t2.rotation.z = -0.35; t2.castShadow = true; tail.add(t2);
      // tay tí hon (kiểu khủng long bạo chúa), xoay quanh vai
      const arms = [-1, 1].map(function (s, k) {
        const sh = new THREE.Group(); sh.position.set(s * 0.66 * R, -0.02 * R, 0.56 * R); wob.add(sh);
        const hand = new THREE.Mesh(blob(0.17 * R, 2, 11 + k * 3, false), bodyMat); hand.scale.set(0.85, 1.25, 0.85); hand.position.set(s * 0.08 * R, -0.16 * R, 0.12 * R); hand.castShadow = true; sh.add(hand);
        return sh;
      });
      // chân: 2 bàn chân to, gắn vào root (thân ngồi xuống được mà chân vẫn chạm đất)
      const legs = [-1, 1].map(function (s, k) {
        const hip = new THREE.Group(); hip.position.set(s * 0.42 * R, -0.62 * R, 0.05 * R); root.add(hip);
        const foot = new THREE.Mesh(blob(0.3 * R, 3, 21 + k * 4, false), bodyMat); foot.scale.set(1.15, 0.8, 1.4); foot.position.set(0, -0.12 * R, 0.08 * R); foot.castShadow = true; hip.add(foot);
        return hip;
      });
      root.visible = false; scene.add(root);
      const zs = [0, 1, 2].map(function () { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.z, transparent: true, depthWrite: false })); s.renderOrder = 9; root.add(s); return s; });
      return { kind: 'dino', root: root, wob: wob, body: body, mat: bodyMat, paint: paintMat, glow: glowMat, FACE: FACE, face: 'grumpy', arms: arms, legs: legs, tail: tail, spikes: spikes, zs: zs, R: R, wobHome: wob.position.y };
    }
    return { build: build };
  }
  return { create: create };
})();
