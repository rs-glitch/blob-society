// Yard-Sale Economy: pairs bet a share of the poorer blob's wealth on a coin flip.
(function (G) {
  const BS = G.BS;
  const { shuffle, clamp, lerp, ease, pct, seg, W } = BS;
  // Days per second the view advances. Labels are only shown when this is low enough to read them.
  const pace = BS.pace || (BS.pace = (s, t, now) => { if (s._pn != null && now > s._pn && t >= s._pt) s._pr = (t - s._pt) / (now - s._pn) * 1000; s._pt = t; s._pn = now; return s._pr || 0; });
  const N = 150, COLS = 15, ROWS = N / COLS, MEAN = 100;

  function rank(s) { // wealth class per blob, used by draw; computed once per day
    s.blobs.slice().sort((a, b) => a.w - b.w).forEach((b, i) => { b.cls = i >= N * .9 ? '--gold' : i >= N * .5 ? '--teal' : '--slate'; });
  }

  BS.sims.push({
    id: 'wealth', name: 'Yard-Sale Economy', topic: 'Society & economy', accent: '--gold', dayLabel: 'day', biome: 'hills',
    question: 'Can fair coin-flip trades make extreme inequality?',
    hook: ["Every trade is a fair coin flip.","Yet a few blobs end up with almost everything."],
    source: 'After the yard-sale model of Hayes (2002) and Boghosian (2019)',
    knobs: [
      { id: 'bet', label: 'Stake per trade', hint: 'Share of the poorer blob’s wealth at stake', min: 1, max: 40, step: 1, value: 10, fmt: v => v + '%' },
      { id: 'tax', label: 'Wealth tax, shared equally', hint: 'Taken from each blob each day, paid back to all', min: 0, max: 5, step: .1, value: 0, fmt: v => v.toFixed(1) + '%/day' },
      { id: 'edge', label: 'Rich advantage', hint: 'Extra win chance for the richer blob', min: 0, max: 10, step: .5, value: 0, fmt: v => v.toFixed(1) + '%' }
    ],
    chapters: [
      { title: 'A fair coin', text: 'All 150 blobs start with 100 coins. Pairs bet 10 % of the poorer blob’s coins on a fair coin flip. No one cheats, yet wealth flows up.', set: { bet: 10, tax: 0, edge: 0 } },
      { title: 'Bigger bets', text: 'Raise the stake to 30 %. Inequality grows much faster. A loss hurts the poor more than a win helps them.', set: { bet: 30, tax: 0, edge: 0 } },
      { title: 'A small tax', text: 'Take 1 % of each blob’s wealth each day and share it equally. The Gini stops rising and settles at a stable level.', set: { bet: 10, tax: 1, edge: 0 } },
      { title: 'Rich win more', text: 'Give the richer blob a small extra win chance, with the same tax. A few blobs pull away again.', set: { bet: 10, tax: 1, edge: 4 } }
    ],
    presets: [
      { label: 'All-in bets', set: { bet: 40 }, note: 'Each trade risks 40 % of the poorer blob’s coins. Within 200 days the Gini passes 0.9.' },
      { label: 'Heavy tax', set: { tax: 5 }, note: 'A 5 % daily tax, shared equally. Luck cannot pile up, and the Gini stays near 0.25.' },
      { label: 'Rich always win', set: { edge: 10 }, note: 'The richer blob gets a large extra win chance, with fair-size bets. The Gini still passes 0.9 within 200 days.' }
    ],
    legend: [{ label: 'bottom 50 %', color: '--slate' }, { label: 'middle 40 %', color: '--teal' }, { label: 'top 10 %', color: '--gold' }],
    series: [{ key: 'gini', label: 'Gini', color: '--gold', area: true }, { key: 'top10', label: 'Top 10 % share', color: '--violet' }],
    ymax: 1, fmt: v => v.toFixed(2),
    theory(p) { return p.tax === 0 && p.edge === 0 ? [{ value: 1, label: 'no-tax limit: Gini → 1', color: '--gold' }] : []; },
    init() {
      const blobs = [];
      for (let i = 0; i < N; i++) blobs.push({ id: i, w: MEAN, pw: MEAN, x: .08 + (i % COLS) / (COLS - 1) * (W - .16), y: .12 + Math.floor(i / COLS) / (ROWS - 1) * .8 });
      const s = { day: 0, blobs, trades: [] };
      rank(s);
      return s;
    },
    step(s, p, r) {
      const f = p.bet / 100;
      s.blobs.forEach(b => b.pw = b.w);
      s.trades = [];
      for (let round = 0; round < 3; round++) {
        const idx = shuffle([...Array(N).keys()], r);
        for (let i = 0; i + 1 < N; i += 2) {
          const a = s.blobs[idx[i]], b = s.blobs[idx[i + 1]];
          const rich = a.w >= b.w ? a : b, poor = rich === a ? b : a;
          const stake = f * poor.w, pr = .5 + Math.min(.4, p.edge / 100 * (rich.w - poor.w) / MEAN);
          const win = r() < pr;
          if (round === 0 && i < 8) s.trades.push({ rich, poor, stake, win }); // first 4 trades of the day are shown in render()
          if (win) { rich.w += stake; poor.w -= stake; } else { rich.w -= stake; poor.w += stake; }
        }
      }
      if (p.tax > 0) { let pool = 0; s.blobs.forEach(b => { const t = b.w * p.tax / 100; b.w -= t; pool += t; }); s.blobs.forEach(b => b.w += pool / N); }
      s.day++;
      rank(s);
    },
    metrics(s) {
      const w = s.blobs.map(b => b.w).sort((a, b) => b - a), tot = w.reduce((a, b) => a + b, 0);
      return { gini: BS.gini(w), top10: w.slice(0, N / 10).reduce((a, b) => a + b, 0) / tot, top1: w[0] / tot };
    },
    kpis(s) {
      const m = this.metrics(s), w = s.blobs.map(b => b.w).sort((a, b) => a - b), median = (w[N / 2 - 1] + w[N / 2]) / 2;
      return [
        { label: 'Gini', value: m.gini.toFixed(2), tone: '--gold-text', note: '0 = equal, 1 = one blob owns all' },
        { label: 'Top 10 % own', value: pct(m.top10) },
        { label: 'Richest blob', value: pct(m.top1) + ' of all' },
        { label: 'Median coins', value: Math.round(median) + ' / ' + MEAN }
      ];
    },
    insight(s, p) {
      const m = this.metrics(s);
      if (s.day < 15) return 'Every trade is a fair coin flip. Watch the yellow line anyway.';
      if (p.tax === 0 && p.edge === 0) {
        if (m.gini > .95) return 'Gini is ' + m.gini.toFixed(2) + '. Almost one blob owns everything, from fair coin flips only.';
        return 'Gini has risen to ' + m.gini.toFixed(2) + '. A blob that loses has less to bet next time, so bad luck compounds. With no tax, nearly all wealth ends with one blob.';
      }
      if (p.edge > 0) return 'The rich win slightly more often. The top 10 % now own ' + pct(m.top10) + '.';
      return 'The tax pulls wealth back as fast as luck pushes it up. Gini holds near ' + m.gini.toFixed(2) + '.';
    },
    extraTitle: 'Lorenz curve',
    extraDraw(ctx, w, h, s) {
      const L = 28, B = 20, T = 6, R = 8, pw = w - L - R, ph = h - T - B;
      const ws = s.blobs.map(b => b.w).sort((a, b) => a - b), tot = ws.reduce((a, b) => a + b, 0);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = BS.col('--grid'); ctx.lineWidth = 1; ctx.strokeRect(L, T, pw, ph);
      ctx.setLineDash([4, 4]); ctx.strokeStyle = BS.col('--mute');
      ctx.beginPath(); ctx.moveTo(L, T + ph); ctx.lineTo(L + pw, T); ctx.stroke(); ctx.setLineDash([]);
      ctx.beginPath(); ctx.moveTo(L, T + ph);
      let c = 0;
      ws.forEach((x, i) => { c += x; ctx.lineTo(L + (i + 1) / ws.length * pw, T + ph - c / tot * ph); });
      ctx.lineTo(L + pw, T + ph); ctx.closePath();
      ctx.fillStyle = BS.alpha('--gold', .25); ctx.fill(); ctx.strokeStyle = BS.col('--gold'); ctx.lineWidth = 2; ctx.stroke();
      ctx.fillStyle = BS.col('--mute'); ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.fillText('poorest', L, h - 6); ctx.textAlign = 'right'; ctx.fillText('richest', L + pw, h - 6);
      ctx.save(); ctx.translate(11, T + ph / 2); ctx.rotate(-1.5708); ctx.textAlign = 'center'; ctx.fillText('share of coins', 0, 0); ctx.restore();
    },
    // Choreography per day: four sample trades play one after another. Both bettors lift a coin to the middle, the coins flip
    // in the air, then both fly to the winner, and "+x" / "−x" appear. Every blob grows or shrinks smoothly (.1-.95).
    render(R, s, t, now, p) {
      const slow = pace(s, t, now) < 2.1, cell = (W - .16) / (COLS - 1), base = cell * .3, e = ease(seg(t, .1, .95));
      const rad = b => clamp(Math.sqrt(Math.max(lerp(b.pw, b.w, e), 0) / MEAN) * base, .004, cell * 1.4);
      const fmt = v => v < 10 ? v.toFixed(1) : Math.round(v);
      s.blobs.forEach(b => {
        const r = rad(b);
        R.blob(b.x, b.y, r, b.cls, { smile: b.cls === '--gold', blink: BS.blinking(b.id, now), lift: 0 });
        if (b.cls === '--gold') R.prop('coin', b.x, b.y, .009, '--gold', { lift: r * 1.9 + .025 + Math.sin(now / 400 + b.id) * .004, rot: now / 500 }); // the rich wear a spinning coin
      });
      (s.trades || []).forEach((tr, i) => {
        const a = .06 + .21 * i, u = seg(t, a, a + .22), A = tr.rich, B = tr.poor;
        if (u <= 0 || u >= 1) return;
        const M = { x: (A.x + B.x) / 2, y: (A.y + B.y) / 2 }, W_ = tr.win ? A : B, L_ = tr.win ? B : A;
        const up = ease(seg(u, 0, .35)), go = ease(seg(u, .62, .88)), flip = u > .35 && u < .62 && Math.floor((u - .35) * 60) % 2 === 0;
        R.line(A.x, A.y, B.x, B.y, '--mute', .6, .03);
        R.ring(A.x, A.y, rad(A) * 1.5, '--ink'); R.ring(B.x, B.y, rad(B) * 1.5, '--ink');
        [[A, -1], [B, 1]].forEach(([P, side]) => {
          const from = u < .62 ? P : M, to = u < .62 ? M : W_, k = u < .62 ? up : go;
          R.prop('coin', lerp(from.x, to.x, k) + (u < .62 ? side * .012 * up : 0), lerp(from.y, to.y, k), .011 * (1 - seg(u, .88, 1)), flip ? '--slate' : '--gold', { lift: .04 + (u < .62 ? Math.sin(Math.PI * up / 2) * .1 : .1 * (1 - go)) + (u > .35 && u < .62 ? Math.abs(Math.sin((u - .35) * 25)) * .03 : 0), rot: u * 30 });
        });
        if (slow) {
          const la = Math.min(seg(u, .8, .88), 1 - seg(u, .94, 1));
          R.label(W_.x, W_.y, '+' + fmt(tr.stake), '--green', la, rad(W_) * 2 + .04);
          R.label(L_.x, L_.y, '−' + fmt(tr.stake), '--red', la, rad(L_) * 2 + .04);
        }
      });
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
