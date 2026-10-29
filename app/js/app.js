// UI shell: sim picker, story chapters, knobs, play loop, chart and readouts.
// The shell only reads sim fields; it has no per-sim branches. Started by js/main.js once the 3D world exists.
BS.startApp = function (R) {
  const $ = id => document.getElementById(id);
  const sims = BS.sims;
  const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const chart = new BS.Chart($('chart'), $('tip'));
  const SPEEDS = [.25, .5, 1, 2, 3, 5, 8, 12, 20]; // days per second; slowest = 4 s per day
  let sim, P, S, rng, seed = 1, hist = [], playing = !still, speed = 1, acc = 1, last = 0, lastUi = 0;
  let frozen = false; // set by the test hook frame(t)
  let chapter = 0, free = false, preset = -1, legendKey = '', keepRunning = false, slowUntil = 0;

  BS.readPal();

  // ---- sim picker (ARIA tabs)
  $('tabs').innerHTML = sims.map(s => `<button class="tab" role="tab" id="tab-${s.id}" data-id="${s.id}" aria-controls="panel" aria-selected="false" style="--ta:var(${s.accent})"><canvas aria-hidden="true"></canvas><b>${s.name}</b><small>${s.question}</small></button>`).join('');
  function paintTabIcons() {
    document.querySelectorAll('.tab canvas').forEach((cv, i) => {
      const { ctx, w, h } = BS.fit(cv);
      ctx.clearRect(0, 0, w, h);
      BS.icon(ctx, w / 2, h / 2 - 1, Math.min(w, h) * .4, BS.col(sims[i].accent), { angry: sims[i].iconAngry });
    });
  }
  $('tabs').addEventListener('click', e => { const b = e.target.closest('.tab'); if (b) select(b.dataset.id, true); });
  $('tabs').addEventListener('keydown', e => {
    const i = sims.indexOf(sim), keys = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: sims.length - 1 };
    if (!(e.key in keys)) return;
    const j = (keys[e.key] + sims.length) % sims.length;
    select(sims[j].id, true); $('tab-' + sims[j].id).focus(); e.preventDefault();
  });
  addEventListener('hashchange', () => { const id = location.hash.slice(1); if (sim && id !== sim.id && sims.some(s => s.id === id)) select(id, false); });

  function select(id, userAction) {
    sim = sims.find(s => s.id === id) || sims[0];
    if (userAction) { try { history.replaceState(null, '', '#' + sim.id); } catch (_) { /* sandboxed frame: routing is optional */ } }
    document.querySelectorAll('.tab').forEach(t => { const on = t.dataset.id === sim.id; t.setAttribute('aria-selected', on); t.tabIndex = on ? 0 : -1; });
    $('tab-' + sim.id).scrollIntoView({ block: 'nearest', inline: 'nearest' });
    $('panel').setAttribute('aria-labelledby', 'tab-' + sim.id);
    document.documentElement.style.setProperty('--accent', `var(${sim.accent})`);
    document.body.dataset.biome = sim.biome || 'meadow';
    R.setBiome(sim.biome || 'meadow', sims.indexOf(sim) * 7919 + 13);
    $('topic').textContent = sim.topic;
    const hook = sim.hook || [sim.question, ''];
    $('question').textContent = hook[0];
    $('hookTopic').textContent = sim.name; $('hookTitle').textContent = hook[0]; $('hookKick').textContent = hook[1];
    $('source').textContent = sim.source;
    $('legend').innerHTML = sim.legend.map(l => `<span><i style="background:var(${l.color})"></i>${l.label}</span>`).join('');
    legendKey = '';
    $('chapters').innerHTML = sim.chapters.map((c, i) => `<li><button data-i="${i}"><span class="n">${i + 1}</span><b>${c.title}</b></button></li>`).join('');
    $('progress').innerHTML = sim.chapters.map(() => '<i></i>').join('');
    $('extraBox').hidden = !sim.extraTitle;
    $('extraTitle').textContent = sim.extraTitle || '';
    $('extra').hidden = !sim.extraDraw;
    $('extraHTML').innerHTML = '';
    P = {}; sim.knobs.forEach(k => P[k.id] = k.value);
    const ps = sim.presets || [];
    $('presets').innerHTML = ps.map((q, i) => `<button class="chip" data-i="${i}" aria-pressed="false">${q.label}</button>`).join('');
    $('presetsBox').hidden = $('edgeBtn').hidden = !ps.length;
    buildKnobs();
    goChapter(0, false);
  }

  // ---- chapters
  $('chapters').addEventListener('click', e => { const b = e.target.closest('button'); if (b) goChapter(+b.dataset.i, true); });
  $('prev').onclick = () => goChapter(Math.max(0, chapter - (free ? 0 : 1)), true);
  $('next').onclick = () => goChapter(Math.min(sim.chapters.length - 1, chapter + 1), true);
  function goChapter(i, announce) {
    chapter = i; free = false; preset = -1;
    P = {}; sim.knobs.forEach(k => P[k.id] = k.value); // chapters start from defaults, so the tested settings apply
    Object.assign(P, sim.chapters[i].set);
    syncKnobs();
    showChapter();
    reset();
    if (!still) setPlaying(true);
    if (announce) $('status').textContent = 'Chapter ' + (i + 1) + ': ' + sim.chapters[i].title;
    showHook(i === 0);
  }
  // Title card: the world's hook, large over the island at chapter 1; it fades after a few seconds or at the first touch.
  let hookTimer = 0;
  function showHook(on) {
    clearTimeout(hookTimer);
    document.body.classList.toggle('hooked', on);
    if (on) hookTimer = setTimeout(() => showHook(false), 5200);
  }
  $('gl').addEventListener('pointerdown', () => showHook(false));
  // Edge-case presets: start from defaults, apply the preset, restart; the story bar shows the preset's note.
  $('presets').addEventListener('click', e => {
    const b = e.target.closest('.chip'); if (!b) return;
    const q = sim.presets[+b.dataset.i];
    P = {}; sim.knobs.forEach(k => P[k.id] = k.value); Object.assign(P, q.set);
    syncKnobs(); free = true; preset = +b.dataset.i; showChapter(); reset();
    if (!still) setPlaying(true);
    $('status').textContent = 'Edge case: ' + q.label;
    if (matchMedia('(max-width: 900px)').matches) setDrawer(false); // the drawer covers the world on phones
  });
  $('edgeBtn').onclick = () => { setDrawer(true); const c = $('presets').querySelector('.chip'); if (c) c.focus(); };
  function showChapter() {
    const c = sim.chapters[chapter], n = sim.chapters.length, q = preset >= 0 && sim.presets[preset];
    document.querySelectorAll('#presets .chip').forEach((el, j) => el.setAttribute('aria-pressed', j === preset));
    if (q) { $('chapCount').textContent = 'Edge case'; $('chapTitle').textContent = q.label; $('story').textContent = q.note; $('prev').disabled = false; $('next').disabled = chapter === n - 1; return; }
    $('chapCount').textContent = free ? 'Free play' : 'Chapter ' + (chapter + 1) + ' of ' + n;
    $('chapTitle').textContent = free ? 'Your own settings' : c.title;
    $('story').textContent = free ? 'You changed a knob, so chapter ' + (chapter + 1) + ' settings no longer apply. Press Back to return to it, or Next for chapter ' + Math.min(n, chapter + 2) + '.' : c.text;
    $('prev').disabled = !free && chapter === 0;
    $('next').disabled = chapter === n - 1;
    $('progress').querySelectorAll('i').forEach((el, j) => el.classList.toggle('on', j <= chapter));
    document.querySelectorAll('#chapters button').forEach((b, j) => { if (j === chapter && !free) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current'); });
  }

  // ---- knobs
  function buildKnobs() {
    $('knobs').innerHTML = sim.knobs.map(k => {
      const id = 'k-' + k.id, mark = k.reset ? ' <span aria-hidden="true">↺</span><span class="sr">(restarts the run)</span>' : '';
      const input = k.type === 'select'
        ? `<select id="${id}">${k.options.map(([v, l]) => `<option value="${v}">${l}</option>`).join('')}</select>`
        : `<input type="range" id="${id}" min="${k.min}" max="${k.max}" step="${k.step}">`;
      return `<div class="knob"><div class="row"><label for="${id}">${k.label}${mark}</label>${k.type === 'select' ? '' : `<output id="${id}-o" for="${id}"></output>`}</div>${input}${k.hint ? `<small>${k.hint}</small>` : ''}</div>`;
    }).join('');
    sim.knobs.forEach(k => {
      $('k-' + k.id).addEventListener('input', e => {
        P[k.id] = k.type === 'select' ? e.target.value : +e.target.value;
        showKnob(k);
        if (!free || preset >= 0) { free = true; preset = -1; showChapter(); }
        if (k.reset) reset(); else updateUi(true);
      });
    });
  }
  function showKnob(k) { if (k.type !== 'select') $('k-' + k.id + '-o').textContent = k.fmt(P[k.id]); }
  function syncKnobs() { sim.knobs.forEach(k => { $('k-' + k.id).value = P[k.id]; showKnob(k); }); }

  // ---- run control
  function reset() {
    keepRunning = false; hideBanner();
    rng = BS.rng(seed);
    S = sim.init(P, rng);
    hist = [];
    record();
    acc = 1;
    $('seed').textContent = seed;
    updateUi(true);
  }
  function record() {
    hist.push(Object.assign({ t: S.day }, sim.metrics(S, P)));
    if (hist.length > 3000) hist = hist.filter((_, i) => i % 2 === 0 || i === hist.length - 1);
  }
  function stepOnce() { sim.step(S, P, rng); record(); }
  function setPlaying(on) {
    playing = on; if (on) frozen = false;
    $('play').querySelector('span').textContent = on ? 'Pause' : 'Play';
    $('playIcon').setAttribute('d', on ? 'M3 2h3v10H3zM8 2h3v10H8z' : 'M3 1.5l9 5.5-9 5.5z');
  }
  $('play').onclick = () => { if (!$('banner').hidden) { keepRunning = true; hideBanner(); } setPlaying(!playing); };
  $('step').onclick = () => { setPlaying(false); stepOnce(); acc = still ? 1 : 0; updateUi(true); };
  $('reset').onclick = reset;
  $('reseed').onclick = () => { seed = 1 + Math.floor(Math.random() * 99999); reset(); };
  const setDrawer = open => {
    document.body.classList.toggle('drawer-open', open); $('drawerBtn').setAttribute('aria-expanded', open);
    if (open) { const f = $('knobsPanel').querySelector('input,select,button'); if (f) f.focus(); } else $('drawerBtn').focus();
  };
  $('drawerBtn').onclick = () => setDrawer(!document.body.classList.contains('drawer-open'));
  if ($('drawerClose')) $('drawerClose').onclick = () => setDrawer(false);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && document.body.classList.contains('drawer-open')) setDrawer(false); });

  // ---- long-run catcher: pause when the run has settled, only repeats itself, or has gone on too long
  function hideBanner() { $('banner').hidden = true; }
  function pauseWith(msg) {
    setPlaying(false);
    $('bannerText').textContent = msg;
    $('bannerNext').hidden = chapter >= sim.chapters.length - 1 && !free;
    $('banner').hidden = false;
  }
  $('bannerKeep').onclick = () => { keepRunning = true; hideBanner(); setPlaying(true); };
  $('bannerNext').onclick = () => { hideBanner(); goChapter(Math.min(sim.chapters.length - 1, chapter + (free ? 0 : 1)), true); };
  function checkRun() {
    if (keepRunning) return;
    const maxDays = sim.maxDays || 1500, win = sim.settleWindow || 80, tol = sim.settleTol || .004;
    const label = sim.dayLabel === 'generation' ? 'Generation ' : 'Day ';
    if (S.day >= maxDays) return pauseWith(label + S.day + '. This run has gone on for a long time and its pattern now only repeats.');
    if (S.day < win + 10) return;
    const now = hist.filter(q => q.t > S.day - win), before = hist.filter(q => q.t > S.day - 2 * win && q.t <= S.day - win);
    const range = k => { let lo = Infinity, hi = -Infinity; now.forEach(q => { lo = Math.min(lo, q[k]); hi = Math.max(hi, q[k]); }); return hi - lo; };
    const mean = (a, k) => a.reduce((x, q) => x + q[k], 0) / a.length;
    if (sim.series.every(s => range(s.key) < tol)) return pauseWith(label + S.day + ': the run has settled. Nothing changes any more.');
    if (S.day > 4 * win && sim.series.every(s => Math.abs(mean(now, s.key) - mean(before, s.key)) < tol * 5))
      return pauseWith(label + S.day + ': the numbers now only wobble around the same values. This is the long-run state.');
  }
  $('speed').oninput = e => { speed = SPEEDS[+e.target.value]; $('speedOut').textContent = speed < 1 ? (1 / speed) + ' s/day' : speed + (speed === 1 ? ' day/s' : ' days/s'); };
  document.addEventListener('keydown', e => {
    if (e.target.closest('input,select,textarea,canvas') || e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === ' ' && !e.target.closest('button')) { setPlaying(!playing); e.preventDefault(); }
    else if (e.key === 'ArrowRight' && !e.target.closest('.tabs')) $('step').click();
    else if (e.key === 'r' || e.key === 'R') reset();
  });

  // ---- render
  function drawArena(now) {
    R.begin();
    if (sim.render) sim.render(R, S, still ? 1 : BS.clamp(acc, 0, 1), still ? 0 : now, P);
    R.end();
    const tag = sim.dayLabel + ' ' + S.day + (now < slowUntil ? ' · slowed to stay smooth' : '');
    if ($('daytag').textContent !== tag) $('daytag').textContent = tag;
  }
  function updateUi(force) {
    const now = performance.now();
    if (!force && now - lastUi < (speed > 15 ? 250 : 120)) return;
    lastUi = now;
    const theory = sim.theory(P, S);
    const key = sim.id + theory.length;
    if (key !== legendKey) { // theory lines can appear or vanish with knob values or measured R0
      legendKey = key;
      $('chartLegend').innerHTML = sim.series.map(l => `<span><i style="background:var(${l.color})"></i>${l.label}</span>`).join('') + (theory.length ? '<span><i class="dash"></i>theory</span>' : '');
    }
    chart.set({ hist, series: sim.series, theory, ymax: sim.ymax, fmt: sim.fmt });
    $('kpis').innerHTML = sim.kpis(S, P, hist).map(k => `<div class="kpi"><span class="l">${k.label}</span><span class="v"${k.tone ? ` style="color:var(${k.tone})"` : ''}>${k.value}</span>${k.note ? `<span class="note">${k.note}</span>` : ''}</div>`).join('');
    const txt = sim.insight(S, P, hist);
    if ($('insight').textContent !== txt) $('insight').textContent = txt;
    if (sim.extraHTML) { const html = sim.extraHTML(P, S); if ($('extraHTML').innerHTML !== html) $('extraHTML').innerHTML = html; }
    if (sim.extraDraw) { const { ctx, w, h } = BS.fit($('extra')); sim.extraDraw(ctx, w, h, S); }
  }
  function loop(ts) {
    const dt = Math.min(100, ts - (last || ts));
    last = ts;
    if (playing) {
      acc += dt * speed / 1000;
      const t0 = performance.now();
      let n = 0;
      while (acc >= 1) { // watchdog: at most ~20 ms of model work per frame; drop the backlog instead of freezing
        stepOnce(); acc -= 1; n++;
        if (performance.now() - t0 > 20) { if (acc >= 1) { acc = 0; slowUntil = ts + 2500; } break; }
      }
      if (n) { updateUi(false); checkRun(); }
    } else if (acc < 1 && !frozen) acc = Math.min(1, acc + dt / 450);
    drawArena(ts);
    requestAnimationFrame(loop);
  }

  // ---- theme and resize
  const repaint = () => { BS.readPal(); R.theme(); paintTabIcons(); updateUi(true); };
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', repaint);
  new MutationObserver(repaint).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
  new ResizeObserver(() => { chart.render(); if (sim.extraDraw) updateUi(true); }).observe(document.body);

  setPlaying(playing);
  select(location.hash.slice(1), false);
  paintTabIcons();
  requestAnimationFrame(loop);
  // Test hook (used by tests/browser.test.js).
  window.__bs = { get sim() { return sim; }, get state() { return S; }, get params() { return P; }, step: n => { for (let i = 0; i < n; i++) stepOnce(); updateUi(true); }, goChapter: i => goChapter(i, true), select, frame: t => { setPlaying(false); frozen = true; acc = t; }, setSpeed: i => { $('speed').value = i; $('speed').oninput({ target: $('speed') }); }, R };
};
