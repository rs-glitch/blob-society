// Tragedy of the Commons: 12 boats fish one lake. Fish regrow logistically. Boats copy the type of a better-earning boat.
(function (G) {
  const BS = G.BS;
  const { lerp, ease, pct, W } = BS;
  const BOATS = 12, Q = .004, COST = .001, EFFORT = [1, 3]; // restrained, greedy
  const boatPos = i => { const a = i / BOATS * 6.2832 + .26; return { x: W / 2 + Math.cos(a) * .56, y: .5 + Math.sin(a) * .42 }; };

  BS.sims.push({
    id: 'commons', name: 'Tragedy of the Commons', topic: 'Society & economy', accent: '--green', dayLabel: 'day', biome: 'lake', maxDays: 800,
    question: 'Why do shared fish stocks collapse?',
    hook: ["Each boat takes a little more.","Together, they can empty the lake."],
    source: 'After Hardin (1968) and Ostrom (1990); fishery model after Gordon–Schaefer',
    knobs: [
      { id: 'regrow', label: 'Fish regrowth', hint: 'Growth per day when the lake is half full', min: .05, max: .2, step: .01, value: .1, fmt: v => (v * 25).toFixed(1) + '%/day' },
      { id: 'quota', label: 'Daily catch limit', hint: 'Share of a full lake; 0 = no limit', min: 0, max: .04, step: .002, value: 0, fmt: v => v ? (v * 100).toFixed(1) + '%' : 'none' },
      { id: 'fine', label: 'Fine for greedy boats', hint: 'Paid each day by each greedy boat', min: 0, max: 4, step: .5, value: 0, fmt: v => v.toFixed(1) },
      { id: 'mut', label: 'Boats try the other way', hint: 'Chance per day that a boat switches type at random', min: 0, max: 5, step: .5, value: 1, fmt: v => v.toFixed(1) + '%' },
      { id: 'g0', label: 'Greedy boats at start', min: 0, max: 12, step: 1, value: 1, reset: true, fmt: v => v }
    ],
    chapters: [
      { title: 'Everyone holds back', text: 'All 12 boats fish gently, and no boat tries anything new. The fish regrow as fast as they are caught, so the lake stays about half full.', set: { g0: 0, quota: 0, fine: 0, regrow: .1, mut: 0 } },
      { title: 'One greedy boat', text: 'One boat fishes three times as hard and earns more. Other boats copy it, and the fish fall. They fall until fishing barely pays at all. Boats keep switching, but on average no boat earns anything.', set: { g0: 1, quota: 0, fine: 0, regrow: .1, mut: 1 } },
      { title: 'A total catch limit', text: 'Cap the total catch each day. The fish are safe, but boats still race each other for a share of the limit. Greedy boats burn effort to win that race, so income stays low.', set: { g0: 1, quota: .024, fine: 0, regrow: .1, mut: 1 } },
      { title: 'The village fines greed', text: 'Now the village fines each greedy boat. Greed no longer pays, boats switch back to holding back, and the lake recovers.', set: { g0: 6, quota: 0, fine: 2.5, regrow: .1, mut: 1 } }
    ],
    presets: [
      { label: 'Fast fish', set: { regrow: .2 }, note: 'Fish regrow twice as fast. Greed still spreads, but the lake and the income hold up much better.' },
      { label: 'All greedy, harsh fine', set: { g0: 12, fine: 4 }, note: 'Every boat starts greedy, but the fine is high. Boats switch back, and the lake recovers.' },
      { label: 'Very tight limit', set: { quota: .01 }, note: 'The catch limit is tiny. The lake stays almost full, but no boat earns anything.' }
    ],
    legend: [{ label: 'gentle boat', color: '--teal' }, { label: 'greedy boat', color: '--orange' }, { label: 'fish', color: '--gold' }],
    series: [{ key: 'stock', label: 'Fish in the lake', color: '--gold', area: true }, { key: 'greedy', label: 'Greedy boats', color: '--orange' }, { key: 'income', label: 'Income per boat', color: '--teal' }],
    ymax: 1, fmt: pct,
    theory(p) { return [{ value: .5, label: 'best sustainable level', color: '--mute' }]; },
    init(p, r) {
      const boats = [];
      for (let i = 0; i < BOATS; i++) boats.push({ id: i, g: i < p.g0 ? 1 : 0, pg: i < p.g0 ? 1 : 0, inc: 0, catch: 0, ...boatPos(i) });
      const fish = [];
      for (let k = 0; k < 90; k++) fish.push({ x: W / 2 + (r() - .5) * .8, y: .5 + (r() - .5) * .55, a: r() * 6.2832 });
      return { day: 0, stock: .5, pstock: .5, boats, fish, income: 0 };
    },
    step(s, p, r) {
      const B = s.boats;
      s.pstock = s.stock;
      let want = 0;
      B.forEach(b => { b.pg = b.g; b.catch = Q * EFFORT[b.g] * s.stock; want += b.catch; });
      const cap = Math.min(p.quota > 0 ? p.quota : Infinity, s.stock * .5); // boats cannot catch more than half the fish in one day
      const scale = want > cap ? cap / want : 1;
      let total = 0;
      B.forEach(b => {
        b.catch *= scale; total += b.catch;
        const today = (b.catch - COST * EFFORT[b.g] - (b.g ? p.fine / 1000 : 0)) * 1000;
        b.inc = .8 * b.inc + .2 * today;
      });
      s.stock = Math.max(.001, s.stock + p.regrow * s.stock * (1 - s.stock) - total); // a few fish always survive
      B.forEach(b => { // imitation: copy a random boat that earns clearly more
        if (r() < .15) { const o = B[(r() * BOATS) | 0]; if (o.inc > b.inc + .05) b.g = o.g; }
        if (r() < p.mut / 100) b.g = 1 - b.g; // now and then a boat tries the other way
      });
      s.income = B.reduce((a, b) => a + b.inc, 0) / BOATS;
      s.day++;
    },
    metrics(s) {
      return { stock: s.stock, greedy: s.boats.filter(b => b.g).length / BOATS, income: Math.max(0, Math.min(1, s.income / 1.5)) };
    },
    kpis(s) {
      const m = this.metrics(s);
      return [
        { label: 'Fish in the lake', value: pct(s.stock), tone: '--gold-text', note: 'of a full lake' },
        { label: 'Greedy boats', value: Math.round(m.greedy * BOATS) + ' of ' + BOATS },
        { label: 'Income per boat', value: s.income.toFixed(2), note: 'per day, smoothed' },
        { label: 'Catch today', value: (s.boats.reduce((a, b) => a + b.catch, 0) * 100).toFixed(2) + '%' }
      ];
    },
    insight(s, p) {
      const m = this.metrics(s);
      if (s.day < 20) return 'Each boat compares its income with a neighbour boat and copies the one that earns more.';
      if (s.income < .3 && p.quota === 0 && p.fine === 0 && s.day > 60) return 'Each boat chose what paid best for itself, and together they fished the lake down until fishing barely pays. Income is near zero.';
      if (p.fine > 0 && m.greedy < .1) return 'The fine made greed cost more than it earns. Boats hold back and the lake recovers to ' + pct(s.stock) + '.';
      if (p.quota > 0 && s.stock > .25) return 'The limit protects the fish (' + pct(s.stock) + ' of a full lake), but boats race for their share, so income stays low.';
      if (m.greedy === 0) return 'Every boat holds back. The fish regrow as fast as they are caught.';
      return 'Greedy boats earn more, so others copy them. Watch the fish line fall.';
    },
    // Choreography: boats cast (0-.25), fish jump to the boats in proportion to the catch (.25-.75), counts settle (.75-1).
    render(R, s, t, now) {
      const show = Math.round(lerp(s.pstock, s.stock, ease(BS.seg(t, .6, 1))) * 90), jump = BS.seg(t, .25, .75);
      s.fish.forEach((f, k) => {
        if (k >= show) return;
        f.a += .004;
        R.prop('fish', f.x + Math.cos(f.a + k) * .015, f.y + Math.sin(f.a * 1.3 + k) * .01, .006, '--gold', { rot: f.a + k });
      });
      s.boats.forEach(b => {
        const bob = Math.sin(now / 600 + b.id) * .002;
        R.prop('boat', b.x, b.y, .012, b.pg ? '--orange' : '--teal', { lift: bob, rot: Math.atan2(b.y - .5, b.x - W / 2) + 1.57 });
        R.blob(b.x, b.y, .017, b.pg ? '--orange' : '--teal', { lift: .01 + bob, angry: !!b.pg, smile: !b.pg, blink: BS.blinking(b.id, now) });
        const nfish = Math.min(4, Math.round(b.catch * 900));
        for (let k = 0; k < nfish && jump > 0 && jump < 1; k++) {
          const sx = W / 2 + Math.cos(k * 2.1 + b.id) * .12, sy = .5 + Math.sin(k * 2.1 + b.id) * .08, u = BS.clamp(jump * 1.3 - k * .1, 0, 1);
          R.prop('fish', lerp(sx, b.x, u), lerp(sy, b.y, u), .006, '--gold', { lift: Math.sin(Math.PI * u) * .05 });
        }
        if (t > .25 && t < .85 && b.catch > 0) R.label(b.x, b.y, '+' + (b.catch * 1000).toFixed(1), b.pg ? '--orange-text' : '--teal-text', 1 - BS.seg(t, .7, .85), .05);
        if (b.g !== b.pg && t > .75) R.label(b.x, b.y, b.g ? 'turns greedy' : 'holds back', '--ink', 1, .08);
      });
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
