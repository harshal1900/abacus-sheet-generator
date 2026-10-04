// Build a sample PDF from the command line:
//   node scripts/make-sample.js <level 1-8|all> <count> [out.pdf]
const fs = require('fs');
const { jsPDF } = require('../vendor/jspdf.umd.min.js');
const gen = require('../js/generator.js');
const pdf = require('../js/pdf.js');

const level = process.argv[2] || 'all';
const count = Number(process.argv[3] || 100);
const out = process.argv[4] || `sample-${level}-${count}.pdf`;
const sheet = gen.generateWorksheet(level === 'all' ? 'all' : Number(level), count);
const doc = pdf.buildPdf(jsPDF, sheet, gen.LEVELS);
fs.writeFileSync(out, Buffer.from(doc.output('arraybuffer')));
console.log(`${out}: ${sheet.count} questions, ${doc.internal.getNumberOfPages()} pages, sheet ${sheet.id}`);
