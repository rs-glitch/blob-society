// Natural Selection (after Primer): blobs search a field for food. Traits speed, size and sense are inherited with small mutations.
// 0 food = death, 1 food = survive, 2 food = survive and one child. A blob 1.2x bigger than another can eat it.
(function (G) {
  const BS = G.BS;
  const { lerp, ease, W, clamp } = BS;
  const K = 48, CAP = 400, TMIN = .2, TMAX = 2.5, SLOTS = 40, N0 = 30;
  const SP = .016, SENSE_R = .035, ENERGY = K * 3, SIZE_R = .016, EAT_R = .012; // field units per tick, sense radius, energy per day, blob radius, reach
  const CX = W / 2, CY = .5, RX = .62, RY = .44, GC = .1;
  const slotPos = i => ({ x: CX + Math.cos(i / SLOTS * 6.2832) * RX, y: CY + Math.sin(i / SLOTS * 6.2832) * RY });
  const radius = b => SIZE_R * b.size;
  const tickCost = (b, p) => p.cost * (b.size ** 3 * b.speed ** 2 + 1.5 * b.sense);
  const mean = (a, k) => a.length ? a.reduce((x, b) => x + b[k], 0) / a.length : 0;
  let nextId = 0;
  const mk = (slot, r, sp = 1, sz = 1, se = 1) => { const h = slotPos(slot); return { id: nextId++, slot, hx: h.x + (r() - .5) * .03, hy: h.y + (r() - .5) * .03, speed: sp, size: sz, sense: se }; };
  function mixColor(a, b, u) { // blend two colour tokens, returns #rrggbb
    const ca = BS.col(a), cb = BS.col(b), h = (c, i) => parseInt(c.slice(i, i + 2), 16);
    return '#' + [1, 3, 5].map(i => Math.round(lerp(h(ca, i), h(cb, i), u)).toString(16).padStart(2, '0')).join('');
  }
  const speedCol = b => mixColor('--blue', '--orange', clamp((b.speed - .3) / 1.7, 0, 1));

  // One day: every blob walks out, searches (turns to food or smaller blobs it senses), eats, and walks home. Records paths for render.
  function runDay(s, p, r) {
    const B = s.blobs, F = p.food, foods = [], fgrid = new Map(), cell = (x, y) => ((y / GC) | 0) * 20 + ((x / GC) | 0);
    for (let i = 0; i < F; i++) {
      const a = r() * 6.2832, f = .45 + .52 * Math.sqrt(r()), x = CX + Math.cos(a) * RX * f, y = CY + Math.sin(a) * RY * f, c = cell(x, y);
      foods.push({ x, y, tick: -1, by: -1 });
      if (!fgrid.has(c)) fgrid.set(c, []);
      fgrid.get(c).push(i);
    }
    const act = B.map(b => ({ b, x: b.hx, y: b.hy, ang: Math.atan2(CY - b.hy, CX - b.hx) + (r() - .5), food: 0, prey: 0, dead: -1, state: 0, en: ENERGY, path: new Float32Array((K + 1) * 2), eats: [] }));
    act.forEach(a => { a.path[0] = a.x; a.path[1] = a.y; });
    let smin = Infinity, smax = 0;
    B.forEach(b => { smin = Math.min(smin, b.size); smax = Math.max(smax, b.size); });
    const hunt = smax >= 1.2 * smin, order = act.map((_, i) => i);
    for (let k = 1; k <= K; k++) {
      BS.shuffle(order, r);
      const bgrid = new Map();
      if (hunt) act.forEach((a, i) => { if (a.state !== 2 && a.dead < 0) { const c = cell(a.x, a.y); if (!bgrid.has(c)) bgrid.set(c, []); bgrid.get(c).push(i); } });
      for (const i of order) {
        const a = act[i], b = a.b;
        if (a.dead < 0 && a.state !== 2) {
          const step = SP * b.speed, dh = Math.hypot(a.x - b.hx, a.y - b.hy), c = tickCost(b, p);
          if (a.state === 0 && (a.food >= 2 || K - k + 1 <= dh / step + 2 || a.en < (dh / step + 2) * c)) a.state = 1;
          if (a.state === 1) {
            if (dh <= step) { a.x = b.hx; a.y = b.hy; a.state = 2; } else { a.x += (b.hx - a.x) / dh * step; a.y += (b.hy - a.y) / dh * step; }
          } else {
            a.en -= c;
            const sr = SENSE_R * b.sense, rr = radius(b), cx = (a.x / GC) | 0, cy = (a.y / GC) | 0, n = Math.ceil(sr / GC);
            let best = null, bd = sr * sr;
            for (let gy = Math.max(0, cy - n); gy <= cy + n; gy++) for (let gx = Math.max(0, cx - n); gx <= cx + n; gx++) {
              const cc = gy * 20 + gx, fl = fgrid.get(cc), bl = hunt ? bgrid.get(cc) : null;
              if (fl) for (const q of fl) { const f = foods[q]; if (f.tick >= 0) continue; const d = (f.x - a.x) ** 2 + (f.y - a.y) ** 2; if (d < bd) { bd = d; best = { f, q }; } }
              if (bl) for (const q of bl) { const o = act[q]; if (q === i || o.dead >= 0 || o.state === 2 || o.b.size * 1.2 > b.size) continue; const d = (o.x - a.x) ** 2 + (o.y - a.y) ** 2; if (d < bd) { bd = d; best = { o }; } }
            }
            if (best) a.ang = Math.atan2((best.f || best.o).y - a.y, (best.f || best.o).x - a.x);
            else {
              a.ang += (r() - .5) * 1.2;
              const nx = (a.x - CX) / RX, ny = (a.y - CY) / RY;
              if (nx * nx + ny * ny > .92) a.ang = Math.atan2(CY - a.y, CX - a.x) + (r() - .5) * .6; // turn back at the edge of the field
            }
            const d = best ? Math.sqrt(bd) : Infinity, mv = Math.min(step, Math.max(0, d - rr * .5));
            a.x += Math.cos(a.ang) * (best ? mv : step); a.y += Math.sin(a.ang) * (best ? mv : step);
            if (best && d <= Math.max(step, rr + EAT_R)) {
              if (best.f) { best.f.tick = k; best.f.by = i; a.food++; a.eats.push(k, 0); }
              else { best.o.dead = k; a.food++; a.prey++; a.eats.push(k, 1); }
            }
          }
        }
        if (a.dead < 0) { a.path[k * 2] = a.x; a.path[k * 2 + 1] = a.y; } else { a.path[k * 2] = a.path[(k - 1) * 2]; a.path[k * 2 + 1] = a.path[(k - 1) * 2 + 1]; }
      }
    }
    return { act, foods };
  }

  BS.sims.push({
    id: 'natsel', name: 'Natural Selection', topic: 'Evolution', accent: '--green', dayLabel: 'day', biome: 'meadow', maxDays: 600,
    question: 'How does food shape the blobs that survive?',
    hook: ["Fast, big or sharp-eyed?","Food decides who has children."],
    source: 'After Primer, “Simulating Natural Selection”; Darwin (1859)',
    knobs: [
      { id: 'food', label: 'Food per day', hint: 'New food drops at random every morning', min: 20, max: 240, step: 10, value: 100, fmt: v => v },
      { id: 'mut', label: 'Mutation size', hint: 'How much a child trait can differ from its parent', min: 0, max: 30, step: 5, value: 10, fmt: v => v ? '±' + v + '%' : 'none' },
      { id: 'cost', label: 'Trait cost', hint: 'Energy used for speed, size and sense; 0 = free', min: 0, max: 3, step: .5, value: 1, fmt: v => v ? v.toFixed(1) + '×' : 'free' },
      { id: 'traits', label: 'Traits that evolve', type: 'select', reset: true, value: 'speed', options: [['speed', 'Speed only'], ['size', 'Size only'], ['sense', 'Sense only'], ['all', 'All three']] }
    ],
    chapters: [
      { title: 'Speed pays, to a point', text: 'Only speed can change. Fast blobs reach food first, so the mean speed rises. A fast blob also burns energy, and it tires early. Speed stops rising at a limit.', set: { traits: 'speed', food: 100, mut: 10, cost: 2 } },
      { title: 'Free speed has no limit', text: 'Now speed costs nothing. Nothing slows the race, so the mean speed climbs far higher than in chapter 1.', set: { traits: 'speed', food: 100, mut: 10, cost: 0 } },
      { title: 'Big blobs eat small blobs', text: 'Only size can change. A blob 1.2 times bigger than another can eat it. Big blobs gain food from small blobs, so the mean size rises. Size costs energy, so it stops at a limit.', set: { traits: 'size', food: 100, mut: 10, cost: 1 } },
      { title: 'Seeing farther helps', text: 'Only sense can change. A blob with more sense sees food from farther away and walks to it. Mean sense rises. Sense costs energy, so if you raise the trait cost to 3.0, sense rises much less.', set: { traits: 'sense', food: 100, mut: 10, cost: 1 } }
    ],
    presets: [
      { label: 'No mutation', set: { mut: 0, traits: 'all' }, note: 'Children copy their parents exactly. No new trait appears, so the mean traits stay at 1.00.' },
      { label: 'Food flood', set: { food: 240, traits: 'all' }, note: 'Food is easy to find. The population grows to about the number of food items, and most blobs eat.' },
      { label: 'Almost no food', set: { food: 20, traits: 'speed' }, note: 'Food is very scarce. Only a handful of blobs survive. The line often dies out, and plain newcomers arrive to start again.' }
    ],
    legend: [{ label: 'slow blob', color: '--blue' }, { label: 'fast blob', color: '--orange' }, { label: 'bigger blob = bigger body', color: '--mute' }, { label: 'ring = sense range', color: '--green' }],
    series: [{ key: 'speed', label: 'Mean speed (of max)', color: '--orange' }, { key: 'size', label: 'Mean size (of max)', color: '--violet' }, { key: 'sense', label: 'Mean sense (of max)', color: '--teal' }, { key: 'pop', label: 'Population (of 400)', color: '--green', area: true }],
    ymax: 1, fmt: v => Math.round(v * 100) + '%',
    theory() { return []; },
    init(p, r) {
      nextId = 0;
      const blobs = [];
      for (let i = 0; i < N0; i++) blobs.push(mk(Math.floor(i / N0 * SLOTS), r));
      return { day: 0, blobs, act: [], foods: [], kids: [], fed: 0, died: 0 };
    },
    step(s, p, r) {
      const { act, foods } = runDay(s, p, r), m = p.mut / 100, ev = p.traits, grow = t => ev === 'all' || ev === t;
      const next = [], kids = [];
      let died = 0, fed = 0;
      act.forEach(a => {
        fed += a.food;
        if (a.dead >= 0 || a.food === 0) { died++; a.fate = 'die'; return; }
        next.push(a.b);
        if (a.food >= 2) {
          const b = a.b, c = mk((b.slot + SLOTS + ((r() * 3) | 0) - 1) % SLOTS, r, b.speed, b.size, b.sense);
          const mut = v => clamp(v * (1 + m * (r() * 2 - 1)), TMIN, TMAX);
          if (grow('speed')) c.speed = mut(b.speed);
          if (grow('size')) c.size = mut(b.size);
          if (grow('sense')) c.sense = mut(b.sense);
          c.hx = b.hx + (r() - .5) * .03; c.hy = b.hy + (r() - .5) * .03; c.parent = b;
          kids.push(c); a.fate = 'child';
        } else a.fate = 'live';
      });
      BS.shuffle(kids, r);
      const room = Math.max(0, CAP - next.length), born = kids.slice(0, room);
      born.forEach(c => next.push(c));
      s.act = act; s.foods = foods; s.kids = born; s.blobs = next; s.fed = fed; s.died = died;
      if (!next.length) { for (let i = 0; i < 6; i++) next.push(mk(((r() * SLOTS) | 0), r)); s.arrivals = (s.arrivals || 0) + 1; s.arrivedDay = s.day + 1; } // the line died out: 6 plain newcomers arrive (shown on the world and in the insight)
      s.day++;
    },
    metrics(s) {
      const B = s.blobs;
      return { speed: mean(B, 'speed') / TMAX, size: mean(B, 'size') / TMAX, sense: mean(B, 'sense') / TMAX, pop: B.length / CAP };
    },
    kpis(s, p) {
      const B = s.blobs;
      return [
        { label: 'Blobs alive', value: B.length, tone: '--green-text', note: 'cap ' + CAP },
        { label: 'Mean speed', value: mean(B, 'speed').toFixed(2), tone: '--orange-text', note: 'start 1.00' },
        { label: 'Mean size', value: mean(B, 'size').toFixed(2), tone: '--violet-text', note: 'start 1.00' },
        { label: 'Mean sense', value: mean(B, 'sense').toFixed(2), tone: '--teal-text', note: 'start 1.00' }
      ];
    },
    insight(s, p) {
      const m = this.metrics(s), n = s.blobs.length;
      if (s.arrivals && s.day - s.arrivedDay < 10) return 'The whole line died out' + (s.arrivals > 1 ? ' (' + s.arrivals + ' times so far)' : '') + '. Six plain newcomers arrived from outside to start again.';
      if (s.day < 6) return 'Each morning blobs search for food. 0 food: the blob dies. 1 food: it lives. 2 food: it has one child.';
      if (n >= CAP) return 'The field holds the most blobs it can. Children beyond the cap are not born.';
      if (p.mut === 0) return 'No mutation, so every child equals its parent. The traits cannot change.';
      if (p.traits === 'speed') return p.cost === 0 ? 'Speed is free. Fast blobs win every race, so the mean speed is ' + (m.speed * TMAX).toFixed(2) + '.' : 'Fast blobs win races but tire early. The mean speed is ' + (m.speed * TMAX).toFixed(2) + '.';
      if (p.traits === 'size') return 'Bigger blobs eat smaller ones. Mean size is ' + (m.size * TMAX).toFixed(2) + '.';
      if (p.traits === 'sense') return 'Blobs that sense farther find food sooner. Mean sense is ' + (m.sense * TMAX).toFixed(2) + '.';
      return 'Speed, size and sense all change. Each one has a gain and an energy cost.';
    },
    extraTitle: 'Traits now',
    extraDraw(ctx, w, h, s) {
      const rows = [['speed', '--orange'], ['size', '--violet'], ['sense', '--teal']], NB = 16, L = 6, lh = h / 3, ph = lh - 18;
      ctx.clearRect(0, 0, w, h);
      ctx.font = '11px "JetBrains Mono", ui-monospace, monospace';
      rows.forEach(([k, col], ri) => {
        const bins = new Array(NB).fill(0), y0 = ri * lh;
        s.blobs.forEach(b => bins[Math.min(NB - 1, Math.floor((b[k] - TMIN) / (TMAX - TMIN) * NB))]++);
        const mx = Math.max(1, ...bins);
        ctx.fillStyle = BS.col(col);
        bins.forEach((n, i) => { const bh = n / mx * ph; ctx.fillRect(L + i * (w - 2 * L) / NB + 1, y0 + 4 + ph - bh, (w - 2 * L) / NB - 2, bh); });
        ctx.fillStyle = BS.col('--mute'); ctx.textAlign = 'left'; ctx.fillText(k + ' ' + TMIN, L, y0 + lh - 3); ctx.textAlign = 'right'; ctx.fillText(TMAX, w - L, y0 + lh - 3);
      });
    },
    // Choreography per day: food drops (0-.08), blobs walk out, search and eat (.08-.82), then night: 0 food fades, children pop out (.86-1).
    render(R, s, t, now, p) {
      if (s.arrivals && s.day === s.arrivedDay) R.label(BS.W / 2, .5, 'line died out: 6 newcomers arrive', '--red-text', 1 - BS.seg(t, .7, 1), .06);
      const walk = BS.seg(t, .08, .82), night = BS.seg(t, .86, 1), k = walk * K, k0 = Math.min(K - 1, Math.floor(k)), f = k - k0;
      const idle = !s.act.length, few = s.act.length <= 70, slots = new Set();
      s.blobs.forEach(b => slots.add(b.slot));
      s.act.forEach(a => slots.add(a.b.slot));
      if (idle) s.blobs.forEach(b => R.blob(b.hx, b.hy, radius(b), speedCol(b), { smile: true, blink: BS.blinking(b.id, now) }));
      slots.forEach(i => { const h = slotPos(i); R.prop('home', h.x, h.y, .016, '--gold'); });
      s.foods.forEach((fd, i) => {
        const drop = ease(BS.seg(t, 0, .08 + (i % 8) * .005));
        if (fd.tick >= 0 && k >= fd.tick) return;
        const left = fd.tick < 0 ? 1 - BS.seg(t, .84, .92) : 1;
        if (drop > 0 && left > 0) R.prop('food', fd.x, fd.y, .007 * left, '--red', { lift: (1 - drop) * .12 });
      });
      let labels = 0;
      s.act.forEach(a => {
        const b = a.b, pa = a.path, x = lerp(pa[k0 * 2], pa[Math.min(K, k0 + 1) * 2], f), y = lerp(pa[k0 * 2 + 1], pa[Math.min(K, k0 + 1) * 2 + 1], f);
        const col = speedCol(b), r0 = radius(b), eaten = a.dead >= 0, goneAt = eaten ? a.dead : 1e9;
        let sc = 1, face = {};
        if (eaten && k >= goneAt) sc = Math.max(0, 1 - (k - goneAt) / 3);
        if (a.fate === 'die' && !eaten) { sc = 1 - ease(night); face = { frown: night > 0 }; }
        else if (!eaten) face = { smile: a.food > 0 && k > (a.eats[0] || K) };
        if (eaten) face = { frown: true };
        if (a.prey && k > a.eats[a.eats.length - 2]) face = { angry: true };
        const hop = k > 0 && k < K && a.state !== 2 && Math.abs(Math.sin(now / 90 + b.id)) * .004 * (walk > 0 && walk < 1 ? 1 : 0);
        if (sc <= 0) return;
        const out = walk > 0 && walk < 1;
        if (few && out && k < K && Math.hypot(x - b.hx, y - b.hy) > .02 && k < (eaten ? goneAt : K)) R.ring(x, y, SENSE_R * b.sense, '--green');
        R.blob(x, y, r0 * sc, col, { ...face, lift: hop || 0, squash: eaten && k >= goneAt ? .5 : 1, blink: BS.blinking(b.id, now) });
        for (let q = 0; q < a.eats.length && labels < 14; q += 2) {
          const dt = k - a.eats[q];
          if (dt >= 0 && dt < 5 && walk < 1) { labels++; R.label(x, y, a.eats[q + 1] ? 'ate a blob' : '+1', a.eats[q + 1] ? '--red-text' : '--green-text', 1 - dt / 5, .05 + dt * .006); }
        }
      });
      s.kids.forEach(c => {
        if (night <= 0) return;
        const u = ease(night), pt = c.parent || c;
        R.blob(lerp(pt.hx, c.hx, u), lerp(pt.hy, c.hy, u), radius(c) * u * (1 + .25 * Math.sin(Math.PI * night)), speedCol(c), { smile: true, lift: Math.sin(Math.PI * night) * .02 });
        if (few && night < .6) R.label(c.hx, c.hy, 'child', '--green-text', 1 - night / .6, .05);
      });
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
