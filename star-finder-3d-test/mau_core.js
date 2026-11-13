// mau_core.js — LÕI MÔ PHỎNG dùng chung cho 2 mẫu (mau_2d.html + mau_3d.html).
// Chép vật lý/enemy từ draw_run.html (Star Finder) rồi thêm: bơi, súng lửa, boss Vua Sấm (sét, gió, enemy nổi giận).
// Chỉ là MẪU để Nam chọn kiểu hình — không lưu gì, không đụng game thật.
window.StarCore = (function () {
  const CELL = 32, BAR = 64, ROWS = 18, COLS = 32, WW = 1024;
  const LVB = BAR + ROWS * CELL;
  const GRAV = 1800, MOVE = 230, ACC_G = 2400, ACC_A = 1500, JUMP = 660, MAXFALL = 1100;
  const RC = 20, RV = 21, LW = 8, COYOTE = 0.1, JBUF = 0.12, DT = 1 / 120;
  const ENEMY_V = 80, KNOCK_VX = 420, KNOCK_VY = 380;
  // bơi (mốc thử): nước kéo chậm lại, bấm Jump = quạt lên; sát mặt nước bấm Jump = phóng lên bờ
  const SWIM_GRAV = 320, SWIM_MAXFALL = 150, SWIM_MOVE = 150, SWIM_UP = 330, SWIM_EXIT = 560;
  // súng lửa (mốc thử)
  const FIRE_V = 600, FIRE_CD = 0.36, FIRE_R = 12, FIRE_RANGE = 1500;
  // boss Vua Sấm (mốc thử)
  const BOSS_HP = 5, BOSS_R = 70, TRIGGER_COL = 44, BOSS_HOME_COL = 55, BOSS_HOVER_Y = BAR + 4.2 * CELL;
  const TAU = Math.PI * 2;

  const KINDS = {
    block: {}, spike: { hz: true }, fire: { hz: true }, water: { swim: true },
    spring: {}, wing: {}, gun: {}, enemy: {}, star: {}, start: {},
  };
  // 1 màn mẫu dài 2 màn hình. Đất ở hàng 14 (cao hơn game thật 2 ô để hồ nước sâu 3 ô).
  const LEVEL = { cols: 64, objs: [
    { t: 'block', x: 0,  y: 14, w: 14, h: 4 },
    { t: 'water', x: 14, y: 14, w: 8,  h: 3 }, { t: 'block', x: 14, y: 17, w: 8, h: 1 },
    { t: 'block', x: 22, y: 14, w: 42, h: 4 },
    { t: 'spike', x: 27, y: 13, w: 2,  h: 1 },
    { t: 'block', x: 31, y: 9,  w: 6,  h: 1 }, { t: 'wing', x: 34, y: 8, w: 1, h: 1 },
    { t: 'block', x: 8,  y: 10, w: 3,  h: 1 },
    { t: 'gun',   x: 24, y: 13, w: 1,  h: 1 },
    { t: 'enemy', x: 38, y: 13, w: 1,  h: 1 }, { t: 'enemy', x: 52, y: 12, w: 2, h: 2 },
    { t: 'start', x: 2,  y: 13, w: 1,  h: 1 }, { t: 'star', x: 61, y: 13, w: 1, h: 1 },
  ] };
  const CHARS = ['froggy', 'chicken', 'babyfrog', 'pillow'];
  const CHAR3D = { froggy: { bottom: 1.02, top: 1.22 }, chicken: { bottom: 1.35, top: 1.3 }, babyfrog: { bottom: 1.1, top: 1.15 }, pillow: { bottom: 0.8, top: 0.8 } };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function approach(v, t, d) { return v < t ? Math.min(t, v + d) : Math.max(t, v - d); }
  function rectOf(o) { return { x: o.x * CELL, y: BAR + o.y * CELL, w: o.w * CELL, h: o.h * CELL }; }
  function inRect(px, py, r, pad) { pad = pad || 0; return px >= r.x - pad && px <= r.x + r.w + pad && py >= r.y - pad && py <= r.y + r.h + pad; }
  function circleRect(cx, cy, rad, r) {
    const px = clamp(cx, r.x, r.x + r.w), py = clamp(cy, r.y, r.y + r.h);
    return (cx - px) * (cx - px) + (cy - py) * (cy - py) < rad * rad;
  }
  function hazardHit(o) {
    const r = rectOf(o);
    if (o.t === 'spike') return { x: r.x + 5, y: r.y + 14, w: r.w - 10, h: r.h - 14 };
    return { x: r.x + 5, y: r.y + 10, w: r.w - 10, h: r.h - 10 };
  }
  function makeActor(id, r) {
    return { id: id, r: r, face: 'idle', skirt: [0, 0, 0, 0], skirtV: [0, 0, 0, 0], hat: 0, hatV: 0, leg: 0, wing: 0 };
  }

  function create(opts) {
    opts = opts || {};
    const level = JSON.parse(JSON.stringify(LEVEL));
    const heroId = opts.hero || 'froggy';
    const S = {
      clock: 0, events: [], hint: '', hintT: 0,
      won: false, wonT: 0, got: false, starShown: false, starDrop: 0, ouches: 0, bumps: 0,
      storm: 0, rage: false, wind: { dir: 0, t: 2, str: 0 },
      boss: null, lightning: [], fireballs: [], hasWing: false, hasGun: false, fireCd: 0, shots: 0, hitsOnBoss: 0,
      frozen: 0, // giây baby đứng im (màn boss ra mắt)
      swimT: 0,
    };
    const inp = { left: false, right: false, jumpPressed: false, fire: false };
    let solids = [], hazards = [], waters = [], enemies = [];
    const hero = Object.assign(makeActor(heroId, RV), {
      x: 0, y: 0, vx: 0, vy: 0, grounded: false, gn: [0, -1], coyote: 0, jbuf: 0, dir: 1,
      ouchT: 0, usedWing: false, st: 0, stV: 0, blinkT: 2, blinkOn: 0, winkT: 0, flapT: 0, landT: 0, tilt: 0,
      airJump: false, hurtT: 0, knockT: 0, swim: false, wasSwim: false, rc: RC });
    const star = level.objs.find(o => o.t === 'star');
    const gunObj = level.objs.find(o => o.t === 'gun');
    const wingObj = level.objs.find(o => o.t === 'wing');
    let gotWing = false, gotGun = false;

    function ev(type, data) { const e = Object.assign({ type: type, t: S.clock }, data || {}); S.events.push(e); return e; }
    function showHint(t) { S.hint = t; S.hintT = 4; }
    function enemyId(k) { const others = CHARS.filter(ch => ch !== hero.id); return others[k % others.length]; }

    function rebuild() {
      solids = []; hazards = []; waters = [];
      for (const o of level.objs) {
        const r = rectOf(o);
        if (o.t === 'block') solids.push({ k: 'r', x: r.x, y: r.y, w: r.w, h: r.h });
        else if (KINDS[o.t].hz) hazards.push({ o: o, hit: hazardHit(o) });
        else if (o.t === 'water') waters.push({ o: o, r: r });
      }
      spawnEnemies();
    }
    function enemyFromObj(o, k) {
      const n = o.w, st = level.objs.find(q => q.t === 'start');
      const e = Object.assign(makeActor(enemyId(k), RV * n), {
        o: o, k: k, n: n, rc: RC * n, vx: 0, vy: 0, grounded: false, gn: [0, -1], walk: true, stuckT: 0, gone: false,
        blinkT: 1 + k * 0.7, blinkOn: 0, winkT: 0, stunT: 0, swim: false, angry: false, hopCd: 0 });
      e.x = (o.x + n / 2) * CELL; e.y = BAR + (o.y + n) * CELL - e.rc - 1;
      e.dir = st && (st.x + 0.5) * CELL > e.x ? 1 : -1;
      return e;
    }
    function spawnEnemies() { enemies = []; let k = 0; for (const o of level.objs) if (o.t === 'enemy') enemies.push(enemyFromObj(o, k++)); }
    function levelW() { return level.cols * CELL; }
    function waterAt(x, y) { for (const w of waters) if (inRect(x, y, w.r)) return w; return null; }

    function collide(b) {
      const R = b.rc || RC;
      let ground = null;
      for (let it = 0; it < 3; it++) {
        let any = false;
        for (const s of solids) {
          const px = clamp(b.x, s.x, s.x + s.w), py = clamp(b.y, s.y, s.y + s.h);
          if (px === b.x && py === b.y) {
            const dl = b.x - s.x, dr = s.x + s.w - b.x, dtp = b.y - s.y, db = s.y + s.h - b.y, m = Math.min(dl, dr, dtp, db);
            if (m === dtp) { b.y = s.y - R; if (b.vy > 0) b.vy = 0; ground = [0, -1]; }
            else if (m === db) { b.y = s.y + s.h + R; if (b.vy < 0) b.vy = 0; }
            else if (m === dl) { b.x = s.x - R; if (b.vx > 0) b.vx = 0; }
            else { b.x = s.x + s.w + R; if (b.vx < 0) b.vx = 0; }
            any = true; continue;
          }
          const dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy;
          if (d2 >= R * R) continue;
          const d = Math.sqrt(d2), nx = d > 1e-4 ? dx / d : 0, ny = d > 1e-4 ? dy / d : -1, pen = R - d;
          b.x += nx * pen; b.y += ny * pen;
          const vn = b.vx * nx + b.vy * ny;
          if (vn < 0) { b.vx -= vn * nx; b.vy -= vn * ny; }
          if (ny < -0.55 && (!ground || ny < ground[1])) ground = [nx, ny];
          any = true;
        }
        if (!any) break;
      }
      return { ground: ground };
    }

    // ---------- ENEMY (tuần, bơi, nổi giận, bị choáng) ----------
    function groundAhead(e, d) {
      const px = e.x + d * e.rc * 0.7, foot = e.y + e.rc, y0 = foot - e.rc, y1 = foot + Math.max(20, e.rc * 0.9);
      for (const s of solids) if (px >= s.x && px <= s.x + s.w && s.y <= y1 && s.y + s.h >= y0) return true;
      return false;
    }
    function hazardAhead(e, d) {
      for (const h of hazards) if (circleRect(e.x + d * 6, e.y, e.rc, h.hit) && !circleRect(e.x, e.y, e.rc, h.hit)) return true;
      return false;
    }
    function waterAhead(e, d) { return !!waterAt(e.x + d * (e.rc + 8), e.y + e.rc * 0.5); }
    function canGo(e, d) {
      const nx = e.x + d * (e.rc + 2);
      return nx > 0 && nx < levelW() && (groundAhead(e, d) || waterAhead(e, d)) && !hazardAhead(e, d);
    }
    function enemyStep(e, dt) {
      if (e.gone) return;
      const speed = ENEMY_V * (S.rage ? 1.6 : 1);
      const w = waterAt(e.x, e.y);
      e.swim = !!w;
      if (e.stunT > 0) { // bị bắn trúng: nằm choáng, không đi
        e.stunT -= dt; e.walk = false;
        if (!e.grounded) { e.vy = Math.min(MAXFALL, e.vy + GRAV * dt); }
        e.vx = approach(e.vx, 0, (e.grounded ? 900 : 200) * dt);
      } else if (e.swim) { // bơi: nổi lên mặt nước, đi tiếp cùng hướng, tới bờ thì nhảy lên
        e.walk = true;
        const surf = w.r.y + e.rc * 0.75;
        e.vy = approach(e.vy, (surf - e.y) * 4, 900 * dt);
        e.vx = approach(e.vx, e.dir * speed * 0.7, 600 * dt);
        e.hopCd -= dt;
        const bank = e.x + e.dir * (e.rc + 10);
        if (e.hopCd <= 0 && !waterAt(bank, e.y + e.rc * 0.5) && groundAhead(e, e.dir)) { e.vy = -JUMP * 0.72; e.hopCd = 1; ev('enemy_hop', { x: e.x, y: e.y }); }
        else if (e.hopCd <= 0 && (bank <= 0 || bank >= levelW())) e.dir = -e.dir;
      } else if (e.grounded) {
        if (e.stuckT > 0.15) { e.dir = -e.dir; e.stuckT = 0; }
        else if (!canGo(e, e.dir) && canGo(e, -e.dir)) e.dir = -e.dir;
        e.walk = canGo(e, e.dir);
        const nx = e.gn[0], ny = e.gn[1], tx = -ny, ty = nx, v = e.walk ? e.dir * speed : 0;
        e.vx = v * tx - nx * 40; e.vy = v * ty - ny * 40;
      } else {
        e.vx = approach(e.vx, 0, ACC_A * dt);
        e.vy = Math.min(MAXFALL, e.vy + GRAV * dt);
      }
      const x0 = e.x;
      e.x += e.vx * dt; e.y += e.vy * dt;
      e.x = clamp(e.x, e.rc, levelW() - e.rc);
      if (e.y < BAR + e.rc) { e.y = BAR + e.rc; if (e.vy < 0) e.vy = 0; }
      const hit = collide(e);
      if (hit.ground) { e.grounded = true; e.gn = hit.ground; } else e.grounded = false;
      if (e.y > LVB + 60) { e.gone = true; return; }
      if (e.grounded && e.walk && !e.swim) e.stuckT = (e.x - x0) * e.dir < speed * dt * 0.3 ? e.stuckT + dt : 0;
      else e.stuckT = 0;
    }
    function animEnemies(dt) {
      for (const e of enemies) {
        e.blinkT -= dt; if (e.blinkT <= 0) { e.blinkOn = 0.13; e.blinkT = 2 + Math.random() * 2.5; }
        e.blinkOn -= dt; e.winkT -= dt;
        if (e.walk && (e.grounded || e.swim)) e.leg += dt * (S.rage ? 16 : 10);
        e.wing += dt * 3;
        e.angry = S.rage && e.stunT <= 0;
        e.face = e.stunT > 0 ? 'dizzy' : e.angry ? 'panic' : e.winkT > 0 ? 'wink' : e.blinkOn > 0 ? 'blink' : 'idle';
      }
    }

    // ---------- HERO ----------
    function startObj() { return level.objs.find(o => o.t === 'start'); }
    function respawn() {
      const s = startObj();
      hero.x = (s.x + 0.5) * CELL; hero.y = BAR + (s.y + 1) * CELL - RC - 1;
      hero.vx = 0; hero.vy = 0; hero.grounded = false; hero.coyote = 0; hero.jbuf = 0; hero.ouchT = 0;
      S.hasWing = false; hero.airJump = false; hero.hurtT = 0; hero.knockT = 0; hero.swim = false;
      gotWing = false; spawnEnemies();
    }
    function ouch(kind) {
      hero.ouchT = 0.75; S.ouches++; ev('ouch', { kind: kind, x: hero.x, y: hero.y });
    }
    function bump(e, dx) {
      const b = hero, s = dx > 0.5 ? 1 : dx < -0.5 ? -1 : -b.dir;
      b.vx = s * KNOCK_VX; b.vy = -KNOCK_VY; b.grounded = false; b.coyote = 0; b.jbuf = 0;
      b.hurtT = 0.7; b.knockT = 0.3; S.bumps++; if (e) e.winkT = 0.5;
      ev('bump', { x: b.x, y: b.y, s: s });
    }
    function shoot() {
      const b = hero;
      S.fireballs.push({ x: b.x + b.dir * (RC + 6), y: b.y - 2, vx: b.dir * FIRE_V, vy: 0, dist: 0, life: 1 });
      S.fireCd = FIRE_CD; S.shots++; b.flapT = 0.1;
      ev('shoot', { x: b.x + b.dir * RC, y: b.y, dir: b.dir });
    }
    function physStep(dt) {
      const b = hero;
      S.clock += dt;
      if (S.frozen > 0) S.frozen -= dt;
      if (b.ouchT > 0) { b.ouchT -= dt; if (b.ouchT <= 0) respawn(); stepWorld(dt); return; }
      for (const e of enemies) enemyStep(e, dt);
      if (b.hurtT > 0) b.hurtT -= dt;
      if (b.knockT > 0) b.knockT -= dt;
      if (S.fireCd > 0) S.fireCd -= dt;
      const w = waterAt(b.x, b.y + 4);
      b.swim = !!w;
      if (b.swim && !b.wasSwim) { ev('splash', { x: b.x, y: w.r.y, big: b.vy > 250 }); }
      if (!b.swim && b.wasSwim) { ev('exit_water', { x: b.x, y: b.y }); }
      b.wasSwim = b.swim;
      const canCtl = !S.won && b.knockT <= 0 && S.frozen <= 0;
      const dirIn = canCtl ? (inp.right ? 1 : 0) - (inp.left ? 1 : 0) : 0;
      if (dirIn) b.dir = dirIn;
      if (inp.jumpPressed) { inp.jumpPressed = false; if (canCtl) b.jbuf = JBUF; }
      if (b.jbuf > 0) b.jbuf -= dt;
      if (b.coyote > 0) b.coyote -= dt;
      if (inp.fire && canCtl && S.hasGun && S.fireCd <= 0) shoot();
      const windF = S.wind.str * S.wind.dir;
      if (b.swim) {
        S.swimT += dt;
        b.vx = approach(b.vx, dirIn * SWIM_MOVE, 700 * dt);
        b.vy = Math.min(SWIM_MAXFALL, b.vy + SWIM_GRAV * dt);
        if (b.jbuf > 0) {
          b.jbuf = 0;
          const nearTop = b.y - w.r.y < RC * 1.4;
          if (nearTop) { b.vy = -SWIM_EXIT; b.flapT = 0.3; ev('leap', { x: b.x, y: w.r.y }); }
          else { b.vy = -SWIM_UP; b.flapT = 0.2; ev('stroke', { x: b.x, y: b.y }); }
        }
        b.grounded = false; b.coyote = 0;
      } else if (b.grounded) {
        const nx = b.gn[0], ny = b.gn[1], tx = -ny, ty = nx;
        const vt = approach(b.vx * tx + b.vy * ty, dirIn * MOVE + windF * 0.15, ACC_G * dt);
        b.vx = vt * tx - nx * 40; b.vy = vt * ty - ny * 40;
      } else {
        if (b.knockT <= 0) b.vx = approach(b.vx, dirIn * MOVE + windF * 0.8, ACC_A * dt);
        b.vy = Math.min(MAXFALL, b.vy + GRAV * dt);
      }
      if (!b.swim) {
        if (b.jbuf > 0 && (b.grounded || b.coyote > 0)) {
          b.vy = -JUMP; b.jbuf = 0; b.coyote = 0; b.grounded = false; b.flapT = 0.3; ev('jump', { x: b.x, y: b.y + RC });
        } else if (b.jbuf > 0 && b.airJump) {
          b.vy = -JUMP; b.jbuf = 0; b.airJump = false; b.flapT = 0.45; b.usedWing = true; ev('flap', { x: b.x, y: b.y });
        }
      }
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < RC) { b.x = RC; if (b.vx < 0) b.vx = 0; }
      if (b.x > levelW() - RC) { b.x = levelW() - RC; if (b.vx > 0) b.vx = 0; }
      if (b.y < BAR + RC) { b.y = BAR + RC; if (b.vy < 0) b.vy = 0; }
      const wasG = b.grounded, impact = b.vy;
      const hit = collide(b);
      if (hit.ground) {
        b.grounded = true; b.gn = hit.ground; b.coyote = COYOTE;
        if (!wasG && impact > 300) { b.landT = 0.16; ev('land', { x: b.x, y: b.y + RC, hard: impact > 700 }); }
        if (S.hasWing) b.airJump = true;
      } else b.grounded = false;
      if (b.hurtT <= 0 && !S.won) for (const e of enemies) {
        if (e.gone || e.stunT > 0) continue;
        const dx = b.x - e.x, dy = b.y - e.y, rr2 = RC + e.rc - 4;
        if (dx * dx + dy * dy < rr2 * rr2) { bump(e, dx); break; }
      }
      for (const h of hazards) if (circleRect(b.x, b.y, RC - 2, h.hit)) { ouch(h.o.t); return; }
      if (b.y > LVB + 60) { ouch('fall'); return; }
      // nhặt đồ
      if (!gotWing) { const cx = (wingObj.x + 0.5) * CELL, cy = BAR + (wingObj.y + 0.5) * CELL;
        if ((b.x - cx) ** 2 + (b.y - cy) ** 2 < (RC + 16) ** 2) { gotWing = true; S.hasWing = true; if (!b.grounded) b.airJump = true; ev('wing', { x: cx, y: cy }); showHint('Tap Jump again in the air!'); } }
      if (!gotGun) { const cx = (gunObj.x + 0.5) * CELL, cy = BAR + (gunObj.y + 0.5) * CELL;
        if ((b.x - cx) ** 2 + (b.y - cy) ** 2 < (RC + 16) ** 2) { gotGun = true; S.hasGun = true; ev('gun', { x: cx, y: cy }); showHint('Fire Gun! Tap Attack to shoot'); } }
      if (S.starShown && !S.got && S.starDrop >= 1) { const cx = (star.x + 0.5) * CELL, cy = BAR + (star.y + 0.5) * CELL;
        if ((b.x - cx) ** 2 + (b.y - cy) ** 2 < (RC + 16) ** 2) { S.got = true; S.won = true; S.wonT = 0; b.winkT = 0.45; ev('star', { x: cx, y: cy }); ev('win', {}); } }
      stepWorld(dt);
    }

    // ---------- THẾ GIỚI: đạn lửa, boss, sét, gió ----------
    function stepWorld(dt) {
      // đạn lửa
      for (const f of S.fireballs) {
        if (f.life <= 0) continue;
        f.x += f.vx * dt; f.dist += Math.abs(f.vx) * dt;
        if (f.dist > FIRE_RANGE || f.x < 0 || f.x > levelW()) { f.life = 0; ev('poof', { x: f.x, y: f.y }); continue; }
        let hitWall = false;
        for (const s of solids) if (circleRect(f.x, f.y, FIRE_R, s)) { hitWall = true; break; }
        if (hitWall) { f.life = 0; ev('poof', { x: f.x, y: f.y, wall: true }); continue; }
        if (waterAt(f.x, f.y)) { f.life = 0; ev('sizzle', { x: f.x, y: f.y }); continue; }
        for (const e of enemies) {
          if (e.gone || e.stunT > 0) continue;
          const dx = e.x - f.x, dy = e.y - f.y;
          if (dx * dx + dy * dy < (e.rc + FIRE_R) ** 2) {
            e.stunT = 2.4; e.vx = Math.sign(f.vx) * 240; e.vy = -300; e.grounded = false; f.life = 0;
            ev('hit_enemy', { x: e.x, y: e.y, dir: Math.sign(f.vx) }); break;
          }
        }
        if (f.life <= 0) continue;
        const B = S.boss;
        if (B && B.state === 'fight') {
          const dx = B.x - f.x, dy = B.y - f.y;
          if (dx * dx + dy * dy < (BOSS_R + FIRE_R) ** 2) {
            f.life = 0; B.hp--; B.hurtT = 0.45; S.hitsOnBoss++;
            ev('hit_boss', { x: f.x, y: f.y, hp: B.hp });
            if (B.hp <= 0) { B.state = 'dead'; B.deadT = 0; B.vy = -200; ev('boss_dead', { x: B.x, y: B.y }); }
            else B.atkT = Math.min(B.atkT, 0.8); // bị đau → giáng sét sớm hơn
          }
        }
      }
      S.fireballs = S.fireballs.filter(f => f.life > 0);

      // boss
      const B = S.boss;
      if (!B) {
        if (hero.x > TRIGGER_COL * CELL && hero.ouchT <= 0) {
          S.boss = { state: 'intro', t: 0, x: BOSS_HOME_COL * CELL, y: BAR - 160, hp: BOSS_HP, hurtT: 0, atkT: 2.4, swoop: 0, swoopT: 0, n: 0, vy: 0, deadT: 0, rot: 0 };
          S.frozen = 2.0; showHint('THUNDER KING!'); ev('boss_intro', { x: S.boss.x });
        }
      } else if (B.state === 'intro') {
        B.t += dt; S.storm = clamp(S.storm + dt / 1.4, 0, 1);
        B.y = approach(B.y, BOSS_HOVER_Y, 260 * dt);
        if (B.t > 2.2) { B.state = 'fight'; S.rage = true; S.wind.t = 0.5; ev('boss_fight', {}); showHint('Shoot when it dives down!'); }
      } else if (B.state === 'fight') {
        B.t += dt; if (B.hurtT > 0) B.hurtT -= dt;
        S.storm = clamp(S.storm + dt / 1.4, 0, 1);
        const homeX = BOSS_HOME_COL * CELL;
        const tx = clamp(homeX + Math.sin(B.t * 0.55) * 150, (TRIGGER_COL + 2) * CELL, levelW() - 100);
        B.x = approach(B.x, tx, 120 * dt);
        let ty = BOSS_HOVER_Y + Math.sin(B.t * 1.3) * 16;
        if (B.swoopT > 0) { B.swoopT -= dt; ty = BOSS_HOVER_Y + 235; } // sà thấp = lúc đứng dưới đất bắn trúng được (lúc bay cao phải nhảy mới tới)
        B.y = approach(B.y, ty, 300 * dt);
        if (B.swoopT > 0) { // thân boss lúc sà xuống đụng baby → hất văng
          const dx = hero.x - B.x, dy = hero.y - B.y;
          if (hero.hurtT <= 0 && dx * dx + dy * dy < (BOSS_R + RC - 10) ** 2) bump(null, dx);
        }
        const period = B.hp <= 2 ? 1.7 : 2.4;
        B.atkT -= dt;
        if (B.atkT <= 0) {
          B.atkT = period; B.n++;
          if (B.n % 3 === 0) { B.swoopT = 1.6; ev('swoop', { x: B.x }); }
          else {
            const useHero = Math.random() < 0.65 && hero.x > (TRIGGER_COL - 4) * CELL;
            const x = useHero ? hero.x + hero.vx * 0.35 : (TRIGGER_COL + 1 + Math.random() * (level.cols - TRIGGER_COL - 2)) * CELL;
            S.lightning.push({ x: clamp(x, 40, levelW() - 40), y: groundYAt(x), warn: 0.85, strike: 0, phase: 'warn', from: { x: B.x, y: B.y } });
            ev('lightning_warn', { x: x });
          }
        }
        // gió đổi chiều
        S.wind.t -= dt;
        if (S.wind.t <= 0) { S.wind.t = 2.5 + Math.random() * 2; const d = [-1, 0, 1][Math.floor(Math.random() * 3)]; S.wind.dir = d; ev('wind', { dir: d }); }
        S.wind.str = approach(S.wind.str, S.wind.dir ? 170 : 0, 300 * dt);
      } else if (B.state === 'dead') {
        B.deadT += dt; B.vy += GRAV * 0.6 * dt; B.y += B.vy * dt; B.rot += dt * 5;
        S.rage = false; S.wind.dir = 0; S.wind.str = approach(S.wind.str, 0, 400 * dt);
        S.storm = clamp(S.storm - dt / 2.2, 0, 1);
        if (B.deadT > 1.5) { B.state = 'gone'; ev('boss_poof', { x: B.x, y: B.y }); S.starShown = true; S.starDrop = 0; ev('star_reveal', { x: (star.x + 0.5) * CELL }); showHint('The star is yours — go get it!'); }
      } else { // gone
        S.storm = clamp(S.storm - dt / 2.2, 0, 1);
        S.wind.str = approach(S.wind.str, 0, 400 * dt);
      }
      if (S.starShown && S.starDrop < 1) S.starDrop = Math.min(1, S.starDrop + dt / 1.1);
      // sét: báo trước → giáng
      for (const L of S.lightning) {
        if (L.phase === 'warn') { L.warn -= dt; L.from = { x: B.x, y: B.y }; if (L.warn <= 0) { L.phase = 'strike'; L.strike = 0.32; ev('lightning', { x: L.x, y: L.y, from: L.from });
            const dx = hero.x - L.x; if (Math.abs(dx) < 52 && hero.y > L.y - 150 && hero.hurtT <= 0 && hero.ouchT <= 0) { bump(null, dx || 1); hero.hurtT = 1.0; ev('zapped', { x: hero.x, y: hero.y }); } } }
        else if (L.phase === 'strike') { L.strike -= dt; if (L.strike <= 0) L.phase = 'done'; }
      }
      S.lightning = S.lightning.filter(L => L.phase !== 'done');
      if (S.won) S.wonT += dt;
      if (S.hintT > 0) S.hintT -= dt;
    }
    function groundYAt(x) { // mặt đất/mặt nước đầu tiên dưới đỉnh màn tại cột x
      let best = LVB;
      for (const s of solids) if (x >= s.x && x <= s.x + s.w && s.y < best) best = s.y;
      for (const w of waters) if (x >= w.r.x && x <= w.r.x + w.r.w && w.r.y < best) best = w.r.y;
      return best;
    }

    function animHero(dt) {
      const b = hero;
      b.blinkT -= dt; if (b.blinkT <= 0) { b.blinkOn = 0.13; b.blinkT = 1.8 + Math.random() * 2.5; }
      b.blinkOn -= dt; b.winkT -= dt; b.flapT -= dt; b.landT -= dt;
      const moving = (b.grounded || b.swim) && Math.abs(b.vx) > 20 && b.ouchT <= 0;
      if (moving) b.leg += dt * (b.swim ? 8 : 14);
      let tgt;
      if (b.ouchT > 0) tgt = -0.15;
      else if (b.landT > 0) tgt = -0.16;
      else if (b.swim) tgt = Math.sin(S.clock * 4) * 0.04;
      else if (!b.grounded) tgt = b.vy < 0 ? 0.14 : -0.05;
      else tgt = moving ? Math.abs(Math.sin(b.leg)) * 0.07 : Math.sin(S.clock * 2.2) * 0.03;
      b.stV += ((tgt - b.st) * 180 - b.stV * 12) * dt; b.st += b.stV * dt;
      const fall = !b.grounded && !b.swim && b.ouchT <= 0 ? clamp(b.vy / 700, -0.6, 1) : 0;
      for (let i = 0; i < 4; i++) { b.skirtV[i] += ((fall * (0.85 + 0.1 * i) - b.skirt[i]) * 260 - b.skirtV[i] * 14) * dt; b.skirt[i] += b.skirtV[i] * dt; }
      b.hatV += ((fall - b.hat) * 120 - b.hatV * 8) * dt; b.hat += b.hatV * dt;
      b.wing += dt * (!b.grounded ? 16 : 3);
      b.tilt = approach(b.tilt, b.ouchT <= 0 ? clamp(b.vx / MOVE, -1, 1) * 0.08 : 0, dt * 2);
      let f = b.blinkOn > 0 ? 'blink' : 'idle';
      if (b.ouchT > 0) f = 'ouch';
      else if (S.won) f = 'phew';
      else if (b.hurtT > 0.2) f = 'dizzy';
      else if (b.winkT > 0) f = 'wink';
      else if (b.swim) f = b.vy < -100 ? 'flap' : 'idle';
      else if (!b.grounded && b.vy < -150) f = 'flap';
      else if (!b.grounded && b.vy > 650) f = 'panic';
      else if (!b.grounded && b.vy > 250) f = 'fall';
      if (S.frozen > 0 && S.boss && S.boss.state === 'intro') f = 'shock';
      b.face = f;
    }

    let acc = 0;
    function update(dt) { // gọi mỗi khung; vật lý chạy bước cố định 1/120 như game thật
      acc += dt; let n = 0;
      while (acc >= DT && n < 8) { physStep(DT); acc -= DT; n++; }
      if (n >= 8) acc = 0;
      animHero(dt); animEnemies(dt);
    }
    function drain() { const e = S.events; S.events = []; return e; }

    rebuild(); respawn();
    showHint('Find the fire gun, then face the Thunder King!');
    return {
      S: S, inp: inp, hero: hero, level: level, update: update, drain: drain,
      enemies: function () { return enemies; }, waters: function () { return waters; }, solids: function () { return solids; },
      star: star, gun: gunObj, wing: wingObj, gotGun: function () { return gotGun; }, gotWing: function () { return gotWing; },
      levelW: levelW, groundYAt: groundYAt, respawn: respawn,
      C: { CELL: CELL, BAR: BAR, ROWS: ROWS, COLS: COLS, WW: WW, LVB: LVB, RC: RC, RV: RV, LW: LW, FIRE_R: FIRE_R, BOSS_R: BOSS_R, BOSS_HP: BOSS_HP, TRIGGER_COL: TRIGGER_COL, CHAR3D: CHAR3D, TAU: TAU },
      util: { clamp: clamp, approach: approach, rectOf: rectOf, inRect: inRect, circleRect: circleRect, makeActor: makeActor },
    };
  }
  return { create: create, LEVEL: LEVEL };
})();
