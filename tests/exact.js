// Exact checker shared by the tests. Uses BigInt rationals so it shares no
// float code with the generator.
const assert = require('node:assert');

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
const bgcd = (a, b) => { while (b) [a, b] = [b, a % b]; return a < 0n ? -a : a; };

function evalInline(tokens) {
  const pow = tokens.find((t) => t.t === 'pow');
  if (pow) return [BigInt(pow.v) ** BigInt(pow.e), 1n];
  const fn = tokens.find((t) => t.t === 'fn');
  if (fn) {
    const args = fn.args.map(BigInt);
    if (fn.v === 'HCF') return [args.reduce(bgcd), 1n];
    if (fn.v === 'LCM') return [args.reduce((a, b) => (a / bgcd(a, b)) * b), 1n];
    throw new Error('unknown function ' + fn.v);
  }
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

// Division with remainder: check dividend = q × divisor + r with 0 < r < divisor.
function checkDivRem(q) {
  const m = /^(\d+) R (\d+)$/.exec(q.answer[0].v);
  assert.ok(m, 'answer must look like "Q R r": ' + q.answer[0].v);
  const [dividend, divisor] = [BigInt(q.lines[0]), BigInt(q.lines[1].slice(1))];
  const [quot, rem] = [BigInt(m[1]), BigInt(m[2])];
  assert.strictEqual(quot * divisor + rem, dividend, 'remainder sum ' + q.lines);
  assert.ok(rem > 0n && rem < divisor, 'remainder range ' + q.lines);
  assert.strictEqual(q.answer.length, 1);
}

// Check any question against its answer. Throws on a wrong or inexact answer.
function checkAnswer(q) {
  if (q.type === 'divrem') return checkDivRem(q);
  const expected = q.kind === 'stack' ? evalStack(q) : evalInline(q.tokens);
  assert.ok(eq(expected, answerValue(q.answer)),
    `wrong answer for ${JSON.stringify(q.lines || q.tokens)}: got ${JSON.stringify(q.answer)}`);
  // Answers are written exactly: whole numbers, finite decimals or fractions.
  for (const t of q.answer) {
    assert.ok(t.t === 'frac' || /^-?\d+(\.\d+)?$/.test(t.v), 'answer format ' + t.v);
  }
}

function evalStack(q) {
  if (q.type === 'mul') return mul(rat(q.lines[0]), rat(q.lines[1].slice(1)));
  if (q.type === 'div') return div(rat(q.lines[0]), rat(q.lines[1].slice(1)));
  let total = [0n, 1n];
  for (const line of q.lines) {
    total = add(total, rat(line));
    if (q.type === 'addsub') {
      assert.ok(total[0] * total[1] > 0n, 'running total must stay above zero: ' + q.lines.join(','));
    }
  }
  return total;
}


module.exports = { checkAnswer, checkDivRem, rat, add, sub, mul, div, eq, tokenValue, answerValue, evalInline, evalStack };
