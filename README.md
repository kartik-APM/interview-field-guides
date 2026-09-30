# SDA Field Guides

A React + JavaScript study app containing five Senior SWE **System Design & Architecture (SDA)** field guides: calendaring, trending shares, metrics monitoring, distributed key-value storage, and rolling Top-N requests.

**Live demo:** https://sda-guide.netlify.app/

## Features

**Guides & navigation**
- Five complete SDA field guides on a dashboard with per-question cards, categories, and numbering.
- Client-side routing with a dedicated URL per guide, in-guide section links, and working browser back/forward.
- Deep links to any section (for example `/guides/trending-shares#final-design`) that scroll into view on load.
- Collapsible section sidebar that highlights the section you are viewing.

**Active studying**
- Four-color text highlighter (yellow / red / green / blue) with recoloring, single removal, per-guide clearing, and automatic overlap merging.
- Rehearsal checklists with a live "N of M covered" progress count.
- Expand or collapse all answers at once.
- Print / save-to-PDF that temporarily expands collapsed answers and hides the app chrome.
- Full-size, zoomable diagram viewer for whiteboard SVGs and the calendaring HLD image, dismissable with `Escape` and returning focus to the trigger.
- Highlights and checklist progress persist per guide in the browser and are validated against the content, so stale marks are never painted onto changed text.

**Content integrity**
- Guide content is imported from the canonical HTML originals and rendered as a vetted element tree — no iframes and no executed HTML scripts.
- The importer rejects scripts, inline event handlers, unexpected tags, and non-embedded media; scopes guide CSS to the reader; rewrites local links; and hashes content for change detection.
- The original HTML guides are never modified by the app.

**Runs anywhere, privately**
- Fully offline after install: no runtime CDN scripts, remote fonts, or analytics. External reference links are the only network use.
- Dev and preview servers bind to `127.0.0.1` only.
- Responsive from 320px to desktop, with ARIA roles and keyboard support on the reader controls.

**Quality**
- Unit tests (`node:test`) for content fidelity and highlight logic, plus a headless-Chrome workflow test covering routing, reader controls, persistence, diagram zoom, responsive layout, and print — asserting zero external requests and zero console errors.

## Run locally

Requires Node.js **20.19+** in the Node 20 line, or **22.12+**.

```bash
npm ci --ignore-scripts
npm run dev
```

Open **http://127.0.0.1:5173**. The server binds only to your machine.

```bash
npm test
npm run build
npm run preview
```

The production preview runs at **http://127.0.0.1:4173**.

## Deploy

The app is a static single-page build; the live demo runs on **Netlify** at https://sda-guide.netlify.app/.

```bash
npm ci --ignore-scripts
npm run build      # static assets output to dist/
```

Publish the `dist/` directory. Because the app uses client-side routing, the host must serve `index.html` for unknown paths so bookmarked or refreshed `/guides/...` URLs resolve. This repo ships `public/_redirects` (copied to `dist/_redirects` by the build) with the Netlify SPA rule:

```
/*    /index.html    200
```

For other static hosts, configure the equivalent history-API fallback. On Netlify, set the build command to `npm run build` and the publish directory to `dist`.

## Reader features

- Separate guide routes, section links, and browser back/forward navigation.
- Original guide content, source references, tables, and diagrams.
- Four-color highlights with recoloring, individual removal, and clearing per guide.
- Rehearsal checklists saved per guide.
- Expand/collapse all answers and print/save-to-PDF, including collapsed answers.
- Full-size SVG and calendaring HLD image dialogs with keyboard dismissal.
- Responsive layouts and no runtime CDN scripts, fonts, analytics, or remote assets.

After dependencies are installed, the app works without internet while a local server is running. External reference links still require network access.

## Content and source files

The HTML originals are **not modified**. Their content is imported as a vetted element tree and rendered by React components, not embedded in iframes or executed as HTML scripts. React owns the controls, highlights, and progress. Original styles are scoped to the guide reader.

The generated `src/content/` files are included, so the project runs independently of the original folder. To refresh them after editing the originals:

```bash
npm run import:guides
# Or choose a different source folder:
npm run import:guides -- "/path/to/SDA Problems"
```

The default source folder is `../SDA Problems`. The importer accepts only the five configured guides, preserves their content, rewrites local guide links, and rejects scripts, inline event handlers, unexpected elements, and non-embedded media.

Highlights and progress use browser `localStorage`. Existing highlights on the original `file://` HTML pages are **not automatically migrated**: browser origin isolation prevents the app from accessing that storage. Those original highlights remain untouched. The React app starts its own saved reading state; using another host or port also creates a separate browser-storage origin.

If imported content changes, stale highlights are not painted onto different text. The next explicit edit keeps a local backup of the previous saved state. Storage failures are displayed rather than silently reported as saved.

## Browser checks

With the app running, the optional browser suite uses an existing local Chrome installation and a temporary, isolated profile:

```bash
npm run test:browser -- http://127.0.0.1:5173
```

On systems without the default macOS Chrome path, set `CHROME_BIN` to the Chrome executable. No browser or third-party test plugin is downloaded.

## Project structure

`src/components/` contains the reusable React reader, document renderer, highlighter, and diagram dialog. `src/lib/` contains testable content/highlight logic. `scripts/import-guides.mjs` is the one-way HTML-to-content importer. `tests/` covers content fidelity, reader state, and browser workflows.

The guides contain internal interview source material. Keep the app local or deploy it only to an authorized private environment.
