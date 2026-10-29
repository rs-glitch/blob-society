// Edge-case preset claims for the 8 original worlds, over 3 seeds. Each check matches the preset's note text.
// Run: node app/tests/model_presets.test.js
require('../js/engine.js');
['hawkdove', 'trust', 'rps', 'wealth', 'segregation', 'opinions', 'commons', 'epidemic'].forEach(id => require('../js/sims/' + id + '.js'));
const BS = globalThis.BS, sim = id => BS.sims.find(s => s.id === id), f2 = x => (+x).toFixed(2), seeds = [1, 2, 3];
let fails = 0;
function run(id, label, days, seed, extra) {
  const s = sim(id), pr = s.presets.find(q => q.label === label);
  if (!pr) throw new Error(id + ': no preset ' + label);
  const p = {}; s.knobs.forEach(k => p[k.id] = k.value); Object.assign(p, pr.set, extra);
  const r = BS.rng(seed), st = s.init(p, r), hist = [];
  for (let d = 0; d < days; d++) { s.step(st, p, r); hist.push(s.metrics(st, p)); }
  return { st, hist, s };
}
const avg = (h, k, from) => { const t = h.slice(from); return t.reduce((a, q) => a + q[k], 0) / t.length; };
function check(name, vals, ok, fmt = f2) { const pass = vals.every(ok); console.log((pass ? 'PASS ' : 'FAIL ') + name + '  ' + vals.map(fmt).join(',')); if (!pass) fails++; }
const each = (id, label, days, f) => seeds.map(sd => f(run(id, label, days, sd)));

check('hawkdove Free fights -> hawks > 95%', each('hawkdove', 'Free fights', 300, o => avg(o.hist, 'hawk', 150)), v => v > .95);
check('hawkdove Generous bullies -> hawks 5-15%', each('hawkdove', 'Generous bullies', 300, o => avg(o.hist, 'hawk', 150)), v => v > .05 && v < .15);
check('hawkdove Doves lose all -> hawks > 85%', each('hawkdove', 'Doves lose all', 300, o => avg(o.hist, 'hawk', 150)), v => v > .85);
check('trust Chaos -> cheaters > 90%', each('trust', 'Chaos', 150, o => avg(o.hist, 'alld', 120)), v => v > .9);
check('trust Long games, many cheats -> cheaters < 2%', each('trust', 'Long games, many cheats', 150, o => avg(o.hist, 'alld', 120)), v => v < .02);
check('trust Nice strangers -> cheaters > 90%', each('trust', 'Nice strangers', 150, o => avg(o.hist, 'alld', 120)), v => v > .9);
check('rps Frozen ground -> each type > 20% at day 600', each('rps', 'Frozen ground', 600, o => Math.min(o.hist[599].rock, o.hist[599].scissors, o.hist[599].paper)), v => v > .2);
check('wealth All-in bets -> Gini > 0.9 at day 200', each('wealth', 'All-in bets', 200, o => o.hist[199].gini), v => v > .9);
check('wealth Heavy tax -> Gini 0.15-0.35', each('wealth', 'Heavy tax', 400, o => avg(o.hist, 'gini', 200)), v => v > .15 && v < .35);
check('wealth Rich always win -> Gini > 0.9 at day 200', each('wealth', 'Rich always win', 200, o => o.hist[199].gini), v => v > .9);
check('segregation Wants 60% alike -> like > 90%', each('segregation', 'Wants 60 % alike', 200, o => o.hist[199].like), v => v > .9);
check('segregation Crowded city -> like within 0.05 of a spacious city (empty 30%)', seeds.map(sd => [run('segregation', 'Crowded city', 200, sd).hist[199].like, run('segregation', 'Crowded city', 200, sd, { empty: 30 }).hist[199].like]), ([a, b]) => a > .82 && Math.abs(a - b) < .05, x => x.map(f2).join('/'));
const camps = o => o.s.kpis(o.st)[0].value;
check('opinions Wide open -> 1 camp with > 95% of blobs', each('opinions', 'Wide open', 300, o => [camps(o), o.hist[299].largest]), ([c, l]) => c === 1 && l > .95, x => x[0] + '/' + f2(x[1]));
check('opinions Tiny bubbles -> 8-14 camps', each('opinions', 'Tiny bubbles', 900, camps), v => v >= 8 && v <= 14, String);
check('opinions Many loud -> mean opinion < 0.42 (clearly left of 0.5)', each('opinions', 'Many loud', 900, o => o.hist[899].mean), v => v < .42);
check('commons Fast fish -> stock > 0.25 and income > 0.3 (vs 0.05-0.1 in chapter 2)', each('commons', 'Fast fish', 600, o => [avg(o.hist, 'stock', 200), avg(o.hist, 'income', 200)]), ([s, i]) => s > .25 && i > .3, x => x.map(f2).join('/'));
check('commons All greedy, harsh fine -> greed < 15%, stock > 0.4', each('commons', 'All greedy, harsh fine', 600, o => [avg(o.hist, 'greedy', 200), avg(o.hist, 'stock', 200)]), ([g, s]) => g < .15 && s > .4, x => x.map(f2).join('/'));
check('commons Very tight limit -> stock > 0.8, income < 0.05', each('commons', 'Very tight limit', 600, o => [avg(o.hist, 'stock', 200), avg(o.hist, 'income', 200)]), ([s, i]) => s > .8 && i < .05, x => x.map(f2).join('/'));
check('epidemic Very contagious -> peak infected > 50%', each('epidemic', 'Very contagious', 200, o => Math.max(...o.hist.map(q => q.I))), v => v > .5);
check('epidemic Mild bug -> < 10% ever infected', each('epidemic', 'Mild bug', 200, o => o.st.ever / 360), v => v < .1);
check('epidemic Hard lockdown -> peak < 6%, < 25% ever infected', each('epidemic', 'Hard lockdown', 300, o => [Math.max(...o.hist.map(q => q.I)), o.st.ever / 360]), ([p, e]) => p < .06 && e < .25, x => x.map(f2).join('/'));

console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
