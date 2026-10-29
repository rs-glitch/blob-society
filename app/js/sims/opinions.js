// Echo Chambers (Deffuant bounded confidence): two blobs talk only if their opinions are close; then both move closer.
(function (G) {
  const BS = G.BS;
  const { shuffle, lerp, ease, pct, W } = BS;
  const N = 160, MU = .2, PAIRS = 40, X0 = .1, X1 = W - .1; // a few slow talks per day, so the drift is visible
  const ox = o => X0 + o * (X1 - X0);

  function camps(s) { // a camp = a tight group (range < 0.1, gaps <= 0.05) with >= 3 % of blobs; a random crowd has none
    const o = s.blobs.map(b => b.o).sort((a, b) => a - b);
    let n = 0, largest = 0, start = 0;
    for (let i = 1; i <= o.length; i++) if (i === o.length || o[i] - o[i - 1] > .05) {
      const size = i - start;
      if (size >= N * .03 && o[i - 1] - o[start] < .1) { n++; largest = Math.max(largest, size); }
      start = i;
    }
    return { n, largest: largest / N };
  }
  function mixColor(a, b, u) { // blend two colour tokens, returns #rrggbb
    const ca = BS.col(a), cb = BS.col(b), h = (c, i) => parseInt(c.slice(i, i + 2), 16);
    return '#' + [1, 3, 5].map(i => Math.round(lerp(h(ca, i), h(cb, i), u)).toString(16).padStart(2, '0')).join('');
  }

  BS.sims.push({
    id: 'opinions', name: 'Echo Chambers', topic: 'Society & economy', accent: '--magenta', dayLabel: 'day', biome: 'foothills', maxDays: 1200,
    question: 'Why do groups split into camps that stop talking?',
    hook: ["We only listen to people who almost agree.","That is how camps form."],
    source: 'After Deffuant, Neau, Amblard & Weisbuch (2000), bounded-confidence model',
    knobs: [
      { id: 'eps', label: 'Open-mindedness', hint: 'Two blobs talk only if their opinions differ by less than this', min: .04, max: .6, step: .02, value: .2, fmt: v => v.toFixed(2) },
      { id: 'stub', label: 'Loud stubborn blobs', hint: 'They sit at the far left and never change', min: 0, max: 15, step: 1, value: 0, reset: true, fmt: v => v + '%' }
    ],
    chapters: [
      { title: 'Open minds', text: 'Each blob holds an opinion from left to right. Two blobs that talk move a bit toward each other. With open minds, everyone talks and the island agrees.', set: { eps: .5, stub: 0 } },
      { title: 'Narrower minds', text: 'Now blobs only talk to those who already think much like them. The island splits into two or three camps that never talk again.', set: { eps: .2, stub: 0 } },
      { title: 'Closed minds', text: 'With very closed minds, many small camps form. Each camp agrees inside, but the island never agrees.', set: { eps: .08, stub: 0 } },
      { title: 'A loud few', text: 'Add a few blobs that never change their view. Open-minded blobs who talk to them drift their way, and pull the whole consensus to the left.', set: { eps: .3, stub: 8 } }
    ],
    presets: [
      { label: 'Wide open', set: { eps: .6 }, note: 'Everyone talks to everyone. One camp forms, and no one is left out.' },
      { label: 'Tiny bubbles', set: { eps: .04 }, note: 'Blobs only talk to near-twins. About ten small camps form and never merge.' },
      { label: 'Many loud', set: { eps: .3, stub: 15 }, note: '15 % of blobs never change their view. They pull the average opinion clearly to the left.' }
    ],
    legend: [{ label: 'left opinion', color: '--blue' }, { label: 'right opinion', color: '--orange' }, { label: 'line = two blobs talk', color: '--mute' }, { label: 'angry = stubborn', color: '--ink' }],
    series: [{ key: 'largest', label: 'Largest camp', color: '--magenta', area: true }, { key: 'spread', label: 'Spread of opinions', color: '--blue' }],
    ymax: 1, fmt: pct,
    theory() { return []; },
    init(p, r) {
      const blobs = [], stub = Math.round(N * p.stub / 100);
      for (let i = 0; i < N; i++) { const o = i < stub ? 0 : r(); blobs.push({ id: i, o, po: o, lane: .1 + ((i * 0.618034) % 1) * .8, stub: i < stub }); }
      return { day: 0, blobs, talks: [] };
    },
    step(s, p, r) {
      const B = s.blobs, idx = shuffle([...Array(N).keys()], r);
      B.forEach(b => b.po = b.o);
      s.talks = [];
      for (let k = 0; k + 1 < 2 * PAIRS; k += 2) {
        const a = B[idx[k]], b = B[idx[k + 1]], d = b.o - a.o;
        if (Math.abs(d) < p.eps) {
          if (!a.stub) a.o += MU * d;
          if (!b.stub) b.o -= MU * d;
          if (s.talks.length < 14) s.talks.push([a, b]);
        }
      }
      s.day++;
    },
    metrics(s) {
      const o = s.blobs.map(b => b.o), m = o.reduce((a, b) => a + b, 0) / N, sd = Math.sqrt(o.reduce((a, b) => a + (b - m) ** 2, 0) / N);
      return { largest: camps(s).largest, spread: Math.min(1, sd * 2), mean: m };
    },
    kpis(s) {
      const c = camps(s), m = this.metrics(s);
      return [
        { label: 'Camps', value: c.n, tone: '--magenta-text', note: 'groups ≥ 3 % of blobs' },
        { label: 'Largest camp', value: pct(c.largest) },
        { label: 'Average opinion', value: (m.mean * 100).toFixed(0) + ' / 100', note: '0 = far left' },
        { label: 'Talks today', value: s.talks.length >= 14 ? '14+' : s.talks.length }
      ];
    },
    insight(s, p) {
      const c = camps(s), m = this.metrics(s);
      if (s.day < 15) return 'Blobs slide toward the blobs they talk to. Watch whether one crowd forms or several.';
      if (p.stub > 0 && m.mean < .4) return 'A few stubborn blobs pulled the average opinion to ' + (m.mean * 100).toFixed(0) + ' / 100. They never move, so the crowd moves to them.';
      if (c.n === 0) return 'No camps yet. Opinions are still spread out and drifting.';
      if (c.n <= 1) return 'Everyone ended up in one camp. Open minds let every blob reach every other blob, one step at a time.';
      return c.n + ' camps formed. Inside each camp, blobs agree. Between camps, opinions are too far apart to talk, so the split is permanent.';
    },
    extraTitle: 'Opinions now',
    extraDraw(ctx, w, h, s) {
      const bins = new Array(20).fill(0), L = 6, B = 18, pw = w - 2 * L, ph = h - B - 6;
      s.blobs.forEach(b => bins[Math.min(19, Math.floor(b.o * 20))]++);
      const mx = Math.max(...bins);
      ctx.clearRect(0, 0, w, h);
      bins.forEach((n, i) => { ctx.fillStyle = mixColor('--blue', '--orange', (i + .5) / 20); const bh = n / mx * ph; ctx.fillRect(L + i * pw / 20 + 1, 6 + ph - bh, pw / 20 - 2, bh); });
      ctx.fillStyle = BS.col('--mute'); ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = 'left'; ctx.fillText('left', L, h - 4); ctx.textAlign = 'right'; ctx.fillText('right', w - L, h - 4);
    },
    // Choreography: talking pairs light up (0-.35), slide toward each other (.35-.9), settle.
    render(R, s, t, now) {
      const e = ease(BS.seg(t, .35, .9)), glow = 1 - BS.seg(t, .6, 1);
      s.talks.forEach(([a, b]) => R.line(ox(lerp(a.po, a.o, e)), a.lane, ox(lerp(b.po, b.o, e)), b.lane, '--magenta', glow, .02));
      s.blobs.forEach(b => {
        const o = lerp(b.po, b.o, e);
        R.blob(ox(o), b.lane, .02, mixColor('--blue', '--orange', o), { angry: b.stub, smile: !b.stub && Math.abs(b.o - b.po) > .001, blink: BS.blinking(b.id, now) });
      });
      R.label(X0, .97, '◀ left', '--blue', 1, .01);
      R.label(X1, .97, 'right ▶', '--orange', 1, .01);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
