(function () {
  'use strict';

  var MIN = 10, MAX = 500;
  var LEVELS = AbacusGen.LEVELS;
  var TINTS = ['', 'var(--l1)', 'var(--l2)', 'var(--l3)', 'var(--l4)', 'var(--l5)', 'var(--l6)', 'var(--l7)', 'var(--l8)'];

  var state = { level: 'all', count: 100 };
  var lastUrl = null;

  var el = function (id) { return document.getElementById(id); };
  var levelsBox = el('levels'), countInput = el('count'), slider = el('slider');

  // Remember the last choice on this device (optional nicety).
  try {
    var saved = JSON.parse(localStorage.getItem('abacus-sheet') || 'null');
    if (saved) {
      if (saved.level === 'all' || LEVELS[saved.level]) state.level = saved.level;
      if (saved.count) state.count = clamp(saved.count);
    }
  } catch (e) { /* storage unavailable */ }

  function save() {
    try { localStorage.setItem('abacus-sheet', JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function clamp(n) {
    n = Math.round(Number(n));
    if (!isFinite(n)) return 100;
    return Math.max(MIN, Math.min(MAX, n));
  }

  // ---------- level tiles ----------

  function tile(value, title, stage, about, dot) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'level' + (value === 'all' ? ' all' : '');
    b.setAttribute('role', 'radio');
    b.dataset.level = value;
    b.innerHTML =
      '<span class="title"><span class="dot"' + (dot ? ' style="background:' + dot + '"' : '') + '></span>' + title + '</span>' +
      '<span class="stage">' + stage + '</span>' +
      '<span class="about">' + about + '</span>';
    b.addEventListener('click', function () { setLevel(value); });
    return b;
  }

  levelsBox.appendChild(tile('all', 'All Levels', 'Mix it up', 'A surprise mix of every level, from easy sums to roots and fractions', ''));
  for (var i = 1; i <= 8; i++) {
    levelsBox.appendChild(tile(i, LEVELS[i].name, LEVELS[i].stage, LEVELS[i].about, TINTS[i]));
  }

  function setLevel(v) {
    state.level = v;
    var tiles = levelsBox.querySelectorAll('.level');
    for (var j = 0; j < tiles.length; j++) {
      var on = String(tiles[j].dataset.level) === String(v);
      tiles[j].setAttribute('aria-checked', on ? 'true' : 'false');
      tiles[j].tabIndex = on ? 0 : -1;
    }
    save();
  }

  // Arrow keys move between level tiles (radio group behaviour).
  levelsBox.addEventListener('keydown', function (e) {
    var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!keys[e.key]) return;
    e.preventDefault();
    var order = ['all', 1, 2, 3, 4, 5, 6, 7, 8];
    var idx = order.indexOf(state.level);
    var next = order[(idx + keys[e.key] + order.length) % order.length];
    setLevel(next);
    levelsBox.querySelector('[data-level="' + next + '"]').focus();
  });

  // ---------- question count ----------

  function setCount(n, fromTyping) {
    state.count = clamp(n);
    if (!fromTyping) countInput.value = state.count;
    slider.value = state.count;
    var presets = el('presets').querySelectorAll('button');
    for (var j = 0; j < presets.length; j++) {
      presets[j].classList.toggle('on', Number(presets[j].dataset.n) === state.count);
    }
    save();
  }

  function step(dir) {
    var n = state.count;
    var next = dir > 0 ? Math.floor(n / 10) * 10 + 10 : Math.ceil(n / 10) * 10 - 10;
    setCount(next);
  }

  el('minus').addEventListener('click', function () { step(-1); });
  el('plus').addEventListener('click', function () { step(1); });
  slider.addEventListener('input', function () { setCount(slider.value); });
  countInput.addEventListener('input', function () {
    if (countInput.value !== '') setCount(countInput.value, true);
  });
  countInput.addEventListener('blur', function () { setCount(countInput.value); });
  countInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') generate(); });
  el('presets').addEventListener('click', function (e) {
    if (e.target.dataset.n) setCount(e.target.dataset.n);
  });

  // ---------- generate ----------

  function generate() {
    setCount(countInput.value);
    var btn = el('generate');
    var err = el('error');
    err.hidden = true;
    btn.disabled = true;
    try {
      var sheet = AbacusGen.generateWorksheet(state.level, state.count);
      var doc = AbacusPdf.buildPdf(window.jspdf.jsPDF, sheet, LEVELS);
      var pages = doc.internal.getNumberOfPages();
      var blob = doc.output('blob');
      if (lastUrl) URL.revokeObjectURL(lastUrl);
      lastUrl = URL.createObjectURL(blob);

      var levelName = state.level === 'all' ? 'all-levels' : 'level-' + state.level;
      var fileName = 'abacus-' + levelName + '-' + sheet.count + 'q-' + sheet.id + '.pdf';

      el('openBtn').href = lastUrl;
      var dl = el('downloadBtn');
      dl.href = lastUrl;
      dl.download = fileName;
      el('resultInfo').textContent =
        (state.level === 'all' ? 'All levels' : LEVELS[state.level].name) + ' · ' +
        sheet.count + ' questions · ' + pages + ' pages · Sheet ID ' + sheet.id;
      el('result').hidden = false;
      dl.click();
      el('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    } catch (e) {
      err.textContent = 'Sorry, something went wrong making the worksheet. Please try again.';
      err.hidden = false;
      if (window.console) console.error(e);
    } finally {
      btn.disabled = false;
    }
  }

  el('generate').addEventListener('click', generate);

  setLevel(state.level);
  setCount(state.count);
})();
