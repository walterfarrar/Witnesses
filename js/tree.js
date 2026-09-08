import { formatCirca, normalizeText, readingColor } from "./engine.js";

export function childrenMap(manuscripts) {
  const byId = new Map(manuscripts.map((ms) => [ms.id, ms]));
  const children = new Map(manuscripts.map((ms) => [ms.id, []]));
  for (const ms of manuscripts) {
    if (ms.parentId != null && children.has(ms.parentId)) {
      children.get(ms.parentId).push(ms);
    }
  }
  return { byId, children };
}

export function layoutStemma(manuscripts) {
  if (manuscripts.length === 0) {
    return { root: null, children: new Map(), x: new Map(), leafCount: 0, maxGen: 0 };
  }
  const root = manuscripts.find((ms) => ms.parentId == null) ?? manuscripts[0];
  const { children } = childrenMap(manuscripts);
  const leaves = [];

  function collect(node) {
    const kids = children.get(node.id) ?? [];
    if (kids.length === 0) leaves.push(node);
    else kids.forEach(collect);
  }
  collect(root);

  const x = new Map();
  leaves.forEach((node, index) => x.set(node.id, index));

  function place(node) {
    const kids = children.get(node.id) ?? [];
    if (kids.length === 0) return x.get(node.id) ?? 0;
    const xs = kids.map(place);
    const mid = (Math.min(...xs) + Math.max(...xs)) / 2;
    x.set(node.id, mid);
    return mid;
  }
  place(root);

  const maxGen = Math.max(...manuscripts.map((ms) => ms.generation));
  return { root, children, x, leafCount: leaves.length, maxGen };
}

export function lineageIds(manuscripts, id) {
  const { byId, children } = childrenMap(manuscripts);
  const path = new Set();
  let cursor = byId.get(id);
  while (cursor) {
    path.add(cursor.id);
    cursor = cursor.parentId != null ? byId.get(cursor.parentId) : null;
  }
  const stack = [id];
  while (stack.length) {
    const current = stack.pop();
    path.add(current);
    for (const child of children.get(current) ?? []) stack.push(child.id);
  }
  return path;
}

export function descendantCount(manuscripts, id, onlyVisible = false) {
  const { children } = childrenMap(manuscripts);
  let count = 0;
  const stack = [...(children.get(id) ?? [])];
  while (stack.length) {
    const node = stack.pop();
    if (!onlyVisible || !node.hidden) count += 1;
    stack.push(...(children.get(node.id) ?? []));
  }
  return count;
}

const X0 = 62;
const Y0 = 36;
const X_STEP = 22;
const Y_STEP = 78;

export function stemmaMetrics(layout) {
  const width = X0 + Math.max(layout.leafCount - 1, 0) * X_STEP + 28;
  const height = Y0 + layout.maxGen * Y_STEP + 40;
  return { width, height, X0, Y0, X_STEP, Y_STEP };
}

export function nodePoint(ms, layout) {
  const { width, height, X0, Y0, X_STEP, Y_STEP } = stemmaMetrics(layout);
  return {
    x: X0 + (layout.x.get(ms.id) ?? 0) * X_STEP,
    y: Y0 + ms.generation * Y_STEP,
    width,
    height,
  };
}

function svgEl(name, attrs) {
  const node = document.createElementNS("http://www.w3.org/2000/svg", name);
  for (const [key, value] of Object.entries(attrs)) {
    if (value != null) node.setAttribute(key, String(value));
  }
  return node;
}

export function drawStemma(tradition, { selectedId, onSelect }) {
  const layout = layoutStemma(tradition.manuscripts);
  const { width, height } = stemmaMetrics(layout);
  const selected = lineageIds(tradition.manuscripts, selectedId);
  const generations = [...new Map(tradition.manuscripts.map((ms) => [ms.generation, ms.year])).entries()].sort(
    (a, b) => a[0] - b[0],
  );

  const svg = svgEl("svg", {
    class: "evo-svg",
    viewBox: `0 0 ${width} ${height}`,
    role: "img",
    "aria-label": "Evolutionary tree of manuscript copies",
  });

  const bands = svgEl("g", { class: "evo-bands" });
  for (const [generation, year] of generations) {
    const y = Y0 + generation * Y_STEP;
    const band = svgEl("rect", {
      x: 0,
      y: y - Y_STEP / 2,
      width,
      height: Y_STEP,
      fill: generation % 2 === 0 ? "rgba(243,230,200,0.03)" : "transparent",
    });
    bands.appendChild(band);
    const label = svgEl("text", {
      x: 8,
      y: y + 4,
      class: "evo-year",
    });
    const lost = tradition.manuscripts.some((ms) => ms.generation === generation && ms.hidden);
    label.textContent = `${lost ? "lost " : ""}${formatCirca(year)}`;
    label.style.cursor = "pointer";
    label.addEventListener("click", (event) => {
      event.stopPropagation();
      const pick =
        tradition.manuscripts.find((ms) => ms.generation === generation && ms.id === selectedId) ??
        tradition.manuscripts.find((ms) => ms.generation === generation);
      if (pick) onSelect(pick.id);
    });
    bands.appendChild(label);
  }
  svg.appendChild(bands);

  const edges = svgEl("g", { class: "evo-edges" });
  const highlight = svgEl("g", { class: "evo-highlight" });
  for (const ms of tradition.manuscripts) {
    if (ms.parentId == null) continue;
    const parent = tradition.manuscripts.find((item) => item.id === ms.parentId);
    if (!parent) continue;
    const d = branchPath(parent, ms, layout);
    const muted = svgEl("path", {
      d,
      class: `evo-branch${ms.hidden || parent.hidden ? " lost" : ""}`,
      stroke: readingColor(normalizeText(ms.text)),
    });
    edges.appendChild(muted);
    if (selected.has(ms.id) && selected.has(parent.id)) {
      highlight.appendChild(
        svgEl("path", {
          d,
          class: "evo-branch on",
        }),
      );
    }
  }
  svg.appendChild(edges);
  svg.appendChild(highlight);

  const nodes = svgEl("g", { class: "evo-nodes" });
  for (const ms of tradition.manuscripts) {
    const point = nodePoint(ms, layout);
    const group = svgEl("g", {
      class: `evo-node${ms.hidden ? " lost" : ""}${ms.id === selectedId ? " selected" : ""}${
        selected.has(ms.id) ? " lineage" : ""
      }`,
      transform: `translate(${point.x} ${point.y})`,
      "data-id": ms.id,
    });
    const radius = ms.generation <= 1 ? 9 : ms.generation <= 2 ? 7 : 5.5;
    group.appendChild(
      svgEl("circle", {
        class: "evo-hit",
        r: ms.generation <= 2 ? 22 : 16,
      }),
    );
    group.appendChild(
      svgEl("circle", {
        class: "evo-dot",
        r: radius,
        fill: readingColor(normalizeText(ms.text)),
      }),
    );
    if (ms.generation === 0) {
      const caption = svgEl("text", { class: "evo-root-label", x: 12, y: 4 });
      caption.textContent = "origin";
      group.appendChild(caption);
    }
    group.addEventListener("click", (event) => {
      event.stopPropagation();
      onSelect(ms.id);
    });
    nodes.appendChild(group);
  }
  svg.appendChild(nodes);

  svg.addEventListener("click", (event) => {
    if (event.target.closest(".evo-node")) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;
    const pt = svg.createSVGPoint();
    pt.x = event.clientX;
    pt.y = event.clientY;
    const local = pt.matrixTransform(ctm.inverse());
    let best = null;
    let bestDist = 36;
    for (const ms of tradition.manuscripts) {
      const point = nodePoint(ms, layout);
      const dist = Math.hypot(point.x - local.x, point.y - local.y);
      if (dist < bestDist) {
        best = ms;
        bestDist = dist;
      }
    }
    if (best) onSelect(best.id);
  });

  return { svg, layout, width, height };
}

function branchPath(parent, child, layout) {
  const a = nodePoint(parent, layout);
  const b = nodePoint(child, layout);
  const midY = (a.y + b.y) / 2;
  return `M ${a.x} ${a.y} V ${midY} H ${b.x} V ${b.y}`;
}

export function updateStemmaSelection(svg, tradition, selectedId) {
  if (!svg) return;
  const layout = layoutStemma(tradition.manuscripts);
  const selected = lineageIds(tradition.manuscripts, selectedId);
  svg.querySelectorAll(".evo-node").forEach((node) => {
    const id = Number(node.getAttribute("data-id"));
    node.classList.toggle("selected", id === selectedId);
    node.classList.toggle("lineage", selected.has(id));
  });
  const highlight = svg.querySelector(".evo-highlight");
  if (!highlight) return;
  highlight.replaceChildren();
  for (const ms of tradition.manuscripts) {
    if (ms.parentId == null) continue;
    if (!selected.has(ms.id) || !selected.has(ms.parentId)) continue;
    const parent = tradition.manuscripts.find((item) => item.id === ms.parentId);
    if (!parent) continue;
    highlight.appendChild(svgEl("path", { d: branchPath(parent, ms, layout), class: "evo-branch on" }));
  }
}
