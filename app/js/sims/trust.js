// Trust Tournament: iterated prisoner's dilemma. Each generation every blob plays every other blob;
// the 5 lowest scorers are replaced by copies of the 5 highest.
(function (G) {
  const BS = G.BS;
  const { shuffle, clamp, lerp, ease, pct, seg, W } = BS;
  const back = u => 1 + 2.7 * Math.pow(u - 1, 3) + 1.7 * Math.pow(u - 1, 2); // ease-out-back: a small overshoot for pops
  // Days per second the view advances. Labels are only shown when this is low enough to read them.
  const pace = BS.pace || (BS.pace = (s, t, now) => { if (s._pn != null && now > s._pn && t >= s._pt) s._pr = (t - s._pt) / (now - s._pn) * 1000; s._pt = t; s._pn = now; return s._pr || 0; });
  const PAY = [[1, 5], [0, 3]]; // PAY[myMove][theirMove], 1 = cooperate
  const STRATS = [
    { id: 'allc', name: 'Always Cooperate', color: '--green' },
    { id: 'alld', name: 'Always Cheat', color: '--magenta' },
    { id: 'tft', name: 'Copycat (Tit for Tat)', color: '--blue' },
    { id: 'grudge', name: 'Grudger', color: '--violet' },
    { id: 'gtft', name: 'Forgiving Copycat', color: '--gold' }
  ];
  const MIX = { even: [10, 10, 10, 10, 10], mean: [5, 30, 5, 5, 5], nice: [40, 4, 2, 2, 2] };

  function decide(k, oppLast, oppBad, r) {
    if (k === 0) return 1;
    if (k === 1) return 0;
    if (k === 2) return oppLast;
    if (k === 3) return oppBad ? 0 : 1;
    return oppLast === 1 || r() < 1 / 3 ? 1 : 0; // forgives a cheat 1 time in 3
  }
  function playMatch(a, b, rounds, noise, r) {
    let la = 1, lb = 1, da = false, db = false, sa = 0, sb = 0, co = 0;
    for (let i = 0; i < rounds; i++) {
      let ma = decide(a, lb, db, r), mb = decide(b, la, da, r);
      if (r() < noise) ma ^= 1;
      if (r() < noise) mb ^= 1;
      sa += PAY[ma][mb]; sb += PAY[mb][ma]; co += ma + mb;
      la = ma; lb = mb; if (!ma) da = true; if (!mb) db = true;
    }
    return [sa / rounds, sb / rounds, co / (2 * rounds)];
  }
  BS.trust = { decide, playMatch, STRATS }; // exposed for tests

  function demo(ka, kb, noise, seed) { // two sample rounds of a match, replayed with a display-only random generator
    const r = BS.rng(seed), out = [];
    let la = 1, lb = 1, da = false, db = false;
    for (let i = 0; i < 2; i++) {
      let ma = decide(ka, lb, db, r), mb = decide(kb, la, da, r);
      if (r() < noise) ma ^= 1;
      if (r() < noise) mb ^= 1;
      out.push([ma, mb]); la = ma; lb = mb; if (!ma) da = true; if (!mb) db = true;
    }
    return out;
  }
  const sizeOf = sc => .8 + .08 * clamp(sc, 0, 5);
  function layout(s) {
    const order = s.blobs.map((b, i) => i).sort((i, j) => s.blobs[i].k - s.blobs[j].k || s.blobs[i].id - s.blobs[j].id);
    order.forEach((i, rank) => { const b = s.blobs[i], a = rank / s.blobs.length * 6.2832 - 1.5708; b.px = b.x; b.py = b.y; b.x = W / 2 + Math.cos(a) * .41; b.y = .5 + Math.sin(a) * .41; });
  }

  BS.sims.push({
    id: 'trust', name: 'Trust Tournament', topic: 'Game theory', accent: '--blue', dayLabel: 'generation', biome: 'autumn',
    question: 'How can trust grow among selfish players?',
    hook: ["Cheating pays once.","Meet again and again, and trust wins."],
    source: 'After Axelrod (1984) and Nicky Case, “The Evolution of Trust”',
    knobs: [
      { id: 'rounds', label: 'Rounds per match', hint: 'How often the same two blobs meet', min: 1, max: 30, step: 1, value: 10, fmt: v => v },
      { id: 'noise', label: 'Mistake rate', hint: 'Chance a move flips by accident', min: 0, max: 20, step: 1, value: 0, fmt: v => v + '%' },
      { id: 'mut', label: 'Mutation rate', hint: 'Chance a newborn picks a random strategy', min: 0, max: 10, step: 1, value: 0, fmt: v => v + '%' },
      { id: 'mix', label: 'Start mix', type: 'select', reset: true, value: 'even', options: [['even', 'Even mix'], ['mean', 'Mostly cheaters'], ['nice', 'Mostly nice']] }
    ],
    chapters: [
      { title: 'Meet once', text: 'With one round, cheating always pays more. Cheaters win and trust dies.', set: { rounds: 1, noise: 0, mut: 0, mix: 'even' } },
      { title: 'Meet again', text: 'With 10 rounds per match, copycats and grudgers punish cheats. Cheaters die out, and nice blobs fill the ring.', set: { rounds: 10, noise: 0, mut: 0, mix: 'even' } },
      { title: 'Too nice', text: 'Start with mostly blobs that always cooperate. Cheaters exploit them and grow to most of the ring. Then the few copycats and grudgers, who punish cheats, take over.', set: { rounds: 10, noise: 0, mut: 0, mix: 'nice' } },
      { title: 'Mistakes happen', text: 'Add a 5 % mistake rate. One error makes strict players punish each other, and a grudger never forgives. Cooperation falls even when no cheaters are left.', set: { rounds: 10, noise: 5, mut: 0, mix: 'even' } }
    ],
    presets: [
      { label: 'Chaos', set: { noise: 20 }, note: 'One move in five flips by accident. No strategy can tell a mistake from a cheat, and cheaters take over.' },
      { label: 'Long games, many cheats', set: { rounds: 30, mix: 'mean' }, note: 'Cheaters start as 60 % of the ring, but each pair meets 30 times. Punishers win and cheaters vanish.' },
      { label: 'Nice strangers', set: { rounds: 1, mix: 'nice' }, note: 'A kind ring where no pair meets twice. A few cheaters exploit everyone and take over.' }
    ],
    legend: STRATS.map(t => ({ label: t.name, color: t.color })),
    series: STRATS.map(t => ({ key: t.id, label: t.name, color: t.color })),
    ymax: 1, fmt: pct,
    theory() { return []; },
    init(p) {
      const blobs = [];
      MIX[p.mix].forEach((n, k) => { for (let i = 0; i < n; i++) blobs.push({ k, id: blobs.length, score: 0, x: W / 2, y: .5 }); });
      const s = { day: 0, blobs, nextId: blobs.length, lines: [], coop: 0, pc: 0, ghosts: [], top: [] };
      layout(s); s.blobs.forEach(b => { b.px = b.x; b.py = b.y; });
      return s;
    },
    step(s, p, r) {
      const n = s.blobs.length, sc = new Float64Array(n), noise = p.noise / 100, lines = [];
      let co = 0, m = 0;
      for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const [a, b, c] = playMatch(s.blobs[i].k, s.blobs[j].k, p.rounds, noise, r);
        sc[i] += a; sc[j] += b; co += c; m++;
        if (r() < 18 / (n * (n - 1) / 2)) lines.push([i, j, c]);
      }
      s.blobs.forEach((b, i) => { b.ps = b.score || 0; b.score = sc[i] / (n - 1); });
      s.pc = s.coop;
      s.coop = co / m;
      const order = shuffle(s.blobs.slice(), r).sort((a, b) => b.score - a.score);
      const K = 5, top = order.slice(0, K), bottom = new Set(order.slice(-K));
      s.ghosts = [...bottom].map(b => ({ k: b.k, x: b.x, y: b.y }));
      s.lines = lines.map(([i, j, c]) => [s.blobs[i], s.blobs[j], c, s.blobs[i].k, s.blobs[j].k]);
      s.top = top;
      let t = 0;
      s.blobs.forEach(b => {
        b.born = bottom.has(b);
        if (b.born) {
          b.ox = b.x; b.oy = b.y; // old slot, where the loser shrinks away
          const mu = r() < p.mut / 100;
          b.src = mu ? null : top[t++]; // the winner this blob is a copy of
          b.k = mu ? (r() * STRATS.length) | 0 : b.src.k; b.id = s.nextId++;
        }
      });
      s.day++;
      layout(s);
      s.blobs.forEach(b => { if (b.born) { b.px = b.x; b.py = b.y; } });
    },
    metrics(s) {
      const o = { coop: s.coop }, n = s.blobs.length;
      STRATS.forEach((t, k) => o[t.id] = s.blobs.filter(b => b.k === k).length / n);
      return o;
    },
    kpis(s) {
      const m = this.metrics(s);
      let bi = 0;
      STRATS.forEach((t, k) => { if (m[t.id] > m[STRATS[bi].id]) bi = k; });
      return [
        { label: 'Generation', value: s.day },
        { label: 'Cooperation', value: s.day ? pct(s.coop) : '–', note: 'share of moves' },
        { label: 'Leader', value: STRATS[bi].name.replace(/ \(.*\)/, ''), tone: STRATS[bi].color + '-text' },
        { label: 'Leader share', value: pct(m[STRATS[bi].id]) }
      ];
    },
    insight(s, p) {
      if (s.day < 5) return 'Each generation every blob plays every other blob. The 5 lowest scorers are replaced by copies of the 5 highest.';
      const m = this.metrics(s);
      if (m.alld > .6) return p.rounds <= 2 ? 'Blobs rarely meet again, so a cheat is never punished. Cheaters take over.' : 'Cheaters lead. There are not enough copycats or grudgers to punish them yet.';
      if (p.noise > 0 && s.coop < .95) return 'Mistakes start feuds between strict players. Only ' + pct(s.coop) + ' of moves are cooperative, although almost no one is a cheater.';
      if (m.alld > .3) return 'Cheaters grow by exploiting blobs that always cooperate. Watch what happens when those run out.';
      if (m.alld < .02 && s.coop > .9) return 'Cheaters are gone and ' + pct(s.coop) + ' of moves are cooperative. Repeated meetings made trust pay.';
      return 'Average cooperation is ' + pct(s.coop) + '. Watch which colour grows.';
    },
    extraTitle: 'Points per round',
    extraHTML() {
      return '<table class="pay"><thead><tr><th scope="col">me \\ rival</th><th scope="col">cooperate</th><th scope="col">cheat</th></tr></thead><tbody>' +
        '<tr><th scope="row">cooperate</th><td>3</td><td>0</td></tr><tr><th scope="row">cheat</th><td>5</td><td>1</td></tr></tbody></table>' +
        '<p class="fine">Cheating pays more in any one round. Both cheating pays less than both cooperating.</p>';
    },
    // Choreography per generation: three sample matches, two rounds each, coins fly to the middle (0-.6);
    // the 5 lowest shrink away (.62-.72); the 5 highest glow and copies pop in beside them (.72-.82); the ring re-sorts (.82-1).
    render(R, s, t, now, p) {
      const slow = pace(s, t, now) < 2.1, cx = W / 2, RR = .021, idle = !s.day;
      let said = 0;
      const say = (x, y, text, c, a, lift) => { if (slow && a > 0 && said++ < 8) R.label(x, y, text, c, a, lift); };
      const op = b => b.born ? { x: b.ox, y: b.oy } : { x: b.px, y: b.py };
      const col = k => STRATS[k].color, face = (k, o) => Object.assign({ angry: k === 1, smile: k === 0 }, o);
      R.ring(cx, .5, .41, '--line');
      const coop = idle ? 0 : lerp(s.pc, s.coop, ease(seg(t, .1, .6)));
      R.label(cx, .5, idle ? '–' : pct(coop) + ' cooperative moves', '--ink', 1, .02);
      if (idle) { s.blobs.forEach(b => R.blob(b.x, b.y, RR * sizeOf(0), col(b.k), face(b.k, { blink: BS.blinking(b.id, now), lift: Math.abs(Math.sin(now / 600 + b.id)) * .004 }))); return; }
      const e = ease(seg(t, .82, 1)), hop = new Map(), top = new Set(s.top);
      s.lines.slice(0, 3).forEach((ln, i) => { // sample matches
        const a = .02 + .19 * i, u = seg(t, a, a + .18);
        if (u <= 0 || u >= 1) return;
        const A = op(ln[0]), B = op(ln[1]), M = { x: (A.x + B.x) / 2, y: (B.y + A.y) / 2 };
        if (!ln[5]) ln[5] = demo(ln[3], ln[4], p.noise / 100, s.day * 7919 + i * 31 + ln[0].id);
        R.line(A.x, A.y, B.x, B.y, '--mute', .7, .03);
        ln[5].forEach((mv, j) => {
          const uj = seg(u, j * .5, j * .5 + .5), fly = ease(seg(uj, .05, .5)), sink = 1 - seg(uj, .8, 1);
          [[A, ln[0], mv[0], mv[1], -1], [B, ln[1], mv[1], mv[0], 1]].forEach(([P, b, mine, theirs, side]) => {
            if (uj > 0 && uj < 1) {
              R.prop('coin', lerp(P.x, M.x, fly) + side * .012 * fly, lerp(P.y, M.y, fly), .011 * sink, mine ? '--green' : '--magenta', { lift: .045 + Math.sin(Math.PI * fly) * .05, rot: uj * 14 });
              hop.set(b, Math.max(hop.get(b) || 0, Math.sin(Math.PI * seg(uj, 0, .3)) * .02));
            }
            say(P.x, P.y, '+' + PAY[mine][theirs], mine ? '--green' : '--magenta', Math.min(seg(uj, .55, .65), 1 - seg(uj, .85, .95)), .1);
          });
        });
      });
      s.ghosts.forEach(g => { // the 5 lowest scorers shrink away
        const f = ease(seg(t, .62, .72));
        if (f < 1) R.blob(g.x, g.y, RR * (1 - f), col(g.k), face(g.k, { frown: g.k !== 1, lift: f * .04 }));
      });
      s.blobs.forEach(b => {
        const o = op(b), size = lerp(sizeOf(b.ps), sizeOf(b.score), ease(seg(t, .3, .6)));
        let x, y, r = RR * size, lift = hop.get(b) || 0, k = b.k;
        if (b.born) {
          const u = seg(t, .72, .82), src = b.src ? op(b.src) : o;
          if (u <= 0) return;
          const sx = lerp(src.x, cx, .06) + (b.src ? .03 * (cx > src.x ? 1 : -1) : 0), sy = lerp(src.y, .5, .06);
          x = lerp(sx, b.x, e); y = lerp(sy, b.y, e); r = RR * sizeOf(b.src ? b.src.score : b.score) * back(u);
          lift += Math.sin(Math.PI * u) * .03;
          if (b.id % 2 === 0 || !b.src) say(sx, sy, 'copy', '--ink', Math.min(seg(t, .74, .8), 1 - seg(t, .88, .94)), .09);
        } else { x = lerp(o.x, b.x, e); y = lerp(o.y, b.y, e); }
        R.blob(x, y, r, col(k), face(k, { blink: BS.blinking(b.id, now), lift }));
      });
      top.forEach(b => { const o = op(b), u = seg(t, .6, .82); if (u > 0 && u < 1) R.ring(lerp(o.x, b.x, e), lerp(o.y, b.y, e), RR * (1.6 + .5 * Math.sin(Math.PI * u)), '--gold'); });
      s.ghosts.forEach(g => say(g.x, g.y, 'out', '--red', Math.min(seg(t, .62, .66), 1 - seg(t, .7, .74)), .07));
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
