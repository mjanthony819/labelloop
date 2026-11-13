import test from "node:test";
import assert from "node:assert/strict";

import { generate, demoRows, CLASSES, CLASS_LABELS } from "./dataset.js";

test("generate is deterministic for a fixed seed", () => {
  const a = generate({ nPerClass: 10, seed: 42 });
  const b = generate({ nPerClass: 10, seed: 42 });
  assert.deepEqual(a, b);
});

test("different seeds give different data", () => {
  const a = generate({ nPerClass: 10, seed: 1 });
  const b = generate({ nPerClass: 10, seed: 2 });
  assert.notDeepEqual(a.texts, b.texts);
});

test("row counts and label set are correct", () => {
  const { texts, labels } = generate({ nPerClass: 25 });
  assert.equal(texts.length, CLASSES.length * 25);
  assert.equal(labels.length, texts.length);
  for (const l of labels) assert.ok(CLASSES.includes(l));
  for (const cls of CLASSES) {
    assert.equal(labels.filter((l) => l === cls).length, 25);
  }
});

test("no empty or whitespace-only texts", () => {
  const { texts } = generate({ nPerClass: 60 });
  for (const t of texts) assert.ok(t.trim().length > 10);
});

test("every class has a human-readable label", () => {
  for (const cls of CLASSES) assert.ok(CLASS_LABELS[cls]);
});

test("demoRows have unique ids and ground-truth labels", () => {
  const rows = demoRows();
  assert.equal(new Set(rows.map((r) => r.id)).size, rows.length);
  for (const r of rows) assert.ok(CLASSES.includes(r.label));
});
