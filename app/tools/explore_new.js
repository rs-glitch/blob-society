// Sweeps for the four newer sims. Run: node app/tools/explore_new.js
require('../js/engine.js');
['segregation', 'rps', 'opinions', 'commons'].forEach(id => require('../js/sims/' + id + '.js'));
const BS = globalThis.BS, sim = id => BS.sims.find(s => s.id === id), f2 = x => x.toFixed(2);
function run(id, set, days, seed) {
  const s = sim(id), p = {}; s.knobs.forEach(k => p[k.id] = k.value); Object.assign(p, set);
  const r = BS.rng(seed), st = s.init(p, r), hist = [];
  for (let d = 0; d < days; d++) { s.step(st, p, r); hist.push(s.metrics(st, p)); }
  return { st, hist, p, s };
}
console.log('--- segregation like/unhappy at day 150');
for (const T of [0, 30, 50, 75]) console.log('T', T, [1, 2, 3].map(sd => { const h = run('segregation', { T }, 150, sd).hist; return f2(h[149].like) + '/' + f2(h[149].unhappy); }).join('  '));
console.log('--- rps: day of first extinction (or alive at end) + min share');
for (const [mixed, move, start] of [['mixed', 1, 'three'], ['grid', 1, 'three'], ['grid', 12, 'three'], ['grid', 1, 'two']]) {
  console.log(mixed, move, start, [1, 2, 3].map(sd => { const { hist } = run('rps', { mixed, move, start }, 800, sd); const ext = hist.findIndex(q => q.rock === 0 || q.scissors === 0 || q.paper === 0); const l = hist[799]; return (ext < 0 ? 'alive' : 'ext@' + ext) + ' end ' + [l.rock, l.scissors, l.paper].map(f2).join('/'); }).join(' | '));
}
console.log('--- opinions: camps / largest / mean at day 300');
for (const [eps, stub] of [[.5, 0], [.2, 0], [.08, 0], [.3, 5]]) {
  const camps = o => { o = o.slice().sort((a, b) => a - b); let g = [], st = 0; for (let i = 1; i <= o.length; i++) if (i === o.length || o[i] - o[i - 1] > .05) { g.push(i - st); st = i; } return g.filter(n => n >= 160 * .03).length; };
  console.log('eps', eps, 'stub', stub, [1, 2, 3].map(sd => { const { st, hist } = run('opinions', { eps, stub }, 300, sd); return camps(st.blobs.map(b => b.o)) + '/' + f2(hist[299].largest) + '/' + f2(hist[299].mean); }).join('  '));
}
console.log('--- commons: stock / greedy / income at day 100, 300, 600');
for (const set of [{ g0: 0, mut: 0 }, { g0: 1 }, { g0: 1, quota: .024 }, { g0: 6, fine: 2.5 }]) {
  console.log(JSON.stringify(set), [1, 2, 3].map(sd => { const h = run('commons', set, 600, sd).hist.slice(200), a = k => h.reduce((x, q) => x + q[k], 0) / h.length; return 'avg ' + f2(a('stock')) + '/' + f2(a('greedy')) + '/' + f2(a('income')); }).join('  |  '));
}
