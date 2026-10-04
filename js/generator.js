/*
 * Abacus question generator.
 *
 * Pure JavaScript, no network or LLM needed. Every question is built from a
 * seeded random number generator, so a Sheet ID always reproduces the same
 * worksheet. All level rules come from config.js.
 *
 * A question looks like one of:
 *   { kind: 'stack',  lines: ['345', '-120', '78'], answer: [...tokens] }
 *   { kind: 'inline', tokens: [...tokens],           answer: [...tokens] }
 * plus: type (mix item type), level, spec (index of the mix item used).
 * Tokens are { t: 'num' | 'text' | 'op', v } | { t: 'frac', n, d }
 *          | { t: 'root', v, index }.
 */
(function (root) {
  'use strict';

  var CONFIG = (typeof module !== 'undefined' && module.exports)
    ? require('./config.js') : root.AbacusConfig;

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
    // Index of an item, chosen by its `weight`.
    this.weightedIndex = function (items) {
      var total = 0, i;
      for (i = 0; i < items.length; i++) total += items[i].weight;
      var r = next() * total;
      for (i = 0; i < items.length; i++) {
        r -= items[i].weight;
        if (r < 0) return i;
      }
      return items.length - 1;
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

  function digitCount(n) { return String(Math.abs(n)).length; }

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

  // ---------- abacus (soroban) rod model ----------
  //
  // Each rod holds 0-9: one heaven bead (5) and four earth beads (1 each).
  // Numbers are added left to right, rod by rod, the way a child moves the
  // beads. Each digit move is one of:
  //   direct - the beads needed are free to move
  //   small  - small friend: +a = +5 -(5-a)   /  -a = -5 +(5-a)
  //   big    - big friend:   +a = -(10-a) +10 /  -a = +(10-a) -10
  //   combo  - big friend whose first step itself needs a small friend

  function canAddDirect(d, a) {
    var upper = d >= 5, lower = d % 5;
    if (a >= 5) return !upper && lower + (a - 5) <= 4;
    return lower + a <= 4;
  }

  function canSubDirect(d, a) {
    var upper = d >= 5, lower = d % 5;
    if (a >= 5) return upper && lower >= a - 5;
    return lower >= a;
  }

  // rods[0] is the units rod. Returns false if the move is impossible.
  function moveDigit(rods, pos, a, minus, used) {
    if (a === 0) return true;
    if (pos >= rods.length) return false;
    var d = rods[pos];
    if (!minus) {
      if (canAddDirect(d, a)) used.direct = true;
      else if (d + a <= 9) used.small = true;
      else {
        if (canSubDirect(d, 10 - a)) used.big = true; else used.combo = true;
        rods[pos] = d + a - 10;
        return moveDigit(rods, pos + 1, 1, false, used);
      }
      rods[pos] = d + a;
      return true;
    }
    if (canSubDirect(d, a)) used.direct = true;
    else if (d - a >= 0) used.small = true;
    else {
      if (canAddDirect(d, 10 - a)) used.big = true; else used.combo = true;
      rods[pos] = d - a + 10;
      return moveDigit(rods, pos + 1, 1, true, used);
    }
    rods[pos] = d - a;
    return true;
  }

  // Add (or take away) a non-negative integer, highest rod first.
  function moveNumber(rods, value, minus, used) {
    var s = String(value);
    for (var i = 0; i < s.length; i++) {
      if (!moveDigit(rods, s.length - 1 - i, s.charCodeAt(i) - 48, minus, used)) return false;
    }
    return true;
  }

  function newRods() { return [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]; }

  /*
   * Which formulas a list of signed (scaled) integers needs on the abacus.
   * Returns { used: {direct, small, big, combo}, ok } where ok is false if the
   * total ever drops below zero.
   */
  function analyseSum(values) {
    var rods = newRods(), used = {}, total = 0;
    for (var i = 0; i < values.length; i++) {
      total += values[i];
      if (total < 0) return { used: used, ok: false };
      moveNumber(rods, Math.abs(values[i]), values[i] < 0, used);
    }
    return { used: used, ok: true };
  }

  function formulasAllowed(used, allowed) {
    for (var f in used) if (used[f] && allowed.indexOf(f) < 0) return false;
    return true;
  }

  // ---------- question builders ----------
  // Each builder gets (rng, item, level) and returns a question, or null if it
  // could not make one (the caller then just tries again).

  var SMALL_RANGE = 200; // enumerate all candidates when the range is this small

  /*
   * Vertical add/subtract sum, the classic abacus "list". Every row is checked
   * rod by rod so the sum only needs formulas the level has taught, and the
   * running total stays above zero (and under maxTotal).
   */
  function buildAddSub(rng, item, level) {
    var dp = item.dp || 0;
    var scale = POW10[dp];
    var maxTotal = level.maxTotal ? level.maxTotal * scale : Infinity;
    var allowed = level.formulas;
    var lo = item.digits[0], hi = item.digits[1];
    var minV = lo <= 1 ? 1 : Math.pow(10, lo - 1);
    var maxV = Math.pow(10, hi) - 1;
    var small = !dp && maxV - minV < SMALL_RANGE;

    function randomValue() {
      var d = rng.int(lo, hi);
      if (!dp) return rng.digits(d);
      var whole = rng.digits(d);
      return whole * scale + rng.int(1, scale - 1); // decimal part never .0
    }

    // Can `v` (signed) go next, given the current beads and total?
    function fits(rods, total, v) {
      var t = total + v;
      if (t <= 0 || t > maxTotal) return null;
      var copy = rods.slice(), used = {};
      if (!moveNumber(copy, Math.abs(v), v < 0, used)) return null;
      if (!formulasAllowed(used, allowed)) return null;
      return copy;
    }

    for (var attempt = 0; attempt < 20; attempt++) {
      var rows = rng.int(item.rows[0], item.rows[1]);
      var rods = newRods(), total = 0, values = [];
      for (var i = 0; i < rows; i++) {
        var wantMinus = i > 0 && rng.chance(item.sub || 0);
        var v = null, next = null;
        if (small) {
          // Pick from every number that fits, so tight levels never get stuck.
          var plus = [], minus = [];
          for (var c = minV; c <= maxV; c++) {
            if (fits(rods, total, c)) plus.push(c);
            if (i > 0 && fits(rods, total, -c)) minus.push(-c);
          }
          var pool = (wantMinus && minus.length) || !plus.length ? minus : plus;
          if (pool.length) v = rng.pick(pool);
        } else {
          for (var tries = 0; tries < 60 && v === null; tries++) {
            var cand = randomValue();
            if (wantMinus && tries < 40) cand = -cand;
            if (fits(rods, total, cand)) v = cand;
          }
        }
        if (v === null) break;
        next = fits(rods, total, v);
        rods = next;
        total += v;
        values.push(v);
      }
      if (values.length < item.rows[0]) continue;
      return {
        kind: 'stack',
        lines: values.map(function (x) { return fixed(x, dp); }),
        answer: [num(fixed(total, dp))]
      };
    }
    return null;
  }

  function buildMul(rng, item) {
    var adp = item.adp || 0, bdp = item.bdp || 0;
    for (var tries = 0; tries < 100; tries++) {
      var a = rng.digits(item.a + adp);
      var b = rng.digits(item.b + bdp);
      if (b < 2 || a % 10 === 0 || b % 10 === 0) continue;
      return {
        kind: 'stack',
        lines: [fixed(a, adp), '×' + fixed(b, bdp)],
        answer: [num(trimmed(a * b, adp + bdp))]
      };
    }
    return null;
  }

  // Exact division: dividend has `dd` digits, divisor has `dv` digits.
  // qdp > 0 makes a decimal quotient (e.g. 45.6 ÷ 4 = 11.4).
  function buildDiv(rng, item) {
    var qdp = item.qdp || 0;
    for (var tries = 0; tries < 200; tries++) {
      var divisor = rng.digits(item.dv);
      if (divisor < 2 || divisor % 10 === 0) continue;
      var lo = Math.ceil(Math.pow(10, item.dd + qdp - 1) / divisor);
      var hi = Math.floor((Math.pow(10, item.dd + qdp) - 1) / divisor);
      if (lo > hi) continue;
      var q = rng.int(Math.max(lo, 2), hi);
      var dividend = q * divisor;
      // Skip decimals that end in 0 (45.0 ÷ 6) - they look odd on a sheet.
      if (qdp && (q % 10 === 0 || dividend % 10 === 0)) continue;
      return {
        kind: 'stack',
        lines: [fixed(dividend, qdp), '÷' + divisor],
        answer: [num(trimmed(q, qdp))]
      };
    }
    return null;
  }

  function buildPct(rng, item) {
    var p, base;
    if (item.hard) {
      p = rng.int(2, 95);
      base = rng.digits(rng.int(2, 4));
    } else {
      p = rng.pick([5, 10, 15, 20, 25, 30, 40, 50, 60, 75, 80, 90]);
      base = rng.int(2, 40) * 20;
    }
    return {
      kind: 'inline',
      tokens: [num(p + '%'), text('of'), num(base)],
      answer: [num(trimmed(p * base, 2))] // p * base is the answer × 100
    };
  }

  function buildSqrt(rng, item) {
    var r = rng.digits(rng.int(item.digits[0], item.digits[1]));
    if (r < 4) r += 4;
    return {
      kind: 'inline',
      tokens: [{ t: 'root', v: String(r * r), index: '' }],
      answer: [num(r)]
    };
  }

  function buildCbrt(rng) {
    var r = rng.int(11, 99);
    return {
      kind: 'inline',
      tokens: [{ t: 'root', v: String(r * r * r), index: '3' }],
      answer: [num(r)]
    };
  }

  // Proper fraction in lowest terms, e.g. 3/8 (never 2/4).
  function properFraction(rng) {
    var d, n;
    do { d = rng.int(2, 12); n = rng.int(1, d - 1); } while (gcd(n, d) !== 1);
    return [n, d];
  }

  // "3/4 of 48"
  function buildFracOf(rng) {
    var f = properFraction(rng), n = f[0], d = f[1];
    var base = d * rng.int(2, 25);
    return {
      kind: 'inline',
      tokens: [frac(n, d), text('of'), num(base)],
      answer: [num((base / d) * n)]
    };
  }

  // a/b ± c/d, answer simplified (mixed number when > 1).
  function buildFracSum(rng) {
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
      tokens: [frac(a, b), op(minus ? '-' : '+'), frac(c, d)],
      answer: fracAnswer(n, den)
    };
  }

  // Mixed operations following BODMAS, always a whole, non-negative answer.
  function buildMixed(rng) {
    var shape = rng.int(0, 3);
    var a, b, c, d, v, tokens;
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
    } else { // a × b − c ÷ d  (a × b >= 36 > c ÷ d, so never negative)
      a = rng.int(12, 60); b = rng.int(3, 9); d = rng.int(2, 9); c = d * rng.int(2, 20);
      v = a * b - c / d;
      tokens = [num(a), op('×'), num(b), op('-'), num(c), op('÷'), num(d)];
    }
    return { kind: 'inline', tokens: tokens, answer: [num(v)] };
  }

  var BUILDERS = {
    addsub: buildAddSub,
    mul: buildMul,
    div: buildDiv,
    pct: buildPct,
    sqrt: buildSqrt,
    cbrt: buildCbrt,
    fracof: buildFracOf,
    fracsum: buildFracSum,
    mixed: buildMixed
  };

  function signature(q) {
    var body = q.kind === 'stack' ? q.lines.join('|') : JSON.stringify(q.tokens);
    return q.kind + '#' + body;
  }

  function clampCount(count) {
    var n = Math.round(Number(count));
    if (!isFinite(n)) n = CONFIG.COUNT.default;
    return Math.max(CONFIG.COUNT.min, Math.min(CONFIG.COUNT.max, n));
  }

  /*
   * Build a worksheet.
   *   level:   1..8 or 'all'
   *   count:   number of questions (clamped to COUNT.min..COUNT.max)
   *   sheetId: optional; random when omitted
   *   opts:    { levels } to use other level rules (tests)
   * If a level cannot make enough different questions the sheet is shorter
   * and `warning` explains why.
   */
  function generateWorksheet(level, count, sheetId, opts) {
    opts = opts || {};
    var levels = opts.levels || CONFIG.LEVELS;
    var id = sheetId || newSheetId();
    count = clampCount(count);
    var rng = new Rng(seedFromId(id + ':' + level + ':' + count));
    var keys = Object.keys(levels);
    var seen = {};
    var questions = [];
    var maxAttempts = count * 40 + 200;
    for (var attempts = 0; questions.length < count && attempts < maxAttempts; attempts++) {
      var lv = level === 'all' ? Number(rng.pick(keys)) : Number(level);
      var L = levels[lv];
      if (!L) throw new Error('Unknown level: ' + level);
      var spec = rng.weightedIndex(L.mix);
      var item = L.mix[spec];
      var build = BUILDERS[item.type];
      if (!build) throw new Error('Unknown question type: ' + item.type);
      var q = build(rng, item, L);
      if (!q) continue;
      var sig = signature(q);
      if (seen[sig]) continue;
      seen[sig] = true;
      q.type = item.type;
      q.level = lv;
      q.spec = spec;
      questions.push(q);
    }
    var warning = null;
    if (questions.length < count) {
      warning = 'This level only had ' + questions.length + ' different questions to give, ' +
        'so the sheet has ' + questions.length + ' instead of ' + count + '.';
    }
    return { id: id, level: level, count: questions.length, questions: questions, warning: warning };
  }

  var api = {
    LEVELS: CONFIG.LEVELS,
    CONFIG: CONFIG,
    generateWorksheet: generateWorksheet,
    newSheetId: newSheetId,
    clampCount: clampCount,
    analyseSum: analyseSum,
    // exposed for tests
    _internal: { Rng: Rng, fixed: fixed, trimmed: trimmed, fracAnswer: fracAnswer, gcd: gcd, BUILDERS: BUILDERS, digitCount: digitCount }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AbacusGen = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
