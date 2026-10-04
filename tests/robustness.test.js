// Edge cases: counts, reproducibility, fallbacks and speed.
const test = require('node:test');
const assert = require('node:assert');
const { jsPDF } = require('../vendor/jspdf.umd.min.js');
const gen = require('../js/generator.js');
const pdf = require('../js/pdf.js');
const { COUNT } = require('../js/config.js');
const { checkAnswer } = require('./exact.js');

const ALL = [1, 2, 3, 4, 5, 6, 7, 8, 'all', 'quick'];
const sizeOf = (s) => (s.type === 'quick' ? s.rows.length : s.questions.length);

test('smallest and largest counts work for every level', () => {
  for (const level of ALL) {
    for (const count of [COUNT.min, COUNT.max]) {
      const sheet = gen.generateWorksheet(level, count);
      assert.strictEqual(sizeOf(sheet), count, `${level} × ${count}`);
      assert.strictEqual(sheet.warning, null);
      if (sheet.questions) sheet.questions.forEach(checkAnswer);
      const doc = pdf.buildPdf(jsPDF, sheet, gen.LEVELS);
      assert.ok(doc.internal.getNumberOfPages() >= 3, 'questions + blank + key');
    }
  }
});

test('counts outside the range are clamped, bad input falls back to the default', () => {
  assert.strictEqual(gen.clampCount(0), COUNT.min);
  assert.strictEqual(gen.clampCount(9999), COUNT.max);
  assert.strictEqual(gen.clampCount('abc'), COUNT.default);
  assert.strictEqual(gen.clampCount('42'), 42);
});

test('same Sheet ID, level and count reproduce the same sheet for every level', () => {
  for (const level of ALL) {
    const a = gen.generateWorksheet(level, 80, 'SAME42');
    const b = gen.generateWorksheet(level, 80, 'SAME42');
    assert.deepStrictEqual(a, b);
    const c = gen.generateWorksheet(level, 80, 'OTHER7');
    assert.notDeepStrictEqual(a.questions || a.rows, c.questions || c.rows);
  }
});

test('clamped counts share a seed (count 2 and count 10 give the same sheet)', () => {
  assert.deepStrictEqual(
    gen.generateWorksheet(5, 2, 'CLAMP1').questions,
    gen.generateWorksheet(5, 10, 'CLAMP1').questions);
});

test('the blank page sits right before the answer key', () => {
  for (const level of [3, 'quick']) {
    const sheet = gen.generateWorksheet(level, 50);
    const doc = pdf.buildPdf(jsPDF, sheet, gen.LEVELS);
    const pages = doc.internal.pages.slice(1).map((p) => p.join('\n'));
    const key = pages.findIndex((p) => p.includes('(Answer Key)'));
    assert.ok(key > 1, 'answer key found');
    assert.ok(pages[key - 1].includes('intentionally left blank'));
    assert.ok(pages.every((p) => p.includes('Sheet ID: ' + sheet.id)), 'Sheet ID in every footer');
  }
});

test('a level that cannot make enough questions stops quickly with a clear warning', () => {
  const tiny = {
    1: {
      name: 'Tiny', stage: 'Test', tint: [255, 255, 255],
      formulas: ['direct'], maxTotal: 2,
      mix: [{ type: 'addsub', weight: 1, rows: [2, 2], digits: [1, 1], sub: 0 }]
    }
  };
  const started = Date.now();
  const sheet = gen.generateWorksheet(1, 500, 'TINY99', { levels: tiny });
  assert.ok(Date.now() - started < 2000, 'no endless loop');
  assert.strictEqual(sheet.questions.length, 1); // only 1 + 1 is possible
  assert.match(sheet.warning, /only had 1 different question/);
  assert.ok(pdf.buildPdf(jsPDF, sheet, tiny));
});

test('a level whose rules allow no sum at all returns an empty sheet, not a hang', () => {
  const impossible = {
    1: {
      name: 'None', stage: 'Test', tint: [255, 255, 255],
      formulas: ['direct'], maxTotal: 3,
      mix: [{ type: 'addsub', weight: 1, rows: [3, 3], digits: [2, 2], sub: 0 }]
    }
  };
  const sheet = gen.generateWorksheet(1, 20, 'NONE01', { levels: impossible });
  assert.strictEqual(sheet.questions.length, 0);
  assert.ok(sheet.warning);
});

test('unknown levels and question types fail loudly', () => {
  assert.throws(() => gen.generateWorksheet(9, 10), /Unknown level/);
  const bad = { 1: { formulas: [], maxTotal: null, mix: [{ type: 'nope', weight: 1 }] } };
  assert.throws(() => gen.generateWorksheet(1, 10, 'X', { levels: bad }), /Unknown question type/);
});

test('500 questions build quickly for every level', () => {
  for (const level of ALL) {
    const started = Date.now();
    const sheet = gen.generateWorksheet(level, 500);
    pdf.buildPdf(jsPDF, sheet, gen.LEVELS).output('arraybuffer');
    const ms = Date.now() - started;
    assert.ok(ms < 3000, `${level}: ${ms} ms`);
  }
});
