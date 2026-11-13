// v2_gfx.js — nền đồ hoạ cho bản 3D đẹp: khung vẽ + hậu kỳ (sáng loá, màu phim, mờ viền), nhiễu, hoạ tiết tự sinh, chất liệu.
// Không có file ảnh nào: mọi hoạ tiết (đất, đá, mây, khói, tia lửa) đều vẽ bằng code lúc mở trang.
window.SFG = (function () {
  'use strict';
  THREE.ColorManagement.legacyMode = false;
  const TAU = Math.PI * 2;
  const Q = { lq: /[?&]lq/.test(location.search) }; // ?lq = tắt hậu kỳ (máy yếu)

  // ---------- nhiễu (value noise + fbm), có hạt giống ----------
  function hash(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
  function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
    const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
  function fbm(x, y, oct) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < (oct || 4); i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
  function rnd(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

  // ---------- khung vẽ ----------
  const canvas = document.getElementById('gl');
  const renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: Q.lq, powerPreference: 'high-performance' });
  renderer.outputEncoding = Q.lq ? THREE.sRGBEncoding : THREE.LinearEncoding;
  renderer.toneMapping = Q.lq ? THREE.ACESFilmicToneMapping : THREE.NoToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  const scene = new THREE.Scene();
  const FOV = 30, camera = new THREE.PerspectiveCamera(FOV, 1, 0.5, 400);

  // ---------- hậu kỳ: vẽ cảnh ra ảnh HDR → sáng loá → 1 lượt cuối (mờ nghiêng, viền tối, màu phim, hạt) ----------
  const FinalShader = {
    uniforms: { tDiffuse: { value: null }, uExposure: { value: 1.0 }, uStorm: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uTilt: { value: 0.55 }, uSat: { value: 1.12 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: [
      'uniform sampler2D tDiffuse; uniform float uExposure, uStorm, uFlash, uTime, uTilt, uSat; uniform vec2 uRes; varying vec2 vUv;',
      'vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }',
      'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
      'void main(){',
      '  // mờ nghiêng (kiểu chụp mô hình thu nhỏ): dải trên cùng + dưới cùng hơi nhoè, giữa nét',
      '  float band = smoothstep(0.34, 0.56, abs(vUv.y - 0.44)) * uTilt;',
      '  vec2 px = band * 2.6 / uRes;',
      '  vec3 c = texture2D(tDiffuse, vUv).rgb;',
      '  if (band > 0.01) {',
      '    c += texture2D(tDiffuse, vUv + px * vec2( 1.0,  0.0)).rgb + texture2D(tDiffuse, vUv + px * vec2(-1.0,  0.0)).rgb;',
      '    c += texture2D(tDiffuse, vUv + px * vec2( 0.0,  1.0)).rgb + texture2D(tDiffuse, vUv + px * vec2( 0.0, -1.0)).rgb;',
      '    c += texture2D(tDiffuse, vUv + px * vec2( 0.7,  0.7)).rgb + texture2D(tDiffuse, vUv + px * vec2(-0.7,  0.7)).rgb;',
      '    c += texture2D(tDiffuse, vUv + px * vec2( 0.7, -0.7)).rgb + texture2D(tDiffuse, vUv + px * vec2(-0.7, -0.7)).rgb;',
      '    c /= 9.0;',
      '  }',
      '  c *= uExposure * (1.0 + uFlash * 1.2);',
      '  // viền tối',
      '  vec2 q = vUv - 0.5; float vig = smoothstep(0.95, 0.25, length(q * vec2(1.0, 1.15)));',
      '  c *= mix(0.62 - 0.14 * uStorm, 1.0, vig);',
      '  c = aces(c);',
      '  // chỉnh màu: bão thì ngả xanh lạnh + tương phản hơn; ngày thì ấm',
      '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
      '  c = mix(vec3(l), c, uSat - 0.10 * uStorm);',
      '  c = mix(c, c * vec3(1.04, 1.01, 0.95), 1.0 - uStorm);',
      '  c = mix(c, c * vec3(0.90, 0.97, 1.10), uStorm);',
      '  c = (c - 0.5) * (1.06 + 0.06 * uStorm) + 0.5;',
      '  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));',
      '  c += (hash(vUv * uRes + uTime) - 0.5) / 255.0 * 1.5;',
      '  gl_FragColor = vec4(c, 1.0);',
      '}'].join('\n'),
  };
  let composer = null, bloom = null, finalPass = null;
  function buildComposer() {
    if (Q.lq) return;
    try {
      const size = renderer.getDrawingBufferSize(new THREE.Vector2());
      const rt = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
      composer = new THREE.EffectComposer(renderer, rt);
      composer.addPass(new THREE.RenderPass(scene, camera));
      bloom = new THREE.UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.5, 0.55, 1.0);
      composer.addPass(bloom);
      finalPass = new THREE.ShaderPass(FinalShader); composer.addPass(finalPass);
    } catch (e) { console.warn('hau ky khong bat duoc, ve thuong', e); composer = null; Q.lq = true; renderer.outputEncoding = THREE.sRGBEncoding; renderer.toneMapping = THREE.ACESFilmicToneMapping; }
  }
  let camDist = 28, psScale = 1, VIEW_CELLS = 20.5, rscale = 1;
  function resize() {
    const w = window.innerWidth, h = window.innerHeight;
    renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1)); renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    const t = Math.tan(FOV * Math.PI / 360);
    camDist = Math.max(24, VIEW_CELLS / (2 * t * camera.aspect));
    const db = renderer.getDrawingBufferSize(new THREE.Vector2()); psScale = db.y / (2 * t);
    sizeComposer();
  }
  // Cảnh được vẽ vào 1 tấm ảnh trong (cỡ = cỡ cửa sổ × rscale) rồi lượt cuối phóng lên khung vẽ. Giảm tải = thu nhỏ tấm ảnh trong,
  // KHÔNG đổi cỡ khung vẽ. Hạt sáng tính cỡ theo tấm ảnh trong (không thì màn nét cao như iPad hạt to gấp rưỡi).
  function sizeComposer() {
    if (!composer) return;
    const w = Math.max(2, Math.round(window.innerWidth * rscale)), h = Math.max(2, Math.round(window.innerHeight * rscale));
    composer.setSize(w, h); finalPass.uniforms.uRes.value.set(w, h); psScale = h / (2 * Math.tan(FOV * Math.PI / 360));
  }
  function render(o) {
    if (composer) { const u = finalPass.uniforms; u.uStorm.value = o.storm; u.uFlash.value = o.flash; u.uTime.value = o.time; u.uExposure.value = o.exposure;
      bloom.strength = 0.42 + 0.33 * o.storm; bloom.threshold = 1.0 - 0.25 * o.storm; composer.render(); }
    else renderer.render(scene, camera);
  }

  // ---------- hoạ tiết tự sinh ----------
  function canvasTex(w, h, draw, opt) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
    const t = new THREE.CanvasTexture(cv); opt = opt || {}; if (opt.srgb !== false) t.encoding = THREE.sRGBEncoding; if (opt.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = 4; return t; }
  function pixelTex(w, h, fn, opt) { return canvasTex(w, h, function (g) { const im = g.createImageData(w, h), d = im.data; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x / w, y / h, x, y), i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c.length > 3 ? c[3] : 255; } g.putImageData(im, 0, 0); }, opt); }
  const TEX = {};
  // đốm sáng mềm · tia lửa · cụm khói/mây (nhiễu, mép tan)
  TEX.soft = pixelTex(128, 128, function (u, v) { const d = Math.hypot(u - 0.5, v - 0.5) * 2, a = Math.pow(Math.max(0, 1 - d), 2.2); return [255, 255, 255, a * 255]; });
  TEX.spark = pixelTex(64, 64, function (u, v) { const dx = Math.abs(u - 0.5) * 2, dy = Math.abs(v - 0.5) * 2, a = Math.max(0, 1 - dx) * Math.max(0, 1 - dy * 5) + Math.max(0, 1 - Math.hypot(dx, dy) * 2.2); return [255, 255, 255, Math.min(1, a) * 255]; });
  TEX.puff = pixelTex(128, 128, function (u, v) { const d = Math.hypot(u - 0.5, v - 0.5) * 2, n = fbm(u * 5 + 3, v * 5 + 7, 4), a = Math.max(0, 1 - d - (1 - n) * 0.55) * 2.2, sh = 0.72 + 0.28 * fbm(u * 3, v * 3 - 2, 3) + (0.5 - v) * 0.25; const g = Math.max(0, Math.min(1, sh)) * 255; return [g, g, g, Math.min(1, a) * 255]; });
  TEX.star = canvasTex(64, 64, function (g) { g.translate(32, 32); g.fillStyle = '#fff'; g.beginPath(); for (let i = 0; i < 10; i++) { const r = i % 2 ? 12 : 28, a = -Math.PI / 2 + i * Math.PI / 5; g.lineTo(Math.cos(a) * r, Math.sin(a) * r); } g.closePath(); g.fill(); });
  // đất vách: tầng đất + sỏi + đá; kèm bản đồ gồ ghề
  function soil(w, h, bump) { return pixelTex(w, h, function (u, v) {
      const n = fbm(u * 14, v * 14, 5), n2 = fbm(u * 40 + 9, v * 40 + 3, 3), layer = 0.5 + 0.5 * Math.sin((v + fbm(u * 3, v * 2, 3) * 0.18) * 26.0);
      let st = 0; // đá chìm
      for (let k = 0; k < 9; k++) { const sx = rnd(k * 3 + 1), sy = rnd(k * 5 + 2), sr = 0.018 + rnd(k * 7 + 3) * 0.04, d = Math.hypot((Math.abs(u - sx) > 0.5 ? 1 - Math.abs(u - sx) : u - sx), (v - sy) * 1.5) / sr; if (d < 1) st = Math.max(st, 1 - d * d); }
      if (bump) { const b = 0.45 + n * 0.3 + n2 * 0.12 + layer * 0.08 + st * 0.5; const g = Math.max(0, Math.min(1, b)) * 255; return [g, g, g]; }
      const dark = 0.62 + n * 0.42 + n2 * 0.18 - layer * 0.10, top = Math.max(0, 1 - v * 3.2);
      let r = 122 * dark + 30 * top, gg = 70 * dark + 18 * top, b = 38 * dark + 6 * top;
      if (st > 0) { const s = 0.75 + st * 0.4 + n2 * 0.2; r = r * (1 - st) + 118 * s * st; gg = gg * (1 - st) + 104 * s * st; b = b * (1 - st) + 92 * s * st; }
      return [r, gg, b]; }, { repeat: true, srgb: !bump }); }
  TEX.soil = soil(512, 512, false); TEX.soilBump = soil(512, 512, true);
  // mặt cỏ (nền dưới lá cỏ): loang đậm nhạt
  TEX.ground = pixelTex(256, 256, function (u, v) { const n = fbm(u * 8, v * 8, 4), m = fbm(u * 28 + 5, v * 28, 3); const k = 0.72 + n * 0.5 + m * 0.14; return [58 * k, 138 * k, 44 * k]; }, { repeat: true });
  TEX.rock = pixelTex(256, 256, function (u, v) { const n = fbm(u * 10, v * 10, 5), c = Math.abs(fbm(u * 5 + 2, v * 5, 4) - 0.5) < 0.03 ? 0.6 : 1; const k = (0.6 + n * 0.7) * c; return [140 * k, 146 * k, 156 * k]; }, { repeat: true });
  TEX.sand = pixelTex(256, 256, function (u, v) { const n = fbm(u * 12, v * 12, 4), r = 0.5 + 0.5 * Math.sin((u + fbm(u * 2, v * 2, 2) * 0.3) * 60); const k = 0.8 + n * 0.3 + r * 0.06; return [226 * k, 204 * k, 150 * k]; }, { repeat: true });
  TEX.caustic = pixelTex(256, 256, function (u, v) { let s = 0; for (let k = 0; k < 3; k++) { const a = fbm(u * (4 + k * 3) + k * 7, v * (4 + k * 3), 3), b = Math.abs(a - 0.5) * 2; s += Math.pow(1 - b, 9); } const g = Math.min(1, s * 0.9) * 255; return [g, g, g]; }, { repeat: true, srgb: false });

  // ---------- chất liệu ----------
  const shared = { uTime: { value: 0 }, uWind: { value: 0 }, uGust: { value: 0.3 }, uHero: { value: new THREE.Vector3(0, -99, 0) } };
  // thổi gió cho lá cỏ / tán cây: lắc theo toạ độ thế giới, càng lên ngọn càng lắc; cỏ rạp ra khi baby đi qua
  function windify(mat, kind) {
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = shared.uTime; sh.uniforms.uWind = shared.uWind; sh.uniforms.uGust = shared.uGust; sh.uniforms.uHero = shared.uHero;
      sh.vertexShader = 'uniform float uTime, uWind, uGust; uniform vec3 uHero; attribute float aSway;\n' + sh.vertexShader.replace('#include <project_vertex>', [
        'vec4 mvPosition = vec4(transformed, 1.0);',
        '#ifdef USE_INSTANCING',
        '  mvPosition = instanceMatrix * mvPosition;',
        '#endif',
        'vec4 wp = modelMatrix * mvPosition;',
        'float sw = aSway;',
        kind === 'grass'
          ? 'float g = sin(uTime * 1.9 + wp.x * 0.8 + wp.z * 1.1) * 0.5 + sin(uTime * 3.7 + wp.x * 2.1) * 0.25; wp.x += (g * (0.10 + uGust * 0.22) + uWind * 0.42) * sw; wp.z += g * 0.05 * sw; vec2 hd = wp.xz - uHero.xz; float hf = smoothstep(1.3, 0.2, length(hd)) * smoothstep(1.6, 0.0, abs(wp.y - uHero.y)) * sw; wp.xz += normalize(hd + vec2(0.0001)) * hf * 0.55; wp.y -= hf * 0.3;'
          : 'float g = sin(uTime * 1.3 + wp.x * 0.35 + wp.z * 0.5) * 0.6 + sin(uTime * 2.9 + wp.x * 1.3) * 0.2; wp.x += (g * (0.05 + uGust * 0.16) + uWind * 0.5) * sw; wp.z += g * 0.04 * sw;',
        'mvPosition = viewMatrix * wp;',
        'gl_Position = projectionMatrix * mvPosition;'].join('\n'));
    };
    mat.customProgramCacheKey = function () { return 'wind_' + kind; };
    return mat;
  }
  // vải nhung cho thú bông: lớp lông tơ sáng viền (sheen)
  function plush(m) {
    const p = new THREE.MeshPhysicalMaterial({ color: m.color.clone(), roughness: Math.max(0.75, m.roughness), metalness: 0, emissive: m.emissive ? m.emissive.clone() : new THREE.Color(0), emissiveIntensity: m.emissiveIntensity || 0 });
    const lum = m.color.r * 0.3 + m.color.g * 0.6 + m.color.b * 0.1;
    if (lum > 0.03) { p.sheen = 0.35; p.sheenRoughness = 0.65; p.sheenColor = m.color.clone().lerp(new THREE.Color(1, 1, 1), 0.25); }
    else { p.roughness = 0.25; } // mắt/miệng đen: bóng
    p.name = m.name; return p;
  }
  function glow(color, size, opacity, tex) { const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex || TEX.soft, color: color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: opacity === undefined ? 1 : opacity })); s.scale.set(size, size, 1); return s; }
  function hdr(hex, k) { return new THREE.Color(hex).multiplyScalar(k); }

  function setScale(v) { rscale = v; sizeComposer(); }
  function setBloom(on) { if (bloom) bloom.enabled = !!on; }
  return { setScale: setScale, scale: function () { return rscale; }, setBloom: setBloom, Q: Q, TAU: TAU, renderer: renderer, scene: scene, camera: camera, FOV: FOV, canvas: canvas, buildComposer: buildComposer, resize: resize, render: render,
    camDist: function () { return camDist; }, psScale: function () { return psScale; }, fbm: fbm, vnoise: vnoise, rnd: rnd, TEX: TEX, canvasTex: canvasTex, pixelTex: pixelTex,
    shared: shared, windify: windify, plush: plush, glow: glow, hdr: hdr, info: function () { return { composer: !!composer, lq: Q.lq }; } };
})();
