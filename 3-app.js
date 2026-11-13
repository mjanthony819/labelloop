// LabelLoop UI wiring. Plain DOM, no framework, no build step.

import { FeedbackClassifier, suggestNext, diverseOrder } from "./ml.js";
import { demoRows, CLASSES, CLASS_LABELS } from "./dataset.js";
import {
  createProject, addLabel, getItem, counts,
  labeledItems, unlabeledItems,
  toJSON, fromJSON, saveLocal, loadLocal, clearLocal,
} from "./session.js";
import { compareStrategies, finalReport } from "./evaluate.js";

const $ = (id) => document.getElementById(id);

const state = {
  project: null,
  model: null,
  modelDirty: true,
  skipped: new Set(),
  currentId: null,
  lastExpectation: null,
  bench: null,
};

// ------------------------------------------------------------------- tabs ----
$("tabs").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-page]");
  if (!btn) return;
  document.querySelectorAll("#tabs button").forEach((b) => b.classList.toggle("active", b === btn));
  document.querySelectorAll("section.page").forEach((s) => s.classList.toggle("active", s.id === `page-${btn.dataset.page}`));
  render();
});

function show(page) {
  document.querySelector(`#tabs button[data-page="${page}"]`).click();
}

// ------------------------------------------------------------------ model ----
function ensureModel() {
  if (!state.project) return null;
  const labeled = labeledItems(state.project);
  const classes = [...new Set(labeled.map((it) => it.label))];
  if (classes.length < 2) return null;
  if (state.model && !state.modelDirty) return state.model;
  state.model = new FeedbackClassifier({ iters: 250 }).fit(
    labeled.map((it) => it.text),
    labeled.map((it) => it.label),
  );
  state.modelDirty = false;
  return state.model;
}

function suggestionQueue(k = 6) {
  const project = state.project;
  if (!project) return [];
  let pool = unlabeledItems(project).filter((it) => !state.skipped.has(it.id));
  if (!pool.length) {
    state.skipped.clear();
    pool = unlabeledItems(project);
  }
  if (!pool.length) return [];
  const model = ensureModel();
  if (model) {
    const idx = suggestNext(model, pool.map((it) => it.text), k);
    return { ids: idx.map((i) => pool[i].id), mode: "active" };
  }
  const order = diverseOrder(pool.map((it) => it.text), 0);
  return { ids: order.slice(0, k).map((i) => pool[i].id), mode: "cold" };
}

// ------------------------------------------------------------------ start ----
$("btn-demo").addEventListener("click", () => {
  const rows = demoRows().map((r) => ({ id: r.id, text: r.text, label: null, truth: r.label }));
  state.project = createProject("Community class feedback (demo)", rows, [...CLASSES]);
  state.modelDirty = true;
  state.skipped.clear();
  saveLocal(state.project);
  show("label");
});

$("btn-load-csv").addEventListener("click", () => {
  const file = $("file-csv").files[0];
  if (!file) return flash("Pick a CSV file first.");
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const rows = parseCSV(String(reader.result));
      if (!rows.length) throw new Error("no data rows found");
      const header = rows[0];
      const textCol = findColumn(header, ["text", "comment", "feedback", "review", "message"]);
      if (textCol === -1) throw new Error("could not find a text column (try naming it 'text')");
      const idCol = findColumn(header, ["id"]);
      const labelCol = findColumn(header, ["label", "theme", "category"]);
      const data = rows.slice(1).map((r) => ({
        id: idCol >= 0 ? r[idCol] : undefined,
        text: r[textCol],
        label: labelCol >= 0 ? r[labelCol] : null,
      }));
      const name = $("csv-project-name").value.trim() || file.name.replace(/\.csv$/i, "");
      state.project = createProject(name, data);
      state.modelDirty = true;
      state.skipped.clear();
      saveLocal(state.project);
      show("label");
    } catch (exc) {
      flash(`Could not load that CSV: ${exc.message}`);
    }
  };
  reader.readAsText(file);
});

$("btn-load-project").addEventListener("click", () => {
  const file = $("file-project").files[0];
  if (!file) return flash("Pick a project file first.");
  const reader = new FileReader();
  reader.onload = () => {
    try {
      state.project = fromJSON(String(reader.result));
      state.modelDirty = true;
      state.skipped.clear();
      saveLocal(state.project);
      show("label");
    } catch (exc) {
      flash(`Could not open that file: ${exc.message}`);
    }
  };
  reader.readAsText(file);
});

$("btn-resume-local").addEventListener("click", () => {
  const p = loadLocal();
  if (p) {
    state.project = p;
    state.modelDirty = true;
    show("label");
  }
});

$("btn-discard-local").addEventListener("click", () => {
  clearLocal();
  $("resume-panel").style.display = "none";
});

function flash(msg) {
  const el = $("start-status");
  el.textContent = msg;
  el.style.display = "block";
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cur = "";
  let inQ = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQ) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; }
      else if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cur); cur = "";
      if (row.some((c) => c.trim() !== "")) rows.push(row);
      row = [];
    } else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); if (row.some((c) => c.trim() !== "")) rows.push(row); }
  return rows;
}

function findColumn(header, names) {
  const lower = header.map((h) => String(h).trim().toLowerCase());
  for (const n of names) {
    const idx = lower.indexOf(n);
    if (idx >= 0) return idx;
  }
  return -1;
}

// ------------------------------------------------------------------ label ----
function renderLabel() {
  const p = state.project;
  if (!p) {
    $("label-project-name").textContent = "No project loaded";
    $("label-work").style.display = "none";
    $("label-queue-panel").style.display = "none";
    return;
  }
  const c = counts(p);
  $("label-project-name").textContent = p.name;
  $("label-progress-text").textContent = `${c.labeled} labeled, ${c.unlabeled} to go`;
  $("label-progress-fill").style.width = `${(100 * c.labeled) / Math.max(1, c.labeled + c.unlabeled)}%`;
  $("label-class-chips").innerHTML = Object.entries(c.perClass)
    .map(([cls, n]) => `<span class="chip">${esc(displayClass(cls))}: ${n}</span>`).join("");

  if (!c.unlabeled) {
    $("label-work").style.display = "block";
    $("suggestion-reason").textContent = "";
    $("current-text").textContent = "Everything is labeled. Nice work - check the dashboard or export your results.";
    $("class-buttons").innerHTML = "";
    $("after-label").style.display = "none";
    $("label-queue-panel").style.display = "none";
    return;
  }

  const queue = suggestionQueue(6);
  if (!queue.ids.length) return;
  if (!state.currentId || !queue.ids.includes(state.currentId)) {
    state.currentId = queue.ids[0];
    state.lastExpectation = null;
  }

  $("label-work").style.display = "block";
  $("suggestion-reason").textContent = queue.mode === "active"
    ? "Picked because the model is least sure about this one - your label teaches it the most."
    : "Cold start: showing a varied spread of comments until the model has examples from at least two themes.";
  $("current-text").textContent = getItem(p, state.currentId).text;

  $("class-buttons").innerHTML = "";
  for (const cls of p.classes) {
    const b = document.createElement("button");
    b.textContent = displayClass(cls);
    b.addEventListener("click", () => labelCurrent(cls));
    $("class-buttons").appendChild(b);
  }

  $("label-queue-panel").style.display = "block";
  $("queue-list").innerHTML = queue.ids.slice(1, 6)
    .map((id) => `<li>${esc(getItem(p, id).text)}</li>`).join("");
}

function labelCurrent(label) {
  const p = state.project;
  if (!p || !state.currentId) return;
  const model = state.model && !state.modelDirty ? state.model : null;
  if (model) {
    const proba = model.predictProba([getItem(p, state.currentId).text])[0];
    state.lastExpectation = model.classes_
      .map((cls, i) => ({ cls, p: proba[i] }))
      .sort((a, b) => b.p - a.p);
  } else {
    state.lastExpectation = null;
  }
  addLabel(p, state.currentId, label);
  state.modelDirty = true;
  state.skipped.delete(state.currentId);
  state.currentId = null;
  saveLocal(p);
  renderAfterLabel();
  renderLabel();
}

function renderAfterLabel() {
  if (!state.lastExpectation) { $("after-label").style.display = "none"; return; }
  const max = Math.max(...state.lastExpectation.map((e) => e.p), 0.01);
  $("conf-bars").innerHTML = state.lastExpectation.slice(0, 4).map((e) => `
    <div class="confbar">
      <span class="cls">${esc(displayClass(e.cls))}</span>
      <span class="bar" style="width:${Math.round(140 * e.p / max)}px"></span>
      <span>${Math.round(e.p * 100)}%</span>
    </div>`).join("");
  $("after-label").style.display = "block";
}

$("btn-add-class").addEventListener("click", () => {
  const name = $("new-class-name").value.trim().toLowerCase().replace(/\s+/g, "_");
  if (!name || !state.project) return;
  labelCurrent(name);
  $("new-class-name").value = "";
});

$("btn-skip").addEventListener("click", () => {
  if (state.currentId) state.skipped.add(state.currentId);
  state.currentId = null;
  renderLabel();
});

$("btn-undo").addEventListener("click", () => {
  const p = state.project;
  if (!p || !p.history.length) return;
  const last = p.history.pop();
  const item = getItem(p, last.id);
  if (last.label !== null && last.label !== undefined) {
    item.label = null;
  } else if (last.prev) {
    item.label = last.prev;
  }
  state.modelDirty = true;
  saveLocal(p);
  render();
});

// --------------------------------------------------------------- dashboard ----
function renderDashboard() {
  const p = state.project;
  if (!p) { $("dash-summary").textContent = "Load a project first."; return; }
  const c = counts(p);
  $("dash-summary").textContent =
    `${p.name}: ${c.labeled} of ${c.labeled + c.unlabeled} comments labeled.`;
  $("dash-chips").innerHTML = Object.entries(c.perClass)
    .map(([cls, n]) => `<span class="chip">${esc(displayClass(cls))}: ${n}</span>`).join("");

  const model = ensureModel();
  renderTopTerms(model);
  renderPredDist(model);
  renderTruth(p);
  $("history-list").innerHTML = p.history.slice(-12).reverse()
    .map((h) => `<li>${h.label === null ? "Cleared" : `Labeled <b>${esc(displayClass(h.label))}</b>`} - ${esc(getItem(p, h.id).text.slice(0, 90))}</li>`)
    .join("") || "<li>No labels yet.</li>";
}

function renderTopTerms(model) {
  if (!model) {
    $("top-terms").innerHTML = "<span class='muted'>Label at least two themes and the learned signals appear here.</span>";
    return;
  }
  const vocab = model.vectorizer.vocab;
  const invVocab = [...vocab.entries()];
  const C = model.model.classes.length;
  const F = model.model.nFeatures;
  $("top-terms").innerHTML = model.model.classes.map((cls, ci) => {
    const w = model.model.W.slice(ci * F, (ci + 1) * F);
    const top = [...w.keys()].sort((a, b) => w[b] - w[a]).slice(0, 8)
      .map((fi) => invVocab.find(([, idx]) => idx === fi)?.[0])
      .filter(Boolean);
    return `<div style="margin-bottom:8px"><b>${esc(displayClass(cls))}</b><br><span class="muted">${top.map(esc).join(" · ")}</span></div>`;
  }).join("");
}

function renderPredDist(model) {
  const p = state.project;
  const un = unlabeledItems(p);
  if (!model || !un.length) {
    $("pred-dist").innerHTML = `<span class="muted">${un.length ? "Train the model with a few more labels first." : "Nothing left unlabeled."}</span>`;
    return;
  }
  const proba = model.predictProba(un.map((it) => it.text));
  const byClass = {};
  let high = 0, mid = 0, low = 0;
  proba.forEach((pr) => {
    const m = Math.max(...pr);
    const cls = model.classes_[pr.indexOf(m)];
    byClass[cls] = (byClass[cls] || 0) + 1;
    if (m >= 0.7) high++; else if (m >= 0.45) mid++; else low++;
  });
  const rows = Object.entries(byClass).sort((a, b) => b[1] - a[1])
    .map(([cls, n]) => `<tr><td>${esc(displayClass(cls))}</td><td>${n}</td></tr>`).join("");
  $("pred-dist").innerHTML = `
    <table class="plain"><tr><th>Predicted theme</th><th>Comments</th></tr>${rows}</table>
    <p class="muted small" style="margin-top:8px">Confidence: ${high} high (&ge;70%), ${mid} medium, ${low} low (&lt;45%) - the low-confidence ones are worth labeling next.</p>`;
}

function renderTruth(p) {
  const withTruth = p.items.filter((it) => it.truth && it.label);
  if (!withTruth.length) { $("truth-panel").style.display = "none"; return; }
  const agree = withTruth.filter((it) => it.label === it.truth).length;
  $("truth-panel").style.display = "block";
  $("truth-stats").innerHTML =
    `<b>${agree} of ${withTruth.length}</b> of your labels agree with the hidden reference (${Math.round((100 * agree) / withTruth.length)}%). ` +
    `Disagreements are often the ambiguous comments - trust your own read.`;
}

// --------------------------------------------------------------- benchmark ----
function svgLineChart(series, { width = 880, height = 320, pad = 46 } = {}) {
  const xs = series[0].x;
  const allY = series.flatMap((s) => s.y.flatMap((y, i) => (s.band ? [y + s.band[i], y - s.band[i]] : [y])));
  const xMin = Math.min(...xs), xMax = Math.max(...xs);
  const yMin = Math.max(0, Math.min(...allY) - 0.03), yMax = Math.min(1.02, Math.max(...allY) + 0.03);
  const X = (x) => pad + ((x - xMin) / Math.max(1, xMax - xMin)) * (width - 2 * pad);
  const Y = (y) => height - pad - ((y - yMin) / (yMax - yMin)) * (height - 2 * pad);

  let out = `<svg class="chart" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">`;
  for (let t = 0.2; t <= 1.001; t += 0.2) {
    out += `<line x1="${pad}" y1="${Y(t)}" x2="${width - pad}" y2="${Y(t)}" stroke="#e7e1d2" stroke-width="1"/>`;
    out += `<text x="${pad - 8}" y="${Y(t) + 4}" text-anchor="end" font-size="11" fill="#6b7263">${t.toFixed(1)}</text>`;
  }
  [xMin, Math.round((xMin + xMax) / 2), xMax].forEach((t) => {
    out += `<text x="${X(t)}" y="${height - pad + 18}" text-anchor="middle" font-size="11" fill="#6b7263">${t}</text>`;
  });
  out += `<text x="${pad - 30}" y="${pad - 22}" font-size="11" fill="#6b7263">macro-F1</text>`;
  out += `<text x="${width / 2}" y="${height - 8}" text-anchor="middle" font-size="11" fill="#6b7263">labels used</text>`;

  for (const s of series) {
    if (s.band) {
      const upper = s.y.map((y, i) => `${X(s.x[i])},${Y(Math.min(1, y + s.band[i]))}`).join(" ");
      const lower = s.y.map((y, i) => `${X(s.x[i])},${Y(Math.max(0, y - s.band[i]))}`).reverse().join(" ");
      out += `<polygon points="${upper} ${lower}" fill="${s.color}" opacity="0.12"/>`;
    }
    const pts = s.y.map((y, i) => `${X(s.x[i])},${Y(y)}`).join(" ");
    out += `<polyline points="${pts}" fill="none" stroke="${s.color}" stroke-width="2"/>`;
  }
  let lx = width - pad - 170;
  for (const s of series) {
    out += `<line x1="${lx}" y1="${pad - 22}" x2="${lx + 22}" y2="${pad - 22}" stroke="${s.color}" stroke-width="2"/>`;
    out += `<text x="${lx + 28}" y="${pad - 18}" font-size="12" fill="#22302a">${esc(s.name)}</text>`;
    lx += 110;
  }
  return out + "</svg>";
}

function renderBench(bench, note) {
  state.bench = bench;
  const { curves, finalReport: rep } = bench;
  $("bench-chart").innerHTML = svgLineChart([
    { name: "active (model picks)", color: "#2e6b4f", x: curves.active.labelsUsed, y: curves.active.f1Mean, band: curves.active.f1Std },
    { name: "random", color: "#b4552d", x: curves.random.labelsUsed, y: curves.random.f1Mean, band: curves.random.f1Std },
  ]);
  const aLast = curves.active.f1Mean.at(-1);
  const rLast = curves.random.f1Mean.at(-1);
  $("bench-numbers").innerHTML =
    `After <b>${curves.active.labelsUsed.at(-1)}</b> labels: active <b>${aLast}</b> vs random <b>${rLast}</b> macro-F1. ` +
    `Labels needed to reach 95% of each curve's best: <b>${curves.activeLabelsTo95}</b> (active) vs <b>${curves.randomLabelsTo95}</b> (random). ` +
    `${note ? `<span class="muted">${esc(note)}</span>` : ""}`;
  const perClass = rep.perClass
    .map((r) => `<tr><td>${esc(displayClass(r.class))}</td><td>${r.precision}</td><td>${r.recall}</td><td>${r.f1}</td><td>${r.support}</td></tr>`)
    .join("");
  $("final-report").innerHTML =
    `<p>Training on the full demo set and testing on a held-out 30% split: macro-F1 <b>${rep.macroF1}</b> ` +
    `(bootstrap 95% interval [${rep.macroF1ci95[0]}, ${rep.macroF1ci95[1]}], n=${rep.nTest}).</p>` +
    `<table class="plain"><tr><th>Theme</th><th>Precision</th><th>Recall</th><th>F1</th><th>Support</th></tr>${perClass}</table>`;
}

async function loadBench() {
  if (state.bench) return;
  try {
    const res = await fetch("benchmark.json");
    if (!res.ok) throw new Error(String(res.status));
    renderBench(await res.json(), "Precomputed by scripts/run_benchmark.mjs - re-run it live above.");
  } catch {
    $("bench-status").textContent = "Could not load the precomputed numbers - use the re-run button.";
  }
}

$("btn-rerun-bench").addEventListener("click", () => {
  $("bench-status").textContent = "Running in your browser (a few seconds)...";
  setTimeout(() => {
    const t0 = performance.now();
    import("./dataset.js").then(({ generate }) => {
      const { texts, labels } = generate({ nPerClass: 60, seed: 7 });
      const curves = compareStrategies(texts, labels, { modelOpts: { iters: 200 } });
      const rep = finalReport(texts, labels, { nBoot: 300, modelOpts: { iters: 200 } });
      renderBench({ dataset: {}, setup: {}, curves, finalReport: rep },
        `Computed live in your browser in ${((performance.now() - t0) / 1000).toFixed(1)}s.`);
      $("bench-status").textContent = "Done.";
    });
  }, 30);
});

// ------------------------------------------------------------------ export ----
function download(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

$("btn-download-project").addEventListener("click", () => {
  if (!state.project) return;
  download(`${slug(state.project.name)}.labelloop.json`, toJSON(state.project), "application/json");
});

$("btn-clear-local").addEventListener("click", () => clearLocal());

$("btn-download-csv").addEventListener("click", () => {
  const p = state.project;
  if (!p) return;
  const escCsv = (s) => `"${String(s ?? "").replaceAll('"', '""')}"`;
  const rows = ["id,text,label"]
    .concat(p.items.map((it) => [escCsv(it.id), escCsv(it.text), escCsv(it.label || "")].join(",")));
  download(`${slug(p.name)}-labeled.csv`, rows.join("\n"), "text/csv");
});

$("btn-download-modelcard").addEventListener("click", () => {
  const p = state.project;
  if (!p) return;
  const c = counts(p);
  const lines = [
    `# Model card: ${p.name}`,
    "",
    `- Trained in the browser with LabelLoop (TF-IDF + multinomial logistic regression).`,
    `- Labeled examples: ${c.labeled} across ${p.classes.length} themes (${Object.entries(c.perClass).map(([k, v]) => `${displayClass(k)}: ${v}`).join(", ")}).`,
    `- Confidence scores shown by the app are indicative, not calibrated probabilities.`,
    "",
    "## Intended use",
    "Triage of short open-text feedback into human-chosen themes, with a person reviewing the model's least-confident items. Not for automated decisions about people.",
    "",
    "## Limitations",
    "Small labeled sets make scores unstable; short ambiguous comments are routinely confused; the model only knows the themes you taught it. Always spot-check the low-confidence pile.",
    "",
    "## Provenance",
    "Labels were assigned by a human reviewer using active-learning suggestions. This tool and its demo data were built with AI assistance; the demo dataset is synthetic.",
  ];
  download(`${slug(p.name)}-model-card.md`, lines.join("\n"), "text/markdown");
});

$("btn-reset").addEventListener("click", () => {
  state.project = null;
  state.model = null;
  state.currentId = null;
  state.skipped.clear();
  clearLocal();
  render();
  show("start");
});

// ------------------------------------------------------------------ helpers ----
function displayClass(cls) {
  return CLASS_LABELS[cls] || cls.replace(/_/g, " ");
}

function esc(s) {
  return String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function slug(s) {
  return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "labelloop";
}

function render() {
  renderLabel();
  renderDashboard();
  const active = document.querySelector("#tabs button.active")?.dataset.page;
  if (active === "benchmark") loadBench();
}

// -------------------------------------------------------------------- boot ----
(function boot() {
  const saved = (() => { try { return loadLocal(); } catch { return null; } })();
  if (saved) {
    const c = counts(saved);
    $("resume-summary").textContent =
      `${saved.name}: ${c.labeled} labeled, ${c.unlabeled} to go.`;
    $("resume-panel").style.display = "block";
  }
  document.querySelector('#tabs button[data-page="benchmark"]').addEventListener("click", loadBench);
  render();
})();
