// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const { jsPDF } = require('../vendor/jspdf.umd.min.js');
const gen = require('../js/generator.js');
const pdf = require('../js/pdf.js');

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 'all'];

const { checkAnswer } = require('./exact.js');

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
        checkAnswer(q);
      }
    }
  });
}

test('level 1 sums stay within the 1-9 beads of one rod', () => {
  const sheet = gen.generateWorksheet(1, 300);
  for (const q of sheet.questions) {
    assert.strictEqual(q.kind, 'stack');
    let total = 0;
    for (const l of q.lines) { total += Number(l); assert.ok(total >= 1 && total <= 9); }
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

test('all levels mode mixes levels 1-8 and Quick Drill cards', () => {
  const sheet = gen.generateWorksheet('all', 200);
  assert.strictEqual(new Set(sheet.questions.map((q) => q.level)).size, 9);
});

test('all levels mode has about 12% Quick Drill cards: 3-10 digits × 2 or × 5, exact', () => {
  let quick = 0, total = 0;
  const lengths = new Set(), multipliers = new Set();
  for (let s = 0; s < 40; s++) {
    for (const q of gen.generateWorksheet('all', 200).questions) {
      total++;
      if (q.type !== 'quick') continue;
      quick++;
      assert.strictEqual(q.level, 'quick');
      assert.match(q.lines[0], /^[1-9]\d{2,9}$/);
      lengths.add(q.lines[0].length);
      multipliers.add(q.lines[1]);
      checkAnswer(q);
    }
  }
  const share = quick / total;
  assert.ok(share > 0.08 && share < 0.16, 'quick share ' + share);
  assert.strictEqual(lengths.size, 8, 'every length from 3 to 10 shows up');
  assert.deepStrictEqual([...multipliers].sort(), ['×2', '×5']);
});

test('single levels never get Quick Drill cards', () => {
  for (let level = 1; level <= 8; level++) {
    assert.ok(!gen.generateWorksheet(level, 300).questions.some((q) => q.type === 'quick'));
  }
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

// ---------- new question types ----------

function questionsOfType(type, level, n = 400) {
  const qs = [];
  for (let s = 0; qs.length < n && s < 200; s++) {
    for (const q of gen.generateWorksheet(level, 500, 'T' + type + s).questions) {
      if (q.type === type) qs.push(q);
    }
  }
  assert.ok(qs.length > 0, 'no ' + type + ' questions at level ' + level);
  return qs;
}

test('squares and cubes have exact answers', () => {
  for (const [type, level] of [['square', 6], ['square', 8], ['cube', 7], ['cube', 8]]) {
    for (const q of questionsOfType(type, level)) {
      checkAnswer(q);
      assert.ok(Number(q.tokens[0].v) % 10 !== 0, 'no trivial base like 40');
    }
  }
});

test('LCM and HCF are correct and not trivial', () => {
  for (const q of questionsOfType('lcm', 8)) {
    checkAnswer(q);
    const args = q.tokens[0].args.map(Number);
    const product = args.reduce((a, b) => a * b);
    assert.ok(Number(q.answer[0].v) < product, 'LCM should not just be the product');
  }
  for (const q of questionsOfType('hcf', 7)) {
    checkAnswer(q);
    assert.ok(Number(q.answer[0].v) > 1, 'HCF should be more than 1');
  }
});

test('negative-number sums only appear at levels 7-8 and go below zero', () => {
  for (let level = 1; level <= 6; level++) {
    assert.ok(!gen.generateWorksheet(level, 500).questions.some((q) => q.type === 'negsum'));
  }
  for (const q of questionsOfType('negsum', 8)) {
    checkAnswer(q);
    let total = 0, below = false;
    for (const l of q.lines) { total += Number(l); if (total < 0) below = true; }
    assert.ok(below, 'some subtotal must be negative: ' + q.lines);
  }
});

test('division with remainder starts at level 5 and is always "Q R r"', () => {
  for (let level = 1; level <= 4; level++) {
    assert.ok(!gen.generateWorksheet(level, 500).questions.some((q) => q.type === 'divrem'));
  }
  for (const level of [5, 6, 7, 8]) {
    for (const q of questionsOfType('divrem', level)) {
      checkAnswer(q);
      assert.strictEqual(q.answerHint, 'R');
    }
  }
});

test('decimal add/sub, multiply and divide appear at every level that teaches decimals', () => {
  for (const level of [6, 7, 8]) {
    const qs = gen.generateWorksheet(level, 500).questions;
    const dec = (q) => (q.lines || []).some((l) => l.includes('.'));
    assert.ok(qs.some((q) => q.type === 'addsub' && dec(q)), 'decimal sums at ' + level);
    assert.ok(qs.some((q) => q.type === 'mul' && dec(q)), 'decimal × at ' + level);
    assert.ok(qs.some((q) => q.type === 'div' && dec(q)), 'decimal ÷ at ' + level);
  }
  for (const level of [1, 2, 3, 4, 5]) {
    const qs = gen.generateWorksheet(level, 300).questions;
    assert.ok(!qs.some((q) => (q.lines || []).some((l) => l.includes('.'))), 'no decimals at ' + level);
  }
});

test('PDF pages: no near-empty last page, questions numbered in layout order', () => {
  for (const level of [1, 4, 8, 'all', 'quick']) {
    for (const count of [10, 37, 100, 250, 500]) {
      const sheet = gen.generateWorksheet(level, count);
      pdf.buildPdf(jsPDF, sheet, gen.LEVELS);
      const fill = sheet.pageFill;
      assert.ok(fill.every((f) => f <= 1.0001), 'nothing runs off a page');
      if (fill.length > 1) {
        assert.ok(fill[fill.length - 1] >= 0.35, `last page only ${fill[fill.length - 1]} full (${level}, ${count})`);
      }
      if (sheet.ordered) {
        assert.deepStrictEqual(sheet.ordered.map((q) => q.number), sheet.ordered.map((_, i) => i + 1));
      }
    }
  }
});
