/* chess_app.js — ráp luật (chess_core) + hình (chess_view) + bảng hai đầu + nút ⚙ của MẪU cờ vua Bon.
   Lưu lựa chọn ⚙ ở khoá RIÊNG của mẫu (bon_chess_mau_v1) — không đụng game thật nào. */
(function () {
  'use strict';
  const C = window.ChessCore;
  const KEY = 'bon_chess_mau_v1';
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  /* board: kiểu bàn lúc chơi — 'flat' (phẳng kiểu chess.com, Nam gửi 11-21, mặc định mới) hoặc 3 kiểu 3D (tiltTurn / tiltFixed / topBadge) + 'top'.
     style: kiểu quân khi bàn 3D. fight: 'arena' (chuyển cảnh, mặc định) / 'board'. customs + layout: quân Bon tự chế + bàn đã xếp (tường…). */
  const DEF = { board: 'flat', style: 'warriors', fight: 'arena', death: 'topple', battleLen: 'long', cutscene: 'toward', dice: 'off', diceIds: [], sound: 'on', demo: 'p-q', demoMode: 'show',
    customs: [], layout: { walls: [], pieces: [], removed: [] } };
  const set = Object.assign({}, DEF);
  try { Object.assign(set, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* chỗ lưu bị chặn → dùng mặc định */ }
  if (!set.layout || !Array.isArray(set.layout.walls)) set.layout = { walls: [], pieces: [], removed: [] };
  if (!Array.isArray(set.customs)) set.customs = [];
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(set)); } catch (e) { /* bỏ qua */ } };
  const rand = () => { try { return crypto.getRandomValues(new Uint32Array(1))[0] / 4294967296; } catch (e) { return Math.random(); } };

  /* ---------- âm thanh (tiếng thật Mixkit + tiếng xúc xắc tự tạo) ---------- */
  const SND = { ctx: null, buf: {}, ok: false };
  function sndInit() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC || SND.ctx) return;
    SND.ctx = new AC();
    const src = window.CHESS_SOUNDS || {};
    for (const k of Object.keys(src)) {
      const bin = atob(src[k].split(',')[1]), arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      SND.ctx.decodeAudioData(arr.buffer, b => { SND.buf[k] = b; }, () => {});
    }
  }
  function unlock() {
    sndInit();
    if (!SND.ctx) return;
    if (SND.ctx.state !== 'running') SND.ctx.resume();
    if (!SND.ok) { const b = SND.ctx.createBuffer(1, 1, 22050), s = SND.ctx.createBufferSource(); s.buffer = b; s.connect(SND.ctx.destination); s.start(0); SND.ok = true; }
  }
  window.addEventListener('pointerdown', unlock, { passive: true });
  window.addEventListener('touchend', unlock, { passive: true });
  const sfxLog = [];
  function sfx(key, vol, rate) {
    sfxLog.push(key); if (sfxLog.length > 300) sfxLog.shift();
    if (set.sound !== 'on' || !SND.ctx) return;
    if (key === 'dice') { rattle(vol || 0.8); return; }
    const b = SND.buf[key]; if (!b) return;
    const s = SND.ctx.createBufferSource(); s.buffer = b; s.playbackRate.value = rate || 1;
    const g = SND.ctx.createGain(); g.gain.value = vol === undefined ? 1 : vol;
    s.connect(g); g.connect(SND.ctx.destination); s.start();
  }
  function rattle(vol) {
    const ctx = SND.ctx; let t = ctx.currentTime + 0.01;
    for (let i = 0; i < 15; i++) {            // ~1,4 giây, khớp xúc xắc lăn lâu hơn (Nam 11-21)
      const buf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 0.025), ctx.sampleRate), d = buf.getChannelData(0);
      for (let j = 0; j < d.length; j++) d[j] = (Math.random() * 2 - 1) * Math.pow(1 - j / d.length, 3);
      const s = ctx.createBufferSource(); s.buffer = buf;
      const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = 2200 + Math.random() * 1800; f.Q.value = 3;
      const g = ctx.createGain(); g.gain.value = vol * Math.max(0.12, 0.9 - i * 0.05);
      s.connect(f); f.connect(g); g.connect(ctx.destination); s.start(t);
      t += 0.035 + i * 0.008 + Math.random() * 0.015;
    }
  }

  /* ---------- bố cục: hai bảng ở hai đầu, bảng đầu xa xoay ngược ---------- */
  const pW = $('#pW'), pB = $('#pB'), wrap = $('#boardWrap');
  const panelOf = c => (c === 'w' ? pW : pB);
  let view = null, orient = 'portrait';
  function layout() {
    const vw = window.innerWidth, vh = window.innerHeight, minP = 150;
    orient = vw >= vh * 1.05 ? 'landscape' : 'portrait';
    if (orient === 'portrait') {
      const bs = Math.floor(Math.min(vw - 8, vh - 2 * minP)), ph = Math.floor((vh - bs) / 2);
      Object.assign(wrap.style, { left: Math.floor((vw - bs) / 2) + 'px', top: ph + 'px', width: bs + 'px', height: bs + 'px' });
      const parts = [[pB, 0, ph, 180], [pW, ph + bs, vh - ph - bs, 0]];
      for (const [p, top, h, rot] of parts) {
        Object.assign(p.style, { left: '0px', top: top + 'px', width: vw + 'px', height: h + 'px' });
        Object.assign($('.pin', p).style, { width: vw + 'px', height: h + 'px', transform: `translate(-50%,-50%) rotate(${rot}deg)` });
      }
    } else {
      const bs = Math.floor(Math.min(vh - 8, vw - 2 * minP)), pw = Math.floor((vw - bs) / 2);
      Object.assign(wrap.style, { left: pw + 'px', top: Math.floor((vh - bs) / 2) + 'px', width: bs + 'px', height: bs + 'px' });
      const parts = [[pW, 0, pw, 90], [pB, pw + bs, vw - pw - bs, -90]];
      for (const [p, left, w, rot] of parts) {
        Object.assign(p.style, { left: left + 'px', top: '0px', width: w + 'px', height: vh + 'px' });
        Object.assign($('.pin', p).style, { width: vh + 'px', height: w + 'px', transform: `translate(-50%,-50%) rotate(${rot}deg)` });
      }
    }
    const g = $('#gear'), wl = parseFloat(wrap.style.left), wt = parseFloat(wrap.style.top);
    Object.assign(g.style, { left: (wl + 4) + 'px', top: (wt + 4) + 'px', right: 'auto', bottom: 'auto' });
    if (view) view.setOrientation(orient);
  }

  /* ---------- ván cờ ---------- */
  let S = null, sel = -1, busy = false, pendingPromo = null, mode = 'play';
  function diceGameCards() {
    if (set.dice === 'off') return [];
    return [{ kind: 'dice', apply: set.dice, ids: set.dice === 'select' ? set.diceIds.slice() : [] }];
  }
  function diceBadges() {   // 🎲 trên con được chọn (thẻ chỉ để hiện hình, luật không đọc thẻ này)
    if (set.dice !== 'select') return [];
    return set.diceIds.map(h => ({ home: h, cards: [{ kind: 'diceMark', emoji: '🎲' }] }));
  }
  /* bàn đã xếp (Nam 11-21): bỏ quân · đặt quân Bon tự chế · tường. Vua không bỏ được. */
  function applyLayout(S0) {
    const L = set.layout;
    for (const q of L.removed) { const p = S0.board[q]; if (p && p.t !== 'k') C.clearSquare(S0, q); }
    for (const pc of L.pieces) {
      const def = set.customs.find(d => d.id === pc.id), cur = S0.board[pc.sq];
      if (def && !(cur && cur.t === 'k')) C.placePiece(S0, pc.sq, 'x', pc.c, def);
    }
    for (const q of L.walls) C.setWall(S0, q, true);
    S0.customDefs = set.customs.map(C.normDef);
    return S0;
  }
  function applyLook() {
    if (set.board === 'flat') view.setStyle('flat');
    else { view.setCfg({ view: set.board }); view.setStyle(set.style); }
  }
  function newGame() {
    S = applyLayout(C.newGame());
    C.setupCards(S, diceBadges(), {}, diceGameCards());
    sel = -1; pendingPromo = null; mode = 'play';
    view.sync(S);
    view.setMarks({ sel: -1, moves: [], last: null, check: -1, chosen: [] });
    hideDice(); refresh();
  }
  function applyDiceToCurrent() {
    S.gameCards = diceGameCards();
    const ids = set.dice === 'select' ? set.diceIds : [];
    for (let s = 0; s < 64; s++) {
      const p = S.board[s]; if (!p) continue;
      const keep = (p.cards || []).filter(c => c.kind !== 'diceMark');
      if (ids.indexOf(p.home) >= 0) keep.push({ kind: 'diceMark', emoji: '🎲' });
      S.board[s] = Object.assign({}, p, { cards: keep });
    }
    view.sync(S);
  }
  const SYM = { w: { p: '♙', n: '♘', b: '♗', r: '♖', q: '♕', k: '♔' }, b: { p: '♟', n: '♞', b: '♝', r: '♜', q: '♛', k: '♚' } };
  function refresh() {
    for (const c of ['w', 'b']) {
      const P = panelOf(c), st = $('.status', P), over = S.result;
      P.classList.remove('turn', 'check', 'won');
      $('.newg', P).classList.toggle('hidden', !over);
      $('.flag', P).classList.toggle('hidden', !!over);
      $('.endturn', P).classList.toggle('hidden', !(S.pending && S.turn === c && !over));
      $('.promo', P).classList.add('hidden');      // phong cấp giờ hiện bằng danh sách to giữa bàn (#promoList)
      if (over) {
        $('.flagmenu', P).classList.add('hidden'); $('.drawask', P).classList.add('hidden');
        if (over.winner === c) { st.textContent = 'You win! 🏆'; P.classList.add('won'); }
        else if (over.winner) st.textContent = ({ mate: 'Checkmate 😮', resign: 'You resigned', exposed: 'King exposed 😮', king: 'King fell 😮' })[over.reason] || 'You lost';
        else st.textContent = over.reason === 'stalemate' ? 'Draw — no moves' : 'Draw 🤝';
      } else if (S.turn === c) {
        const chk = C.inCheck(S, c);
        st.textContent = chk ? 'Check! ⚠️' : (S.pending ? 'Move again or End turn' : 'Your turn');
        P.classList.add('turn'); if (chk) P.classList.add('check');
      } else st.textContent = 'Waiting…';
      const opp = c === 'w' ? 'b' : 'w';
      $('.caps', P).textContent = S.grave[opp].map(p => (p.t === 'x' ? ((p.def && p.def.emoji) || '⭐') : SYM[opp][p.t])).join('');
    }
  }
  function hideDice() { for (const P of [pW, pB]) { const d = $('.dice', P); d.textContent = ''; d.classList.remove('win'); } }
  function showDice(side, value, tag) {
    if (tag === 'tie') { for (const P of [pW, pB]) $('.dice', P).textContent = '🎲 ='; return; }
    if (tag === 'win') { const d = $('.dice', panelOf(side)); d.classList.add('win'); d.textContent = '🎲 ' + value + ' ✓'; return; }
    $('.dice', panelOf(side)).textContent = '🎲 ' + value;
  }
  const legalNow = () => C.legalMoves(S);
  function movesFrom(sq) { return legalNow().filter(m => (m.k === 'mv' || m.k === 'sw') && m.from === sq); }
  function markMoves(sq) {
    const uniq = new Map();
    for (const m of movesFrom(sq)) {
      const kind = m.k === 'sw' ? 'swap' : (S.board[m.to] || m.ep ? 'capture' : 'move');
      if (!uniq.has(m.to)) uniq.set(m.to, { to: m.to, kind });
    }
    view.setMarks({ sel: sq, moves: Array.from(uniq.values()) });
  }
  async function doMove(m) {
    busy = true; sel = -1; pendingPromo = null;
    view.setMarks({ sel: -1, moves: [] });
    const before = S, R = C.play(S, m, { rng: rand });
    hideDice();
    refreshDuring(R.S);
    await view.play(R.ev, before, R.S, { dice: showDice });
    S = R.S;
    const chk = R.ev.find(e => e.type === 'check');
    view.setMarks({ last: (m.k === 'mv' || m.k === 'sw') ? [m.from, m.to] : (m.k === 'rv' ? [m.to] : null), check: chk ? C.kingSq(S, chk.c) : -1 });
    if (S.result) sfx('fanfare', 0.9); else if (chk) sfx('check', 0.7);
    busy = false;
    refresh();
    if (S.pending) { sel = C.findSq(S, S.pending.id); markMoves(sel); }
    setTimeout(() => { if (!busy) hideDice(); }, 2600);
  }
  function refreshDuring() { for (const P of [pW, pB]) { P.classList.remove('turn', 'check'); $('.status', P).textContent = '⚔️'; } }

  /* ---------- phong cấp: tốt tới cuối bàn → danh sách to giữa bàn, quay về người vừa đi (Nam 11-21) ---------- */
  const promoEl = $('#promoList');
  const PNAME = { q: 'Queen', r: 'Rook', b: 'Bishop', n: 'Knight' };
  function showPromo(ms) {
    const c = S.turn, box = $('.pl-opts', promoEl);
    box.innerHTML = '';
    const ICN = window.CHESS_ICONS || {};
    for (const m of ms) {
      const b = document.createElement('button');
      b.className = 'pl-opt'; b.dataset.p = m.promo;
      const cd = m.promo.indexOf('x:') === 0 ? set.customs.find(d => d.id === m.promo.slice(2)) : null;
      const ic = cd ? '<span class="ic">' + cd.emoji + '</span>' : (ICN[c + m.promo] ? '<span class="ic"><img alt="" src="' + ICN[c + m.promo] + '"></span>' : '<span class="ic">' + (SYM[c][m.promo] || '★') + '</span>');
      b.innerHTML = ic + '<span class="nm">' + (cd ? cd.name : (PNAME[m.promo] || 'Custom')) + '</span>';
      if (cd) b.style.borderColor = '#ff6b6b';
      b.addEventListener('click', ev => { ev.stopPropagation(); hidePromo(); doMove(m); });
      box.appendChild(b);
    }
    const rot = orient === 'portrait' ? (c === 'w' ? 0 : 180) : (c === 'w' ? 90 : -90);
    Object.assign(promoEl.style, { left: wrap.style.left, top: wrap.style.top, width: wrap.style.width, height: wrap.style.height, transform: 'rotate(' + rot + 'deg)' });
    promoEl.classList.remove('hidden');
  }
  function hidePromo() { promoEl.classList.add('hidden'); }
  promoEl.addEventListener('pointerdown', ev => ev.stopPropagation());

  function onTap(e) {
    if (!view || !S) return;
    if (view.playing) { view.skip(); return; }          // chạm lúc đang đánh / đổ xúc xắc → bỏ qua (Nam 11-21)
    if (busy) return;
    const sq = view.pick(e.clientX, e.clientY);
    if (mode === 'select') { toggleDicePiece(sq); return; }
    if (mode === 'setup') { setupTap(sq); return; }
    if (S.result || sq < 0 || pendingPromo) return;
    if (sel >= 0) {
      const ms = movesFrom(sel).filter(m => m.to === sq);
      if (ms.length) {
        if (ms.length > 1 && ms.every(m => m.promo)) { pendingPromo = ms; refresh(); showPromo(ms); return; }
        doMove(ms.find(m => m.castle) || ms[0]);
        return;
      }
    }
    const p = S.board[sq];
    if (p && p.c === S.turn && (!S.pending || p.id === S.pending.id)) { sel = sq; sfx('select', 0.5); markMoves(sq); }
    else { sel = -1; view.setMarks({ sel: -1, moves: [] }); if (S.pending) { sel = C.findSq(S, S.pending.id); markMoves(sel); } }
  }

  /* ---------- nút trong hai bảng ---------- */
  for (const P of [pW, pB]) {
    const c = P.dataset.side, other = c === 'w' ? pB : pW;
    $('.endturn', P).addEventListener('click', () => { if (!busy && S.pending && S.turn === c) doMove({ k: 'end' }); });
    $('.newg', P).addEventListener('click', () => newGame());
    $('.flag', P).addEventListener('click', () => $('.flagmenu', P).classList.toggle('hidden'));
    $('.flagmenu .close', P).addEventListener('click', () => $('.flagmenu', P).classList.add('hidden'));
    $('.flagmenu .resign', P).addEventListener('click', () => { if (busy) return; S = C.resign(S, c); $('.flagmenu', P).classList.add('hidden'); sfx('fanfare', 0.8); refresh(); });
    $('.flagmenu .offer', P).addEventListener('click', () => { $('.flagmenu', P).classList.add('hidden'); $('.drawask', other).classList.remove('hidden'); });
    $('.drawask .yes', P).addEventListener('click', () => { S = C.agreeDraw(S); $('.drawask', P).classList.add('hidden'); refresh(); });
    $('.drawask .no', P).addEventListener('click', () => $('.drawask', P).classList.add('hidden'));
    for (const b of $$('.promo .btn', P)) b.addEventListener('click', () => { if (!pendingPromo) return; const m = pendingPromo.find(x => x.promo === b.dataset.p); if (m) doMove(m); });
  }

  /* ---------- ⚙ chỉnh mẫu ---------- */
  const sheet = $('#sheet');
  function paintSheet() {
    for (const g of $$('.opts', sheet)) {
      const k = g.dataset.k;
      for (const o of $$('.opt', g)) o.classList.toggle('on', String(set[k]) === o.dataset.v);
    }
  }
  $('#gear').addEventListener('click', () => { if (view && view.playing) return; paintSheet(); sheet.classList.remove('hidden'); });
  $('#sClose').addEventListener('click', () => sheet.classList.add('hidden'));
  sheet.addEventListener('click', e => { if (e.target === sheet) sheet.classList.add('hidden'); });
  $('#sNew').addEventListener('click', () => { sheet.classList.add('hidden'); newGame(); });
  for (const g of $$('.opts', sheet)) {
    const k = g.dataset.k;
    for (const o of $$('.opt', g)) o.addEventListener('click', () => {
      const v = o.dataset.v;
      if (k === 'dice' && v === 'select') { sheet.classList.add('hidden'); startSelect(); return; }
      set[k] = v; save(); paintSheet();
      if (k === 'style' || k === 'board') applyLook();
      else if (k === 'death' || k === 'battleLen' || k === 'cutscene' || k === 'fight') view.setCfg({ [k]: v });
      else if (k === 'dice') applyDiceToCurrent();
    });
  }
  $('#sSetup').addEventListener('click', () => { sheet.classList.add('hidden'); startSetup(); });
  $('#sMake').addEventListener('click', () => { sheet.classList.add('hidden'); openMaker(); });

  /* ---------- XẾP BÀN: ô tường + quân Bon tự chế (Nam 11-21, trang Notion "chest bon") ---------- */
  let tool = 'wall', team = 'w', curDef = 0;
  const START = C.newGame();          // biết ô nào lúc đầu ván có quân
  function rebuildSetup() {
    S = applyLayout(C.newGame()); C.setupCards(S, diceBadges(), {}, diceGameCards());
    view.sync(S); view.setMarks({ sel: -1, moves: [], last: null, check: -1, chosen: [] }); save();
  }
  function paintSetup() {
    const d = set.customs[curDef];
    for (const P of [pW, pB]) {
      for (const b of $$('.setuprow .tool', P)) b.classList.toggle('on', b.dataset.tool === tool);
      $('.setuprow [data-tool=piece]', P).textContent = d ? (d.emoji + ' ' + d.name) : '⭐ Piece';
      $('.setuprow .team', P).textContent = team === 'w' ? '⬜ White' : '⬛ Black';
      $('.status', P).textContent = '✏️ Set up';
      P.classList.remove('turn', 'check');
    }
  }
  function startSetup() {
    mode = 'setup'; sel = -1;
    for (const P of [pW, pB]) { P.classList.add('setup'); $('.setuprow', P).classList.remove('hidden'); }
    rebuildSetup(); paintSetup();
  }
  function endSetup() {
    mode = 'play';
    for (const P of [pW, pB]) { P.classList.remove('setup'); $('.setuprow', P).classList.add('hidden'); }
    newGame();
  }
  function setupTap(sq) {
    if (sq < 0) return;
    const L = set.layout, cur = S.board[sq], startP = START.board[sq];
    const wi = L.walls.indexOf(sq), ri = L.removed.indexOf(sq);
    if (tool === 'wall') {
      if (wi >= 0) L.walls.splice(wi, 1);
      else { if (cur) { sfx('select', 0.25); return; } L.walls.push(sq); }   // tường chỉ đặt lên ô trống
    } else if (tool === 'piece') {
      const d = set.customs[curDef];
      if (!d) { openMaker(); return; }
      if (cur && cur.t === 'k') return;                                    // vua không thay được
      if (wi >= 0) L.walls.splice(wi, 1);
      L.pieces = L.pieces.filter(p => p.sq !== sq);
      L.pieces.push({ sq, c: team, id: d.id });
      if (startP && ri < 0) L.removed.push(sq);
    } else {                                                                // xoá: tường → quân tự chế → quân thường (trừ vua) → chạm lại ô trống = trả quân
      if (wi >= 0) L.walls.splice(wi, 1);
      else if (L.pieces.some(p => p.sq === sq)) L.pieces = L.pieces.filter(p => p.sq !== sq);
      else if (cur && cur.t !== 'k' && startP && ri < 0) L.removed.push(sq);
      else if (!cur && startP && ri >= 0) L.removed.splice(ri, 1);
      else return;
    }
    sfx('select', 0.5);
    rebuildSetup(); paintSetup();
  }
  for (const P of [pW, pB]) {
    for (const b of $$('.setuprow .tool', P)) b.addEventListener('click', () => {
      if (b.dataset.tool === 'piece' && tool === 'piece' && set.customs.length > 1) curDef = (curDef + 1) % set.customs.length;   // bấm lại = đổi quân
      tool = b.dataset.tool;
      if (tool === 'piece' && !set.customs.length) { openMaker(); return; }
      paintSetup();
    });
    $('.setuprow .team', P).addEventListener('click', () => { team = team === 'w' ? 'b' : 'w'; paintSetup(); });
    $('.setuprow .make', P).addEventListener('click', () => openMaker());
    $('.setuprow .done', P).addEventListener('click', endSetup);
  }

  /* ---------- CHẾ QUÂN: hai lưới 5×5 — xanh = đi tới được, đỏ = ăn được; ô sát quân bấm lần 2 = đi tiếp (∞) ---------- */
  const maker = $('#maker'), EMO = ['🐉', '🦖', '👾', '🤖', '🦄', '🐙', '🦈', '⭐'];
  const ARW = { '0,1': '↑', '1,1': '↗', '1,0': '→', '1,-1': '↘', '0,-1': '↓', '-1,-1': '↙', '-1,0': '←', '-1,1': '↖' };
  let mk = { emoji: '🐉', move: {}, attack: {} };
  function paintMaker() {
    for (const b of $$('.mk-emojis button', maker)) b.classList.toggle('on', b.textContent === mk.emoji);
    for (const g of $$('.grid5', maker)) {
      const kind = g.dataset.g;
      for (const b of $$('button', g)) {
        if (b.classList.contains('ctr')) { b.textContent = mk.emoji; continue; }
        const key = b.dataset.d, st = mk[kind][key] || 0;
        b.classList.toggle('s1', st === 1); b.classList.toggle('s2', st === 2);
        b.textContent = st === 2 ? (ARW[key] + '∞') : (st === 1 ? (kind === 'move' ? '●' : '✕') : '');
      }
    }
  }
  (function buildMaker() {
    const em = $('.mk-emojis', maker);
    for (const e of EMO) { const b = document.createElement('button'); b.textContent = e; b.addEventListener('click', () => { mk.emoji = e; paintMaker(); }); em.appendChild(b); }
    for (const g of $$('.grid5', maker)) {
      for (let dr = 2; dr >= -2; dr--) for (let df = -2; df <= 2; df++) {
        const b = document.createElement('button');
        if (!df && !dr) b.className = 'ctr';
        else {
          b.dataset.d = df + ',' + dr;
          b.addEventListener('click', () => {
            const kind = g.dataset.g, key = b.dataset.d, near = Math.abs(df) <= 1 && Math.abs(dr) <= 1;
            const st = mk[kind][key] || 0, nx = near ? (st + 1) % 3 : (st ? 0 : 1);
            if (nx) mk[kind][key] = nx; else delete mk[kind][key];
            paintMaker();
          });
        }
        g.appendChild(b);
      }
    }
  }());
  const KN = {}; for (const [a, b] of [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]]) KN[a + ',' + b] = 1;
  const ROOK = { '0,1': 2, '1,0': 2, '0,-1': 2, '-1,0': 2 };
  const PRE = { ps: { move: { '0,1': 1 }, attack: { '1,1': 1, '-1,1': 1 } }, rook: { move: ROOK, attack: ROOK }, knight: { move: KN, attack: KN }, clear: { move: {}, attack: {} } };
  for (const b of $$('[data-pre]', maker)) b.addEventListener('click', () => { const p = PRE[b.dataset.pre]; mk.move = Object.assign({}, p.move); mk.attack = Object.assign({}, p.attack); paintMaker(); });
  function openMaker() {
    mk = { emoji: EMO[set.customs.length % EMO.length], move: { '0,1': 1 }, attack: { '1,1': 1, '-1,1': 1 } };   // mở ra sẵn ví dụ của anh: đi thẳng, ăn chéo
    $('#mkName').value = 'Bon ' + (set.customs.length + 1);
    paintMaker(); maker.classList.remove('hidden');
  }
  $('#mkCancel').addEventListener('click', () => maker.classList.add('hidden'));
  $('#mkSave').addEventListener('click', () => {
    const steps = o => Object.keys(o).map(k => { const [df, dr] = k.split(',').map(Number); return [df, dr, o[k] === 2]; });
    const def = C.normDef({ id: 'c' + Date.now().toString(36), name: $('#mkName').value.trim() || 'Bon piece', emoji: mk.emoji, move: steps(mk.move), attack: steps(mk.attack) });
    if (!def.move.length && !def.attack.length) return;
    set.customs.push(def); if (set.customs.length > 8) set.customs.shift();
    curDef = set.customs.length - 1; tool = 'piece'; save();
    maker.classList.add('hidden');
    if (mode === 'setup') { rebuildSetup(); paintSetup(); }
  });
  maker.addEventListener('pointerdown', ev => ev.stopPropagation());
  $('#sDemo').addEventListener('click', () => {
    sheet.classList.add('hidden');
    const [ta, td] = set.demo.split('-');
    hideDice();
    view.demo(ta, td, set.demoMode, { dice: showDice }).then(() => setTimeout(hideDice, 1500));
  });
  function startSelect() {
    mode = 'select';
    for (const P of [pW, pB]) $('.selrow', P).classList.remove('hidden');
    paintChosen();
  }
  function endSelect() {
    mode = 'play'; set.dice = 'select'; save();
    for (const P of [pW, pB]) $('.selrow', P).classList.add('hidden');
    view.setMarks({ chosen: [] });
    applyDiceToCurrent(); refresh();
  }
  function paintChosen() {
    const sqs = [];
    for (let s = 0; s < 64; s++) { const p = S.board[s]; if (p && set.diceIds.indexOf(p.home) >= 0) sqs.push(s); }
    view.setMarks({ chosen: sqs, sel: -1, moves: [] });
  }
  function toggleDicePiece(sq) {
    if (sq < 0) return;
    const p = S.board[sq]; if (!p) return;
    const i = set.diceIds.indexOf(p.home);
    if (i >= 0) set.diceIds.splice(i, 1); else set.diceIds.push(p.home);
    sfx('select', 0.6); paintChosen();
  }
  for (const P of [pW, pB]) $('.seldone', P).addEventListener('click', endSelect);

  /* ---------- lối cho bộ thử (gọi vào code thật) ---------- */
  window.__chess = {
    C, ready: false, sfxLog, settings: set,
    get view() { return view; }, get S() { return S; }, get busy() { return busy || (view && view.playing); },
    move(a, b, promo) {
      const m = legalNow().find(x => (x.k === 'mv' || x.k === 'sw') && x.from === C.sqIdx(a) && x.to === C.sqIdx(b) && (!promo || x.promo === promo));
      if (!m) return Promise.reject(new Error('không có nước ' + a + b));
      return doMove(m);
    },
    endTurn() { return doMove({ k: 'end' }); },
    setOpt(k, v) { set[k] = v; save(); if (k === 'style' || k === 'board') applyLook(); else if (k === 'dice') applyDiceToCurrent(); else view.setCfg({ [k]: v }); },
    get mode() { return mode; },
    newGame, demo: (ta, td, m) => view.demo(ta, td, m, { dice: showDice }),
    load(fen, cards, players, game) { S = C.fromFEN(fen); S.customDefs = set.customs.map(C.normDef); C.setupCards(S, cards || diceBadges(), players || {}, game || diceGameCards()); view.sync(S); refresh(); }
  };

  function boot() {
    view = window.ChessView.create($('#board3d'), { sfx });
    view.setCfg({ death: set.death, battleLen: set.battleLen, cutscene: set.cutscene, fight: set.fight });
    applyLook();
    layout();
    window.addEventListener('resize', layout);
    view.canvas.addEventListener('pointerdown', onTap);
    /* chạm NGOÀI bàn (bảng hai đầu…) lúc đang đánh → bỏ qua. Cú chạm trên bàn đã do onTap lo — trước đây cú chạm
       ô đích vừa mở cảnh đánh vừa "lan" lên đây → cả trận bị tua ×4 (đo 11-21: 1,9 giây thay vì 5,9). */
    window.addEventListener('pointerdown', e => { if (e.target !== view.canvas && view && view.playing) view.skip(); });
    newGame();
    $('#loading').classList.add('hidden');
    if (/[?&]fps\b/.test(location.search)) setInterval(() => { $('#ver').textContent = 'Bản 2 · mẫu · ' + Math.round(view.fps) + ' fps'; }, 1000);
    window.__chess.ready = true;
  }
  Object.defineProperty(window.__chess, 'soundsReady', { get: () => Object.keys(SND.buf).length });
  try { boot(); } catch (e) { $('#loading').textContent = 'Lỗi: ' + e.message; throw e; }
}());
