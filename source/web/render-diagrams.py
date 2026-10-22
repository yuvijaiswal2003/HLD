#!/usr/bin/env python3
"""Pre-render every Mermaid diagram in the course to static SVG, once for the light theme and once
for the dark theme, measured with the same self-hosted fonts the website uses.
Output: web/.cache/svg/<key>-l.svg, <key>-d.svg and web/.cache/svg/meta.json  (cached by key)."""
import json, subprocess, hashlib, pathlib, sys
from playwright.sync_api import sync_playwright

web = pathlib.Path(__file__).resolve().parent
root = web.parent
out = web / '.cache' / 'svg'
out.mkdir(parents=True, exist_ok=True)
tokens = json.loads((web / 'tokens.json').read_text())

# Collect every diagram (lessons + design solutions) via node.
js = r"""
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const dir=path.join(process.argv[1],'content');const seen={};
const walk=o=>{ if(Array.isArray(o)) o.forEach(walk); else if(o&&typeof o==='object'){ if(o.t==='diagram'){const k=crypto.createHash('sha1').update(o.code).digest('hex').slice(0,12); seen[k]=o.code;} Object.values(o).forEach(walk);} };
fs.readdirSync(dir).filter(f=>/^ch\d\d\.js$/.test(f)).forEach(f=>walk(require(path.join(dir,f))));
console.log(JSON.stringify(seen));
"""
res = subprocess.run(['node', '-e', js, str(root)], capture_output=True, text=True, check=True)
diagrams = json.loads(res.stdout)
theme_sig = hashlib.sha1((json.dumps(tokens, sort_keys=True) + 'v3').encode()).hexdigest()[:8]
meta_path = out / 'meta.json'
meta = json.loads(meta_path.read_text()) if meta_path.exists() else {}
if meta.get('_sig') != theme_sig:
    meta = {'_sig': theme_sig}
todo = [k for k in diagrams if not (k in meta and (out / f'{k}-l.svg').exists() and (out / f'{k}-d.svg').exists())]
print(f'{len(diagrams)} diagrams, {len(todo)} to render')

fonts = web / 'assets' / 'fonts'
font_css = f"""
@font-face{{font-family:'IBM Plex Sans';font-weight:400;src:url('{(fonts/'plex-sans-400.woff2').as_uri()}') format('woff2')}}
@font-face{{font-family:'IBM Plex Sans';font-weight:500;src:url('{(fonts/'plex-sans-500.woff2').as_uri()}') format('woff2')}}
@font-face{{font-family:'IBM Plex Sans';font-weight:600;src:url('{(fonts/'plex-sans-600.woff2').as_uri()}') format('woff2')}}
body{{font-family:'IBM Plex Sans',sans-serif}}
"""
mermaid_js = (root / 'node_modules/mermaid/dist/mermaid.min.js').read_text()

def theme_vars(t):
    return {
        'darkMode': t is tokens['dark'], 'background': t['surface'], 'fontFamily': '"IBM Plex Sans", system-ui, sans-serif', 'fontSize': '14px',
        'primaryColor': t['surface-2'], 'primaryTextColor': t['ink'], 'primaryBorderColor': t['line-strong'],
        'secondaryColor': t['accent-soft'], 'secondaryTextColor': t['ink'], 'secondaryBorderColor': t['line-strong'],
        'tertiaryColor': t['surface'], 'tertiaryTextColor': t['ink'], 'tertiaryBorderColor': t['line'],
        'lineColor': t['muted'], 'textColor': t['ink'], 'nodeTextColor': t['ink'], 'titleColor': t['ink'],
        'mainBkg': t['surface-2'], 'nodeBorder': t['line-strong'], 'clusterBkg': t['bg'], 'clusterBorder': t['line-strong'],
        'edgeLabelBackground': t['surface'],
        'actorBkg': t['surface-2'], 'actorBorder': t['line-strong'], 'actorTextColor': t['ink'], 'actorLineColor': t['line-strong'],
        'signalColor': t['ink'], 'signalTextColor': t['ink'], 'labelBoxBkgColor': t['surface-2'], 'labelBoxBorderColor': t['line-strong'],
        'labelTextColor': t['ink'], 'loopTextColor': t['ink'], 'noteBkgColor': t['amber-soft'], 'noteBorderColor': t['amber'],
        'noteTextColor': t['ink'], 'activationBkgColor': t['accent-soft'], 'activationBorderColor': t['accent'],
        'sequenceNumberColor': t['surface'],
    }

if todo:
    page_file = web / '.cache' / 'render.html'
    page_file.write_text(f'<!doctype html><html><head><meta charset="utf-8"><style>{font_css}</style></head><body><div id="host" style="width:1100px"></div><span style="font-weight:400">a</span><b>b</b></body></html>')
    with sync_playwright() as p:
        b = p.chromium.launch()
        pg = b.new_page(viewport={'width': 1200, 'height': 900})
        pg.goto(page_file.as_uri())
        pg.add_script_tag(content=mermaid_js)
        pg.evaluate("Promise.all([document.fonts.load('400 14px \"IBM Plex Sans\"'), document.fonts.load('600 14px \"IBM Plex Sans\"')])")
        assert pg.evaluate("document.fonts.check('14px \"IBM Plex Sans\"')"), 'font failed to load'
        for mode, tk in (('l', tokens['light']), ('d', tokens['dark'])):
            cfg = {
                'startOnLoad': False, 'securityLevel': 'strict', 'theme': 'base', 'themeVariables': theme_vars(tk),
                'flowchart': {'curve': 'basis', 'htmlLabels': True, 'padding': 12, 'nodeSpacing': 38, 'rankSpacing': 46, 'useMaxWidth': True},
                'sequence': {'useMaxWidth': True, 'mirrorActors': False, 'actorMargin': 46, 'messageFontSize': 13, 'noteFontSize': 13},
            }
            pg.evaluate('cfg => mermaid.initialize(cfg)', cfg)
            for i, k in enumerate(todo):
                r = pg.evaluate("""async ([code, id]) => {
                    try { const r = await mermaid.render(id, code, document.getElementById('host'));
                          const tmp = document.createElement('div'); tmp.innerHTML = r.svg; const s = tmp.querySelector('svg');
                          const vb = s.viewBox.baseVal; return { svg: r.svg, w: vb.width, h: vb.height }; }
                    catch (e) { return { err: String(e && e.message || e) }; } }""", [diagrams[k], f'm{k}{mode}'])
                if 'err' in r:
                    print('FAIL', k, r['err'][:200]); sys.exit(1)
                (out / f'{k}-{mode}.svg').write_text(r['svg'])
                if mode == 'l':
                    meta[k] = {'w': round(r['w']), 'h': round(r['h'])}
                if (i + 1) % 40 == 0:
                    print(f'  {mode}: {i + 1}/{len(todo)}')
        b.close()
    meta_path.write_text(json.dumps(meta))
print('done:', len([k for k in meta if k != '_sig']), 'diagrams cached')
