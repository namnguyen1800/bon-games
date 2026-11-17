// Đợt 4 — boss NỮ HOÀNG BĂNG (Ice Queen): thân tròn như váy phồng màu xanh băng, viền lông trắng ở chân váy, vương miện pha lê, tay cầm đũa có ngôi sao;
// khiên băng = quả cầu trong suốt bao quanh (vỡ khi cô hắt xì). Kèm hình quả cầu tuyết lăn. Mặt vẽ tay mượn bộ 13 mặt của Vua Sấm (boss.js → faceCanvases).
// Chỉ dựng hình. Cách diễn (bay / giơ đũa / lăn cầu tuyết / hắt xì / nghỉ / mừng) nằm ở world.js → drawIce. Viết tay (khác boss.js là file sinh tự động).
window.SFBossIce = (function () {
  function create(o) { // o: { G, scene, R (bán kính thân, tính bằng ô), kit (SFBoss.create(...) — để mượn faceCanvases + TEX.z) }
    const G = o.G, scene = o.scene, R = o.R, kit = o.kit, BGU = THREE.BufferGeometryUtils, TEX = G.TEX;
    // 1 cục tròn mềm màu theo đỉnh: xanh băng nhạt dần lên trắng ở đỉnh, vài vệt lấp lánh; trim = có viền lông trắng ở chân váy
    function blob(r, detail, seed, trim) {
      let g = new THREE.IcosahedronGeometry(r, detail); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = BGU.mergeVertices(g);
      const p = g.attributes.position, cl = new Float32Array(p.count * 3), v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i); const n = v.clone().normalize();
        const f = G.vnoise(n.x * 3 + seed, n.y * 3 - seed);
        v.addScaledVector(n, (f - 0.5) * 0.02 * r); p.setXYZ(i, v.x, v.y, v.z);
        const w = trim && n.y < -0.62 ? 1 : 0, k = 0.92 + f * 0.12 + (G.vnoise(n.x * 14 + seed, n.z * 14) > 0.82 ? 0.12 : 0), up = Math.max(0, n.y) * 0.25;
        cl[i * 3] = (w ? 0.98 : 0.55 + up) * k; cl[i * 3 + 1] = (w ? 0.98 : 0.8 + up * 0.6) * k; cl[i * 3 + 2] = (w ? 1.0 : 0.97) * k;
      }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.computeVertexNormals(); return g;
    }
    function build() {
      const root = new THREE.Group(), wob = new THREE.Group(); root.add(wob);
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.45, metalness: 0.05, envMapIntensity: 0.6 });
      bodyMat.name = 'boss';
      const body = new THREE.Mesh(blob(0.95 * R, 4, 4.1, true), bodyMat); body.castShadow = true; wob.add(body);
      // mặt: 2 lớp vẽ trên chỏm cầu ôm sát mặt trước (giống các boss khác)
      const faceGeo = new THREE.SphereGeometry(0.985 * R, 48, 32, Math.PI / 2 - 0.9, 1.8, Math.PI / 2 - 0.78, 1.5);
      const FACE = {}; for (const f of kit.FACES) FACE[f] = kit.faceCanvases(f);
      const paintMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.paint, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const glowMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.glow, color: G.hdr(0xffffff, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
      const paint = new THREE.Mesh(faceGeo, paintMat), glw = new THREE.Mesh(faceGeo, glowMat); paint.renderOrder = 7; glw.renderOrder = 8; wob.add(paint); wob.add(glw);
      // vương miện pha lê: 5 tinh thể nhọn xanh nhạt phát sáng nhẹ
      const crystal = new THREE.MeshStandardMaterial({ color: 0xbfe9ff, emissive: 0x5fb8ff, emissiveIntensity: 0.5, roughness: 0.15, metalness: 0.2, transparent: true, opacity: 0.92 });
      const crown = new THREE.Group(); crown.position.set(0, 0.9 * R, 0.05 * R); wob.add(crown);
      for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.32, h = (0.42 - Math.abs(i - 2) * 0.08) * R, c = new THREE.Mesh(new THREE.OctahedronGeometry(1, 0), crystal); c.scale.set(0.07 * R, h * 0.6, 0.07 * R); c.position.set(Math.sin(a) * 0.3 * R, h * 0.45, Math.cos(a) * 0.08 * R); c.rotation.z = -a * 0.8; crown.add(c); }
      // tay phải cầm đũa có ngôi sao (giơ lên khi báo)
      const arm = new THREE.Group(); arm.position.set(0.85 * R, -0.05 * R, 0.25 * R); wob.add(arm);
      const hand = new THREE.Mesh(blob(0.15 * R, 2, 9, false), bodyMat); arm.add(hand);
      const rod = new THREE.Mesh(new THREE.CylinderGeometry(0.03 * R, 0.03 * R, 0.75 * R, 8), new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.3, metalness: 0.6 })); rod.position.y = 0.36 * R; arm.add(rod);
      const starMat = new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xffd34d, emissiveIntensity: 0.6, roughness: 0.3 });
      const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.13 * R, 0), starMat); star.position.y = 0.78 * R; arm.add(star);
      const armL = new THREE.Group(); armL.position.set(-0.85 * R, -0.05 * R, 0.25 * R); armL.add(new THREE.Mesh(blob(0.15 * R, 2, 13, false), bodyMat)); wob.add(armL);
      // khiên băng: quả cầu trong suốt có viền sáng (vỡ khi hắt xì)
      const shieldMat = new THREE.MeshStandardMaterial({ color: 0xd9f2ff, transparent: true, opacity: 0.22, roughness: 0.05, metalness: 0.1, emissive: 0x7fcfff, emissiveIntensity: 0.25, depthWrite: false, side: THREE.DoubleSide });
      const shield = new THREE.Mesh(new THREE.IcosahedronGeometry(1.32 * R, 2), shieldMat); shield.renderOrder = 6; root.add(shield);
      root.visible = false; scene.add(root);
      const zs = [0, 1, 2].map(function () { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.z, transparent: true, depthWrite: false })); s.renderOrder = 9; root.add(s); return s; });
      return { kind: 'ice', root: root, wob: wob, body: body, mat: bodyMat, paint: paintMat, glow: glowMat, FACE: FACE, face: 'grumpy', arm: arm, armL: armL, star: star, starMat: starMat, crown: crown, shield: shield, shieldMat: shieldMat, zs: zs, R: R };
    }
    // quả cầu tuyết lăn: cầu trắng hơi sần + vài vệt xanh nhạt (để thấy nó quay)
    function buildBall(r) {
      let g = new THREE.IcosahedronGeometry(r, 3); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = BGU.mergeVertices(g);
      const p = g.attributes.position, cl = new Float32Array(p.count * 3), v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) { v.fromBufferAttribute(p, i); const n = v.clone().normalize(); const f = G.vnoise(n.x * 5, n.y * 5 + n.z * 3); v.addScaledVector(n, (f - 0.5) * 0.12 * r); p.setXYZ(i, v.x, v.y, v.z); const s = Math.abs(n.x) < 0.12 || Math.abs(n.z) < 0.08 ? 0.82 : 1; cl[i * 3] = 0.93 * s; cl[i * 3 + 1] = 0.97 * s; cl[i * 3 + 2] = 1.0; }
      g.setAttribute('color', new THREE.BufferAttribute(cl, 3)); g.computeVertexNormals();
      const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xffffff, vertexColors: true, roughness: 0.8 })); m.castShadow = true; return m;
    }
    return { build: build, buildBall: buildBall };
  }
  return { create: create };
})();
