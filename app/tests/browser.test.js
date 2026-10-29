// Headless Chrome smoke test: no runtime errors, no sideways scroll, chapters sync the knobs, hash routing works.
// Run from the repo root: npm run test:browser [-- screenshot dir]
// Env: CHROME = browser path (default: the first Chrome or Chromium found on macOS, Linux or Windows);
//      PUPPETEER_DIR = folder whose node_modules has puppeteer-core (default: normal resolution); SIMS = comma-separated world ids.
const path = require('path'), fs = require('fs'), os = require('os');
const puppeteer = require(process.env.PUPPETEER_DIR ? path.join(process.env.PUPPETEER_DIR, 'node_modules', 'puppeteer-core') : 'puppeteer-core');
const CHROME = process.env.CHROME || [
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
].find(p => fs.existsSync(p));
if (!CHROME) { console.error('No Chrome found. Set CHROME to your browser path.'); process.exit(1); }
const root = path.resolve(__dirname, '..');
const shots = process.argv[2] || path.join(os.tmpdir(), 'blob-society-shots');
const page0 = 'file:///' + path.join(root, 'index.html').split(path.sep).join('/').replace(/^\/+/, '');
const url = id => page0 + '?s=' + id + '#' + id;

(async () => {
  fs.mkdirSync(shots, { recursive: true });
  const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, protocolTimeout: 600000, args: ['--allow-file-access-from-files', '--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errors = [], issues = [];
  const fail = msg => issues.push(msg);
  const sims = (process.env.SIMS || 'hawkdove,trust,rps,wealth,segregation,opinions,commons,natsel,market,voting,epidemic').split(',');
  const sizes = [['desk', 1440, 900], ['tab', 820, 1180], ['phone', 390, 844]];
  for (const scheme of ['light', 'dark']) for (const [tag, w, h] of sizes) {
    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(120000); // software WebGL is slow when other tests share the CPU
    page.on('console', m => { if (m.type() === 'error') errors.push(`${scheme}/${tag}: ${m.text()}`); });
    page.on('pageerror', e => errors.push(`${scheme}/${tag}: ${e.message}`));
    await page.emulateMediaFeatures([{ name: 'prefers-color-scheme', value: scheme }]);
    await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
    for (const id of sims) {
      const where = `${scheme}/${tag}/${id}`;
      await page.goto(url(id), { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      if (await page.evaluate(() => window.__bs.sim.id) !== id) fail(`${where}: page shows another sim`);
      await page.evaluate(() => window.__bs.step(60));
      await new Promise(r => setTimeout(r, 400));
      const ov = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (ov > 0) fail(`${where}: page scrolls sideways by ${ov}px`);
      // The 3D world must draw something: sample the canvas and require several distinct colours.
      const shades = await page.evaluate(() => {
        const gl = document.getElementById('gl'), c = document.createElement('canvas'); c.width = 64; c.height = 48;
        window.__bs.R.renderer.render(window.__bs.R.scene, window.__bs.R.camera);
        const x = c.getContext('2d'); x.drawImage(gl, 0, 0, 64, 48);
        const d = x.getImageData(0, 0, 64, 48).data, seen = new Set();
        for (let i = 0; i < d.length; i += 4) seen.add((d[i] >> 4) + ',' + (d[i + 1] >> 4) + ',' + (d[i + 2] >> 4));
        return seen.size;
      });
      if (shades < 8) fail(`${where}: 3D world looks blank (${shades} colours)`);
      const empty = await page.evaluate(() => ['kpis', 'insight', 'chapters', 'knobs', 'story'].filter(i => !document.getElementById(i).textContent.trim()));
      if (empty.length) fail(`${where}: empty ${empty.join(',')}`);
      await page.screenshot({ path: path.join(shots, `${id}-${tag}-${scheme}.png`) });
      if (scheme === 'light' && tag === 'desk') {
        for (let c = 0; c < 4; c++) {
          const r = await page.evaluate(i => {
            window.__bs.goChapter(i); window.__bs.step(150);
            const ch = window.__bs.sim.chapters[i], P = window.__bs.params;
            const knobsOk = Object.entries(ch.set).every(([k, v]) => String(document.getElementById('k-' + k).value) === String(v) && P[k] === v);
            const cur = document.querySelector('#chapters [aria-current="step"]');
            return { knobsOk, current: cur && cur.dataset.i, story: document.getElementById('story').textContent === ch.text };
          }, c);
          if (!r.knobsOk || r.current !== String(c) || !r.story) fail(`${where}: chapter ${c + 1} out of sync ${JSON.stringify(r)}`);
        }
        const pres = await page.evaluate(() => (window.__bs.sim.presets || []).map((q, i) => {
          document.querySelector('#presets .chip[data-i="' + i + '"]').click();
          const P = window.__bs.params, ok = Object.entries(q.set).every(([k, v]) => String(document.getElementById('k-' + k).value) === String(v) && P[k] === v);
          return ok && document.getElementById('story').textContent === q.note && document.getElementById('chapCount').textContent === 'Edge case';
        }));
        if (pres.some(x => !x)) fail(`${where}: preset out of sync ${JSON.stringify(pres)}`);
        const freeOk = await page.evaluate(() => {
          const el = document.querySelector('#knobs input[type=range]');
          el.value = el.min; el.dispatchEvent(new Event('input'));
          return document.getElementById('chapCount').textContent === 'Free play' && !document.querySelector('#chapters [aria-current]');
        });
        if (!freeOk) fail(`${where}: knob change does not switch to free play`);
      }
    }
    if (scheme === 'light' && tag === 'desk') {
      await page.evaluate(() => { location.hash = '#wealth'; });
      await new Promise(r => setTimeout(r, 200));
      if (await page.evaluate(() => window.__bs.sim.id) !== 'wealth') fail('hash change does not switch the sim');
      // Theme switch, then a world switch: the palette must follow and the world must still draw.
      const themed = await page.evaluate(async () => {
        const before = getComputedStyle(document.documentElement).getPropertyValue('--paper').trim();
        document.documentElement.dataset.theme = 'dark';
        await new Promise(r => setTimeout(r, 100));
        window.__bs.select('opinions'); window.__bs.step(5);
        return { changed: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim() !== before, id: window.__bs.sim.id };
      });
      if (!themed.changed || themed.id !== 'opinions') fail('theme switch then world switch failed ' + JSON.stringify(themed));
    }
    await page.close();
  }
  await browser.close();
  errors.forEach(e => console.log('ERROR ' + e));
  issues.forEach(e => console.log('ISSUE ' + e));
  console.log(`${errors.length} errors, ${issues.length} issues, screenshots in ${shots}`);
  process.exit(errors.length || issues.length ? 1 : 0);
})();
