// gfx.js — nền đồ hoạ của Star Finder 3D (chép từ v2_gfx.js của bản mẫu đã duyệt 11-13, đổi thành hàm tạo):
// khung vẽ + hậu kỳ (sáng loá, màu phim, mờ viền), nhiễu, hoạ tiết tự sinh, chất liệu. Không có file ảnh nào.
// KHÁC bản mẫu: khung vẽ có cỡ CỐ ĐỊNH (bw × bh), không bao giờ đổi — màn chơi luôn là dải 16:9, trình duyệt tự co giãn bằng CSS.
// (đổi cỡ khung vẽ từng làm đen màn trên trình duyệt thử WebKit; cỡ cố định thì khỏi đụng tới chuyện đó.)
window.SFG = (function () {
  'use strict';
  function create(canvas, BW, BH) {
    THREE.ColorManagement.legacyMode = false;
    const TAU = Math.PI * 2;

    // ---------- nhiễu (value noise + fbm), có hạt giống ----------
    function hash(x, y) { let h = (Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
    function vnoise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi, u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
      const a = hash(xi, yi), b = hash(xi + 1, yi), c = hash(xi, yi + 1), d = hash(xi + 1, yi + 1); return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v; }
    function fbm(x, y, oct) { let s = 0, a = 0.5, f = 1; for (let i = 0; i < (oct || 4); i++) { s += a * vnoise(x * f, y * f); f *= 2.03; a *= 0.5; } return s; }
    function rnd(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

    // ---------- khung vẽ (cần WebGL2: ảnh HDR + khử răng cưa trong hậu kỳ) ----------
    const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, powerPreference: 'high-performance' });
    if (!gl) throw new Error('no webgl2');
    const renderer = new THREE.WebGLRenderer({ canvas: canvas, context: gl });
    renderer.setPixelRatio(1); renderer.setSize(BW, BH, false);
    renderer.outputEncoding = THREE.LinearEncoding; renderer.toneMapping = THREE.NoToneMapping;
    renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    const scene = new THREE.Scene();
    const FOV = 30, camera = new THREE.PerspectiveCamera(FOV, BW / BH, 0.5, 400);

    // ---------- hậu kỳ: vẽ cảnh ra ảnh HDR → sáng loá → 1 lượt cuối (mờ nghiêng, viền tối, màu phim, hạt) ----------
    const FinalShader = {
      uniforms: { tDiffuse: { value: null }, uExposure: { value: 1.0 }, uStorm: { value: 0 }, uFlash: { value: 0 }, uTime: { value: 0 }, uRes: { value: new THREE.Vector2(1, 1) }, uTilt: { value: 0.55 }, uSat: { value: 1.06 } },
      vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform sampler2D tDiffuse; uniform float uExposure, uStorm, uFlash, uTime, uTilt, uSat; uniform vec2 uRes; varying vec2 vUv;',
        'vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14), 0.0, 1.0); }',
        'float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }',
        'void main(){',
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
        '  vec2 q = vUv - 0.5; float vig = smoothstep(0.95, 0.25, length(q * vec2(1.0, 1.15)));',
        '  c *= mix(0.62 - 0.14 * uStorm, 1.0, vig);',
        '  c = aces(c);',
        '  float l = dot(c, vec3(0.2126, 0.7152, 0.0722));',
        '  c = mix(vec3(l), c, uSat - 0.10 * uStorm);',
        '  c = mix(c, c * vec3(1.04, 1.01, 0.95), 1.0 - uStorm);',
        '  c = mix(c, c * vec3(0.90, 0.97, 1.10), uStorm);',
        '  c = pow(clamp(c, 0.0, 1.0), vec3(1.0 / 2.2));',
        '  c = (c - 0.5) * (1.05 + 0.05 * uStorm) + 0.5;',
        '  c += (hash(vUv * uRes + uTime) - 0.5) / 255.0 * 1.5;',
        '  gl_FragColor = vec4(c, 1.0);',
        '}'].join('\n'),
    };
    let rscale = 1;
    const rt = new THREE.WebGLRenderTarget(BW, BH, { type: THREE.HalfFloatType, samples: 4 });
    const composer = new THREE.EffectComposer(renderer, rt);
    composer.addPass(new THREE.RenderPass(scene, camera));
    const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(BW / 2, BH / 2), 0.5, 0.55, 1.0);
    composer.addPass(bloom);
    const finalPass = new THREE.ShaderPass(FinalShader); composer.addPass(finalPass);
    // Cảnh được vẽ vào 1 tấm ảnh trong (cỡ = khung vẽ × rscale) rồi lượt cuối phóng lên khung vẽ. Giảm tải = thu nhỏ tấm ảnh trong.
    function sizeComposer() { const w = Math.max(2, Math.round(BW * rscale)), h = Math.max(2, Math.round(BH * rscale)); composer.setSize(w, h); finalPass.uniforms.uRes.value.set(w, h); }
    sizeComposer();
    function render(o) {
      const u = finalPass.uniforms; u.uStorm.value = o.storm || 0; u.uFlash.value = o.flash || 0; u.uTime.value = o.time; u.uExposure.value = o.exposure || 1; u.uTilt.value = o.tilt === undefined ? 0.55 : o.tilt;
      bloom.strength = 0.15; bloom.threshold = 1.0; composer.render(); // 11-14d trời mát: quầng loá 0.42 → 0.15
    }

    // ---------- hoạ tiết tự sinh ----------
    function canvasTex(w, h, draw, opt) { const cv = document.createElement('canvas'); cv.width = w; cv.height = h; draw(cv.getContext('2d'), w, h);
      const t = new THREE.CanvasTexture(cv); opt = opt || {}; if (opt.srgb !== false) t.encoding = THREE.sRGBEncoding; if (opt.repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; } t.anisotropy = 4; return t; }
    function pixelTex(w, h, fn, opt) { return canvasTex(w, h, function (g) { const im = g.createImageData(w, h), d = im.data; for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x / w, y / h, x, y), i = (y * w + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = c.length > 3 ? c[3] : 255; } g.putImageData(im, 0, 0); }, opt); }
    const TEX = {};
    TEX.soft = pixelTex(128, 128, function (u, v) { const d = Math.hypot(u - 0.5, v - 0.5) * 2, a = Math.pow(Math.max(0, 1 - d), 2.2); return [255, 255, 255, a * 255]; });
    TEX.puff = pixelTex(128, 128, function (u, v) { const d = Math.hypot(u - 0.5, v - 0.5) * 2, n = fbm(u * 5 + 3, v * 5 + 7, 4), a = Math.max(0, 1 - d - (1 - n) * 0.55) * 2.2, sh = 0.72 + 0.28 * fbm(u * 3, v * 3 - 2, 3) + (0.5 - v) * 0.25; const g = Math.max(0, Math.min(1, sh)) * 255; return [g, g, g, Math.min(1, a) * 255]; });
    function soil(w, h, bump) { return pixelTex(w, h, function (u, v) {
        const n = fbm(u * 14, v * 14, 5), n2 = fbm(u * 40 + 9, v * 40 + 3, 3), layer = 0.5 + 0.5 * Math.sin((v + fbm(u * 3, v * 2, 3) * 0.18) * 26.0);
        let st = 0; // đá chìm
        for (let k = 0; k < 9; k++) { const sx = rnd(k * 3 + 1), sy = rnd(k * 5 + 2), sr = 0.018 + rnd(k * 7 + 3) * 0.04, d = Math.hypot((Math.abs(u - sx) > 0.5 ? 1 - Math.abs(u - sx) : u - sx), (v - sy) * 1.5) / sr; if (d < 1) st = Math.max(st, 1 - d * d); }
        if (bump) { const b = 0.45 + n * 0.3 + n2 * 0.12 + layer * 0.08 + st * 0.5; const g = Math.max(0, Math.min(1, b)) * 255; return [g, g, g]; }
        const dark = 0.62 + n * 0.42 + n2 * 0.18 - layer * 0.10, top = Math.max(0, 1 - v * 3.2);
        let r = 122 * dark + 30 * top, gg = 77 * dark + 18 * top, b = 54 * dark + 8 * top;
        if (st > 0) { const s = 0.75 + st * 0.4 + n2 * 0.2; r = r * (1 - st) + 118 * s * st; gg = gg * (1 - st) + 104 * s * st; b = b * (1 - st) + 92 * s * st; }
        return [r, gg, b]; }, { repeat: true, srgb: !bump }); }
    TEX.soil = soil(512, 512, false); TEX.soilBump = soil(512, 512, true);
    TEX.ground = pixelTex(256, 256, function (u, v) { const n = fbm(u * 8, v * 8, 4), m = fbm(u * 28 + 5, v * 28, 3); const k = 0.86 + n * 0.24 + m * 0.05; return [84 * k, 132 * k, 48 * k]; }, { repeat: true }); // 11-14: bớt loang (khe giữa lá cỏ không còn đốm tối)
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
        if (kind === 'grass') { // 11-14: lá cỏ lấy ánh sáng như MẶT ĐẤT (hướng lên trời), 2 mặt lá sáng như nhau → hết lấm tấm sáng-tối (cách cỏ Ghost of Tsushima)
          sh.vertexShader = sh.vertexShader.replace('#include <beginnormal_vertex>', 'vec3 objectNormal = normalize(mix(vec3(0.0, 1.0, 0.0), vec3(normal), 0.3));\n#ifdef USE_TANGENT\nvec3 objectTangent = vec3(tangent.xyz);\n#endif');
          sh.fragmentShader = sh.fragmentShader.replace('#include <normal_fragment_begin>', 'float faceDirection = 1.0; vec3 normal = normalize(vNormal); vec3 geometryNormal = normal;');
        }
      };
      mat.customProgramCacheKey = function () { return 'wind_' + kind; };
      return mat;
    }
    // 11-14 (Nam: "cây làm cho nó mờ đi background hơn, để khỏi bị rối mắt"): sương theo CHIỀU SÂU cho vật trang trí phía sau màn chơi.
    // Vật càng lùi ra sau làn chơi (z càng âm) càng ngả về màu sương của trời → cây chìm xuống thành nền, nhân vật + món chơi nổi lên.
    // a = lượng sương ngay hàng đầu, b = thêm cho hàng xa nhất (z ≈ -28). Màu sương = scene.fog.color (đổi theo bão thì cây đổi theo).
    function hazeify(mat, a, b, col) { // col (tuỳ chọn) = màu sương riêng; bỏ trống = màu sương của trời
      const prev = mat.onBeforeCompile, prevKey = mat.customProgramCacheKey ? mat.customProgramCacheKey() : '';
      mat.onBeforeCompile = function (sh, r) {
        if (prev) prev.call(mat, sh, r);
        sh.uniforms.uHazeC = { value: col || scene.fog.color }; sh.uniforms.uHazeAB = { value: new THREE.Vector2(a, b) };
        sh.vertexShader = 'varying float vHazeZ;\n' + sh.vertexShader.replace('#include <fog_vertex>', [
          'vec4 hzp = vec4(transformed, 1.0);',
          '#ifdef USE_INSTANCING',
          '  hzp = instanceMatrix * hzp;',
          '#endif',
          'vHazeZ = (modelMatrix * hzp).z;',
          '#include <fog_vertex>'].join('\n'));
        sh.fragmentShader = 'varying float vHazeZ; uniform vec3 uHazeC; uniform vec2 uHazeAB;\n' + sh.fragmentShader.replace('#include <fog_fragment>',
          '#include <fog_fragment>\n gl_FragColor.rgb = mix(gl_FragColor.rgb, uHazeC, clamp(uHazeAB.x + uHazeAB.y * (1.0 - smoothstep(-28.0, -3.0, vHazeZ)), 0.0, 0.9));');
      };
      mat.customProgramCacheKey = function () { return prevKey + '_haze' + a + '_' + b; };
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
    function setBloom(on) { bloom.enabled = !!on; }
    return { setScale: setScale, scale: function () { return rscale; }, setBloom: setBloom, TAU: TAU, renderer: renderer, scene: scene, camera: camera, FOV: FOV, canvas: canvas, render: render,
      BW: BW, BH: BH, innerH: function () { return Math.max(2, Math.round(BH * rscale)); }, fbm: fbm, vnoise: vnoise, rnd: rnd, TEX: TEX, canvasTex: canvasTex, pixelTex: pixelTex,
      shared: shared, windify: windify, hazeify: hazeify, plush: plush, glow: glow, hdr: hdr };
  }
  return { create: create };
})();
