// Market Day: buyers have a top price (value), sellers have a bottom price (cost). Pairs meet at stalls each day and haggle.
// Deal if offer >= ask, at the midpoint. After a deal the seller asks more and the buyer offers less; after no deal, the reverse.
(function (G) {
  const BS = G.BS;
  const { lerp, ease, clamp, W } = BS;
  const PMAX = 12, LO = 2, HI = 10, STEP = .4;
  const pace = BS.pace || (BS.pace = (s, t, now) => { if (s._pn != null && now > s._pn && t >= s._pt) s._pr = (t - s._pt) / (now - s._pn) * 1000; s._pt = t; s._pn = now; return s._pr || 0; });
  const usd = v => '$' + v.toFixed(1);

  // Competitive equilibrium of the drawn values and costs. A tax raises every cost by the tax.
  function equil(s, tax) {
    const V = s.buyers.map(b => b.v).sort((a, b) => b - a), C = s.sellers.map(q => q.c + tax).sort((a, b) => a - b);
    let q = 0; while (q < V.length && q < C.length && V[q] >= C[q]) q++;
    const lo = Math.max(q ? C[q - 1] : 0, q < V.length ? V[q] : 0), hi = Math.min(q ? V[q - 1] : PMAX, q < C.length ? C[q] : PMAX);
    return { q, p: q ? (lo + Math.min(hi, PMAX)) / 2 : NaN };
  }
  const gains = s => { // most gain per day when every efficient pair trades
    const V = s.buyers.map(b => b.v).sort((a, b) => b - a), C = s.sellers.map(q => q.c).sort((a, b) => a - b);
    let g = 0; for (let i = 0; i < Math.min(V.length, C.length) && V[i] >= C[i]; i++) g += V[i] - C[i];
    return g;
  };
  const buyerPos = (i, n) => ({ x: .1 + (W - .2) * (n < 2 ? .5 : i / (n - 1)), y: n > 12 ? (i % 2 ? .93 : .83) : .86 });
  const stallPos = (i, n) => ({ x: .12 + (W - .24) * (n < 2 ? .5 : i / (n - 1)), y: n > 12 ? (i % 2 ? .46 : .34) : .4 });

  BS.sims.push({
    id: 'market', name: 'Market Day', topic: 'Society & economy', accent: '--gold', dayLabel: 'day', biome: 'village', maxDays: 300,
    question: 'Who sets the price when nobody is in charge?',
    hook: ["No boss sets the price.","Haggling finds it anyway."],
    source: 'After Primer, "Simulating Supply and Demand"; haggling model after Gode & Sunder (1993)',
    knobs: [
      { id: 'nB', label: 'Buyers', hint: 'Each buyer has a top price', min: 4, max: 24, step: 1, value: 12, reset: true, fmt: v => v },
      { id: 'nS', label: 'Sellers', hint: 'Each seller has a bottom price', min: 1, max: 24, step: 1, value: 12, reset: true, fmt: v => v },
      { id: 'tax', label: 'Sales tax', hint: 'Paid by the seller on each sale', min: 0, max: 6, step: .5, value: 0, fmt: v => v ? '$' + v.toFixed(1) : 'none' },
      { id: 'cap', label: 'Price cap', hint: 'No deal above this price; 0 = no cap', min: 0, max: 10, step: .5, value: 0, fmt: v => v ? '$' + v.toFixed(1) : 'none' }
    ],
    chapters: [
      { title: 'Prices find themselves', text: 'Twelve buyers and twelve sellers start with random prices. Nobody sets the price. After about 40 days the mean deal price stays within $0.5 of the balance price, where supply meets demand.', set: { nB: 12, nS: 12, tax: 0, cap: 0 } },
      { title: 'More buyers than sellers', text: 'Twenty-four buyers chase six sellers. Sellers see that buyers pay more, so they ask more. The price settles well above $6, the middle of the price range.', set: { nB: 24, nS: 6, tax: 0, cap: 0 } },
      { title: 'A sales tax', text: 'The seller pays a tax on each sale. Buyers pay more, sellers keep less, and fewer trades happen. Deals that helped both sides no longer happen. This lost gain is the deadweight loss.', set: { nB: 12, nS: 12, tax: 2, cap: 0 } },
      { title: 'A price cap', text: 'A cap sits far below the balance price. Deals happen only at the cap or below. Fewer sellers can sell at that price, so more buyers want to buy than sellers want to sell. This is a shortage.', set: { nB: 12, nS: 12, tax: 0, cap: 4 } }
    ],
    presets: [
      { label: 'Huge tax', set: { nB: 12, nS: 12, tax: 6, cap: 0 }, note: 'The tax is huge. Most deals stop, and fewer than one in five possible trades happen.' },
      { label: 'Tiny cap', set: { nB: 12, nS: 12, tax: 0, cap: 2.5 }, note: 'The cap is near the lowest cost. Almost no seller can sell, and fewer than one in four possible trades happen.' },
      { label: 'Three stalls', set: { nB: 24, nS: 3, tax: 0, cap: 0 }, note: 'Three stalls serve 24 buyers. Fewer than one deal happens each day, and the price stays above $6.' }
    ],
    legend: [{ label: 'buyer', color: '--blue' }, { label: 'seller', color: '--orange' }, { label: 'deal', color: '--gold' }],
    series: [{ key: 'price', label: 'Mean deal price (of $12)', color: '--gold' }, { key: 'trades', label: 'Trades (of possible)', color: '--blue' }],
    ymax: 1, fmt: v => Math.round(v * 100) + '%',
    theory(p, s) { const e = equil(s, p.tax); return isNaN(e.p) ? [] : [{ value: e.p / PMAX, label: 'balance price ' + usd(e.p), color: '--gold-text' }]; },
    init(p, r) {
      const buyers = [], sellers = [];
      for (let i = 0; i < p.nB; i++) { const v = LO + r() * (HI - LO); buyers.push({ id: i, v, o: 1 + r() * (v - 1), po: 0, ...buyerPos(i, p.nB) }); }
      for (let i = 0; i < p.nS; i++) { const c = LO + r() * (HI - LO); sellers.push({ id: i, c, a: c + r() * (PMAX - c), pa: 0, ...stallPos(i, p.nS) }); }
      const s = { day: 0, buyers, sellers, pairs: [], price: .5, trades: 0, gain: 0, gmax: 0, q0: 0, today: 0, sum: 0 };
      s.buyers.forEach(b => b.po = b.o); s.sellers.forEach(q => q.pa = q.a);
      s.gmax = gains(s); s.q0 = equil(s, 0).q;
      return s;
    },
    step(s, p, r) {
      const cap = p.cap || Infinity, bi = BS.shuffle(s.buyers.map((_, i) => i), r), si = BS.shuffle(s.sellers.map((_, i) => i), r);
      s.buyers.forEach(b => b.po = Math.min(b.o, cap)); s.sellers.forEach(q => { q.a = Math.max(q.a, q.c + p.tax); q.pa = q.a; });
      s.pairs = []; s.today = 0; s.sum = 0; s.gain = 0;
      for (let k = 0; k < Math.min(bi.length, si.length); k++) {
        const b = s.buyers[bi[k]], q = s.sellers[si[k]], ob = Math.min(b.o, cap), deal = ob >= q.a, price = (ob + q.a) / 2;
        if (deal) { s.today++; s.sum += price; s.gain += b.v - q.c; q.a = Math.min(PMAX, q.a + STEP); b.o = Math.max(0, b.o - STEP); }
        else { q.a = Math.max(q.c + p.tax, q.a - STEP); b.o = Math.min(b.v, b.o + STEP); }
        s.pairs.push({ b, q, ob, oa: q.pa, deal, price, ob2: Math.min(b.o, cap), oa2: q.a });
      }
      for (let k = Math.min(bi.length, si.length); k < bi.length; k++) { const b = s.buyers[bi[k]]; b.o = Math.min(b.v, b.o + STEP); } // buyers who found no seller offer more
      for (let k = Math.min(bi.length, si.length); k < si.length; k++) { const q = s.sellers[si[k]]; q.a = Math.max(q.c + p.tax, q.a - STEP); } // sellers who found no buyer ask less
      s.trades = s.day ? s.trades * .6 + s.today * .4 : s.today; // smoothed over about 3 days
      if (s.today) s.price = s.day ? s.price * .6 + s.sum / s.today / PMAX * .4 : s.sum / s.today / PMAX;
      s.day++;
    },
    metrics(s) { return { price: s.price, trades: s.q0 ? Math.min(1, s.trades / s.q0) : 0 }; },
    kpis(s, p) {
      const e = equil(s, p.tax), mean = s.today ? s.sum / s.today : NaN;
      return [
        { label: 'Price today', value: s.today ? usd(mean) : 'no deals', tone: '--gold-text', note: 'mean of today\'s deals' },
        { label: 'Balance price', value: isNaN(e.p) ? 'none' : usd(e.p), note: 'where supply meets demand' },
        { label: 'Deals today', value: s.today + ' of ' + e.q, note: 'with the tax, the most possible' },
        { label: 'Gain from trade', value: Math.round(s.gain / (s.gmax || 1) * 100) + '%', note: 'of the most possible' }
      ];
    },
    insight(s, p) {
      const e = equil(s, p.tax), m = s.today ? s.sum / s.today : NaN;
      if (s.day < 8) return 'Each side starts with a random price. A deal makes the seller greedier and the buyer thriftier. A failed deal does the reverse.';
      if (p.cap && e.p > p.cap) return 'The cap is below the balance price. Sellers with a higher cost stay out, so there are only ' + s.today + ' deals today. Buyers wait in line with nothing to buy.';
      if (p.tax > 0) return 'Buyers pay about ' + usd(m || e.p) + ' and sellers keep ' + usd(Math.max(0, (m || e.p) - p.tax)) + '. Pairs with a small gain no longer trade. That loss is the deadweight loss.';
      return 'The mean price is ' + (isNaN(m) ? 'unknown today' : usd(m)) + ' and the balance price is ' + usd(e.p) + '. Nobody planned this. Each pair only haggled.';
    },
    extraTitle: 'Supply and demand',
    extraDraw(ctx, w, h, s) {
      const L = 30, B = 20, T = 8, R = 8, pw = w - L - R, ph = h - T - B, n = Math.max(s.buyers.length, s.sellers.length);
      const P = this.curP || { tax: 0 }, X = i => L + i / n * pw, Y = v => T + ph - v / PMAX * ph;
      const V = s.buyers.map(b => b.v).sort((a, b) => b - a), C = s.sellers.map(q => q.c + P.tax).sort((a, b) => a - b), e = equil(s, P.tax);
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = BS.col('--grid'); ctx.lineWidth = 1; ctx.strokeRect(L, T, pw, ph);
      const stepLine = (A, col) => { ctx.beginPath(); A.forEach((v, i) => { i ? ctx.lineTo(X(i), Y(A[i - 1])) : ctx.moveTo(X(0), Y(v)); ctx.lineTo(X(i), Y(v)); ctx.lineTo(X(i + 1), Y(v)); }); ctx.strokeStyle = BS.col(col); ctx.lineWidth = 2.5; ctx.stroke(); };
      stepLine(V, '--blue'); stepLine(C, '--orange');
      if (P.cap) { ctx.setLineDash([3, 4]); ctx.strokeStyle = BS.col('--red'); ctx.beginPath(); ctx.moveTo(L, Y(P.cap)); ctx.lineTo(L + pw, Y(P.cap)); ctx.stroke(); ctx.setLineDash([]); }
      if (!isNaN(e.p)) { ctx.fillStyle = BS.col('--ink'); ctx.beginPath(); ctx.arc(X(e.q), Y(e.p), 5, 0, 6.2832); ctx.fill(); }
      if (s.today) { const y = Y(s.sum / s.today); ctx.setLineDash([6, 4]); ctx.strokeStyle = BS.col('--gold'); ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke(); ctx.setLineDash([]); }
      ctx.fillStyle = BS.col('--mute'); ctx.font = '11px "JetBrains Mono", ui-monospace, monospace'; ctx.textAlign = 'right';
      [0, 6, 12].forEach(v => ctx.fillText('$' + v, L - 4, Y(v) + 4));
      ctx.textAlign = 'left'; ctx.fillText('blue: demand  orange: supply  gold: today\'s price', L, h - 6);
    },
    // Choreography per day: buyers walk to stalls (0-.28), both sides say their price (.28-.62), the result shows (.62-.82):
    // a coin flies to the seller on a deal, a frown shows on no deal. Buyers walk home (.82-1).
    render(R, s, t, now, p) {
      this.curP = p;
      const slow = pace(s, t, now) < 3.5, e = equil(s, p.tax), mean = s.price * PMAX;
      const walk = BS.seg(t, 0, .28), back = BS.seg(t, .82, 1), talk = BS.seg(t, .28, .62), res = BS.seg(t, .62, .82);
      const open = {}; s.pairs.forEach(pr => open[pr.b.id] = pr);
      s.sellers.forEach(q => {
        const pr = s.pairs.find(x => x.q === q), won = pr && pr.deal && res > 0 && res < 1;
        R.prop('home', q.x, q.y, .032, '--gold');
        R.blob(q.x, q.y - .05, .016, '--orange', { smile: !pr || pr.deal, frown: pr && !pr.deal && res > 0 && t < .95, lift: .05 + (won ? Math.sin(res * 3.14) * .02 : 0), blink: BS.blinking(q.id + 40, now) });
        if (slow && pr && talk > 0 && talk < 1 && t < .82) R.label(q.x, q.y - .05, usd(pr.oa), '--orange-text', 1, .07 + (q.id % 2) * .035);
      });
      s.buyers.forEach(b => {
        const pr = open[b.id];
        if (!pr) { R.blob(b.x, b.y, .016, '--blue', { blink: BS.blinking(b.id, now) }); return; }
        const mx = pr.q.x, my = pr.q.y + .06, u = ease(Math.max(walk, 0)) * (1 - ease(back));
        const x = lerp(b.x, mx, u), y = lerp(b.y, my, u), hop = Math.abs(Math.sin(walk * 25 * (walk < 1 || back > 0 ? 1 : 0))) * .008 * (u > 0 && u < 1 ? 1 : 0);
        const fail = !pr.deal && res > 0 && back < .6;
        R.blob(x, y, .016, '--blue', { lift: hop + (pr.deal && res > 0 && res < 1 ? Math.sin(res * 3.14) * .02 : 0), smile: pr.deal && res > 0 && t < .95, frown: fail, blink: BS.blinking(b.id, now) });
        if (slow && talk > 0 && t < .62) R.label(x, y, usd(pr.ob) + '?', '--blue-text', 1, .05 + (b.id % 2) * .035);
        if (slow && res > 0 && back < .3) R.label((x + pr.q.x) / 2, (y + pr.q.y) / 2, pr.deal ? usd(pr.price) : 'no deal', pr.deal ? '--gold-text' : '--red-text', 1, .09 + (b.id % 2) * .035);
        if (pr.deal && res > 0 && res < 1) R.prop('coin', lerp(x, pr.q.x, ease(res)), lerp(y, pr.q.y - .02, ease(res)), .008, '--gold', { lift: .03 + Math.sin(res * 3.14) * .06, rot: now / 120 });
      });
      R.label(W / 2, .2, 'Price board  mean ' + usd(mean) + (isNaN(e.p) ? '' : '  balance ' + usd(e.p)), '--gold-text', 1, .12);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
