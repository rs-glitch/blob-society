// Checks that each chapter's story claim holds in the model, over several seeds.
// Run: node app/tests/model.test.js
// It also writes tests/RESULTS.md, which the README links to (so the claims table cannot drift from the code).
require('../js/engine.js');
['hawkdove', 'trust', 'wealth', 'epidemic'].forEach(id => require('../js/sims/' + id + '.js'));
const fs = require('fs'), path = require('path');
const BS = globalThis.BS;
const sim = id => BS.sims.find(s => s.id === id);
let fails = 0;
const rows = [];

function run(id, set, days, seed) {
  const s = sim(id), p = {};
  s.knobs.forEach(k => p[k.id] = k.value);
  Object.assign(p, set);
  const r = BS.rng(seed), st = s.init(p, r), hist = [];
  for (let d = 0; d < days; d++) { s.step(st, p, r); hist.push(s.metrics(st, p)); }
  return { st, hist, p };
}
const avg = (h, k, n) => { const t = h.slice(-n); return t.reduce((a, q) => a + q[k], 0) / t.length; };
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + '  ' + detail); rows.push([ok, name, detail]); if (!ok) fails++; }
const seeds = [1, 2, 3];

// Hawks & Doves
for (const [cost, keep, h0, want] of [[1, .5, 90, .5], [1, .5, 5, .5], [.75, .5, 10, 2 / 3], [.6, .4, 10, .93]]) {
  const v = seeds.map(sd => avg(run('hawkdove', { cost, keep, h0 }, 400, sd).hist, 'hawk', 200));
  const m = v.reduce((a, b) => a + b) / v.length;
  check(`hawkdove cost=${cost} h0=${h0} -> ${want.toFixed(2)}`, Math.abs(m - want) < .06, 'mean ' + m.toFixed(3) + ' per seed ' + v.map(x => x.toFixed(2)).join(','));
}
{ const v = seeds.map(sd => avg(run('hawkdove', { cost: .4, keep: .5, h0: 10 }, 300, sd).hist, 'hawk', 50));
  check('hawkdove cheap fights -> hawks take over', v.every(x => x > .9), v.map(x => x.toFixed(2)).join(',')); }
{ const v = seeds.map(sd => { const o = run('hawkdove', { h0: 0, mut: 0 }, 200, sd); return o.st.blobs.filter(b => b.h).length ? -1 : o.st.blobs.length; });
  check('hawkdove doves only -> stays all doves, 1.4-2 blobs per tree (100 trees)', v.every(x => x > 140 && x < 200), v.join(',')); }

// Trust tournament
{ const v = seeds.map(sd => run('trust', { rounds: 1, noise: 0, mix: 'even' }, 80, sd).hist.slice(-1)[0].alld);
  check('trust 1 round -> cheaters win', v.every(x => x > .9), v.map(x => x.toFixed(2)).join(',')); }
{ const v = seeds.map(sd => { const h = run('trust', { rounds: 10, noise: 0, mix: 'even' }, 80, sd).hist; return [h.slice(-1)[0].alld, h.slice(-1)[0].coop]; });
  check('trust 10 rounds -> cheaters gone, coop > 90%', v.every(([d, c]) => d < .02 && c > .9), v.map(x => x.map(y => y.toFixed(2)).join('/')).join(',')); }
{ const v = seeds.map(sd => { const h = run('trust', { rounds: 10, noise: 0, mix: 'nice' }, 120, sd).hist; return [Math.max(...h.map(q => q.alld)), h[119].alld]; });
  check('trust too nice -> cheaters peak > 50% then < 5%', v.every(([a, b]) => a > .5 && b < .05), v.map(x => x.map(y => y.toFixed(2)).join('->')).join(',')); }
{ const v = seeds.map(sd => { const h = run('trust', { rounds: 10, noise: 5, mix: 'even' }, 150, sd).hist; return [avg(h, 'coop', 30), avg(h, 'alld', 30)]; });
  check('trust mistakes -> coop < 92% with < 5% cheaters', v.every(([c, d]) => c < .92 && d < .05), v.map(x => x.map(y => y.toFixed(2)).join('/')).join(',')); }

// Wealth
{ const v = seeds.map(sd => { const h = run('wealth', { bet: 10, tax: 0 }, 600, sd).hist; return [h[99].gini, h[599].gini]; });
  check('wealth no tax -> Gini rises (day 100 < day 600, > 0.6)', v.every(([a, b]) => b > a && b > .6), v.map(x => x.map(y => y.toFixed(2)).join('->')).join(',')); }
{ const v = seeds.map(sd => run('wealth', { bet: 30, tax: 0 }, 300, sd).hist[299].gini);
  check('wealth big bets -> Gini > 0.8 by day 300', v.every(x => x > .8), v.map(x => x.toFixed(2)).join(',')); }
{ const v = seeds.map(sd => { const h = run('wealth', { bet: 10, tax: 1 }, 800, sd).hist; return [avg(h.slice(0, 400), 'gini', 100), avg(h, 'gini', 100)]; });
  check('wealth tax 1% -> Gini stable (< 0.6, drift < 0.05)', v.every(([a, b]) => b < .6 && Math.abs(a - b) < .05), v.map(x => x.map(y => y.toFixed(2)).join('->')).join(',')); }
{ const v = seeds.map(sd => [avg(run('wealth', { bet: 10, tax: 1, edge: 0 }, 600, sd).hist, 'top10', 100), avg(run('wealth', { bet: 10, tax: 1, edge: 4 }, 600, sd).hist, 'top10', 100)]);
  check('wealth rich edge -> top 10% share higher than no edge', v.every(([a, b]) => b > a + .05), v.map(x => x.map(y => y.toFixed(2)).join('->')).join(',')); }

// Epidemic
const epi = (set, sd) => run('epidemic', set, 300, sd);
{ const v = seeds.map(sd => { const { st, hist } = epi({}, sd); const pk = hist.reduce((b, q, i) => q.I > hist[b].I ? i : b, 0); return { r0: st.r0, ever: st.ever / 360, sAtPeak: hist[pk].S, inv: st.r0 ? 1 / st.r0 : 0 }; });
  check('epidemic free spread -> R0 in 1.5–4, >60% infected', v.every(x => x.r0 > 1.5 && x.r0 < 4 && x.ever > .6), v.map(x => 'R0 ' + x.r0.toFixed(2) + ' ever ' + x.ever.toFixed(2)).join(', '));
  check('epidemic peaks while > 20% still susceptible, < 95% ever infected', v.every(x => x.sAtPeak > .2 && x.ever < .95), v.map(x => 'S@peak ' + x.sAtPeak.toFixed(2) + ' ever ' + x.ever.toFixed(2)).join(', ')); }
{ const v = seeds.map(sd => [epi({ dist: 0 }, sd), epi({ dist: 50 }, sd)].map(o => Math.max(...o.hist.map(q => q.I))));
  check('epidemic distancing -> lower peak', v.every(([a, b]) => b < a), v.map(x => x.map(y => y.toFixed(2)).join('->')).join(',')); }
{ const v = seeds.map(sd => epi({ vax: 70 }, sd).st.ever / 360);
  check('epidemic 70% vaccinated -> fizzles (<10% ever infected)', v.every(x => x < .1), v.map(x => x.toFixed(3)).join(',')); }
{ const v = [1, 2, 3, 4, 5].map(sd => run('epidemic', { wane: 2 }, 400, sd).hist.slice(-1)[0].I);
  check('epidemic waning 2% -> endemic in >= 3 of 5 runs at day 400', v.filter(x => x > 0).length >= 3, v.map(x => x.toFixed(3)).join(',')); }

// Guards added after mutation testing (each catches a code change that the checks above missed).
{ const v = seeds.map(sd => avg(run('hawkdove', { cost: 1, keep: .2, h0: 10 }, 400, sd).hist, 'hawk', 200));
  const m = v.reduce((a, b) => a + b) / v.length;
  check('hawkdove keep=0.2 -> 0.80 (the keep knob matters)', Math.abs(m - .8) < .07, 'mean ' + m.toFixed(3)); }
{ const v = seeds.map(sd => avg(run('hawkdove', { cost: 1, keep: .5, h0: 90, sites: 60 }, 400, sd).hist, 'hawk', 200));
  const m = v.reduce((a, b) => a + b) / v.length;
  check('hawkdove 60 trees -> still 0.50 (not tied to default size)', Math.abs(m - .5) < .08, 'mean ' + m.toFixed(3)); }
{ const v = seeds.map(sd => avg(run('wealth', { bet: 10, tax: 1, edge: 4 }, 600, sd).hist, 'top10', 100));
  check('wealth rich edge 4% -> top 10% own > 50%', v.every(x => x > .5), v.map(x => x.toFixed(2)).join(',')); }
{ const r = BS.rng(7), [, , gc] = BS.trust.playMatch(4, 1, 6000, 0, r), [, , tc] = BS.trust.playMatch(2, 1, 6000, 0, r);
  check('trust forgiving copycat forgives ~1/3 of cheats; copycat does not', gc > .13 && gc < .2 && tc < .01, 'coop vs cheater: forgiving ' + gc.toFixed(3) + ', copycat ' + tc.toFixed(3)); }

const md = ['# Model claim checks', '', 'Generated by `node app/tests/model.test.js` on ' + new Date().toISOString().slice(0, 10) + '. Do not edit by hand.', '',
  '| Result | Claim | Measured (per seed) |', '|---|---|---|', ...rows.map(([ok, n, d]) => `| ${ok ? 'pass' : '**FAIL**'} | ${n} | ${d.replace(/\|/g, '/')} |`), '',
  `${rows.length - fails} of ${rows.length} checks pass.`].join('\n');
fs.writeFileSync(path.join(__dirname, 'RESULTS.md'), md + '\n');
console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
