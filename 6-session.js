// Project session model and portable save/load for LabelLoop.
//
// A project is a named set of feedback items with optional labels plus the
// audit history of labeling decisions. It serializes to a single JSON file so a
// user can download their work, close the browser, and resume later on any
// machine. The app also autosaves to localStorage; nothing is sent anywhere.

export const SCHEMA_VERSION = 1;
const STORAGE_KEY = "labelloop.project.v1";

export function createProject(name, rows, classes = null) {
  const seen = new Set();
  const items = [];
  rows.forEach((row, i) => {
    const text = String(row.text ?? "").trim();
    if (!text) return;
    const id = String(row.id || `item-${String(i).padStart(4, "0")}`);
    if (seen.has(id)) throw new Error(`duplicate id in data: ${id}`);
    seen.add(id);
    const raw = row.label;
    const label = raw !== null && raw !== undefined && String(raw).trim()
      ? String(raw).trim()
      : null;
    const item = { id, text, label };
    if (row.truth) item.truth = String(row.truth);
    items.push(item);
  });
  if (!items.length) throw new Error("no usable rows: need at least one non-empty text");
  const cls = classes ?? [...new Set(items.filter((it) => it.label).map((it) => it.label))].sort();
  return {
    schema: "labelloop-project",
    version: SCHEMA_VERSION,
    name: String(name || "Untitled project"),
    created_at: new Date().toISOString(),
    classes: [...cls],
    items,
    history: [],
  };
}

export function addLabel(project, itemId, label, source = "human") {
  const item = getItem(project, itemId);
  if (!project.classes.includes(label)) {
    project.classes.push(label);
    project.classes.sort();
  }
  item.label = label;
  project.history.push({ id: itemId, label, source, at: new Date().toISOString() });
  return project;
}

export function removeLabel(project, itemId) {
  const item = getItem(project, itemId);
  const prev = item.label;
  item.label = null;
  project.history.push({ id: itemId, label: null, prev, source: "human", at: new Date().toISOString() });
  return project;
}

export function getItem(project, itemId) {
  const item = project.items.find((it) => it.id === itemId);
  if (!item) throw new Error(`unknown item id: ${itemId}`);
  return item;
}

export function labeledItems(project) {
  return project.items.filter((it) => it.label);
}

export function unlabeledItems(project) {
  return project.items.filter((it) => !it.label);
}

export function counts(project) {
  const perClass = Object.fromEntries(project.classes.map((c) => [c, 0]));
  for (const it of labeledItems(project)) {
    perClass[it.label] = (perClass[it.label] || 0) + 1;
  }
  return {
    labeled: labeledItems(project).length,
    unlabeled: unlabeledItems(project).length,
    perClass,
  };
}

// ------------------------------------------------------------- persistence ----
export function toJSON(project) {
  return JSON.stringify(project, null, 1);
}

export function fromJSON(blob) {
  let data;
  try {
    data = JSON.parse(blob);
  } catch (exc) {
    throw new Error(`project file is not valid JSON: ${exc.message}`);
  }
  if (!data || data.schema !== "labelloop-project") {
    throw new Error("not a LabelLoop project file");
  }
  if (data.version !== SCHEMA_VERSION) {
    throw new Error(`unsupported project version: ${data.version}`);
  }
  return {
    schema: data.schema,
    version: data.version,
    name: String(data.name),
    created_at: String(data.created_at || ""),
    classes: data.classes.map(String),
    items: data.items.map((it) => ({
      id: String(it.id),
      text: String(it.text),
      label: it.label || null,
      ...(it.truth ? { truth: String(it.truth) } : {}),
    })),
    history: Array.isArray(data.history) ? data.history : [],
  };
}

export function saveLocal(project) {
  localStorage.setItem(STORAGE_KEY, toJSON(project));
}

export function loadLocal() {
  const blob = localStorage.getItem(STORAGE_KEY);
  return blob ? fromJSON(blob) : null;
}

export function clearLocal() {
  localStorage.removeItem(STORAGE_KEY);
}
