/*
 * Turns a worksheet from generator.js into a printable A4 PDF with jsPDF.
 *
 * Pages: question pages -> one blank page -> answer key page(s).
 */
(function (root) {
  'use strict';

  var PAGE_W = 595.28, PAGE_H = 841.89;     // A4 in points
  var MARGIN = 28;
  var CONTENT_W = PAGE_W - MARGIN * 2;
  var FOOTER_H = 18;
  var BOTTOM = PAGE_H - MARGIN - FOOTER_H;

  var COLS = 6, GAP_X = 6, GAP_Y = 9;
  var CARD_W = (CONTENT_W - GAP_X * (COLS - 1)) / COLS;
  var HEAD_H = 14, ANSWER_H = 19, PAD = 5, LINE_H = 11.6;
  var FONT = 'helvetica';

  // Soft colour per level for the card headers (still clear in black & white).
  var LEVEL_TINT = {
    1: [253, 226, 228], 2: [255, 232, 204], 3: [255, 243, 191], 4: [211, 249, 216],
    5: [197, 246, 250], 6: [208, 235, 255], 7: [229, 219, 255], 8: [243, 217, 250]
  };
  var INK = [33, 37, 41], MUTED = [110, 118, 129], BORDER = [150, 160, 172];
  var ACCENT = [76, 110, 245];

  // ---------- token measuring / drawing ----------

  function tokenWidth(doc, tok, fs) {
    if (tok.t === 'frac') {
      doc.setFontSize(fs * 0.85);
      var w = Math.max(doc.getTextWidth(tok.n), doc.getTextWidth(tok.d)) + 3;
      doc.setFontSize(fs);
      return w;
    }
    if (tok.t === 'root') {
      doc.setFontSize(fs);
      return fs * 0.62 + doc.getTextWidth(tok.v) + 2;
    }
    if (tok.t === 'pow') {
      doc.setFontSize(fs * 0.62);
      var ew = doc.getTextWidth(tok.e);
      doc.setFontSize(fs);
      return doc.getTextWidth(tok.v) + ew + 1;
    }
    doc.setFontSize(fs);
    return doc.getTextWidth(tokenText(tok));
  }

  function tokenText(tok) {
    return tok.t === 'fn' ? tok.v + ' (' + tok.args.join(', ') + ')' : tok.v;
  }

  function tokensWidth(doc, tokens, fs) {
    var w = 0;
    for (var i = 0; i < tokens.length; i++) w += tokenWidth(doc, tokens[i], fs) + gapAfter(tokens, i, fs);
    return w;
  }

  // Space after token i: none at the end or just inside brackets.
  function gapAfter(tokens, i, fs) {
    if (i === tokens.length - 1 || tokens[i].v === '(' || tokens[i + 1].v === ')') return 0;
    return fs * 0.28;
  }

  function hasFrac(tokens) {
    for (var i = 0; i < tokens.length; i++) if (tokens[i].t === 'frac') return true;
    return false;
  }

  // Largest font size (<= maxFs) that fits the tokens into maxW.
  function fitTokens(doc, tokens, maxW, maxFs, minFs) {
    var fs = maxFs;
    while (fs > minFs && tokensWidth(doc, tokens, fs) > maxW) fs -= 0.25;
    return fs;
  }

  // Draw tokens centred on (cx, cy).
  function drawTokens(doc, tokens, cx, cy, fs, bold) {
    var x = cx - tokensWidth(doc, tokens, fs) / 2;
    var base = cy + fs * 0.35;
    doc.setFont(FONT, bold ? 'bold' : 'normal');
    for (var i = 0; i < tokens.length; i++) {
      var tok = tokens[i];
      var w = tokenWidth(doc, tok, fs);
      if (tok.t === 'frac') {
        var fs2 = fs * 0.85;
        doc.setFontSize(fs2);
        doc.text(tok.n, x + w / 2, cy - 1.8, { align: 'center' });
        doc.text(tok.d, x + w / 2, cy + fs2 * 0.72 + 1.8, { align: 'center' });
        doc.setLineWidth(0.6);
        doc.line(x + 0.5, cy, x + w - 0.5, cy);
      } else if (tok.t === 'root') {
        doc.setFontSize(fs);
        var top = base - fs * 0.85, bottom = base + 1.2;
        var r0 = x, r1 = x + fs * 0.18, r2 = x + fs * 0.33, r3 = x + fs * 0.55;
        doc.setLineWidth(0.7);
        doc.line(r0, base - fs * 0.32, r1, base - fs * 0.4);
        doc.line(r1, base - fs * 0.4, r2, bottom);
        doc.line(r2, bottom, r3, top);
        doc.line(r3, top, x + w, top);
        if (tok.index) {
          doc.setFontSize(fs * 0.5);
          doc.text(tok.index, r0 + fs * 0.02, base - fs * 0.5);
          doc.setFontSize(fs);
        }
        doc.text(tok.v, x + fs * 0.62, base);
      } else if (tok.t === 'pow') {
        doc.setFontSize(fs);
        var bw = doc.getTextWidth(tok.v);
        doc.text(tok.v, x, base);
        doc.setFontSize(fs * 0.62);
        doc.text(tok.e, x + bw + 1, base - fs * 0.42);
        doc.setFontSize(fs);
      } else {
        doc.setFontSize(fs);
        if (tok.t === 'text') doc.setTextColor.apply(doc, MUTED);
        doc.text(tokenText(tok), x, base);
        doc.setTextColor.apply(doc, INK);
      }
      x += w + gapAfter(tokens, i, fs);
    }
  }

  // ---------- question card sizes ----------

  function bodyHeight(q) {
    if (q.kind === 'stack') return q.lines.length * LINE_H + PAD * 2;
    return hasFrac(q.tokens) ? 34 : 26;
  }

  /*
   * Group questions into rows of COLS. Questions keep their random order, but
   * each row is filled with nearby questions of similar height so the page
   * does not waste space. Numbering follows the final layout.
   */
  function packRows(questions) {
    var pool = questions.slice();
    var rows = [];
    var WINDOW = 30;
    while (pool.length) {
      var first = pool.shift();
      var h = bodyHeight(first);
      var cand = [];
      for (var i = 0; i < Math.min(WINDOW, pool.length); i++) {
        cand.push({ i: i, d: Math.abs(bodyHeight(pool[i]) - h) });
      }
      cand.sort(function (a, b) { return a.d - b.d || a.i - b.i; });
      var take = cand.slice(0, COLS - 1).map(function (c) { return c.i; });
      take.sort(function (a, b) { return a - b; });
      var row = [first];
      for (var t = take.length - 1; t >= 0; t--) row.splice(1, 0, pool.splice(take[t], 1)[0]);
      rows.push(row);
    }
    return rows;
  }

  // ---------- page furniture ----------

  function drawAbacusIcon(doc, x, y, w, h) {
    doc.setDrawColor.apply(doc, INK);
    doc.setLineWidth(1.2);
    doc.roundedRect(x, y, w, h, 2, 2);
    doc.setLineWidth(0.8);
    var beam = y + h * 0.32;
    doc.line(x, beam, x + w, beam);
    var rods = 5;
    var colors = [[250, 82, 82], [253, 126, 20], [64, 192, 87], [34, 139, 230], [121, 80, 242]];
    for (var r = 0; r < rods; r++) {
      var rx = x + (w / (rods + 1)) * (r + 1);
      doc.setLineWidth(0.5);
      doc.line(rx, y + 1.5, rx, y + h - 1.5);
      doc.setFillColor.apply(doc, colors[r]);
      var heaven = (r % 2 === 0) ? beam - 3.2 : y + 4;
      doc.ellipse(rx, heaven, 3.2, 2, 'F');
      var lift = [1, 3, 2, 0, 4][r];
      for (var b = 0; b < 4; b++) {
        var by = b < lift ? beam + 3 + b * 4.2 : y + h - 3 - (3 - b) * 4.2;
        doc.ellipse(rx, by, 3.2, 2, 'F');
      }
    }
  }

  function levelLabel(sheet, LEVELS) {
    if (sheet.level === 'all') return 'All Levels (1-8 mixed)';
    var L = LEVELS[sheet.level];
    return L.name + ' - ' + L.stage;
  }

  function drawFirstHeader(doc, sheet, LEVELS) {
    var y = MARGIN;
    drawAbacusIcon(doc, MARGIN, y, 52, 36);
    doc.setTextColor.apply(doc, INK);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(20);
    doc.text('Abacus Practice Worksheet', PAGE_W / 2, y + 17, { align: 'center' });
    doc.setFont(FONT, 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor.apply(doc, MUTED);
    doc.text(levelLabel(sheet, LEVELS) + '   |   ' + sheet.count + ' questions',
      PAGE_W / 2, y + 33, { align: 'center' });
    doc.setFontSize(8.5);
    doc.text('Sheet ID', PAGE_W - MARGIN, y + 10, { align: 'right' });
    doc.setFont(FONT, 'bold');
    doc.setFontSize(11);
    doc.setTextColor.apply(doc, INK);
    doc.text(sheet.id, PAGE_W - MARGIN, y + 23, { align: 'right' });

    // Name / Date / Time / Score fields.
    var fy = y + 60;
    var fields = [['Name:', 190], ['Date:', 100], ['Time:', 90], ['Score:', CONTENT_W - 380 - 30]];
    var fx = MARGIN;
    doc.setFontSize(10);
    doc.setDrawColor.apply(doc, BORDER);
    doc.setLineWidth(0.6);
    for (var i = 0; i < fields.length; i++) {
      doc.setFont(FONT, 'bold');
      doc.text(fields[i][0], fx, fy);
      var lw = doc.getTextWidth(fields[i][0]) + 4;
      doc.line(fx + lw, fy + 2, fx + fields[i][1], fy + 2);
      if (i === fields.length - 1) {
        doc.setFont(FONT, 'normal');
        doc.text('/ ' + sheet.count, fx + fields[i][1], fy, { align: 'right' });
      }
      fx += fields[i][1] + 10;
    }
    doc.setDrawColor.apply(doc, ACCENT);
    doc.setLineWidth(1.2);
    doc.line(MARGIN, fy + 12, PAGE_W - MARGIN, fy + 12);
    return fy + 24;
  }

  function drawSmallHeader(doc, sheet, LEVELS, title) {
    doc.setTextColor.apply(doc, INK);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(11);
    doc.text(title, MARGIN, MARGIN + 8);
    doc.setFont(FONT, 'normal');
    doc.setFontSize(9);
    doc.setTextColor.apply(doc, MUTED);
    doc.text(levelLabel(sheet, LEVELS) + '   |   Sheet ' + sheet.id, PAGE_W - MARGIN, MARGIN + 8, { align: 'right' });
    doc.setDrawColor.apply(doc, ACCENT);
    doc.setLineWidth(0.8);
    doc.line(MARGIN, MARGIN + 14, PAGE_W - MARGIN, MARGIN + 14);
    doc.setTextColor.apply(doc, INK);
    return MARGIN + 26;
  }

  function drawFooters(doc, sheet) {
    var n = doc.internal.getNumberOfPages();
    for (var p = 1; p <= n; p++) {
      doc.setPage(p);
      doc.setFont(FONT, 'normal');
      doc.setFontSize(8);
      doc.setTextColor.apply(doc, MUTED);
      doc.text('Sheet ID: ' + sheet.id, MARGIN, PAGE_H - MARGIN + 4);
      doc.text('Page ' + p + ' of ' + n, PAGE_W - MARGIN, PAGE_H - MARGIN + 4, { align: 'right' });
    }
  }

  // ---------- question pages ----------

  function drawCard(doc, q, x, y, bodyH, showLevel) {
    var h = HEAD_H + bodyH + ANSWER_H;
    doc.setDrawColor.apply(doc, BORDER);
    doc.setLineWidth(0.7);
    doc.setFillColor.apply(doc, LEVEL_TINT[q.level]);
    doc.rect(x, y, CARD_W, HEAD_H, 'F');
    doc.rect(x, y, CARD_W, h);
    doc.line(x, y + HEAD_H, x + CARD_W, y + HEAD_H);

    doc.setTextColor.apply(doc, INK);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(8.5);
    doc.text('Q ' + q.number, x + CARD_W / 2, y + 10, { align: 'center' });
    if (showLevel) {
      doc.setFont(FONT, 'normal');
      doc.setFontSize(6.5);
      doc.setTextColor.apply(doc, MUTED);
      doc.text('L' + q.level, x + CARD_W - 3, y + 9.5, { align: 'right' });
      doc.setTextColor.apply(doc, INK);
    }

    var top = y + HEAD_H;
    if (q.kind === 'stack') {
      var fs = 10.5;
      doc.setFont(FONT, 'normal');
      doc.setFontSize(fs);
      var widest = 0;
      q.lines.forEach(function (l) { widest = Math.max(widest, doc.getTextWidth(l)); });
      while (widest > CARD_W - 16 && fs > 7) {
        fs -= 0.5;
        doc.setFontSize(fs);
        widest = 0;
        q.lines.forEach(function (l) { widest = Math.max(widest, doc.getTextWidth(l)); });
      }
      var right = x + CARD_W - 12;
      // Centre the number block horizontally within the card.
      right = Math.min(right, x + CARD_W / 2 + widest / 2 + 4);
      var used = q.lines.length * LINE_H + PAD * 2;
      var by = top + PAD + (bodyH - used) / 2 + LINE_H * 0.78;
      for (var i = 0; i < q.lines.length; i++) {
        var line = q.lines[i];
        var sym = line.charAt(0);
        if (sym === '×' || sym === '÷') {
          var rest = line.slice(1);
          doc.setFont(FONT, 'normal');
          doc.text(rest, right, by, { align: 'right' });
          doc.setFont(FONT, 'bold');
          doc.text(sym, right - widest - 2, by, { align: 'right' });
        } else {
          doc.setFont(FONT, 'normal');
          doc.text(line, right, by, { align: 'right' });
        }
        by += LINE_H;
      }
    } else {
      var ifs = fitTokens(doc, q.tokens, CARD_W - 10, 11, 6.5);
      drawTokens(doc, q.tokens, x + CARD_W / 2, top + bodyH / 2, ifs, false);
    }

    // Answer box
    doc.setDrawColor.apply(doc, BORDER);
    doc.line(x, top + bodyH, x + CARD_W, top + bodyH);
    if (q.answerHint) {
      // e.g. "R" so the child writes the quotient left and remainder right.
      doc.setFont(FONT, 'bold');
      doc.setFontSize(9);
      doc.setTextColor.apply(doc, MUTED);
      doc.text(q.answerHint, x + CARD_W * 0.62, top + bodyH + ANSWER_H / 2 + 3.2, { align: 'center' });
      doc.setTextColor.apply(doc, INK);
    }
  }

  function rowBodyHeight(row) {
    var h = 0;
    row.forEach(function (q) { h = Math.max(h, bodyHeight(q)); });
    return h;
  }

  function drawQuestionPages(doc, sheet, LEVELS) {
    var rows = packRows(sheet.questions);
    var showLevel = sheet.level === 'all';
    var y = drawFirstHeader(doc, sheet, LEVELS);
    var n = 1;
    sheet.ordered = [];
    while (rows.length) {
      var rowH = HEAD_H + rowBodyHeight(rows[0]) + ANSWER_H;
      if (y + rowH > BOTTOM) {
        // Fill the leftover space with a shorter row from further down, if any.
        var fit = -1;
        for (var i = 1; i < rows.length; i++) {
          if (y + HEAD_H + rowBodyHeight(rows[i]) + ANSWER_H <= BOTTOM) { fit = i; break; }
        }
        if (fit > 0) {
          rows.unshift(rows.splice(fit, 1)[0]);
          continue;
        }
        doc.addPage();
        y = drawSmallHeader(doc, sheet, LEVELS, 'Abacus Practice Worksheet');
        continue;
      }
      var row = rows.shift();
      var bodyH = rowBodyHeight(row);
      row.forEach(function (q, c) {
        q.number = n++;
        sheet.ordered.push(q);
        drawCard(doc, q, MARGIN + c * (CARD_W + GAP_X), y, bodyH, showLevel);
      });
      y += rowH + GAP_Y;
    }
  }

  // ---------- blank page + answer key ----------

  function drawBlankPage(doc) {
    doc.addPage();
    doc.setFont(FONT, 'italic');
    doc.setFontSize(10);
    doc.setTextColor.apply(doc, MUTED);
    doc.text('This page is intentionally left blank.', PAGE_W / 2, PAGE_H / 2, { align: 'center' });
    doc.setTextColor.apply(doc, INK);
  }

  function drawAnswerKey(doc, sheet, LEVELS) {
    var KCOLS = 10, KGAP = 4;
    var cw = (CONTENT_W - KGAP * (KCOLS - 1)) / KCOLS;
    var kHead = 11;

    doc.addPage();
    var y = drawSmallHeader(doc, sheet, LEVELS, 'Answer Key');
    var qs = sheet.ordered;
    for (var r = 0; r < qs.length; r += KCOLS) {
      var row = qs.slice(r, r + KCOLS);
      var bodyH = row.some(function (q) { return hasFrac(q.answer); }) ? 26 : 18;
      if (y + kHead + bodyH > BOTTOM) {
        doc.addPage();
        y = drawSmallHeader(doc, sheet, LEVELS, 'Answer Key (continued)');
      }
      row.forEach(function (q, i) {
        var x = MARGIN + i * (cw + KGAP);
        doc.setDrawColor.apply(doc, BORDER);
        doc.setLineWidth(0.6);
        doc.setFillColor.apply(doc, LEVEL_TINT[q.level]);
        doc.rect(x, y, cw, kHead, 'F');
        doc.rect(x, y, cw, kHead + bodyH);
        doc.line(x, y + kHead, x + cw, y + kHead);
        doc.setFont(FONT, 'bold');
        doc.setFontSize(7.5);
        doc.setTextColor.apply(doc, INK);
        doc.text(String(q.number), x + cw / 2, y + 8, { align: 'center' });
        var fs = fitTokens(doc, q.answer, cw - 5, 9.5, 5.5);
        drawTokens(doc, q.answer, x + cw / 2, y + kHead + bodyH / 2, fs, true);
      });
      y += kHead + bodyH + 7;
    }
  }

  /*
   * Build the PDF. Returns the jsPDF document.
   *   jsPDF: the jsPDF constructor
   *   sheet: result of AbacusGen.generateWorksheet()
   */
  function buildPdf(jsPDF, sheet, LEVELS) {
    var doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    doc.setProperties({ title: 'Abacus Practice Worksheet ' + sheet.id, creator: 'Abacus Sheet Generator' });
    drawQuestionPages(doc, sheet, LEVELS);
    drawBlankPage(doc);
    drawAnswerKey(doc, sheet, LEVELS);
    drawFooters(doc, sheet);
    return doc;
  }

  var api = { buildPdf: buildPdf, _internal: { packRows: packRows, bodyHeight: bodyHeight } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AbacusPdf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
