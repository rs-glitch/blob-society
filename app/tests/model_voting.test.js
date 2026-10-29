// Chapter and preset claims for Election Day, over 3 seeds and 150 elections each.
// Run: node app/tests/model_voting.test.js
require('../js/engine.js'); require('../js/sims/voting.js');
const BS = globalThis.BS, sim = BS.sims.find(s => s.id === 'voting'), seeds = [1, 2, 3], f2 = x => x.toFixed(2);
let fails = 0;
function run(set, days, seed) {
  const p = {}; sim.knobs.forEach(k => p[k.id] = k.value); Object.assign(p, set);
  const r = BS.rng(seed), s = sim.init(p, r), log = [s.res];
  for (let d = 0; d < days; d++) { sim.step(s, p, r); log.push(s.res); }
  const n = log.length, avg = k => log.reduce((a, q) => a + q[k], 0) / n;
  return { wins: s.wins.map(x => x / n), cond: s.condN / n, support: avg('support'), first: avg('first'), minSupport: Math.min(...log.map(q => q.support)), log };
}
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + '  ' + detail); if (!ok) fails++; }
const all = (set, test, show) => { const v = seeds.map(sd => run(set, 150, sd)); return [v.every(test), v.map(show).join(' | ')]; };
const ch = i => sim.chapters[i].set, pr = i => sim.presets[i].set;

// chapters
let [ok, d] = all(ch(0), v => v.wins[2] > .9 && v.cond < .1 && v.first < .5, v => 'Cy wins ' + f2(v.wins[2]) + ', first-choice ' + f2(v.first));
check('ch1 plurality spoiler: Cy wins > 90%, never the favourite of most voters (first < 50%), beaten one-on-one', ok, d);
[ok, d] = all(ch(1), v => v.wins[1] > .9 && v.cond > .9, v => 'Ben wins ' + f2(v.wins[1]));
check('ch2 instant runoff: Ben wins > 90% and is the one-on-one winner', ok, d);
[ok, d] = all(ch(2), v => v.wins[1] === 0 && v.cond === 0 && v.log.every(q => q.rounds[0].out === 1 && q.cw === 1), v => 'Mo wins ' + f2(v.wins[1]) + ', cond ' + f2(v.cond));
check('ch3 squeeze under instant runoff: Mo is the one-on-one winner, out in round 1, never wins', ok, d);
[ok, d] = all(ch(3), v => v.wins[2] < .05 && v.wins[1] > .75, v => 'Ann ' + f2(v.wins[0]) + ' Ben ' + f2(v.wins[1]) + ' Cy ' + f2(v.wins[2]));
check('ch4 tactical voters: Cy wins < 5%, Ben wins > 75%', ok, d);

// presets
[ok, d] = all(pr(0), v => v.wins[1] < .05, v => 'Mo wins ' + f2(v.wins[1]));
check('preset tiny radius: Mo wins < 5%', ok, d);
[ok, d] = all(pr(1), v => v.minSupport > .99 && v.wins.every(w => w > .15), v => 'min support ' + f2(v.minSupport) + ', wins ' + v.wins.map(f2).join('/'));
check('preset huge radius: support always ~100%, each candidate wins > 15%', ok, d);
[ok, d] = all(pr(2), v => v.wins[1] > .95, v => 'Mo wins ' + f2(v.wins[1]));
check('preset wide approval: Mo wins > 95%', ok, d);

// sliders hit every chapter and preset value
const hit = (k, v) => { const kn = sim.knobs.find(x => x.id === k); return kn.type === 'select' ? kn.options.some(o => o[0] === v) : Math.abs((v - kn.min) / kn.step - Math.round((v - kn.min) / kn.step)) < 1e-9 && v >= kn.min && v <= kn.max; };
const bad = [...sim.chapters, ...sim.presets].flatMap(c => Object.entries(c.set).filter(([k, v]) => !hit(k, v)));
check('slider steps hit all chapter and preset values', !bad.length, JSON.stringify(bad));

console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
