// Sweeps candidate edge-case presets for the 8 original worlds. Run: node app/tools/explore_presets.js
require('../js/engine.js');
['hawkdove', 'trust', 'rps', 'wealth', 'segregation', 'opinions', 'commons', 'epidemic'].forEach(id => require('../js/sims/' + id + '.js'));
const BS = globalThis.BS, sim = id => BS.sims.find(s => s.id === id), f2 = x => (+x).toFixed(2);
function run(id, set, days, seed) {
  const s = sim(id), p = {}; s.knobs.forEach(k => p[k.id] = k.value); Object.assign(p, set);
  const r = BS.rng(seed), st = s.init(p, r), hist = [];
  for (let d = 0; d < days; d++) { s.step(st, p, r); hist.push(s.metrics(st, p)); }
  return { st, hist };
}
const avg = (h, k, from) => { const t = h.slice(from); return t.reduce((a, q) => a + q[k], 0) / t.length; };
const show = (id, set, days, f) => console.log(id.padEnd(11), JSON.stringify(set).padEnd(42), [1, 2, 3].map(sd => f(run(id, set, days, sd))).join('  |  '));

show('hawkdove', { cost: .1 }, 300, o => f2(avg(o.hist, 'hawk', 150)));
show('hawkdove', { keep: .9, cost: 1 }, 300, o => f2(avg(o.hist, 'hawk', 150)));
show('hawkdove', { keep: 0, cost: 1 }, 300, o => f2(avg(o.hist, 'hawk', 150)));
show('trust', { noise: 20 }, 150, o => f2(avg(o.hist, 'coop', 120)) + ' alld ' + f2(avg(o.hist, 'alld', 120)));
show('trust', { rounds: 30, mix: 'mean' }, 150, o => f2(avg(o.hist, 'coop', 120)) + ' alld ' + f2(avg(o.hist, 'alld', 120)));
show('trust', { rounds: 1, mix: 'nice' }, 150, o => f2(avg(o.hist, 'coop', 120)) + ' alld ' + f2(avg(o.hist, 'alld', 120)));
show('rps', { move: 0 }, 600, o => { const l = o.hist[599]; return [l.rock, l.scissors, l.paper].map(f2).join('/'); });
show('rps', { mixed: 'mixed', move: 12 }, 300, o => o.hist.findIndex(q => !q.rock || !q.scissors || !q.paper));
show('wealth', { bet: 40 }, 200, o => f2(o.hist[199].gini));
show('wealth', { tax: 5 }, 400, o => f2(avg(o.hist, 'gini', 200)));
show('wealth', { edge: 10 }, 200, o => f2(o.hist[199].gini) + ' top1 ' + f2(o.hist[199].top1));
show('segregation', { T: 50, empty: 5 }, 200, o => f2(o.hist[199].like) + '/' + f2(o.hist[199].unhappy));
show('segregation', { T: 50, empty: 30 }, 200, o => f2(o.hist[199].like) + '/' + f2(o.hist[199].unhappy));
show('segregation', { T: 60, empty: 10 }, 200, o => f2(o.hist[199].like) + '/' + f2(o.hist[199].unhappy));
const camps = st => { const o = st.blobs.map(b => b.o).sort((a, b) => a - b); let g = [], s0 = 0; for (let i = 1; i <= o.length; i++) if (i === o.length || o[i] - o[i - 1] > .05) { g.push(i - s0); s0 = i; } return g.filter(n => n >= o.length * .03).length; };
show('opinions', { eps: .6 }, 300, o => camps(o.st) + ' camps, day1camp ' + o.hist.findIndex(q => q.largest > .97));
show('opinions', { eps: .04 }, 900, o => camps(o.st) + ' camps');
show('opinions', { eps: .3, stub: 15 }, 900, o => f2(o.hist[899].mean));
show('commons', { regrow: .2 }, 600, o => f2(avg(o.hist, 'stock', 200)) + '/' + f2(avg(o.hist, 'income', 200)));
show('commons', { g0: 12, fine: 4 }, 600, o => f2(avg(o.hist, 'greedy', 200)) + '/' + f2(avg(o.hist, 'stock', 200)));
show('commons', { quota: .01 }, 600, o => f2(avg(o.hist, 'stock', 200)) + '/' + f2(avg(o.hist, 'income', 200)));
show('epidemic', { beta: 90 }, 200, o => 'ever ' + f2(o.st.ever / 360) + ' peak ' + f2(Math.max(...o.hist.map(q => q.I))) + ' r0 ' + f2(o.st.r0));
show('epidemic', { vax: 90 }, 200, o => 'ever ' + f2(o.st.ever / 360));
show('epidemic', { dist: 90 }, 300, o => 'ever ' + f2(o.st.ever / 360) + ' peak ' + f2(Math.max(...o.hist.map(q => q.I))));
show('epidemic', { beta: 10 }, 200, o => 'ever ' + f2(o.st.ever / 360));
