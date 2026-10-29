// Shared engine: seeded random numbers, maths helpers, blob drawing, time-series chart.
(function (G) {
  const BS = G.BS || (G.BS = {});
  BS.W = 4 / 3; BS.H = 1; // world size used by every arena
  BS.sims = []; // each js/sims/<id>.js file pushes one sim; tab order = script order

  BS.rng = function (seed) { // mulberry32
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  BS.shuffle = (a, r) => { for (let i = a.length - 1; i > 0; i--) { const j = (r() * (i + 1)) | 0; [a[i], a[j]] = [a[j], a[i]]; } return a; };
  BS.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  BS.lerp = (a, b, t) => a + (b - a) * t;
  BS.ease = t => t < .5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
  BS.pct = v => Math.round(v * 100) + '%';
  BS.gini = w => {
    const a = Array.from(w).sort((x, y) => x - y), n = a.length;
    let s = 0, c = 0;
    for (let i = 0; i < n; i++) { c += a[i]; s += (i + 1) * a[i]; }
    return c ? (2 * s) / (n * c) - (n + 1) / n : 0;
  };

  // Map world coordinates to canvas pixels for a view from BS.view().
  BS.px = (v, x) => v.ox + x * v.s;
  BS.py = (v, y) => v.oy + y * v.s;

  if (typeof document === 'undefined') return; // Node tests stop here

  BS.pal = {};
  const KEYS = ['--bg', '--paper', '--ground', '--ink', '--mute', '--line', '--grid', '--orange', '--blue', '--green', '--red', '--magenta', '--violet', '--gold', '--teal', '--slate'];
  const alphaCache = new Map();
  BS.readPal = () => { const cs = getComputedStyle(document.documentElement); KEYS.forEach(k => BS.pal[k] = cs.getPropertyValue(k).trim()); alphaCache.clear(); };
  BS.col = k => BS.pal[k] || k;
  BS.alpha = (k, a) => { // token colour with alpha, works for #rrggbb
    const key = k + a;
    if (alphaCache.has(key)) return alphaCache.get(key);
    const c = BS.col(k);
    const out = c[0] !== '#' || c.length !== 7 ? c : 'rgba(' + parseInt(c.slice(1, 3), 16) + ',' + parseInt(c.slice(3, 5), 16) + ',' + parseInt(c.slice(5, 7), 16) + ',' + a + ')';
    alphaCache.set(key, out);
    return out;
  };
  // Each blob blinks for ~0.12 s every 4 s, offset by its id.
  BS.blinking = (id, now) => ((now / 1000 + id * .618) % 4) < .12;

  // Canvas size comes from a ResizeObserver, so the render loop does not force layout each frame.
  const boxes = new WeakMap();
  const ro = new ResizeObserver(es => es.forEach(e => boxes.set(e.target, { width: e.contentRect.width, height: e.contentRect.height })));
  BS.fit = canvas => {
    if (!boxes.has(canvas)) { ro.observe(canvas); boxes.set(canvas, canvas.getBoundingClientRect()); }
    const dpr = Math.min(2, window.devicePixelRatio || 1), r = boxes.get(canvas);
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx, w: r.width, h: r.height };
  };
  BS.view = (w, h) => { const s = Math.min(w / BS.W, h / BS.H); return { s, ox: (w - BS.W * s) / 2, oy: (h - BS.H * s) / 2 }; };

  // Primer-style blob: ground shadow, soft body with highlight, two eyes that blink,
  // optional angry V-brows (aggressive types) or a small smile (peaceful types).
  BS.blob = (ctx, x, y, r, fill, o = {}) => {
    if (r >= 5 && o.shadow !== false) {
      ctx.fillStyle = 'rgba(0,0,0,.13)';
      ctx.beginPath(); ctx.ellipse(x, y + r * .9, r * .78, r * .2, 0, 0, 6.2832); ctx.fill();
    }
    ctx.fillStyle = fill;
    ctx.beginPath(); ctx.ellipse(x, y + r * .05, r, r * .9, 0, 0, 6.2832); ctx.fill();
    if (r < 3.5) return;
    if (r >= 7) {
      ctx.fillStyle = 'rgba(255,255,255,.22)';
      ctx.beginPath(); ctx.ellipse(x - r * .38, y - r * .42, r * .3, r * .16, -.5, 0, 6.2832); ctx.fill();
    }
    const e = r * .19, ex = r * .36, ey = y - r * .12, lx = (o.look || 0) * e * .5;
    ctx.strokeStyle = ctx.fillStyle = '#141a21'; ctx.lineCap = 'round';
    if (o.blink) {
      ctx.lineWidth = Math.max(1, r * .1);
      ctx.beginPath(); ctx.moveTo(x - ex - e, ey); ctx.lineTo(x - ex + e, ey); ctx.moveTo(x + ex - e, ey); ctx.lineTo(x + ex + e, ey); ctx.stroke();
    } else {
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(x - ex, ey, e * 1.3, 0, 6.2832); ctx.arc(x + ex, ey, e * 1.3, 0, 6.2832); ctx.fill();
      ctx.fillStyle = '#141a21';
      ctx.beginPath(); ctx.arc(x - ex + lx, ey, e * .72, 0, 6.2832); ctx.arc(x + ex + lx, ey, e * .72, 0, 6.2832); ctx.fill();
    }
    if (o.angry) {
      ctx.lineWidth = Math.max(1.2, r * .15);
      ctx.beginPath();
      ctx.moveTo(x - ex - e * 1.5, ey - e * 2.5); ctx.lineTo(x - ex + e * 1.2, ey - e * 1.3);
      ctx.moveTo(x + ex + e * 1.5, ey - e * 2.5); ctx.lineTo(x + ex - e * 1.2, ey - e * 1.3);
      ctx.stroke();
    } else if (o.smile && r >= 6) {
      ctx.lineWidth = Math.max(1, r * .09);
      ctx.beginPath(); ctx.arc(x, y + r * .2, r * .2, .35, Math.PI - .35); ctx.stroke();
    } else if (o.frown && r >= 5) {
      ctx.lineWidth = Math.max(1, r * .09);
      ctx.beginPath(); ctx.arc(x, y + r * .48, r * .2, Math.PI + .45, -.45); ctx.stroke();
    }
  };

  // Small on-canvas annotation ("+1 food", "fight!") that floats up and fades with a (0..1).
  BS.tag = (ctx, x, y, text, color, a = 1, size = 12) => {
    if (a <= 0) return;
    ctx.globalAlpha = Math.min(1, a);
    ctx.font = '700 ' + size + 'px "JetBrains Mono", ui-monospace, monospace';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    const w = ctx.measureText(text).width + 8;
    ctx.fillStyle = BS.col('--paper'); ctx.fillRect(x - w / 2, y - size * .7, w, size * 1.4);
    ctx.fillStyle = BS.col(color); ctx.fillText(text, x, y + .5);
    ctx.globalAlpha = 1;
  };
  // Phase helper for choreography: progress (0..1) of t inside the window [a, b].
  BS.seg = (t, a, b) => BS.clamp((t - a) / (b - a), 0, 1);

  // Line chart for population shares over time, with dashed theory lines and hover readout.
  BS.Chart = class {
    constructor(cv, tip) {
      this.cv = cv; this.tip = tip; this.hx = null;
      const at = e => { const r = cv.getBoundingClientRect(); this.hx = BS.clamp((e.clientX - r.left) / r.width, 0, 1); this.render(); };
      cv.addEventListener('pointermove', at);
      cv.addEventListener('pointerdown', at); // touch: tap or drag to read a value; it stays until the next tap elsewhere
      cv.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse') { this.hx = null; this.render(); } });
      cv.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { this.hx = BS.clamp((this.hx ?? 1) + (e.key === 'ArrowRight' ? .025 : -.025), 0, 1); this.render(); e.preventDefault(); }
        else if (e.key === 'Escape') { this.hx = null; this.render(); }
      });
      cv.addEventListener('blur', () => { this.hx = null; this.render(); });
    }
    set(d) { this.d = d; this.render(); }
    render() {
      if (!this.d) return;
      const { ctx, w, h } = BS.fit(this.cv);
      const { hist, series, theory, ymax, fmt } = this.d;
      ctx.clearRect(0, 0, w, h);
      const L = 40, R = 12, T = 10, B = 24, pw = w - L - R, ph = h - T - B;
      if (pw < 20 || ph < 20 || !hist.length) return;
      const t0 = hist[0].t, t1 = Math.max(hist[hist.length - 1].t, t0 + 20);
      const X = t => L + (t - t0) / (t1 - t0) * pw, Y = v => T + ph - BS.clamp(v / ymax, 0, 1) * ph;
      ctx.font = '500 10.5px "JetBrains Mono", ui-monospace, monospace';
      ctx.textBaseline = 'middle'; ctx.lineCap = 'round';
      for (let i = 0; i <= 4; i++) {
        const v = ymax * i / 4, y = Y(v);
        ctx.strokeStyle = BS.col(i ? '--line' : '--grid'); ctx.lineWidth = 1; ctx.setLineDash([]);
        ctx.beginPath(); ctx.moveTo(L, Math.round(y) + .5); ctx.lineTo(L + pw, Math.round(y) + .5); ctx.stroke(); ctx.setLineDash([]);
        ctx.fillStyle = BS.col('--mute'); ctx.textAlign = 'right'; ctx.fillText(fmt(v), L - 6, y);
      }
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      ctx.fillText('day ' + t0, L, h - 6);
      ctx.textAlign = 'right'; ctx.fillText('day ' + Math.round(t1), L + pw, h - 6);
      (theory || []).forEach(th => {
        const y = Y(th.value);
        ctx.strokeStyle = BS.col(th.color || '--mute'); ctx.lineWidth = 1.25; ctx.setLineDash([5, 5]);
        ctx.beginPath(); ctx.moveTo(L, y); ctx.lineTo(L + pw, y); ctx.stroke(); ctx.setLineDash([]);
        ctx.textAlign = 'right'; ctx.textBaseline = 'bottom';
        const tw = ctx.measureText(th.label).width, ly = y < T + 16 ? y + 16 : y - 3;
        ctx.fillStyle = BS.col('--paper'); ctx.fillRect(L + pw - tw - 6, ly - 13, tw + 6, 14);
        ctx.fillStyle = BS.col('--ink'); ctx.fillText(th.label, L + pw - 2, ly);
      });
      const step = Math.max(1, Math.floor(hist.length / Math.max(1, pw)));
      series.forEach(s => {
        ctx.beginPath();
        for (let i = 0; i < hist.length; i += step) { const x = X(hist[i].t), y = Y(hist[i][s.key]); i ? ctx.lineTo(x, y) : ctx.moveTo(x, y); }
        const lastP = hist[hist.length - 1];
        ctx.lineTo(X(lastP.t), Y(lastP[s.key]));
        ctx.lineJoin = 'round';
        ctx.strokeStyle = BS.col(s.color); ctx.lineWidth = 2.25; ctx.stroke();
        if (s.area) {
          ctx.lineTo(X(lastP.t), Y(0)); ctx.lineTo(X(t0), Y(0)); ctx.closePath();
          ctx.fillStyle = BS.alpha(s.color, .12); ctx.fill();
        }
      });
      series.forEach(s => {
        const lastP = hist[hist.length - 1], ex = X(lastP.t), ey = Y(lastP[s.key]);
        ctx.fillStyle = BS.col(s.color); ctx.strokeStyle = BS.col('--paper'); ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(ex, ey, 4.5, 0, 6.2832); ctx.fill(); ctx.stroke();
      });
      if (this.hx == null || !this.tip) { if (this.tip) this.tip.hidden = true; return; }
      const tt = t0 + (this.hx * w - L) / pw * (t1 - t0);
      let best = hist[0];
      for (const p of hist) if (Math.abs(p.t - tt) < Math.abs(best.t - tt)) best = p;
      const x = X(best.t);
      ctx.strokeStyle = BS.col('--mute'); ctx.lineWidth = 1; ctx.setLineDash([3, 4]);
      ctx.beginPath(); ctx.moveTo(x, T); ctx.lineTo(x, T + ph); ctx.stroke(); ctx.setLineDash([]);
      series.forEach(s => { ctx.fillStyle = BS.col(s.color); ctx.strokeStyle = BS.col('--paper'); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, Y(best[s.key]), 5.5, 0, 6.2832); ctx.fill(); ctx.stroke(); });
      this.tip.hidden = false;
      this.tip.innerHTML = '<b>day ' + best.t + '</b>' + series.map(s => '<span><i style="background:' + BS.col(s.color) + '"></i>' + s.label + ' ' + fmt(best[s.key]) + '</span>').join('');
      this.tip.style.left = BS.clamp(x - 70, 0, w - 150) + 'px';
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
