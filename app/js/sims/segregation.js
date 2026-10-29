// Segregation (Schelling 1971): blobs on a grid move to a random empty cell when too few neighbours share their colour.
(function (G) {
  const BS = G.BS;
  const { shuffle, lerp, ease, pct, W } = BS;
  const C = 32, R_ = 24, CELL = Math.min((W - .06) / C, .94 / R_), OX = (W - C * CELL) / 2 + CELL / 2, OY = (1 - R_ * CELL) / 2 + CELL / 2;

  function likeShare(s, i) { // share of occupied neighbours with the same colour; -1 if no neighbours
    const x = i % C, y = (i / C) | 0, me = s.g[i];
    let same = 0, n = 0;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dy) continue;
      const xx = (x + dx + C) % C, yy = (y + dy + R_) % R_, o = s.g[xx + yy * C]; // wraps at the edges
      if (o) { n++; if (o === me) same++; }
    }
    return n ? same / n : -1;
  }
  function cacheLike(s) { for (let i = 0; i < C * R_; i++) s.like[i] = s.g[i] ? likeShare(s, i) : -1; } // once per day, read by render every frame
  function stats(s, p) {
    let sum = 0, cnt = 0, unhappy = 0;
    for (let i = 0; i < C * R_; i++) if (s.g[i]) {
      const l = likeShare(s, i);
      if (l < 0) continue;
      sum += l; cnt++; if (l < p.T / 100) unhappy++;
    }
    return { like: cnt ? sum / cnt : 0, unhappy: cnt ? unhappy / cnt : 0 };
  }

  BS.sims.push({
    id: 'segregation', name: 'Segregation', topic: 'Society & economy', accent: '--teal', dayLabel: 'day', maxDays: 400, biome: 'winter',
    question: 'How do mild preferences split a city?',
    hook: ["Nobody wants a split town.","Mild wishes split it anyway."],
    source: 'After Thomas Schelling (1971), “Dynamic models of segregation”',
    knobs: [
      { id: 'T', label: 'Wants at least this share alike', hint: 'Below this, a blob moves', min: 0, max: 80, step: 5, value: 30, fmt: v => v + '%' },
      { id: 'empty', label: 'Empty homes', min: 5, max: 30, step: 5, value: 10, reset: true, fmt: v => v + '%' }
    ],
    chapters: [
      { title: 'No preference', text: 'No blob cares about its neighbours, so no one moves. About half of each blob’s neighbours share its colour, as in any random mix.', set: { T: 0, empty: 10 } },
      { title: 'A mild wish', text: 'Each blob only wants 30 % of its neighbours to be like it, so it is happy as a minority. Watch the city split into clear areas anyway.', set: { T: 30, empty: 10 } },
      { title: 'A stronger wish', text: 'At 50 %, the split becomes almost complete. Most blobs end up with nearly all same-colour neighbours.', set: { T: 50, empty: 10 } },
      { title: 'Too picky', text: 'At 75 %, almost no home satisfies anyone. Blobs keep moving and the city never settles. The app stops the run when the pattern only repeats.', set: { T: 75, empty: 10 } }
    ],
    presets: [
      { label: 'Wants 60 % alike', set: { T: 60 }, note: 'The split is almost total: the average blob ends with more than 9 in 10 same-colour neighbours.' },
      { label: 'Crowded city', set: { T: 50, empty: 5 }, note: 'Only 5 % of homes are empty, so moves are slow. The city still splits almost as much as a city with space.' }
    ],
    legend: [{ label: 'blue group', color: '--blue' }, { label: 'orange group', color: '--orange' }, { label: 'frown = unhappy, will move', color: '--mute' }],
    series: [{ key: 'like', label: 'Same-colour neighbours', color: '--teal', area: true }, { key: 'unhappy', label: 'Unhappy blobs', color: '--red' }],
    ymax: 1, fmt: pct,
    theory() { return [{ value: .5, label: 'random mix 50%', color: '--mute' }]; },
    init(p, r) {
      const n = C * R_, g = new Uint8Array(n), id = new Int32Array(n).fill(-1), filled = Math.round(n * (1 - p.empty / 100));
      const cells = shuffle([...Array(n).keys()], r);
      for (let k = 0; k < filled; k++) { g[cells[k]] = k % 2 ? 2 : 1; id[cells[k]] = k; }
      const s = { day: 0, g, id, moves: [], like: new Float32Array(n) };
      cacheLike(s);
      return s;
    },
    step(s, p, r) {
      const n = C * R_, T = p.T / 100, movers = [], empty = [];
      for (let i = 0; i < n; i++) { if (!s.g[i]) empty.push(i); else { const l = likeShare(s, i); if (l >= 0 && l < T) movers.push(i); } }
      shuffle(movers, r);
      s.moves = [];
      for (const i of movers) {
        if (!empty.length) break;
        const k = (r() * empty.length) | 0, j = empty[k];
        empty[k] = i; // the old home becomes empty
        s.g[j] = s.g[i]; s.id[j] = s.id[i]; s.g[i] = 0; s.id[i] = -1;
        s.moves.push([i, j]);
      }
      cacheLike(s);
      s.day++;
    },
    metrics(s, p) { return stats(s, p); },
    kpis(s, p) {
      const m = stats(s, p);
      return [
        { label: 'Same-colour neighbours', value: pct(m.like), tone: '--teal-text', note: 'average per blob' },
        { label: 'Unhappy now', value: pct(m.unhappy) },
        { label: 'Each blob wants', value: '≥ ' + p.T + '%' },
        { label: 'Moves today', value: s.moves.length }
      ];
    },
    insight(s, p) {
      const m = stats(s, p);
      if (p.T === 0) return 'No one wants to move, so the mix stays random: ' + pct(m.like) + ' same-colour neighbours.';
      if (s.day < 5) return 'Unhappy blobs (with a frown) move first. Watch clusters form.';
      if (m.unhappy > .2) return pct(m.unhappy) + ' of blobs are still unhappy. With a wish this strong, few homes satisfy anyone, so moving never stops.';
      if (m.unhappy === 0) return 'Everyone is happy. Each blob wanted only ' + p.T + ' % alike, yet the average blob now has ' + pct(m.like) + ' same-colour neighbours.';
      return 'The average blob now has ' + pct(m.like) + ' same-colour neighbours, far above its wish of ' + p.T + ' %.';
    },
    // Choreography per day: unhappy blobs frown and bounce (0-.3), hop to their new home (.3-.85), land and smile (.85-1).
    render(R, s, t, now, p) {
      const T = p.T / 100, from = new Map(), hop = BS.seg(t, .3, .85), e = ease(hop);
      s.moves.forEach(([a, b]) => from.set(b, a));
      for (let i = 0; i < C * R_; i++) {
        if (!s.g[i]) continue;
        const moved = from.has(i), a = moved ? from.get(i) : i;
        const x0 = OX + (a % C) * CELL, y0 = OY + ((a / C) | 0) * CELL, x1 = OX + (i % C) * CELL, y1 = OY + ((i / C) | 0) * CELL;
        const l = s.like[i], sad = T > 0 && l >= 0 && l < T;
        const lift = moved ? Math.sin(Math.PI * e) * CELL * 2.5 : 0, wait = moved && t < .3 ? Math.abs(Math.sin(t * 40)) * CELL * .25 : 0;
        R.blob(lerp(x0, x1, e), lerp(y0, y1, e), CELL * .42, s.g[i] === 1 ? '--blue' : '--orange', { lift: lift + wait, frown: moved ? t < .85 : sad, smile: !sad && !(moved && t < .85), blink: BS.blinking(s.id[i], now) });
      }
      if (s.moves.length && t < .3) R.label(BS.W / 2, .02, s.moves.length + ' unhappy blobs move', '--red', 1 - BS.seg(t, .2, .3), .08);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
