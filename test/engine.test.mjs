import test from "node:test";
import assert from "node:assert/strict";
import {
  simulateTradition,
  scoreGuess,
  normalizeText,
  SAMPLES,
} from "../js/engine.js";

const sentence = SAMPLES[0].text;

test("copies branch across dated generations and hide the earliest ones", () => {
  const tradition = simulateTradition({
    original: sentence,
    seed: 20260907,
    generations: 6,
    hideGenerations: 2,
    startYear: 60,
    care: "careful",
  });

  assert.equal(tradition.manuscripts[0].text, sentence);
  assert.ok(tradition.stats.surviving >= 8);
  assert.ok(tradition.stats.uniqueReadings >= 2);
  assert.ok(tradition.visible.every((ms) => ms.generation >= 2));
  assert.ok(tradition.hidden.every((ms) => ms.generation < 2));
  assert.ok(tradition.stats.earliestVisibleYear > tradition.startYear);

  const years = [...new Set(tradition.manuscripts.map((ms) => ms.year))];
  assert.ok(years.length >= 5);
  assert.ok(years.every((year) => Number.isFinite(year)));
});

test("tiny independent errors still leave the original recoverable", () => {
  const tradition = simulateTradition({
    original: sentence,
    seed: 77,
    generations: 6,
    hideGenerations: 2,
    care: "careful",
  });
  const scholar = scoreGuess(tradition.reconstruction.text, sentence);
  assert.ok(
    scholar.similarity >= 0.86,
    `expected a close reconstruction, got ${scholar.similarity}`,
  );
  assert.ok(tradition.visible.some((ms) => ms.text !== sentence));
});

test("sloppy scribes create more variants than careful scribes", () => {
  const careful = simulateTradition({
    original: sentence,
    seed: 11,
    generations: 6,
    hideGenerations: 2,
    care: "careful",
  });
  const sloppy = simulateTradition({
    original: sentence,
    seed: 11,
    generations: 6,
    hideGenerations: 2,
    care: "sloppy",
  });
  const carefulErrors = careful.manuscripts.reduce((n, ms) => n + ms.notes.length, 0);
  const sloppyErrors = sloppy.manuscripts.reduce((n, ms) => n + ms.notes.length, 0);
  assert.equal(sloppy.stats.surviving, careful.stats.surviving);
  assert.ok(sloppy.stats.uniqueReadings >= careful.stats.uniqueReadings);
  assert.ok(sloppyErrors > carefulErrors);
});

test("normalizeText ignores punctuation and case", () => {
  assert.equal(
    normalizeText("The Lord is my shepherd; I shall not want."),
    "the lord is my shepherd i shall not want",
  );
});
