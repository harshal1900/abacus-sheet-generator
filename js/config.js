/*
 * All worksheet rules live here. The generator reads this object and has no
 * limits of its own, so changing a level means editing only this file.
 *
 * Level fields
 *   name, stage, about   text for the level tile and the PDF header
 *   tint                 [r, g, b] card-header colour (light, prints as pale grey)
 *   formulas             abacus formulas allowed in add/subtract sums:
 *                          'direct' - beads move straight up or down
 *                          'small'  - small friends (+/-5), e.g. +4 = +5 -1
 *                          'big'    - big friends (+/-10), e.g. +9 = -1 +10
 *                          'combo'  - combination, e.g. +6 = -5 +1 +10
 *   maxTotal             highest running total allowed in a sum (null = none)
 *   mix                  question recipes, picked at random by weight
 *
 * Mix item fields by type
 *   addsub   rows [min,max], digits [min,max] (integer digits), sub (chance a
 *            row is a minus), dp (decimal places, optional)
 *   negsum   rows, digits; numbers may be negative and so may the answer
 *   mul      a, b (digits of each factor), adp/bdp (decimal places, optional)
 *   div      dd (dividend digits), dv (divisor digits), qdp (quotient decimals)
 *   divrem   dd, dv; answer is "Q R r"
 *   square   digits [min,max] of the base
 *   cube     digits [min,max] of the base
 *   sqrt     digits [min,max] of the root
 *   cbrt     (no options) 2-digit root
 *   pct      hard (true for any %, false for friendly %)
 *   fracof   (no options) e.g. 3/4 of 48
 *   fracsum  (no options) a/b +/- c/d
 *   lcm, hcf count [min,max] of numbers, max (largest number used)
 *   mixed    (no options) BODMAS with + - × ÷ and brackets
 */
(function (root) {
  'use strict';

  var ALL_FORMULAS = ['direct', 'small', 'big', 'combo'];

  var LEVELS = {
    1: {
      name: 'Level 1', stage: 'Beginner',
      about: '1-digit adding & taking away, small friends',
      tint: [253, 226, 228],
      formulas: ['direct', 'small'],
      maxTotal: 9,
      mix: [
        { type: 'addsub', weight: 60, rows: [3, 5], digits: [1, 1], sub: 0.4 },
        { type: 'addsub', weight: 40, rows: [5, 7], digits: [1, 1], sub: 0.4 }
      ]
    },
    2: {
      name: 'Level 2', stage: 'Beginner',
      about: '1-digit sums with big friends',
      tint: [255, 232, 204],
      formulas: ['direct', 'small', 'big'],
      maxTotal: null,
      mix: [
        { type: 'addsub', weight: 50, rows: [4, 6], digits: [1, 1], sub: 0.35 },
        { type: 'addsub', weight: 50, rows: [6, 9], digits: [1, 1], sub: 0.35 }
      ]
    },
    3: {
      name: 'Level 3', stage: 'Beginner',
      about: 'Combination formulas, 2 & 3-digit sums',
      tint: [255, 243, 191],
      formulas: ALL_FORMULAS,
      maxTotal: null,
      mix: [
        { type: 'addsub', weight: 15, rows: [8, 10], digits: [1, 1], sub: 0.35 },
        { type: 'addsub', weight: 30, rows: [4, 7], digits: [2, 2], sub: 0.35 },
        { type: 'addsub', weight: 35, rows: [5, 8], digits: [1, 3], sub: 0.35 },
        { type: 'addsub', weight: 20, rows: [3, 5], digits: [3, 3], sub: 0.3 }
      ]
    },
    4: {
      name: 'Level 4', stage: 'Intermediate',
      about: 'Longer sums, times tables, multiplication',
      tint: [211, 249, 216],
      formulas: ALL_FORMULAS,
      maxTotal: null,
      mix: [
        { type: 'addsub', weight: 45, rows: [5, 8], digits: [2, 3], sub: 0.35 },
        { type: 'mul', weight: 10, a: 1, b: 1 },
        { type: 'mul', weight: 27, a: 2, b: 1 },
        { type: 'mul', weight: 18, a: 3, b: 1 }
      ]
    },
    5: {
      name: 'Level 5', stage: 'Intermediate',
      about: 'Multiplication, division & remainders',
      tint: [197, 246, 250],
      formulas: ALL_FORMULAS,
      maxTotal: null,
      mix: [
        { type: 'addsub', weight: 36, rows: [5, 10], digits: [2, 4], sub: 0.35 },
        { type: 'mul', weight: 14, a: 3, b: 1 },
        { type: 'mul', weight: 14, a: 2, b: 2 },
        { type: 'div', weight: 12, dd: 2, dv: 1 },
        { type: 'div', weight: 12, dd: 3, dv: 1 },
        { type: 'divrem', weight: 6, dd: 2, dv: 1 },
        { type: 'divrem', weight: 6, dd: 3, dv: 1 }
      ]
    },
    6: {
      name: 'Level 6', stage: 'Intermediate',
      about: 'Decimals, squares, bigger × and ÷',
      tint: [208, 235, 255],
      formulas: ALL_FORMULAS,
      maxTotal: null,
      mix: [
        { type: 'addsub', weight: 20, rows: [6, 10], digits: [3, 4], sub: 0.35 },
        { type: 'addsub', weight: 12, rows: [4, 7], digits: [1, 2], sub: 0.3, dp: 1 },
        { type: 'mul', weight: 10, a: 3, b: 2 },
        { type: 'mul', weight: 8, a: 4, b: 1 },
        { type: 'mul', weight: 7, a: 1, b: 1, adp: 1 },
        { type: 'div', weight: 8, dd: 4, dv: 1 },
        { type: 'div', weight: 9, dd: 3, dv: 2 },
        { type: 'div', weight: 7, dd: 2, dv: 1, qdp: 1 },
        { type: 'divrem', weight: 7, dd: 3, dv: 1 },
        { type: 'square', weight: 6, digits: [2, 2] }
      ]
    },
    7: {
      name: 'Level 7', stage: 'Advanced',
      about: 'Negatives, %, roots, powers, LCM & HCF',
      tint: [229, 219, 255],
      formulas: ALL_FORMULAS,
      maxTotal: null,
      mix: [
        { type: 'addsub', weight: 14, rows: [6, 10], digits: [3, 5], sub: 0.35 },
        { type: 'addsub', weight: 7, rows: [5, 8], digits: [1, 3], sub: 0.3, dp: 2 },
        { type: 'negsum', weight: 6, rows: [3, 6], digits: [2, 3] },
        { type: 'mul', weight: 6, a: 3, b: 3 },
        { type: 'mul', weight: 5, a: 4, b: 2 },
        { type: 'mul', weight: 4, a: 2, b: 1, adp: 1 },
        { type: 'div', weight: 6, dd: 4, dv: 2 },
        { type: 'div', weight: 5, dd: 5, dv: 2 },
        { type: 'div', weight: 4, dd: 3, dv: 1, qdp: 2 },
        { type: 'divrem', weight: 4, dd: 4, dv: 2 },
        { type: 'pct', weight: 6, hard: false },
        { type: 'sqrt', weight: 6, digits: [2, 2] },
        { type: 'fracof', weight: 6 },
        { type: 'square', weight: 5, digits: [2, 2] },
        { type: 'cube', weight: 4, digits: [2, 2] },
        { type: 'lcm', weight: 3, count: [2, 3], max: 24 },
        { type: 'hcf', weight: 3, count: [2, 3], max: 120 }
      ]
    },
    8: {
      name: 'Level 8', stage: 'Grand Master',
      about: 'Competition mix: everything, bigger',
      tint: [243, 217, 250],
      formulas: ALL_FORMULAS,
      maxTotal: null,
      mix: [
        { type: 'addsub', weight: 11, rows: [8, 12], digits: [4, 6], sub: 0.4 },
        { type: 'addsub', weight: 6, rows: [6, 10], digits: [2, 4], sub: 0.35, dp: 2 },
        { type: 'negsum', weight: 6, rows: [4, 7], digits: [2, 4] },
        { type: 'mul', weight: 4, a: 4, b: 3 },
        { type: 'mul', weight: 4, a: 5, b: 2 },
        { type: 'mul', weight: 5, a: 2, b: 1, adp: 1, bdp: 1 },
        { type: 'div', weight: 5, dd: 6, dv: 2 },
        { type: 'div', weight: 5, dd: 5, dv: 3 },
        { type: 'div', weight: 4, dd: 4, dv: 2, qdp: 1 },
        { type: 'divrem', weight: 4, dd: 5, dv: 2 },
        { type: 'pct', weight: 5, hard: true },
        { type: 'sqrt', weight: 6, digits: [2, 3] },
        { type: 'cbrt', weight: 4 },
        { type: 'fracsum', weight: 7 },
        { type: 'mixed', weight: 9 },
        { type: 'square', weight: 4, digits: [3, 3] },
        { type: 'cube', weight: 3, digits: [2, 3] },
        { type: 'lcm', weight: 3, count: [2, 3], max: 30 },
        { type: 'hcf', weight: 3, count: [2, 3], max: 200 }
      ]
    }
  };

  // Quick Drill: one big number per row, write number × each multiplier.
  var QUICK_DRILL = {
    name: 'Quick Drill', stage: 'Speed',
    about: 'Big numbers × 2 and × 5, as fast as you can',
    tint: [233, 236, 239],
    digits: 8,            // digits in each number (no leading zero)
    multipliers: [2, 5],  // one answer column per multiplier: "Quick-2", "Quick-5"
    rowsPerTable: 6
  };

  var COUNT = { min: 10, max: 500, default: 100 };

  var api = { LEVELS: LEVELS, QUICK_DRILL: QUICK_DRILL, COUNT: COUNT, ALL_FORMULAS: ALL_FORMULAS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AbacusConfig = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
