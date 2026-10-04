// Level rules: every question must match the level config it came from.
const test = require('node:test');
const assert = require('node:assert');
const gen = require('../js/generator.js');
const { LEVELS } = require('../js/config.js');

const SHEETS = 500;      // sheets per level
const PER_SHEET = 60;    // questions per sheet

/*
 * Independent soroban model for the test. A formula is defined by the bead
 * moves it is made of, built from "direct" moves only:
 *   small add a  = direct +5, then direct -(5-a)
 *   big add a    = direct -(10-a), then +1 on the next rod
 *   combo add a  = small -(10-a), then +1 on the next rod
 * (and the mirror image for taking away).
 */
const directAdd = (d, a) => (a >= 5 ? d < 5 && (d % 5) + a - 5 <= 4 : (d % 5) + a <= 4);
const directSub = (d, a) => (a >= 5 ? d >= 5 && (d % 5) >= a - 5 : (d % 5) >= a);
const smallAdd = (d, a) => a < 5 && directAdd(d, 5) && directSub(d + 5, 5 - a);
const smallSub = (d, a) => a < 5 && directSub(d, 5) && directAdd(d - 5, 5 - a);

function step(rods, pos, a, minus, used) {
  if (a === 0) return;
  const d = rods[pos];
  if (!minus) {
    if (directAdd(d, a)) { used.add('direct'); rods[pos] = d + a; return; }
    if (smallAdd(d, a)) { used.add('small'); rods[pos] = d + a; return; }
    const b = 10 - a;
    if (directSub(d, b)) used.add('big');
    else if (smallSub(d, b)) used.add('combo');
    else throw new Error(`cannot add ${a} to rod ${d}`);
    rods[pos] = d - b;
    step(rods, pos + 1, 1, false, used);
    return;
  }
  if (directSub(d, a)) { used.add('direct'); rods[pos] = d - a; return; }
  if (smallSub(d, a)) { used.add('small'); rods[pos] = d - a; return; }
  const b = 10 - a;
  if (directAdd(d, b)) used.add('big');
  else if (smallAdd(d, b)) used.add('combo');
  else throw new Error(`cannot take ${a} from rod ${d}`);
  rods[pos] = d + b;
  step(rods, pos + 1, 1, true, used);
}

function formulasFor(lines) {
  const rods = new Array(20).fill(0);
  const used = new Set();
  for (const line of lines) {
    const minus = line.startsWith('-');
    const digits = line.replace('-', '').replace('.', '');
    for (let i = 0; i < digits.length; i++) {
      step(rods, digits.length - 1 - i, digits.charCodeAt(i) - 48, minus, used);
    }
  }
  return used;
}

const intDigits = (s) => s.replace('-', '').split('.')[0].length;
const decimals = (s) => (s.split('.')[1] || '').length;

function checkQuestion(q) {
  const L = LEVELS[q.level];
  const item = L.mix[q.spec];
  assert.ok(item, 'question points at a mix item');
  assert.strictEqual(q.type, item.type);
  const where = `level ${q.level} ${item.type} ${JSON.stringify(q.lines || q.tokens)}`;

  if (item.type === 'addsub') {
    assert.ok(q.lines.length >= item.rows[0] && q.lines.length <= item.rows[1], 'rows ' + where);
    let total = 0;
    const scale = 10 ** (item.dp || 0);
    for (const line of q.lines) {
      const d = intDigits(line);
      assert.ok(d >= item.digits[0] && d <= item.digits[1], 'digits ' + where);
      assert.strictEqual(decimals(line), item.dp || 0, 'decimals ' + where);
      total += Math.round(Number(line) * scale);
      assert.ok(total > 0, 'running total must stay above zero ' + where);
      if (L.maxTotal) assert.ok(total <= L.maxTotal * scale, 'maxTotal ' + where);
    }
    for (const f of formulasFor(q.lines)) {
      assert.ok(L.formulas.includes(f), `formula "${f}" not taught yet: ${where}`);
    }
  } else if (item.type === 'mul') {
    const [a, b] = [q.lines[0], q.lines[1].slice(1)];
    assert.strictEqual(a.replace('.', '').length, item.a + (item.adp || 0), 'a digits ' + where);
    assert.strictEqual(b.replace('.', '').length, item.b + (item.bdp || 0), 'b digits ' + where);
    assert.strictEqual(decimals(a), item.adp || 0);
    assert.strictEqual(decimals(b), item.bdp || 0);
  } else if (item.type === 'div' || item.type === 'divrem') {
    const [a, b] = [q.lines[0], q.lines[1].slice(1)];
    assert.strictEqual(intDigits(a), item.dd, 'dividend digits ' + where);
    assert.strictEqual(b.length, item.dv, 'divisor digits ' + where);
    assert.strictEqual(decimals(a), item.qdp || 0);
  }
}

test('the test bead model agrees with known abacus examples', () => {
  assert.deepStrictEqual([...formulasFor(['3', '1'])], ['direct']);
  assert.ok(formulasFor(['3', '4']).has('small'));           // +4 = +5 -1
  assert.ok(formulasFor(['7', '-3']).has('small'));          // -3 = -5 +2
  assert.ok(formulasFor(['8', '3']).has('big'));             // +3 = -7 +10
  assert.ok(formulasFor(['6', '7']).has('combo'));           // +7 = -3 (-5 +2) +10
  assert.ok(formulasFor(['12', '-6']).has('combo'));         // -6 = +4 (+5 -1) -10
  assert.ok(!formulasFor(['5', '4']).has('small'));          // 5 + 4 is direct
});

test('generator formula check agrees with the test bead model', () => {
  const r = new gen._internal.Rng(42);
  for (let i = 0; i < 3000; i++) {
    const values = [];
    let total = 0;
    for (let k = 0; k < 6; k++) {
      let v = r.digits(r.int(1, 3));
      if (k && r.chance(0.4) && total - v > 0) v = -v;
      if (total + v <= 0) v = Math.abs(v);
      values.push(v);
      total += v;
    }
    const mine = gen.analyseSum(values).used;
    const theirs = formulasFor(values.map(String));
    for (const f of ['direct', 'small', 'big', 'combo']) {
      assert.strictEqual(!!mine[f], theirs.has(f), `${f} for ${values}`);
    }
  }
});

for (const level of Object.keys(LEVELS).map(Number)) {
  test(`level ${level}: ${SHEETS} sheets follow the level config, no repeats`, () => {
    const seenTypes = new Set();
    for (let s = 0; s < SHEETS; s++) {
      const sheet = gen.generateWorksheet(level, PER_SHEET, 'R' + level + '-' + s);
      assert.strictEqual(sheet.questions.length, PER_SHEET);
      assert.strictEqual(sheet.warning, null);
      const seen = new Set();
      for (const q of sheet.questions) {
        assert.strictEqual(q.level, level);
        checkQuestion(q);
        const key = JSON.stringify(q.lines || q.tokens);
        assert.ok(!seen.has(key), 'repeated question ' + key);
        seen.add(key);
        seenTypes.add(q.spec);
      }
    }
    // Every recipe of the level shows up somewhere.
    assert.strictEqual(seenTypes.size, LEVELS[level].mix.length);
  });
}

test('level 1 uses only 1-digit numbers, direct and small friends, total <= 9', () => {
  for (let s = 0; s < 50; s++) {
    for (const q of gen.generateWorksheet(1, 100).questions) {
      assert.ok(q.lines.every((l) => intDigits(l) === 1));
      const f = formulasFor(q.lines);
      assert.ok(!f.has('big') && !f.has('combo'));
    }
  }
});

test('level 2 brings in big friends but no combination formulas', () => {
  let big = 0;
  for (let s = 0; s < 20; s++) {
    for (const q of gen.generateWorksheet(2, 100).questions) {
      const f = formulasFor(q.lines);
      assert.ok(!f.has('combo'));
      if (f.has('big')) big++;
    }
  }
  assert.ok(big > 500, 'big friends should be common at level 2');
});

test('level 3 practises combination formulas', () => {
  const qs = gen.generateWorksheet(3, 200).questions;
  assert.ok(qs.some((q) => formulasFor(q.lines).has('combo')));
});
