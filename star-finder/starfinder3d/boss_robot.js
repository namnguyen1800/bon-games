// Đợt 4 — boss ROBOT NAM CHÂM (Magnet Robot): robot tròn trịa kiểu đồ chơi — thân hộp bo tròn màu bạc xanh, đầu hộp nhỏ mang mặt vẽ tay,
// cục nam châm chữ U đỏ trên đỉnh đầu, 2 tay càng, 2 bàn chân hộp, NẮP BỤNG mở ra được (bên trong là lõi vàng phát sáng = chỗ đánh).
// Mặt mượn bộ 13 mặt của Vua Sấm (boss.js → faceCanvases), dán lên 1 tấm phẳng trước mặt đầu (đầu hình hộp, không phải hình cầu).
// Chỉ dựng hình. Cách diễn (đi / sạc nam châm / hút / mở nắp bụng nghỉ / mừng) nằm ở world.js → drawRobot. Viết tay (khác boss.js là file sinh tự động).
window.SFBossRobot = (function () {
  function create(o) { // o: { G, scene, R (bán kính thân, tính bằng ô), kit (SFBoss.create(...) — để mượn faceCanvases + TEX.z) }
    const G = o.G, scene = o.scene, R = o.R, kit = o.kit, BGU = THREE.BufferGeometryUtils, TEX = G.TEX;
    // hộp bo tròn: hình cầu kéo về dạng siêu-elip |x|^5 + |y|^5 + |z|^5 = 1 rồi giãn theo 3 trục
    function rbox(sx, sy, sz, detail) {
      let g = new THREE.IcosahedronGeometry(1, detail || 4); g.deleteAttribute('normal'); g.deleteAttribute('uv'); g = BGU.mergeVertices(g);
      const p = g.attributes.position, v = new THREE.Vector3();
      for (let i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).normalize();
        const k = Math.pow(Math.pow(Math.abs(v.x), 5) + Math.pow(Math.abs(v.y), 5) + Math.pow(Math.abs(v.z), 5), -0.2);
        p.setXYZ(i, v.x * k * sx, v.y * k * sy, v.z * k * sz);
      }
      g.computeVertexNormals(); return g;
    }
    function build() {
      const root = new THREE.Group(), wob = new THREE.Group(); root.add(wob); wob.position.y = 0.12 * R;
      const bodyMat = new THREE.MeshStandardMaterial({ color: 0xa9bfd4, roughness: 0.32, metalness: 0.55, envMapIntensity: 0.9 });
      bodyMat.name = 'boss';
      const darkMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.5, metalness: 0.4 });
      // thân: hộp bo tròn rộng, hơi lùn
      const body = new THREE.Mesh(rbox(0.86 * R, 0.56 * R, 0.66 * R), bodyMat); body.position.y = -0.3 * R; body.castShadow = true; wob.add(body);
      // nắp bụng: bản lề ở mép dưới mặt trước thân, xoay ra trước + xuống khi mở; lõi vàng phát sáng nằm sau nắp
      const coreMat = new THREE.MeshStandardMaterial({ color: 0xfde047, emissive: 0xf59e0b, emissiveIntensity: 0.4, roughness: 0.4 });
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.2 * R, 20, 14), coreMat); core.position.set(0, -0.3 * R, 0.5 * R); wob.add(core);
      const hatch = new THREE.Group(); hatch.position.set(0, -0.62 * R, 0.66 * R); wob.add(hatch);
      const door = new THREE.Mesh(rbox(0.36 * R, 0.24 * R, 0.035 * R, 3), darkMat); door.position.y = 0.27 * R; door.castShadow = true; hatch.add(door);
      const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.045 * R, 10, 8), bodyMat); bolt.position.set(0, 0.42 * R, 0.04 * R); hatch.add(bolt);
      // đầu: hộp bo tròn nhỏ hơn, ngồi trên thân (cổ ngắn)
      const head = new THREE.Group(); head.position.y = 0.48 * R; wob.add(head);
      const skull = new THREE.Mesh(rbox(0.66 * R, 0.5 * R, 0.56 * R), bodyMat); skull.castShadow = true; head.add(skull);
      // mặt: 2 lớp vẽ trên 1 tấm phẳng sát mặt trước đầu (tỉ lệ khung mặt giữ như các boss khác: rộng ~1.57, cao ~1.36)
      const faceGeo = new THREE.PlaneGeometry(1.08 * R, 0.94 * R);
      const FACE = {}; for (const f of kit.FACES) FACE[f] = kit.faceCanvases(f);
      const paintMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.paint, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
      const glowMat = new THREE.MeshBasicMaterial({ map: FACE.grumpy.glow, color: G.hdr(0xffffff, 2.2), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, polygonOffset: true, polygonOffsetFactor: -3 });
      const paint = new THREE.Mesh(faceGeo, paintMat), glw = new THREE.Mesh(faceGeo, glowMat); paint.position.z = glw.position.z = 0.575 * R; paint.renderOrder = 7; glw.renderOrder = 8; head.add(paint); head.add(glw);
      // nam châm chữ U đỏ trên đỉnh đầu, 2 đầu cực bạc (sáng lên khi sạc / hút)
      const magMat = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0xff2d2d, emissiveIntensity: 0, roughness: 0.4, metalness: 0.2 });
      const magnet = new THREE.Group(); magnet.position.y = 0.5 * R; head.add(magnet);
      const u = new THREE.Mesh(new THREE.TorusGeometry(0.26 * R, 0.09 * R, 12, 28, Math.PI), magMat); u.position.y = 0.32 * R; u.castShadow = true; magnet.add(u);
      const tipMat = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, emissive: 0x9fd8ff, emissiveIntensity: 0, roughness: 0.3, metalness: 0.6 });
      for (const s of [-1, 1]) {
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.09 * R, 0.09 * R, 0.24 * R, 14), magMat); leg.position.set(s * 0.26 * R, 0.2 * R, 0); magnet.add(leg);
        const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.095 * R, 0.095 * R, 0.1 * R, 14), tipMat); tip.position.set(s * 0.26 * R, 0.05 * R, 0); magnet.add(tip);
      }
      // tay: cánh tay ống + càng 2 ngón, xoay quanh vai
      const arms = [-1, 1].map(function (s) {
        const sh = new THREE.Group(); sh.position.set(s * 0.86 * R, -0.12 * R, 0.05 * R); wob.add(sh);
        const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.08 * R, 0.08 * R, 0.42 * R, 12), darkMat); pipe.position.y = -0.2 * R; sh.add(pipe);
        for (const f of [-1, 1]) { const cl = new THREE.Mesh(rbox(0.06 * R, 0.13 * R, 0.08 * R, 2), bodyMat); cl.position.set(f * 0.07 * R, -0.46 * R, 0); cl.rotation.z = f * 0.35; cl.castShadow = true; sh.add(cl); }
        return sh;
      });
      // chân: 2 bàn chân hộp, gắn vào root (thân ngồi xuống được mà chân vẫn chạm đất)
      const legs = [-1, 1].map(function (s) {
        const hip = new THREE.Group(); hip.position.set(s * 0.42 * R, -0.86 * R, 0.05 * R); root.add(hip);
        const foot = new THREE.Mesh(rbox(0.26 * R, 0.14 * R, 0.34 * R, 3), darkMat); foot.position.set(0, -0.04 * R, 0.06 * R); foot.castShadow = true; hip.add(foot);
        return hip;
      });
      root.visible = false; scene.add(root);
      const zs = [0, 1, 2].map(function () { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: TEX.z, transparent: true, depthWrite: false })); s.renderOrder = 9; root.add(s); return s; });
      return { kind: 'robot', root: root, wob: wob, body: body, head: head, mat: bodyMat, paint: paintMat, glow: glowMat, FACE: FACE, face: 'grumpy', arms: arms, legs: legs,
        magnet: magnet, magMat: magMat, tipMat: tipMat, hatch: hatch, core: core, coreMat: coreMat, zs: zs, R: R, wobHome: wob.position.y };
    }
    return { build: build };
  }
  return { create: create };
})();
