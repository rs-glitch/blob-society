// Parameter sweeps used to set honest chapter values. Run: node app/tools/explore.js
require('../js/engine.js'); ['hawkdove', 'trust', 'wealth', 'epidemic'].forEach(id => require('../js/sims/' + id + '.js'));
const BS = globalThis.BS, sim = id => BS.sims.find(s => s.id === id);
function run(id, set, days, seed) {
  const s = sim(id), p = {}; s.knobs.forEach(k => p[k.id] = k.value); Object.assign(p, set);
  const r = BS.rng(seed), st = s.init(p, r), hist = [];
  for (let d = 0; d < days; d++) { s.step(st, p, r); hist.push(s.metrics(st, p)); }
  return { st, hist };
}
const f2 = x => x.toFixed(2);
console.log('--- trust: final shares allc/alld/tft/grudge/gtft (3 seeds)');
for (const mix of ['even', 'nice'])
  for (const noise of [0, 2, 5, 10, 15]) {
    const o = [1, 2, 3].map(sd => { const l = run('trust', { rounds: 10, noise, mix }, 150, sd).hist.slice(-1)[0]; return ['allc', 'alld', 'tft', 'grudge', 'gtft'].map(k => f2(l[k])).join('/'); });
    console.log(mix, 'noise', noise, '|', o.join('  '));
  }
console.log('--- epidemic: R0 / ever infected (3 seeds)');
for (const beta of [35, 50, 70, 90]) {
  const o = [1, 2, 3].map(sd => { const { st } = run('epidemic', { beta }, 300, sd); return f2(st.r0) + '/' + f2(st.ever / 360); });
  console.log('beta', beta, '|', o.join('  '));
}
console.log('--- hawkdove cost .75: hawk share per 100 days, seed 2, trees 70 vs 110');
for (const sites of [70, 110]) {
  const h = run('hawkdove', { cost: .75, h0: 10, sites }, 600, 2).hist;
  console.log(sites, [100, 200, 300, 400, 500, 599].map(d => f2(h[d].hawk) + '(' + h[d].n + ')').join(' '));
}
