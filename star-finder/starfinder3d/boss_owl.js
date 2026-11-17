// Đợt 4 — boss CÚ BÓNG ĐÊM (Night Owl): cú tròn kiểu thú bông — lưng nâu ấm có vảy lông, bụng kem, 2 chỏm tai nhọn, 2 cánh xoè được, 2 chân cam;
// mặt vẽ tay mượn bộ 13 mặt của Vua Sấm (boss.js → faceCanvases). Chỉ dựng hình. Cách diễn (bay / kêu "hú" / lao xuống / xù lông nghỉ / mừng) nằm ở world.js → drawOwl.
// Viết tay (khác boss.js là file sinh tự động).
window.SFBossOwl = (function () {
  function create(o) { // o: { G, scene, R (bán kính thân, tính bằng ô), kit (SFBoss.create(...) — để mượn faceCanvases + TEX.z) }
    const G = o.G, scene = o.scene, R = o.R, kit = o.kit, BGU = THREE.BufferGeometryUtils, TEX = G.TEX;
    const c01 = function (v) { return Math.min(1, Math.max(0, v)); };
    // 1 cục tròn mềm màu theo đỉnh: nâu ấm + vảy lông sẫm; belly = mảng bụng kem ở mặt trước-dưới
    function blob(r, detail, seed, belly) {
      let g = new THREE.IcosahedronGeometry(r, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = BGU.mergeVertices(g);
      const p = g.attributes.position, cl = new Float32Array(p.count * 3), v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i); const n = v.clone().normalize();
        const f = G.vnoise(n.x * 3 + seed, n.y * 3 - seed);
        v.addScaledVector(n, (f - 0.5) * 0.03 * r); p.setXYZ(i, v.x, v.y, v.z);
        const b = belly ? c01((n.z - 0.15) * 2.4) * c01((-n.y + 0.05) * 2.6) : 0;
        const scal = Math.sin(n.x * 22 + seed) * Math.sin(n.y * 22) > 0.55 ? 0.8 : 1;   // vảy lông sẫm
        const k = (0.9 + f * 0.16) * scal;
        cl[i * 3] = (0.56 * (1 - b) + 0.97 * b) * k; cl[i * 3 + 1] = (0.4 * (1 - b) + 0.9 * b) * k; cl[i * 3 + 2] = (0.27 * (1 - b) + 0.76 * b) * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.computeVertexNormals(); return g;
    }
    function build() {
      const root = new THREE.Group(), wob = new THREE.Group(); root.add(wob);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.85, metalness: 0, envMapIntensity: 0.25 });
      bodyMat.name = 'boss';
      const body = new THREE.Mesh(blob(0.95 * R, 4, 2.9, true), bodyMat); body.castShadow = true; wob.add(body);
      // mặt: 2 lớp vẽ trên chỏm cầu ôm sát mặt trước (giống các boss khác)
      const faceGeo = new THREE.SphereGeometry(0.985 * R, 48, 32, Math.PI / 2 - 0.9, 1.8, Math.PI / 2 - 0.78, 1.5);
      const FACE = {}; for (const f of kit.FACES) FACE[f] = kit.faceCanvases(f);
      const paintMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.paint, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const glowMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.glow, color: G.hdr(0xffffff, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
      const paint = new THREE.Mesh(faceGeo, paintMat), glw = new THREE.Mesh(faceGeo, glowMat); paint.renderOrder = 7; glw.renderOrder = 8; wob.add(paint); wob.add(glw);
      // 2 chỏm tai nhọn (nghiêng ra ngoài), cùng màu lưng
      const tufts = [-1, 1].map(function (s, k) { const g = new THREE.Group(); g.position.set(s * 0.52 * R, 0.78 * R, -0.05 * R); g.rotation.z = -s * 0.42; const c = new THREE.Mesh(blobCone(0.17 * R, 0.5 * R), bodyMat); c.position.y = 0.2 * R; c.castShadow = true; g.add(c); wob.add(g); return g; });
      function blobCone(r, h) { const g = new THREE.ConeGeometry(r, h, 10, 2), cl = new Float32Array(g.attributes.position.count * 3); for (let i = 0; i < cl.length; i += 3) { cl[i] = 0.5; cl[i + 1] = 0.35; cl[i + 2] = 0.24; } g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); return g; } // chỏm tai: nón màu nâu sẫm (vật liệu thân dùng màu theo đỉnh)
      // 2 cánh: cục dẹt bám sườn, xoay quanh vai (bay thì đập, lao thì khép sát, nghỉ thì xù ra)
      const wings = [-1, 1].map(function (s, k) {
        const sh = new THREE.Group(); sh.position.set(s * 0.82 * R, 0.25 * R, -0.05 * R); wob.add(sh);
        const w = new THREE.Mesh(blob(0.42 * R, 3, 7 + k * 3, false), bodyMat); w.scale.set(0.45, 1.15, 0.8); w.position.set(s * 0.08 * R, -0.4 * R, 0); w.castShadow = true; sh.add(w);
        return sh;
      });
      // 2 chân cam, mỗi chân 3 ngón
      const footMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.55 });
      const legs = [-1, 1].map(function (s) {
        const hip = new THREE.Group(); hip.position.set(s * 0.3 * R, -0.9 * R, 0.25 * R); root.add(hip);
        for (const t of [-1, 0, 1]) { const toe = new THREE.Mesh(new THREE.SphereGeometry(0.07 * R, 10, 8), footMat); toe.scale.set(0.8, 0.7, 1.6); toe.position.set(t * 0.08 * R, -0.04 * R, 0.08 * R); toe.rotation.y = t * 0.4; hip.add(toe); }
        return hip;
      });
      root.visible = false; scene.add(root);
      const zs = [0, 1, 2].map(function () { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.z, transparent: true, depthWrite: false })); s.renderOrder = 9; root.add(s); return s; });
      return { kind: 'owl', root: root, wob: wob, body: body, mat: bodyMat, paint: paintMat, glow: glowMat, FACE: FACE, face: 'grumpy', wings: wings, tufts: tufts, legs: legs, zs: zs, R: R };
    }
    return { build: build };
  }
  return { create: create };
})();
