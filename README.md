# Abacus Worksheet Maker

Make printable abacus practice worksheets (A4 PDF) in one click. Simple enough for a 12-year-old to use.

1. **Choose your level**: All Levels, or Level 1 to 8
2. **How many questions?** Anywhere from 10 to 500
3. **Generate Worksheet**: the PDF downloads, and **Open & Print** opens it ready to print

Everything runs in the browser with plain JavaScript. There's no server, no sign-up, no LLM and no API key. Once the page has loaded it also works offline, because jsPDF is bundled in `vendor/`.

## What makes it different

- **Everything is mixed up.** Each question picks its own operation, number of digits, number of rows and decimals, so no two sheets look alike.
- **Rows change per question.** One question can be a 4-row sum and the next a 10-row sum, and digit lengths can vary inside a single sum.
- **All Levels mode** mixes questions from levels 1–8 on one sheet. Each card shows a small `L1`…`L8` tag.
- **Abacus-friendly sums.** The running total never drops below zero. Level 1 sums stay within 1–9, the beads of a single rod.
- **No duplicate questions** on a sheet. Every answer is computed exactly and checked by the test suite.
- **Blank page before the answer key**, so the answers don't show through when you print double-sided.
- **Sheet ID** on every page ties a worksheet to its answer key, and the same ID always rebuilds the same sheet.

## Levels

| Level | Stage | What's on the sheet |
|---|---|---|
| 1 | Beginner | 1-digit add/subtract (3–5 rows, totals within 1–9 for small friends), a few 2-digit sums |
| 2 | Beginner | 1-digit sums with 5–8 rows (big friends), 2-digit sums, mixed 1–2 digit sums |
| 3 | Beginner | 2-digit sums with 4–7 rows, mixed 1–3 digit sums, 3-digit sums |
| 4 | Intermediate | Longer 2–3 digit sums, times tables, 2×1 and 3×1 digit multiplication |
| 5 | Intermediate | Sums with up to 10 rows, 3×1 and 2×2 multiplication, 2÷1 and 3÷1 division |
| 6 | Intermediate | Decimal sums, 3×2 and 4×1 multiplication, decimal × digit, 4÷1 and 3÷2 division, decimal quotients |
| 7 | Advanced | 4–5 digit sums, 2-decimal sums, 3×3 and 4×2 multiplication, 4÷2 and 5÷2 division, percentages, square roots, fraction of a number |
| 8 | Grand Master | 4–6 digit sums with 8–12 rows, 4×3 and 5×2 multiplication, 6÷2 and 5÷3 division, decimal × decimal, harder percentages, square and cube roots, adding/subtracting fractions, mixed BODMAS |

Division always comes out exact. Fraction answers are simplified, and shown as mixed numbers when they're bigger than one.

To change the mix, edit the `LEVELS` table in `js/generator.js`.

## Run it

Open `index.html` in any browser. That's it.

To share it online for free with **GitHub Pages**, go to the repo's *Settings → Pages* and set *Source* to this branch and the `/ (root)` folder. The tool will then be live at `https://<user>.github.io/abacus-sheet-generator/`.

## Developer notes

```
index.html          the page
css/style.css       styles (light + dark)
js/generator.js     question generator (seeded random, no dependencies)
js/pdf.js           PDF layout: question cards, blank page, answer key
js/app.js           page behaviour
vendor/             jsPDF 2.5.2 (MIT)
tests/              node tests: every answer is re-checked with exact maths
scripts/make-sample.js  build a PDF from the command line
```

```
npm test                         # run the tests (Node 18+)
node scripts/make-sample.js 8 100 out.pdf   # level 1-8 or "all", question count
```
