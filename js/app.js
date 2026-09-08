import {
  SAMPLES,
  CARE_PRESETS,
  simulateTradition,
  formatCirca,
  formatYear,
  groupByGeneration,
  parentOf,
  highlightAgainst,
  scoreGuess,
} from "./engine.js";
import { descendantCount, drawStemma, nodePoint, updateStemmaSelection } from "./tree.js";

const state = {
  screen: "compose",
  tradition: null,
  selectedMsId: null,
  reconstructionChoices: [],
  guess: "",
  revealed: false,
  treeZoom: 1,
};

const els = {
  screens: document.querySelectorAll(".screen"),
  original: document.querySelector("#original"),
  samples: document.querySelector("#samples"),
  generations: document.querySelector("#generations"),
  hideGenerations: document.querySelector("#hideGenerations"),
  care: document.querySelector("#care"),
  startYear: document.querySelector("#startYear"),
  copyBtn: document.querySelector("#copyBtn"),
  skipCopyBtn: document.querySelector("#skipCopyBtn"),
  copyStats: document.querySelector("#copyStats"),
  copyLog: document.querySelector("#copyLog"),
  copyStatus: document.querySelector("#copyStatus"),
  hiddenNote: document.querySelector("#hiddenNote"),
  studyStats: document.querySelector("#studyStats"),
  tabs: document.querySelector("#tabs"),
  tabPanels: {
    witnesses: document.querySelector("#panel-witnesses"),
    readings: document.querySelector("#panel-readings"),
    tree: document.querySelector("#panel-tree"),
    reconstruct: document.querySelector("#panel-reconstruct"),
  },
  guessField: document.querySelector("#guess"),
  useScholar: document.querySelector("#useScholar"),
  useMajority: document.querySelector("#useMajority"),
  selectedWitness: document.querySelector("#selectedWitness"),
  revealBtn: document.querySelector("#revealBtn"),
  backToCompose: document.querySelector("#backToCompose"),
  revealBody: document.querySelector("#revealBody"),
  againBtn: document.querySelector("#againBtn"),
  shareBtn: document.querySelector("#shareBtn"),
};

function showScreen(name) {
  state.screen = name;
  els.screens.forEach((screen) => {
    screen.classList.toggle("active", screen.dataset.screen === name);
  });
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function renderSamples() {
  els.samples.innerHTML = "";
  for (const sample of SAMPLES) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.textContent = sample.label;
    btn.addEventListener("click", () => {
      els.original.value = sample.text;
      els.startYear.value = String(sample.startYear);
      [...els.samples.children].forEach((child) => child.classList.remove("active"));
      btn.classList.add("active");
    });
    els.samples.appendChild(btn);
  }
}

function collectOptions(seed) {
  return {
    original: els.original.value,
    generations: Number(els.generations.value),
    hideGenerations: Number(els.hideGenerations.value),
    care: els.care.value,
    startYear: Number(els.startYear.value),
    minCopies: 2,
    maxCopies: 3,
    seed,
  };
}

function sleep(ms) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function runCopying(tradition, { animate }) {
  showScreen("copying");
  els.copyLog.innerHTML = "";
  els.copyStats.innerHTML = "";
  els.skipCopyBtn.hidden = !animate;
  els.copyStatus.textContent = animate ? "Scribes are copying…" : "Copies complete.";
  els.copyStatus.classList.toggle("pulse", animate);

  const groups = groupByGeneration(tradition.manuscripts);
  let aborted = false;
  const skip = () => {
    aborted = true;
  };
  els.skipCopyBtn.onclick = skip;

  for (const group of groups) {
    if (group.generation === 0) continue;
    const card = document.createElement("div");
    card.className = "log-item";
    const errors = group.items.flatMap((ms) => ms.notes).slice(0, 3);
    const errorLine = errors.length
      ? errors.map((note) => `${note.from} → ${note.to}`).join(" · ")
      : "almost letter-perfect copies";
    card.innerHTML = `<small>${formatCirca(group.year)} · generation ${group.generation}</small>
      <div>${group.items.length} new copies</div>
      <div class="err">${errorLine}</div>`;
    els.copyLog.prepend(card);

    els.copyStats.innerHTML = `
      <div class="stat"><b>${tradition.manuscripts.filter((ms) => ms.generation <= group.generation).length - 1}</b><span>copies so far</span></div>
      <div class="stat"><b>${formatYear(group.year)}</b><span>this generation</span></div>
    `;

    if (animate && !aborted) await sleep(650);
  }

  els.copyStatus.classList.remove("pulse");
  els.copyStatus.textContent = "The earliest copies are lost.";
  els.skipCopyBtn.hidden = true;
  renderStudy(tradition);
  if (animate && !aborted) await sleep(700);
  showScreen("study");
}

function renderStudy(tradition) {
  const { stats } = tradition;
  const hiddenYears = tradition.hidden.length
    ? `${formatCirca(tradition.hidden[0].year)}–${formatCirca(tradition.hidden[tradition.hidden.length - 1].year)}`
    : "the first copies";

  if (tradition.hideGenerations <= 1) {
    els.hiddenNote.innerHTML = `<strong>Lost to time:</strong> the original sentence is hidden. Every surviving copy is later, and each one is dated.`;
  } else {
    els.hiddenNote.innerHTML = `<strong>Lost to time:</strong> the autograph and the first copies (${hiddenYears}) are hidden. You only have later witnesses, each with a date.`;
  }

  els.studyStats.innerHTML = `
    <div class="stat"><b>${stats.surviving}</b><span>surviving copies</span></div>
    <div class="stat"><b>${stats.uniqueReadings}</b><span>distinct wordings</span></div>
    <div class="stat"><b>${formatCirca(stats.earliestVisibleYear)}</b><span>oldest survivor</span></div>
    <div class="stat"><b>${formatCirca(stats.latestVisibleYear)}</b><span>latest copy</span></div>
  `;

  renderWitnesses(tradition);
  renderReadings(tradition);
  renderTree(tradition);
  renderAssembler(tradition);
  els.guessField.value = "";
  state.guess = "";
  state.selectedMsId = tradition.visible[0]?.id ?? null;
  setTab("witnesses");
}

function renderWitnesses(tradition) {
  const groups = groupByGeneration(tradition.visible);
  const consensus = tradition.reconstruction.text;
  els.tabPanels.witnesses.innerHTML = "";

  for (const group of groups) {
    const block = document.createElement("section");
    block.className = "gen-block";
    const yearsAfter = group.year - tradition.startYear;
    block.innerHTML = `<div class="gen-head">
      <strong>${formatCirca(group.year)}</strong>
      <span>gen ${group.generation} · ${yearsAfter} years later · ${group.items.length} copies</span>
    </div>`;
    const list = document.createElement("div");
    list.className = "ms-list";
    const previewCount = 5;
    const renderItems = (items) => {
      list.innerHTML = "";
      for (const ms of items) {
        list.appendChild(manuscriptCard(tradition, ms, consensus));
      }
    };
    renderItems(group.items.slice(0, previewCount));
    block.appendChild(list);
    if (group.items.length > previewCount) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "ghost";
      more.textContent = `Show all ${group.items.length} copies from ${formatCirca(group.year)}`;
      more.addEventListener("click", () => {
        renderItems(group.items);
        more.remove();
      });
      block.appendChild(more);
    }
    els.tabPanels.witnesses.appendChild(block);
  }
}

function manuscriptCard(tradition, ms, reference) {
  const parent = parentOf(tradition, ms);
  const parentNote = parent
    ? parent.hidden
      ? `copied from a lost ${parent.siglum}`
      : `copied from ${parent.siglum}`
    : "autograph";
  const card = document.createElement("article");
  card.className = "ms-card";
  const bits = highlightAgainst(ms.text, reference);
  const html = bits
    .map((bit) => {
      if (bit.kind === "missing") return "";
      return `<span class="word ${bit.kind}">${escapeHtml(bit.word)}</span>`;
    })
    .join(" ");
  card.innerHTML = `<div class="ms-meta"><span>${ms.siglum} · ${formatCirca(ms.year)}</span><span>${parentNote}</span></div>
    <div class="ms-text">${html}</div>`;
  return card;
}

function renderReadings(tradition) {
  els.tabPanels.readings.innerHTML = "";
  const intro = document.createElement("p");
  intro.className = "hint";
  intro.textContent =
    "Each line is a distinct wording among the surviving copies. Earlier dates and bigger groups usually sit closer to the lost original.";
  els.tabPanels.readings.appendChild(intro);

  for (const reading of tradition.readings) {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "reading-card";
    card.innerHTML = `<div class="reading-meta"><span>${reading.count} cop${reading.count === 1 ? "y" : "ies"}</span><span>${formatCirca(reading.earliest)}–${formatCirca(reading.latest)}</span></div>
      <div class="reading-text">${escapeHtml(reading.text)}</div>`;
    card.addEventListener("click", () => {
      els.guessField.value = reading.text;
      state.guess = reading.text;
      setTab("reconstruct");
    });
    els.tabPanels.readings.appendChild(card);
  }
}

function renderTree(tradition) {
  const panel = els.tabPanels.tree;
  const scroller = panel.querySelector(".evo-scroll");
  const saved = scroller
    ? { left: scroller.scrollLeft, top: scroller.scrollTop }
    : { left: 0, top: 0 };
  panel.innerHTML = "";

  const hint = document.createElement("p");
  hint.className = "hint";
  hint.textContent =
    "Time runs down the page, like an evolutionary tree. Each split is a scribe copying a parent. Color is the wording — a new color is a mutation. Faded branches are lost copies.";
  panel.appendChild(hint);

  const toolbar = document.createElement("div");
  toolbar.className = "evo-toolbar";
  const fitBtn = document.createElement("button");
  fitBtn.type = "button";
  fitBtn.className = "ghost evo-tool";
  fitBtn.textContent = "Fit tree";
  const minusBtn = document.createElement("button");
  minusBtn.type = "button";
  minusBtn.className = "ghost evo-tool";
  minusBtn.textContent = "−";
  minusBtn.setAttribute("aria-label", "Zoom out");
  const plusBtn = document.createElement("button");
  plusBtn.type = "button";
  plusBtn.className = "ghost evo-tool";
  plusBtn.textContent = "+";
  plusBtn.setAttribute("aria-label", "Zoom in");
  toolbar.append(fitBtn, minusBtn, plusBtn);
  panel.appendChild(toolbar);

  const viewport = document.createElement("div");
  viewport.className = "evo-viewport";
  const scroll = document.createElement("div");
  scroll.className = "evo-scroll";

  const selectedId = state.selectedMsId ?? tradition.manuscripts[0]?.id;
  const { svg, layout } = drawStemma(tradition, {
    selectedId,
    onSelect: (id) => {
      state.selectedMsId = id;
      const drawn = panel.querySelector(".evo-svg");
      updateStemmaSelection(drawn, tradition, id);
      showDockedWitness(tradition, id);
      if (state.treeZoom > 1) centerTreeNode(tradition, layout, id);
    },
  });
  svg.style.width = `${Math.max(100, state.treeZoom * 100)}%`;
  scroll.appendChild(svg);
  viewport.appendChild(scroll);
  panel.appendChild(viewport);
  scroll.scrollLeft = saved.left;
  scroll.scrollTop = saved.top;

  fitBtn.addEventListener("click", () => {
    state.treeZoom = 1;
    renderTree(tradition);
    const next = panel.querySelector(".evo-scroll");
    if (next) {
      next.scrollLeft = 0;
      next.scrollTop = 0;
    }
  });
  minusBtn.addEventListener("click", () => {
    state.treeZoom = Math.max(1, Math.round((state.treeZoom - 0.7) * 10) / 10);
    renderTree(tradition);
  });
  plusBtn.addEventListener("click", () => {
    state.treeZoom = Math.min(6, Math.round((state.treeZoom + 0.7) * 10) / 10);
    renderTree(tradition);
  });

  showDockedWitness(tradition, selectedId);
}

function showDockedWitness(tradition, id) {
  const dock = els.selectedWitness;
  if (!dock) return;
  const selected = tradition.manuscripts.find((ms) => ms.id === id);
  dock.replaceChildren();
  if (!selected) {
    dock.hidden = true;
    return;
  }
  const preview = selected.hidden
    ? lostCard(tradition, selected)
    : manuscriptCard(tradition, selected, tradition.reconstruction.text);
  preview.dataset.preview = "true";
  dock.appendChild(preview);
  dock.hidden = state.screen !== "study" || !els.tabPanels.tree || els.tabPanels.tree.hidden;
}

function centerTreeNode(tradition, layout, id) {
  const panel = els.tabPanels.tree;
  const next = panel.querySelector(".evo-scroll");
  const drawn = panel.querySelector(".evo-svg");
  const node = tradition.manuscripts.find((ms) => ms.id === id);
  if (!next || !drawn || !node) return;
  const point = nodePoint(node, layout);
  const box = drawn.viewBox.baseVal;
  const scaleX = drawn.clientWidth / box.width;
  const scaleY = drawn.clientHeight / box.height;
  next.scrollLeft = point.x * scaleX - next.clientWidth / 2;
  next.scrollTop = point.y * scaleY - next.clientHeight / 2;
}

function lostCard(tradition, ms) {
  const later = descendantCount(tradition.manuscripts, ms.id, true);
  const parent = parentOf(tradition, ms);
  const card = document.createElement("article");
  card.className = "ms-card lost-card";
  card.innerHTML = `<div class="ms-meta"><span>${ms.siglum} · ${formatCirca(ms.year)}</span><span>lost copy</span></div>
    <div class="ms-text">This generation did not survive. The wording is hidden, just as the autograph is. ${later} later cop${later === 1 ? "y" : "ies"} still descend from it${parent ? `, through ${parent.siglum}` : ""}.</div>`;
  return card;
}

function renderAssembler(tradition) {
  const panel = els.tabPanels.reconstruct;
  const host = panel.querySelector("#assembler");
  host.innerHTML = "";
  state.reconstructionChoices = tradition.reconstruction.columns.map((col) => col.word);

  tradition.reconstruction.columns.forEach((col, index) => {
    const wrap = document.createElement("div");
    wrap.className = "word-pick";
    const top = col.options.slice(0, 3);
    for (const option of top) {
      if (option.word === "∅") continue;
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = option.word;
      if (option.word === state.reconstructionChoices[index]) btn.classList.add("active");
      btn.addEventListener("click", () => {
        state.reconstructionChoices[index] = option.word;
        els.guessField.value = state.reconstructionChoices.filter(Boolean).join(" ");
        state.guess = els.guessField.value;
        renderAssembler(tradition);
      });
      wrap.appendChild(btn);
    }
    const meta = document.createElement("em");
    const best = col.options[0];
    meta.textContent = best ? `${best.count}×` : "";
    wrap.appendChild(meta);
    host.appendChild(wrap);
  });
}

function setTab(name) {
  document.querySelectorAll(".tab").forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.tab === name);
  });
  Object.entries(els.tabPanels).forEach(([key, panel]) => {
    panel.hidden = key !== name;
  });
  if (els.selectedWitness) {
    els.selectedWitness.hidden = name !== "tree" || !els.selectedWitness.childElementCount;
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function reveal() {
  const tradition = state.tradition;
  if (!tradition) return;
  const guess = els.guessField.value.trim();
  const user = scoreGuess(guess, tradition.original);
  const scholar = scoreGuess(tradition.reconstruction.text, tradition.original);
  const majority = scoreGuess(tradition.reconstruction.majorityExact.text, tradition.original);
  state.revealed = true;
  showScreen("reveal");

  const pct = Math.round(user.similarity * 100);
  const scholarPct = Math.round(scholar.similarity * 100);
  const majorityPct = Math.round(majority.similarity * 100);

  els.revealBody.innerHTML = `
    <div class="score">${pct}%</div>
    <p class="lede">${user.exact ? "You recovered the original wording." : "Close — this is how textual criticism works: the original is usually still sitting in the later copies."}</p>
    <div class="compare">
      <article class="ms-card">
        <div class="ms-meta"><span>Your reconstruction</span><span>${Math.round(user.wordAccuracy * 100)}% of words</span></div>
        <div class="ms-text">${escapeHtml(guess || "—")}</div>
      </article>
      <article class="ms-card">
        <div class="ms-meta"><span>Hidden original</span><span>${formatCirca(tradition.startYear)}</span></div>
        <div class="ms-text">${escapeHtml(tradition.original)}</div>
      </article>
      <article class="ms-card">
        <div class="ms-meta"><span>Scholar’s reconstruction from dated copies</span><span>${scholarPct}%</span></div>
        <div class="ms-text">${escapeHtml(tradition.reconstruction.text)}</div>
      </article>
    </div>
    <div class="stat-grid">
      <div class="stat"><b>${tradition.stats.uniqueReadings}</b><span>variants among survivors</span></div>
      <div class="stat"><b>${majorityPct}%</b><span>most-common wording</span></div>
      <div class="stat"><b>${tradition.stats.surviving}</b><span>later copies used</span></div>
      <div class="stat"><b>${CARE_PRESETS[tradition.care].label}</b><span>scribal care</span></div>
    </div>
    <section class="panel lesson">
      <h3>Why this illustrates the Bible’s text</h3>
      <p>We do not have the first New Testament documents. What we have is a large family of later copies, written over centuries, each with a roughly known date. Copyists introduced small, independent mistakes — a letter here, a skipped “and” there — so the copies disagree in many little ways.</p>
      <p>Disagreement is not the same thing as losing the original. Because the mistakes are not all the same, comparing the witnesses, and giving extra weight to earlier ones, usually recovers the first wording. In this run the dated copies reconstructed the original at <strong>${scholarPct}%</strong> even after the first ${tradition.hideGenerations} generation${tradition.hideGenerations === 1 ? "" : "s"} were hidden.</p>
      <p>The real New Testament tradition is far richer than this toy model: thousands of Greek manuscripts, plus early translations and quotations, with fragments from the second century. Variants exist, and scholars still argue about a few of them. The point of the experiment is the one you just felt: a text copied many times can still be recovered after the autograph is gone.</p>
    </section>
  `;
}

function shareTradition() {
  const tradition = state.tradition;
  const text = tradition
    ? `I hid the original sentence and recovered it from later dated copies in Witnesses. ${tradition.stats.surviving} surviving manuscripts, ${tradition.stats.uniqueReadings} variants.`
    : "Witnesses — a phone lab for manuscript copying and biblical textual reliability.";
  if (navigator.share) {
    navigator.share({ title: "Witnesses", text, url: location.href }).catch(() => {});
    return;
  }
  navigator.clipboard?.writeText(`${text} ${location.href}`);
  els.shareBtn.textContent = "Copied";
  window.setTimeout(() => {
    els.shareBtn.textContent = "Share";
  }, 1600);
}

function resetCompose() {
  state.tradition = null;
  state.revealed = false;
  if (els.selectedWitness) {
    els.selectedWitness.replaceChildren();
    els.selectedWitness.hidden = true;
  }
  showScreen("compose");
}

async function startRun({ animate = true, seed } = {}) {
  const original = els.original.value.trim();
  if (original.length < 8) {
    els.original.focus();
    return;
  }
  const tradition = simulateTradition(collectOptions(seed));
  state.tradition = tradition;
  state.revealed = false;
  await runCopying(tradition, { animate });
}

function bind() {
  renderSamples();
  els.samples.children[0]?.click();

  els.copyBtn.addEventListener("click", () => startRun({ animate: true }));
  els.revealBtn.addEventListener("click", reveal);
  els.againBtn.addEventListener("click", resetCompose);
  els.backToCompose.addEventListener("click", resetCompose);
  els.shareBtn.addEventListener("click", shareTradition);
  els.guessField.addEventListener("input", () => {
    state.guess = els.guessField.value;
  });
  els.useScholar.addEventListener("click", () => {
    if (!state.tradition) return;
    els.guessField.value = state.tradition.reconstruction.text;
    state.guess = els.guessField.value;
    setTab("reconstruct");
  });
  els.useMajority.addEventListener("click", () => {
    if (!state.tradition) return;
    els.guessField.value = state.tradition.reconstruction.majorityExact.text;
    state.guess = els.guessField.value;
    setTab("reconstruct");
  });
  els.tabs.addEventListener("click", (event) => {
    const tab = event.target.closest("[data-tab]");
    if (tab) setTab(tab.dataset.tab);
  });

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => {});
  }
}

bind();
