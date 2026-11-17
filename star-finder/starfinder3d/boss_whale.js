// Đợt 4 — boss CÁ VOI GIÓ (Wind Whale): cá voi tròn kiểu thú bông, lưng xanh dương, bụng trắng kem, đuôi 2 thuỳ, 2 vây nhỏ, lỗ phun nước trên đầu;
// mặt vẽ tay mượn bộ 13 mặt của Vua Sấm (boss.js → faceCanvases). Chỉ dựng hình. Cách diễn (bay / phồng má / thổi / xẹp bụng nghỉ / mừng) nằm ở world.js → drawWhale.
// Viết tay (khác boss.js là file sinh tự động).
window.SFBossWhale = (function () {
  function create(o) { // o: { G, scene, R (bán kính thân, tính bằng ô), kit (SFBoss.create(...) — để mượn faceCanvases + TEX.z) }
    const G = o.G, scene = o.scene, R = o.R, kit = o.kit, BGU = THREE.BufferGeometryUtils, TEX = G.TEX;
    const c01 = function (v) { return Math.min(1, Math.max(0, v)); };
    // 1 cục tròn mềm, màu theo đỉnh: lưng xanh dương, nửa dưới chuyển dần sang trắng kem (belly = có bụng trắng), vài đốm sáng trên lưng
    function blob(r, detail, seed, belly) {
      let g = new THREE.IcosahedronGeometry(r, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = BGU.mergeVertices(g);
      const p = g.attributes.position, cl = new Float32Array(p.count * 3), v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i); const n = v.clone().normalize();
        const f = G.vnoise(n.x * 3 + seed, n.y * 3 - seed);
        v.addScaledVector(n, (f - 0.5) * 0.025 * r); p.setXYZ(i, v.x, v.y, v.z);
        const b = belly ? c01((-n.y - 0.18) * 3.5) : 0;                                               // bụng trắng kem ở nửa dưới
        const spot = !b && n.y > 0.3 && G.vnoise(n.x * 8 + seed, n.z * 8 - seed) > 0.72 ? 1.18 : 1;   // đốm sáng trên lưng
        const k = (0.9 + f * 0.14) * spot;
        cl[i * 3] = (0.2 * (1 - b) + 0.96 * b) * k; cl[i * 3 + 1] = (0.56 * (1 - b) + 0.97 * b) * k; cl[i * 3 + 2] = (0.95 * (1 - b) + 1.0 * b) * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.computeVertexNormals(); return g;
    }
    function build() {
      const root = new THREE.Group(), wob = new THREE.Group(); root.add(wob);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xdde6f2, vertexColors: true, roughness: 0.7, metalness: 0, envMapIntensity: 0.35 });
      bodyMat.name = 'boss';
      const body = new THREE.Mesh(blob(0.95 * R, 4, 3.4, true), bodyMat); body.castShadow = true; wob.add(body);
      // mặt: 2 lớp vẽ trên chỏm cầu ôm sát mặt trước (giống các boss khác)
      const faceGeo = new THREE.SphereGeometry(0.985 * R, 48, 32, Math.PI / 2 - 0.9, 1.8, Math.PI / 2 - 0.78, 1.5);
      const FACE = {}; for (const f of kit.FACES) FACE[f] = kit.faceCanvases(f);
      const paintMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.paint, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const glowMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.glow, color: G.hdr(0xffffff, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
      const paint = new THREE.Mesh(faceGeo, paintMat), glw = new THREE.Mesh(faceGeo, glowMat); paint.renderOrder = 7; glw.renderOrder = 8; wob.add(paint); wob.add(glw);
      // đuôi: 1 cuống thon + 2 thuỳ dẹt xoè ra, chìa sang bên (nhìn từ trước vẫn thấy), vẫy được
      const tail = new THREE.Group(); tail.position.set(-0.7 * R, -0.05 * R, -0.25 * R); wob.add(tail);
      const stalk = new THREE.Mesh(blob(0.34 * R, 3, 5.2, false), bodyMat); stalk.scale.set(1.6, 0.7, 0.7); stalk.position.set(-0.3 * R, 0, 0); stalk.castShadow = true; tail.add(stalk);
      const flukes = new THREE.Group(); flukes.position.set(-0.78 * R, 0.02 * R, 0); tail.add(flukes);
      for (const s of [-1, 1]) { const fl = new THREE.Mesh(blob(0.3 * R, 3, 8 + s, false), bodyMat); fl.scale.set(0.75, 1.35, 0.3); fl.position.set(-0.12 * R, s * 0.3 * R, 0); fl.rotation.z = s * 0.55; fl.castShadow = true; flukes.add(fl); }
      // 2 vây nhỏ ở hai bên, xoay quanh gốc vây
      const fins = [-1, 1].map(function (s, k) {
        const sh = new THREE.Group(); sh.position.set(s * 0.8 * R, -0.3 * R, 0.3 * R); wob.add(sh);
        const fin = new THREE.Mesh(blob(0.26 * R, 2, 11 + k * 3, false), bodyMat); fin.scale.set(1.3, 0.45, 0.8); fin.position.set(s * 0.2 * R, -0.05 * R, 0); fin.castShadow = true; sh.add(fin);
        return sh;
      });
      // lỗ phun nước trên đỉnh đầu (vòng sẫm nhỏ) — nước phun là hạt, do world.js bắn ra từ đây
      const hole = new THREE.Mesh(new THREE.TorusGeometry(0.09 * R, 0.035 * R, 8, 16), new THREE.MeshStandardMaterial({ color: 0x1e3a8a, roughness: 0.6 }));
      hole.rotation.x = Math.PI / 2; hole.position.set(0, 0.95 * R, 0.05 * R); wob.add(hole);
      root.visible = false; scene.add(root);
      const zs = [0, 1, 2].map(function () { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.z, transparent: true, depthWrite: false })); s.renderOrder = 9; root.add(s); return s; });
      return { kind: 'whale', root: root, wob: wob, body: body, mat: bodyMat, paint: paintMat, glow: glowMat, FACE: FACE, face: 'grumpy', fins: fins, tail: tail, flukes: flukes, zs: zs, R: R };
    }
    return { build: build };
  }
  return { create: create };
})();
