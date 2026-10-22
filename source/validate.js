#!/usr/bin/env node
// Usage: node validate.js            -> validate all content/ch*.js
//        node validate.js ch05 ch06  -> validate specific chapters
const fs = require('fs');
const path = require('path');

const dir = path.join(__dirname, 'content');
let targets = process.argv.slice(2);
if (!targets.length) targets = fs.readdirSync(dir).filter(f => /^ch\d\d\.js$/.test(f)).map(f => f.replace('.js', ''));

const BLOCK_FIELDS = {
  p: ['html'], h: ['text'], list: ['items'], table: ['head', 'rows'], callout: ['kind', 'title', 'html'],
  diagram: ['code', 'caption'], code: ['lang', 'code'], compare: ['items'], steps: ['items'], numbers: ['items']
};
const OPTIONAL = { list: ['ordered'] };
const CALLOUTS = ['tip', 'warn', 'interview', 'example'];
const LANGS = ['python', 'sql', 'text', 'http', 'json', 'bash', 'js'];
const ALLOWED_TAGS = ['b', 'em', 'code', 'br', 'strong', 'i'];

let totalErrors = 0;

function checkInline(s, where, errs) {
  if (typeof s !== 'string') { errs.push(`${where}: expected string`); return; }
  const tags = s.match(/<\/?([a-zA-Z0-9]+)[^>]*>/g) || [];
  for (const t of tags) {
    const name = t.replace(/<\/?([a-zA-Z0-9]+).*/s, '$1').toLowerCase();
    if (!ALLOWED_TAGS.includes(name)) errs.push(`${where}: tag <${name}> not allowed (use &lt; for a literal <)`);
  }
  for (const tag of ['b', 'em', 'code', 'strong', 'i']) {
    const open = (s.match(new RegExp(`<${tag}>`, 'g')) || []).length;
    const close = (s.match(new RegExp(`</${tag}>`, 'g')) || []).length;
    if (open !== close) errs.push(`${where}: unbalanced <${tag}>`);
  }
}

function checkMermaid(code, where, errs) {
  if (typeof code !== 'string') return errs.push(`${where}: diagram code must be string`);
  const lines = code.split('\n');
  const first = lines[0].trim();
  if (!/^(flowchart (LR|TD)|sequenceDiagram)$/.test(first)) errs.push(`${where}: first line must be "flowchart LR", "flowchart TD" or "sequenceDiagram" (got "${first}")`);
  if (/\b(style|classDef|linkStyle|click)\b/.test(code) && first !== 'sequenceDiagram') errs.push(`${where}: no style/classDef/linkStyle/click`);
  if (/%%/.test(code)) errs.push(`${where}: no %% comments`);
  if (first.startsWith('flowchart')) {
    // check labels inside quotes don't contain forbidden chars
    const labels = code.match(/"([^"]*)"/g) || [];
    for (const l of labels) {
      const inner = l.slice(1, -1);
      if (/[#;{}\[\]()]/.test(inner)) errs.push(`${where}: label ${l} contains a forbidden char (# ; { } [ ] ( ))`);
      const noBr = inner.replace(/<br\/?>/g, '');
      if (/[<>]/.test(noBr)) errs.push(`${where}: label ${l} contains < or > (use words)`);
    }
    // node count heuristic
    const ids = new Set();
    for (const ln of lines.slice(1)) {
      const m = ln.match(/^\s*([A-Za-z][A-Za-z0-9]*)\s*[\[\(\{]/);
      if (m) ids.add(m[1]);
    }
    if (ids.size > 16) errs.push(`${where}: too many nodes (${ids.size}); keep ≤ 14`);
  } else {
    for (const ln of lines.slice(1)) {
      if (/[;#{}]/.test(ln)) errs.push(`${where}: sequenceDiagram line has ; # { or }: "${ln.trim()}"`);
    }
  }
}

function checkBlocks(blocks, where, errs, stats) {
  if (!Array.isArray(blocks) || !blocks.length) return errs.push(`${where}: blocks must be a non-empty array`);
  blocks.forEach((b, i) => {
    const w = `${where}.blocks[${i}](${b && b.t})`;
    if (!b || !BLOCK_FIELDS[b.t]) return errs.push(`${w}: unknown block type "${b && b.t}"`);
    const allowed = ['t', ...BLOCK_FIELDS[b.t], ...(OPTIONAL[b.t] || [])];
    for (const f of BLOCK_FIELDS[b.t]) if (b[f] === undefined || b[f] === '') errs.push(`${w}: missing "${f}"`);
    for (const k of Object.keys(b)) if (!allowed.includes(k)) errs.push(`${w}: unexpected field "${k}"`);
    switch (b.t) {
      case 'p': checkInline(b.html, w, errs); break;
      case 'h': if (/[<>]/.test(b.text)) errs.push(`${w}: h text must be plain`); break;
      case 'list': (b.items || []).forEach((it, j) => checkInline(it, `${w}.items[${j}]`, errs)); break;
      case 'table':
        stats.tables++;
        (b.head || []).forEach((c, j) => checkInline(c, `${w}.head[${j}]`, errs));
        (b.rows || []).forEach((r, j) => {
          if (!Array.isArray(r) || r.length !== b.head.length) errs.push(`${w}.rows[${j}]: length ${r && r.length} != head ${b.head.length}`);
          else r.forEach((c, k) => checkInline(String(c), `${w}.rows[${j}][${k}]`, errs));
        });
        break;
      case 'callout':
        if (!CALLOUTS.includes(b.kind)) errs.push(`${w}: kind must be one of ${CALLOUTS}`);
        stats.callouts[b.kind] = (stats.callouts[b.kind] || 0) + 1;
        checkInline(b.html, w, errs); break;
      case 'diagram': stats.diagrams++; checkMermaid(b.code, w, errs); break;
      case 'code': if (!LANGS.includes(b.lang)) errs.push(`${w}: lang must be one of ${LANGS}`);
        if (b.code.split('\n').length > 40) errs.push(`${w}: code too long`); break;
      case 'compare':
        if (!Array.isArray(b.items) || b.items.length < 2 || b.items.length > 4) errs.push(`${w}: compare needs 2-4 items`);
        (b.items || []).forEach((it, j) => {
          for (const f of ['title', 'pros', 'cons', 'use']) if (!it[f]) errs.push(`${w}.items[${j}]: missing ${f}`);
          [...(it.pros || []), ...(it.cons || [])].forEach(s => checkInline(s, `${w}.items[${j}]`, errs));
          checkInline(it.use || '', `${w}.items[${j}].use`, errs);
        });
        break;
      case 'steps':
        (b.items || []).forEach((it, j) => { if (!it.title || !it.html) errs.push(`${w}.items[${j}]: needs title+html`); else checkInline(it.html, `${w}.items[${j}]`, errs); });
        break;
      case 'numbers':
        (b.items || []).forEach((it, j) => { if (!it.value || !it.label) errs.push(`${w}.items[${j}]: needs value+label`); });
        break;
    }
  });
}

for (const name of targets) {
  const file = path.join(dir, name.endsWith('.js') ? name : name + '.js');
  const errs = []; const warns = [];
  const stats = { tables: 0, diagrams: 0, callouts: {} };
  let ch;
  try { delete require.cache[require.resolve(file)]; ch = require(file); }
  catch (e) { console.log(`✗ ${name}: cannot load: ${e.message}`); totalErrors++; continue; }
  for (const f of ['id', 'num', 'part', 'title', 'tagline', 'level', 'lessons', 'takeaways', 'mcqs', 'design']) if (ch[f] === undefined) errs.push(`missing chapter field "${f}"`);
  if (!['Beginner', 'Intermediate', 'Advanced'].includes(ch.level)) errs.push('level must be Beginner|Intermediate|Advanced');
  if (!Array.isArray(ch.lessons) || ch.lessons.length < 3) errs.push('need at least 3 lessons');
  const lessonIds = new Set();
  (ch.lessons || []).forEach((l, i) => {
    const w = `lessons[${i}]`;
    if (!l.id || !l.title || !l.minutes) errs.push(`${w}: needs id, title, minutes`);
    if (lessonIds.has(l.id)) errs.push(`${w}: duplicate id ${l.id}`); lessonIds.add(l.id);
    checkBlocks(l.blocks, w, errs, stats);
  });
  if (!Array.isArray(ch.takeaways) || ch.takeaways.length < 5) errs.push('need ≥5 takeaways');
  (ch.takeaways || []).forEach((t, i) => checkInline(t, `takeaways[${i}]`, errs));
  const ansCount = [0, 0, 0, 0];
  if (!Array.isArray(ch.mcqs) || ch.mcqs.length < 10) errs.push(`need ≥10 mcqs (have ${ch.mcqs && ch.mcqs.length})`);
  (ch.mcqs || []).forEach((m, i) => {
    const w = `mcqs[${i}]`;
    if (!m.q || !Array.isArray(m.options) || m.options.length !== 4) errs.push(`${w}: needs q and exactly 4 options`);
    if (!Number.isInteger(m.answer) || m.answer < 0 || m.answer > 3) errs.push(`${w}: answer must be 0-3`); else ansCount[m.answer]++;
    if (!m.explain) errs.push(`${w}: missing explain`);
    if (!['easy', 'medium', 'hard'].includes(m.level)) errs.push(`${w}: level must be easy|medium|hard`);
    checkInline(m.q || '', `${w}.q`, errs); (m.options || []).forEach((o, j) => checkInline(o, `${w}.options[${j}]`, errs)); checkInline(m.explain || '', `${w}.explain`, errs);
    if ((m.options || []).some(o => /all of the above|none of the above/i.test(o))) errs.push(`${w}: no all/none of the above`);
  });
  const n = (ch.mcqs || []).length;
  // Length-bias check: the correct option should not stand out as the longest.
  const plain = s => String(s).replace(/<[^>]+>/g, '');
  let longest = 0, ratioSum = 0;
  (ch.mcqs || []).forEach(m => {
    if (!Array.isArray(m.options) || m.options.length !== 4) return;
    const lens = m.options.map(o => plain(o).length); const a = lens[m.answer];
    const others = lens.filter((_, i) => i !== m.answer);
    if (a > Math.max(...others)) longest++;
    ratioSum += a / (others.reduce((x, y) => x + y, 0) / 3);
  });
  if (n) {
    const ratio = ratioSum / n;
    if (longest > Math.round(n * 0.34)) warns.push(`correct option is the longest in ${longest}/${n} MCQs — balance option lengths (aim ≤ ${Math.round(n * 0.34)})`);
    if (ratio > 1.15) warns.push(`correct options average ${ratio.toFixed(2)}x the length of distractors — aim ≤ 1.15`);
  }
  if (n && Math.max(...ansCount) > Math.ceil(n * 0.45)) warns.push(`answer positions skewed ${JSON.stringify(ansCount)} — spread them out`);
  if (!Array.isArray(ch.design) || ch.design.length < 2) errs.push('need ≥2 design problems');
  (ch.design || []).forEach((d, i) => {
    const w = `design[${i}]`;
    for (const f of ['id', 'title', 'level', 'prompt', 'clarify', 'hints', 'solution', 'followups']) if (!d[f]) errs.push(`${w}: missing ${f}`);
    if (!['Easy', 'Medium', 'Hard'].includes(d.level)) errs.push(`${w}: level must be Easy|Medium|Hard`);
    checkBlocks(d.solution, `${w}.solution`, errs, stats);
    [...(d.clarify || []), ...(d.hints || []), ...(d.followups || [])].forEach((s, j) => checkInline(s, `${w}.list[${j}]`, errs));
    checkInline(d.prompt || '', `${w}.prompt`, errs);
  });
  if (stats.diagrams < 3) warns.push(`only ${stats.diagrams} diagrams (aim ≥3 in lessons + one per design solution)`);
  if (stats.tables < 2) warns.push(`only ${stats.tables} tables (aim ≥2)`);
  if (errs.length) { totalErrors += errs.length; console.log(`✗ ${name} (${ch.title}): ${errs.length} error(s)`); errs.slice(0, 60).forEach(e => console.log('   - ' + e)); }
  else console.log(`OK ${name} — ${ch.title}: ${ch.lessons.length} lessons, ${n} MCQs ${JSON.stringify(ansCount)}, ${ch.design.length} design, ${stats.diagrams} diagrams, ${stats.tables} tables`);
  warns.forEach(w => console.log('   ! ' + w));
}
process.exit(totalErrors ? 1 : 0);
