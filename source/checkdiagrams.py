#!/usr/bin/env python3
"""Parse-check every Mermaid diagram in the given chapters with the real Mermaid parser.
Usage: python3 checkdiagrams.py ch05 ch06   (no args = all chapters)"""
import json, subprocess, sys, pathlib
from playwright.sync_api import sync_playwright

root = pathlib.Path(__file__).parent
names = sys.argv[1:] or sorted(p.stem for p in (root / 'content').glob('ch[0-9][0-9].js'))

def diagrams(obj, where):
    if isinstance(obj, dict):
        if obj.get('t') == 'diagram':
            yield where, obj['code']
        for k, v in obj.items():
            yield from diagrams(v, f"{where}.{k}")
    elif isinstance(obj, list):
        for i, v in enumerate(obj):
            yield from diagrams(v, f"{where}[{i}]")

jobs = []
for n in names:
    out = subprocess.run(['node', '-e', f"console.log(JSON.stringify(require('./content/{n}.js')))"], cwd=root, capture_output=True, text=True)
    if out.returncode:
        print(f"✗ {n}: cannot load\n{out.stderr[:500]}"); continue
    ch = json.loads(out.stdout)
    for where, code in diagrams(ch, n):
        jobs.append((where, code))

mermaid_js = (root / 'node_modules/mermaid/dist/mermaid.min.js').read_text()
bad = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    pg = b.new_page()
    pg.set_content('<html><body><div id="x"></div></body></html>')
    pg.add_script_tag(content=mermaid_js)
    pg.evaluate("mermaid.initialize({startOnLoad:false, securityLevel:'strict'})")
    for i, (where, code) in enumerate(jobs):
        res = pg.evaluate("""async ([code, i]) => {
            try { const r = await mermaid.render('d' + i, code); return r.svg.length > 200 ? 'ok' : 'empty'; }
            catch (e) { document.querySelectorAll('[id^=dd]').forEach(n => n.remove()); return 'ERR ' + (e.message || String(e)).slice(0, 300); }
        }""", [code, i])
        if res != 'ok':
            bad += 1
            print(f"✗ {where}: {res}\n---\n{code}\n---")
    b.close()
print(f"{len(jobs) - bad}/{len(jobs)} diagrams render OK")
sys.exit(1 if bad else 0)
