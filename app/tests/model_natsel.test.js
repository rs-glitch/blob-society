// Chapter and preset claims for Natural Selection, over 3 seeds. Values are means over the last 60 of 200 days.
// Run: node app/tests/model_natsel.test.js
require('../js/engine.js');
require('../js/sims/natsel.js');
const BS = globalThis.BS, sim = BS.sims.find(s => s.id === 'natsel'), f2 = x => x.toFixed(2), seeds = [1, 2, 3], DAYS = 200, TM = 2.5, CAP = 400;
let fails = 0;
function run(set, seed, days = DAYS) {
  const p = {}; sim.knobs.forEach(k => p[k.id] = k.value); Object.assign(p, set);
  const r = BS.rng(seed), st = sim.init(p, r), h = [];
  for (let d = 0; d < days; d++) { sim.step(st, p, r); h.push(sim.metrics(st, p)); }
  return { st, h };
}
const avg = (h, k) => { const t = h.slice(-60); return t.reduce((a, q) => a + q[k], 0) / t.length * (k === 'pop' ? CAP : TM); };
const vals = (set, k) => seeds.map(sd => avg(run(set, sd).h, k));
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + '  ' + detail); if (!ok) fails++; }
const chap = i => sim.chapters[i].set, show = v => v.map(f2).join(',');

{ const v = vals(chap(0), 'speed'), w = vals({ ...chap(0), cost: 0 }, 'speed'); check('ch1 speed rises (> 1.15) but stays below 1.7 and far under the free-speed run', v.every((x, i) => x > 1.15 && x < 1.7 && x < w[i] - .5), show(v) + ' vs free ' + show(w)); }
{ const v = vals(chap(1), 'speed'); check('ch2 free speed -> mean speed > 2.0', v.every(x => x > 2), show(v)); }
{ const v = vals(chap(2), 'size'); check('ch3 size rises (> 1.3)', v.every(x => x > 1.3), show(v)); }
{ const prey = seeds.map(sd => { const p = { ...chap(2), food: 100, mut: 10, cost: 1 }, r = BS.rng(sd), st = sim.init(p, r); let n = 0; for (let d = 0; d < 150; d++) { sim.step(st, p, r); n += st.act.reduce((a, q) => a + q.prey, 0); } return n; }); check('ch3 big blobs eat small blobs (> 100 blobs eaten in 150 days)', prey.every(x => x > 100), prey.join(',')); }
{ const v = vals(chap(3), 'sense'), w = vals({ ...chap(3), cost: 3 }, 'sense'); check('ch4 sense rises (> 1.6); at trait cost 3.0 it ends > 0.3 lower', v.every((x, i) => x > 1.6 && w[i] < x - .3), show(v) + ' vs cost3 ' + show(w)); }

const pre = sim.presets, P = i => pre[i].set;
{ const v = ['speed', 'size', 'sense'].map(k => vals(P(0), k)); check('preset ' + pre[0].label + ' -> every mean trait = 1.00', v.every(a => a.every(x => Math.abs(x - 1) < 1e-9)), v.map(show).join(' | ')); }
{ const v = vals(P(1), 'pop'); check('preset ' + pre[1].label + ' -> population > 180', v.every(x => x > 180), show(v)); }
{ const v = vals(P(2), 'pop'), s = vals(P(2), 'speed'); check('preset ' + pre[2].label + ' -> population < 10, speed < 1.2', v.every(x => x < 10) && s.every(x => x < 1.2), show(v) + ' speed ' + show(s)); }

console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
