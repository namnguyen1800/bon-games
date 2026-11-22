/* chess_core.js — luật cờ cho game cờ vua của Bon (bản MẪU).
   Không đụng giao diện. Chạy được trong trình duyệt (window.ChessCore) lẫn node (require).
   Ô bàn cờ: 0 = a1 … 7 = h1, 8 = a2 … 63 = h8. Trắng 'w' ở hàng 1-2, Đen 'b' ở hàng 7-8.
   Thẻ luật gắn vào TỪNG QUÂN (p.cards), vào người chơi (S.players[c].cards) hoặc cả ván (S.gameCards).
   Quân được nhận ra lâu dài bằng ô xuất phát (p.home, vd 'e2') — bộ luật lưu ⭐ dùng ô này. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.ChessCore = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const FILES = 'abcdefgh';
  const START_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';
  const opp = c => (c === 'w' ? 'b' : 'w');
  const sqName = s => FILES[s & 7] + ((s >> 3) + 1);
  const sqIdx = n => (n.charCodeAt(0) - 97) + 8 * (parseInt(n.slice(1), 10) - 1);
  const VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 100, x: 3 };   // x = quân Bon tự chế (Nam 11-21)
  const N_OFF = [[1, 2], [2, 1], [2, -1], [1, -2], [-1, -2], [-2, -1], [-2, 1], [-1, 2]];
  const K_OFF = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
  const DIAG = [[1, 1], [-1, 1], [-1, -1], [1, -1]];
  const ORTH = [[1, 0], [0, 1], [-1, 0], [0, -1]];
  const SLIDE = { b: DIAG, r: ORTH, q: DIAG.concat(ORTH) };
  const PROMO = ['q', 'r', 'b', 'n'];
  const onB = (f, r) => f >= 0 && f < 8 && r >= 0 && r < 8;

  /* ---------- thẻ luật ---------- */
  function cardOf(p, kind) {
    if (!p || !p.cards) return null;
    for (let i = 0; i < p.cards.length; i++) if (p.cards[i].kind === kind) return p.cards[i];
    return null;
  }
  const shielded = p => !!(p && (cardOf(p, 'shield') || p.shieldT > 0));
  const jumps = p => !!cardOf(p, 'jumpOver');
  function moveTypes(p) {
    const ts = [p.t];
    if (p.cards) for (const c of p.cards) if (c.kind === 'alsoMovesLike' && c.t && ts.indexOf(c.t) < 0) ts.push(c.t);
    return ts;
  }

  /* ---------- trạng thái ---------- */
  function blankState() {
    return {
      board: new Array(64).fill(null), turn: 'w', ep: -1, half: 0, full: 1,
      grave: { w: [], b: [] }, pending: null, result: null,
      players: { w: { cards: [] }, b: { cards: [] } }, gameCards: [], nextId: 1, ply: 0,
      walls: null, customDefs: []
    };
  }
  function mkPiece(S, t, c, sq, def) {
    const p = { id: S.nextId++, t, c, home: sqName(sq), moved: false, lives: 1, maxLives: 1, cards: [], frozen: 0, shieldT: 0 };
    if (t === 'x') p.def = def;
    return p;
  }
  function cloneState(S) {
    return {
      board: S.board.slice(), turn: S.turn, ep: S.ep, half: S.half, full: S.full,
      grave: { w: S.grave.w.slice(), b: S.grave.b.slice() },
      pending: S.pending ? { id: S.pending.id, left: S.pending.left } : null,
      result: S.result, players: S.players, gameCards: S.gameCards, nextId: S.nextId, ply: S.ply,
      walls: S.walls, customDefs: S.customDefs
    };
  }

  /* ---------- ô TƯỜNG (Nam 11-21): đi xuyên qua được, không đứng lên được ---------- */
  const wallAt = (S, q) => !!(S.walls && S.walls[q]);
  function setWall(S, q, on) {                     // chỉ dùng lúc xếp bàn (trước ván); ô có quân thì không đặt tường
    if (on && S.board[q]) return false;
    const w = S.walls ? S.walls.slice() : new Array(64).fill(false);
    w[q] = !!on;
    S.walls = w.some(Boolean) ? w : null;
    return true;
  }

  /* ---------- quân Bon TỰ CHẾ (Nam 11-21): cách ĐI và cách ĂN riêng, đặt cho bên nào cũng được ----------
     def = { id, name, emoji, move: [[df, dr, slide]…], attack: [[df, dr, slide]…] }
     df/dr tính từ phía CHỦ QUÂN (dr > 0 = tiến về phía địch); slide = đi tiếp thẳng hướng đó tới khi bị chặn.
     Quân Đen tự xoay 180°: (df, dr) → (−df, −dr). */
  function normSteps(list) {
    const out = [], seen = new Set();
    for (const s of list || []) {
      const df = Math.max(-2, Math.min(2, s[0] | 0)), dr = Math.max(-2, Math.min(2, s[1] | 0));
      if (!df && !dr) continue;
      const k = df + ',' + dr;
      if (seen.has(k)) continue;
      seen.add(k); out.push([df, dr, !!s[2]]);
    }
    return out;
  }
  function normDef(d) {
    d = d || {};
    return { id: String(d.id || 'c1').slice(0, 24), name: String(d.name || 'Bon piece').slice(0, 24), emoji: String(d.emoji || '⭐').slice(0, 8),
      move: normSteps(d.move), attack: normSteps(d.attack) };
  }
  function placePiece(S, q, t, c, def) {           // lúc xếp bàn: đặt / thay quân ở ô q
    if (wallAt(S, q)) return null;
    const p = mkPiece(S, t, c, q, t === 'x' ? normDef(def) : undefined);
    S.board[q] = p;
    return p;
  }
  function clearSquare(S, q) { const p = S.board[q]; S.board[q] = null; return p; }
  function fromFEN(fen) {
    const S = blankState();
    const parts = fen.trim().split(/\s+/);
    const rows = parts[0].split('/');
    for (let i = 0; i < 8; i++) {
      let f = 0; const r = 7 - i;
      for (const ch of rows[i]) {
        if (ch >= '1' && ch <= '8') { f += +ch; continue; }
        const c = ch === ch.toUpperCase() ? 'w' : 'b';
        const sq = r * 8 + f;
        S.board[sq] = mkPiece(S, ch.toLowerCase(), c, sq);
        f++;
      }
    }
    S.turn = parts[1] === 'b' ? 'b' : 'w';
    const cr = parts[2] || '-';
    for (const c of ['w', 'b']) {
      for (let s = 0; s < 64; s++) { const p = S.board[s]; if (p && p.c === c && (p.t === 'k' || p.t === 'r')) p.moved = true; }
      const ks = c === 'w' ? 4 : 60, k = S.board[ks];
      const hasK = cr.indexOf(c === 'w' ? 'K' : 'k') >= 0, hasQ = cr.indexOf(c === 'w' ? 'Q' : 'q') >= 0;
      if (k && k.t === 'k' && k.c === c && (hasK || hasQ)) {
        k.moved = false;
        const hr = S.board[ks + 3], ar = S.board[ks - 4];
        if (hasK && hr && hr.t === 'r' && hr.c === c) hr.moved = false;
        if (hasQ && ar && ar.t === 'r' && ar.c === c) ar.moved = false;
      }
    }
    S.ep = parts[3] && parts[3] !== '-' ? sqIdx(parts[3]) : -1;
    S.half = +(parts[4] || 0); S.full = +(parts[5] || 1);
    return S;
  }
  const newGame = () => fromFEN(START_FEN);
  function findSq(S, id) { for (let s = 0; s < 64; s++) if (S.board[s] && S.board[s].id === id) return s; return -1; }
  function kingSq(S, c) { for (let s = 0; s < 64; s++) { const p = S.board[s]; if (p && p.t === 'k' && p.c === c) return s; } return -1; }

  /* Gắn thẻ trước khi chơi. assign = [{home:'e2', cards:[…]}], players = {w:[…], b:[…]}, game = […] */
  function setupCards(S, assign, players, game) {
    for (const a of assign || []) {
      const s = S.board.findIndex(p => p && p.home === a.home);
      if (s < 0) continue;
      const lv = (a.cards || []).find(x => x.kind === 'lives');
      const n = lv ? Math.max(1, Math.min(5, lv.n | 0)) : 1;
      S.board[s] = Object.assign({}, S.board[s], { cards: (a.cards || []).slice(), lives: n, maxLives: n });
    }
    S.players = { w: { cards: ((players && players.w) || []).slice() }, b: { cards: ((players && players.b) || []).slice() } };
    S.gameCards = (game || []).slice();
    return S;
  }

  /* ---------- quân này có ăn tới ô sq không (dùng cho chiếu) ---------- */
  function pieceAttacks(B, p, from, sq) {
    const f0 = from & 7, r0 = from >> 3, f1 = sq & 7, r1 = sq >> 3;
    const df = f1 - f0, dr = r1 - r0;
    if (!df && !dr) return false;
    for (const t of moveTypes(p)) {
      if (t === 'p') { if (dr === (p.c === 'w' ? 1 : -1) && (df === 1 || df === -1)) return true; }
      else if (t === 'x') {                         // quân tự chế: chỉ ô trong danh sách ĂN mới tính là "đang chiếu"
        const sgn = p.c === 'w' ? 1 : -1;
        for (const st of (p.def && p.def.attack) || []) {
          const sdf = st[0] * sgn, sdr = st[1] * sgn;
          if (!st[2]) { if (df === sdf && dr === sdr) return true; continue; }
          let k;
          if (sdf) { if (df % sdf) continue; k = df / sdf; if (sdr * k !== dr) continue; }
          else { if (df || dr % sdr) continue; k = dr / sdr; }
          if (k <= 0) continue;
          if (jumps(p)) return true;
          let clear = true;
          for (let i = 1; i < k; i++) if (B[(r0 + sdr * i) * 8 + f0 + sdf * i]) { clear = false; break; }
          if (clear) return true;
        }
      }
      else if (t === 'n') { const a = Math.abs(df), b = Math.abs(dr); if ((a === 1 && b === 2) || (a === 2 && b === 1)) return true; }
      else if (t === 'k') { if (Math.abs(df) <= 1 && Math.abs(dr) <= 1) return true; }
      else {
        const diag = Math.abs(df) === Math.abs(dr), orth = !df || !dr;
        if ((t === 'b' && !diag) || (t === 'r' && !orth) || (t === 'q' && !diag && !orth)) continue;
        if (jumps(p)) return true;
        const sf = Math.sign(df), sr = Math.sign(dr);
        let f = f0 + sf, r = r0 + sr, clear = true;
        while (f !== f1 || r !== r1) { if (B[r * 8 + f]) { clear = false; break; } f += sf; r += sr; }
        if (clear) return true;
      }
    }
    return false;
  }
  function attacked(S, sq, by) {
    const B = S.board;
    for (let s = 0; s < 64; s++) {
      const p = B[s];
      if (p && p.c === by && !(p.frozen > 0) && pieceAttacks(B, p, s, sq)) return true;
    }
    return false;
  }
  function inCheck(S, c) {
    const ks = kingSq(S, c);
    if (ks < 0 || shielded(S.board[ks])) return false;
    return attacked(S, ks, opp(c));
  }

  /* ---------- sinh nước đi (chưa lọc chiếu) ---------- */
  function addMove(out, seen, m) {
    const key = m.from + '-' + m.to + (m.promo || '');
    if (seen.has(key)) return;
    seen.add(key); out.push(m);
  }
  function genCastles(S, k, s, out) {
    const c = k.c, home = c === 'w' ? 4 : 60;
    if (k.moved || s !== home || k.frozen > 0) return;
    const B = S.board, o = opp(c), safe = shielded(k);
    if (!safe && attacked(S, s, o)) return;
    const hr = B[home + 3];
    // ô tường: vua / xe không được ĐỨNG trên tường (ô đáp), đi ngang qua thì được
    if (hr && hr.t === 'r' && hr.c === c && !hr.moved && !(hr.frozen > 0) && !B[home + 1] && !B[home + 2] &&
      !wallAt(S, home + 1) && !wallAt(S, home + 2) &&
      (safe || (!attacked(S, home + 1, o) && !attacked(S, home + 2, o))))
      out.push({ k: 'mv', from: s, to: home + 2, castle: { rf: home + 3, rt: home + 1 } });
    const ar = B[home - 4];
    if (ar && ar.t === 'r' && ar.c === c && !ar.moved && !(ar.frozen > 0) && !B[home - 1] && !B[home - 2] && !B[home - 3] &&
      !wallAt(S, home - 1) && !wallAt(S, home - 2) &&
      (safe || (!attacked(S, home - 1, o) && !attacked(S, home - 2, o))))
      out.push({ k: 'mv', from: s, to: home - 2, castle: { rf: home - 4, rt: home - 1 } });
  }
  function genPiece(S, p, s, out) {
    const B = S.board, c = p.c, f0 = s & 7, r0 = s >> 3, seen = new Set();
    const capOK = d => d.c !== c && !shielded(d);
    for (const t of moveTypes(p)) {
      if (t === 'p') {
        const dir = c === 'w' ? 1 : -1, last = c === 'w' ? 7 : 0, start = c === 'w' ? 1 : 6;
        // phong cấp: 4 quân thường + mọi quân Bon tự chế đang có trong ván ('x:<id>')
        const promos = PROMO.concat((S.customDefs || []).map(d => 'x:' + d.id));
        const push = (to, extra) => {
          if (p.t === 'p' && (to >> 3) === last) for (const pr of promos) addMove(out, seen, Object.assign({ k: 'mv', from: s, to, promo: pr }, extra));
          else addMove(out, seen, Object.assign({ k: 'mv', from: s, to }, extra));
        };
        const r1 = r0 + dir;
        if (r1 < 0 || r1 > 7) continue;
        const one = r1 * 8 + f0;
        if (!B[one] && !wallAt(S, one)) push(one, {});
        if (r0 === start) {
          const two = (r0 + 2 * dir) * 8 + f0;           // ô tường ở giữa: tốt đi 2 ô "lướt qua" được
          if (!B[two] && !wallAt(S, two) && (!B[one] || jumps(p))) push(two, { dbl: true });
        }
        for (const df of [-1, 1]) {
          const f1 = f0 + df;
          if (f1 < 0 || f1 > 7) continue;
          const to = r1 * 8 + f1, d = B[to];
          if (d) { if (capOK(d)) push(to, {}); }
          else if (to === S.ep && !wallAt(S, to)) {
            const v = B[to - 8 * dir];
            if (v && v.t === 'p' && v.c !== c && !shielded(v)) push(to, { ep: true });
          }
        }
      } else if (t === 'n' || t === 'k') {
        for (const [df, dr] of (t === 'n' ? N_OFF : K_OFF)) {
          const f1 = f0 + df, r1 = r0 + dr;
          if (!onB(f1, r1)) continue;
          const to = r1 * 8 + f1, d = B[to];
          if (wallAt(S, to)) continue;
          if (!d || capOK(d)) addMove(out, seen, { k: 'mv', from: s, to });
        }
        if (t === 'k' && p.t === 'k') genCastles(S, p, s, out);
      } else if (t === 'x') {                          // quân tự chế: danh sách ĐI (chỉ ô trống) + danh sách ĂN (chỉ ô có địch)
        const D = p.def || {}, sgn = c === 'w' ? 1 : -1, J = jumps(p);
        const walk = (list, isAtk) => {
          for (const st of list || []) {
            const df = st[0] * sgn, dr = st[1] * sgn, slide = !!st[2];
            let f1 = f0 + df, r1 = r0 + dr;
            while (onB(f1, r1)) {
              const to = r1 * 8 + f1, d = B[to];
              if (wallAt(S, to)) { if (!slide) break; f1 += df; r1 += dr; continue; }
              if (!d) { if (!isAtk) addMove(out, seen, { k: 'mv', from: s, to }); }
              else { if (isAtk && capOK(d)) addMove(out, seen, { k: 'mv', from: s, to }); if (!J) break; }
              if (!slide) break;
              f1 += df; r1 += dr;
            }
          }
        };
        walk(D.move, false); walk(D.attack, true);
      } else {
        const J = jumps(p);
        for (const [df, dr] of SLIDE[t]) {
          let f1 = f0 + df, r1 = r0 + dr;
          while (onB(f1, r1)) {
            const to = r1 * 8 + f1, d = B[to];
            if (wallAt(S, to)) { f1 += df; r1 += dr; continue; }   // tường: lướt qua, không dừng lại
            if (!d) addMove(out, seen, { k: 'mv', from: s, to });
            else { if (capOK(d)) addMove(out, seen, { k: 'mv', from: s, to }); if (!J) break; }
            f1 += df; r1 += dr;
          }
        }
      }
    }
    const sw = cardOf(p, 'swap');
    if (sw) {
      const mode = sw.partner || 'ownAny';
      for (let q = 0; q < 64; q++) {
        const o = B[q];
        if (!o || q === s) continue;
        if (mode === 'ownAny' && o.c !== c) continue;
        if (mode === 'ownAdjacent' && (o.c !== c || Math.max(Math.abs((q & 7) - f0), Math.abs((q >> 3) - r0)) !== 1)) continue;
        if (mode === 'any' && o.c !== c && o.t === 'k') continue;
        out.push({ k: 'sw', from: s, to: q });
      }
    }
  }
  function genRevives(S, c, out) {
    const card = (S.players[c].cards || []).find(x => x.kind === 'revive');
    if (!card || !S.grave[c].length) return;
    const last = c === 'w' ? 7 : 0;
    const rows = c === 'w' ? [0, 1] : [6, 7];
    for (const p of S.grave[c]) {
      let squares;
      if (card.place === 'startSquare') squares = [sqIdx(p.home)];
      else if (card.place === 'anyEmpty') { squares = []; for (let q = 0; q < 64; q++) squares.push(q); }
      else { squares = []; for (const r of rows) for (let f = 0; f < 8; f++) squares.push(r * 8 + f); }
      for (const q of squares) if (!S.board[q] && !wallAt(S, q) && !(p.t === 'p' && (q >> 3) === last)) out.push({ k: 'rv', id: p.id, to: q });
    }
  }

  /* ---------- xúc xắc ---------- */
  function diceApplies(S, a, d) {
    for (const g of S.gameCards || []) {
      if (g.kind !== 'dice') continue;
      if (g.apply === 'all') return true;
      if (g.ids && (g.ids.indexOf(a.home) >= 0 || g.ids.indexOf(d.home) >= 0)) return true;
    }
    return false;
  }
  function rollUntilDiff(rng) {
    const rolls = [];
    for (let i = 0; i < 30; i++) {
      const a = 1 + Math.floor(rng() * 6), d = 1 + Math.floor(rng() * 6);
      rolls.push([a, d]);
      if (a !== d) return rolls;
    }
    rolls.push([6, 1]);
    return rolls;
  }

  /* ---------- luật KHI … THÌ … (thẻ trigger gắn trên quân) ---------- */
  const triggersOf = (p, when) => (p && p.cards ? p.cards.filter(c => c.kind === 'trigger' && c.when === when) : []);
  const rankFrom = (c, sq) => (c === 'w' ? (sq >> 3) + 1 : 8 - (sq >> 3));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v | 0 || a));
  function neighbors(sq) {
    const out = [], f0 = sq & 7, r0 = sq >> 3;
    for (const [df, dr] of K_OFF) { const f = f0 + df, r = r0 + dr; if (onB(f, r)) out.push(r * 8 + f); }
    return out;
  }
  function freeSquare(N, c, p) {      // chỗ đặt quân được hồi sinh TỰ ĐỘNG: ô xuất phát, không thì ô trống ở 2 hàng đầu phía mình
    const home = sqIdx(p.home), last = c === 'w' ? 7 : 0;
    if (!N.board[home] && !wallAt(N, home) && !(p.t === 'p' && (home >> 3) === last)) return home;
    for (const r of (c === 'w' ? [0, 1] : [7, 6])) for (let f = 0; f < 8; f++) { const q = r * 8 + f; if (!N.board[q] && !wallAt(N, q)) return q; }
    return -1;
  }
  /* ctx: { sq: ô của quân có thẻ, c: màu chủ thẻ, dead: quân đó vừa chết?, capturer: ô của con vừa ăn nó, extra } */
  function applyEffects(N, ev, effects, ctx) {
    const B = N.board, o = opp(ctx.c);
    for (const e of effects || []) {
      const self = ctx.dead ? null : B[ctx.sq];
      if (e.do === 'transform') {
        if (self && self.t !== 'k' && 'qrbn'.indexOf(e.t) >= 0 && e.t !== self.t) {
          B[ctx.sq] = Object.assign({}, self, { t: e.t });
          ev.push({ type: 'transform', id: self.id, t: e.t, at: ctx.sq });
        }
      } else if (e.do === 'explode') {
        const hits = neighbors(ctx.sq);
        if (ctx.dead) hits.push(ctx.sq);                 // bị ăn rồi nổ → con vừa ăn nó (đứng ngay ô đó) cũng bay
        ev.push({ type: 'explode', at: ctx.sq, c: ctx.c });
        for (const q of hits) {
          const d = B[q];
          if (d && d.c === o && d.t !== 'k' && !shielded(d)) {
            B[q] = null; N.grave[o].push(d);
            ev.push({ type: 'die', id: d.id, at: q, cause: 'explode' });
          }
        }
      } else if (e.do === 'freeze') {
        const turns = clamp(e.turns, 1, 3);
        const qs = e.target === 'capturer' ? (ctx.capturer >= 0 ? [ctx.capturer] : []) : neighbors(ctx.sq);
        for (const q of qs) {
          const d = B[q];
          if (d && d.c === o) { B[q] = Object.assign({}, d, { frozen: turns }); ev.push({ type: 'freeze', id: d.id, at: q, turns }); }
        }
      } else if (e.do === 'revive') {
        const g = N.grave[ctx.c];
        if (g.length) {
          let bi = 0;
          g.forEach((p, i) => { if (VALUE[p.t] > VALUE[g[bi].t]) bi = i; });
          const p = g[bi], q = freeSquare(N, ctx.c, p);
          if (q >= 0) {
            g.splice(bi, 1);
            B[q] = Object.assign({}, p, { moved: true, lives: p.maxLives || 1, frozen: 0, shieldT: 0 });
            ev.push({ type: 'revive', id: p.id, t: p.t, c: ctx.c, to: q, auto: true });
          }
        }
      } else if (e.do === 'gainShield') {
        if (self) { B[ctx.sq] = Object.assign({}, self, { shieldT: clamp(e.turns, 1, 3) }); ev.push({ type: 'shieldUp', id: self.id, at: ctx.sq }); }
      } else if (e.do === 'gainLife') {
        if (self) {
          const n = clamp(e.n, 1, 3);
          B[ctx.sq] = Object.assign({}, self, { lives: (self.lives || 1) + n, maxLives: (self.maxLives || 1) + n });
          ev.push({ type: 'lifeUp', id: self.id, at: ctx.sq, lives: (self.lives || 1) + n });
        }
      } else if (e.do === 'extraMove') {
        if (self) ctx.extra = true;
      }
    }
  }
  function fire(N, ev, p, when, ctx, test) {
    for (const t of triggersOf(p, when)) {
      if (test && !test(t)) continue;
      ev.push({ type: 'trigger', id: p.id, when, at: ctx.sq });
      applyEffects(N, ev, t.then, ctx);
    }
  }

  /* ---------- áp một hành động (không xét chiếu bí) ---------- */
  function autoPromote(N, sq, ev) {
    const p = N.board[sq];
    if (p && p.t === 'p' && (sq >> 3) === (p.c === 'w' ? 7 : 0)) {
      N.board[sq] = Object.assign({}, p, { t: 'q' });
      ev.push({ type: 'promote', id: p.id, t: 'q', at: sq });
    }
  }
  function applyCore(S, m, opts) {
    opts = opts || {};
    const N = cloneState(S), B = N.board, ev = [], c = S.turn, o = opp(c);
    let actor = null, battle = null, killedD = null, killedA = null, capAt = -1;
    N.ep = -1;
    if (m.k === 'end') {
      ev.push({ type: 'endturn', c });
    } else if (m.k === 'rv') {
      const gi = N.grave[c].findIndex(p => p.id === m.id);
      const p = N.grave[c][gi];
      N.grave[c].splice(gi, 1);
      B[m.to] = Object.assign({}, p, { moved: true, lives: p.maxLives || 1, frozen: 0, shieldT: 0 });
      ev.push({ type: 'revive', id: p.id, t: p.t, c, to: m.to });
    } else if (m.k === 'sw') {
      const a = B[m.from], b = B[m.to];
      B[m.to] = Object.assign({}, a, { moved: true });
      B[m.from] = Object.assign({}, b, { moved: true });
      ev.push({ type: 'swap', a: a.id, b: b.id, from: m.from, to: m.to });
      autoPromote(N, m.to, ev); autoPromote(N, m.from, ev);
      actor = B[m.to];
    } else {
      const p = B[m.from];
      const capSq = m.ep ? m.to + (c === 'w' ? -8 : 8) : (B[m.to] ? m.to : -1);
      let moveIt = true;
      if (capSq >= 0) {
        const d = B[capSq];
        const dice = diceApplies(S, p, d);
        let win = true, rolls = [];
        if (dice) {
          if (opts.assume) win = opts.assume === 'win';
          else if (opts.forced) win = opts.forced === 'win';
          else { rolls = rollUntilDiff(opts.rng || Math.random); const L = rolls[rolls.length - 1]; win = L[0] > L[1]; }
        }
        battle = { type: 'battle', a: p.id, d: d.id, at: capSq, from: m.from, to: m.to, mode: dice ? 'dice' : 'show', rolls, winner: win ? 'a' : 'd' };
        ev.push(battle);
        if (win) {
          if ((d.lives || 1) > 1) {
            B[capSq] = Object.assign({}, d, { lives: d.lives - 1 });
            ev.push({ type: 'hit', id: d.id, lives: d.lives - 1 });
            moveIt = false;
          } else {
            B[capSq] = null;
            N.grave[d.c].push(d);
            ev.push({ type: 'die', id: d.id, at: capSq, by: p.id });
            killedD = d; capAt = capSq;
            if (d.t === 'k') N.result = { winner: c, reason: 'king' };
          }
        } else {
          moveIt = false;
          if (shielded(p)) ev.push({ type: 'bounce', id: p.id });
          else if ((p.lives || 1) > 1) {
            B[m.from] = Object.assign({}, p, { lives: p.lives - 1 });
            ev.push({ type: 'hit', id: p.id, lives: p.lives - 1 });
          } else {
            B[m.from] = null;
            N.grave[c].push(p);
            ev.push({ type: 'die', id: p.id, at: m.from, by: d.id });
            killedA = p; capAt = capSq;
            if (p.t === 'k') N.result = { winner: o, reason: 'king' };
          }
        }
      }
      if (moveIt) {
        const mp = Object.assign({}, p, { moved: true });
        B[m.from] = null;
        B[m.to] = mp;
        actor = mp;
        ev.push({ type: 'move', id: p.id, from: m.from, to: m.to });
        if (m.castle) {
          const r = B[m.castle.rf];
          B[m.castle.rf] = null;
          B[m.castle.rt] = Object.assign({}, r, { moved: true });
          ev.push({ type: 'move', id: r.id, from: m.castle.rf, to: m.castle.rt, castle: true });
        }
        if (m.dbl) N.ep = m.from + (c === 'w' ? 8 : -8);
        if (p.t === 'p' && (m.to >> 3) === (c === 'w' ? 7 : 0)) {
          const pr = m.promo || 'q';
          const def = pr.indexOf('x:') === 0 ? (N.customDefs || []).find(d => d.id === pr.slice(2)) : null;
          const np = def ? Object.assign({}, mp, { t: 'x', def }) : Object.assign({}, mp, { t: pr.indexOf('x:') === 0 ? 'q' : pr });
          B[m.to] = np;
          actor = np;
          ev.push({ type: 'promote', id: p.id, t: np.t, def: np.def, at: m.to });
        }
      }
    }
    // ---- KHI … THÌ … ----
    let extra = false;
    if (!N.result && m.k === 'mv') {
      const aSq = actor ? findSq(N, actor.id) : -1;
      if (killedD) {
        if (aSq >= 0) {
          const ctx = { sq: aSq, c, dead: false, capturer: -1 };
          fire(N, ev, B[aSq], 'capture', ctx, t => !t.ifCaptured || t.ifCaptured === killedD.t);
          extra = extra || ctx.extra;
        }
        fire(N, ev, killedD, 'captured', { sq: capAt, c: killedD.c, dead: true, capturer: aSq });
      }
      if (killedA) {
        fire(N, ev, killedA, 'captured', { sq: m.from, c, dead: true, capturer: capAt });
        const dNow = B[capAt];
        if (dNow && dNow.c === o) fire(N, ev, dNow, 'capture', { sq: capAt, c: o, dead: false, capturer: -1 }, t => !t.ifCaptured || t.ifCaptured === killedA.t);
      }
      const a2 = actor ? findSq(N, actor.id) : -1;
      if (a2 >= 0 && a2 !== m.from) {
        const ctx = { sq: a2, c, dead: false, capturer: -1 };
        fire(N, ev, B[a2], 'move', ctx);
        if (B[a2]) fire(N, ev, B[a2], 'reachRank', ctx, t => rankFrom(c, a2) === (t.rank | 0) && rankFrom(c, m.from) !== (t.rank | 0));
        extra = extra || ctx.extra;
      }
    }
    let endTurn = true;
    N.pending = null;
    if (!N.result && actor && (m.k === 'mv' || m.k === 'sw') && findSq(N, actor.id) >= 0) {
      const mm = cardOf(actor, 'movesPerTurn');
      let left = S.pending ? S.pending.left - 1 : (mm ? Math.max(1, Math.min(3, mm.n | 0 || 2)) - 1 : 0);
      if (extra) left += 1;
      if (left > 0) { N.pending = { id: actor.id, left }; endTurn = false; }
    }
    if (endTurn) {
      tick(S, N, c, 'frozen');          // quân bị đóng băng của bên vừa đi: đã "đứng im" xong một lượt
      tick(S, N, o, 'shieldT');         // khiên tạm của bên kia: đã che xong một lượt
      N.turn = o;
      if (c === 'b') N.full++;
      if (!N.result) for (let s = 0; s < 64; s++) {
        const p = N.board[s];
        if (p && p.c === o && triggersOf(p, 'turnStart').length) fire(N, ev, p, 'turnStart', { sq: s, c: o, dead: false, capturer: -1 });
      }
    }
    N.ply++;
    return { S: N, ev, battle };
  }
  function tick(S, N, side, field) {
    for (let s = 0; s < 64; s++) {
      const p = N.board[s];
      if (!p || p.c !== side || !(p[field] > 0)) continue;
      const q = S.board[findSq(S, p.id)];
      if (q && q[field] > 0) N.board[s] = Object.assign({}, p, { [field]: p[field] - 1 });
    }
  }

  /* ---------- nước đi hợp lệ ---------- */
  function legalMoves(S) {
    if (S.result) return [];
    const c = S.turn, out = [];
    if (S.pending) {
      const s = findSq(S, S.pending.id);
      if (s >= 0) genPiece(S, S.board[s], s, out);
    } else {
      for (let s = 0; s < 64; s++) {
        const p = S.board[s];
        if (p && p.c === c && !(p.frozen > 0)) genPiece(S, p, s, out);
      }
      genRevives(S, c, out);
    }
    const legal = [];
    for (const m of out) if (!inCheck(applyCore(S, m, { assume: 'win' }).S, c)) legal.push(m);
    if (S.pending) legal.push({ k: 'end' });
    return legal;
  }

  /* ---------- một nước thật trong ván (có xét chiếu, chiếu bí, hoà, lộ vua) ---------- */
  function play(S, m, opts) {
    const c = S.turn;
    const R = applyCore(S, m, opts);
    const N = R.S, ev = R.ev;
    if (!N.result && R.battle && R.battle.winner === 'd' && inCheck(N, c)) N.result = { winner: opp(c), reason: 'exposed' };
    if (!N.result && !N.pending) {
      const side = N.turn, lm = legalMoves(N), chk = inCheck(N, side);
      if (!lm.length) N.result = chk ? { winner: opp(side), reason: 'mate' } : { winner: null, reason: 'stalemate' };
      else if (chk) ev.push({ type: 'check', c: side });
    }
    if (N.result) ev.push(Object.assign({ type: 'over' }, N.result));
    else ev.push({ type: 'turn', c: N.turn, pending: N.pending });
    return { S: N, ev };
  }
  function resign(S, c) { const N = cloneState(S); N.result = { winner: opp(c), reason: 'resign' }; return N; }
  function agreeDraw(S) { const N = cloneState(S); N.result = { winner: null, reason: 'draw' }; return N; }

  function perft(S, depth) {
    if (depth === 0) return 1;
    const ms = legalMoves(S);
    if (depth === 1) return ms.length;
    let n = 0;
    for (const m of ms) n += perft(applyCore(S, m, { assume: 'win' }).S, depth - 1);
    return n;
  }

  return {
    START_FEN, VALUE, opp, sqName, sqIdx, newGame, fromFEN, setupCards, cardOf, shielded,
    legalMoves, play, applyCore, inCheck, attacked, resign, agreeDraw, perft, findSq, kingSq, diceApplies,
    wallAt, setWall, placePiece, clearSquare, normDef
  };
}));
