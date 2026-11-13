# LabelLoop

**Label a little. Learn a lot. Nothing leaves your device.**

LabelLoop is a browser-local active-learning workbench for triaging open-text
feedback - survey comments, program reviews, suggestion-box entries - into
themes a human cares about. It is built for the small nonprofits, teachers and
program coordinators who collect hundreds of free-text responses and have no ML
budget: no cloud NLP bill, no data leaving the building, no reading every row
by hand.

**Live demo:** https://mjanthony819.github.io/labelloop/

## The loop

1. **Load** a CSV of comments (or the built-in synthetic demo set of 360
   community-class feedback comments).
2. **Cold start:** with no model yet, LabelLoop shows a varied spread of
   comments (farthest-first over TF-IDF space), so your first labels cover
   different topics.
3. **Active learning:** once two or more themes have examples, a model trains
   in your browser and serves you the comments it is *least sure about* -
   with a diversity guard so you don't get ten near-duplicates of one
   ambiguous wording.
4. **Inspect** what the model learned: top weighted words per theme, predicted
   distribution of the unlabeled pile with confidence bands, and (on the demo
   set) agreement with hidden reference labels.
5. **Export** labeled CSV + a model card, and **save/resume** the whole project
   as one JSON file (also autosaved to localStorage).

## Why this is honest about its claims

- **All ML runs in your browser.** No server, no uploads, no tracking. The
  hosted site is static files only.
- **Confidence is indicative, not calibrated.** The UI says so wherever scores
  appear.
- **The demo dataset is synthetic**, generated deterministically in
  `dataset.js`. No real people's feedback, no reused public datasets.
- **Benchmark numbers are computed, not written by hand** - see below and
  re-run them yourself.

## The model

TF-IDF (1-2 grams, sublinear term frequency, smoothed idf, L2-normalised rows)
feeding a multinomial logistic regression trained by full-batch gradient
descent with L2 regularisation and class-balanced weights. Pure dependency-free
JavaScript (`ml.js`), fast enough to retrain on every label. A deliberate,
inspectable classical baseline - not a neural network.

## Benchmark

Simulated labeling on the 360-comment demo set: start with 2 labels per theme,
request 5 at a time (model-chosen vs random), retrain, score macro-F1 on a
held-out 30% split the simulated labeler never sees. Mean of 3 seeds.

| | Active (model picks) | Random |
|---|---|---|
| Final macro-F1 after 127 labels | **0.997** | 0.879 |
| Labels to reach 95% of each curve's best | **72** | 112 |

Training on the full demo set, held-out 30%: macro-F1 **0.991**, bootstrap 95%
interval [0.966, 1.000], n=108.

These numbers come from a synthetic dataset with clean themes - real feedback
is messier and will score lower. They show the labeling loop works and saves
effort; they are not a promised accuracy for your data.

Reproduce exactly (fixed seeds):

```bash
node run_benchmark.mjs   # rewrites benchmark.json and prints the numbers
```

The benchmark page in the app can also re-run the whole simulation live in your
browser.

## Tests

34 tests over the ML core, samplers, dataset generator, session persistence and
evaluation (Node's built-in runner, no dependencies):

```bash
node --test test-*.mjs
```

## Run locally

Any static file server from the repo root, e.g.:

```bash
python3 -m http.server 8000   # then open http://localhost:8000
```

No build step, no install. `package.json` exists only for the test/benchmark
scripts.

## Project layout

Flat by design - it is a no-build static site:

- `index.html`, `styles.css`, `app.js` - the UI
- `ml.js` - vectorizer, classifier, active-learning samplers
- `dataset.js` - synthetic demo data generator
- `session.js` - project model, save/resume, validation
- `evaluate.js` - learning-curve simulation, metrics, bootstrap intervals
- `run_benchmark.mjs`, `benchmark.json` - reproducible numbers
- `test-*.mjs` - the test suite

## AI assistance disclosure

This project was designed, written and tested with substantial AI-assistant
help (ideation, code, tests, benchmark, documentation), directed and reviewed
by the repository owner. All demo data is synthetic.

## License

MIT
