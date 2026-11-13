// mau_audio.js — nhạc nền + tiếng động dùng chung cho 2 mẫu. Toàn bộ nhạc/tiếng động sinh bằng Web Audio (không file mp3 mới);
// giọng baby lấy từ friends_sounds.js (bản chép của game thật).
window.StarAudio = (function () {
  const A = { ctx: null, master: null, music: null, sfx: null, buf: {}, mouth: null, muted: false, storm: 0, started: false, log: [] };
  function init() {
    if (A.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    try { A.ctx = new AC(); } catch (e) { return false; }
    A.master = A.ctx.createGain(); A.master.gain.value = 0.9; A.master.connect(A.ctx.destination);
    A.music = A.ctx.createGain(); A.music.gain.value = 0.16; A.music.connect(A.master);
    A.sfx = A.ctx.createGain(); A.sfx.gain.value = 1; A.sfx.connect(A.master);
    // tiếng ồn trắng dùng cho sấm / mưa / súng
    const len = A.ctx.sampleRate * 2, nb = A.ctx.createBuffer(1, len, A.ctx.sampleRate), d = nb.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    A.noiseBuf = nb;
    const src = window.FRIEND_SOUNDS || {};
    for (const id of Object.keys(src)) { A.buf[id] = {}; for (const k of Object.keys(src[id])) decodeOne(id, k, null); }
    return true;
  }
  function decodeOne(id, k, cb) {
    const raw = window.FRIEND_SOUNDS && window.FRIEND_SOUNDS[id] && window.FRIEND_SOUNDS[id][k];
    if (!raw || !A.ctx) return;
    const bin = atob(raw.split(',')[1]), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    A.ctx.decodeAudioData(arr.buffer, function (buf) { A.buf[id][k] = buf; if (cb) cb(buf); }, function () {});
  }
  function unlock() { if (!init()) return; if (A.ctx.state === 'suspended') A.ctx.resume(); if (!A.started) { A.started = true; startMusic(); } }
  function now() { return A.ctx ? A.ctx.currentTime : 0; }
  function setMute(m) { A.muted = m; if (A.master) A.master.gain.setTargetAtTime(m ? 0 : 0.9, now(), 0.05); }

  // ---------- tiếng động ----------
  function tone(freq, dur, type, vol, slideTo, delay, dest) {
    if (!A.ctx) return;
    const t = now() + (delay || 0), o = A.ctx.createOscillator(), g = A.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(dest || A.sfx); o.start(t); o.stop(t + dur + 0.02);
  }
  function noiseBurst(dur, vol, f0, f1, q, delay) { // sấm, súng, nước
    if (!A.ctx) return;
    const t = now() + (delay || 0), s = A.ctx.createBufferSource(), g = A.ctx.createGain(), f = A.ctx.createBiquadFilter();
    s.buffer = A.noiseBuf; s.loop = true; f.type = 'lowpass'; f.Q.value = q || 0.8;
    f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(40, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    s.connect(f); f.connect(g); g.connect(A.sfx); s.start(t); s.stop(t + dur + 0.05);
  }
  const FX = {
    jump: () => tone(320, 0.1, 'triangle', 0.16, 520),
    flap: () => { tone(480, 0.09, 'triangle', 0.12, 880); tone(720, 0.1, 'sine', 0.06, 1250, 0.05); },
    land: () => noiseBurst(0.08, 0.12, 600, 120),
    wing: () => { tone(660, 0.1, 'sine', 0.12, 990); tone(990, 0.18, 'sine', 0.08, 1480, 0.08); },
    gun:  () => { tone(440, 0.12, 'square', 0.08, 880); tone(660, 0.12, 'square', 0.08, 1320, 0.1); tone(880, 0.3, 'triangle', 0.1, 1760, 0.2); },
    shoot: () => { noiseBurst(0.14, 0.22, 2400, 300, 1.2); tone(520, 0.12, 'sawtooth', 0.08, 160); },
    poof: () => noiseBurst(0.12, 0.1, 1200, 200),
    sizzle: () => noiseBurst(0.35, 0.12, 5000, 1500, 0.5),
    hit_enemy: () => { tone(260, 0.12, 'square', 0.12, 120); noiseBurst(0.1, 0.15, 1500, 300); },
    hit_boss: () => { tone(180, 0.2, 'sawtooth', 0.16, 60); noiseBurst(0.18, 0.2, 900, 200); tone(1200, 0.08, 'sine', 0.1, 2000, 0.02); },
    bump: () => { tone(150, 0.16, 'sine', 0.22, 70); tone(420, 0.08, 'triangle', 0.06, 260, 0.02); },
    zapped: () => { tone(1800, 0.25, 'square', 0.08, 200); noiseBurst(0.2, 0.2, 4000, 400); },
    splash: () => { noiseBurst(0.35, 0.22, 1800, 300, 0.7); tone(300, 0.2, 'sine', 0.08, 120); },
    stroke: () => noiseBurst(0.18, 0.1, 1400, 500, 0.6),
    leap: () => { noiseBurst(0.3, 0.2, 2200, 400); tone(300, 0.2, 'triangle', 0.1, 700); },
    lightning_warn: () => tone(90, 0.5, 'sawtooth', 0.05, 60),
    lightning: () => { noiseBurst(0.06, 0.6, 9000, 3000, 0.3); noiseBurst(1.6, 0.5, 700, 60, 0.9, 0.05); tone(60, 1.2, 'sine', 0.3, 30, 0.05); },
    boss_intro: () => { tone(55, 2.2, 'sawtooth', 0.2, 40); noiseBurst(2.4, 0.3, 300, 80, 0.8); tone(110, 0.6, 'square', 0.08, 55, 0.4); tone(82, 0.6, 'square', 0.08, 41, 1.0); },
    swoop: () => tone(600, 0.6, 'sawtooth', 0.06, 150),
    boss_dead: () => { tone(400, 0.9, 'square', 0.1, 50); noiseBurst(0.9, 0.3, 1200, 100); },
    boss_poof: () => { noiseBurst(0.5, 0.35, 3000, 200); tone(880, 0.2, 'triangle', 0.14); tone(1100, 0.2, 'triangle', 0.14, 0, 0.13); tone(1320, 0.5, 'triangle', 0.14, 0, 0.26); },
    star_reveal: () => { for (let i = 0; i < 6; i++) tone(880 + i * 180, 0.25, 'sine', 0.08, 0, i * 0.07); },
    star: () => { tone(880, 0.12, 'sine', 0.13); tone(1320, 0.22, 'sine', 0.09, 0, 0.06); },
    win: () => { tone(660, 0.2, 'triangle', 0.14); tone(880, 0.2, 'triangle', 0.14, 0, 0.13); tone(1100, 0.45, 'triangle', 0.14, 0, 0.26); },
    enemy_hop: () => tone(260, 0.1, 'triangle', 0.08, 420),
    wind: () => {},
    click: () => tone(700, 0.04, 'triangle', 0.08),
  };
  function say(id, key, dur) { // giọng baby (1 miệng, như game thật)
    if (!A.ctx) return;
    const go = function (buf) {
      if (A.mouth) { try { A.mouth.stop(); } catch (e) {} }
      const s = A.ctx.createBufferSource(); s.buffer = buf; s.connect(A.sfx);
      if (dur) s.start(0, 0, Math.min(dur, buf.duration)); else s.start();
      A.mouth = s;
    };
    if (A.buf[id] && A.buf[id][key]) go(A.buf[id][key]); else decodeOne(id, key, go);
  }
  function play(evType, hero) {
    A.log.push(evType);
    if (!A.ctx) return;
    if (FX[evType]) FX[evType]();
    if (evType === 'ouch') say(hero, 'scream', 0.42);
    else if (evType === 'bump' || evType === 'zapped') say(hero, 'dizzy', 0.8);
    else if (evType === 'win') say(hero, 'pass1');
    else if (evType === 'boss_intro') say(hero, 'shock', 0.6);
  }

  // ---------- nhạc nền: 2 bài, chuyển theo cơn bão ----------
  // Nốt viết bằng số bán cung so với A4 = 440Hz. Mỗi bài = 4 ô nhịp × 8 nốt.
  const CALM = { bpm: 104, bass: [-21, -21, -24, -24, -17, -17, -14, -14], arp: [[-9, -5, -2, 3], [-12, -9, -5, 0], [-17, -14, -9, -5], [-14, -10, -7, -2]], lead: 'triangle' };
  const STORM = { bpm: 150, bass: [-19, -19, -19, -19, -22, -22, -24, -24], arp: [[-7, -4, 0, 5], [-7, -4, 0, 5], [-10, -7, -2, 2], [-12, -9, -5, 0]], lead: 'square' };
  function hz(n) { return 440 * Math.pow(2, n / 12); }
  let nextT = 0, step = 0, timer = null;
  function schedule() {
    if (!A.ctx) return;
    const song = A.storm > 0.5 ? STORM : CALM, spb = 60 / song.bpm / 2; // 8 nốt mỗi ô
    while (nextT < now() + 0.25) {
      const bar = Math.floor(step / 8) % 4, i = step % 8, t = nextT;
      // bass
      if (i % 2 === 0) tone(hz(song.bass[bar * 2 + (i >> 2)] ), spb * 1.8, 'sine', 0.5, 0, t - now(), A.music);
      // arpeggio
      const chord = song.arp[bar];
      tone(hz(chord[i % 4] + (i >= 4 ? 12 : 0)), spb * 0.9, song.lead, A.storm > 0.5 ? 0.22 : 0.3, 0, t - now(), A.music);
      // trống: hi-hat mỗi nốt, kick đầu ô, snare giữa ô (bão thì mạnh hơn)
      const kv = A.storm > 0.5 ? 1.6 : 1;
      hat(t, 0.05 * kv);
      if (i === 0) kick(t, 0.5 * kv);
      if (i === 4) snare(t, 0.25 * kv);
      nextT += spb; step++;
    }
  }
  function hat(t, v) { const s = A.ctx.createBufferSource(), g = A.ctx.createGain(), f = A.ctx.createBiquadFilter(); s.buffer = A.noiseBuf; f.type = 'highpass'; f.frequency.value = 7000;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.04); s.connect(f); f.connect(g); g.connect(A.music); s.start(t); s.stop(t + 0.06); }
  function kick(t, v) { const o = A.ctx.createOscillator(), g = A.ctx.createGain(); o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.18); o.connect(g); g.connect(A.music); o.start(t); o.stop(t + 0.2); }
  function snare(t, v) { const s = A.ctx.createBufferSource(), g = A.ctx.createGain(), f = A.ctx.createBiquadFilter(); s.buffer = A.noiseBuf; f.type = 'bandpass'; f.frequency.value = 1800;
    g.gain.setValueAtTime(v, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.12); s.connect(f); f.connect(g); g.connect(A.music); s.start(t); s.stop(t + 0.14); }
  function startMusic() { nextT = now() + 0.1; step = 0; if (timer) clearInterval(timer); timer = setInterval(schedule, 100); }
  function setStorm(v) { A.storm = v; }

  return { unlock: unlock, play: play, setMute: setMute, setStorm: setStorm, say: say, state: A };
})();
