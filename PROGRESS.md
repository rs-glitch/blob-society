# Progress

**Goal:** small 3D blob worlds where a few simple rules produce a social pattern, with story text that automated tests keep honest.

## 2026-10-21 · Scope
- **Candidates:** 20 worlds were scoped and scored ([docs/scope.html](docs/scope.html)). They share one shell and one agent engine, and each world is a small plug-in file with its rules, knobs, chapters and charts.

## 2026-10-22 · v1 to v4: the first eight worlds
- **Worlds:** Hawks & Doves, Trust Tournament, Yard-Sale Economy and Outbreak first, then Segregation, Rock Paper Scissors, Echo Chambers and Tragedy of the Commons.
- **3D:** a seeded island per world (three.js 0.169), with knobs in a drawer, charts at the borders and Primer-style pacing: each day plays as a short choreography.
- **Tested claims:** each chapter's claim runs for 3 seeds against a threshold. Where a claim failed, the text changed, not the threshold. For example, the forgiving copycat "wins with mistakes" story did not hold, so that chapter now tells "too nice invites cheaters", which holds in every seed.
- **Mutation guards:** tests fail if a parameter, such as the dove's kept food, stops having its effect.
- **Removed:** the 1/R0 line in Outbreak, because it does not hold in the spatial model.

## 2026-10-22 · v5 to v7: phones, edge cases, three more worlds
- **Phone layout:** a full-screen world, a swipe strip of charts under the tabs, and the story and controls at the bottom.
- **Edge-case presets:** 1 to 3 per world (for example "All-in bets", "Hard lockdown"), with an "Edge cases" button in the story bar. Each preset note is checked by `app/tests/model_presets.test.js`.
- **New worlds:** Natural Selection, Market Day and Election Day. Natural Selection restarts with 6 newcomers after an extinction, and the world says so.
- **Echo Chambers:** a camp now counts only tight groups, so day 0 has 0 camps.
- **Lesson:** never trust the exit code of a piped test run. Use `set -o pipefail`, or write the log to a file and print `$?`.

## 2026-10-22 · v8: hook titles and a calm redesign
- **Hooks:** each world opens with a title card for 5 seconds, or until the first touch on the world.
- **"Quiet diorama" look:** Fraunces and Inter, muted earth colours, frosted panels with hairline borders, a soft 4-step toon ramp on the blobs and desaturated biomes.
- **Contrast:** every text colour is at least 4.5:1 against its background.

## 2026-10-28 · Repo
- **Pages run standalone:** `app/index.html` and `docs/scope.html` now have their own doctype, charset and viewport. Before, they relied on a hosting page to add them.
- **Browser test:** it loads `app/index.html` directly and finds Chrome on macOS, Linux or Windows (or `CHROME=`).
- **Docs:** the brief for adding a world is now [docs/ADDING_A_WORLD.md](docs/ADDING_A_WORLD.md). The scope page moved to `docs/`.
- **Checks:** `npm test` passes all 6 suites, and the full browser run covers 11 worlds × 3 widths × 2 themes.

## Open
- Segregation is hard to read on a phone: the camera could come closer, or the cells could be bigger.
- The 2D tab icons still have large cartoon faces next to the calmer 3D blobs.
- The hook title cards make claims that the model tests do not check yet.
- The test that the 3D world is not blank has not been proven against a deliberately blank canvas.
