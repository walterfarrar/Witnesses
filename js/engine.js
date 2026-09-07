/**
 * Manuscript transmission engine.
 * Copies a sentence through generations of scribes, each introducing
 * small, independent copyist errors — the same kind of variation
 * textual critics sort through when they reconstruct an earlier text.
 */

const LETTER_CONFUSIONS = {
  a: "oe",
  e: "ia",
  i: "ey",
  o: "au",
  u: "o",
  c: "sk",
  k: "c",
  s: "cz",
  z: "s",
  t: "d",
  d: "t",
  n: "m",
  m: "n",
  b: "p",
  p: "b",
  f: "v",
  v: "f",
  y: "i",
  l: "t",
};

const SMALL_WORDS = new Set([
  "a",
  "an",
  "the",
  "and",
  "or",
  "but",
  "to",
  "of",
  "in",
  "on",
  "for",
  "that",
]);

export const SAMPLES = [
  {
    id: "john11",
    label: "John 1:1",
    text: "In the beginning was the Word, and the Word was with God, and the Word was God.",
    startYear: 60,
  },
  {
    id: "john316",
    label: "John 3:16",
    text: "For God so loved the world that he gave his only Son, that whoever believes in him should not perish but have eternal life.",
    startYear: 60,
  },
  {
    id: "psalm23",
    label: "Psalm 23:1",
    text: "The Lord is my shepherd; I shall not want.",
    startYear: 60,
  },
  {
    id: "hebrews",
    label: "Hebrews 4:12",
    text: "For the word of God is living and active, sharper than any two-edged sword.",
    startYear: 65,
  },
  {
    id: "courier",
    label: "A modern sentence",
    text: "The courier delivered the sealed letter before sunrise and waited for a reply.",
    startYear: 50,
  },
];

export const CARE_PRESETS = {
  careful: { errorRate: 0.09, maxErrors: 1, label: "Careful scribes" },
  typical: { errorRate: 0.16, maxErrors: 2, label: "Typical scribes" },
  sloppy: { errorRate: 0.28, maxErrors: 3, label: "Sloppy scribes" },
};

export function mulberry32(seed) {
  let a = seed >>> 0;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashSeed(value) {
  const text = String(value);
  let h = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function pick(rng, list) {
  return list[Math.floor(rng() * list.length)];
}

export function formatYear(year) {
  if (year < 0) return `${Math.abs(Math.round(year))} BC`;
  return `AD ${Math.round(year)}`;
}

export function formatCirca(year) {
  return `c. ${formatYear(year)}`;
}

export function tokenize(text) {
  return text
    .trim()
    .split(/(\s+)/)
    .filter((part) => part.length > 0);
}

export function isSpace(token) {
  return /^\s+$/.test(token);
}

function lettersOnly(word) {
  return word.replace(/[^A-Za-z]/g, "");
}

function applyToLetters(word, transform) {
  const chars = [...word];
  const letterIdx = [];
  chars.forEach((ch, i) => {
    if (/[A-Za-z]/.test(ch)) letterIdx.push(i);
  });
  if (letterIdx.length === 0) return word;
  transform(chars, letterIdx);
  return chars.join("");
}

function confuseLetter(ch, rng) {
  const lower = ch.toLowerCase();
  const options = LETTER_CONFUSIONS[lower];
  if (!options) return ch;
  const next = options[Math.floor(rng() * options.length)];
  return ch === lower ? next : next.toUpperCase();
}

function mutateWord(word, rng) {
  const core = lettersOnly(word);
  if (core.length < 2) return word;
  const roll = rng();

  if (roll < 0.28) {
    return applyToLetters(word, (chars, idx) => {
      const i = pick(rng, idx);
      chars[i] = confuseLetter(chars[i], rng);
    });
  }
  if (roll < 0.46) {
    return applyToLetters(word, (chars, idx) => {
      const i = pick(rng, idx);
      chars.splice(i, 1);
    });
  }
  if (roll < 0.62) {
    return applyToLetters(word, (chars, idx) => {
      const i = pick(rng, idx);
      chars.splice(i, 0, chars[i]);
    });
  }
  if (roll < 0.78 && core.length > 3) {
    return applyToLetters(word, (chars, idx) => {
      if (idx.length < 2) return;
      const pos = Math.floor(rng() * (idx.length - 1));
      const a = idx[pos];
      const b = idx[pos + 1];
      const tmp = chars[a];
      chars[a] = chars[b];
      chars[b] = tmp;
    });
  }
  if (roll < 0.9) {
    return applyToLetters(word, (chars, idx) => {
      const i = idx[idx.length - 1];
      chars[i] = confuseLetter(chars[i], rng);
    });
  }
  return word.replace(/[;:,.]/, "");
}

function copyOnce(source, rng, { errorRate, maxErrors }) {
  const tokens = tokenize(source);
  const wordPositions = tokens
    .map((token, index) => ({ token, index }))
    .filter((item) => !isSpace(item.token));

  let errorsLeft = maxErrors;
  const notes = [];
  const next = tokens.slice();

  for (const { token, index } of wordPositions) {
    if (errorsLeft <= 0) break;
    if (rng() > errorRate) continue;

    const kind = rng();
    if (kind < 0.12 && SMALL_WORDS.has(token.toLowerCase()) && wordPositions.length > 6) {
      next[index] = "";
      if (next[index + 1] && isSpace(next[index + 1])) next[index + 1] = "";
      notes.push({ type: "omit", from: token, to: "—" });
      errorsLeft -= 1;
      continue;
    }
    if (kind < 0.2 && index > 2) {
      const prevWords = wordPositions.filter((item) => item.index < index);
      const prev = prevWords[prevWords.length - 1];
      if (prev && !isSpace(next[prev.index])) {
        const a = next[prev.index];
        const b = next[index];
        next[prev.index] = b;
        next[index] = a;
        notes.push({ type: "swap", from: `${a} ${b}`, to: `${b} ${a}` });
        errorsLeft -= 1;
        continue;
      }
    }

    const mutated = mutateWord(token, rng);
    if (mutated !== token) {
      next[index] = mutated;
      notes.push({ type: "spell", from: token, to: mutated });
      errorsLeft -= 1;
    }
  }

  const text = next
    .join("")
    .replace(/[ \t]+/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();

  return { text: text || source, notes };
}

function siglum(id, generation) {
  if (generation <= 2) return `P${id}`;
  if (generation <= 4) return String.fromCharCode(65 + ((id - 1) % 26)) + (id > 26 ? String(Math.ceil(id / 26)) : "");
  return String(100 + id);
}

export function simulateTradition(options) {
  const original = options.original.trim().replace(/\s+/g, " ");
  if (!original) throw new Error("Original sentence is empty.");

  const seed = options.seed ?? hashSeed(original + Date.now());
  const topologyRng = mulberry32(seed);
  const errorRng = mulberry32(seed ^ 0x9e3779b9);
  const generations = options.generations ?? 6;
  const hideGenerations = options.hideGenerations ?? 2;
  const startYear = options.startYear ?? 60;
  const minCopies = options.minCopies ?? 2;
  const maxCopies = options.maxCopies ?? 3;
  const care = CARE_PRESETS[options.care] ?? CARE_PRESETS.careful;
  const copyChance = options.copyChance ?? 0.92;

  const manuscripts = [];
  const autograph = {
    id: 1,
    parentId: null,
    generation: 0,
    year: startYear,
    text: original,
    notes: [],
    hidden: hideGenerations > 0,
    siglum: "Autograph",
  };
  manuscripts.push(autograph);

  let nextId = 2;
  const yearGaps = [];
  for (let g = 1; g < generations; g += 1) {
    yearGaps.push(38 + Math.floor(topologyRng() * 42));
  }

  for (let g = 1; g < generations; g += 1) {
    const parents = manuscripts.filter((ms) => ms.generation === g - 1);
    const year = startYear + yearGaps.slice(0, g).reduce((sum, n) => sum + n, 0);
    for (const parent of parents) {
      if (g > 1 && topologyRng() > copyChance) continue;
      const copies = minCopies + Math.floor(topologyRng() * (maxCopies - minCopies + 1));
      for (let i = 0; i < copies; i += 1) {
        const copied = copyOnce(parent.text, errorRng, care);
        manuscripts.push({
          id: nextId,
          parentId: parent.id,
          generation: g,
          year,
          text: copied.text,
          notes: copied.notes,
          hidden: g < hideGenerations,
          siglum: siglum(nextId, g),
        });
        nextId += 1;
      }
    }
  }

  const visible = manuscripts.filter((ms) => !ms.hidden);
  const hidden = manuscripts.filter((ms) => ms.hidden);
  const readings = tallyReadings(visible);
  const reconstruction = reconstructText(visible);

  return {
    seed,
    original,
    startYear,
    generations,
    hideGenerations,
    care: options.care ?? "careful",
    manuscripts,
    visible,
    hidden,
    readings,
    reconstruction,
    stats: {
      totalCopies: manuscripts.length - 1,
      surviving: visible.length,
      hiddenCount: hidden.length,
      uniqueReadings: readings.length,
      earliestVisibleYear: visible.length ? Math.min(...visible.map((ms) => ms.year)) : null,
      latestVisibleYear: visible.length ? Math.max(...visible.map((ms) => ms.year)) : null,
    },
  };
}

export function normalizeText(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function tallyReadings(manuscripts) {
  const map = new Map();
  for (const ms of manuscripts) {
    const key = normalizeText(ms.text);
    if (!map.has(key)) {
      map.set(key, {
        key,
        text: ms.text,
        count: 0,
        earliest: ms.year,
        latest: ms.year,
        ids: [],
      });
    }
    const row = map.get(key);
    row.count += 1;
    row.earliest = Math.min(row.earliest, ms.year);
    row.latest = Math.max(row.latest, ms.year);
    row.ids.push(ms.id);
    if (ms.year <= row.earliest) row.text = ms.text;
  }
  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count;
    return a.earliest - b.earliest;
  });
}

export function wordsOf(text) {
  return normalizeText(text).split(" ").filter(Boolean);
}

export function alignWords(reference, variant) {
  const a = wordsOf(reference);
  const b = wordsOf(variant);
  const n = a.length;
  const m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Array(m + 1).fill(0));
  for (let i = 1; i <= n; i += 1) {
    for (let j = 1; j <= m; j += 1) {
      dp[i][j] =
        a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }
  const pairs = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      pairs.push({ ref: i - 1, var: j - 1, word: b[j - 1] });
      i -= 1;
      j -= 1;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      pairs.push({ ref: i - 1, var: null, word: null });
      i -= 1;
    } else {
      pairs.push({ ref: null, var: j - 1, word: b[j - 1] });
      j -= 1;
    }
  }
  while (i > 0) {
    pairs.push({ ref: i - 1, var: null, word: null });
    i -= 1;
  }
  while (j > 0) {
    pairs.push({ ref: null, var: j - 1, word: b[j - 1] });
    j -= 1;
  }
  pairs.reverse();
  return { reference: a, variant: b, pairs };
}

export function reconstructText(manuscripts) {
  if (manuscripts.length === 0) {
    return { text: "", columns: [], method: "none" };
  }
  const readings = tallyReadings(manuscripts);
  const base = readings[0].text;
  const baseWords = wordsOf(base);
  const columns = baseWords.map((word) => ({
    variants: new Map([[word, { word, weight: 0, count: 0, earliest: Infinity }]]),
  }));

  for (const ms of manuscripts) {
    const ageBoost = 1 + Math.max(0, 4 - (ms.generation || 0)) * 0.35;
    const aligned = alignWords(base, ms.text);
    for (const pair of aligned.pairs) {
      if (pair.ref === null) continue;
      const observed = pair.word ?? "∅";
      const col = columns[pair.ref];
      if (!col.variants.has(observed)) {
        col.variants.set(observed, {
          word: observed,
          weight: 0,
          count: 0,
          earliest: ms.year,
        });
      }
      const cell = col.variants.get(observed);
      cell.weight += ageBoost;
      cell.count += 1;
      cell.earliest = Math.min(cell.earliest, ms.year);
    }
  }

  const chosen = columns.map((col) => {
    const ranked = [...col.variants.values()].sort((a, b) => {
      if (b.weight !== a.weight) return b.weight - a.weight;
      if (a.earliest !== b.earliest) return a.earliest - b.earliest;
      return b.count - a.count;
    });
    return {
      word: ranked[0].word === "∅" ? "" : ranked[0].word,
      options: ranked,
    };
  });

  return {
    text: chosen
      .map((col) => col.word)
      .filter(Boolean)
      .join(" "),
    columns: chosen,
    method: "weighted-majority",
    majorityExact: readings[0],
  };
}

export function levenshtein(a, b) {
  const s = a;
  const t = b;
  const rows = s.length + 1;
  const cols = t.length + 1;
  const dp = Array.from({ length: rows }, () => new Array(cols).fill(0));
  for (let i = 0; i < rows; i += 1) dp[i][0] = i;
  for (let j = 0; j < cols; j += 1) dp[0][j] = j;
  for (let i = 1; i < rows; i += 1) {
    for (let j = 1; j < cols; j += 1) {
      const cost = s[i - 1] === t[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[s.length][t.length];
}

export function scoreGuess(guess, original) {
  const g = normalizeText(guess);
  const o = normalizeText(original);
  if (!g) return { exact: false, similarity: 0, wordAccuracy: 0, distance: o.length };
  const distance = levenshtein(g, o);
  const similarity = 1 - distance / Math.max(g.length, o.length, 1);
  const gw = wordsOf(g);
  const ow = wordsOf(o);
  const aligned = alignWords(o, g);
  let hits = 0;
  for (const pair of aligned.pairs) {
    if (pair.ref !== null && pair.word === ow[pair.ref]) hits += 1;
  }
  return {
    exact: g === o,
    similarity,
    wordAccuracy: ow.length ? hits / ow.length : 0,
    distance,
    guessWords: gw.length,
    originalWords: ow.length,
  };
}

export function highlightAgainst(text, reference) {
  const aligned = alignWords(reference, text);
  const refWords = wordsOf(reference);
  const varWords = wordsOf(text);
  const pieces = [];
  let consumed = 0;
  const rawTokens = text.trim().split(/\s+/);

  for (const pair of aligned.pairs) {
    if (pair.var === null) {
      pieces.push({ word: "", kind: "missing", expected: refWords[pair.ref] });
      continue;
    }
    const display = rawTokens[consumed] ?? varWords[pair.var];
    consumed += 1;
    const kind = pair.ref !== null && pair.word === refWords[pair.ref] ? "same" : "diff";
    pieces.push({ word: display, kind, expected: pair.ref !== null ? refWords[pair.ref] : null });
  }
  while (consumed < rawTokens.length) {
    pieces.push({ word: rawTokens[consumed], kind: "diff", expected: null });
    consumed += 1;
  }
  return pieces;
}

export function groupByGeneration(manuscripts) {
  const groups = new Map();
  for (const ms of manuscripts) {
    if (!groups.has(ms.generation)) {
      groups.set(ms.generation, {
        generation: ms.generation,
        year: ms.year,
        items: [],
      });
    }
    groups.get(ms.generation).items.push(ms);
  }
  return [...groups.values()].sort((a, b) => a.generation - b.generation);
}

export function parentOf(tradition, ms) {
  if (!ms.parentId) return null;
  return tradition.manuscripts.find((item) => item.id === ms.parentId) ?? null;
}

export function readingColor(key) {
  let h = 0;
  for (let i = 0; i < key.length; i += 1) h = (h * 31 + key.charCodeAt(i)) % 360;
  return `hsl(${h} 38% 42%)`;
}
