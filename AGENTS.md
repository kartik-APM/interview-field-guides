# AGENTS.md

Guidance for AI agents and developers working in this repository.

## What this project is

A local, offline-friendly **React + JavaScript (Vite)** study app that renders five Senior SWE **System Design & Architecture (SDA)** field guides: calendaring, trending shares, metrics monitoring, distributed key-value store, and rolling Top-N requests.

The guide *content* is not authored in this repo. It is **imported** from standalone HTML files that live in a sibling folder (`../SDA Problems`), converted into a vetted, serializable element tree, and rendered by React components. React owns all interactivity (routing, highlights, checklist progress, diagram zoom, print).

## Prerequisites

- **Node.js `^20.19.0 || >=22.12.0`** (Vite 8 requirement; see `package.json` `engines`).
- A local Chrome install for the optional browser test (`/Applications/Google Chrome.app/...`, or set `CHROME_BIN`).
- No network access is needed to run the app after `npm install`. Do not add runtime CDN scripts, remote fonts, or analytics.

## Commands

```bash
npm ci --ignore-scripts        # install pinned deps (there are no install scripts by design)
npm run dev                    # Vite dev server at http://127.0.0.1:5173 (localhost-only)
npm run build                  # production build to dist/
npm run preview                # serve the built app at http://127.0.0.1:4173 (SPA fallback on)
npm test                       # node:test unit suites (content + highlights) — run before finishing
npm run test:browser -- http://127.0.0.1:4173   # headless-Chrome workflow test; needs a running server
npm run import:guides          # regenerate src/content/** from ../SDA Problems
npm run import:guides -- "/path/to/SDA Problems"  # import from a different source folder
```

Always run `npm test` before considering a change complete. `npm run build` must succeed. If you touch anything the browser suite covers (routing, sidebar, details, checklist, diagram dialog, highlighter, responsive/print), start a server and run `test:browser` too.

## Architecture

```
scripts/import-guides.mjs   One-way HTML -> content importer (build-time only; not shipped).
src/content/                GENERATED. catalog.json + guides/<id>.json. Do not hand-edit.
src/lib/content.js          prepareDocument (text offsets), diagram id/marker remapping, exclusions.
src/lib/highlights.js       Pure highlight merge/render/validation logic (heavily unit-tested).
src/hooks/useReaderState.js localStorage load/validate/save for highlights + checklist.
src/hooks/useTextSelection.js  Maps a DOM selection to stable character offsets in the content text.
src/components/GuideReader.jsx    Top-level reader: toolbar, sidebar, state wiring, print handling.
src/components/GuideDocument.jsx  Renders the imported tree; wires buttons/details/checkboxes/marks.
src/components/DiagramDialog.jsx  Full-size <dialog> for zooming SVG / embedded-image diagrams.
src/components/HighlightTools.jsx Selection popover, edit popover, and Highlights menu.
src/App.jsx / src/main.jsx  Router, dashboard (catalog), lazy per-guide loading.
tests/                      content.test.js, highlights.test.js (node:test), browser.mjs (CDP).
```

## Key concepts you must respect

### 1. `../SDA Problems` HTML files are the source of truth
- The five `senior-ic3-*.html` files (and `index.html`) in the sibling `SDA Problems` folder are the canonical content. **Do not modify them from this repo** to change the app; edit content there, then re-run `npm run import:guides`.
- `src/content/**` is **generated**. Never hand-edit those JSON files — your changes will be overwritten and they bypass the importer's safety checks. Regenerate instead.
- The guide **order and numbering** on the dashboard come from the `definitions` array in `scripts/import-guides.mjs` (each guide's `number` is its index + 1). To reorder, edit that array and re-import; also update the expected order in `tests/content.test.js` and, if you want them consistent, the card order in `../SDA Problems/index.html`.

### 2. The importer sanitizes and transforms — keep it strict
`scripts/import-guides.mjs` intentionally **rejects** `<script>`, inline `on*` handlers, unexpected tags, and non-`data:` media. It also:
- scopes every guide CSS rule under `.guide-document` (so guide styles can't leak into the app shell),
- rewrites local guide links (`senior-ic3-*.html#frag` -> `/guides/<id>#frag`, `index.html` -> `/`),
- strips the `js-only` class (React always runs), and
- records `sourceHash`, `textHash`, checklist ids, and section ids.

If you extend the guides with a new tag/attribute, update the importer's allowlists deliberately — do not loosen the script/handler/media rejections.

### 3. Highlight offsets depend on a stable text model
- Highlights are stored as `{start, end, color, text}` **character offsets** into the guide's concatenated visible text (see `prepareDocument` and `DOM_EXCLUSIONS` in `src/lib/content.js`). Excluded regions (svg, buttons, summaries, inputs, `#check-progress`, `[data-no-highlight]`, `.toolbar`, `.diagram-actions`) are **not** part of that text and cannot be highlighted.
- Persisted reader state is validated against the current `textHash` (`validateReaderState`). If content changes, stale highlights are **not** repainted onto different text; the next edit keeps a `:backup:` copy. Preserve this behavior — silently remapping offsets onto changed text would mis-highlight.
- Keep `src/lib/highlights.js` pure and covered by `tests/highlights.test.js`. Merge logic must be transitive without swallowing gaps.

### 4. Diagram dialog re-prefixes ids
Guide SVGs use internal ids and `url(#marker)` / `aria-labelledby` references. When cloned into the zoom `<dialog>`, all ids and references are re-prefixed (`remapDiagramProps` in `src/lib/content.js`) so the duplicated DOM stays valid and unique. Don't render a diagram twice without prefixing.

### 5. Routing is SPA with fragment scrolling
`react-router-dom` (BrowserRouter). Deep links like `/guides/top-n-requests#final-design` scroll to the section after mount. Any static host must rewrite unknown routes to `index.html` (Vite dev/preview already do).

## Conventions

- **Plain JavaScript + JSX. No TypeScript.** Match the existing style.
- **Dependencies are pinned** (exact versions in `package.json`). Don't add dependencies for things achievable with the standard library / existing tools, and don't introduce a component or CSS framework — styling is hand-written in `src/styles.css` plus scoped guide CSS.
- Generated files (`dist/`, `node_modules/`) and editor cruft are gitignored. Do not commit them.
- Importer output is written ASCII-only (`encode("ascii", "xmlcharrefreplace")` equivalent via the guide build) — keep content ASCII-safe.
- The dev/preview servers bind to `127.0.0.1` only. Keep it that way; this content is internal.

## Testing notes / gotchas

- **`tests/browser.mjs` speaks CDP over a pipe.** When you `Runtime.evaluate` a setup expression that *returns* a Promise while using `awaitPromise: true`, CDP will await that promise. For fire-and-forget setup (e.g. registering a `close` listener), end the expression with `; true;` so it resolves immediately. Only the line that should *wait* (e.g. `await evaluate("window.__closed")`) may return a pending promise.
- **Rebuild before `preview`** if you changed source: `vite preview` serves `dist/`, not live source. Use `dev` for live editing.
- **localStorage is origin-scoped.** The app cannot read highlights saved on the original `file://` HTML pages, and different host/port = different storage. This is expected; don't try to "migrate" across origins.
- Avoid in-page `requestAnimationFrame` awaits in headless tests (rAF can be throttled); use a short timer settle instead.
- The browser suite asserts **zero external network requests and zero console errors/warnings**. Keep the app free of remote calls and noisy logging.

## Security & privacy

The guides contain **internal interview preparation material**. Keep this app local, or deploy only to an authorized private environment. Do not publish the content or push it to third-party services. Do not commit secrets.

## Definition of done for a change here

1. `npm test` passes (content fidelity + highlight logic).
2. `npm run build` succeeds.
3. If UI/reader behavior changed: `npm run test:browser` passes against a running server.
4. Content changes were made in `../SDA Problems` and re-imported — not hand-edited in `src/content/`.
5. No new remote assets, no TypeScript, no unpinned deps, originals unmodified unless that was the explicit task.
