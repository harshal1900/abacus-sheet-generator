// Run with: node --test tests/
const test = require('node:test');
const assert = require('node:assert');
const { jsPDF } = require('../vendor/jspdf.umd.min.js');
const gen = require('../js/generator.js');
const pdf = require('../js/pdf.js');

const LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 'all'];

// Exact rational arithmetic on [numerator, denominator] using BigInt so the
// check does not share any float code with the generator.
function rat(str) {
  if (str.includes('/')) {
    const [n, d] = str.split('/');
    return [BigInt(n), BigInt(d)];
  }
  const neg = str.startsWith('-');
  const s = neg ? str.slice(1) : str;
  const [w, f = ''] = s.split('.');
  const v = BigInt(w + f) * (neg ? -1n : 1n);
  return [v, 10n ** BigInt(f.length)];
}
const add = (a, b) => [a[0] * b[1] + b[0] * a[1], a[1] * b[1]];
const sub = (a, b) => add(a, [-b[0], b[1]]);
const mul = (a, b) => [a[0] * b[0], a[1] * b[1]];
const div = (a, b) => [a[0] * b[1], a[1] * b[0]];
const eq = (a, b) => a[0] * b[1] === b[0] * a[1];

function tokenValue(t) {
  if (t.t === 'num') return rat(t.v.replace('%', ''));
  if (t.t === 'frac') return [BigInt(t.n), BigInt(t.d)];
  throw new Error('not a value token: ' + t.t);
}

function answerValue(tokens) {
  // A mixed number is [whole, frac].
  return tokens.map(tokenValue).reduce(add, [0n, 1n]);
}

// Evaluate an inline expression with normal precedence (× ÷ before + -).
function evalInline(tokens) {
  const root = tokens.find((t) => t.t === 'root');
  if (root) {
    const v = Number(root.v);
    const k = root.index === '3' ? 3 : 2;
    const r = Math.round(Math.pow(v, 1 / k));
    assert.strictEqual(r ** k, v, 'root must be perfect: ' + root.v);
    return [BigInt(r), 1n];
  }
  const ofIdx = tokens.findIndex((t) => t.t === 'text' && t.v === 'of');
  if (ofIdx >= 0) {
    const left = tokens[0];
    const base = tokenValue(tokens[ofIdx + 1]);
    const part = left.t === 'num' && left.v.endsWith('%')
      ? div(tokenValue(left), [100n, 1n]) : tokenValue(left);
    return mul(part, base);
  }
  // Shunting-yard for + - × ÷ and parentheses.
  const prec = { '+': 1, '-': 1, '×': 2, '÷': 2 };
  const out = [], ops = [];
  const apply = () => {
    const o = ops.pop(), b = out.pop(), a = out.pop();
    out.push({ '+': add, '-': sub, '×': mul, '÷': div }[o](a, b));
  };
  for (const t of tokens) {
    if (t.t === 'num' || t.t === 'frac') out.push(tokenValue(t));
    else if (t.v === '(') ops.push('(');
    else if (t.v === ')') { while (ops[ops.length - 1] !== '(') apply(); ops.pop(); }
    else {
      while (ops.length && ops[ops.length - 1] !== '(' && prec[ops[ops.length - 1]] >= prec[t.v]) apply();
      ops.push(t.v);
    }
  }
  while (ops.length) apply();
  return out[0];
}

function evalStack(q) {
  if (q.op === 'mul') return mul(rat(q.lines[0]), rat(q.lines[1].slice(1)));
  if (q.op === 'div') return div(rat(q.lines[0]), rat(q.lines[1].slice(1)));
  let total = [0n, 1n];
  for (const line of q.lines) {
    total = add(total, rat(line));
    assert.ok(total[0] * total[1] > 0n, 'running total must stay above zero: ' + q.lines.join(','));
  }
  return total;
}

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
    assert.ok(sheet.questions.every((q) => q.op === 'addsub'));
  }
});

test('questions vary in operation, digits and number of rows', () => {
  const sheet = gen.generateWorksheet(5, 200);
  const ops = new Set(sheet.questions.map((q) => q.op));
  assert.ok(ops.size >= 3, 'expected several operations');
  const sums = sheet.questions.filter((q) => q.op === 'addsub');
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
      if (q.kind !== 'stack' || q.op === 'addsub') continue;
      for (const l of q.lines) assert.ok(!/\.\d*0$/.test(l), 'trailing zero in ' + l);
    }
  }
});
