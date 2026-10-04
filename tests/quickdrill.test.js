// Quick Drill: number, number × 2, number × 5 (multipliers from config).
const test = require('node:test');
const assert = require('node:assert');
const { jsPDF } = require('../vendor/jspdf.umd.min.js');
const gen = require('../js/generator.js');
const pdf = require('../js/pdf.js');
const { QUICK_DRILL } = require('../js/config.js');

function checkSheet(sheet, digits, count) {
  const [lo, hi] = Array.isArray(digits) ? digits : [digits, digits];
  assert.strictEqual(sheet.type, 'quick');
  assert.strictEqual(sheet.rows.length, count);
  const seen = new Set();
  for (const row of sheet.rows) {
    assert.match(row.number, new RegExp(`^[1-9]\\d{${lo - 1},${hi - 1}}$`), 'digits / no leading zero');
    assert.ok(!seen.has(row.number), 'repeated number ' + row.number);
    seen.add(row.number);
    assert.strictEqual(row.answers.length, sheet.multipliers.length);
    sheet.multipliers.forEach((m, i) => {
      assert.strictEqual(row.answers[i], (BigInt(row.number) * BigInt(m)).toString());
    });
  }
}

test('default Quick Drill: random 3-10 digit numbers, × 2 and × 5', () => {
  assert.deepStrictEqual(QUICK_DRILL.digits, [3, 10]);
  assert.deepStrictEqual(QUICK_DRILL.multipliers, [2, 5]);
  const lengths = new Set();
  for (let s = 0; s < 50; s++) {
    const sheet = gen.generateWorksheet('quick', 100);
    assert.deepStrictEqual(sheet.multipliers, [2, 5]);
    assert.strictEqual(sheet.digitLabel, '3-10');
    checkSheet(sheet, [3, 10], 100);
    sheet.rows.forEach((r) => lengths.add(r.number.length));
  }
  assert.strictEqual(lengths.size, 8, 'every length from 3 to 10 shows up');
});

test('Quick Drill with 3 and 10 digits', () => {
  for (const digits of [3, 10]) {
    for (const count of [10, 100, 500]) {
      checkSheet(gen.generateQuickDrill(count, null, { digits }), digits, count);
    }
  }
});

test('Quick Drill very long numbers stay exact', () => {
  checkSheet(gen.generateQuickDrill(50, 'LONG01', { digits: 18, multipliers: [2, 5, 9] }), 18, 50);
});

test('Quick Drill falls back clearly when there are too few numbers', () => {
  const sheet = gen.generateQuickDrill(50, 'TINY01', { digits: 1 });
  assert.strictEqual(sheet.rows.length, 9);
  assert.match(sheet.warning, /Only 9 different/);
});

test('Quick Drill same Sheet ID gives the same sheet', () => {
  const a = gen.generateWorksheet('quick', 60, 'QD1234');
  const b = gen.generateWorksheet('quick', 60, 'QD1234');
  assert.deepStrictEqual(a.rows, b.rows);
  assert.notDeepStrictEqual(a.rows, gen.generateWorksheet('quick', 60, 'QD1235').rows);
});

test('Quick Drill PDF builds for small and large counts', () => {
  for (const [count, digits] of [[10, 3], [100, 8], [500, 10]]) {
    const sheet = gen.generateQuickDrill(count, null, { digits });
    const doc = pdf.buildPdf(jsPDF, sheet, gen.LEVELS);
    assert.ok(doc.internal.getNumberOfPages() >= 3);
  }
});
