// Đợt 4 — boss RỒNG DUNG NHAM (Lava Dragon): rồng tròn kiểu thú bông — lưng đỏ cam có vảy sẫm, bụng vàng (phát sáng khi sắp phun lửa), 2 sừng kem,
// 2 cánh nhỏ, đuôi mập có gai, 2 chân. Mặt vẽ tay mượn bộ 13 mặt của Vua Sấm (boss.js → faceCanvases).
// Chỉ dựng hình. Cách diễn (đi / bụng sáng / phun lửa / ho khói cúi đầu nghỉ / mừng) nằm ở world.js → drawDragon. Viết tay (khác boss.js là file sinh tự động).
window.SFBossDragon = (function () {
  function create(o) { // o: { G, scene, R (bán kính thân, tính bằng ô), kit (SFBoss.create(...) — để mượn faceCanvases + TEX.z) }
    const G = o.G, scene = o.scene, R = o.R, kit = o.kit, BGU = THREE.BufferGeometryUtils, TEX = G.TEX;
    const c01 = function (v) { return Math.min(1, Math.max(0, v)); };
    // 1 cục tròn mềm màu theo đỉnh: đỏ cam + vảy sẫm; belly = mảng bụng vàng ở mặt trước-dưới (để riêng 1 vật liệu sáng được nên ở đây chỉ tô nhạt)
    function blob(r, detail, seed, scales) {
      let g = new THREE.IcosahedronGeometry(r, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = BGU.mergeVertices(g);
      const p = g.attributes.position, cl = new Float32Array(p.count * 3), v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i); const n = v.clone().normalize();
        const f = G.vnoise(n.x * 3 + seed, n.y * 3 - seed);
        v.addScaledVector(n, (f - 0.5) * 0.03 * r); p.setXYZ(i, v.x, v.y, v.z);
        const sc = scales && Math.sin(n.x * 18 + seed) * Math.sin(n.y * 18 + n.z * 9) > 0.6 ? 0.78 : 1, k = (0.9 + f * 0.16) * sc;
        cl[i * 3] = 0.86 * k; cl[i * 3 + 1] = (0.24 + c01(n.y) * 0.08) * k; cl[i * 3 + 2] = 0.12 * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.computeVertexNormals(); return g;
    }
    function build() {
      const root = new THREE.Group(), wob = new THREE.Group(); root.add(wob); wob.position.y = 0.2 * R;
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.7, metalness: 0, envMapIntensity: 0.3 });
      bodyMat.name = 'boss';
      const body = new THREE.Mesh(blob(0.95 * R, 4, 5.3, true), bodyMat); body.castShadow = true; wob.add(body);
      // bụng vàng: chỏm cầu sát mặt trước-dưới, vật liệu riêng để phát sáng
      const bellyMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, emissive: 0xff7a00, emissiveIntensity: 0, roughness: 0.6 });
      const belly = new THREE.Mesh(new THREE.SphereGeometry(0.965 * R, 32, 20, Math.PI / 2 - 0.62, 1.24, Math.PI / 2 + 0.28, 0.85), bellyMat); wob.add(belly);
      // mặt: 2 lớp vẽ trên chỏm cầu ôm sát mặt trước (giống các boss khác)
      const faceGeo = new THREE.SphereGeometry(0.985 * R, 48, 32, Math.PI / 2 - 0.9, 1.8, Math.PI / 2 - 0.78, 1.5);
      const FACE = {}; for (const f of kit.FACES) FACE[f] = kit.faceCanvases(f);
      const paintMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.paint, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const glowMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.glow, color: G.hdr(0xffffff, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
      const paint = new THREE.Mesh(faceGeo, paintMat), glw = new THREE.Mesh(faceGeo, glowMat); paint.renderOrder = 7; glw.renderOrder = 8; wob.add(paint); wob.add(glw);
      // 2 sừng kem cong ra sau
      const hornMat = new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.5 });
      for (const s of [-1, 1]) { const h = new THREE.Mesh(new THREE.ConeGeometry(0.12 * R, 0.45 * R, 10), hornMat); h.position.set(s * 0.42 * R, 0.86 * R, -0.12 * R); h.rotation.set(-0.45, 0, -s * 0.4); h.castShadow = true; wob.add(h); }
      // gai lưng nhỏ màu cam sẫm
      const spikeMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.6 });
      for (let i = 0; i < 4; i++) { const a = 0.35 + i * 0.4, c = new THREE.Mesh(new THREE.ConeGeometry(0.09 * R, 0.24 * R, 6), spikeMat); c.position.set(0, Math.cos(a) * 0.97 * R, -Math.sin(a) * 0.97 * R); c.rotation.x = -a; wob.add(c); }
      // 2 cánh nhỏ dạng màng (2 lớp dẹt), gốc ở sau vai
      const wingMat = new THREE.MeshStandardMaterial({ color: 0xf97316, roughness: 0.6, side: THREE.DoubleSide });
      const wings = [-1, 1].map(function (s) { const g = new THREE.Group(); g.position.set(s * 0.55 * R, 0.4 * R, -0.5 * R); const w = new THREE.Mesh(new THREE.CircleGeometry(0.55 * R, 3), wingMat); w.position.set(s * 0.35 * R, 0.2 * R, 0); w.rotation.set(0, s * 0.5, s * 0.6); w.castShadow = true; g.add(w); wob.add(g); return g; });
      // đuôi mập chìa sang bên
      const tail = new THREE.Group(); tail.position.set(-0.65 * R, -0.45 * R, -0.3 * R); wob.add(tail);
      const t1 = new THREE.Mesh(blob(0.36 * R, 3, 7.1, false), bodyMat); t1.scale.set(1.6, 0.75, 0.75); t1.position.set(-0.3 * R, 0, 0); t1.castShadow = true; tail.add(t1);
      const tt = new THREE.Mesh(new THREE.ConeGeometry(0.14 * R, 0.3 * R, 4), spikeMat); tt.position.set(-0.85 * R, 0.08 * R, 0); tt.rotation.z = Math.PI / 2 + 0.3; tail.add(tt);
      // 2 chân
      const legs = [-1, 1].map(function (s, k) { const hip = new THREE.Group(); hip.position.set(s * 0.42 * R, -0.66 * R, 0.05 * R); root.add(hip); const foot = new THREE.Mesh(blob(0.3 * R, 3, 21 + k * 4, false), bodyMat); foot.scale.set(1.15, 0.8, 1.35); foot.position.set(0, -0.12 * R, 0.06 * R); foot.castShadow = true; hip.add(foot); return hip; });
      root.visible = false; scene.add(root);
      const zs = [0, 1, 2].map(function () { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.z, transparent: true, depthWrite: false })); s.renderOrder = 9; root.add(s); return s; });
      return { kind: 'dragon', root: root, wob: wob, body: body, mat: bodyMat, bellyMat: bellyMat, paint: paintMat, glow: glowMat, FACE: FACE, face: 'grumpy', wings: wings, tail: tail, legs: legs, zs: zs, R: R, wobHome: wob.position.y };
    }
    return { build: build };
  }
  return { create: create };
})();
