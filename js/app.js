(function () {
  'use strict';

  var CONFIG = AbacusConfig;
  var MIN = CONFIG.COUNT.min, MAX = CONFIG.COUNT.max;
  var LEVELS = CONFIG.LEVELS, QUICK = CONFIG.QUICK_DRILL;
  var ORDER = ['all', 'quick'].concat(Object.keys(LEVELS).map(Number));

  function rgb(c) { return 'rgb(' + c.join(',') + ')'; }

  var state = { level: 'all', count: 100 };
  var lastUrl = null;

  var el = function (id) { return document.getElementById(id); };
  var levelsBox = el('levels'), countInput = el('count'), slider = el('slider');

  // Remember the last choice on this device (optional nicety).
  try {
    var saved = JSON.parse(localStorage.getItem('abacus-sheet') || 'null');
    if (saved) {
      if (ORDER.indexOf(saved.level) >= 0) state.level = saved.level;
      if (saved.count) state.count = clamp(saved.count);
    }
  } catch (e) { /* storage unavailable */ }

  function save() {
    try { localStorage.setItem('abacus-sheet', JSON.stringify(state)); } catch (e) { /* ignore */ }
  }

  function clamp(n) {
    n = Math.round(Number(n));
    if (!isFinite(n)) return CONFIG.COUNT.default;
    return Math.max(MIN, Math.min(MAX, n));
  }

  // ---------- level tiles ----------

  function tile(value, title, stage, about, dot) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'level' + (typeof value === 'string' ? ' wide ' + value : '');
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
  levelsBox.appendChild(tile('quick', QUICK.name, QUICK.stage,
    QUICK.digits + '-digit numbers × ' + QUICK.multipliers.join(' and × ') + ', as fast as you can', rgb(QUICK.tint)));
  Object.keys(LEVELS).forEach(function (k) {
    var L = LEVELS[k];
    levelsBox.appendChild(tile(Number(k), L.name, L.stage, L.about, rgb(L.tint)));
  });

  function setLevel(v) {
    state.level = v;
    var tiles = levelsBox.querySelectorAll('.level');
    for (var j = 0; j < tiles.length; j++) {
      var on = String(tiles[j].dataset.level) === String(v);
      tiles[j].setAttribute('aria-checked', on ? 'true' : 'false');
      tiles[j].tabIndex = on ? 0 : -1;
    }
    el('step2').lastChild.textContent = v === 'quick' ? ' How many numbers?' : ' How many questions?';
    save();
  }

  // Arrow keys move between level tiles (radio group behaviour).
  levelsBox.addEventListener('keydown', function (e) {
    var keys = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 };
    if (!keys[e.key]) return;
    e.preventDefault();
    var idx = ORDER.indexOf(state.level);
    var next = ORDER[(idx + keys[e.key] + ORDER.length) % ORDER.length];
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

  function levelTitle(v) {
    if (v === 'all') return 'All levels';
    if (v === 'quick') return QUICK.name;
    return LEVELS[v].name;
  }

  var busy = false;

  function generate() {
    if (busy) return;
    setCount(countInput.value);
    var btn = el('generate');
    var err = el('error');
    err.hidden = true;
    busy = true;
    btn.disabled = true;
    btn.classList.add('busy');
    btn.querySelector('span').textContent = ' Making your worksheet...';
    // Let the browser paint the "making" state before the work starts.
    setTimeout(function () {
      try {
        build();
      } catch (e) {
        err.textContent = 'Sorry, something went wrong making the worksheet. Please try again.';
        err.hidden = false;
        if (window.console) console.error(e);
      } finally {
        busy = false;
        btn.disabled = false;
        btn.classList.remove('busy');
        btn.querySelector('span').textContent = ' Generate Worksheet';
      }
    }, 30);
  }

  function build() {
    var sheet = AbacusGen.generateWorksheet(state.level, state.count);
    var doc = AbacusPdf.buildPdf(window.jspdf.jsPDF, sheet, LEVELS);
    var pages = doc.internal.getNumberOfPages();
    var blob = doc.output('blob');
    if (lastUrl) URL.revokeObjectURL(lastUrl);
    lastUrl = URL.createObjectURL(blob);

    var name = state.level === 'all' ? 'all-levels'
      : state.level === 'quick' ? 'quick-drill' : 'level-' + state.level;
    var fileName = 'abacus-' + name + '-' + sheet.count + '-' + sheet.id + '.pdf';

    el('openBtn').href = lastUrl;
    var dl = el('downloadBtn');
    dl.href = lastUrl;
    dl.download = fileName;
    el('resultInfo').textContent = levelTitle(state.level) + ' · ' + sheet.count +
      (state.level === 'quick' ? ' numbers' : ' questions') + ' · ' + pages + ' pages · Sheet ID ' + sheet.id;
    var warn = el('warning');
    warn.textContent = sheet.warning || '';
    warn.hidden = !sheet.warning;
    el('result').hidden = false;
    dl.click();
    el('result').scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  el('generate').addEventListener('click', generate);

  setLevel(state.level);
  setCount(state.count);
})();
