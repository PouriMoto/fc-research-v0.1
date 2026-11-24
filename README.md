# Finance City — Research Desk

A mobile-first, offline-capable (PWA) research workspace for the Finance City curriculum.
Plain HTML + CSS + ES modules. **No build step, no dependencies.**

* Browse the curriculum outline (learning loop, five layers, tracks and lessons, production roadmap).
* Open a research pack per lesson, work through the steps, write notes and scenarios, attach images.
* Export Markdown (per lesson, all lessons, or the outline), print/PDF, JSON backup/restore.
* Everything is stored on the device (localStorage + IndexedDB). Nothing is sent to a server.

## Run locally

```bash
python3 -m http.server 8000   # any static server works
# open http://localhost:8000
```

## Deploy on GitHub Pages

1. Create a repository and push this folder to the `main` branch.
2. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**
   (the workflow in `.github/workflows/pages.yml` publishes the site on every push).
   Alternative without the workflow: Source = *Deploy from a branch*, branch `main`, folder `/ (root)`.
3. Open `https://<user>.github.io/<repo>/` on your phone and use *Add to Home Screen*.

All URLs are relative, so project sites under a sub-path work without configuration.
After changing files, bump `VERSION` in `sw.js` so installed copies refresh.

## Project layout

```
index.html              app shell
css/app.css             editorial theme (light/dark), logical properties (RTL/LTR safe)
js/
  main.js               bootstrap, router, exports, theme, PWA hooks
  views.js              outline, desk (workspace), tools, export pages
  blocks.js             renders declarative step blocks to DOM
  doc.js                lesson/outline -> intermediate doc -> Markdown / printable DOM
  store.js              state (localStorage) + image store (IndexedDB)
  progress.js           progress, status, defaults
  content.js            content loader + template tokens
  ai.js, util.js, icons.js
content/<lang>/         ALL human-readable text (no text lives in code)
  ui.json               interface strings
  curriculum.json       learning loop, layers, tracks/lessons, roadmap
  flows.json            research steps as declarative blocks
  library.json          preset topics, questions, sources, keywords, checklists
  prompts.json          AI prompt templates
sw.js, manifest.webmanifest, assets/
```

## Editing content

* **Add or rename a lesson**: edit `content/fa/curriculum.json` (`tracks[].lessons[]`).
  Lesson ids must stay stable (they key the saved data).
* **Give a lesson preset topics/sources/questions**: add a pack under `packs` in `library.json`
  and set `"pack": "<name>"` on the lesson.
* **Change research steps**: edit `flows.json`. Steps are lists of blocks:
  `callout`, `card`, `stats`, `fields`, `picker`, `checklist`, `sources`, `keywords`, `links`,
  `log`, `images`, `columns`, `slot`, `actions`. Flows (`standard`, `history`) choose step order.
* **Template tokens** in step text: `{lesson.title}`, `{lesson.code}`, `{lesson.english}`, `{track.title}`, `{today}`.

## Adding a language

Copy `content/fa` to `content/<lang>`, translate the JSON, set `meta.lang`, `meta.dir`, `meta.locale`
in `ui.json`, and change `DEFAULT_LANG` in `js/content.js`.

## Notes

* Browsers may evict site data under storage pressure; use **Export → JSON backup** regularly.
* The optional AI request from the *Assistant* page sends data to the endpoint you type.
  A page served over https cannot call plain `http://localhost` endpoints.
