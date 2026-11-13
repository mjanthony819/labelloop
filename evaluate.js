// Honest evaluation for LabelLoop.
//
// Simulates the labeling process on a fully labeled dataset: start from a small
// seed batch, repeatedly ask for the next items (actively or at random),
// retrain, and measure macro-F1 on a held-out test split the simulated labeler
// never sees. Repeated over several seeds so the curve shows variability, not
// one lucky run. The app renders the JSON produced by run_benchmark.mjs;
// no numbers in the UI or README are hand-written.

import { FeedbackClassifier, suggestNext } from "./ml.js";
import { mulberry32, permutation } from "./rng.js";

export function macroF1(yTrue, yPred) {
  const classes = [...new Set([...yTrue, ...yPred])].sort();
  let sum = 0;
  for (const cls of classes) {
    let tp = 0, fp = 0, fn = 0;
    for (let i = 0; i < yTrue.length; i++) {
      if (yPred[i] === cls && yTrue[i] === cls) tp++;
      else if (yPred[i] === cls) fp++;
      else if (yTrue[i] === cls) fn++;
    }
    const p = tp / (tp + fp || 1);
    const r = tp / (tp + fn || 1);
    sum += p + r === 0 ? 0 : (2 * p * r) / (p + r);
  }
  return sum / classes.length;
}

export function perClassReport(yTrue, yPred) {
  const classes = [...new Set(yTrue)].sort();
  return classes.map((cls) => {
    let tp = 0, fp = 0, fn = 0, support = 0;
    for (let i = 0; i < yTrue.length; i++) {
      if (yTrue[i] === cls) {
        support++;
        if (yPred[i] === cls) tp++;
        else fn++;
      } else if (yPred[i] === cls) fp++;
    }
    const precision = tp / (tp + fp || 1);
    const recall = tp / (tp + fn || 1);
    return {
      class: cls,
      precision: round3(precision),
      recall: round3(recall),
      f1: round3(precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall)),
      support,
    };
  });
}

function round3(x) {
  return Math.round(x * 1000) / 1000;
}

export function stratifiedSplit(labels, testSize, seed) {
  const rng = mulberry32(seed);
  const byClass = new Map();
  labels.forEach((l, i) => {
    if (!byClass.has(l)) byClass.set(l, []);
    byClass.get(l).push(i);
  });
  const train = [];
  const test = [];
  for (const idxs of byClass.values()) {
    const order = permutation(rng, idxs.length);
    const nTest = Math.max(1, Math.round(idxs.length * testSize));
    order.forEach((pos, k) => (k < nTest ? test : train).push(idxs[pos]));
  }
  return { train: train.sort((a, b) => a - b), test: test.sort((a, b) => a - b) };
}

export function simulateCurve(texts, labels, strategy, {
  seeds = [11, 23, 37],
  initPerClass = 2,
  step = 5,
  rounds = 24,
  testSize = 0.3,
  modelOpts = {},
} = {}) {
  if (!["active", "random"].includes(strategy)) {
    throw new Error("strategy must be 'active' or 'random'");
  }
  const classes = [...new Set(labels)].sort();
  const runs = [];

  for (const seed of seeds) {
    const rng = mulberry32(seed);
    const { train, test } = stratifiedSplit(labels, testSize, seed);
    const Xtest = test.map((i) => texts[i]);
    const yTest = test.map((i) => labels[i]);

    const labeled = new Set();
    for (const cls of classes) {
      const pool = train.filter((i) => labels[i] === cls);
      permutation(rng, pool.length).slice(0, Math.min(initPerClass, pool.length))
        .forEach((pos) => labeled.add(pool[pos]));
    }

    const runF1 = [];
    for (let r = 0; r < rounds; r++) {
      const labeledArr = [...labeled];
      const model = new FeedbackClassifier(modelOpts).fit(
        labeledArr.map((i) => texts[i]),
        labeledArr.map((i) => labels[i]),
      );
      runF1.push(macroF1(yTest, model.predict(Xtest)));

      const unlabeled = train.filter((i) => !labeled.has(i));
      if (!unlabeled.length) break;
      let picked;
      if (strategy === "active") {
        picked = suggestNext(model, unlabeled.map((i) => texts[i]), step, seed)
          .map((j) => unlabeled[j]);
      } else {
        picked = permutation(rng, unlabeled.length).slice(0, step).map((pos) => unlabeled[pos]);
      }
      picked.forEach((i) => labeled.add(i));
    }
    runs.push(runF1);
  }

  const nClasses = classes.length;
  const len = Math.min(...runs.map((r) => r.length));
  const labelsUsed = Array.from({ length: len }, (_, r) => initPerClass * nClasses + step * r);
  const f1Mean = [];
  const f1Std = [];
  for (let r = 0; r < len; r++) {
    const col = runs.map((run) => run[r]);
    const mean = col.reduce((a, b) => a + b, 0) / col.length;
    const sd = Math.sqrt(col.reduce((a, b) => a + (b - mean) ** 2, 0) / col.length);
    f1Mean.push(Math.round(mean * 10000) / 10000);
    f1Std.push(Math.round(sd * 10000) / 10000);
  }
  return { labelsUsed, f1Mean, f1Std, nRuns: runs.length };
}

// Single source of truth for the published benchmark protocol. Used by
// run_benchmark.mjs (precompute) and app.js (live re-run in the browser), so
// the numbers a visitor reproduces match the committed benchmark.json.
export const BENCH_CONFIG = {
  seeds: [11, 23, 37],
  initPerClass: 2,
  step: 5,
  rounds: 24,
  testSize: 0.3,
  modelOpts: { iters: 250 },
};
export const REPORT_CONFIG = { seed: 5, nBoot: 500, modelOpts: { iters: 250 } };

export function compareStrategies(texts, labels, kwargs = {}) {
  const active = simulateCurve(texts, labels, "active", kwargs);
  const random = simulateCurve(texts, labels, "random", kwargs);
  return {
    active,
    random,
    targetMacroF1: TARGET_MACRO_F1,
    activeLabelsToTarget: labelsToReach(active, TARGET_MACRO_F1),
    randomLabelsToTarget: labelsToReach(random, TARGET_MACRO_F1),
  };
}

// Fixed comparison target, chosen before looking at results: the labels used
// when each strategy's 3-seed mean curve first reaches this macro-F1.
const TARGET_MACRO_F1 = 0.9;

function labelsToReach(curve, target) {
  for (let i = 0; i < curve.labelsUsed.length; i++) {
    if (curve.f1Mean[i] >= target) return curve.labelsUsed[i];
  }
  return null;
}

export function finalReport(texts, labels, { seed = 5, testSize = 0.3, nBoot = 500, modelOpts = {} } = {}) {
  const { train, test } = stratifiedSplit(labels, testSize, seed);
  const model = new FeedbackClassifier(modelOpts).fit(
    train.map((i) => texts[i]),
    train.map((i) => labels[i]),
  );
  const yTest = test.map((i) => labels[i]);
  const yPred = model.predict(test.map((i) => texts[i]));
  const macro = macroF1(yTest, yPred);

  const rng = mulberry32(seed);
  const boots = [];
  for (let b = 0; b < nBoot; b++) {
    const yt = [];
    const yp = [];
    for (let k = 0; k < yTest.length; k++) {
      const s = Math.floor(rng() * yTest.length);
      yt.push(yTest[s]);
      yp.push(yPred[s]);
    }
    boots.push(macroF1(yt, yp));
  }
  boots.sort((a, b) => a - b);
  const lo = boots[Math.floor(0.025 * boots.length)];
  const hi = boots[Math.min(boots.length - 1, Math.ceil(0.975 * boots.length) - 1)];

  return {
    macroF1: Math.round(macro * 10000) / 10000,
    macroF1ci95: [Math.round(lo * 10000) / 10000, Math.round(hi * 10000) / 10000],
    nTest: yTest.length,
    perClass: perClassReport(yTest, yPred),
  };
}
