# Abacus Worksheet Maker

Make a fresh, random abacus practice sheet (A4 PDF) in one click. Simple enough for a 12-year-old to use.

1. **Choose your level**: All Levels, Quick Drill, or Level 1 to 8
2. **How many questions?** Anywhere from 10 to 500
3. **Generate Worksheet**: the PDF downloads, and **Open & Print** opens it ready to print

Everything runs in the browser with plain JavaScript. There's no server, no sign-up, no LLM, no API key and no network calls. jsPDF is bundled in `vendor/`, so the page also works offline.

## Features

- **Maximum randomness.** Each question picks its own operation, digits, number of rows and decimals, so no two sheets look alike. You never set operations, rows or digits yourself.
- **Real abacus rules.** Add/subtract sums are worked out bead by bead on soroban rods. Each step is classed as **Direct**, **Small Friend** (±5), **Big Friend** (±10) or **Combination**, and a sum is only used if its level has taught every formula it needs. The running total never drops below zero.
- **All Levels mode** mixes levels 1–8 on one sheet. Each card shows a small `L1`…`L8` tag.
- **Quick Drill**: a teacher-style table with S.No. | Number | Quick-2 | Quick-5. Each row has one random 8-digit number to multiply by 2 and by 5. Tables have 6 rows, and several fit on a page. The header has Start Time, End Time and Act. Time (min / sec).
- **Exact answers only.** Division always works out exactly or as "Q R r", fractions are simplified, and the tests recheck every answer with exact BigInt maths.
- **No repeated questions** on a sheet.
- **Print-friendly PDF.** A question is never split across pages, and the sheet never ends on a nearly empty page. Pale headers and dark lines stay clear in black and white.
- **Blank page before the answer key**, so the answers don't show through when you print double-sided. The key has 12 answers per row in two groups of six, so each answer sits in the same column as its question.
- **Sheet ID** in every footer. The same ID, level and count always rebuild the same sheet.

## Levels

| Level | Stage | Formulas | What's on the sheet |
|---|---|---|---|
| 1 | Beginner | Direct, Small Friends | 1-digit sums, 3–7 rows, running total within 1–9 |
| 2 | Beginner | + Big Friends | 1-digit sums, 4–9 rows |
| 3 | Beginner | + Combination | 1-, 2- and 3-digit sums, up to 10 rows |
| 4 | Intermediate | all | 2–3 digit sums, times tables, 2×1 and 3×1 multiplication |
| 5 | Intermediate | all | Sums with up to 10 rows, 3×1 and 2×2 ×, 2÷1 and 3÷1 ÷, division with remainder |
| 6 | Intermediate | all | Decimal sums, 3×2, 4×1 and decimal ×, 4÷1, 3÷2 and decimal ÷, remainders, squares of 2-digit numbers |
| 7 | Advanced | all | 3–5 digit and 2-decimal sums, negative-number sums, 3×3 and 4×2 ×, 4÷2 and 5÷2 ÷, decimal × and ÷, %, square roots, fraction of a number, squares, cubes, LCM, HCF |
| 8 | Grand Master | all | 4–6 digit sums with 8–12 rows, negative sums, 4×3 and 5×2 ×, 6÷2 and 5÷3 ÷, decimal × and ÷, harder %, square and cube roots, fractions, BODMAS, squares of 3-digit and cubes of 2–3 digit numbers, LCM, HCF |
| Quick Drill | Speed | – | One 8-digit number per row: write ×2 and ×5 |

## Changing the rules

All rules live in **`js/config.js`**. The generator has no limits of its own.

**Change a level:** edit its entry in `LEVELS`.
- `formulas`: the formulas allowed in its sums (`'direct'`, `'small'`, `'big'`, `'combo'`)
- `maxTotal`: the highest running total allowed
- `mix`: the list of recipes. Each recipe has a `type`, a `weight` (how often it's picked), and its own options such as `rows`, `digits`, `sub` and `dp`. Every option is described at the top of the file.

**Add a level:** add a new numbered entry (for example `9: { ... }`) with the same fields. Its tile, All Levels mode and the tests pick it up automatically.

**Change Quick Drill:** edit `QUICK_DRILL`: `digits`, `multipliers` (`[2, 5]` gives Quick-2 and Quick-5) and `rowsPerTable`.

**Add a question type:**
1. Write a builder in `js/generator.js`. It takes `(rng, item, level)` and returns `{ kind: 'stack', lines, answer }` or `{ kind: 'inline', tokens, answer }`, or `null` if it couldn't make one. Keep every loop bounded.
2. Register it in `BUILDERS`, then use its name as a `type` in a level's `mix`.
3. If it needs a new kind of token, teach `js/pdf.js` to draw it (`tokenWidth` and `drawTokens`).
4. Teach `tests/exact.js` to check its answer exactly, and add its options to `checkQuestion` in `tests/rules.test.js`. Then run `npm test`.

## Put it on your website (static host, any subfolder)

Every path is relative and there's no build step. Just upload the folder:

1. Upload these to a folder on your host, for example `abacus/`:
   `index.html`, `css/`, `js/`, `vendor/`
2. Open `https://your-site/abacus/` (or `.../abacus/index.html`).

That's all. No server features are needed, so any static host works, including GitHub Pages. You don't need to upload `tests/`, `scripts/` or `package.json`.

## Developer notes

```
index.html              the page
css/style.css           styles (light + dark)
js/config.js            all level rules, Quick Drill settings, count range
js/generator.js         question builders, soroban rod checker, seeded random
js/pdf.js               PDF layout: question cards / Quick Drill tables, blank page, answer key
js/app.js               page behaviour
vendor/                 jsPDF 2.5.2 (MIT)
tests/exact.js          exact BigInt answer checker
tests/*.test.js         answers, level rules (500 sheets per level), Quick Drill, edge cases
scripts/make-sample.js  build a PDF from the command line
```

```
npm test                                        # run all tests (Node 18+)
node scripts/make-sample.js 8 100 out.pdf       # level 1-8 or "all", question count
node scripts/make-sample.js quick 60 qd.pdf 10  # Quick Drill, optional digit count
```
