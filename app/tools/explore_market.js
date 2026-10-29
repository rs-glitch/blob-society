// Parameter sweep for Market Day. Run: node app/tools/explore_market.js
require('../js/engine.js'); require('../js/sims/market.js');
const BS = globalThis.BS, sim = BS.sims.find(s => s.id === 'market');
function run(set, days, seed) {
  const p = {}; sim.knobs.forEach(k => p[k.id] = k.value); Object.assign(p, set);
  const r = BS.rng(seed), st = sim.init(p, r), prices = [], deals = [], gains = [];
  for (let d = 0; d < days; d++) { sim.step(st, p, r); prices.push(st.today ? st.sum / st.today : NaN); deals.push(st.today); gains.push(st.gain); }
  const eq = sim.theory(p, st)[0], from = d => d.slice(100).filter(x => !isNaN(x));
  const avg = a => a.reduce((x, y) => x + y, 0) / a.length;
  return { eq: eq ? eq.value * 12 : NaN, price: avg(from(prices)), early: avg(prices.slice(0, 5).filter(x => !isNaN(x))), deals: avg(deals.slice(100)), q0: st.q0, gain: avg(gains.slice(100)) / st.gmax, st };
}
const cases = { b24_4: { nB: 24, nS: 4 }, b24_3: { nB: 24, nS: 3 }, cap4: { cap: 4 }, cap45: { cap: 4.5 }, s4: {nB:12,nS:4} };
for (const [k, set] of Object.entries(cases)) for (const sd of [1, 2, 3]) {
  const o = run(set, 300, sd);
  console.log(k.padEnd(7), sd, 'eq', o.eq.toFixed(2), 'price', o.price.toFixed(2), 'early', o.early.toFixed(2), 'deals', o.deals.toFixed(2), 'q0', o.q0, 'gain', o.gain.toFixed(2));
}
