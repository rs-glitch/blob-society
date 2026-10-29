# Adding a world to Blob Society

Each world is an agent simulation on a seeded 3D island, in the spirit of the YouTube channel Primer. Interactions play out slowly and deliberately, the rule should be clear from the animation alone (no explainer screens), and numbers never race past.

## Files for a new world

- `app/js/sims/<id>.js`: the world (model, chapters, presets, render). Add its `<script>` tag to `app/index.html` with the other sims.
- `app/tests/model_<id>.test.js`: the claim checks. Add it to the `test` script in `package.json`.
- Optional `app/tools/explore_<id>.js`: parameter sweeps used to choose chapter values.

## Read first

- `app/js/sims/commons.js` and `app/js/sims/segregation.js`: two complete, short worlds (model, chapters and render).
- `app/js/engine.js`: `BS.rng`, `BS.shuffle`, `BS.clamp`, `BS.lerp`, `BS.ease`, `BS.pct`, `BS.seg(t, a, b)`, `BS.blinking(id, now)`, `BS.W = 4/3`.
- `app/js/world.js`: the render API `R`.
  - `R.blob(x, y, r, colorToken, {angry, smile, frown, blink, lift, squash, look, shadow})`
  - `R.prop(kind, x, y, s, colorToken, {lift, rot})`, with kinds tree, food, coin, boat, fish, home, pine, bush, rock
  - `R.line(x1, y1, x2, y2, color, alpha, lift)`, `R.label(x, y, text, color, alpha, lift)` (an HTML bubble), `R.ring(x, y, r, color)`, `R.field(cols, rows, rgba)`
  - Coordinates: x in [0, 4/3], y in [0, 1]. A blob's r is about 0.015 to 0.03.
- `app/js/app.js`: how the shell uses a world.
  - `render(R, s, t, now, p)` runs every frame, and t goes from 0 to 1 through the current day.
  - Speeds run from 0.25 to 20 days/s; the default is 1 day/s.
  - Each chapter starts from the knob defaults, then applies `chapter.set`.
  - A long-run catcher pauses runs that settle. Set `maxDays` if the world needs long runs.
- `app/tests/model2.test.js`: the test style (3 seeds, one threshold per chapter claim, PASS/FAIL lines, exit 1 on any failure).
- Colour tokens: `--orange --blue --green --red --magenta --violet --gold --teal --slate` for fills, and the `--*-text` variants (orange, gold, red, blue, green, magenta, violet, teal) for KPI text.

## Sim object fields

`id, name, topic, accent, dayLabel, biome, maxDays?, hook, question, source, knobs[], chapters[4], presets[]?, legend[], series[], ymax, fmt, theory(p, s), init(p, r), step(s, p, r), metrics(s, p), kpis(s, p, hist), insight(s, p, hist), extraTitle?, extraHTML?(p, s), extraDraw?(ctx, w, h, s), render(R, s, t, now, p)`

Biomes: meadow, autumn, savannah, hills, winter, foothills, lake, village.

## Rules

1. All randomness uses the `r` argument, so the same seed gives the same run.
2. Every chapter's text makes a claim. Sweep the parameters first, then write claims that hold for all 3 seeds with a margin. When a claim fails, change the text to match the model. Never move the threshold to rescue the text.
3. Each slider's `step` must hit every chapter and preset value exactly, or the browser test reports the chapter out of sync.
4. `metrics(s, p)` returns the series keys, as shares from 0 to 1 when `ymax` is 1.
5. Render a staged choreography for each day with `BS.seg`: short labels at slow speed, readable at the default 1 day/s, and graceful at 20 days/s. Render must not change model state, apart from pure animation fields.
6. Write chapter text, labels and insights in plain technical English: short sentences, active voice, no idioms.
7. Keep the change small and complete. No extra features.

## Checks before you finish

```sh
node app/tests/model_<id>.test.js                     # prints ALL PASS
SIMS=<id> npm run test:browser -- shots_<id>          # prints 0 errors, 0 issues
```

Look at the desktop and phone screenshots in `shots_<id>/` and fix what looks wrong. `window.__bs.frame(t)` freezes the world at phase t, for mid-day screenshots.
