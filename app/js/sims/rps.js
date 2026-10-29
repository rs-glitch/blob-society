// Rock-Paper-Scissors (May-Leonard model): three types on a grid; each beats one type and loses to one.
// Events: a type kills the prey next to it, any type copies into an empty neighbour cell, neighbours swap (mobility).
(function (G) {
  const BS = G.BS;
  const { pct, W } = BS;
  const C = 80, R_ = 60, N = C * R_;
  const COL = ['--ground', '--orange', '--violet', '--teal']; // empty, rock, scissors, paper
  const NAMES = ['', 'Rock', 'Scissors', 'Paper'];
  const beats = (a, b) => a && b === a % 3 + 1; // rock>scissors, scissors>paper, paper>rock
  const MASCOTS = 18;

  BS.sims.push({
    id: 'rps', name: 'Rock, Paper, Scissors', topic: 'Game theory', accent: '--violet', dayLabel: 'day', biome: 'savannah', maxDays: 1500,
    question: 'What happens when no type is best?',
    hook: ["Nobody is the best.","So the three colours chase each other forever."],
    source: 'After Primer, “Simulating the Evolution of Rock, Paper, Scissors”, and Reichenbach, Mobilia & Frey (2007)',
    knobs: [
      { id: 'move', label: 'Mobility', hint: 'How often neighbours swap places', min: 0, max: 12, step: 1, value: 1, fmt: v => v },
      { id: 'mixed', label: 'Who meets whom', type: 'select', reset: true, value: 'grid', options: [['grid', 'Only neighbours'], ['mixed', 'Anyone (well mixed)']] },
      { id: 'start', label: 'Start with', type: 'select', reset: true, value: 'three', options: [['three', 'All three types'], ['two', 'Rock and scissors only']] }
    ],
    chapters: [
      { title: 'Everyone meets everyone', text: 'Each blob can meet any other blob. The three shares swing in bigger and bigger cycles, until one type dies out. Then the type that it used to hold back takes over.', set: { move: 1, mixed: 'mixed', start: 'three' } },
      { title: 'Only neighbours meet', text: 'Now blobs only meet their neighbours. Waves of each type chase the type they beat, and form spirals. All three types survive.', set: { move: 1, mixed: 'grid', start: 'three' } },
      { title: 'Fast movers', text: 'Let neighbours swap places very often. The spirals grow larger than the island, and the three types can no longer hold each other in check. Diversity is lost.', set: { move: 12, mixed: 'grid', start: 'three' } },
      { title: 'Take one away', text: 'Start with rock and scissors only. Nothing beats rock, so rock wins fast. The cycle needs all three types to keep each type alive.', set: { move: 1, mixed: 'grid', start: 'two' } }
    ],
    presets: [
      { label: 'Frozen ground', set: { move: 0 }, note: 'No one swaps places, so each type can only grow at its edges. All three types survive, near a third each.' }
    ],
    legend: [{ label: 'rock', color: '--orange' }, { label: 'scissors', color: '--violet' }, { label: 'paper', color: '--teal' }, { label: 'each square is one blob', color: '--ground' }],
    series: [{ key: 'rock', label: 'Rock', color: '--orange' }, { key: 'scissors', label: 'Scissors', color: '--violet' }, { key: 'paper', label: 'Paper', color: '--teal' }],
    ymax: .6, fmt: pct,
    theory(p) { return p.start === 'three' ? [{ value: 1 / 3 * .82, label: 'equal thirds', color: '--mute' }] : []; },
    init(p, r) {
      const g = new Uint8Array(N);
      for (let i = 0; i < N; i++) { const u = r(); g[i] = u < .18 ? 0 : p.start === 'two' ? 1 + ((r() * 2) | 0) : 1 + ((r() * 3) | 0); }
      const mascots = [];
      for (let k = 0; k < MASCOTS; k++) mascots.push((((k + .5) * 0.7548777) % 1 * C | 0) + ((((k + .5) * 0.5698403) % 1 * R_) | 0) * C); // R2 low-discrepancy spread
      return { day: 0, g, mascots, img: new Uint8Array(N * 4) };
    },
    step(s, p, r) {
      const g = s.g, eps = p.move, tot = 2 + eps, mixed = p.mixed === 'mixed';
      for (let e = 0; e < N * 2; e++) {
        const i = (r() * N) | 0;
        let j;
        if (mixed) j = (r() * N) | 0;
        else { const d = (r() * 4) | 0, x = i % C, y = (i / C) | 0; j = d === 0 ? (x + 1) % C + y * C : d === 1 ? (x + C - 1) % C + y * C : d === 2 ? x + ((y + 1) % R_) * C : x + ((y + R_ - 1) % R_) * C; }
        const u = r() * tot, a = g[i], b = g[j];
        if (u < 1) { if (beats(a, b)) g[j] = 0; }
        else if (u < 2) { if (a && !b) g[j] = a; }
        else { g[i] = b; g[j] = a; }
      }
      s.day++;
    },
    metrics(s) {
      const c = [0, 0, 0, 0];
      for (let i = 0; i < N; i++) c[s.g[i]]++;
      return { rock: c[1] / N, scissors: c[2] / N, paper: c[3] / N };
    },
    kpis(s) {
      const m = this.metrics(s), alive = ['rock', 'scissors', 'paper'].filter(k => m[k] > 0).length, sh = v => v > 0 && v < .005 ? '<1%' : pct(v);
      return [
        { label: 'Types alive', value: alive + ' of 3', tone: alive === 3 ? '--green-text' : '--red-text' },
        { label: 'Rock', value: sh(m.rock) },
        { label: 'Scissors', value: sh(m.scissors) },
        { label: 'Paper', value: sh(m.paper) }
      ];
    },
    insight(s, p) {
      const m = this.metrics(s), dead = ['rock', 'scissors', 'paper'].filter(k => m[k] === 0);
      if (dead.length === 2) return 'Only one type is left. With no type to beat it, it fills the island.';
      if (dead.length === 1) return dead[0][0].toUpperCase() + dead[0].slice(1) + ' died out. The type it used to hold back now takes over.';
      if (s.day < 20) return 'Each type eats the type it beats, and every type fills empty ground. Watch the colours chase each other.';
      if (p.mixed === 'mixed') return 'Everyone meets everyone, so the swings grow. Sooner or later one type hits zero.';
      if (p.move >= 8) return 'Fast mixing makes the waves huge. When a wave covers the island, a type can be wiped out.';
      return 'Each type survives in its own waves. Every region keeps changing, but the whole island stays mixed.';
    },
    render(R, s, t, now) {
      const img = s.img, g = s.g, key = COL.map(BS.col).join();
      if (s.palKey !== key) { s.palKey = key; s.pal = COL.map(k => { const c = BS.col(k); return [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; }); }
      for (let i = 0; i < N; i++) { const c = s.pal[g[i]], o = i * 4; img[o] = c[0]; img[o + 1] = c[1]; img[o + 2] = c[2]; img[o + 3] = g[i] ? 255 : 0; }
      R.field(C, R_, img);
      s.mascots.forEach((i, k) => { // a few big blobs stand on the field and show the type under them
        if (!g[i]) return;
        const x = ((i % C) + .5) / C * W, y = (((i / C) | 0) + .5) / R_;
        R.blob(x, y, .03, COL[g[i]], { lift: .004 + Math.abs(Math.sin(now / 400 + k)) * .006, angry: g[i] === 1, smile: g[i] === 3, blink: BS.blinking(k, now) });
      });
    }
  });
  BS.rpsNames = NAMES;
})(typeof window !== 'undefined' ? window : globalThis);
