// Hawks & Doves. Each tree holds 2 food. Food f in [0, 2]: survive with chance min(f, 1), copy with chance f − 1.
// So expected offspring = f, and the game stays linear. ESS hawk share = (1 − keep) / cost.
(function (G) {
  const BS = G.BS;
  const { shuffle, clamp, lerp, ease, pct, seg, W } = BS;
  const theoryShare = p => Math.min(1, (1 - p.keep) / p.cost);
  const home = t => ({ x: W / 2 + Math.cos(t * 6.2832) * .6, y: .5 + Math.sin(t * 6.2832) * .44 });
  const hp = b => { const j = 1 + ((b.id * .618) % 1 - .5) * .12, h = home(b.hf); return { x: W / 2 + (h.x - W / 2) * j, y: .5 + (h.y - .5) * j }; }; // fixed home spot on the rim
  const back = u => 1 + 2.7 * Math.pow(u - 1, 3) + 1.7 * Math.pow(u - 1, 2); // ease-out-back: a small overshoot for pops
  // Days per second the view advances. Labels are only shown when this is low enough to read them.
  const pace = BS.pace || (BS.pace = (s, t, now) => { if (s._pn != null && now > s._pn && t >= s._pt) s._pr = (t - s._pt) / (now - s._pn) * 1000; s._pt = t; s._pn = now; return s._pr || 0; });

  function assign(s, r) {
    const occ = s.sites.map(() => []);
    s.fights = [];
    shuffle(s.blobs, r).forEach(b => {
      b.px = b.x; b.py = b.y;
      const k = (r() * s.sites.length) | 0;
      if (occ[k].length < 2) { occ[k].push(b); b.site = k; b.x = s.sites[k].x + (occ[k].length === 1 ? -.021 : .021); b.y = s.sites[k].y; }
      else { b.site = -1; const h = home(r()); b.x = h.x; b.y = h.y; }
    });
    s.occ = occ;
    occ.forEach((o, k) => { if (o.length === 2 && o[0].h && o[1].h) s.fights.push(k); });
  }
  function food(me, other, p) {
    if (!other) return 2;
    if (me.h && other.h) return 1 - p.cost;
    if (me.h) return 2 - p.keep;
    if (other.h) return p.keep;
    return 1;
  }

  BS.sims.push({
    id: 'hawkdove', name: 'Hawks & Doves', topic: 'Game theory', accent: '--orange', iconAngry: true, dayLabel: 'day', biome: 'meadow',
    question: 'Why do fights not take over?',
    hook: ["Hawks fight. Doves share.","And still the two sides balance out."],
    source: 'After Primer, “Simulating the Evolution of Aggression”',
    knobs: [
      { id: 'cost', label: 'Fight cost', hint: 'Food each hawk loses when two hawks fight', min: .1, max: 1, step: .05, value: 1, fmt: v => v.toFixed(2) + ' food' },
      { id: 'keep', label: 'Food a bullied dove keeps', hint: 'The hawk takes the rest', min: 0, max: .9, step: .05, value: .5, fmt: v => v.toFixed(2) + ' food' },
      { id: 'mut', label: 'Mutation rate', hint: 'Chance a newborn switches type', min: 0, max: 5, step: .5, value: 1, fmt: v => v.toFixed(1) + '%' },
      { id: 'sites', label: 'Food trees', min: 40, max: 160, step: 10, value: 100, reset: true, fmt: v => v },
      { id: 'h0', label: 'Start hawk share', min: 0, max: 100, step: 5, value: 10, reset: true, fmt: v => v + '%' }
    ],
    chapters: [
      { title: 'Doves only', text: 'Doves share. Two doves at a tree get 1 food each, so both survive. The group grows until the trees are full, then it stays flat. Mutation is off.', set: { h0: 0, cost: 1, keep: .5, mut: 0 } },
      { title: 'One hawk arrives', text: 'A hawk takes 1.5 food from a dove. Hawks spread fast while most rivals are doves.', set: { h0: 5, cost: 1, keep: .5, mut: 1 } },
      { title: 'Hawks meet hawks', text: 'Two hawks fight and both lose all their food. The more hawks there are, the more they meet. The hawk share stops at 50 %, the value of (1 − keep) / cost.', set: { h0: 90, cost: 1, keep: .5, mut: 1 } },
      { title: 'Cheap fights', text: 'Make fights cheap (cost 0.4). Now a fight costs less than bullying gains, the theory value is above 100 %, and hawks take over.', set: { h0: 10, cost: .4, keep: .5, mut: 1 } }
    ],
    presets: [
      { label: 'Free fights', set: { cost: .1 }, note: 'A fight costs almost nothing, so a hawk never loses by fighting. Hawks take nearly the whole island.' },
      { label: 'Generous bullies', set: { keep: .9 }, note: 'A bullied dove keeps 0.9 food, so bullying gains little. Only about 1 blob in 10 stays a hawk.' },
      { label: 'Doves lose all', set: { keep: 0 }, note: 'A hawk takes all the food from a dove. Hawks win almost everywhere; mutation keeps a few doves alive.' }
    ],
    legend: [{ label: 'dove', color: '--blue' }, { label: 'hawk', color: '--orange' }, { label: 'food', color: '--gold' }],
    series: [{ key: 'hawk', label: 'Hawks', color: '--orange', area: true }, { key: 'dove', label: 'Doves', color: '--blue' }],
    ymax: 1, fmt: pct,
    theory(p) { const v = theoryShare(p); return [{ value: v, label: 'theory ' + pct(v), color: '--orange' }]; },
    init(p, r) {
      const n = p.sites, sites = [];
      for (let i = 0; i < n; i++) { const rr = Math.sqrt((i + .5) / n) * .4, a = i * 2.399963; sites.push({ x: W / 2 + Math.cos(a) * rr * 1.3, y: .5 + Math.sin(a) * rr * .95 }); }
      const hawks = Math.round(n * p.h0 / 100), blobs = [];
      for (let i = 0; i < n; i++) { const h = home(i / n); blobs.push({ id: i, h: i < hawks, x: h.x, y: h.y, px: h.x, py: h.y, hf: (i * .618034) % 1 }); }
      const s = { day: 0, sites, blobs, ghosts: [], nextId: n };
      assign(s, r);
      return s;
    },
    step(s, p, r) {
      const next = [], ghosts = [];
      s.blobs.forEach(b => {
        const o = b.site < 0 ? null : s.occ[b.site].find(z => z !== b);
        const f = b.site < 0 ? 0 : food(b, o, p);
        b.f = f; b.pt = o; b.sk = b.site; b.tx = b.x; b.ty = b.y; // today's record, read by render()
        if (r() < Math.min(f, 1)) { b.born = false; b.dead = false; next.push(b); } else { b.dead = true; ghosts.push(b); }
        if (r() < clamp(f - 1, 0, 1)) next.push({ id: s.nextId++, h: r() < p.mut / 100 ? !b.h : b.h, x: b.x, y: b.y, born: true, hf: (b.hf + .012) % 1 });
      });
      s.blobs = next.slice(0, p.sites * 4);
      s.ghosts = ghosts;
      s.done = s.fights; // fights that were played today; assign() below builds tomorrow's list
      s.day++;
      assign(s, r);
    },
    metrics(s) { const n = s.blobs.length || 1, h = s.blobs.filter(b => b.h).length; return { hawk: h / n, dove: 1 - h / n }; },
    kpis(s, p) {
      const m = this.metrics(s);
      return [
        { label: 'Blobs alive', value: s.blobs.length },
        { label: 'Hawk share', value: pct(m.hawk), tone: '--orange-text' },
        { label: 'Theory share', value: pct(theoryShare(p)), note: '(1 − keep) / cost' },
        { label: 'Fights today', value: s.done ? s.done.length : 0 }
      ];
    },
    insight(s, p, hist) {
      if (!s.blobs.length) return 'Every blob died. Press Reset to start again.';
      const th = theoryShare(p), recent = hist.filter(q => q.t > s.day - 30), avg = recent.reduce((a, q) => a + q.hawk, 0) / recent.length;
      if (s.day < 25) return 'Watch the orange line. Hawks win food from doves, so hawks grow while doves are common.';
      if (avg === 0) return 'No hawks exist, so nothing can change. Go to chapter 2 to add a hawk.';
      if (th >= 1) return 'Fights are cheap, so a hawk always does better than a dove. Hawks take over. Mutation keeps a few doves alive.';
      return 'Over the last 30 days the hawk share was ' + pct(avg) + '. The theory says ' + pct(th) + '. At that mix, hawks and doves get the same food on average.';
    },
    extraTitle: 'Food per blob at one tree',
    extraHTML(p) {
      const c = v => +v.toFixed(2);
      return '<table class="pay"><thead><tr><th scope="col">me \\ rival</th><th scope="col">dove</th><th scope="col">hawk</th></tr></thead><tbody>' +
        '<tr><th scope="row">dove</th><td>1</td><td>' + c(p.keep) + '</td></tr>' +
        '<tr><th scope="row">hawk</th><td>' + c(2 - p.keep) + '</td><td>' + c(1 - p.cost) + '</td></tr></tbody></table>' +
        '<p class="fine">1 food = survive. 2 food = survive and copy. A blob alone at a tree gets 2.</p>';
    },
    // Choreography per day (what happened in the day that just ended): wake and hop at home (0-.08), walk to the trees (.08-.38),
    // fruit flies from the tree to each eater, 2 gems split by the rules (.42-.56), munch (.56-.62), the hungry fade (.64-.76),
    // the fed walk home (.68-.9), children pop at home (.86-1) and the trees regrow.
    render(R, s, t, now, p) {
      const slow = pace(s, t, now) < 2.1, RB = .017, idle = !s.day;
      let said = 0;
      const say = (x, y, text, c, a, lift) => { if (slow && a > 0 && said++ < 10) R.label(x, y, text, c, a, lift); };
      const acts = idle ? [] : s.blobs.filter(b => !b.born && b.f !== undefined).concat(s.ghosts), used = new Set();
      acts.forEach(b => { if (b.sk >= 0) used.add(b.sk); });
      s.sites.forEach((st, k) => {
        R.prop('tree', st.x, st.y - .012, .014, '--green');
        const g = used.has(k) ? (t < .42 ? 1 : ease(seg(t, .88, 1))) : 1;
        if (g > 0) for (const dx of [-.007, .007]) R.prop('food', st.x + dx, st.y - .012, .007 * g, '--gold', { lift: .042 + Math.sin(now / 500 + k) * .004, rot: now / 700 });
      });
      if (idle) {
        s.blobs.forEach(b => { const h = hp(b); R.blob(h.x, h.y, RB, b.h ? '--orange' : '--blue', { angry: b.h, smile: !b.h, blink: BS.blinking(b.id, now), lift: Math.abs(Math.sin(now / 500 + b.id)) * .004 }); });
        return;
      }
      (s.done || []).forEach(k => { // two hawks at one tree: a red puff grows, the gems are lost
        const st = s.sites[k], u = seg(t, .44, .6);
        if (u > 0 && u < 1) { R.ring(st.x, st.y, .02 + .035 * ease(u), '--red'); R.ring(st.x, st.y, .01 + .02 * ease(u), '--red'); }
        say(st.x, st.y, 'fight!', '--red', Math.min(seg(t, .44, .5), 1 - seg(t, .58, .66)), .09);
      });
      acts.forEach(b => {
        const H = hp(b), dead = b.dead, tree = b.sk >= 0, st = tree ? s.sites[b.sk] : null;
        const T = tree ? { x: b.tx, y: b.ty + .008 } : { x: lerp(H.x, W / 2, .3), y: lerp(H.y, .5, .3) };
        const w = ease(seg(t, .08, .38)), bk = dead ? 0 : ease(seg(t, .68, .9));
        const walking = t > .08 && t < .38 ? seg(t, .08, .38) : !dead && t > .68 && t < .9 ? seg(t, .68, .9) : -1;
        const hops = Math.max(2, Math.round(Math.hypot(T.x - H.x, T.y - H.y) / .1));
        const d0 = ((b.id * .37) % 1) * .04;
        let x = lerp(H.x, T.x, w * (1 - bk)), y = lerp(H.y, T.y, w * (1 - bk)), lift = walking >= 0 ? Math.abs(Math.sin(walking * hops * Math.PI)) * .014 : t < .08 ? Math.sin(Math.PI * seg(t, d0, d0 + .04)) * .012 : 0;
        const fight = tree && b.pt && b.h && b.pt.h, eat = t > .44 && t < .58;
        let sq = 1;
        if (fight && eat) { x += Math.sin(t * 300) * .003; lift += Math.abs(Math.sin(t * 90)) * .008; }
        else if (tree && b.pt && eat) sq = b.h ? 1.12 : .88; // the hawk puffs up, the bullied dove cowers
        if (t > .56 && t < .62) sq *= 1 + .18 * Math.sin(Math.PI * seg(t, .56, .62) * 2); // munch
        const fade = dead ? ease(seg(t, .64, .76)) : 0;
        lift += fade * .03;
        const frown = dead && t > .5 || !tree && t > .38;
        if (fade < 1) R.blob(x, y, RB * (1 - fade), b.h ? '--orange' : '--blue', { angry: b.h, smile: !b.h && !frown, frown: frown && !b.h, squash: sq, lift, blink: BS.blinking(b.id, now) });
        if (tree && b.f > .04 && t > .42 && t < .62) { // gems fly from the tree to the eater, then are eaten
          const n = Math.floor(b.f + 1e-6), parts = Array(n).fill(1);
          if (b.f - n > .04) parts.push(b.f - n);
          const u = ease(seg(t, .42, .52)), ab = seg(t, .56, .62);
          parts.forEach((q, gi) => {
            const hx = x + (gi - (parts.length - 1) / 2) * .012, tx = st.x + (gi % 2 ? .007 : -.007);
            R.prop('food', lerp(tx, hx, u), lerp(st.y - .012, y, u), .007 * Math.sqrt(q) * (1 - ab), '--gold', { lift: lerp(.042, .045 + lift, u) + Math.sin(Math.PI * u) * .03 - ab * .03, rot: now / 400 });
          });
          if (b.id % 2 === 0 || !b.pt) say(x, y, '+' + +b.f.toFixed(2), '--ink', Math.min(seg(t, .48, .54), 1 - seg(t, .6, .66)), .075);
        }
        if (dead) say(x, y, tree ? 'starved' : 'no tree', '--red', tree ? Math.min(seg(t, .62, .66), 1 - seg(t, .72, .76)) : Math.min(seg(t, .4, .44), 1 - seg(t, .56, .6)), .07);
      });
      s.blobs.forEach(b => { // children pop at home next to their parent
        if (!b.born) return;
        const u = seg(t, .86, 1), h = hp(b);
        if (u <= 0) return;
        R.blob(h.x, h.y, RB * back(u), b.h ? '--orange' : '--blue', { angry: b.h, smile: !b.h, lift: Math.sin(Math.PI * u) * .02, blink: BS.blinking(b.id, now) });
        if (b.id % 3 === 0) say(h.x, h.y, '+1 child', '--green', Math.min(seg(t, .88, .93), 1), .06);
      });
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
