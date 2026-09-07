import test from "node:test";
import assert from "node:assert/strict";
import { simulateTradition, SAMPLES } from "../js/engine.js";
import { childrenMap, layoutStemma, lineageIds } from "../js/tree.js";

test("stemma layout places children under their parent like an evolution tree", () => {
  const tradition = simulateTradition({
    original: SAMPLES[0].text,
    seed: 99,
    generations: 5,
    hideGenerations: 2,
    care: "careful",
  });
  const layout = layoutStemma(tradition.manuscripts);
  const { children } = childrenMap(tradition.manuscripts);

  assert.equal(layout.root.parentId, null);
  assert.ok(layout.leafCount >= 4);
  assert.equal(layout.x.get(layout.root.id) != null, true);

  for (const parent of tradition.manuscripts) {
    const kids = children.get(parent.id) ?? [];
    if (kids.length === 0) continue;
    const xs = kids.map((child) => layout.x.get(child.id));
    const parentX = layout.x.get(parent.id);
    assert.ok(parentX >= Math.min(...xs) - 1e-9);
    assert.ok(parentX <= Math.max(...xs) + 1e-9);
    for (const child of kids) {
      assert.equal(child.generation, parent.generation + 1);
    }
  }
});

test("lineage includes ancestors and descendants", () => {
  const tradition = simulateTradition({
    original: SAMPLES[2].text,
    seed: 3,
    generations: 5,
    hideGenerations: 2,
  });
  const leaf = [...tradition.manuscripts].reverse().find((ms) => !ms.hidden);
  const path = lineageIds(tradition.manuscripts, leaf.id);
  assert.ok(path.has(leaf.id));
  assert.ok(path.has(tradition.manuscripts[0].id));
  let cursor = leaf;
  while (cursor.parentId != null) {
    assert.ok(path.has(cursor.parentId));
    cursor = tradition.manuscripts.find((ms) => ms.id === cursor.parentId);
  }
});
