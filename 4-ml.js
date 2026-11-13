// ML core for LabelLoop. Pure JavaScript, no dependencies, runs in the browser
// and in Node (the test suite and benchmark import the same modules).
//
// Model: TF-IDF (1-2 grams, sublinear tf, smoothed idf, L2-normalised rows)
// feeding a multinomial logistic regression trained by full-batch gradient
// descent. Small, fast, inspectable, and honest about what it is: a strong
// classical baseline for short text, not a neural network.

import { mulberry32 } from "./rng.js";

// ---------------------------------------------------------------- text ----
export function tokenize(text) {
  const norm = String(text)
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
  return norm.split(/[^a-z0-9]+/).filter((t) => t.length >= 2);
}

export function ngrams(tokens, maxN = 2) {
  const out = [];
  for (let n = 1; n <= maxN; n++) {
    for (let i = 0; i + n <= tokens.length; i++) {
      out.push(tokens.slice(i, i + n).join(" "));
    }
  }
  return out;
}

// ----------------------------------------------------------- vectorizer ----
export class TfidfVectorizer {
  constructor({ maxFeatures = 20000, maxNgram = 2 } = {}) {
    this.maxFeatures = maxFeatures;
    this.maxNgram = maxNgram;
    this.vocab = new Map();
    this.idf = null;
    this.fitted = false;
  }

  fit(texts) {
    const df = new Map();
    for (const text of texts) {
      const seen = new Set(ngrams(tokenize(text), this.maxNgram));
      for (const g of seen) df.set(g, (df.get(g) || 0) + 1);
    }
    const terms = [...df.entries()]
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .slice(0, this.maxFeatures);
    this.vocab = new Map(terms.map(([term], i) => [term, i]));
    const n = texts.length;
    this.idf = new Float64Array(this.vocab.size);
    for (const [term, i] of this.vocab) {
      this.idf[i] = Math.log((1 + n) / (1 + df.get(term))) + 1;
    }
    this.fitted = true;
    return this;
  }

  transformOne(text) {
    if (!this.fitted) throw new Error("vectorizer is not fitted");
    const counts = new Map();
    for (const g of ngrams(tokenize(text), this.maxNgram)) {
      const idx = this.vocab.get(g);
      if (idx !== undefined) counts.set(idx, (counts.get(idx) || 0) + 1);
    }
    const vec = new Map();
    let norm = 0;
    for (const [idx, c] of counts) {
      const v = (1 + Math.log(c)) * this.idf[idx];
      vec.set(idx, v);
      norm += v * v;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [idx, v] of vec) vec.set(idx, v / norm);
    return vec;
  }

  transform(texts) {
    return texts.map((t) => this.transformOne(t));
  }

  get nFeatures() {
    return this.vocab.size;
  }
}

// ----------------------------------------------------------- classifier ----
export class SoftmaxRegression {
  constructor({ lr = 0.6, l2 = 1e-4, iters = 300 } = {}) {
    this.lr = lr;
    this.l2 = l2;
    this.iters = iters;
    this.W = null;
    this.classes = [];
    this.fitted = false;
  }

  fit(vectors, yIdx, classes, nFeatures) {
    const C = classes.length;
    if (C < 2) throw new Error("need at least two classes to train");
    const F = nFeatures;
    if (!Number.isFinite(F) || F <= 0) throw new Error("no features to train on");
    const n = vectors.length;
    const W = new Float64Array(C * F);

    const counts = new Array(C).fill(0);
    for (const y of yIdx) counts[y]++;
    const weights = counts.map((c) => n / (C * Math.max(c, 1)));

    for (let it = 0; it < this.iters; it++) {
      const grad = new Float64Array(C * F);
      for (let d = 0; d < n; d++) {
        const scores = new Float64Array(C);
        for (const [f, v] of vectors[d]) {
          for (let c = 0; c < C; c++) scores[c] += W[c * F + f] * v;
        }
        const p = softmax(scores);
        p[yIdx[d]] -= 1;
        const w = weights[yIdx[d]];
        for (const [f, v] of vectors[d]) {
          for (let c = 0; c < C; c++) grad[c * F + f] += p[c] * v * w;
        }
      }
      const inv = 1 / n;
      for (let j = 0; j < W.length; j++) {
        W[j] -= this.lr * (grad[j] * inv + this.l2 * W[j]);
      }
    }
    this.W = W;
    this.classes = classes;
    this.nFeatures = F;
    this.fitted = true;
    return this;
  }

  probaOne(vec) {
    if (!this.fitted) throw new Error("classifier is not fitted");
    const C = this.classes.length;
    const scores = new Float64Array(C);
    for (const [f, v] of vec) {
      for (let c = 0; c < C; c++) scores[c] += this.W[c * this.nFeatures + f] * v;
    }
    return softmax(scores);
  }

  predictProba(vectors) {
    return vectors.map((v) => this.probaOne(v));
  }

  predict(vectors) {
    return this.predictProba(vectors).map((p) => this.classes[argmax(p)]);
  }
}

function softmax(scores) {
  const m = Math.max(...scores);
  const exps = scores.map((s) => Math.exp(s - m));
  const sum = exps.reduce((a, b) => a + b, 0);
  return exps.map((e) => e / sum);
}

function argmax(arr) {
  let best = 0;
  for (let i = 1; i < arr.length; i++) if (arr[i] > arr[best]) best = i;
  return best;
}

// -------------------------------------------------- combined estimator -----
export class FeedbackClassifier {
  constructor(opts = {}) {
    this.vectorizer = new TfidfVectorizer(opts);
    this.model = new SoftmaxRegression(opts);
    this.classes_ = [];
    this.fitted = false;
  }

  fit(texts, labels) {
    if (texts.length !== labels.length) {
      throw new Error("texts and labels must have the same length");
    }
    const classes = [...new Set(labels)].sort();
    if (classes.length < 2) {
      throw new Error("need examples from at least two classes to train");
    }
    const vectors = this.vectorizer.fit(texts).transform(texts);
    const yIdx = labels.map((l) => classes.indexOf(l));
    this.model.fit(vectors, yIdx, classes, this.vectorizer.nFeatures);
    this.classes_ = classes;
    this.fitted = true;
    return this;
  }

  predictProba(texts) {
    if (!this.fitted) throw new Error("train the classifier first");
    return this.model.predictProba(this.vectorizer.transform(texts));
  }

  predict(texts) {
    if (!this.fitted) throw new Error("train the classifier first");
    return this.model.predict(this.vectorizer.transform(texts));
  }

  // Top-1 minus top-2 confidence. Lower means the model is less sure.
  margins(texts) {
    return this.predictProba(texts).map((p) => {
      const s = [...p].sort((a, b) => b - a);
      return s.length === 1 ? 1 : s[0] - s[1];
    });
  }
}

// ------------------------------------------------- active-learning pick ----
export function uncertaintyOrder(margins) {
  return margins
    .map((m, i) => [m, i])
    .sort((a, b) => a[0] - b[0])
    .map(([, i]) => i);
}

// Greedy farthest-first over L2-normalised TF-IDF vectors: the cold-start
// strategy when there is no model yet, so the seed batch covers varied topics.
export function diverseOrder(texts, seed = 0) {
  const vec = new TfidfVectorizer();
  const vectors = vec.fit(texts).transform(texts);
  return farthestFirst(vectors, seed);
}

function farthestFirst(vectors, seed) {
  const n = vectors.length;
  if (n === 0) return [];
  const rng = mulberry32(seed);
  const first = Math.floor(rng() * n);
  const chosen = [first];
  const minDist = vectors.map((v) => 1 - dot(v, vectors[first]));
  while (chosen.length < n) {
    let next = 0;
    for (let i = 1; i < n; i++) if (minDist[i] > minDist[next]) next = i;
    chosen.push(next);
    for (let i = 0; i < n; i++) {
      minDist[i] = Math.min(minDist[i], 1 - dot(vectors[i], vectors[next]));
    }
  }
  return chosen;
}

// Margin sampling with a diversity guard: take the most uncertain pool, then
// spread the final picks across it. Plain uncertainty sampling tends to grab
// near-duplicates of one ambiguous wording; this keeps the batch informative.
export function suggestNext(model, texts, k, seed = 0) {
  if (texts.length === 0 || k <= 0) return [];
  const margins = model.margins(texts);
  const pool = uncertaintyOrder(margins).slice(
    0,
    Math.min(texts.length, Math.max(k * 3, k)),
  );
  if (pool.length <= k) return pool;
  const vectors = model.vectorizer.transform(pool.map((i) => texts[i]));
  return farthestFirst(vectors, seed).slice(0, k).map((j) => pool[j]);
}

function dot(a, b) {
  let s = 0;
  const [small, big] = a.size <= b.size ? [a, b] : [b, a];
  for (const [k, v] of small) {
    const w = big.get(k);
    if (w !== undefined) s += v * w;
  }
  return s;
}
