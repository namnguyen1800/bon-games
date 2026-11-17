// Đợt 4 — boss BẠCH TUỘC KHỔNG LỒ (Big Octopus): đầu tròn tím kiểu thú bông có đốm sáng, ngồi trong 1 BỒN GỖ có nước xanh (bồn là 1 phần hình của boss,
// không phải nước của màn), vài xúc tu ngắn vắt qua thành bồn + 1 xúc tu dài (chuỗi cục tròn có giác hút) để đập xuống đất.
// Mặt vẽ tay mượn bộ 13 mặt của Vua Sấm (boss.js → faceCanvases). Chỉ dựng hình. Cách diễn nằm ở world.js → drawOcto. Viết tay (khác boss.js là file sinh tự động).
window.SFBossOcto = (function () {
  function create(o) { // o: { G, scene, R (bán kính thân, tính bằng ô), kit (SFBoss.create(...) — để mượn faceCanvases + TEX.z) }
    const G = o.G, scene = o.scene, R = o.R, kit = o.kit, BGU = THREE.BufferGeometryUtils, TEX = G.TEX;
    // 1 cục tròn mềm màu theo đỉnh: tím + đốm sáng hồng nhạt
    function blob(r, detail, seed, spots) {
      let g = new THREE.IcosahedronGeometry(r, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = BGU.mergeVertices(g);
      const p = g.attributes.position, cl = new Float32Array(p.count * 3), v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i); const n = v.clone().normalize();
        const f = G.vnoise(n.x * 3 + seed, n.y * 3 - seed);
        v.addScaledVector(n, (f - 0.5) * 0.03 * r); p.setXYZ(i, v.x, v.y, v.z);
        const sp = spots && G.vnoise(n.x * 6 + seed, n.y * 6 + n.z * 4) > 0.74 ? 1 : 0, k = 0.9 + f * 0.16;
        cl[i * 3] = (sp ? 0.95 : 0.62) * k; cl[i * 3 + 1] = (sp ? 0.78 : 0.3) * k; cl[i * 3 + 2] = (sp ? 0.98 : 0.9) * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.computeVertexNormals(); return g;
    }
    function build() {
      const root = new THREE.Group(), wob = new THREE.Group(); root.add(wob);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.55, metalness: 0, envMapIntensity: 0.4 });
      bodyMat.name = 'boss';
      // đầu (thân): cục tròn ngồi nhô lên khỏi bồn
      const head = new THREE.Group(); head.position.y = 0.12 * R; wob.add(head);
      const body = new THREE.Mesh(blob(0.82 * R, 4, 6.6, true), bodyMat); body.scale.set(1, 1.08, 1); body.castShadow = true; head.add(body);
      const faceGeo = new THREE.SphereGeometry(0.81 * R, 48, 32, Math.PI / 2 - 0.9, 1.8, Math.PI / 2 - 0.78, 1.5);
      const FACE = {}; for (const f of kit.FACES) FACE[f] = kit.faceCanvases(f);
      const paintMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.paint, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const glowMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.glow, color: G.hdr(0xffffff, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
      const paint = new THREE.Mesh(faceGeo, paintMat), glw = new THREE.Mesh(faceGeo, glowMat); paint.renderOrder = 7; glw.renderOrder = 8; paint.scale.y = glw.scale.y = 1.08; head.add(paint); head.add(glw);
      // bồn gỗ: trụ nâu có 2 đai sẫm + mặt nước xanh bên trong
      const tub = new THREE.Group(); tub.position.y = -0.62 * R; root.add(tub);
      const wood = new THREE.MeshStandardMaterial({ color: 0x9a5b2a, roughness: 0.8 }), band = new THREE.MeshStandardMaterial({ color: 0x5b3414, roughness: 0.6, metalness: 0.3 });
      const barrel = new THREE.Mesh(new THREE.CylinderGeometry(1.08 * R, 0.95 * R, 0.78 * R, 32, 1, true), wood); barrel.material.side = THREE.DoubleSide; barrel.castShadow = true; tub.add(barrel);
      const floor = new THREE.Mesh(new THREE.CircleGeometry(0.95 * R, 28).rotateX(-Math.PI / 2), wood); floor.position.y = -0.39 * R; tub.add(floor);
      for (const yy of [-0.2, 0.22]) { const t = new THREE.Mesh(new THREE.TorusGeometry(1.03 * R + yy * 0.12 * R, 0.035 * R, 8, 40), band); t.rotation.x = Math.PI / 2; t.position.y = yy * R; tub.add(t); }
      const waterMat = new THREE.MeshStandardMaterial({ color: 0x38bdf8, roughness: 0.1, metalness: 0.1, transparent: true, opacity: 0.85, emissive: 0x0b4a6e, emissiveIntensity: 0.3 });
      const water = new THREE.Mesh(new THREE.CircleGeometry(1.05 * R, 32).rotateX(-Math.PI / 2), waterMat); water.position.y = 0.3 * R; tub.add(water);
      // xúc tu ngắn vắt qua thành bồn (6 cái quanh vành)
      const stubs = [];
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2 + 0.3, g = new THREE.Group(); g.position.set(Math.cos(a) * 0.95 * R, 0.32 * R, Math.sin(a) * 0.95 * R); g.rotation.y = -a; tub.add(g);
        const s1 = new THREE.Mesh(blob(0.16 * R, 2, 30 + i, false), bodyMat); s1.position.set(0.1 * R, -0.05 * R, 0); g.add(s1); const s2 = new THREE.Mesh(blob(0.12 * R, 2, 40 + i, false), bodyMat); s2.position.set(0.24 * R, -0.2 * R, 0); g.add(s2); stubs.push(g); }
      // xúc tu dài: 11 đốt tròn nhỏ dần (world.js xếp chúng dọc đường cong từ thân tới chỗ đập), mỗi đốt 1 giác hút hồng nhạt
      const suck = new THREE.MeshStandardMaterial({ color: 0xf5d0fe, roughness: 0.6 });
      const arm = new THREE.Group(); arm.visible = false; scene.add(arm);
      const segs = []; for (let i = 0; i < 11; i++) { const r = (0.3 - i * 0.018) * R, m = new THREE.Mesh(blob(r, 2, 50 + i, false), bodyMat); m.castShadow = true; const c = new THREE.Mesh(new THREE.SphereGeometry(r * 0.35, 8, 6), suck); c.position.set(0, -r * 0.8, r * 0.3); m.add(c); arm.add(m); segs.push(m); }
      root.visible = false; scene.add(root);
      const zs = [0, 1, 2].map(function () { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.z, transparent: true, depthWrite: false })); s.renderOrder = 9; root.add(s); return s; });
      return { kind: 'octo', root: root, wob: wob, head: head, body: body, mat: bodyMat, paint: paintMat, glow: glowMat, FACE: FACE, face: 'grumpy', tub: tub, water: water, stubs: stubs, arm: arm, segs: segs, zs: zs, R: R };
    }
    return { build: build };
  }
  return { create: create };
})();
