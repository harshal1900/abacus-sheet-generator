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
  var OTHER_TOP = MARGIN + 26;              // content top on pages after the first

  var COLS = 6, GAP_X = 6, GAP_Y = 9;
  var CARD_W = (CONTENT_W - GAP_X * (COLS - 1)) / COLS;
  var HEAD_H = 14, ANSWER_H = 19, PAD = 5, LINE_H = 11.6;
  var FONT = 'helvetica';

  // Card headers use each level's `tint` from config.js: pale enough to
  // print as light grey in black & white, with dark text on top.
  var INK = [20, 23, 28], MUTED = [92, 99, 110], BORDER = [105, 113, 125];
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
    if (sheet.type === 'quick') {
      return 'Quick Drill - number ' + sheet.multipliers.map(function (m) { return '× ' + m; }).join(' and ') +
        '   |   ' + sheet.digits + '-digit numbers';
    }
    if (sheet.level === 'all') return 'All Levels (1-8 mixed)';
    var L = LEVELS[sheet.level];
    return L.name + ' - ' + L.stage;
  }

  /*
   * Header fields, one array per line. A field is
   *   { label, width, suffix? , parts? }  parts: short blanks with words,
   *   e.g. ['min', 'sec'] draws  "__ min __ sec".
   */
  function headerFields(sheet) {
    var score = { label: 'Score:', width: CONTENT_W - 380 - 30, suffix: '/ ' + sheet.count };
    if (sheet.type === 'quick') {
      return [
        [{ label: 'Name:', width: 250 }, { label: 'Date:', width: 130 }, { label: 'Score:', width: CONTENT_W - 380 - 20, suffix: '/ ' + sheet.count * sheet.multipliers.length }],
        [{ label: 'Start Time:', width: 150 }, { label: 'End Time:', width: 150 }, { label: 'Act. Time:', width: CONTENT_W - 300 - 20, parts: ['min', 'sec'] }]
      ];
    }
    return [[{ label: 'Name:', width: 190 }, { label: 'Date:', width: 100 }, { label: 'Time:', width: 90 }, score]];
  }

  function drawField(doc, f, fx, fy) {
    doc.setFont(FONT, 'bold');
    doc.text(f.label, fx, fy);
    var start = fx + doc.getTextWidth(f.label) + 4, end = fx + f.width;
    doc.setFont(FONT, 'normal');
    if (f.parts) {
      var seg = (end - start) / f.parts.length;
      f.parts.forEach(function (word, i) {
        var wx = start + seg * i, ww = doc.getTextWidth(word);
        doc.line(wx, fy + 2, wx + seg - ww - 8, fy + 2);
        doc.text(word, wx + seg - 4, fy, { align: 'right' });
      });
      return;
    }
    if (f.suffix) end -= doc.getTextWidth(f.suffix) + 3;
    doc.line(start, fy + 2, end, fy + 2);
    if (f.suffix) doc.text(f.suffix, fx + f.width, fy, { align: 'right' });
  }

  function drawFirstHeader(doc, sheet, LEVELS) {
    var y = MARGIN;
    drawAbacusIcon(doc, MARGIN, y, 52, 36);
    doc.setTextColor.apply(doc, INK);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(20);
    doc.text(sheetTitle(sheet), PAGE_W / 2, y + 17, { align: 'center' });
    doc.setFont(FONT, 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor.apply(doc, MUTED);
    doc.text(levelLabel(sheet, LEVELS) + '   |   ' + sheet.count + (sheet.type === 'quick' ? ' numbers' : ' questions'),
      PAGE_W / 2, y + 33, { align: 'center' });
    doc.setFontSize(8.5);
    doc.text('Sheet ID', PAGE_W - MARGIN, y + 10, { align: 'right' });
    doc.setFont(FONT, 'bold');
    doc.setFontSize(11);
    doc.setTextColor.apply(doc, INK);
    doc.text(sheet.id, PAGE_W - MARGIN, y + 23, { align: 'right' });

    var fy = y + 60;
    doc.setFontSize(10);
    doc.setDrawColor.apply(doc, BORDER);
    doc.setLineWidth(0.6);
    headerFields(sheet).forEach(function (line, li) {
      if (li) fy += 22;
      var fx = MARGIN;
      line.forEach(function (f) { drawField(doc, f, fx, fy); fx += f.width + 10; });
    });
    doc.setDrawColor.apply(doc, ACCENT);
    doc.setLineWidth(1.2);
    doc.line(MARGIN, fy + 12, PAGE_W - MARGIN, fy + 12);
    return fy + 24;
  }

  function sheetTitle(sheet) {
    return sheet.type === 'quick' ? 'Quick Drill Practice' : 'Abacus Practice Worksheet';
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
    return OTHER_TOP;
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

  var tintOf = function (q) { return [235, 237, 240]; };

  function drawCard(doc, q, x, y, bodyH, showLevel) {
    var h = HEAD_H + bodyH + ANSWER_H;
    doc.setDrawColor.apply(doc, BORDER);
    doc.setLineWidth(0.7);
    doc.setFillColor.apply(doc, tintOf(q));
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

  function rowHeight(row) { return HEAD_H + rowBodyHeight(row) + ANSWER_H; }

  function drawQuestionPages(doc, sheet, LEVELS) {
    var showLevel = sheet.level === 'all';
    var top = drawFirstHeader(doc, sheet, LEVELS);
    var pages = layoutPages(packRows(sheet.questions), rowHeight, top, OTHER_TOP, GAP_Y, true);
    sheet.pageFill = pageFill(pages, rowHeight, top, GAP_Y);
    var n = 1;
    sheet.ordered = [];
    pages.forEach(function (page, p) {
      var y = top;
      if (p > 0) {
        doc.addPage();
        y = drawSmallHeader(doc, sheet, LEVELS, sheetTitle(sheet));
      }
      page.forEach(function (row) {
        var bodyH = rowBodyHeight(row);
        row.forEach(function (q, c) {
          q.number = n++;
          sheet.ordered.push(q);
          drawCard(doc, q, MARGIN + c * (CARD_W + GAP_X), y, bodyH, showLevel);
        });
        y += rowHeight(row) + GAP_Y;
      });
    });
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

  /*
   * Answer key: 12 answers per row, so each key row holds two worksheet rows
   * (Q1-6 | Q7-12) and every answer sits in the same column as its question.
   */
  function drawAnswerKey(doc, sheet, LEVELS) {
    var KCOLS = 12, KGAP = 3, MID = 12, kHead = 11;
    var cw = (CONTENT_W - KGAP * (KCOLS - 2) - MID) / KCOLS;
    var qs = sheet.ordered;
    var rows = [];
    for (var r = 0; r < qs.length; r += KCOLS) rows.push(qs.slice(r, r + KCOLS));
    var bodyOf = function (row) { return row.some(function (q) { return hasFrac(q.answer); }) ? 25 : 17; };
    var heightOf = function (row) { return kHead + bodyOf(row); };

    var pages = layoutPages(rows, heightOf, OTHER_TOP, OTHER_TOP, 6, false);
    pages.forEach(function (page, p) {
      doc.addPage();
      var y = drawSmallHeader(doc, sheet, LEVELS, p ? 'Answer Key (continued)' : 'Answer Key');
      page.forEach(function (row) {
        var bodyH = bodyOf(row);
        row.forEach(function (q, i) {
          var x = MARGIN + i * (cw + KGAP) + (i >= KCOLS / 2 ? MID - KGAP : 0);
          doc.setDrawColor.apply(doc, BORDER);
          doc.setLineWidth(0.6);
          doc.setFillColor.apply(doc, tintOf(q));
          doc.rect(x, y, cw, kHead, 'F');
          doc.rect(x, y, cw, kHead + bodyH);
          doc.line(x, y + kHead, x + cw, y + kHead);
          doc.setFont(FONT, 'bold');
          doc.setFontSize(7.5);
          doc.setTextColor.apply(doc, INK);
          doc.text(String(q.number), x + cw / 2, y + 8, { align: 'center' });
          var fs = fitTokens(doc, q.answer, cw - 4, 9.5, 5);
          drawTokens(doc, q.answer, x + cw / 2, y + kHead + bodyH / 2, fs, true);
        });
        y += heightOf(row) + 6;
      });
    });
  }

  // ---------- Quick Drill ----------

  var QD_HEAD_H = 22, QD_ROW_H = 25, QD_GAP = 12;

  function quickColumns(sheet) {
    var sno = 48, number = 150;
    var rest = (CONTENT_W - sno - number) / sheet.multipliers.length;
    var cols = [{ title: 'S.No.', w: sno }, { title: 'Number', w: number }];
    sheet.multipliers.forEach(function (m) { cols.push({ title: 'Quick-' + m, w: rest }); });
    return cols;
  }

  // Font size so `str` (drawn with charSpace) fits in width w.
  function fitText(doc, str, w, maxFs, minFs, charSpace) {
    var fs = maxFs;
    doc.setFontSize(fs);
    while (fs > minFs && doc.getTextWidth(str) + charSpace * (str.length - 1) > w) {
      fs -= 0.5;
      doc.setFontSize(fs);
    }
    return fs;
  }

  function drawQuickTable(doc, sheet, rows, firstNo, y) {
    var cols = quickColumns(sheet);
    var h = QD_HEAD_H + rows.length * QD_ROW_H;
    // Header band (light grey prints well in black & white).
    doc.setFillColor(232, 235, 239);
    doc.rect(MARGIN, y, CONTENT_W, QD_HEAD_H, 'F');
    doc.setTextColor.apply(doc, INK);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(11.5);
    var x = MARGIN;
    cols.forEach(function (c) {
      doc.text(c.title, x + c.w / 2, y + QD_HEAD_H / 2 + 4, { align: 'center' });
      x += c.w;
    });

    rows.forEach(function (row, i) {
      var ry = y + QD_HEAD_H + i * QD_ROW_H;
      var base = ry + QD_ROW_H / 2 + 5;
      doc.setFont(FONT, 'normal');
      doc.setFontSize(12);
      doc.text(String(firstNo + i), MARGIN + cols[0].w / 2, base - 0.5, { align: 'center' });
      doc.setFont(FONT, 'bold');
      var fs = fitText(doc, row.number, cols[1].w - 14, 17, 8, 1.2);
      doc.setFontSize(fs);
      doc.text(row.number, MARGIN + cols[0].w + cols[1].w / 2, base, { align: 'center', charSpace: 1.2 });
    });

    // Grid: thin inner lines, strong outline.
    doc.setDrawColor(70, 76, 86);
    doc.setLineWidth(0.6);
    for (var r = 1; r <= rows.length; r++) {
      var ly = y + QD_HEAD_H + (r - 1) * QD_ROW_H;
      doc.line(MARGIN, ly, MARGIN + CONTENT_W, ly);
    }
    x = MARGIN;
    for (var c = 0; c < cols.length - 1; c++) {
      x += cols[c].w;
      doc.line(x, y, x, y + h);
    }
    doc.setLineWidth(1.3);
    doc.rect(MARGIN, y, CONTENT_W, h);
  }

  function drawQuickPages(doc, sheet, LEVELS) {
    var per = sheet.rowsPerTable;
    var tables = [];
    for (var i = 0; i < sheet.rows.length; i += per) tables.push(i);
    var heightOf = function (start) {
      return QD_HEAD_H + Math.min(per, sheet.rows.length - start) * QD_ROW_H;
    };
    var top = drawFirstHeader(doc, sheet, LEVELS);
    var pages = layoutPages(tables, heightOf, top, OTHER_TOP, QD_GAP, false);
    sheet.pageFill = pageFill(pages, heightOf, top, QD_GAP);
    pages.forEach(function (page, p) {
      var y = top;
      if (p > 0) {
        doc.addPage();
        y = drawSmallHeader(doc, sheet, LEVELS, sheetTitle(sheet));
      }
      page.forEach(function (start) {
        drawQuickTable(doc, sheet, sheet.rows.slice(start, start + per), start + 1, y);
        y += heightOf(start) + QD_GAP;
      });
    });
  }

  // Answer key: two compact tables side by side on each page.
  function drawQuickKey(doc, sheet, LEVELS) {
    var ROW = 14.5, HEAD = 16, GAP = 16;
    var blockW = (CONTENT_W - GAP) / 2;
    var sno = 30, rest = (blockW - sno) / (1 + sheet.multipliers.length);
    var titles = ['S.No.', 'Number'].concat(sheet.multipliers.map(function (m) { return '× ' + m; }));
    var widths = [sno, rest].concat(sheet.multipliers.map(function () { return rest; }));
    var i = 0;
    var first = true;
    while (i < sheet.rows.length) {
      doc.addPage();
      var top = drawSmallHeader(doc, sheet, LEVELS, first ? 'Answer Key' : 'Answer Key (continued)');
      first = false;
      var cap = Math.floor((BOTTOM - top - HEAD) / ROW);
      var onPage = Math.min(sheet.rows.length - i, cap * 2);
      var left = Math.ceil(onPage / 2);
      [left, onPage - left].forEach(function (n, b) {
        if (!n) return;
        var bx = MARGIN + b * (blockW + GAP);
        doc.setFillColor(232, 235, 239);
        doc.rect(bx, top, blockW, HEAD, 'F');
        doc.setFont(FONT, 'bold');
        doc.setFontSize(8.5);
        doc.setTextColor.apply(doc, INK);
        var cx = bx;
        titles.forEach(function (t, k) { doc.text(t, cx + widths[k] / 2, top + 11, { align: 'center' }); cx += widths[k]; });
        for (var r = 0; r < n; r++) {
          var row = sheet.rows[i + r];
          var ry = top + HEAD + r * ROW;
          var cells = [String(i + r + 1), row.number].concat(row.answers);
          cx = bx;
          cells.forEach(function (v, k) {
            doc.setFont(FONT, k === 0 ? 'normal' : (k === 1 ? 'normal' : 'bold'));
            fitText(doc, v, widths[k] - 4, 9, 5, 0);
            doc.text(v, cx + widths[k] / 2, ry + ROW / 2 + 3.2, { align: 'center' });
            cx += widths[k];
          });
          doc.setDrawColor(150, 156, 166);
          doc.setLineWidth(0.4);
          doc.line(bx, ry + ROW, bx + blockW, ry + ROW);
        }
        doc.setDrawColor(70, 76, 86);
        doc.setLineWidth(0.8);
        doc.rect(bx, top, blockW, HEAD + n * ROW);
        cx = bx;
        for (var k = 0; k < widths.length - 1; k++) {
          cx += widths[k];
          doc.setLineWidth(0.4);
          doc.line(cx, top, cx, top + HEAD + n * ROW);
        }
        i += n;
      });
    }
  }

  /*
   * Split items (drawn top to bottom) into pages.
   *   heightOf(item)  height of one item; items never split across pages
   *   reorder         pull a shorter item forward to fill a page's leftover gap
   * If the last page ends up less than half full, items move from the page
   * before it until the two pages are as even as possible, so earlier pages
   * stay full and the sheet never ends on a near-empty page.
   */
  function layoutPages(items, heightOf, firstTop, otherTop, gap, reorder) {
    var pool = items.slice(), pages = [[]], y = firstTop;
    while (pool.length) {
      var h = heightOf(pool[0]);
      var page = pages[pages.length - 1];
      if (y + h > BOTTOM && page.length) {
        var fit = -1;
        if (reorder) {
          for (var i = 1; i < pool.length; i++) {
            if (y + heightOf(pool[i]) <= BOTTOM) { fit = i; break; }
          }
        }
        if (fit > 0) { pool.unshift(pool.splice(fit, 1)[0]); continue; }
        pages.push([]);
        y = otherTop;
        continue;
      }
      page.push(pool.shift());
      y += h + gap;
    }

    function used(page) {
      var t = 0;
      page.forEach(function (it, k) { t += heightOf(it) + (k ? gap : 0); });
      return t;
    }
    var n = pages.length;
    if (n < 2) return pages;
    var room = BOTTOM - otherTop;
    var prevRoom = BOTTOM - (n === 2 ? firstTop : otherTop);
    var prev = pages[n - 2], last = pages[n - 1];
    if (used(last) >= room / 2) return pages;
    while (prev.length > 1) {
      var moved = prev[prev.length - 1];
      var newLast = [moved].concat(last);
      if (used(newLast) > room) break;
      var before = Math.abs(used(prev) / prevRoom - used(last) / room);
      var after = Math.abs(used(prev.slice(0, -1)) / prevRoom - used(newLast) / room);
      if (after >= before) break;
      prev.pop();
      last = newLast;
    }
    pages[n - 1] = last;
    return pages;
  }

  // How full each page is (0..1), for tests and tuning.
  function pageFill(pages, heightOf, firstTop, gap) {
    return pages.map(function (page, p) {
      var used = 0;
      page.forEach(function (it, k) { used += heightOf(it) + (k ? gap : 0); });
      return used / (BOTTOM - (p ? OTHER_TOP : firstTop));
    });
  }

  /*
   * Build the PDF. Returns the jsPDF document.
   *   jsPDF: the jsPDF constructor
   *   sheet: result of AbacusGen.generateWorksheet()
   */
  function buildPdf(jsPDF, sheet, LEVELS) {
    var doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
    tintOf = function (q) { return (LEVELS[q.level] && LEVELS[q.level].tint) || [235, 237, 240]; };
    doc.setProperties({ title: 'Abacus Practice Worksheet ' + sheet.id, creator: 'Abacus Sheet Generator' });
    if (sheet.type === 'quick') {
      drawQuickPages(doc, sheet, LEVELS);
      drawBlankPage(doc);
      drawQuickKey(doc, sheet, LEVELS);
    } else {
      drawQuestionPages(doc, sheet, LEVELS);
      drawBlankPage(doc);
      drawAnswerKey(doc, sheet, LEVELS);
    }
    drawFooters(doc, sheet);
    return doc;
  }

  var api = { buildPdf: buildPdf, _internal: { packRows: packRows, bodyHeight: bodyHeight } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AbacusPdf = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
