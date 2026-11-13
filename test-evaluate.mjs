import test from "node:test";
import assert from "node:assert/strict";

import {
  macroF1,
  perClassReport,
  stratifiedSplit,
  simulateCurve,
  compareStrategies,
  finalReport,
} from "./evaluate.js";
import { generate } from "./dataset.js";

test("macroF1 is 1 for perfect and 0 for fully disjoint predictions", () => {
  assert.equal(macroF1(["a", "b"], ["a", "b"]), 1);
  assert.equal(macroF1(["a", "a"], ["b", "b"]), 0);
});

test("stratifiedSplit keeps every index once and preserves class ratios", () => {
  const labels = [...Array(80).fill("x"), ...Array(20).fill("y")];
  const { train, test } = stratifiedSplit(labels, 0.25, 1);
  assert.equal(train.length + test.length, 100);
  assert.equal(new Set([...train, ...test]).size, 100);
  assert.equal(test.filter((i) => labels[i] === "y").length, 5);
});

test("simulateCurve returns bounded scores of expected length", () => {
  const { texts, labels } = generate({ nPerClass: 20, seed: 7 });
  const curve = simulateCurve(texts, labels, "active", { seeds: [1], rounds: 6, modelOpts: { iters: 120 } });
  assert.equal(curve.f1Mean.length, 6);
  assert.equal(curve.labelsUsed[0], 12); // 2 seeds per class x 6 classes
  for (const f of curve.f1Mean) assert.ok(f >= 0 && f <= 1);
});

test("active learning reaches high confidence with few labels on the demo set", () => {
  const { texts, labels } = generate({ nPerClass: 30, seed: 7 });
  const cmp = compareStrategies(texts, labels, { seeds: [3, 8, 13], rounds: 16, modelOpts: { iters: 150 } });
  const lastActive = cmp.active.f1Mean.at(-1);
  assert.ok(lastActive >= 0.75, `active final macro-F1 ${lastActive} should clear 0.75`);
  assert.ok(
    cmp.activeLabelsToTarget !== null &&
      (cmp.randomLabelsToTarget === null || cmp.activeLabelsToTarget <= cmp.randomLabelsToTarget),
    `active (${cmp.activeLabelsToTarget}) should reach the fixed target no later than random (${cmp.randomLabelsToTarget})`,
  );
});

test("finalReport gives honest held-out metrics with a sane CI", () => {
  const { texts, labels } = generate({ nPerClass: 30, seed: 7 });
  const rep = finalReport(texts, labels, { nBoot: 200, modelOpts: { iters: 150 } });
  assert.ok(rep.macroF1 >= 0.6 && rep.macroF1 <= 1);
  assert.ok(rep.macroF1ci95[0] <= rep.macroF1ci95[1]);
  const support = rep.perClass.reduce((a, c) => a + c.support, 0);
  assert.equal(support, rep.nTest);
});

test("perClassReport matches manual computation", () => {
  const rep = perClassReport(["a", "a", "b"], ["a", "b", "b"]);
  const a = rep.find((r) => r.class === "a");
  assert.equal(a.precision, 1);
  assert.equal(a.recall, 0.5);
});

test("committed benchmark.json matches a fresh run of the published protocol", async () => {
  const { readFileSync } = await import("node:fs");
  const { BENCH_CONFIG, REPORT_CONFIG } = await import("./evaluate.js");
  const bench = JSON.parse(readFileSync(new URL("./benchmark.json", import.meta.url)));
  const { texts, labels } = generate({ nPerClass: 60, seed: 7 });
  assert.deepEqual(compareStrategies(texts, labels, BENCH_CONFIG), bench.curves);
  assert.deepEqual(finalReport(texts, labels, REPORT_CONFIG), bench.finalReport);
});
