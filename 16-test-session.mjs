import test from "node:test";
import assert from "node:assert/strict";

import {
  createProject,
  addLabel,
  removeLabel,
  getItem,
  counts,
  toJSON,
  fromJSON,
} from "./session.js";

const rows = [
  { id: "a", text: "the wifi keeps dropping", label: null },
  { id: "b", text: "great teaching this week", label: "teaching" },
  { id: "c", text: "   ", label: null },
  { text: "too much homework", label: null },
];

test("createProject skips blank rows and assigns ids", () => {
  const p = createProject("Test", rows);
  assert.equal(p.items.length, 3);
  assert.equal(p.items[2].id, "item-0003");
  assert.deepEqual(p.classes, ["teaching"]);
});

test("duplicate ids are rejected", () => {
  assert.throws(
    () => createProject("T", [{ id: "x", text: "one" }, { id: "x", text: "two" }]),
    /duplicate id/,
  );
});

test("no usable rows is an error", () => {
  assert.throws(() => createProject("T", [{ id: "x", text: "  " }]), /no usable rows/);
});

test("addLabel records history and new classes", () => {
  const p = createProject("T", rows);
  addLabel(p, "a", "facilities");
  assert.equal(getItem(p, "a").label, "facilities");
  assert.ok(p.classes.includes("facilities"));
  assert.equal(p.history.length, 1);
  assert.equal(p.history[0].source, "human");
});

test("removeLabel clears the label and keeps the audit trail", () => {
  const p = createProject("T", rows);
  addLabel(p, "a", "facilities");
  removeLabel(p, "a");
  assert.equal(getItem(p, "a").label, null);
  assert.equal(p.history.length, 2);
});

test("counts reflect labeled state", () => {
  const p = createProject("T", rows);
  addLabel(p, "a", "facilities");
  const c = counts(p);
  assert.equal(c.labeled, 2);
  assert.equal(c.unlabeled, 1);
  assert.equal(c.perClass.facilities, 1);
  assert.equal(c.perClass.teaching, 1);
});

test("unknown item id throws", () => {
  const p = createProject("T", rows);
  assert.throws(() => getItem(p, "nope"), /unknown item id/);
});

test("JSON round trip preserves everything", () => {
  const p = createProject("My project", rows);
  addLabel(p, "a", "facilities");
  const restored = fromJSON(toJSON(p));
  assert.deepEqual(restored.items, p.items);
  assert.deepEqual(restored.classes, p.classes);
  assert.deepEqual(restored.history, p.history);
  assert.equal(restored.name, "My project");
});

test("fromJSON rejects garbage, wrong schema and wrong version", () => {
  assert.throws(() => fromJSON("not json"), /not valid JSON/);
  assert.throws(() => fromJSON(JSON.stringify({ schema: "other" })), /not a LabelLoop/);
  assert.throws(
    () => fromJSON(JSON.stringify({ schema: "labelloop-project", version: 99, name: "x", classes: [], items: [] })),
    /unsupported project version/,
  );
});
