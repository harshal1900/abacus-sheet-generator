// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const { jsPDF } = require('../vendor/jspdf.umd.min.js');
const gen = require('../js/generator.js');
const pdf = require('../js/pdf.js');

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 'all'];

const { rat, add, sub, mul, div, eq, answerValue, evalInline, evalStack } = require('./exact.js');

for (const level of LEVELS) {
  test(`level ${level}: answers are correct and questions are unique`, () => {
    for (let s = 0; s < 15; s++) {
      const sheet = gen.generateWorksheet(level, 200);
      assert.strictEqual(sheet.questions.length, 200);
      const seen = new Set();
      for (const q of sheet.questions) {
        const key = JSON.stringify(q.kind === 'stack' ? q.lines : q.tokens);
        assert.ok(!seen.has(key), 'duplicate question ' + key);
        seen.add(key);
        if (level !== 'all') assert.strictEqual(q.level, level);
        const expected = q.kind === 'stack' ? evalStack(q) : evalInline(q.tokens);
        assert.ok(eq(expected, answerValue(q.answer)),
          `wrong answer for ${key}: got ${JSON.stringify(q.answer)}`);
      }
    }
  });
}

test('level 1 sums stay within 1-9 bead range or simple numbers', () => {
  const sheet = gen.generateWorksheet(1, 300);
  for (const q of sheet.questions) {
    assert.strictEqual(q.kind, 'stack');
    for (const l of q.lines) assert.ok(Math.abs(Number(l)) < 100);
  }
});

test('beginner levels only add and subtract', () => {
  for (const level of [1, 2, 3]) {
    const sheet = gen.generateWorksheet(level, 200);
    assert.ok(sheet.questions.every((q) => q.type === 'addsub'));
  }
});

test('questions vary in operation, digits and number of rows', () => {
  const sheet = gen.generateWorksheet(5, 200);
  const ops = new Set(sheet.questions.map((q) => q.type));
  assert.ok(ops.size >= 3, 'expected several operations');
  const sums = sheet.questions.filter((q) => q.type === 'addsub');
  assert.ok(new Set(sums.map((q) => q.lines.length)).size >= 3, 'expected varied row counts');
  const lengths = new Set(sums.flatMap((q) => q.lines.map((l) => l.replace('-', '').length)));
  assert.ok(lengths.size >= 2, 'expected varied digit lengths');
});

test('all levels mode mixes levels', () => {
  const sheet = gen.generateWorksheet('all', 200);
  assert.strictEqual(new Set(sheet.questions.map((q) => q.level)).size, 8);
});

test('count is clamped to 10..500', () => {
  assert.strictEqual(gen.generateWorksheet(3, 2).questions.length, 10);
  assert.strictEqual(gen.generateWorksheet(3, 9999).questions.length, 500);
});

test('same sheet id reproduces the same worksheet', () => {
  const a = gen.generateWorksheet(7, 50, 'ABC234');
  const b = gen.generateWorksheet(7, 50, 'ABC234');
  assert.deepStrictEqual(a.questions, b.questions);
});

test('pdf has question pages, one blank page and the answer key', () => {
  for (const [level, count] of [[1, 10], [8, 100], ['all', 500]]) {
    const sheet = gen.generateWorksheet(level, count);
    const doc = pdf.buildPdf(jsPDF, sheet, gen.LEVELS);
    assert.strictEqual(sheet.ordered.length, count, 'every question is placed once');
    assert.deepStrictEqual(sheet.ordered.map((q) => q.number), sheet.ordered.map((_, i) => i + 1));
    assert.ok(doc.internal.getNumberOfPages() >= 3);
    assert.ok(doc.output('arraybuffer').byteLength > 1000);
  }
});

test('decimal numbers never end in a trailing zero', () => {
  for (const level of [6, 7, 8]) {
    const sheet = gen.generateWorksheet(level, 300);
    for (const q of sheet.questions) {
      if (q.kind !== 'stack' || q.type === 'addsub') continue;
      for (const l of q.lines) assert.ok(!/\.\d*0$/.test(l), 'trailing zero in ' + l);
    }
  }
});
