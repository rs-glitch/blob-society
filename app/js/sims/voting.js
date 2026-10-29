// Election Day: voters sit on an opinion map and rank candidates by distance. One day = one election. Methods: plurality, instant runoff, approval.
(function (G) {
  const BS = G.BS;
  const { lerp, ease, pct, W, clamp } = BS;
  const X0 = .14, XW = W - .28, Y0 = .2, YH = .6, N = 60, K = 3; // opinion square (u, v in 0..1) mapped onto the arena
  const SCENES = {
    spoiler: { // two similar candidates share the big crowd; one candidate stands with a tight bloc at the edge
      cands: [['Ann', .26, '--blue'], ['Ben', .40, '--green'], ['Cy', .88, '--orange']],
      groups: [[35, .35, .1], [25, .88, .05]]
    },
    squeeze: { // two polar camps, a few centre voters, a centrist who is almost everyone's second choice
      cands: [['Lee', .20, '--blue'], ['Mo', .50, '--green'], ['Ray', .80, '--orange']],
      groups: [[28, .22, .09], [4, .50, .05], [28, .78, .09]]
    }
  };
  const gauss = r => Math.sqrt(-2 * Math.log(1 - r())) * Math.cos(6.2832 * r());
  const pos = (u, v) => [X0 + u * XW, Y0 + v * YH];
  const candsOf = scene => SCENES[scene].cands.map(([name, u, color]) => { const [x, y] = pos(u, .5); return { name, x, y, color }; });
  const pickMax = (t, r, ok) => { // index of the highest tally among ok candidates; ties go to a random one
    const idx = [...t.keys()].filter(k => !ok || ok[k]), m = Math.max(...idx.map(k => t[k])), tied = idx.filter(k => t[k] === m);
    return tied[(r() * tied.length) | 0];
  };
  const count = (lists) => { const t = [0, 0, 0]; lists.forEach(a => a.forEach(k => t[k]++)); return t; };

  function election(s, p, r) {
    const V = s.voters, C = s.cands, res = {};
    V.forEach(v => { v.d = C.map(c => Math.hypot(v.x - c.x, v.y - c.y)); v.rank = [0, 1, 2].sort((a, b) => v.d[a] - v.d[b]); });
    const h = count(V.map(v => [v.rank[0]]));
    let c0, w;
    if (p.method === 'approval') {
      c0 = V.map(v => { const a = v.rank.filter(k => v.d[k] <= p.radius); return a.length ? a : [v.rank[0]]; });
      const t = count(c0); w = pickMax(t, r);
      res.rounds = [{ tally: t, alive: [true, true, true], out: -1 }]; res.choices = [c0.map(a => a[0])];
    } else if (p.method === 'irv') {
      const alive = [true, true, true]; res.rounds = []; res.choices = [];
      for (;;) {
        const ch = V.map(v => v.rank.find(k => alive[k])), t = count(ch.map(k => [k])), n = alive.filter(Boolean).length;
        res.choices.push(ch);
        if (!res.rounds.length) c0 = ch.map(k => [k]);
        const lead = pickMax(t, r, alive);
        if (t[lead] * 2 > N || n === 1) { res.rounds.push({ tally: t, alive: alive.slice(), out: -1 }); w = lead; break; }
        const out = pickMax(t.map(x => -x), r, alive); // fewest first-choice ballots goes out
        res.rounds.push({ tally: t, alive: alive.slice(), out }); alive[out] = false;
      }
    } else {
      const poll = h.map(x => x + 3 * gauss(r)), top2 = [0, 1, 2].sort((a, b) => poll[b] - poll[a]).slice(0, 2);
      c0 = V.map(v => [v.sr < p.strat / 100 ? v.rank.find(k => top2.includes(k)) : v.rank[0]]);
      const t = count(c0); w = pickMax(t, r);
      if (p.strat > 0) res.poll = top2;
      res.rounds = [{ tally: t, alive: [true, true, true], out: -1 }]; res.choices = [c0.map(a => a[0])];
    }
    let cw = -1; // Condorcet winner: beats every rival one-on-one
    for (let i = 0; i < K; i++) if ([0, 1, 2].every(j => j === i || V.filter(v => v.d[i] < v.d[j]).length * 2 > N)) cw = i;
    const last = res.rounds[res.rounds.length - 1];
    Object.assign(res, { w, cw, c0, h, support: last.tally[w] / N, first: h[w] / N, cond: cw < 0 || cw === w ? 1 : 0 });
    s.res = res;
    const e = s.ema, a = s.day ? .15 : 1;
    ['support', 'first', 'cond'].forEach(k => e[k] += a * (res[k] - e[k]));
    s.wins[w]++; s.condN += res.cond; s.n++;
  }


  BS.sims.push({
    id: 'voting', name: 'Election Day', topic: 'Society & economy', accent: '--violet', dayLabel: 'election', biome: 'hills', maxDays: 300,
    question: 'Does the voting method pick the right winner?',
    hook: ["Same voters. Same wishes.","A different count picks a different winner."],
    source: 'After Primer, “Simulating alternate voting systems”; Condorcet (1785), Arrow (1951)',
    knobs: [
      { id: 'method', label: 'Voting method', type: 'select', reset: true, value: 'plurality', options: [['plurality', 'Plurality (most votes wins)'], ['irv', 'Instant runoff'], ['approval', 'Approval (vote for all you accept)']] },
      { id: 'scene', label: 'Candidates and crowd', type: 'select', reset: true, value: 'spoiler', options: [['spoiler', 'Two alike, one at the edge'], ['squeeze', 'Two camps, one centrist']] },
      { id: 'radius', label: 'Approval radius', hint: 'A voter approves every candidate this close', min: .1, max: 1.2, step: .1, value: .4, fmt: v => v.toFixed(2) },
      { id: 'strat', label: 'Tactical voters (plurality)', hint: 'They drop a hopeless favourite and follow a noisy poll', min: 0, max: 100, step: 10, value: 0, fmt: v => v + '%' }
    ],
    chapters: [
      { title: 'The spoiler', text: 'Ann and Ben stand close together. Most voters like one of them best, but the two split that vote. Cy has a smaller bloc and wins by plurality.', set: { method: 'plurality', scene: 'spoiler', strat: 0 } },
      { title: 'Instant runoff', text: 'Same voters, same candidates. Now each voter ranks all three. The last candidate goes out and their ballots move on. Ann goes out, her ballots move to Ben, and Ben wins.', set: { method: 'irv', scene: 'spoiler', strat: 0 } },
      { title: 'The centre squeeze', text: 'Mo is close to everyone and beats each rival one-on-one. But few voters rank Mo first. Instant runoff removes Mo in round 1, so Mo never wins.', set: { method: 'irv', scene: 'squeeze', strat: 0 } },
      { title: 'Voting tactically', text: 'Back to plurality and the spoiler. Now every voter follows a poll and drops a hopeless favourite. The poll names Ben and Cy as the leaders, so Ann’s voters move to Ben. The spoiler fails and Ben wins.', set: { method: 'plurality', scene: 'spoiler', strat: 100 } }
    ],
    presets: [
      { label: 'Tiny radius', set: { method: 'approval', scene: 'squeeze', radius: .1 }, note: 'Each voter approves only the nearest candidate. Approval then works like plurality. Mo loses in most elections.' },
      { label: 'Huge radius', set: { method: 'approval', scene: 'squeeze', radius: 1.2 }, note: 'Every voter approves every candidate. The winner has full support, but the winner is a random pick.' },
      { label: 'Approval, wide', set: { method: 'approval', scene: 'squeeze', radius: .4 }, note: 'Each voter approves all candidates in reach. Mo is in reach of most voters, so Mo wins.' }
    ],
    legend: [{ label: 'candidate 1', color: '--blue' }, { label: 'candidate 2', color: '--green' }, { label: 'candidate 3', color: '--orange' }, { label: 'blob colour = first choice', color: '--mute' }],
    series: [{ key: 'support', label: 'Winner’s support', color: '--violet', area: true }, { key: 'first', label: 'Voters who got their first choice', color: '--teal' }, { key: 'cond', label: 'Winner beats all rivals one-on-one', color: '--gold' }],
    ymax: 1, fmt: pct,
    theory() { return [{ value: .5, label: 'majority', color: '--mute' }]; },
    init(p, r) {
      const sc = SCENES[p.scene], voters = [];
      sc.groups.forEach(([n, u, su]) => { for (let i = 0; i < n; i++) { const [x, y] = pos(clamp(u + su * gauss(r), 0, 1), clamp(.5 + .28 * gauss(r), 0, 1)); voters.push({ id: voters.length, hx: x, hy: y, x, y, px: x, py: y, sr: r(), d: null, rank: null }); } });
      const s = { day: 0, voters, cands: candsOf(p.scene), wins: [0, 0, 0], condN: 0, n: 0, ema: { support: 0, first: 0, cond: 0 }, res: null };
      election(s, p, r);
      return s;
    },
    step(s, p, r) {
      s.voters.forEach(v => { v.px = v.x; v.py = v.y; v.x = v.hx + .015 * gauss(r); v.y = v.hy + .015 * gauss(r); }); // a fresh mood each election
      s.day++;
      election(s, p, r);
    },
    metrics(s) { return { support: s.ema.support, first: s.ema.first, cond: s.ema.cond }; },
    kpis(s) {
      const q = s.res;
      return [
        { label: 'Winner today', value: s.cands[q.w].name, tone: '--violet-text' },
        { label: 'Backed by', value: pct(q.support), note: 'of all voters' },
        { label: 'Got their first choice', value: pct(q.first) },
        { label: 'Beats all one-on-one', value: q.cw < 0 ? 'nobody' : s.cands[q.cw].name, note: q.cw >= 0 && q.cw !== q.w ? 'but lost' : '' }
      ];
    },
    insight(s, p) {
      const q = s.res, C = s.cands;
      if (q.cw >= 0 && q.cw !== q.w) return C[q.cw].name + ' beats every rival one-on-one, but ' + C[q.w].name + ' won. The method picked a winner most voters like less.';
      if (q.cw === q.w) return C[q.w].name + ' wins, and ' + C[q.w].name + ' also beats every rival one-on-one. The method found the voters’ true favourite.';
      return C[q.w].name + ' wins. Only ' + pct(q.first) + ' of voters got their first choice.';
    },
    extraTitle: 'Results table',
    extraHTML(p, cur) {
      if (!cur || !cur.res) return '';
      const q = cur.res, C = cur.cands, head = q.rounds.map((_, j) => '<th>' + (q.rounds.length > 1 ? 'Round ' + (j + 1) : p.method === 'approval' ? 'Approvals' : 'Votes') + '</th>').join('');
      const rows = C.map((c, k) => '<tr' + (k === q.w ? ' style="font-weight:700"' : '') + '><td><i style="display:inline-block;width:.7em;height:.7em;border-radius:50%;background:var(' + c.color + ')"></i> ' + c.name + (k === q.w ? ' (wins)' : '') + '</td>' + q.rounds.map(rd => '<td>' + (rd.alive[k] ? rd.tally[k] : 'out') + '</td>').join('') + '</tr>').join('');
      return '<table style="width:100%;border-collapse:collapse;font-size:.9rem"><tr><th style="text-align:left">Candidate</th>' + head + '</tr>' + rows + '</table>' + (q.poll ? '<p>Poll: ' + q.poll.map(k => C[k].name).join(' and ') + ' lead.</p>' : '');
    },
    // Choreography: crowd settles (0-.12), glances to ballot choices (.1-.28), coins fly to piles (.28-.9; one stage per IRV round), winner bounces (.88-1).
    render(R, s, t, now, p) {
      const q = s.res, C = s.cands, V = s.voters, nS = q.rounds.length, A = .28, L = .62 / nS, set = ease(BS.seg(t, 0, .12));
      const stage = clamp(Math.floor((t - A) / L), 0, nS - 1), pile = C.map(c => [c.x + .055, c.y + .02]);
      const vx = v => lerp(v.px, v.x, set), vy = v => lerp(v.py, v.y, set);
      const settled = [0, 0, 0], fly = [];
      // where is each ballot? settled counts feed the piles; flying coins are drawn at the end
      const prog = (j, i) => clamp(BS.seg(t, A + j * L, A + (j + 1) * L) * 1.5 - i / V.length * .5, 0, 1);
      V.forEach((v, i) => {
        if (p.method === 'approval') {
          const u = prog(0, i);
          q.c0[i].forEach(k => { if (u >= 1) settled[k]++; else if (u > 0) fly.push([vx(v), vy(v), pile[k][0], pile[k][1], u, k]); });
          return;
        }
        let loc = -1;
        for (let j = 0; j < nS; j++) {
          const u = prog(j, i), to = q.choices[j][i], from = j ? q.choices[j - 1][i] : -1;
          if (j && to === from) continue;
          if (u >= 1) { loc = to; continue; }
          if (u > 0) { fly.push([from < 0 ? vx(v) : pile[from][0], from < 0 ? vy(v) : pile[from][1], pile[to][0], pile[to][1], u, to]); loc = -2; } else loc = from;
          break;
        }
        if (loc >= 0) settled[loc]++;
      });
      V.forEach((v, i) => {
        const fav = v.rank[0], glad = t > .9 ? (fav === q.w ? 1 : -1) : 0;
        R.blob(vx(v), vy(v), .016, C[fav].color, { smile: glad >= 0, frown: glad < 0, blink: BS.blinking(v.id, now), look: .5 });
        if (t > .1 && t < .34) {
          const a = BS.seg(t, .1, .2) * (1 - BS.seg(t, .28, .34));
          q.c0[i].forEach(k => R.line(vx(v), vy(v), C[k].x, C[k].y, C[k].color, a * (p.method === 'approval' ? .5 : .8), .01));
        }
      });
      fly.forEach(([x0, y0, x1, y1, u, k]) => { const e = ease(u); R.prop('coin', lerp(x0, x1, e), lerp(y0, y1, e), .007, C[k].color, { lift: Math.sin(Math.PI * e) * .07 + .01 }); });
      const wob = Math.abs(Math.sin(BS.seg(t, .88, 1) * 9)) * (1 - BS.seg(t, .88, 1));
      C.forEach((c, k) => {
        const out = q.rounds.findIndex(rd => rd.out === k), gone = out >= 0 && t >= A + (out + 1) * L, win = k === q.w && t > .88;
        R.prop('rock', c.x, c.y, .04, '--slate');
        R.blob(c.x, c.y, .03, gone ? '--slate' : c.color, { lift: .02 + (win ? wob * .06 : 0), squash: win ? 1 + wob * .15 : gone ? .8 : 1, smile: !gone, frown: gone, blink: BS.blinking(100 + k, now), angry: false });
        const n = Math.min(20, Math.ceil(settled[k] / 3));
        for (let j = 0; j < n; j++) R.prop('coin', pile[k][0], pile[k][1], .007, c.color, { lift: j * .005 });
        if (t > A) R.label(pile[k][0], pile[k][1], String(settled[k]), '--ink', 1, .03 + n * .005);
        R.label(c.x, c.y, c.name, '--ink', .9, .075);
        if (gone && t < A + (out + 1) * L + .08) R.label(c.x, c.y, 'out', '--red', 1, .12);
        if (win) R.label(c.x, c.y, c.name + ' wins!', '--violet-text', BS.seg(t, .88, .93), .12);
      });
      if (q.poll && t < .3) R.label(W / 2, .04, 'Poll: ' + q.poll.map(k => C[k].name).join(' and ') + ' lead', '--ink', 1, .05);
      else if (nS > 1 && stage > 0 && t < .9) R.label(W / 2, .04, 'round ' + (stage + 1), '--ink', 1, .05);
    }
  });
})(typeof window !== 'undefined' ? window : globalThis);
