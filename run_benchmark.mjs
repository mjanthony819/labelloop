// Regenerates benchmark.json from the repo's own code and prints the
// summary numbers used in the README. Run: node run_benchmark.mjs
// Everything is seeded; re-running produces identical numbers.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { generate, CLASSES, CLASS_LABELS } from "./dataset.js";
import { compareStrategies, finalReport, BENCH_CONFIG, REPORT_CONFIG } from "./evaluate.js";

const root = dirname(fileURLToPath(import.meta.url));
const { texts, labels } = generate({ nPerClass: 60, seed: 7 });

console.log(`Demo dataset: ${texts.length} synthetic comments across ${CLASSES.length} themes`);

const cmp = compareStrategies(texts, labels, BENCH_CONFIG);

const rep = finalReport(texts, labels, REPORT_CONFIG);

const out = {
  generated: "deterministic, see run_benchmark.mjs",
  dataset: {
    description:
      "360 synthetic community-class feedback comments, generated in code (dataset.js). No real people's data.",
    nItems: texts.length,
    classes: CLASSES.map((c) => ({ id: c, label: CLASS_LABELS[c] })),
  },
  setup: {
    seeds: [11, 23, 37],
    initPerClass: 2,
    step: 5,
    rounds: 24,
    testSize: 0.3,
    metric: "macro-F1 on a held-out 30% split the simulated labeler never sees",
  },
  curves: cmp,
  finalReport: rep,
};


writeFileSync(join(root, "benchmark.json"), JSON.stringify(out, null, 1));

const a = cmp.active;
const r = cmp.random;
console.log(`Active  final macro-F1: ${a.f1Mean.at(-1)} (labels used: ${a.labelsUsed.at(-1)})`);
console.log(`Random  final macro-F1: ${r.f1Mean.at(-1)} (labels used: ${r.labelsUsed.at(-1)})`);
console.log(`Labels to reach fixed target macro-F1 ${cmp.targetMacroF1}: active ${cmp.activeLabelsToTarget}, random ${cmp.randomLabelsToTarget}`);
console.log(`Full-data held-out macro-F1: ${rep.macroF1}  CI95 [${rep.macroF1ci95}]  n=${rep.nTest}`);
console.log("Wrote benchmark.json");
