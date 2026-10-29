// Chapter and preset claims for Market Day, over 3 seeds. Run: node app/tests/model_market.test.js
require('../js/engine.js'); require('../js/sims/market.js');
const BS = globalThis.BS, sim = BS.sims.find(s => s.id === 'market'), f2 = x => x.toFixed(2), seeds = [1, 2, 3];
let fails = 0;
const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
function run(set, days, seed) {
  const p = {}; sim.knobs.forEach(k => p[k.id] = k.value); Object.assign(p, set);
  const r = BS.rng(seed), st = sim.init(p, r), price = [], deals = [], dp = [];
  for (let d = 0; d < days; d++) { sim.step(st, p, r); price.push(st.today ? st.sum / st.today : NaN); deals.push(st.today); dp.push(st.pairs.filter(q => q.deal).map(q => q.price)); }
  const eq = sim.theory(p, st)[0].value * 12, ok = a => a.filter(x => !isNaN(x));
  const sd = (a, b) => { const x = dp.slice(a, b).flat(), m = avg(x); return Math.sqrt(avg(x.map(y => (y - m) ** 2))); };
  return { st, eq, sd, price, deals, late: avg(ok(price.slice(40))), dealsLate: avg(deals.slice(40)) };
}
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + '  ' + detail); if (!ok) fails++; }
const chap = i => sim.chapters[i].set, pre = i => sim.presets[i].set;

// Chapter 1: prices converge to the balance price
{ const v = seeds.map(sd => run(chap(0), 300, sd)); check('ch1 late price within $0.5 of balance price', v.every(o => Math.abs(o.late - o.eq) < .5), v.map(o => f2(o.late) + '/' + f2(o.eq)).join(',')); }
// Chapter 2: more buyers than sellers
{ const v = seeds.map(sd => run(chap(1), 300, sd)); check('ch2 price above $6.5', v.every(o => o.late > 6.5), v.map(o => f2(o.late)).join(',')); }
// Chapter 3: tax
{ const v = seeds.map(sd => [run(chap(0), 300, sd), run(chap(2), 300, sd)]);
  check('ch3 buyers pay more with tax', v.every(([a, b]) => b.late > a.late + .3), v.map(([a, b]) => f2(a.late) + '->' + f2(b.late)).join(','));
  check('ch3 sellers keep less with tax', v.every(([a, b]) => b.late - 2 < a.late - .5), v.map(([a, b]) => f2(a.late) + '->' + f2(b.late - 2)).join(','));
  check('ch3 deals per day fall by > 0.5', v.every(([a, b]) => b.dealsLate < a.dealsLate - .5), v.map(([a, b]) => f2(a.dealsLate) + '->' + f2(b.dealsLate)).join(',')); }
// Chapter 4: price cap
{ const v = seeds.map(sd => [run(chap(0), 300, sd), run(chap(3), 300, sd)]);
  check('ch4 price at or below cap', v.every(([, b]) => b.late <= 4.001), v.map(([, b]) => f2(b.late)).join(','));
  check('ch4 deals per day fall by > 0.7', v.every(([a, b]) => b.dealsLate < a.dealsLate - .7), v.map(([a, b]) => f2(a.dealsLate) + '->' + f2(b.dealsLate)).join(','));
  const sh = v.map(([, b]) => [b.st.buyers.filter(x => x.v >= 4).length, b.st.sellers.filter(x => x.c <= 4).length]);
  check('ch4 shortage: buyers who want to buy exceed sellers willing by >= 3', sh.every(([d, s]) => d >= s + 3), sh.map(x => x.join(' vs ')).join(',')); }
// Presets
{ const v = seeds.map(sd => run(pre(0), 300, sd)); check('preset huge tax -> deals < 20% of possible', v.every(o => o.dealsLate / o.st.q0 < .2), v.map(o => f2(o.dealsLate / o.st.q0)).join(',')); }
{ const v = seeds.map(sd => run(pre(1), 300, sd)); check('preset tiny cap -> deals < 25% of possible', v.every(o => o.dealsLate / o.st.q0 < .25), v.map(o => f2(o.dealsLate / o.st.q0)).join(',')); }
{ const v = seeds.map(sd => run(pre(2), 300, sd)); check('preset three stalls -> < 1 deal/day, price > $6', v.every(o => o.dealsLate < 1 && o.late > 6), v.map(o => f2(o.dealsLate) + '/' + f2(o.late)).join(',')); }
// Same seed, same run; slider steps hit every chapter and preset value
{ const a = run({}, 50, 7), b = run({}, 50, 7); check('same seed -> same run', JSON.stringify(a.price) === JSON.stringify(b.price), ''); }
{ const bad = [...sim.chapters, ...sim.presets].flatMap(c => Object.entries(c.set).filter(([k, val]) => { const kn = sim.knobs.find(x => x.id === k); return !kn || val < kn.min || val > kn.max || Math.abs((val - kn.min) / kn.step - Math.round((val - kn.min) / kn.step)) > 1e-9; })); check('slider steps hit all set values', !bad.length, JSON.stringify(bad)); }

console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
