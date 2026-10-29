// Chapter claims for the four newer sims (segregation, rps, opinions, commons), over 3 seeds.
// Run: node app/tests/model2.test.js
require('../js/engine.js');
['segregation', 'rps', 'opinions', 'commons'].forEach(id => require('../js/sims/' + id + '.js'));
const BS = globalThis.BS, sim = id => BS.sims.find(s => s.id === id), f2 = x => x.toFixed(2), seeds = [1, 2, 3];
let fails = 0;
function run(id, set, days, seed) {
  const s = sim(id), p = {}; s.knobs.forEach(k => p[k.id] = k.value); Object.assign(p, set);
  const r = BS.rng(seed), st = s.init(p, r), hist = [];
  for (let d = 0; d < days; d++) { s.step(st, p, r); hist.push(s.metrics(st, p)); }
  return { st, hist };
}
function check(name, ok, detail) { console.log((ok ? 'PASS ' : 'FAIL ') + name + '  ' + detail); if (!ok) fails++; }
const avgFrom = (h, k, from) => { const t = h.slice(from); return t.reduce((a, q) => a + q[k], 0) / t.length; };
const camps = st => sim('opinions').kpis(st)[0].value; // the world's own camp count (tight groups only)

// Segregation
{ const v = seeds.map(sd => run('segregation', { T: 0 }, 150, sd).hist[149].like); check('segregation no preference -> like 45-55%', v.every(x => x > .45 && x < .55), v.map(f2).join(',')); }
{ const v = seeds.map(sd => run('segregation', { T: 30 }, 150, sd).hist[149]); check('segregation wish 30% -> like > 70%, all happy', v.every(q => q.like > .7 && q.unhappy === 0), v.map(q => f2(q.like)).join(',')); }
{ const v = seeds.map(sd => run('segregation', { T: 50 }, 150, sd).hist[149].like); check('segregation wish 50% -> like > 82%', v.every(x => x > .82), v.map(f2).join(',')); }
{ const v = seeds.map(sd => run('segregation', { T: 75 }, 150, sd).hist[149].unhappy); check('segregation wish 75% -> never settles (> 25% unhappy at day 150)', v.every(x => x > .25), v.map(f2).join(',')); }

// Rock-paper-scissors
const ext = h => h.findIndex(q => q.rock === 0 || q.scissors === 0 || q.paper === 0);
{ const v = seeds.map(sd => ext(run('rps', { mixed: 'mixed', move: 1 }, 400, sd).hist)); check('rps well mixed -> a type dies out within 400 days', v.every(x => x >= 0), v.join(',')); }
{ const v = seeds.map(sd => ext(run('rps', { mixed: 'grid', move: 1 }, 800, sd).hist)); check('rps neighbours only -> all three alive at day 800', v.every(x => x < 0), v.join(',')); }
{ const v = seeds.map(sd => ext(run('rps', { mixed: 'grid', move: 12 }, 800, sd).hist)); check('rps fast movers -> a type dies out within 800 days', v.every(x => x >= 0), v.join(',')); }
{ const v = seeds.map(sd => run('rps', { start: 'two' }, 100, sd).hist[99].rock); check('rps rock + scissors only -> rock takes over', v.every(x => x > .7), v.map(f2).join(',')); }

// Echo chambers
{ const v = seeds.map(sd => camps(run('opinions', { eps: .5 }, 900, sd).st)); check('opinions open minds -> 1 camp', v.every(x => x === 1), v.join(',')); }
{ const v = seeds.map(sd => camps(run('opinions', { eps: .2 }, 900, sd).st)); check('opinions narrower -> 2-3 camps', v.every(x => x >= 2 && x <= 3), v.join(',')); }
{ const v = seeds.map(sd => camps(run('opinions', { eps: .08 }, 900, sd).st)); check('opinions closed -> >= 4 camps', v.every(x => x >= 4), v.join(',')); }
{ const v = seeds.map(sd => [run('opinions', { eps: .3, stub: 0 }, 900, sd).hist[899].mean, run('opinions', { eps: .3, stub: 8 }, 900, sd).hist[899].mean]); check('opinions loud few -> mean pulled left by > 0.04 vs same seed without them', v.every(([a, b]) => b < a - .04), v.map(x => x.map(f2).join('->')).join(',')); }

// Commons
{ const v = seeds.map(sd => run('commons', { g0: 0, mut: 0 }, 600, sd).hist); check('commons all gentle -> stock 0.45-0.6, no greed', v.every(h => Math.abs(avgFrom(h, 'stock', 200) - .52) < .08 && avgFrom(h, 'greedy', 200) === 0), v.map(h => f2(avgFrom(h, 'stock', 200))).join(',')); }
{ const v = seeds.map(sd => run('commons', { g0: 1 }, 600, sd).hist); check('commons greed spreads -> stock < 0.35, income < 0.2 (vs 0.72)', v.every(h => avgFrom(h, 'stock', 200) < .35 && avgFrom(h, 'income', 200) < .2), v.map(h => f2(avgFrom(h, 'stock', 200)) + '/' + f2(avgFrom(h, 'income', 200))).join(',')); }
{ const v = seeds.map(sd => run('commons', { g0: 1, quota: .024 }, 600, sd).hist); check('commons catch limit -> stock > 0.5 but income < 0.2', v.every(h => avgFrom(h, 'stock', 200) > .5 && avgFrom(h, 'income', 200) < .2), v.map(h => f2(avgFrom(h, 'stock', 200)) + '/' + f2(avgFrom(h, 'income', 200))).join(',')); }
{ const v = seeds.map(sd => run('commons', { g0: 6, fine: 2.5 }, 600, sd).hist); check('commons fines -> greed < 15%, stock > 0.4, income > 0.4', v.every(h => avgFrom(h, 'greedy', 200) < .15 && avgFrom(h, 'stock', 200) > .4 && avgFrom(h, 'income', 200) > .4), v.map(h => f2(avgFrom(h, 'greedy', 200)) + '/' + f2(avgFrom(h, 'stock', 200))).join(',')); }

console.log(fails ? fails + ' FAILED' : 'ALL PASS');
process.exit(fails ? 1 : 0);
