#!/usr/bin/env node
/* Static site generator for HLD Ladder.
   Usage: node web/build-site.js [--base https://example.com/hld]
   Reads content/ch*.js and the pre-rendered diagrams in web/.cache/svg, writes site/ */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.resolve(__dirname, '..');
const WEB = __dirname;
const OUT = path.join(ROOT, 'site');
const argBase = (() => { const i = process.argv.indexOf('--base'); return i > -1 ? process.argv[i + 1].replace(/\/+$/, '') : ''; })();

// ---------- Load content ----------
const chapters = fs.readdirSync(path.join(ROOT, 'content')).filter(f => /^ch\d\d\.js$/.test(f)).sort()
  .map(f => require(path.join(ROOT, 'content', f))).sort((a, b) => a.num - b.num);
const tokens = JSON.parse(fs.readFileSync(path.join(WEB, 'tokens.json'), 'utf8'));
const svgDir = path.join(WEB, '.cache', 'svg');
const svgMeta = JSON.parse(fs.readFileSync(path.join(svgDir, 'meta.json'), 'utf8'));

const PARTS = [null,
  { title: 'Foundations', desc: 'How to approach a design question, how the web works underneath, and how to size a system with quick arithmetic.' },
  { title: 'Core Building Blocks', desc: 'The components nearly every design uses: load balancers, caches, CDNs and databases.' },
  { title: 'Distributed Data', desc: 'Copying and splitting data across machines, and the theory that limits what is possible.' },
  { title: 'Communication and Architecture', desc: 'How services talk to each other: queues, streams, search, APIs and microservices.' },
  { title: 'Production Readiness', desc: 'Keeping systems available, observable and secure when things go wrong.' },
  { title: 'Advanced Toolkit', desc: 'Specialised techniques that separate senior-level answers: IDs, sketches, geo-indexes, CRDTs.' },
  { title: 'Case Studies', desc: 'Complete interview answers for the most-asked design questions, start to finish.' }];
const PHASES = [['Clarify requirements', 5], ['Estimate scale', 5], ['API and data model', 8], ['High-level design', 12], ['Deep dives', 10], ['Wrap up and bottlenecks', 5]];

// ---------- Helpers ----------
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const strip = s => String(s || '').replace(/<[^>]+>/g, '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');
const pad = n => String(n).padStart(2, '0');
const slug = s => String(s).toLowerCase().replace(/<[^>]+>/g, '').replace(/&[a-z]+;/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'x';
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const trunc = (s, n) => { s = strip(s).replace(/\s+/g, ' ').trim(); return s.length > n ? s.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : s; };
const minutes = c => c.lessons.reduce((s, l) => s + (l.minutes || 0), 0);

// ---------- URL plan (all paths relative to site root) ----------
chapters.forEach(c => {
  c.dir = `chapters/${pad(c.num)}-${slug(c.id)}`;
  c.url = `${c.dir}/index.html`;
  c.quizUrl = `${c.dir}/quiz.html`;
  c.lessons.forEach((l, i) => { l.url = `${c.dir}/${pad(i + 1)}-${slug(l.id)}.html`; l.idx = i; });
  c.design.forEach(d => { const s = slug(d.id); d.url = `${c.dir}/${s.startsWith('design-') ? s : 'design-' + s}.html`; Object.defineProperty(d, 'ch', { value: c, enumerable: false }); });
  let fig = 0;
  c.lessons.forEach(l => l.blocks.forEach(b => { if (b.t === 'diagram') b._fig = `${c.num}.${++fig}`; }));
});
const allDesigns = chapters.flatMap(c => c.design);
const totals = {
  chapters: chapters.length, lessons: chapters.reduce((s, c) => s + c.lessons.length, 0),
  mcqs: chapters.reduce((s, c) => s + c.mcqs.length, 0), designs: allDesigns.length,
  minutes: chapters.reduce((s, c) => s + minutes(c), 0),
  diagrams: chapters.reduce((s, c) => s + JSON.stringify(c).split('"t":"diagram"').length - 1, 0)
};
const relTo = (fromPath, toPath) => { const depth = fromPath.split('/').length - 1; return '../'.repeat(depth) + toPath; };

// ---------- Icons ----------
const ic = {
  menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M20 20l-4-4"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5z"/>',
  system: '<rect x="3" y="4" width="18" height="12" rx="1.5"/><path d="M8 20h8M12 16v4"/>',
  check: '<path d="M5 12l5 5L20 7"/>',
  arrowR: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  arrowL: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  interview: '<path d="M4 5h16v11H8l-4 4z"/>',
  tip: '<path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-4 10.5c.8.8 1 1.5 1 2.5h6c0-1 .2-1.7 1-2.5A6 6 0 0 0 12 3z"/>',
  warn: '<path d="M12 3l9.5 17h-19z"/><path d="M12 10v4M12 17.5v.5"/>',
  example: '<rect x="3" y="4" width="18" height="6" rx="1"/><rect x="3" y="14" width="18" height="6" rx="1"/><path d="M7 7h.01M7 17h.01"/>',
  quiz: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .8-1 1.5V14M12 17h.01"/>',
  design: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="8.5" y="14" width="7" height="7" rx="1"/><path d="M6.5 10v2h11v-2M12 12v2"/>',
  book: '<path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z"/><path d="M4 19V5M19 19v2H6"/>'
};
const svg = (name, cls) => `<svg viewBox="0 0 24 24" aria-hidden="true" class="ic${cls ? ' ' + cls : ''}">${ic[name]}</svg>`;
const CALLOUT = { interview: ['In the interview', 'interview'], tip: ['Tip', 'tip'], warn: ['Pitfall', 'warn'], example: ['In production', 'example'] };

// ---------- Block renderer ----------
function diagramHTML(b) {
  const key = crypto.createHash('sha1').update(b.code).digest('hex').slice(0, 12);
  const meta = svgMeta[key];
  if (!meta) throw new Error('diagram not rendered: ' + key + ' — run web/render-diagrams.py');
  const l = fs.readFileSync(path.join(svgDir, key + '-l.svg'), 'utf8');
  const d = fs.readFileSync(path.join(svgDir, key + '-d.svg'), 'utf8');
  const label = esc(b.caption);
  return `<figure class="diagram"${b._fig ? ` id="fig-${b._fig.replace('.', '-')}"` : ''}><div class="canvas" role="img" aria-label="${label}" style="--w:${meta.w}px"><div class="dg dg-l">${l}</div><div class="dg dg-d">${d}</div></div><figcaption>${b._fig ? `<span class="fig">Fig ${b._fig}</span>` : ''}${esc(b.caption)}</figcaption></figure>`;
}
function renderBlocks(list, ctx) {
  return (list || []).map(b => renderBlock(b, ctx)).join('\n');
}
function renderBlock(b, ctx) {
  switch (b.t) {
    case 'p': return `<p>${b.html}</p>`;
    case 'h': {
      let id = slug(b.text); while (ctx.ids.has(id)) id += '-x'; ctx.ids.add(id);
      ctx.toc.push({ id, text: b.text });
      return `<h3 id="${id}">${esc(b.text)}</h3>`;
    }
    case 'list': { const tg = b.ordered ? 'ol' : 'ul'; return `<${tg}>${b.items.map(i => `<li>${i}</li>`).join('')}</${tg}>`; }
    case 'table': return `<div class="tbl-wrap" tabindex="0" role="region" aria-label="Table"><table><thead><tr>${b.head.map(h => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${b.rows.map(r => `<tr>${r.map(c => `<td>${c}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`;
    case 'callout': { const [label, k] = CALLOUT[b.kind] || CALLOUT.tip; return `<aside class="callout ${k}"><div class="c-label">${svg(k)}${label}</div><div class="c-title">${b.title}</div><div class="c-body">${b.html}</div></aside>`; }
    case 'diagram': return diagramHTML(b);
    case 'code': return `<div class="code"><div class="code-head"><span>${esc(b.lang)}</span><button class="code-copy js-only" type="button" data-copy>Copy</button></div><pre><code>${esc(b.code)}</code></pre></div>`;
    case 'compare': return `<div class="compare">${b.items.map(it => `<div class="cmp"><h4>${it.title}</h4><div><span class="mini">Strengths</span><ul class="pros">${it.pros.map(x => `<li><span>${x}</span></li>`).join('')}</ul></div><div><span class="mini">Weaknesses</span><ul class="cons">${it.cons.map(x => `<li><span>${x}</span></li>`).join('')}</ul></div><div class="use"><span class="mini">Use when</span>${it.use}</div></div>`).join('')}</div>`;
    case 'steps': return `<ol class="steps">${b.items.map(it => `<li><div><div class="st-t">${it.title}</div><div class="st-b">${it.html}</div></div></li>`).join('')}</ol>`;
    case 'numbers': return `<div class="numbers">${b.items.map(it => `<div class="num-cell"><span class="v">${it.value}</span><span class="l">${it.label}</span></div>`).join('')}</div>`;
    default: throw new Error('unknown block ' + b.t);
  }
}

// ---------- Page shell ----------
const BUILD = crypto.createHash('sha1').update(JSON.stringify(chapters) + fs.readFileSync(path.join(WEB, 'assets', 'site.css'), 'utf8') + fs.readFileSync(path.join(WEB, 'assets', 'site.js'), 'utf8')).digest('hex').slice(0, 8);

function treeHTML(r, current) {
  return `<nav class="tree" aria-label="Chapters">${PARTS.map((p, i) => {
    if (!p) return '';
    const chs = chapters.filter(c => c.part === i);
    return `<div class="tree-part"><div class="tree-label">Part ${i} · ${esc(p.title)}</div>${chs.map(c => {
      const open = current && current.ch === c;
      const isOverview = open && current.kind === 'chapter';
      let sub = '';
      if (open) {
        sub = `<ul class="tree-sub">${c.lessons.map((l, k) => `<li><a href="${r}${l.url}" data-lesson-key="${c.id}:${esc(l.id)}"${current.kind === 'lesson' && current.lesson === l ? ' aria-current="page"' : ''}><span class="n">${k + 1}</span><span>${esc(l.title)}</span></a></li>`).join('')}
          <li><a href="${r}${c.quizUrl}" class="t-quiz"${current.kind === 'quiz' ? ' aria-current="page"' : ''}>${svg('quiz')}<span>Chapter quiz <span class="mono" data-quiz-best="${c.id}"></span></span></a></li>
          ${c.design.map(d => `<li><a href="${r}${d.url}" class="t-design" data-design-key="${esc(d.id)}"${current.kind === 'design' && current.design === d ? ' aria-current="page"' : ''}>${svg('design')}<span>${esc(d.title)}</span></a></li>`).join('')}</ul>`;
      }
      return `<a class="tree-ch${open ? ' open' : ''}" href="${r}${c.url}" data-led-ch="${c.id}"${isOverview ? ' aria-current="page"' : ''}><span class="led" aria-hidden="true"></span><span class="num">${pad(c.num)}</span><span class="tt">${esc(c.title)}</span></a>${sub}`;
    }).join('')}</div>`;
  }).join('')}</nav>`;
}

function page({ pathOut, title, desc, kind, body, side = null, scripts = [], active = '', bodyAttrs = '' }) {
  const r = relTo(pathOut, '');
  const navItem = (key, href, label) => `<a href="${r}${href}"${active === key ? ' aria-current="page"' : ''}>${label}</a>`;
  const nav = [navItem('chapters', 'index.html#chapters', 'Chapters'), navItem('practice', 'practice.html', 'Practice'), navItem('designs', 'designs.html', 'Design bank'), navItem('cheatsheet', 'cheatsheet.html', 'Cheat sheet')].join('');
  const searchForm = (cls, id) => `<form class="${cls}" action="${r}search.html" method="get" role="search">${svg('search')}<label class="sr" for="${id}">Search the course</label><input id="${id}" name="q" type="search" placeholder="Search lessons and problems" autocomplete="off"></form>`;
  const fullTitle = title === 'HLD Ladder' ? 'HLD Ladder · System design, from basics to interview-ready' : `${title} · HLD Ladder`;
  const canonical = argBase ? `<link rel="canonical" href="${argBase}/${pathOut === 'index.html' ? '' : pathOut}">` : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(fullTitle)}</title>
<meta name="description" content="${esc(desc)}">
<meta property="og:site_name" content="HLD Ladder">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
${canonical}
<meta name="theme-color" content="${tokens.light.bg}" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="${tokens.dark.bg}" media="(prefers-color-scheme: dark)">
<link rel="icon" href="${r}assets/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="${r}assets/site.css?v=${BUILD}">
<script>(function(){try{var t=localStorage.getItem('hld-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t)}catch(e){}document.documentElement.classList.add('js')})()</script>
<noscript><style>.js-only{display:none!important}[data-reveal][hidden],[data-hint][hidden]{display:block!important}</style></noscript>
</head>
<body class="${side ? 'has-side' : 'no-side'}" data-root="${r}" data-path="${pathOut}" data-page="${kind}"${bodyAttrs}>
<a class="skip" href="#content">Skip to content</a>
<header class="hdr"><div class="hdr-in">
  <button class="icon-btn menu-btn" type="button" data-toggle-side aria-controls="side" aria-expanded="false" aria-label="Open navigation">${svg('menu')}</button>
  <a class="brand" href="${r}index.html" aria-label="HLD Ladder home"><span class="brand-mark">HLD</span><span class="brand-name">Ladder</span></a>
  <nav class="hdr-nav" aria-label="Main">${nav}</nav>
  ${searchForm('hdr-search', 'q-top')}
  <button class="icon-btn theme-btn js-only" type="button" data-theme-toggle aria-label="Colour theme: system">${svg('system', 'th-system')}${svg('sun', 'th-light')}${svg('moon', 'th-dark')}</button>
</div></header>
<div class="shell">
<aside class="side" id="side" aria-label="Course navigation">
  <div class="side-top">
    <div class="side-head"><span class="eyebrow">Navigate</span><button class="icon-btn" type="button" data-close-side aria-label="Close navigation">${svg('close')}</button></div>
    ${searchForm('side-search', 'q-side')}
    <nav class="side-nav" aria-label="Sections">${nav}</nav>
  </div>
  ${treeHTML(r, side)}
  <div class="side-foot js-only"><div class="row-between"><span>Course progress</span><span class="mono" data-stat="pct">0%</span></div><div class="meter"><i data-meter="pct"></i></div><div class="legend"><span><i class="led"></i>Not started</span><span><i class="led amber"></i>In progress</span><span><i class="led green"></i>Done</span></div></div>
</aside>
<main id="content" class="main" tabindex="-1">
${body}
</main>
</div>
<footer class="ftr"><div class="ftr-in">
  <div class="ftr-brand"><a class="brand" href="${r}index.html"><span class="brand-mark">HLD</span><span class="brand-name">Ladder</span></a><p>High-level system design from first principles to interview-ready. ${totals.chapters} chapters, ${totals.mcqs} interview questions and ${totals.designs} design problems.</p></div>
  <nav class="ftr-nav" aria-label="Footer">${nav}<a href="${r}search.html">Search</a></nav>
  <p class="ftr-note">Your progress, quiz scores and notes are saved in this browser only. Typefaces: IBM Plex and Archivo, under the SIL Open Font License.</p>
</div></footer>
<div class="scrim" data-close-side></div>
<script src="${r}assets/data/course.js?v=${BUILD}"></script>
${scripts.map(s => `<script src="${r}${s}?v=${BUILD}"></script>`).join('\n')}
<script src="${r}assets/site.js?v=${BUILD}"></script>
</body>
</html>
`;
}

// ---------- Shared fragments ----------
const chip = (text, cls = '') => `<span class="chip${cls ? ' ' + cls : ''}">${text}</span>`;
const lvl = s => `lvl-${String(s).toLowerCase()}`;
function clockHTML(live) {
  return `<div class="clock"${live ? ' id="mock-clock"' : ''}>${PHASES.map(([n, m], i) => `<div class="seg" style="--m:${m}" data-i="${i}"><div class="seg-bar"><span class="seg-fill"></span></div><div class="seg-label">${esc(n)}<span class="mono">${m} min</span></div></div>`).join('')}</div>`;
}
function chapterHead(c, r, sub) {
  return `<header class="ch-head">
  <div class="crumbs"><a href="${r}index.html#part-${c.part}">Part ${c.part} · ${esc(PARTS[c.part].title)}</a>${sub ? ` <span aria-hidden="true">/</span> <a href="${r}${c.url}">Chapter ${c.num}</a>` : ''}</div>
  <div class="ch-title-row"><span class="ch-num" aria-hidden="true">${pad(c.num)}</span><h1 class="ch-h1"><span class="sr">Chapter ${c.num}: </span>${esc(c.title)}</h1></div>
  <p class="tagline">${esc(c.tagline)}</p>
  <div class="meta">${chip(esc(c.level), lvl(c.level))}${chip(`${c.lessons.length} lessons · ${minutes(c)} min`)}${chip(`${c.mcqs.length} MCQs`)}${chip(`${c.design.length} design problems`)}</div>
</header>`;
}
function pager(r, prev, next, nextMark) {
  const cell = (x, dir) => x ? `<a class="pg pg-${dir}" href="${r}${x.url}"${dir === 'next' && nextMark ? ` data-mark-on-click="${nextMark}"` : ''}><span class="pg-k">${dir === 'prev' ? svg('arrowL') + 'Previous' : 'Next' + svg('arrowR')}</span><span class="pg-t">${esc(x.label)}</span></a>` : '<span></span>';
  return `<nav class="pager" aria-label="Lesson navigation">${cell(prev, 'prev')}${cell(next, 'next')}</nav>`;
}

// ---------- Pages ----------
const pages = [];
const add = (pathOut, html) => pages.push([pathOut, html]);

// Lesson pages
chapters.forEach(c => {
  c.lessons.forEach((L, i) => {
    const pathOut = L.url; const r = relTo(pathOut, '');
    const ctx = { ids: new Set(), toc: [] };
    const content = renderBlocks(L.blocks, ctx);
    const prevL = c.lessons[i - 1]; const nextL = c.lessons[i + 1];
    const prev = prevL ? { url: prevL.url, label: prevL.title } : { url: c.url, label: `Chapter ${c.num} overview` };
    const next = nextL ? { url: nextL.url, label: nextL.title } : { url: c.quizUrl, label: `Chapter ${c.num} quiz` };
    const key = `${c.id}:${L.id}`;
    const toc = ctx.toc.length ? `<aside class="toc" aria-label="On this page"><div class="eyebrow">On this page</div><ol>${ctx.toc.map(t => `<li><a href="#${t.id}">${esc(t.text)}</a></li>`).join('')}</ol>
      <div class="toc-more"><a class="btn small" href="${r}${c.quizUrl}">${svg('quiz')}Chapter quiz</a><a class="btn small" href="${r}${c.design[0].url}">${svg('design')}Design practice</a></div></aside>` : '';
    const body = `<div class="lesson-layout">
<article class="prose lesson">
  <div class="crumbs"><a href="${r}index.html#part-${c.part}">Part ${c.part}</a> <span aria-hidden="true">/</span> <a href="${r}${c.url}">Ch ${c.num} · ${esc(c.title)}</a></div>
  <div class="eyebrow">Lesson ${i + 1} of ${c.lessons.length} · ${L.minutes} min read</div>
  <h1 class="lesson-title">${esc(L.title)}</h1>
  ${content}
  <div class="lesson-foot">
    <button class="btn quiet js-only" type="button" data-mark-read="${esc(key)}" aria-pressed="false"><span class="mr-off">Mark as read</span><span class="mr-on">${svg('check')}Read</span></button>
    ${pager(r, prev, next, key)}
  </div>
</article>
${toc}
</div>`;
    add(pathOut, page({ pathOut, title: `${L.title} · Ch ${c.num}`, desc: `Chapter ${c.num}, ${c.title}: ${L.title}. ${trunc((L.blocks.find(b => b.t === 'p') || {}).html, 150)}`, kind: 'lesson', body, side: { ch: c, kind: 'lesson', lesson: L }, bodyAttrs: ` data-ch="${c.id}" data-lesson="${esc(L.id)}" data-label="${esc(`Ch ${c.num} · ${L.title}`)}"` }));
  });
});

// Chapter overview pages
chapters.forEach((c, ci) => {
  const pathOut = c.url; const r = relTo(pathOut, '');
  const prevC = chapters[ci - 1], nextC = chapters[ci + 1];
  const body = `<div class="wrap">
${chapterHead(c, r, false)}
<div class="row js-only" style="margin-bottom:8px"><a class="btn primary" href="${r}${c.lessons[0].url}" data-chapter-cta="${c.id}">Start lesson 1 ${svg('arrowR')}</a><a class="btn" href="${r}${c.quizUrl}">${svg('quiz')}Take the quiz</a></div>
<noscript><div class="row"><a class="btn primary" href="${r}${c.lessons[0].url}">Start lesson 1</a></div></noscript>
<section class="section"><h2 class="h2">Lessons</h2>
  <ol class="lesson-list">${c.lessons.map((l, k) => `<li><a href="${r}${l.url}" data-lesson-key="${c.id}:${esc(l.id)}"><span class="n">${pad(k + 1)}</span><span class="t">${esc(l.title)}</span><span class="m mono">${l.minutes} min</span><span class="ok-mark" aria-hidden="true">${svg('check')}</span></a></li>`).join('')}</ol>
</section>
<section class="section"><h2 class="h2">Test yourself</h2>
  <div class="test-grid">
    <a class="test-card" href="${r}${c.quizUrl}"><span class="tc-ic">${svg('quiz')}</span><span class="tc-t">Chapter quiz</span><span class="tc-d">${c.mcqs.length} interview-style MCQs with explanations.</span><span class="tc-s mono" data-quiz-best-long="${c.id}">Not taken yet</span></a>
    ${c.design.map(d => `<a class="test-card" href="${r}${d.url}" data-design-key="${esc(d.id)}"><span class="tc-ic">${svg('design')}</span><span class="tc-t">${esc(d.title)}</span><span class="tc-d">${trunc(d.prompt, 120)}</span><span class="tc-s">${chip(esc(d.level), lvl(d.level))}<span class="done-mark js-only">${svg('check')}Practiced</span></span></a>`).join('')}
  </div>
</section>
<section class="section" id="remember"><h2 class="h2">Remember for the interview</h2>
  <ol class="takeaways">${c.takeaways.map((t, k) => `<li><span class="mono">${pad(k + 1)}</span><span>${t}</span></li>`).join('')}</ol>
</section>
<nav class="pager ch-pager" aria-label="Chapters">${prevC ? `<a class="pg pg-prev" href="${r}${prevC.url}"><span class="pg-k">${svg('arrowL')}Chapter ${prevC.num}</span><span class="pg-t">${esc(prevC.title)}</span></a>` : '<span></span>'}${nextC ? `<a class="pg pg-next" href="${r}${nextC.url}"><span class="pg-k">Chapter ${nextC.num}${svg('arrowR')}</span><span class="pg-t">${esc(nextC.title)}</span></a>` : '<span></span>'}</nav>
</div>`;
  add(pathOut, page({ pathOut, title: `Ch ${c.num} · ${c.title}`, desc: `${c.tagline} ${c.lessons.length} lessons, ${c.mcqs.length} interview MCQs and ${c.design.length} design problems.`, kind: 'chapter', body, side: { ch: c, kind: 'chapter' }, bodyAttrs: ` data-ch="${c.id}"` }));
});

// Quiz pages
chapters.forEach(c => {
  const pathOut = c.quizUrl; const r = relTo(pathOut, '');
  const data = JSON.stringify({ ch: c.id, items: c.mcqs.map(m => ({ q: m.q, options: m.options, answer: m.answer, explain: m.explain, level: m.level })), next: c.design[0].url }).replace(/</g, '\\u003c');
  const body = `<div class="wrap">
<header class="page-head">
  <div class="crumbs"><a href="${r}index.html#part-${c.part}">Part ${c.part}</a> <span aria-hidden="true">/</span> <a href="${r}${c.url}">Ch ${c.num} · ${esc(c.title)}</a></div>
  <div class="eyebrow">Chapter ${c.num} quiz · ${c.mcqs.length} questions</div>
  <h1 class="ph-h1">${esc(c.title)}</h1>
  <p class="tagline">Answer with the keys 1–4 or A–D, and press Enter to continue. Aim for 70% or more.</p>
</header>
<div id="quiz-app" class="quiz" data-ch="${c.id}"><noscript><p>The quiz needs JavaScript. The chapter lessons and design problems work without it.</p></noscript></div>
<script type="application/json" id="quiz-data">${data}</script>
</div>`;
  add(pathOut, page({ pathOut, title: `Quiz · Ch ${c.num} ${c.title}`, desc: `${c.mcqs.length} interview-style multiple-choice questions on ${c.title}, each with an explanation.`, kind: 'quiz', body, side: { ch: c, kind: 'quiz' }, bodyAttrs: ` data-ch="${c.id}" data-label="${esc(`Ch ${c.num} quiz`)}"` }));
});

// Design pages
chapters.forEach(c => {
  c.design.forEach((d, di) => {
    const pathOut = d.url; const r = relTo(pathOut, '');
    const ctx = { ids: new Set(), toc: [] };
    const sol = renderBlocks(d.solution, ctx);
    const next = c.design[di + 1];
    const placeholder = 'Requirements:\n- \n\nEstimates:\n- \n\nAPI:\n- \n\nData model:\n- \n\nHigh-level design:\n- \n\nDeep dives:\n- \n\nBottlenecks and trade-offs:\n- ';
    const body = `<div class="wrap design">
<header class="page-head">
  <div class="crumbs"><a href="${r}designs.html">Design bank</a> <span aria-hidden="true">/</span> <a href="${r}${c.url}">Ch ${c.num} · ${esc(c.title)}</a></div>
  <div class="row">${chip(esc(d.level), lvl(d.level))}<span class="done-mark js-only" data-design-key="${esc(d.id)}">${svg('check')}Practiced</span></div>
  <h1 class="ph-h1">${esc(d.title)}</h1>
  <p class="prompt">${d.prompt}</p>
</header>
<div class="mock js-only" id="mock">
  <div class="mock-head"><span class="mock-time mono" id="mock-time">45:00</span><span class="mock-phase" id="mock-phase">Mock interview timer. Start it when you begin talking.</span><button class="btn small" type="button" id="mock-btn">Start timer</button></div>
  ${clockHTML(true)}
</div>
<section class="dsec">
  <div class="dsec-h"><h2><span class="mono">1</span>Clarify first</h2><button class="btn small js-only" type="button" data-reveal-btn="clarify">Show questions to ask</button></div>
  <p class="sub js-only" data-reveal-hint="clarify">Write down what you would ask the interviewer before designing anything, then compare.</p>
  <div class="rich" data-reveal="clarify" hidden><ul>${d.clarify.map(x => `<li>${x}</li>`).join('')}</ul></div>
</section>
<section class="dsec js-only">
  <div class="dsec-h"><h2><span class="mono">2</span>Your answer</h2><span class="mono saved" id="notes-saved"></span></div>
  <label class="sr" for="notes">Your notes for ${esc(d.title)}</label>
  <textarea class="notes" id="notes" data-notes="${esc(d.id)}" placeholder="${esc(placeholder)}"></textarea>
</section>
<section class="dsec">
  <div class="dsec-h"><h2><span class="mono">3</span>Hints <span class="mono js-only" id="hint-count">0/${d.hints.length}</span></h2><button class="btn small js-only" type="button" id="hint-btn">Reveal hint 1</button></div>
  <p class="sub js-only" id="hint-empty">Stuck? Each hint gives a little more away than the last.</p>
  ${d.hints.map((h, k) => `<div class="hint" data-hint="${k}" hidden><span class="mono">H${k + 1}</span><span>${h}</span></div>`).join('')}
</section>
<section class="dsec">
  <div class="dsec-h"><h2><span class="mono">4</span>Model solution</h2><button class="btn small primary js-only" type="button" data-reveal-btn="solution">Show model solution</button></div>
  <p class="sub js-only" data-reveal-hint="solution">Try your own answer first. The solution follows seven steps: requirements, estimates, API, data model, architecture, deep dives, trade-offs.</p>
  <div class="solution prose" data-reveal="solution" hidden>${sol}</div>
</section>
<section class="dsec">
  <div class="dsec-h"><h2><span class="mono">5</span>Follow-up questions</h2></div>
  <div class="rich"><ul>${d.followups.map(x => `<li>${x}</li>`).join('')}</ul></div>
</section>
<div class="design-foot">
  <button class="btn primary js-only" type="button" data-practiced="${esc(d.id)}"><span class="pr-off">${svg('check')}Mark as practiced</span><span class="pr-on">Mark as not practiced</span></button>
  ${next ? `<a class="btn" href="${r}${next.url}">Next problem: ${esc(next.title)} ${svg('arrowR')}</a>` : `<a class="btn" href="${r}${c.url}#remember">Chapter ${c.num} overview ${svg('arrowR')}</a>`}
</div>
</div>`;
    add(pathOut, page({ pathOut, title: d.title, desc: `${d.level} system design interview problem with clarifying questions, hints and a model solution. ${trunc(d.prompt, 120)}`, kind: 'design', body, side: { ch: c, kind: 'design', design: d }, bodyAttrs: ` data-ch="${c.id}" data-design="${esc(d.id)}" data-label="${esc(d.title)}"` }));
  });
});

// Home page
(() => {
  const pathOut = 'index.html'; const r = '';
  const ladder = PARTS.map((p, i) => p ? { p, i, chs: chapters.filter(c => c.part === i) } : null).filter(Boolean).reverse();
  const body = `<div class="wrap home">
<section class="hero">
  <div class="hero-text">
    <div class="eyebrow">High-level system design · interview track</div>
    <h1 class="display">HLD <em>Ladder</em></h1>
    <p class="lede">A complete course in system design. It starts with what a load balancer does and climbs to full interview answers for chat, news feeds, video streaming and ride-hailing. Every chapter ends with interview MCQs and design problems that come with hints and a model solution.</p>
    <div class="row">
      <a class="btn primary" href="${chapters[0].lessons[0].url}" data-continue>Start with chapter 1 ${svg('arrowR')}</a>
      <a class="btn" href="practice.html">Mixed practice</a>
      <a class="btn" href="designs.html">Design bank</a>
    </div>
    <div class="course-stats"><span><b>${totals.chapters}</b> chapters</span><span><b>${totals.lessons}</b> lessons</span><span><b>${totals.diagrams}</b> diagrams</span><span><b>${totals.mcqs}</b> MCQs</span><span><b>${totals.designs}</b> design problems</span><span><b>~${Math.round(totals.minutes / 60)} h</b> of reading</span></div>
  </div>
  <div class="ladder" aria-label="The seven parts of the course, from basic to advanced">
    ${ladder.map(({ p, i, chs }) => `<div class="rung" style="--i:${i - 1}"><a class="rung-label" href="#part-${i}"><span class="mono">Part ${i}</span>${esc(p.title)}</a><div class="rung-chs">${chs.map(c => `<a class="rung-ch" href="${c.url}" data-led-ch="${c.id}" title="Ch ${c.num} · ${esc(c.title)}"><span class="led" aria-hidden="true"></span>${pad(c.num)}<span class="sr"> ${esc(c.title)}</span></a>`).join('')}</div></div>`).join('')}
  </div>
</section>

<section class="section js-only" id="progress"><h2 class="h2">Your progress</h2>
  <div class="progress-grid">
    ${[['read', 'Lessons read'], ['quiz', 'Chapter quizzes passed (70%+)'], ['designs', 'Design problems practiced'], ['acc', 'MCQ accuracy']].map(([k, l]) => `<div class="pstat"><div class="top"><span>${l}</span><span class="val" data-stat="${k}"></span></div><div class="meter"><i data-meter="${k}"></i></div></div>`).join('')}
  </div>
  <p class="sub small">Saved in this browser only.</p>
</section>

<section class="section"><h2 class="h2">How to use this course</h2>
  <ol class="howto">
    <li><div><b>Read the lessons in order</b>Each chapter builds on the ones before it. The diagrams and tables carry as much as the text.</div></li>
    <li><div><b>Take the chapter quiz</b>Aim for 70% or more. Every answer explains why it is right, and why the tempting option is wrong.</div></li>
    <li><div><b>Practice a design out loud</b>Run the 45-minute timer, sketch your answer in the notes, then open hints one at a time before the model solution.</div></li>
    <li><div><b>Revise across chapters</b>Mixed practice shuffles questions from any chapter and re-drills the ones you missed. The cheat sheet collects every key takeaway.</div></li>
  </ol>
</section>

<section class="section"><h2 class="h2">The 45-minute interview</h2>
  <p class="sub">Most HLD rounds follow this shape. Chapter 1 explains what to say in each phase, and every design problem has a timer that walks you through it.</p>
  ${clockHTML(false)}
</section>

<section class="section" id="chapters"><h2 class="h2">Chapters</h2>
  ${PARTS.map((p, i) => {
    if (!p) return '';
    const chs = chapters.filter(c => c.part === i);
    return `<div class="part" id="part-${i}"><div class="part-head"><span class="eyebrow">Part ${i}</span><h3 class="part-title">${esc(p.title)}</h3><p class="sub">${esc(p.desc)}</p></div>
    <div class="ch-rows">${chs.map(c => `<a class="ch-row" href="${c.url}"><span class="led" data-led-ch="${c.id}" aria-hidden="true"></span><span class="big">${pad(c.num)}</span><span class="mid"><span class="t">${esc(c.title)}</span><span class="d">${esc(c.tagline)}</span></span><span class="s">${chip(esc(c.level), lvl(c.level))}<span class="mono" data-ch-progress="${c.id}">${c.lessons.length} lessons · ${minutes(c)} min</span></span></a>`).join('')}</div></div>`;
  }).join('')}
</section>
</div>`;
  add(pathOut, page({ pathOut, title: 'HLD Ladder', desc: `Learn high-level system design from the basics to interview-ready: ${totals.chapters} chapters, ${totals.lessons} lessons, ${totals.mcqs} interview MCQs and ${totals.designs} design problems with model solutions.`, kind: 'home', body, side: null, active: '' }));
})();

// Practice page
(() => {
  const pathOut = 'practice.html';
  const body = `<div class="wrap">
<header class="page-head"><div class="eyebrow">Mixed practice</div><h1 class="ph-h1">Shuffle questions across chapters</h1>
<p class="tagline">Good for revision before an interview. Questions you miss go into a review pile until you answer them correctly.</p></header>
<div id="practice-app"><noscript><p>Practice needs JavaScript.</p></noscript></div>
</div>`;
  add(pathOut, page({ pathOut, title: 'Mixed practice', desc: `Practise ${totals.mcqs} system design interview MCQs across all chapters, filtered by chapter and difficulty.`, kind: 'practice', body, active: 'practice', scripts: ['assets/data/mcqs.js'] }));
})();

// Design bank
(() => {
  const pathOut = 'designs.html';
  const body = `<div class="wrap">
<header class="page-head"><div class="eyebrow">Design bank</div><h1 class="ph-h1">Every “design an application” problem</h1>
<p class="tagline">${totals.designs} problems, each with clarifying questions, hints, a model solution and follow-up questions. <span class="js-only" data-stat="designs-long"></span></p></header>
<div class="filters js-only">
  <div class="seg-ctl" role="group" aria-label="Difficulty">${['all', 'easy', 'medium', 'hard'].map(l => `<button type="button" data-f-level="${l}" aria-pressed="${l === 'all'}">${l === 'all' ? 'All levels' : cap(l)}</button>`).join('')}</div>
  <div class="seg-ctl" role="group" aria-label="Part"><button type="button" data-f-part="0" aria-pressed="true">All parts</button>${PARTS.map((p, i) => p ? `<button type="button" data-f-part="${i}" aria-pressed="false">${i} · ${esc(p.title)}</button>` : '').join('')}</div>
</div>
<div class="d-cards">${allDesigns.map(d => `<a class="d-card" href="${d.url}" data-level="${d.level.toLowerCase()}" data-part="${d.ch.part}" data-design-key="${esc(d.id)}"><span class="row">${chip(esc(d.level), lvl(d.level))}${chip(`Ch ${d.ch.num} · ${esc(d.ch.title)}`)}<span class="done-mark js-only">${svg('check')}Practiced</span></span><span class="t">${esc(d.title)}</span><span class="p">${trunc(d.prompt, 220)}</span></a>`).join('')}</div>
<p class="empty" id="bank-empty" hidden>No problems match these filters.</p>
</div>`;
  add(pathOut, page({ pathOut, title: 'Design bank', desc: `${totals.designs} system design interview problems with clarifying questions, hints and model solutions.`, kind: 'bank', body, active: 'designs' }));
})();

// Cheat sheet
(() => {
  const pathOut = 'cheatsheet.html';
  const body = `<div class="wrap">
<header class="page-head"><div class="eyebrow">Cheat sheet</div><h1 class="ph-h1">Every key takeaway, on one page</h1>
<p class="tagline">Read this the night before. Each line links back to the chapter that explains it.</p></header>
<nav class="jump" aria-label="Jump to chapter">${chapters.map(c => `<a href="#c${c.num}">${pad(c.num)}</a>`).join('')}</nav>
${PARTS.map((p, i) => p ? `<section class="cs-part"><h2 class="h2"><span class="eyebrow">Part ${i}</span>${esc(p.title)}</h2>${chapters.filter(c => c.part === i).map(c => `<div class="cs-ch" id="c${c.num}"><h3><a href="${c.url}"><span class="mono">${pad(c.num)}</span>${esc(c.title)}</a></h3><ul class="cs-list">${c.takeaways.map(t => `<li>${t}</li>`).join('')}</ul></div>`).join('')}</section>` : '').join('')}
</div>`;
  add(pathOut, page({ pathOut, title: 'Cheat sheet', desc: 'Every key system design interview takeaway from HLD Ladder on one page.', kind: 'cheatsheet', body, active: 'cheatsheet' }));
})();

// Search page
(() => {
  const pathOut = 'search.html';
  const body = `<div class="wrap">
<header class="page-head"><div class="eyebrow">Search</div><h1 class="ph-h1" id="search-title">Search the course</h1></header>
<form class="big-search" action="search.html" method="get" role="search">${svg('search')}<label class="sr" for="q-main">Search</label><input id="q-main" name="q" type="search" placeholder="Try “consistent hashing”, “Kafka” or “rate limiter”" autocomplete="off"></form>
<div id="search-results" class="results" aria-live="polite"></div>
</div>`;
  add(pathOut, page({ pathOut, title: 'Search', desc: 'Search every lesson and design problem in HLD Ladder.', kind: 'search', body, scripts: ['assets/data/search.js'] }));
})();

// ---------- Data files ----------
const courseData = {
  parts: PARTS.map(p => p && p.title),
  chapters: chapters.map(c => ({
    id: c.id, num: c.num, part: c.part, title: c.title, url: c.url, quiz: c.quizUrl, mcqs: c.mcqs.length,
    lessons: c.lessons.map(l => [l.id, l.title, l.url]), designs: c.design.map(d => [d.id, d.title, d.url, d.level])
  }))
};
const mcqData = {}; chapters.forEach(c => { mcqData[c.id] = c.mcqs.map(m => ({ q: m.q, options: m.options, answer: m.answer, explain: m.explain, level: m.level })); });
const searchIdx = [];
chapters.forEach(c => {
  c.lessons.forEach((l, i) => {
    let cur = { t: l.title, a: '', x: [] }; const secs = [cur];
    const textOf = b => strip([b.html, b.title, b.caption, (b.items || []).map(x => typeof x === 'string' ? x : [x.title, x.html, x.value, x.label, x.use, (x.pros || []).join(' '), (x.cons || []).join(' ')].join(' ')).join(' '), (b.head || []).join(' '), (b.rows || []).flat().join(' '), b.t === 'code' ? b.code : ''].filter(Boolean).join(' '));
    const ids = new Set();
    l.blocks.forEach(b => {
      if (b.t === 'h') { let id = slug(b.text); while (ids.has(id)) id += '-x'; ids.add(id); cur = { t: b.text, a: id, x: [] }; secs.push(cur); }
      else cur.x.push(textOf(b));
    });
    secs.forEach(s => { const x = s.x.join(' ').replace(/\s+/g, ' ').trim(); if (x || !s.a) searchIdx.push({ k: 'l', t: s.a ? `${l.title} › ${s.t}` : l.title, u: l.url + (s.a ? '#' + s.a : ''), w: `Ch ${c.num} · ${c.title} · Lesson ${i + 1}`, x }); });
  });
  c.design.forEach(d => searchIdx.push({ k: 'd', t: d.title, u: d.url, w: `Ch ${c.num} · Design problem · ${d.level}`, x: strip([d.prompt, ...d.hints, ...d.clarify].join(' ')).replace(/\s+/g, ' ') }));
  searchIdx.push({ k: 'c', t: `Chapter ${c.num}: ${c.title}`, u: c.url, w: `Part ${c.part} · ${PARTS[c.part].title}`, x: strip(c.tagline + ' ' + c.takeaways.join(' ')) });
});

// ---------- Write ----------
fs.rmSync(OUT, { recursive: true, force: true });
const write = (p, s) => { const f = path.join(OUT, p); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); };
pages.forEach(([p, html]) => write(p, html));
const js = o => JSON.stringify(o).replace(/</g, '\\u003c');
write('assets/data/course.js', `window.HLD_COURSE=${js(courseData)};`);
write('assets/data/mcqs.js', `window.HLD_MCQS=${js(mcqData)};`);
write('assets/data/search.js', `window.HLD_SEARCH=${js(searchIdx)};`);

// CSS with generated theme tokens
const tokCSS = t => Object.entries(t).map(([k, v]) => `--${k}:${v}`).join(';');
const css = `/* HLD Ladder — generated theme tokens */
:root{${tokCSS(tokens.light)}}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){${tokCSS(tokens.dark)};color-scheme:dark}}
:root[data-theme="dark"]{${tokCSS(tokens.dark)};color-scheme:dark}
:root[data-theme="light"]{color-scheme:light}
` + fs.readFileSync(path.join(WEB, 'assets', 'site.css'), 'utf8');
write('assets/site.css', css);
write('assets/site.js', fs.readFileSync(path.join(WEB, 'assets', 'site.js'), 'utf8'));
fs.cpSync(path.join(WEB, 'assets', 'fonts'), path.join(OUT, 'assets', 'fonts'), { recursive: true });
write('assets/favicon.svg', `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#2856CC"/><path d="M10 5v22M22 5v22M10 9h12M10 14h12M10 19h12M10 24h12" stroke="#fff" stroke-width="2.4" stroke-linecap="round" fill="none"/></svg>`);
write('.nojekyll', '');
write('robots.txt', `User-agent: *\nAllow: /\n${argBase ? `Sitemap: ${argBase}/sitemap.xml\n` : ''}`);
if (argBase) write('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map(([p]) => `  <url><loc>${esc(argBase + '/' + (p === 'index.html' ? '' : p))}</loc></url>`).join('\n')}\n</urlset>\n`);
write('README.md', fs.readFileSync(path.join(WEB, 'README.md'), 'utf8'));

let bytes = 0; const walk = d => fs.readdirSync(d, { withFileTypes: true }).forEach(e => { const f = path.join(d, e.name); e.isDirectory() ? walk(f) : bytes += fs.statSync(f).size; }); walk(OUT);
console.log(`site/: ${pages.length} pages, ${totals.lessons} lessons, ${totals.mcqs} MCQs, ${totals.designs} design problems, ${(bytes / 1048576).toFixed(1)} MB total${argBase ? ', sitemap for ' + argBase : ''}`);
