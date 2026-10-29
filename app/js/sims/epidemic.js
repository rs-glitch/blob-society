// Outbreak: agent-based SIR. Sick blobs infect susceptible blobs within RAD; each case lasts DUR days.
(function (G) {
  const BS = G.BS;
  const { shuffle, clamp, lerp, ease, pct, seg, W, H } = BS;
  const back = u => 1 + 2.7 * Math.pow(u - 1, 3) + 1.7 * Math.pow(u - 1, 2); // ease-out-back: a small overshoot for pops
  // Days per second the view advances. Labels are only shown when this is low enough to read them.
  const pace = BS.pace || (BS.pace = (s, t, now) => { if (s._pn != null && now > s._pn && t >= s._pt) s._pr = (t - s._pt) / (now - s._pn) * 1000; s._pt = t; s._pn = now; return s._pr || 0; });
  const N = 360, DUR = 10, RAD = .03, SPD = .035, EDGE = .025, R0_CASES = 40;

  BS.sims.push({
    id: 'epidemic', name: 'Outbreak', topic: 'Disease & inference', accent: '--red', dayLabel: 'day', biome: 'village',
    question: 'When does a disease die out, and when does it stay?',
    hook: ["One sick blob walks into town.","Will the bug die out, or stay?"],
    source: 'After Primer, “Epidemic, Endemic, and Eradication Simulations”',
    knobs: [
      { id: 'beta', label: 'Infection chance per contact', hint: 'Per day, for each sick blob nearby', min: 5, max: 90, step: 5, value: 35, reset: true, fmt: v => v + '%' },
      { id: 'dist', label: 'Blobs staying home', hint: 'They do not move', min: 0, max: 90, step: 5, value: 0, reset: true, fmt: v => v + '%' },
      { id: 'vax', label: 'Vaccinated at start', min: 0, max: 90, step: 5, value: 0, reset: true, fmt: v => v + '%' },
      { id: 'wane', label: 'Immunity loss', hint: 'Chance per day that an immune blob becomes susceptible', min: 0, max: 3, step: .25, value: 0, fmt: v => v.toFixed(2) + '%/day' }
    ],
    chapters: [
      { title: 'Free spread', text: 'Sick blobs infect close neighbours. Cases rise fast, then peak and fall while many blobs are still susceptible: sick blobs start to meet mostly immune ones.', set: { beta: 35, dist: 0, vax: 0, wane: 0 } },
      { title: 'Stay home', text: 'Half of the blobs stop moving. Fewer contacts give a lower, later peak, and more blobs never get sick.', set: { beta: 35, dist: 50, vax: 0, wane: 0 } },
      { title: 'Herd immunity', text: 'Vaccinate 70 %. Each sick blob infects fewer than one other on average, so the outbreak fizzles. The unvaccinated are protected too.', set: { beta: 35, dist: 0, vax: 70, wane: 0 } },
      { title: 'Immunity fades', text: 'Let immunity fade. New susceptible blobs keep the disease alive. It becomes endemic, with waves. In a small town it can still vanish by chance.', set: { beta: 35, dist: 0, vax: 0, wane: 2 } }
    ],
    presets: [
      { label: 'Very contagious', set: { beta: 90 }, note: 'Nine in ten contacts infect. More than half of the town is sick at the peak.' },
      { label: 'Mild bug', set: { beta: 10 }, note: 'Few contacts infect. Each case infects fewer than one other, and the outbreak fizzles.' },
      { label: 'Hard lockdown', set: { dist: 90 }, note: 'Nine in ten blobs stay home. The peak stays tiny and most blobs never get sick.' }
    ],
    legend: [{ label: 'susceptible', color: '--blue' }, { label: 'infected', color: '--red' }, { label: 'immune', color: '--slate' }, { label: 'vaccinated (ring)', color: '--green' }],
    series: [{ key: 'S', label: 'Susceptible', color: '--blue' }, { key: 'I', label: 'Infected', color: '--red', area: true }, { key: 'R', label: 'Immune', color: '--slate' }],
    ymax: 1, fmt: pct,
    theory() { return []; }, // the well-mixed 1/R0 rule does not hold well in this spatial model, so no line is drawn
    init(p, r) {
      const blobs = [];
      for (let i = 0; i < N; i++) {
        const x = EDGE + r() * (W - 2 * EDGE), y = EDGE + r() * (H - 2 * EDGE);
        blobs.push({ id: i, x, y, px: x, py: y, a: r() * 6.2832, still: r() < p.dist / 100, st: 0, vax: false, t0: 0, sec: 0 });
      }
      blobs.forEach(b => { if (r() < p.vax / 100) { b.st = 2; b.vax = true; } });
      shuffle(blobs.filter(b => b.st === 0), r).slice(0, 4).forEach(b => { b.st = 1; });
      return { day: 0, blobs, done: [], r0: 0, peak: 0, peakDay: 0, ever: 4 };
    },
    step(s, p, r) {
      const B = s.blobs, nx = Math.ceil(W / RAD), grid = new Map();
      B.forEach((b, i) => {
        b.px = b.x; b.py = b.y; b.fresh = false; b.ev = 0;
        if (!b.still) {
          b.a += (r() - .5) * .8;
          b.x += Math.cos(b.a) * SPD; b.y += Math.sin(b.a) * SPD;
          if (b.x < EDGE || b.x > W - EDGE) { b.a = Math.PI - b.a; b.x = clamp(b.x, EDGE, W - EDGE); }
          if (b.y < EDGE || b.y > H - EDGE) { b.a = -b.a; b.y = clamp(b.y, EDGE, H - EDGE); }
        }
        const key = Math.floor(b.x / RAD) + Math.floor(b.y / RAD) * nx;
        (grid.get(key) || grid.set(key, []).get(key)).push(i);
      });
      const fresh = [];
      B.forEach(b => {
        if (b.st !== 1) return;
        const cx = Math.floor(b.x / RAD), cy = Math.floor(b.y / RAD);
        for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
          const cell = grid.get(cx + dx + (cy + dy) * nx);
          if (!cell) continue;
          for (const j of cell) {
            const o = B[j];
            if (o.st !== 0 || o.hit) continue;
            if ((o.x - b.x) ** 2 + (o.y - b.y) ** 2 < RAD * RAD && r() < p.beta / 100) { o.hit = true; fresh.push(o); o.by = b; b.sec++; }
          }
        }
      });
      B.forEach(b => {
        if (b.st === 1 && s.day - b.t0 >= DUR) { b.st = 2; b.ev = 1; s.done.push(b.sec); }
        else if (b.st === 2 && p.wane > 0 && r() < p.wane / 100) { b.st = 0; b.vax = false; b.ev = 2; }
      });
      fresh.forEach(o => { o.st = 1; o.t0 = s.day + 1; o.sec = 0; o.hit = false; o.fresh = true; });
      s.ever += fresh.length;
      s.day++;
      // R0 = mean secondary cases of the first 40 recovered cases (infected while nearly all were susceptible).
      if (!s.r0 && s.done.length >= R0_CASES) s.r0 = s.done.slice(0, R0_CASES).reduce((a, b) => a + b, 0) / R0_CASES;
      const I = B.filter(b => b.st === 1).length / N;
      if (I > s.peak) { s.peak = I; s.peakDay = s.day; }
    },
    metrics(s) {
      let S = 0, I = 0, R = 0;
      s.blobs.forEach(b => { if (b.st === 0) S++; else if (b.st === 1) I++; else R++; });
      return { S: S / N, I: I / N, R: R / N };
    },
    kpis(s) {
      const m = this.metrics(s);
      return [
        { label: 'Infected now', value: pct(m.I), tone: '--red-text' },
        { label: 'R₀ (measured)', value: s.r0 ? s.r0.toFixed(1) : '…', note: 'first ' + R0_CASES + ' cases' },
        { label: 'Herd immunity at', value: s.r0 > 1 ? '≈ ' + pct(1 - 1 / s.r0) : '–', note: '1 − 1/R₀, well-mixed rule' },
        { label: 'Ever infected', value: pct(Math.min(1, s.ever / N)) }
      ];
    },
    insight(s, p) {
      const m = this.metrics(s);
      if (m.I === 0 && s.day > 0) {
        if (p.wane > 0 && s.day > 60) return 'The disease died out by chance, although immunity fades. Small groups can lose a disease by luck. Press New run to try again.';
        if (s.ever < 20) return 'The outbreak died out after ' + s.ever + ' cases. Each sick blob infected fewer than one other on average.';
        return 'The outbreak is over. ' + pct(Math.min(1, s.ever / N)) + ' of blobs got sick. Cases peaked on day ' + s.peakDay + ' at ' + pct(s.peak) + '.';
      }
      if (!s.r0) return 'Each sick blob is sick for ' + DUR + ' days. The app counts how many blobs each early case infects, to measure R₀.';
      if (p.wane > 0 && s.day > 120) return 'Immunity fades, so new susceptible blobs appear. The disease stays: it is endemic.';
      return 'R₀ is about ' + s.r0.toFixed(1) + ': each early case infected that many others. As immune blobs build up, sick blobs meet fewer susceptible ones, so cases fall before everyone is sick.';
    },
    // Choreography per day: every blob walks at a steady pace (no stop-and-go). A sick blob sends a red pulse (ring and line) to each new case,
    // and the case turns red with a pop when the pulse arrives (.2-.6). Recovered blobs fade to slate and lost immunity turns blue at .5.
    render(R, s, t, now, p) {
      const slow = pace(s, t, now) < 2.1, RR = .016, at = b => ({ x: lerp(b.px, b.x, t), y: lerp(b.py, b.y, t) });
      const hitT = b => .22 + .38 * ((b.id * .618) % 1);
      let said = 0, rings = 0;
      s.blobs.forEach(b => {
        const P = at(b), fresh = b.fresh && b.by;
        let st = b.st, r = RR, sq = 1;
        if (fresh) {
          const h = hitT(b), u = seg(t, h - .14, h);
          if (t < h) st = 0; else r = RR * (1 + .5 * (1 - back(seg(t, h, h + .18))));
          if (u > 0 && u < 1 && rings < 200) { const Q = at(b.by); R.ring(Q.x, Q.y, RAD * ease(u), '--red'); R.line(Q.x, Q.y, P.x, P.y, '--red', u, .02); rings++; }
          if (slow && t >= h && t < h + .3 && said++ < 4) R.label(P.x, P.y, 'sick!', '--red', Math.min(seg(t, h, h + .04), 1 - seg(t, h + .22, h + .3)), .06);
        } else if (b.ev === 1 && t < .5) st = 1;
        else if (b.ev === 2 && t < .5) st = 2;
        if (b.ev === 1 && t >= .5 && t < .65) sq = 1 + .2 * Math.sin(Math.PI * seg(t, .5, .65)); // sigh
        const col = st === 0 ? '--blue' : st === 1 ? '--red' : '--slate';
        R.blob(P.x, P.y, r, col, { frown: st === 1, smile: st === 0, squash: sq, lift: b.still ? 0 : Math.abs(Math.sin(t * 6.2832 + b.id)) * .005, blink: BS.blinking(b.id, now) });
        if (st === 1 && rings < 200) { R.ring(P.x, P.y, RAD, '--red'); rings++; }
        if (b.vax && b.st === 2) R.ring(P.x, P.y, r * 1.5, '--green');
      });
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
