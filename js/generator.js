/*
 * Abacus question generator.
 *
 * Pure JavaScript, no network or LLM needed. Every question is built from a
 * seeded random number generator, so a Sheet ID always reproduces the same
 * worksheet.
 *
 * A question looks like one of:
 *   { kind: 'stack',  lines: ['345', '-120', '78'], answer: [...tokens] }
 *   { kind: 'inline', tokens: [...tokens],           answer: [...tokens] }
 * Tokens are { t: 'num' | 'text' | 'op', v } | { t: 'frac', n, d }
 *          | { t: 'root', v, index }.
 */
(function (root) {
  'use strict';

  // ---------- random helpers ----------

  function mulberry32(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  var ID_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  function newSheetId() {
    var s = '';
    for (var i = 0; i < 6; i++) s += ID_CHARS[Math.floor(Math.random() * ID_CHARS.length)];
    return s;
  }

  function seedFromId(id) {
    var h = 2166136261;
    for (var i = 0; i < id.length; i++) {
      h ^= id.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function Rng(seed) {
    var next = mulberry32(seed);
    this.random = next;
    this.int = function (lo, hi) { return lo + Math.floor(next() * (hi - lo + 1)); };
    this.pick = function (arr) { return arr[Math.floor(next() * arr.length)]; };
    this.chance = function (p) { return next() < p; };
    // Number with exactly `digits` digits (first digit non-zero).
    this.digits = function (digits) {
      if (digits <= 1) return this.int(1, 9);
      return this.int(Math.pow(10, digits - 1), Math.pow(10, digits) - 1);
    };
    this.weighted = function (items) {
      var total = 0, i;
      for (i = 0; i < items.length; i++) total += items[i][0];
      var r = next() * total;
      for (i = 0; i < items.length; i++) {
        r -= items[i][0];
        if (r < 0) return items[i][1];
      }
      return items[items.length - 1][1];
    };
  }

  // ---------- number formatting ----------

  var POW10 = [1, 10, 100, 1000, 10000];

  // Format a scaled integer (value * 10^dp) with exactly dp decimals.
  function fixed(scaled, dp) {
    if (!dp) return String(scaled);
    var neg = scaled < 0;
    var abs = Math.abs(scaled);
    var whole = Math.floor(abs / POW10[dp]);
    var frac = String(abs % POW10[dp]);
    while (frac.length < dp) frac = '0' + frac;
    return (neg ? '-' : '') + whole + '.' + frac;
  }

  // Format a scaled integer and drop trailing zeros (2.50 -> 2.5, 3.00 -> 3).
  function trimmed(scaled, dp) {
    var s = fixed(scaled, dp);
    if (s.indexOf('.') < 0) return s;
    return s.replace(/0+$/, '').replace(/\.$/, '');
  }

  function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { var t = a % b; a = b; b = t; }
    return a;
  }

  function num(v) { return { t: 'num', v: String(v) }; }
  function op(v) { return { t: 'op', v: v }; }
  function text(v) { return { t: 'text', v: v }; }
  function frac(n, d) { return { t: 'frac', n: String(n), d: String(d) }; }

  // Simplified fraction answer, as a mixed number when bigger than one.
  function fracAnswer(n, d) {
    var g = gcd(n, d);
    n /= g; d /= g;
    if (n === 0) return [num(0)];
    if (d === 1) return [num(n)];
    if (n > d) return [num(Math.floor(n / d)), frac(n % d, d)];
    return [frac(n, d)];
  }

  // ---------- question builders ----------

  /*
   * Vertical add/subtract sum, the classic abacus "list".
   * opts: rows [min,max], digits [min,max], sub (chance of a minus row),
   *       dp (decimal places), maxTotal (keep running total <= this),
   *       intDigits [min,max] for decimal numbers.
   */
  function columnSum(rng, opts) {
    var rows = rng.int(opts.rows[0], opts.rows[1]);
    var dp = opts.dp || 0;
    var scale = POW10[dp];
    var maxTotal = opts.maxTotal ? opts.maxTotal * scale : Infinity;
    var values = [];
    var total = 0;

    function randomValue() {
      var d = rng.int(opts.digits[0], opts.digits[1]);
      if (!dp) return rng.digits(d);
      // d integer digits plus dp decimal places; last decimal non-zero keeps
      // the decimal part meaningful.
      var whole = d === 0 ? 0 : rng.digits(d);
      var part = rng.int(1, scale - 1);
      return whole * scale + part;
    }

    for (var i = 0; i < rows; i++) {
      var v = 0, ok = false;
      for (var tries = 0; !ok && tries < 60; tries++) {
        v = randomValue();
        if (i > 0 && rng.chance(opts.sub || 0)) v = -v;
        // The running total must stay above zero (and under maxTotal), just
        // like beads on a real abacus.
        ok = total + v > 0 && total + v <= maxTotal;
      }
      if (!ok) v = total + 1 <= maxTotal ? 1 : -1;
      values.push(v);
      total += v;
    }

    return {
      kind: 'stack',
      op: 'addsub',
      lines: values.map(function (v) { return fixed(v, dp); }),
      answer: [num(fixed(total, dp))],
      value: total / scale
    };
  }

  function multiply(rng, aDigits, bDigits, opts) {
    opts = opts || {};
    var adp = opts.adp || 0, bdp = opts.bdp || 0;
    var a, b;
    do {
      a = rng.digits(aDigits + adp);
      b = rng.digits(bDigits + bdp);
    } while (b < 2 || a % 10 === 0 || b % 10 === 0);
    var dp = adp + bdp;
    return {
      kind: 'stack',
      op: 'mul',
      lines: [fixed(a, adp), '×' + fixed(b, bdp)],
      answer: [num(trimmed(a * b, dp))],
      value: (a * b) / POW10[dp]
    };
  }

  // Exact division: dividend has `dd` digits, divisor has `dv` digits.
  // qdp > 0 makes a decimal quotient (e.g. 45.6 ÷ 4 = 11.4).
  function divide(rng, dd, dv, opts) {
    opts = opts || {};
    var qdp = opts.qdp || 0;
    for (var tries = 0; tries < 200; tries++) {
      var divisor = rng.digits(dv);
      if (divisor < 2 || divisor % 10 === 0) continue;
      var lo = Math.ceil(Math.pow(10, dd + qdp - 1) / divisor);
      var hi = Math.floor((Math.pow(10, dd + qdp) - 1) / divisor);
      if (lo > hi) continue;
      var q = rng.int(Math.max(lo, 2), hi);
      var dividend = q * divisor;
      // Skip decimals that end in 0 (45.0 ÷ 6) - they look odd on a sheet.
      if (qdp && (q % 10 === 0 || dividend % 10 === 0)) continue;
      return {
        kind: 'stack',
        op: 'div',
        lines: [fixed(dividend, qdp), '÷' + divisor],
        answer: [num(trimmed(q, qdp))],
        value: q / POW10[qdp]
      };
    }
    return divide(rng, dd, 1, opts);
  }

  function percentage(rng, hard) {
    var p, base;
    if (hard) {
      p = rng.int(2, 95);
      base = rng.digits(rng.int(2, 4));
    } else {
      p = rng.pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 90]);
      base = rng.int(2, 40) * 20;
    }
    var scaled = p * base; // answer * 100
    return {
      kind: 'inline',
      op: 'pct',
      tokens: [num(p + '%'), text('of'), num(base)],
      answer: [num(trimmed(scaled, 2))],
      value: scaled / 100
    };
  }

  function squareRoot(rng, rootDigits) {
    var r = rng.digits(rootDigits);
    if (r < 4) r += 4;
    return {
      kind: 'inline',
      op: 'sqrt',
      tokens: [{ t: 'root', v: String(r * r), index: '' }],
      answer: [num(r)],
      value: r
    };
  }

  function cubeRoot(rng) {
    var r = rng.int(11, 99);
    return {
      kind: 'inline',
      op: 'cbrt',
      tokens: [{ t: 'root', v: String(r * r * r), index: '3' }],
      answer: [num(r)],
      value: r
    };
  }

  // "3/4 of 48"
  function fractionOf(rng) {
    var f = properFraction(rng), n = f[0], d = f[1];
    var base = d * rng.int(2, 25);
    return {
      kind: 'inline',
      op: 'fracof',
      tokens: [frac(n, d), text('of'), num(base)],
      answer: [num((base / d) * n)],
      value: (base / d) * n
    };
  }

  // a/b ± c/d, answer simplified (mixed number when > 1).
  // Proper fraction in lowest terms, e.g. 3/8 (never 2/4).
  function properFraction(rng) {
    var d, n;
    do { d = rng.int(2, 12); n = rng.int(1, d - 1); } while (gcd(n, d) !== 1);
    return [n, d];
  }

  function fractionSum(rng) {
    var f1 = properFraction(rng), f2 = properFraction(rng);
    var a = f1[0], b = f1[1], c = f2[0], d = f2[1];
    var minus = rng.chance(0.4);
    var n1 = a * d, n2 = c * b, den = b * d;
    if (minus && n1 < n2) {
      var t = a; a = c; c = t; t = b; b = d; d = t;
      n1 = a * d; n2 = c * b;
    }
    if (minus && n1 === n2) minus = false;
    var n = minus ? n1 - n2 : n1 + n2;
    return {
      kind: 'inline',
      op: 'frac',
      tokens: [frac(a, b), op(minus ? '-' : '+'), frac(c, d)],
      answer: fracAnswer(n, den),
      value: n / den
    };
  }

  // Mixed operations following BODMAS, always a whole, non-negative answer.
  function mixedOps(rng) {
    var shape = rng.int(0, 3);
    var a, b, c, d, v, tokens;
    for (var tries = 0; tries < 100; tries++) {
      if (shape === 0) { // a × b + c
        a = rng.int(12, 99); b = rng.int(3, 9); c = rng.int(10, 999);
        v = a * b + c;
        tokens = [num(a), op('×'), num(b), op('+'), num(c)];
      } else if (shape === 1) { // a ÷ b + c × d
        b = rng.int(2, 9); a = b * rng.int(3, 30); c = rng.int(3, 25); d = rng.int(2, 9);
        v = a / b + c * d;
        tokens = [num(a), op('÷'), num(b), op('+'), num(c), op('×'), num(d)];
      } else if (shape === 2) { // (a + b) × c
        a = rng.int(10, 99); b = rng.int(10, 99); c = rng.int(2, 9);
        v = (a + b) * c;
        tokens = [text('('), num(a), op('+'), num(b), text(')'), op('×'), num(c)];
      } else { // a × b − c ÷ d
        a = rng.int(12, 60); b = rng.int(3, 9); d = rng.int(2, 9); c = d * rng.int(2, 20);
        v = a * b - c / d;
        tokens = [num(a), op('×'), num(b), op('-'), num(c), op('÷'), num(d)];
      }
      if (v >= 0) break;
    }
    return { kind: 'inline', op: 'mixed', tokens: tokens, answer: [num(v)], value: v };
  }

  // ---------- levels ----------

  function col(rows, digits, sub, extra) {
    return function (rng) {
      var o = { rows: rows, digits: digits, sub: sub };
      if (extra) for (var k in extra) o[k] = extra[k];
      return columnSum(rng, o);
    };
  }
  function mul(a, b, o) { return function (rng) { return multiply(rng, a, b, o); }; }
  function div(a, b, o) { return function (rng) { return divide(rng, a, b, o); }; }

  var LEVELS = {
    1: {
      name: 'Level 1', stage: 'Beginner',
      about: '1-digit adding & taking away, small friends',
      recipes: [
        [45, col([3, 5], [1, 1], 0.35, { maxTotal: 9 })],
        [35, col([3, 5], [1, 1], 0.3, { maxTotal: 30 })],
        [20, col([2, 3], [1, 2], 0.25)]
      ]
    },
    2: {
      name: 'Level 2', stage: 'Beginner',
      about: '1 & 2-digit sums, big friends',
      recipes: [
        [35, col([5, 8], [1, 1], 0.35)],
        [35, col([3, 5], [2, 2], 0.3)],
        [30, col([4, 6], [1, 2], 0.35)]
      ]
    },
    3: {
      name: 'Level 3', stage: 'Beginner',
      about: '2 & 3-digit sums, combination friends',
      recipes: [
        [35, col([4, 7], [2, 2], 0.35)],
        [35, col([5, 8], [1, 3], 0.35)],
        [30, col([3, 5], [3, 3], 0.3)]
      ]
    },
    4: {
      name: 'Level 4', stage: 'Intermediate',
      about: 'Longer sums, times tables, multiplication',
      recipes: [
        [45, col([5, 8], [2, 3], 0.35)],
        [10, mul(1, 1)],
        [27, mul(2, 1)],
        [18, mul(3, 1)]
      ]
    },
    5: {
      name: 'Level 5', stage: 'Intermediate',
      about: 'Multiplication & starting division',
      recipes: [
        [40, col([5, 10], [2, 4], 0.35)],
        [15, mul(3, 1)],
        [15, mul(2, 2)],
        [15, div(2, 1)],
        [15, div(3, 1)]
      ]
    },
    6: {
      name: 'Level 6', stage: 'Intermediate',
      about: 'Decimals, bigger multiplication & division',
      recipes: [
        [25, col([6, 10], [3, 4], 0.35)],
        [15, col([4, 7], [1, 2], 0.3, { dp: 1 })],
        [12, mul(3, 2)],
        [10, mul(4, 1)],
        [8, mul(1, 1, { adp: 1 })],
        [10, div(4, 1)],
        [12, div(3, 2)],
        [8, div(2, 1, { qdp: 1 })]
      ]
    },
    7: {
      name: 'Level 7', stage: 'Advanced',
      about: 'Large numbers, %, square roots, fractions',
      recipes: [
        [20, col([6, 10], [3, 5], 0.35)],
        [10, col([5, 8], [1, 3], 0.3, { dp: 2 })],
        [8, mul(3, 3)],
        [7, mul(4, 2)],
        [8, div(4, 2)],
        [7, div(5, 2)],
        [5, mul(2, 1, { adp: 1 })],
        [5, div(3, 1, { qdp: 2 })],
        [10, function (rng) { return percentage(rng, false); }],
        [10, function (rng) { return squareRoot(rng, 2); }],
        [10, fractionOf]
      ]
    },
    8: {
      name: 'Level 8', stage: 'Grand Master',
      about: 'Competition mix: roots, fractions, BODMAS',
      recipes: [
        [15, col([8, 12], [4, 6], 0.4)],
        [8, col([6, 10], [2, 4], 0.35, { dp: 2 })],
        [5, mul(4, 3)],
        [5, mul(5, 2)],
        [6, div(6, 2)],
        [6, div(5, 3)],
        [7, mul(2, 1, { adp: 1, bdp: 1 })],
        [8, function (rng) { return percentage(rng, true); }],
        [10, function (rng) { return squareRoot(rng, rng.int(2, 3)); }],
        [6, cubeRoot],
        [10, fractionSum],
        [14, mixedOps]
      ]
    }
  };

  function signature(q) {
    var body = q.kind === 'stack' ? q.lines.join('|')
      : q.tokens.map(function (t) { return t.t + ':' + (t.v || '') + (t.n || '') + '/' + (t.d || '') + (t.index || ''); }).join(' ');
    return q.kind + '#' + body;
  }

  /*
   * Build a worksheet.
   *   level: 1..8 or 'all'
   *   count: number of questions (10..500)
   *   sheetId: optional; random when omitted
   */
  function generateWorksheet(level, count, sheetId) {
    var id = sheetId || newSheetId();
    var rng = new Rng(seedFromId(id + ':' + level + ':' + count));
    count = Math.max(10, Math.min(500, Math.round(count) || 0));
    var seen = {};
    var questions = [];
    var guard = 0;
    while (questions.length < count && guard < count * 50) {
      guard++;
      var lv = level === 'all' ? rng.int(1, 8) : Number(level);
      var q = rng.weighted(LEVELS[lv].recipes)(rng);
      var sig = signature(q);
      if (seen[sig]) continue;
      seen[sig] = true;
      q.level = lv;
      questions.push(q);
    }
    return { id: id, level: level, count: questions.length, questions: questions, rng: rng };
  }

  var api = {
    LEVELS: LEVELS,
    generateWorksheet: generateWorksheet,
    newSheetId: newSheetId,
    // exposed for tests
    _internal: { Rng: Rng, fixed: fixed, trimmed: trimmed, fracAnswer: fracAnswer, gcd: gcd }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AbacusGen = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
