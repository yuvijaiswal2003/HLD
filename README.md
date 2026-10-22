# HLD Ladder

A static website for learning high-level system design, from the basics to interview-ready.

- 17 chapters in 7 parts, 99 lessons, 167 diagrams
- 255 interview-style MCQs with explanations (chapter quizzes and mixed practice)
- 39 "design an application" problems with clarifying questions, hints, a 45-minute mock timer and model solutions
- A cheat sheet of every key takeaway, and full-text search

It is plain HTML, CSS and JavaScript with no build step and no external requests: fonts and diagrams are included. Progress, quiz scores and design notes are saved in each visitor's browser (localStorage).

## Open it locally

Double-click `index.html`. Everything works offline.

Some browsers (Firefox, Safari) block web fonts on pages opened straight from disk, so the text falls back to system fonts. For the full look, serve the folder instead:

```bash
cd hld-ladder
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploy it (free)

Any static host works. Upload the folder as it is.

**Netlify**: go to app.netlify.com/drop and drag the `hld-ladder` folder onto the page. You get a public URL in seconds.

**Vercel**: install the CLI (`npm i -g vercel`), then run `vercel deploy --prod` inside the folder. Choose "Other" as the framework and leave the build command empty.

**GitHub Pages**:
1. Create a repository and push the contents of this folder to the `main` branch (the `.nojekyll` file is already included).
2. In the repository, open Settings → Pages, set Source to "Deploy from a branch", choose `main` and `/ (root)`, and save.
3. The site appears at `https://<user>.github.io/<repo>/` after a minute.

**Cloudflare Pages**: create a project, choose "Direct upload" and upload the folder.

All links are relative, so the site works at a domain root or in a sub-folder.

## Site map

| Page | Path |
|---|---|
| Home and curriculum | `index.html` |
| Chapter overview | `chapters/NN-name/index.html` |
| Lesson | `chapters/NN-name/NN-lesson.html` |
| Chapter quiz | `chapters/NN-name/quiz.html` |
| Design problem | `chapters/NN-name/design-*.html` |
| Mixed practice | `practice.html` |
| Design bank | `designs.html` |
| Cheat sheet | `cheatsheet.html` |
| Search | `search.html` |

## Licences

Typefaces: IBM Plex Sans, IBM Plex Mono and Archivo, under the SIL Open Font License (see `assets/fonts/`).
