# HLD Ladder: source

Everything needed to change the website. The published site lives at the repository root; this folder holds what it is built from.

| Path | What it is |
|---|---|
| `content/chNN.js` | One file per chapter: lessons, takeaways, MCQs and design problems |
| `SPEC.md` | The content format (block types, MCQ and design-problem shape, diagram rules) |
| `CURRICULUM.md` | What each chapter covers |
| `validate.js` | Checks content against the format |
| `web/` | Site generator, styles, scripts, fonts and theme colours |

## Change something and republish

Requirements: Node 18+, Python 3 with Playwright (`pip install playwright && playwright install chromium`).

```bash
cd source
npm install                 # once
# edit content/chNN.js (or web/assets/site.css, site.js ...)
node validate.js            # must print OK for every chapter
python3 web/render-diagrams.py   # draws any new or changed diagrams
node web/build-site.js      # writes the site to source/site/
python3 web/test-site.py    # optional: link and browser checks
# copy the build to the repository root and publish
rsync -a --delete --exclude source --exclude .git --exclude .nojekyll site/ ../
cd .. && git add -A && git commit -m "Update course" && git push
```

GitHub Pages republishes automatically about a minute after the push.

## Adding a chapter

Create `content/ch18.js` following `SPEC.md` (pick a `part` from 1–7, or extend `PARTS` in `web/build-site.js` for a new part), then run the steps above. The home page, sidebar, search, practice and design bank pick it up automatically.
