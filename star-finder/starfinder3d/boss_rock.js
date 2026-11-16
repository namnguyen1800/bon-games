// Đợt 4 — boss NGƯỜI ĐÁ (Rock Giant): tảng đá tròn kiểu thú bông, rêu + 1 bông hoa trên đầu, 2 tay 2 chân cục đá, mặt vẽ tay mượn bộ 13 mặt của Vua Sấm (boss.js → faceCanvases).
// Chỉ dựng hình. Cách diễn (đi / nhấc chân / dậm / ngồi xoa chân / mừng) nằm ở world.js → drawRock. Viết tay (khác boss.js là file sinh tự động).
window.SFBossRock = (function () {
  const TAU = Math.PI * 2;
  function create(o) { // o: { G, scene, R (bán kính thân, tính bằng ô), kit (SFBoss.create(...) — để mượn faceCanvases + TEX.z) }
    const G = o.G, scene = o.scene, R = o.R, kit = o.kit, BGU = THREE.BufferGeometryUtils, TEX = G.TEX;
    // 1 cục đá sần: hình cầu méo theo nhiễu, màu theo đỉnh (đá ấm + vệt sẫm + rêu ở mặt hướng lên)
    function lump(r, detail, seed, moss, bumps) {
      let g = new THREE.IcosahedronGeometry(r, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = BGU.mergeVertices(g);
      const p = g.attributes.position, cl = new Float32Array(p.count * 3), v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i); const n = v.clone().normalize();
        const f = (G.vnoise(n.x * 2.6 + seed, n.y * 2.6) + G.vnoise(n.y * 4.1 + 3, n.z * 4.1 + seed) * 0.6) / 1.6;
        v.addScaledVector(n, (f - 0.5) * 2 * bumps * r); p.setXYZ(i, v.x, v.y, v.z);
        const crack = G.vnoise(n.x * 9 + seed, n.z * 9 - seed) < 0.22 ? 0.72 : 1; // vệt nứt sẫm
        let c0 = 0.56 + f * 0.16, c1 = 0.51 + f * 0.14, c2 = 0.45 + f * 0.12; // đá xám ấm
        const m = moss ? Math.min(1, Math.max(0, (n.y - 0.42 + (G.vnoise(n.x * 5 + seed, n.z * 5) - 0.5) * 0.5) * 3.5)) : 0;
        c0 = (c0 * (1 - m) + 0.34 * m) * crack; c1 = (c1 * (1 - m) + 0.78 * m) * crack; c2 = (c2 * (1 - m) + 0.22 * m) * crack; // rêu sáng hơn để còn xanh sau khi nhân màu đá
        cl[i * 3] = c0; cl[i * 3 + 1] = c1; cl[i * 3 + 2] = c2;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.computeVertexNormals(); return g;
    }
    function build() {
      const root = new THREE.Group(), wob = new THREE.Group(); root.add(wob); wob.position.y = 0.25 * R;
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0x9c8f7e, vertexColors: true, roughness: 0.95, metalness: 0, envMapIntensity: 0.25 }); // 11-15: trắng 0xffffff nhìn như mây → màu đá ấm
      bodyMat.name = 'boss';
      // thân: 1 cục to ở giữa (mặt nằm phía trước, nhẵn hơn) + vài cục nhỏ dính quanh vai / lưng
      const geos = [lump(0.95 * R, 4, 1.3, true, 0.03)];
      for (const q of [[-0.62, 0.45, -0.3, 0.46], [0.6, 0.5, -0.32, 0.44], [0, 0.7, -0.45, 0.42], [-0.75, -0.2, -0.35, 0.4], [0.78, -0.22, -0.35, 0.4]]) {
        const g = lump(q[3] * R, 3, q[0] * 7 + q[1] * 3, true, 0.08); g.translate(q[0] * R, q[1] * R, q[2] * R); geos.push(g);
      }
      const body = new THREE.Mesh(BGU.mergeBufferGeometries(geos), bodyMat); body.castShadow = true; wob.add(body);
      // mặt: 2 lớp vẽ trên chỏm cầu ôm sát mặt trước của cục giữa (giống Vua Sấm)
      const faceGeo = new THREE.SphereGeometry(0.985 * R, 48, 32, Math.PI / 2 - 0.9, 1.8, Math.PI / 2 - 0.78, 1.5);
      const FACE = {}; for (const f of kit.FACES) FACE[f] = kit.faceCanvases(f);
      const paintMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.paint, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const glowMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.glow, color: G.hdr(0xffffff, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
      const paint = new THREE.Mesh(faceGeo, paintMat), glw = new THREE.Mesh(faceGeo, glowMat); paint.renderOrder = 7; glw.renderOrder = 8; wob.add(paint); wob.add(glw);
      // tóc rêu: vài cọng cỏ + 1 bông hoa vàng trên đỉnh đầu (lắc lư theo nhịp đi)
      const top = new THREE.Group(); top.position.set(0.05 * R, 0.9 * R, 0.05 * R); wob.add(top);
      const grassMat = new THREE.MeshStandardMaterial({ color: 0x5f9a3a, roughness: 0.8 });
      for (let i = 0; i < 7; i++) { const c = new THREE.Mesh(new THREE.ConeGeometry(0.05 * R, 0.32 * R, 5), grassMat); const a = i / 7 * TAU; c.position.set(Math.cos(a) * 0.16 * R, 0.1 * R, Math.sin(a) * 0.16 * R); c.rotation.set(Math.sin(a) * 0.4, 0, -Math.cos(a) * 0.4); top.add(c); }
      const flower = new THREE.Group(); flower.position.set(0.12 * R, 0.3 * R, 0.1 * R); top.add(flower);
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.018 * R, 0.018 * R, 0.3 * R, 6), grassMat); stem.position.y = -0.1 * R; flower.add(stem);
      const petalMat = new THREE.MeshStandardMaterial({ color: 0xfff1a8, roughness: 0.55, emissive: 0x3a2a00, emissiveIntensity: 0.3 });
      for (let i = 0; i < 6; i++) { const pt = new THREE.Mesh(new THREE.SphereGeometry(0.07 * R, 10, 8), petalMat); const a = i / 6 * TAU; pt.position.set(Math.cos(a) * 0.08 * R, 0.06 * R, Math.sin(a) * 0.08 * R); pt.scale.set(1, 0.45, 1); flower.add(pt); }
      const mid = new THREE.Mesh(new THREE.SphereGeometry(0.055 * R, 10, 8), new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.6 })); mid.position.y = 0.08 * R; flower.add(mid);
      // tay: cục đá to, xoay quanh vai
      const arms = [-1, 1].map(function (s, k) {
        const sh = new THREE.Group(); sh.position.set(s * 0.82 * R, 0.15 * R, 0.1 * R); wob.add(sh);
        const fist = new THREE.Mesh(lump(0.34 * R, 3, 9 + k * 5, false, 0.1), bodyMat); fist.position.set(s * 0.2 * R, -0.42 * R, 0.08 * R); fist.castShadow = true; sh.add(fist);
        return sh;
      });
      // chân: 2 cục ngắn, gắn vào root (thân ngồi xuống được mà chân vẫn chạm đất)
      const legs = [-1, 1].map(function (s, k) {
        const hip = new THREE.Group(); hip.position.set(s * 0.42 * R, -0.62 * R, 0.05 * R); root.add(hip);
        const foot = new THREE.Mesh(lump(0.3 * R, 3, 21 + k * 4, false, 0.08), bodyMat); foot.scale.set(1.15, 0.85, 1.2); foot.position.y = -0.12 * R; foot.castShadow = true; hip.add(foot);
        return hip;
      });
      root.visible = false; scene.add(root);
      const zs = [0, 1, 2].map(function () { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.z, transparent: true, depthWrite: false })); s.renderOrder = 9; root.add(s); return s; });
      return { kind: 'rock', root: root, wob: wob, body: body, mat: bodyMat, paint: paintMat, glow: glowMat, FACE: FACE, face: 'grumpy', arms: arms, legs: legs, top: top, flower: flower, zs: zs, R: R, wobHome: wob.position.y };
    }
    return { build: build };
  }
  return { create: create };
})();
