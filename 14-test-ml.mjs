import test from "node:test";
import assert from "node:assert/strict";

import {
  tokenize,
  ngrams,
  TfidfVectorizer,
  FeedbackClassifier,
  uncertaintyOrder,
  diverseOrder,
} from "./ml.js";
import { generate } from "./dataset.js";

test("tokenize lowercases, strips accents and drops short tokens", () => {
  assert.deepEqual(tokenize("Café, MÜNCHEN! a ok"), ["cafe", "munchen", "ok"]);
});

test("ngrams emits unigrams then bigrams", () => {
  assert.deepEqual(ngrams(["a", "b", "c"], 2), ["a", "b", "c", "a b", "b c"]);
});

test("vectorizer rows are L2-normalised and unseen tokens are ignored", () => {
  const vec = new TfidfVectorizer().fit(["the cat sat", "the dog ran fast"]);
  const row = vec.transformOne("the cat and a unicorn");
  let norm = 0;
  for (const v of row.values()) norm += v * v;
  assert.ok(Math.abs(norm - 1) < 1e-9);
  assert.ok(![...row.keys()].some((k) => k >= vec.nFeatures));
});

test("transform before fit throws", () => {
  assert.throws(() => new TfidfVectorizer().transformOne("hi"), /not fitted/);
});

test("classifier refuses to train on a single class", () => {
  const clf = new FeedbackClassifier();
  assert.throws(() => clf.fit(["a b", "c d"], ["x", "x"]), /at least two classes/);
});

test("predict before fit throws", () => {
  assert.throws(() => new FeedbackClassifier().predict(["hello world"]), /train/);
});

test("probabilities sum to one and predictions come from the label set", () => {
  const { texts, labels } = generate({ nPerClass: 10, seed: 3 });
  const clf = new FeedbackClassifier({ iters: 60 }).fit(texts.slice(0, 40), labels.slice(0, 40));
  const proba = clf.predictProba(texts.slice(40, 50));
  for (const p of proba) {
    assert.ok(Math.abs(p.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  }
  for (const pred of clf.predict(texts.slice(40, 50))) {
    assert.ok(clf.classes_.includes(pred));
  }
});

test("classifier learns the easy synthetic signal", () => {
  const { texts, labels } = generate({ nPerClass: 12, seed: 9 });
  const clf = new FeedbackClassifier({ iters: 200 }).fit(texts, labels);
  const pred = clf.predict(texts);
  const acc = pred.filter((p, i) => p === labels[i]).length / labels.length;
  assert.ok(acc > 0.9, `train accuracy ${acc} should exceed 0.9 on separable demo data`);
});

test("margins stay within [0, 1]", () => {
  const { texts, labels } = generate({ nPerClass: 8, seed: 4 });
  const clf = new FeedbackClassifier({ iters: 60 }).fit(texts, labels);
  for (const m of clf.margins(texts.slice(0, 10))) {
    assert.ok(m >= -1e-9 && m <= 1 + 1e-9);
  }
});

test("uncertaintyOrder sorts ascending by margin", () => {
  assert.deepEqual(uncertaintyOrder([0.5, 0.1, 0.9, 0.2]), [1, 3, 0, 2]);
});

test("diverseOrder is a deterministic permutation", () => {
  const { texts } = generate({ nPerClass: 6, seed: 5 });
  const a = diverseOrder(texts, 0);
  const b = diverseOrder(texts, 0);
  assert.deepEqual(a, b);
  assert.equal(new Set(a).size, texts.length);
  assert.deepEqual([...a].sort((x, y) => x - y), texts.map((_, i) => i));
});

test("diverseOrder handles empty input", () => {
  assert.deepEqual(diverseOrder([], 0), []);
});

test("diverseOrder early picks cover different topics", () => {
  // With three tight clusters, the first three picks should hit all of them.
  const clusterA = Array.from({ length: 5 }, (_, i) => `apple orchard fruit tree harvest ${i}`);
  const clusterB = Array.from({ length: 5 }, (_, i) => `quantum physics particle photon ${i}`);
  const clusterC = Array.from({ length: 5 }, (_, i) => `football striker goal match ${i}`);
  const texts = [...clusterA, ...clusterB, ...clusterC];
  const picks = diverseOrder(texts, 1).slice(0, 3);
  const buckets = new Set(picks.map((i) => Math.floor(i / 5)));
  assert.equal(buckets.size, 3);
});
