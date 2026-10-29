// Sweep: node tools/explore_voting.js  -> per-setting means over 150 elections, 3 seeds
require('../js/engine.js'); require('../js/sims/voting.js');
const BS = globalThis.BS, sim = BS.sims.find(s => s.id === 'voting');
function run(set, days, seed) {
  const p = {}; sim.knobs.forEach(k => p[k.id] = k.value); Object.assign(p, set);
  const r = BS.rng(seed), s = sim.init(p, r);
  for (let d = 0; d < days; d++) sim.step(s, p, r);
  const n = s.n; return { wins: s.wins.map(x => +(x / n).toFixed(2)), cond: +(s.condN / n).toFixed(2) };
}
const cases = [
  { method: 'plurality', scene: 'spoiler' }, { method: 'irv', scene: 'spoiler' },
  { method: 'irv', scene: 'squeeze' }, { method: 'plurality', scene: 'squeeze' },
  { method: 'plurality', scene: 'spoiler', strat: 100 }, { method: 'plurality', scene: 'spoiler', strat: 50 },
  { method: 'approval', scene: 'squeeze', radius: .05 }, { method: 'approval', scene: 'squeeze', radius: .4 }, { method: 'approval', scene: 'squeeze', radius: .5 }, { method: 'approval', scene: 'squeeze', radius: .8 },
  { method: 'approval', scene: 'spoiler', radius: .3 }
];
for (const c of cases) console.log(JSON.stringify(c), [1, 2, 3].map(sd => JSON.stringify(run(c, 150, sd))).join(' | '));
