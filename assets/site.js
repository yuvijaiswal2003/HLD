/* HLD Ladder — site behaviour. No dependencies. Progress lives in localStorage (this browser only). */
(function () {
  'use strict';
  var B = document.body;
  var ROOT = B.dataset.root || '';
  var PAGE = B.dataset.page;
  var PATH = B.dataset.path;
  var COURSE = window.HLD_COURSE || { chapters: [], parts: [] };
  var CH = COURSE.chapters;
  var chById = {};
  CH.forEach(function (c) { chById[c.id] = c; });

  // ---------- Utils ----------
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }
  function shuffle(a) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(Math.random() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  var ICON_CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true" class="ic"><path d="M5 12l5 5L20 7"/></svg>';
  var ICON_R = '<svg viewBox="0 0 24 24" aria-hidden="true" class="ic"><path d="M5 12h14M13 6l6 6-6 6"/></svg>';

  // ---------- Progress store ----------
  var KEY = 'hld-ladder-progress-v1';
  var P = { read: {}, quiz: {}, wrong: {}, designs: {}, stats: { answered: 0, correct: 0 }, last: null };
  try { var raw = localStorage.getItem(KEY); if (raw) { var o = JSON.parse(raw); for (var k in o) P[k] = o[k]; } } catch (e) {}
  function save() { try { localStorage.setItem(KEY, JSON.stringify(P)); } catch (e) {} }
  function isRead(ch, lid) { return !!(P.read[ch] && P.read[ch][lid]); }
  function setRead(ch, lid, v) { P.read[ch] = P.read[ch] || {}; if (v) P.read[ch][lid] = 1; else delete P.read[ch][lid]; save(); }
  function readCount(c) { return c.lessons.filter(function (l) { return isRead(c.id, l[0]); }).length; }
  function dState(id) { return (P.designs[id] = P.designs[id] || {}); }
  function isPracticed(id) { return !!(P.designs[id] && P.designs[id].done); }
  function chStatus(c) {
    var rc = readCount(c), q = P.quiz[c.id];
    if (rc === c.lessons.length && q && q.best >= 70) return 'green';
    if (rc > 0 || q || c.designs.some(function (d) { return isPracticed(d[0]); })) return 'amber';
    return '';
  }
  function totals() {
    var t = { lessons: 0, read: 0, designs: 0, practiced: 0, passed: 0 };
    CH.forEach(function (c) {
      t.lessons += c.lessons.length; t.read += readCount(c);
      t.designs += c.designs.length; t.practiced += c.designs.filter(function (d) { return isPracticed(d[0]); }).length;
      if (P.quiz[c.id] && P.quiz[c.id].best >= 70) t.passed++;
    });
    return t;
  }
  function wrongKeys() {
    return Object.keys(P.wrong).filter(function (k) {
      var p = k.split(':'); return window.HLD_MCQS ? (window.HLD_MCQS[p[0]] && window.HLD_MCQS[p[0]][+p[1]]) : !!chById[p[0]];
    });
  }
  function remember(label) { if (PATH && label) { P.last = { u: PATH, l: label }; save(); } }

  // ---------- Theme ----------
  var themeBtn = $('[data-theme-toggle]');
  function getMode() { try { return localStorage.getItem('hld-theme') || 'system'; } catch (e) { return 'system'; } }
  function applyMode(m) {
    if (m === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', m);
    if (themeBtn) {
      themeBtn.dataset.mode = m;
      var label = { system: 'Theme: follows your system', light: 'Theme: light', dark: 'Theme: dark' }[m];
      themeBtn.setAttribute('aria-label', label + '. Click to change.'); themeBtn.title = label;
    }
  }
  applyMode(getMode());
  if (themeBtn) themeBtn.addEventListener('click', function () {
    var next = { system: 'light', light: 'dark', dark: 'system' }[getMode()] || 'system';
    try { if (next === 'system') localStorage.removeItem('hld-theme'); else localStorage.setItem('hld-theme', next); } catch (e) {}
    applyMode(next);
  });

  // ---------- Navigation drawer ----------
  var menuBtn = $('[data-toggle-side]');
  function openSide() { B.classList.add('side-open'); if (menuBtn) menuBtn.setAttribute('aria-expanded', 'true'); var f = $('#side input'); if (f && window.innerWidth < 1024) setTimeout(function () { $('#side .side-head button').focus(); }, 50); }
  function closeSide() { if (!B.classList.contains('side-open')) return; B.classList.remove('side-open'); if (menuBtn) { menuBtn.setAttribute('aria-expanded', 'false'); } }
  if (menuBtn) menuBtn.addEventListener('click', function () { B.classList.contains('side-open') ? closeSide() : openSide(); });
  $$('[data-close-side]').forEach(function (el) { el.addEventListener('click', closeSide); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') closeSide(); });
  // Keep the current chapter visible in the sidebar.
  var curTree = $('.tree-sub [aria-current="page"]') || $('.tree-ch.open');
  if (curTree && window.innerWidth >= 1024 && B.classList.contains('has-side')) {
    var side = $('#side'); var r = curTree.getBoundingClientRect(), sr = side.getBoundingClientRect();
    if (r.bottom > sr.bottom - 40) side.scrollTop += r.top - sr.top - 120;
  }

  // ---------- Decorate progress everywhere ----------
  function decorate() {
    $$('[data-led-ch]').forEach(function (el) {
      var c = chById[el.dataset.ledCh]; if (!c) return;
      var led = el.classList.contains('led') ? el : $('.led', el); if (!led) return;
      var s = chStatus(c); led.classList.toggle('amber', s === 'amber'); led.classList.toggle('green', s === 'green');
      led.title = s === 'green' ? 'Done' : s === 'amber' ? 'In progress' : 'Not started';
    });
    $$('[data-lesson-key]').forEach(function (el) { var p = el.dataset.lessonKey.split(':'); el.classList.toggle('done', isRead(p[0], p.slice(1).join(':'))); });
    $$('[data-quiz-best]').forEach(function (el) { var q = P.quiz[el.dataset.quizBest]; el.textContent = q ? '· ' + q.best + '%' : ''; var a = el.closest('a'); if (a) a.classList.toggle('done', !!(q && q.best >= 70)); });
    $$('[data-quiz-best-long]').forEach(function (el) { var q = P.quiz[el.dataset.quizBestLong]; el.textContent = q ? 'Best score ' + q.best + '% · ' + q.attempts + (q.attempts === 1 ? ' attempt' : ' attempts') : 'Not taken yet'; });
    $$('[data-design-key]').forEach(function (el) { var d = isPracticed(el.dataset.designKey); el.classList.toggle('is-done', d); el.classList.toggle('done', d); });
    $$('[data-ch-progress]').forEach(function (el) {
      var c = chById[el.dataset.chProgress]; if (!c) return; var rc = readCount(c), q = P.quiz[c.id];
      if (!el.dataset.orig) el.dataset.orig = el.textContent;
      el.textContent = (rc || q) ? rc + '/' + c.lessons.length + ' read' + (q ? ' · quiz ' + q.best + '%' : '') : el.dataset.orig;
    });
    var t = totals(); var ans = P.stats.answered || 0; var acc = ans ? Math.round(P.stats.correct / ans * 100) : 0;
    var pct = t.lessons ? Math.round(t.read / t.lessons * 100) : 0;
    var stat = {
      pct: [pct + '%', pct], read: [t.read + ' / ' + t.lessons, t.lessons ? t.read / t.lessons * 100 : 0],
      quiz: [t.passed + ' / ' + CH.length, CH.length ? t.passed / CH.length * 100 : 0],
      designs: [t.practiced + ' / ' + t.designs, t.designs ? t.practiced / t.designs * 100 : 0],
      acc: [ans ? acc + '% of ' + ans : 'No answers yet', acc],
      'designs-long': [t.practiced + ' practiced so far.', 0]
    };
    $$('[data-stat]').forEach(function (el) { var s = stat[el.dataset.stat]; if (s) el.textContent = s[0]; });
    $$('[data-meter]').forEach(function (el) { var s = stat[el.dataset.meter]; if (s) el.style.width = Math.round(s[1]) + '%'; });
    var cont = $('[data-continue]');
    if (cont && P.last && P.last.u) { cont.href = ROOT + P.last.u; cont.innerHTML = 'Continue: ' + esc(P.last.l) + ' ' + ICON_R; }
    $$('[data-chapter-cta]').forEach(function (el) {
      var c = chById[el.dataset.chapterCta]; if (!c) return; var rc = readCount(c);
      var i = c.lessons.findIndex(function (l) { return !isRead(c.id, l[0]); });
      if (rc === 0) return;
      if (i < 0) { el.href = ROOT + c.lessons[0][2]; el.innerHTML = 'Read again from lesson 1 ' + ICON_R; }
      else { el.href = ROOT + c.lessons[i][2]; el.innerHTML = 'Continue: lesson ' + (i + 1) + ' ' + ICON_R; }
    });
    $$('[data-mark-read]').forEach(function (el) { var p = el.dataset.markRead.split(':'); var d = isRead(p[0], p.slice(1).join(':')); el.classList.toggle('is-done', d); el.setAttribute('aria-pressed', String(d)); });
    $$('[data-practiced]').forEach(function (el) { var d = isPracticed(el.dataset.practiced); el.classList.toggle('is-done', d); el.classList.toggle('primary', !d); });
  }

  // ---------- Generic clicks ----------
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-mark-read], [data-mark-on-click], [data-copy], [data-practiced]');
    if (!t) return;
    if (t.hasAttribute('data-mark-read')) { var p = t.dataset.markRead.split(':'); var ch = p[0], lid = p.slice(1).join(':'); setRead(ch, lid, !isRead(ch, lid)); decorate(); }
    else if (t.hasAttribute('data-mark-on-click')) { var q = t.dataset.markOnClick.split(':'); setRead(q[0], q.slice(1).join(':'), true); }
    else if (t.hasAttribute('data-practiced')) { var st = dState(t.dataset.practiced); st.done = !st.done; save(); decorate(); }
    else if (t.hasAttribute('data-copy')) {
      var pre = t.closest('.code').querySelector('pre');
      var done = function () { t.textContent = 'Copied'; setTimeout(function () { t.textContent = 'Copy'; }, 1400); };
      var fallback = function () { var r = document.createRange(); r.selectNodeContents(pre); var s = getSelection(); s.removeAllRanges(); s.addRange(r); t.textContent = 'Selected'; setTimeout(function () { t.textContent = 'Copy'; }, 1400); };
      try { navigator.clipboard.writeText(pre.innerText).then(done, fallback); } catch (err) { fallback(); }
    }
  });

  // ---------- Lesson page ----------
  if (PAGE === 'lesson') {
    remember(B.dataset.label);
    var heads = $$('.lesson h3[id]'); var links = {};
    $$('.toc a').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
    if (heads.length && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting) { $$('.toc a.active').forEach(function (a) { a.classList.remove('active'); }); var a = links[en.target.id]; if (a) a.classList.add('active'); }
        });
      }, { rootMargin: '-70px 0px -70% 0px' });
      heads.forEach(function (h) { io.observe(h); });
    }
  }

  // ---------- Quiz engine (chapter quiz + mixed practice) ----------
  var QD = null; var quizEl = $('#quiz-app');
  if (quizEl) { try { QD = JSON.parse($('#quiz-data').textContent); } catch (e) {} }
  function M(it) { if (window.HLD_MCQS && window.HLD_MCQS[it.ch]) return window.HLD_MCQS[it.ch][it.idx]; return QD && QD.items[it.idx]; }
  function makeQuiz(items, kind) { return { kind: kind, items: items.map(function (it) { return { ch: it.ch, idx: it.idx, order: shuffle([0, 1, 2, 3]) }; }), i: 0, picks: [], done: false }; }
  var Q = null; var QHOST = null;
  var KEYS = ['A', 'B', 'C', 'D'];
  function quizHTML() {
    if (!Q.items.length) return '<p class="empty">No questions match.</p>';
    if (Q.done) return resultsHTML();
    var it = Q.items[Q.i], m = M(it), picked = Q.picks[Q.i], answered = picked !== undefined;
    var bar = Q.items.map(function (x, k) { var p = Q.picks[k], cls = ''; if (p !== undefined) cls = p === M(x).answer ? 'ok' : 'no'; else if (k === Q.i) cls = 'cur'; return '<i class="' + cls + '"></i>'; }).join('');
    var opts = it.order.map(function (orig, d) {
      var cls = ''; if (answered) cls = orig === m.answer ? 'correct' : orig === picked ? 'wrong' : 'dim';
      return '<button type="button" class="opt ' + cls + '" data-opt="' + d + '"' + (answered ? ' disabled' : '') + '><span class="key">' + KEYS[d] + '</span><span>' + m.options[orig] + '</span></button>';
    }).join('');
    var c = chById[it.ch];
    var chChip = Q.kind === 'mixed' && c ? '<a class="chip" href="' + ROOT + c.url + '">Ch ' + c.num + ' · ' + esc(c.title) + '</a>' : '';
    return '<div class="qbar" aria-hidden="true">' + bar + '</div>' +
      '<div class="qmeta"><span class="mono">Question ' + (Q.i + 1) + ' of ' + Q.items.length + '</span><span class="chip lvl-' + m.level + '">' + cap(m.level) + '</span>' + chChip + '</div>' +
      '<h2 class="qtext">' + m.q + '</h2>' +
      '<div class="opts" role="group" aria-label="Answer options">' + opts + '</div>' +
      (answered ? '<div class="explain" role="status"><span class="verdict ' + (picked === m.answer ? 'ok">Correct' : 'no">Not quite. The answer is ' + KEYS[it.order.indexOf(m.answer)] + '.') + '</span>' + m.explain + '</div>' : '') +
      '<div class="qnav"><span class="kbd-hint">' + (answered ? 'Press Enter to continue' : 'Pick an answer, or press 1–4') + '</span>' +
      (answered ? '<button type="button" class="btn primary" data-q="next">' + (Q.i + 1 < Q.items.length ? 'Next question' : 'See results') + ' ' + ICON_R + '</button>' : '') + '</div>';
  }
  function resultsHTML() {
    var n = Q.items.length, right = 0, missed = [];
    Q.items.forEach(function (it, k) { if (Q.picks[k] === M(it).answer) right++; else missed.push(k); });
    var pct = Math.round(right / n * 100);
    var verdict = pct >= 85 ? 'Interview-ready on this material.' : pct >= 70 ? 'Solid. Review the misses below, then move on.' : 'Re-read the lessons behind the misses below, then retake.';
    var best = Q.kind === 'chapter' && P.quiz[QD.ch] ? P.quiz[QD.ch].best : null;
    var nextBtn = Q.kind === 'mixed' ? '<button type="button" class="btn" data-q="config">Change settings</button>' : (QD && QD.next ? '<a class="btn" href="' + ROOT + QD.next + '">Go to design practice ' + ICON_R + '</a>' : '');
    return '<div class="score"><span class="eyebrow">' + (Q.kind === 'chapter' ? 'Chapter quiz result' : Q.kind === 'drill' ? 'Drill result' : 'Practice result') + '</span>' +
      '<span class="big">' + right + '<small> / ' + n + '</small></span>' +
      '<span style="font-size:17px"><b>' + pct + '%</b> · ' + verdict + (best !== null ? ' <span class="mono" style="color:var(--muted);font-size:13px">Best ' + best + '%</span>' : '') + '</span></div>' +
      '<div class="row"><button type="button" class="btn primary" data-q="retake">Retake, shuffled</button>' + (missed.length ? '<button type="button" class="btn" data-q="missed">Drill the ' + missed.length + ' missed</button>' : '') + nextBtn + '</div>' +
      (missed.length ? '<h3 class="review-h">Review your misses</h3><div class="review">' + missed.map(function (k) {
        var it = Q.items[k], m = M(it), c = chById[it.ch];
        return '<div class="rv"><span class="mini">Ch ' + (c ? c.num : '') + ' · ' + cap(m.level) + '</span><div class="q">' + m.q + '</div><div class="a-no">You picked: ' + m.options[Q.picks[k]] + '</div><div class="a-ok">Answer: ' + m.options[m.answer] + '</div><div class="ex">' + m.explain + '</div></div>';
      }).join('') + '</div>' : '<p class="sub">No misses. Try a design problem next.</p>');
  }
  function drawQuiz(scroll) {
    if (!QHOST) return;
    QHOST.innerHTML = quizHTML();
    if (scroll) { var top = QHOST.getBoundingClientRect().top + window.scrollY - 90; if (window.scrollY > top) window.scrollTo(0, Math.max(0, top)); }
    else { var ex = $('.explain', QHOST); if (ex) { var r = ex.getBoundingClientRect(); var nb = $('[data-q="next"]', QHOST); var bottom = nb ? nb.getBoundingClientRect().bottom : r.bottom; if (bottom > innerHeight) window.scrollBy({ top: bottom - innerHeight + 24, behavior: 'smooth' }); } }
  }
  function answer(d) {
    if (!Q || Q.done || Q.picks[Q.i] !== undefined) return;
    var it = Q.items[Q.i], orig = it.order[d]; if (orig === undefined) return;
    Q.picks[Q.i] = orig; var ok = orig === M(it).answer, key = it.ch + ':' + it.idx;
    P.stats.answered = (P.stats.answered || 0) + 1; if (ok) P.stats.correct = (P.stats.correct || 0) + 1;
    if (ok) delete P.wrong[key]; else P.wrong[key] = 1;
    save(); drawQuiz(false);
    var nb = $('[data-q="next"]', QHOST); if (nb) nb.focus({ preventScroll: true });
  }
  function next() {
    if (!Q || Q.picks[Q.i] === undefined) return;
    if (Q.i + 1 < Q.items.length) { Q.i++; drawQuiz(true); return; }
    Q.done = true;
    if (Q.kind === 'chapter' && QD && Q.items.length === QD.items.length) {
      var right = Q.items.filter(function (it, k) { return Q.picks[k] === M(it).answer; }).length; var pct = Math.round(right / Q.items.length * 100);
      var prev = P.quiz[QD.ch] || { best: 0, attempts: 0 };
      P.quiz[QD.ch] = { best: Math.max(prev.best || 0, pct), last: pct, attempts: (prev.attempts || 0) + 1 }; save(); decorate();
    }
    drawQuiz(true);
  }
  function bindQuiz(host) {
    QHOST = host;
    host.addEventListener('click', function (e) {
      var o = e.target.closest('[data-opt]'); if (o) return answer(+o.dataset.opt);
      var a = e.target.closest('[data-q]'); if (!a) return;
      var act = a.dataset.q;
      if (act === 'next') next();
      else if (act === 'retake') { Q = makeQuiz(shuffle(Q.items), Q.kind === 'drill' ? 'chapter' : Q.kind); if (Q.kind === 'chapter' && QD && Q.items.length !== QD.items.length) Q = makeQuiz(shuffle(QD.items.map(function (_, i) { return { ch: QD.ch, idx: i }; })), 'chapter'); drawQuiz(true); }
      else if (act === 'missed') { var miss = Q.items.filter(function (it, k) { return Q.picks[k] !== M(it).answer; }); Q = makeQuiz(shuffle(miss), Q.kind === 'mixed' ? 'mixed' : 'drill'); drawQuiz(true); }
      else if (act === 'config') { Q = null; renderPractice(); }
    });
  }
  document.addEventListener('keydown', function (e) {
    if (!Q || Q.done || !QHOST || !QHOST.isConnected) return;
    var tag = (e.target.tagName || '').toLowerCase(); if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    var map = { '1': 0, '2': 1, '3': 2, '4': 3, a: 0, b: 1, c: 2, d: 3 }; var k = e.key.toLowerCase();
    if (k in map && Q.picks[Q.i] === undefined) { e.preventDefault(); answer(map[k]); }
    else if (e.key === 'Enter' && Q.picks[Q.i] !== undefined && !(e.target.closest && e.target.closest('button, a'))) { e.preventDefault(); next(); }
  });
  if (PAGE === 'quiz' && quizEl && QD) {
    remember(B.dataset.label);
    Q = makeQuiz(QD.items.map(function (_, i) { return { ch: QD.ch, idx: i }; }), 'chapter');
    bindQuiz(quizEl); drawQuiz(false);
  }

  // ---------- Mixed practice ----------
  var MP = { chs: {}, count: 20, level: 'all', source: 'all' };
  CH.forEach(function (c) { MP.chs[c.id] = true; });
  var practiceEl = $('#practice-app');
  function pool() {
    var out = [];
    if (MP.source === 'mistakes') wrongKeys().forEach(function (k) { var p = k.split(':'); out.push({ ch: p[0], idx: +p[1] }); });
    else CH.forEach(function (c) { (window.HLD_MCQS[c.id] || []).forEach(function (m, i) { out.push({ ch: c.id, idx: i }); }); });
    return out.filter(function (it) { var m = M(it); return m && MP.chs[it.ch] && (MP.level === 'all' || m.level === MP.level); });
  }
  function renderPractice() {
    if (!practiceEl) return;
    if (Q) { practiceEl.innerHTML = '<div id="practice-quiz" class="quiz"></div><div class="row" style="margin-top:22px"><button type="button" class="btn quiet small" data-mp="config">← Change settings</button></div>'; bindQuiz($('#practice-quiz')); drawQuiz(true); return; }
    var all = 0; CH.forEach(function (c) { all += (window.HLD_MCQS[c.id] || []).length; });
    var wn = wrongKeys().length; if (!wn && MP.source === 'mistakes') MP.source = 'all';
    var pl = pool(), n = Math.min(MP.count, pl.length);
    var parts = COURSE.parts.map(function (title, i) {
      if (!title) return ''; var chs = CH.filter(function (c) { return c.part === i; }); if (!chs.length) return '';
      return '<div class="grp"><span class="mini">Part ' + i + ' · ' + esc(title) + '</span>' + chs.map(function (c) { return '<button type="button" class="toggle" data-mp-ch="' + c.id + '" aria-pressed="' + !!MP.chs[c.id] + '">' + pad(c.num) + ' · ' + esc(c.title) + '</button>'; }).join('') + '</div>';
    }).join('');
    practiceEl.innerHTML = '<div class="panel">' +
      '<div class="field"><span class="mini">Questions from</span><div class="seg-ctl"><button type="button" data-mp-src="all" aria-pressed="' + (MP.source === 'all') + '">All ' + all + ' questions</button><button type="button" data-mp-src="mistakes" aria-pressed="' + (MP.source === 'mistakes') + '"' + (wn ? '' : ' disabled') + '>My mistakes (' + wn + ')</button></div></div>' +
      '<div class="field"><span class="mini">Difficulty</span><div class="seg-ctl">' + ['all', 'easy', 'medium', 'hard'].map(function (l) { return '<button type="button" data-mp-level="' + l + '" aria-pressed="' + (MP.level === l) + '">' + cap(l) + '</button>'; }).join('') + '</div></div>' +
      '<div class="field"><span class="mini">How many</span><div class="seg-ctl">' + [10, 20, 30, 50].map(function (k) { return '<button type="button" data-mp-count="' + k + '" aria-pressed="' + (MP.count === k) + '">' + k + '</button>'; }).join('') + '</div></div>' +
      '<div class="field"><div class="row" style="justify-content:space-between"><span class="mini">Chapters</span><span class="row" style="gap:4px"><button type="button" class="btn quiet small" data-mp="all">Select all</button><button type="button" class="btn quiet small" data-mp="none">Clear</button></span></div><div class="ch-picks">' + parts + '</div></div>' +
      '<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:14px"><span class="mono" style="font-size:13px;color:var(--muted)">' + pl.length + ' questions match</span><button type="button" class="btn primary" data-mp="start"' + (n ? '' : ' disabled') + '>Start ' + n + ' questions ' + ICON_R + '</button></div></div>';
  }
  if (PAGE === 'practice' && practiceEl && window.HLD_MCQS) {
    practiceEl.addEventListener('click', function (e) {
      var b = e.target.closest('button'); if (!b || b.disabled) return; var d = b.dataset;
      if (d.mpSrc) MP.source = d.mpSrc; else if (d.mpLevel) MP.level = d.mpLevel; else if (d.mpCount) MP.count = +d.mpCount;
      else if (d.mpCh) MP.chs[d.mpCh] = !MP.chs[d.mpCh];
      else if (d.mp === 'all') CH.forEach(function (c) { MP.chs[c.id] = true; });
      else if (d.mp === 'none') CH.forEach(function (c) { MP.chs[c.id] = false; });
      else if (d.mp === 'start') { Q = makeQuiz(shuffle(pool()).slice(0, MP.count), 'mixed'); }
      else if (d.mp === 'config') { Q = null; }
      else return;
      renderPractice();
    });
    renderPractice();
  }

  // ---------- Design problem page ----------
  if (PAGE === 'design') {
    var did = B.dataset.design; remember(B.dataset.label);
    $$('[data-reveal-btn]').forEach(function (btn) {
      var name = btn.dataset.revealBtn, box = $('[data-reveal="' + name + '"]'), hint = $('[data-reveal-hint="' + name + '"]');
      btn.addEventListener('click', function () {
        var show = box.hidden; box.hidden = !show; if (hint) hint.hidden = show;
        if (name === 'clarify') btn.hidden = true;
        else { btn.textContent = show ? 'Hide solution' : 'Show model solution'; btn.classList.toggle('primary', !show); }
      });
    });
    var hints = $$('[data-hint]'), shown = 0, hb = $('#hint-btn');
    if (hb) hb.addEventListener('click', function () {
      if (shown < hints.length) { hints[shown].hidden = false; shown++; }
      $('#hint-count').textContent = shown + '/' + hints.length; $('#hint-empty').hidden = true;
      if (shown >= hints.length) hb.hidden = true; else hb.textContent = 'Reveal hint ' + (shown + 1);
    });
    var ta = $('#notes'), saved = $('#notes-saved'), timer = null;
    if (ta) {
      var st = P.designs[did]; if (st && st.notes) { ta.value = st.notes; saved.textContent = 'Saved in this browser'; }
      ta.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(function () { dState(did).notes = ta.value; save(); saved.textContent = 'Saved in this browser'; }, 400); });
      window.addEventListener('pagehide', function () { if (ta.value !== ((P.designs[did] || {}).notes || '')) { dState(did).notes = ta.value; save(); } });
    }
    // Mock interview timer
    var PH = [['Clarify requirements', 5], ['Estimate scale', 5], ['API and data model', 8], ['High-level design', 12], ['Deep dives', 10], ['Wrap up and bottlenecks', 5]];
    var TOTAL = PH.reduce(function (s, p) { return s + p[1]; }, 0) * 60;
    var mb = $('#mock-btn'), mt = $('#mock-time'), mp = $('#mock-phase'), clk = $('#mock-clock'), start = 0, iv = null;
    function fmt(sec) { var s = Math.abs(sec); return (sec < 0 ? '+' : '') + pad(Math.floor(s / 60)) + ':' + pad(s % 60); }
    function tick() {
      var el = (Date.now() - start) / 1000, acc = 0, now = -1;
      mt.textContent = fmt(Math.round(TOTAL - el));
      $$('.seg', clk).forEach(function (seg, i) {
        var len = PH[i][1] * 60, f = Math.max(0, Math.min(1, (el - acc) / len));
        seg.querySelector('.seg-fill').style.width = (f * 100) + '%';
        var on = el >= acc && el < acc + len; if (on) now = i; seg.classList.toggle('now', on); acc += len;
      });
      mp.textContent = now >= 0 ? 'Now: ' + PH[now][0] : 'Time is up. Summarise the bottlenecks and what you would do next.';
    }
    if (mb) mb.addEventListener('click', function () {
      if (iv) {
        clearInterval(iv); iv = null; mb.textContent = 'Start timer'; mt.textContent = '45:00'; mp.textContent = 'Mock interview timer. Start it when you begin talking.';
        $$('.seg', clk).forEach(function (s) { s.classList.remove('now'); s.querySelector('.seg-fill').style.width = '0'; });
      } else { start = Date.now(); tick(); iv = setInterval(tick, 1000); mb.textContent = 'Reset timer'; }
    });
  }

  // ---------- Design bank filters ----------
  if (PAGE === 'bank') {
    var F = { level: 'all', part: '0' };
    var apply = function () {
      var vis = 0;
      $$('.d-card').forEach(function (c) { var ok = (F.level === 'all' || c.dataset.level === F.level) && (F.part === '0' || c.dataset.part === F.part); c.hidden = !ok; if (ok) vis++; });
      $('#bank-empty').hidden = vis > 0;
      $$('[data-f-level]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.fLevel === F.level)); });
      $$('[data-f-part]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.dataset.fPart === F.part)); });
    };
    document.addEventListener('click', function (e) {
      var b = e.target.closest('[data-f-level], [data-f-part]'); if (!b) return;
      if (b.dataset.fLevel) F.level = b.dataset.fLevel; else F.part = b.dataset.fPart; apply();
    });
  }

  // ---------- Search ----------
  if (PAGE === 'search' && window.HLD_SEARCH) {
    var IDX = window.HLD_SEARCH.map(function (e) { return { e: e, low: (e.t + ' ' + e.x).toLowerCase(), tl: e.t.toLowerCase() }; });
    var input = $('#q-main'), out = $('#search-results'), title = $('#search-title');
    var q0 = ''; try { q0 = new URLSearchParams(location.search).get('q') || ''; } catch (e) {}
    $$('input[name="q"]').forEach(function (i) { i.value = q0; });
    var reEsc = function (s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); };
    var run = function (q) {
      var terms = q.toLowerCase().split(/\s+/).filter(Boolean);
      if (!terms.length) { title.textContent = 'Search the course'; out.innerHTML = '<p class="empty">Search ' + IDX.length + ' lesson sections, chapters and design problems.</p>'; return; }
      var hits = IDX.map(function (r) {
        if (!terms.every(function (t) { return r.low.indexOf(t) > -1; })) return null;
        var s = 0; terms.forEach(function (t) { if (r.tl.indexOf(t) > -1) s += 12; s += Math.min(6, r.low.split(t).length - 1); });
        if (r.e.k === 'c') s += 4; if (r.e.k === 'd') s += 2;
        return { r: r, s: s };
      }).filter(Boolean).sort(function (a, b) { return b.s - a.s; }).slice(0, 60);
      var hl = function (txt) { var h = esc(txt); terms.forEach(function (t) { h = h.replace(new RegExp('(' + reEsc(esc(t)) + ')', 'ig'), '<mark>$1</mark>'); }); return h; };
      var snip = function (x) {
        var at = x.toLowerCase().indexOf(terms[0]); if (at < 0) return hl(x.slice(0, 180));
        var s = Math.max(0, at - 70); return hl((s ? '…' : '') + x.slice(s, at + 150) + (at + 150 < x.length ? '…' : ''));
      };
      title.textContent = hits.length + (hits.length === 1 ? ' result' : ' results') + ' for “' + q.trim() + '”';
      out.innerHTML = hits.length ? hits.map(function (h) { var e = h.r.e; return '<a class="res" href="' + ROOT + e.u + '"><span class="where">' + esc(e.w) + '</span><span class="t">' + hl(e.t) + '</span><span class="snip">' + snip(e.x) + '</span></a>'; }).join('')
        : '<p class="empty">Nothing matched. Try a broader term such as “cache”, “quorum” or “Kafka”.</p>';
    };
    var deb = null;
    input.addEventListener('input', function () { clearTimeout(deb); deb = setTimeout(function () { run(input.value); try { history.replaceState(null, '', '?q=' + encodeURIComponent(input.value)); } catch (e) {} }, 150); });
    run(q0);
    if (!q0) input.focus();
  }

  // Wide diagrams on small screens scroll sideways; say so.
  function markScroll() { $$('figure.diagram').forEach(function (f) { var c = $('.canvas', f); if (!c) return; if (!$('.scroll-hint', f)) { var h = document.createElement('div'); h.className = 'scroll-hint'; h.textContent = 'Scroll sideways to see the whole diagram →'; c.after(h); } f.classList.toggle('scrolls', c.scrollWidth > c.clientWidth + 4); }); }
  markScroll(); var rz = null; window.addEventListener('resize', function () { clearTimeout(rz); rz = setTimeout(markScroll, 150); });
  $$('[data-reveal-btn]').forEach(function (b) { b.addEventListener('click', function () { setTimeout(markScroll, 0); }); });

  decorate();
})();
