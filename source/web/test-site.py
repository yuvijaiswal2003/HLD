#!/usr/bin/env python3
"""Test the built site: broken links/anchors, then a headless browser pass over http and file://
(console errors, horizontal overflow, interactions) with screenshots in web/.cache/shots."""
import re, sys, pathlib, threading, http.server, functools, urllib.parse
from html.parser import HTMLParser
from playwright.sync_api import sync_playwright

site = pathlib.Path(__file__).resolve().parent.parent / 'site'
shots = pathlib.Path(__file__).resolve().parent / '.cache' / 'shots'
shots.mkdir(parents=True, exist_ok=True)

# ---------- 1. Links and anchors ----------
class P(HTMLParser):
    def __init__(self):
        super().__init__(); self.links = []; self.ids = set()
    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if 'id' in a: self.ids.add(a['id'])
        for k in ('href', 'src', 'action'):
            if k in a and a[k]: self.links.append(a[k])
pages = {}
for f in site.rglob('*.html'):
    p = P(); p.feed(f.read_text()); pages[f.resolve()] = p
bad = []
for f, p in pages.items():
    for href in p.links:
        if re.match(r'^(https?:|mailto:|tel:|data:|javascript:)', href): continue
        u = urllib.parse.urlsplit(href)
        if not u.path:
            if u.fragment and u.fragment not in p.ids: bad.append((f.relative_to(site), href, 'missing same-page anchor'))
            continue
        target = (f.parent / u.path).resolve()
        if not target.exists(): bad.append((f.relative_to(site), href, 'missing file')); continue
        if u.fragment and target.suffix == '.html' and u.fragment not in pages[target].ids:
            bad.append((f.relative_to(site), href, 'missing anchor'))
# search index targets
import json
idx = json.loads((site / 'assets/data/search.js').read_text().split('=', 1)[1].rstrip(';'))
for e in idx:
    u = urllib.parse.urlsplit(e['u']); t = (site / u.path).resolve()
    if not t.exists() or (u.fragment and u.fragment not in pages[t].ids): bad.append(('search.js', e['u'], 'bad search target'))
print(f'links: {sum(len(p.links) for p in pages.values())} checked across {len(pages)} pages, {len(bad)} broken')
for b in bad[:20]: print('  ', b)

# ---------- 2. Browser ----------
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a): pass
handler = functools.partial(Quiet, directory=str(site))
srv = http.server.ThreadingHTTPServer(('127.0.0.1', 0), handler)
threading.Thread(target=srv.serve_forever, daemon=True).start()
BASE = f'http://127.0.0.1:{srv.server_address[1]}/'
full = '--full' in sys.argv

issues = []
def check_page(pg, url, tag, shot=None):
    errs = []
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.goto(url, wait_until='load')
    pg.wait_for_timeout(150)
    ow = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
    if ow > 1: issues.append((tag, url, f'horizontal overflow {ow}px'))
    fonts_ok = pg.evaluate("document.fonts.check('16px \"IBM Plex Sans\"') && document.fonts.check('700 30px Archivo')")
    if not fonts_ok and url.startswith('http'): issues.append((tag, url, 'fonts not loaded'))
    if shot: pg.screenshot(path=str(shots / f'{shot}.png'))
    for e in errs: issues.append((tag, url, e[:200]))
    pg.remove_listener('console', pg.listeners('console')[0]) if hasattr(pg, 'listeners') else None

all_pages = sorted(str(p.relative_to(site)) for p in site.rglob('*.html'))
sample = [p for p in all_pages if p.count('/') == 0] + [p for p in all_pages if p.startswith('chapters/05-')] + [p for p in all_pages if p.startswith('chapters/16-')][:3]
with sync_playwright() as pw:
    b = pw.chromium.launch()
    for tag, vp, scheme in [('desk-light', (1440, 900), 'light'), ('phone-dark', (390, 844), 'dark'), ('tablet-light', (820, 1100), 'light'), ('desk-dark', (1440, 900), 'dark')]:
        ctx = b.new_context(viewport={'width': vp[0], 'height': vp[1]}, color_scheme=scheme)
        pg = ctx.new_page()
        errs = []
        pg.on('console', lambda m, errs=errs: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e, errs=errs: errs.append('PAGEERROR ' + str(e)))
        targets = all_pages if (full and tag in ('desk-light', 'phone-dark')) else sample
        for rel in targets:
            errs.clear()
            pg.goto(BASE + rel, wait_until='load')
            ow = pg.evaluate('document.documentElement.scrollWidth - document.documentElement.clientWidth')
            if ow > 1: issues.append((tag, rel, f'horizontal overflow {ow}px'))
            for e in errs: issues.append((tag, rel, e[:200]))
        # fonts
        pg.goto(BASE + 'index.html', wait_until='load'); pg.wait_for_timeout(300)
        if not pg.evaluate("document.fonts.check('16px \"IBM Plex Sans\"') && document.fonts.check('800 40px Archivo')"): issues.append((tag, 'index', 'fonts not loaded'))
        pg.screenshot(path=str(shots / f'{tag}-home.png'))
        pg.screenshot(path=str(shots / f'{tag}-home-full.png'), full_page=True)
        # lesson with diagram
        les = [p for p in all_pages if p.startswith('chapters/05-') and re.search(r'/0[2]-', p)][0]
        pg.goto(BASE + les, wait_until='load'); pg.wait_for_timeout(200)
        pg.screenshot(path=str(shots / f'{tag}-lesson.png'))
        fig = pg.query_selector('figure.diagram')
        if fig: fig.scroll_into_view_if_needed(); pg.wait_for_timeout(100); pg.screenshot(path=str(shots / f'{tag}-diagram.png'))
        # mark read via next link
        pg.click('.pg-next'); pg.wait_for_load_state('load')
        # chapter overview
        pg.goto(BASE + 'chapters/05-caching/index.html', wait_until='load'); pg.screenshot(path=str(shots / f'{tag}-chapter.png'))
        # quiz: answer 3 questions with keyboard and clicks
        pg.goto(BASE + 'chapters/05-caching/quiz.html', wait_until='load')
        pg.click('.opt >> nth=0'); pg.wait_for_timeout(50)
        pg.screenshot(path=str(shots / f'{tag}-quiz.png'))
        pg.keyboard.press('Enter'); pg.keyboard.press('2'); pg.keyboard.press('Enter')
        n = pg.evaluate("document.querySelectorAll('.qbar i.ok, .qbar i.no').length")
        if n != 2: issues.append((tag, 'quiz', f'expected 2 answered, got {n}'))
        for i in range(13):
            pg.keyboard.press('1'); pg.keyboard.press('Enter')
        if not pg.query_selector('.score'): issues.append((tag, 'quiz', 'results not shown'))
        pg.screenshot(path=str(shots / f'{tag}-quiz-result.png'))
        # design page
        d = [p for p in all_pages if p.startswith('chapters/05-') and '/design-' in p][0]
        pg.goto(BASE + d, wait_until='load')
        pg.click('#mock-btn'); pg.click('[data-reveal-btn="clarify"]'); pg.click('#hint-btn'); pg.click('#hint-btn')
        pg.fill('#notes', 'Requirements: 100k RPS product page')
        pg.wait_for_timeout(1200)
        pg.screenshot(path=str(shots / f'{tag}-design.png'))
        pg.click('[data-reveal-btn="solution"]'); pg.wait_for_timeout(100)
        sol = pg.query_selector('[data-reveal="solution"] figure')
        if sol: sol.scroll_into_view_if_needed(); pg.screenshot(path=str(shots / f'{tag}-solution.png'))
        pg.click('[data-practiced]')
        pg.reload(wait_until='load')
        if pg.input_value('#notes') != 'Requirements: 100k RPS product page': issues.append((tag, 'design', 'notes not persisted'))
        if not pg.evaluate("document.querySelector('[data-practiced]').classList.contains('is-done')"): issues.append((tag, 'design', 'practiced not persisted'))
        # practice
        pg.goto(BASE + 'practice.html', wait_until='load'); pg.screenshot(path=str(shots / f'{tag}-practice.png'))
        pg.click('[data-mp-count="10"]'); pg.click('[data-mp="start"]')
        if not pg.query_selector('#practice-quiz .opt'): issues.append((tag, 'practice', 'quiz did not start'))
        # search
        pg.goto(BASE + 'search.html?q=consistent+hashing', wait_until='load'); pg.wait_for_timeout(100)
        cnt = pg.evaluate("document.querySelectorAll('.res').length")
        if cnt < 3: issues.append((tag, 'search', f'only {cnt} results'))
        pg.screenshot(path=str(shots / f'{tag}-search.png'))
        # bank filter
        pg.goto(BASE + 'designs.html', wait_until='load'); pg.click('[data-f-level="hard"]')
        vis = pg.evaluate("[...document.querySelectorAll('.d-card')].filter(c=>!c.hidden).length")
        if vis < 3: issues.append((tag, 'bank', f'filter shows {vis}'))
        # home after progress
        pg.goto(BASE + 'index.html', wait_until='load')
        if 'Continue' not in pg.inner_text('[data-continue]'): issues.append((tag, 'home', 'continue button not updated'))
        if vp[0] < 1024:
            pg.click('[data-toggle-side]'); pg.wait_for_timeout(300); pg.screenshot(path=str(shots / f'{tag}-drawer.png'))
        pg.goto(BASE + 'cheatsheet.html', wait_until='load'); pg.screenshot(path=str(shots / f'{tag}-cheatsheet.png'))
        # theme toggle
        pg.click('[data-theme-toggle]'); t1 = pg.evaluate("document.documentElement.getAttribute('data-theme')")
        pg.click('[data-theme-toggle]'); t2 = pg.evaluate("document.documentElement.getAttribute('data-theme')")
        if (t1, t2) != ('light', 'dark'): issues.append((tag, 'theme', f'toggle gave {t1},{t2}'))
        pg.reload(); t3 = pg.evaluate("document.documentElement.getAttribute('data-theme')")
        if t3 != 'dark': issues.append((tag, 'theme', 'not persisted'))
        ctx.close()
    # file:// smoke test
    ctx = b.new_context(viewport={'width': 1280, 'height': 800}); pg = ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    pg.goto((site / 'chapters/05-caching/quiz.html').as_uri()); pg.click('.opt >> nth=1')
    if not pg.query_selector('.explain'): issues.append(('file', 'quiz', 'quiz not working over file://'))
    pg.goto((site / 'search.html').as_uri() + '?q=kafka'); pg.wait_for_timeout(100)
    if pg.evaluate("document.querySelectorAll('.res').length") < 3: issues.append(('file', 'search', 'search not working over file://'))
    for e in errs: issues.append(('file', 'pageerror', e))
    ctx.close(); b.close()
srv.shutdown()
print(f'browser: {len(issues)} issues')
for i in issues[:40]: print('  ', i)
sys.exit(1 if (bad or issues) else 0)
