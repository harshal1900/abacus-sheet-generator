// Build a sample PDF from the command line:
//   node scripts/make-sample.js <1-8 | all | quick> <count> [out.pdf] [quick digits]
const fs = require('fs');
const { jsPDF } = require('../vendor/jspdf.umd.min.js');
const gen = require('../js/generator.js');
const pdf = require('../js/pdf.js');

const level = process.argv[2] || 'all';
const count = Number(process.argv[3] || 100);
const out = process.argv[4] || `sample-${level}-${count}.pdf`;
const digits = Number(process.argv[5]) || undefined;
const lv = level === 'all' || level === 'quick' ? level : Number(level);
const started = Date.now();
const sheet = gen.generateWorksheet(lv, count, null, { digits });
const doc = pdf.buildPdf(jsPDF, sheet, gen.LEVELS);
fs.writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log(`${out}: ${sheet.count} ${sheet.type === 'quick' ? 'rows' : 'questions'}, ` +
  `${doc.internal.getNumberOfPages()} pages, sheet ${sheet.id}, ${Date.now() - started} ms` +
  (sheet.warning ? `\n  warning: ${sheet.warning}` : ''));
