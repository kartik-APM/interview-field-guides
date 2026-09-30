import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { Link, useLocation } from "react-router-dom";
import GuideDocument from "./GuideDocument.jsx";
import DiagramDialog from "./DiagramDialog.jsx";
import HighlightTools from "./HighlightTools.jsx";
import { prepareDocument } from "../lib/content.js";
import { addHighlight } from "../lib/highlights.js";
import { useReaderState } from "../hooks/useReaderState.js";
import { useTextSelection } from "../hooks/useTextSelection.js";

export default function GuideReader({ source }) {
  const document = useMemo(() => prepareDocument(source), [source]);
  const location = useLocation();
  const contentRef = useRef(null);
  const triggerRef = useRef(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [details, setDetails] = useState(() => Object.fromEntries(document.details.map(item => [item.id, item.open])));
  const [diagram, setDiagram] = useState(null);
  const [edit, setEdit] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [actionError, setActionError] = useState("");
  const { value, update, warning } = useReaderState(document);
  const [selection, clearSelection] = useTextSelection(contentRef);
  const closePopovers = useCallback((clearRange = false) => {
    setEdit(null);
    clearSelection(clearRange);
  }, [clearSelection]);
  const stateRef = useRef(details);
  stateRef.current = details;

  const setAllDetails = useCallback(open => {
    setDetails(Object.fromEntries(source.details.map(item => [item.id, open])));
  }, [source]);

  useLayoutEffect(() => {
    window.document.title = `${source.title} | SDA Field Guides`;
    let fragment;
    try { fragment = decodeURIComponent(location.hash.slice(1)); }
    catch { fragment = ""; }
    const frame = requestAnimationFrame(() => {
      if (fragment) {
        window.document.getElementById(fragment)?.scrollIntoView({ block: "start" });
      } else {
        window.scrollTo({ top: 0, behavior: "instant" });
        window.document.getElementById("main")?.focus({ preventScroll: true });
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [source.title, location.pathname, location.hash]);

  useEffect(() => {
    let saved = null;
    function beforePrint() {
      if (saved === null) saved = stateRef.current;
      flushSync(() => { setAllDetails(true); setDiagram(null); setEdit(null); setMenuOpen(false); });
    }
    function afterPrint() {
      if (saved !== null) {
        const original = saved;
        saved = null;
        flushSync(() => setDetails(original));
      }
    }
    window.addEventListener("beforeprint", beforePrint);
    window.addEventListener("afterprint", afterPrint);
    return () => {
      window.removeEventListener("beforeprint", beforePrint);
      window.removeEventListener("afterprint", afterPrint);
    };
  }, [setAllDetails]);

  function colorHighlight(color) {
    try {
      const highlights = selection
        ? addHighlight(value.highlights, selection, color, document.text, crypto.randomUUID())
        : value.highlights.map(record => record.id === edit?.id ? { ...record, color } : record);
      update({ ...value, highlights });
      clearSelection();
      setEdit(null);
      setActionError("");
    } catch (error) {
      setActionError(error.message);
    }
  }
  function removeHighlights(ids) {
    update({ ...value, highlights: value.highlights.filter(record => !ids.includes(record.id)) });
    clearSelection();
    setEdit(null);
  }
  const reader = {
    highlights: value.highlights,
    checks: value.checks,
    details,
    checkedCount: document.checks.filter(check => value.checks[check.id]).length,
    checkCount: document.checks.length,
    setCheck: (id, checked) => update({ ...value, checks: { ...value.checks, [id]: checked } }),
    setDetail: (id, open) => setDetails(current => current[id] === open ? current : { ...current, [id]: open }),
    setAllDetails,
    editHighlight: (id, rect) => {
      clearSelection();
      setMenuOpen(false);
      setEdit({ id, rect: { left: rect.left, top: rect.top, bottom: rect.bottom, width: rect.width } });
    },
    showDiagram: (id, trigger) => {
      const node = document.byId[id];
      if (!node || !["svg", "img"].includes(node.tag)) {
        setActionError("This diagram could not be opened.");
        return;
      }
      triggerRef.current = trigger;
      clearSelection();
      setEdit(null);
      setMenuOpen(false);
      setDiagram({ id, node });
    },
  };

  return <>
    <style>{document.styles}</style>
    <header className="app-toolbar">
      <Link className="app-button" to="/">{"\u2190"} All questions</Link>
      <button type="button" aria-controls="guide-sidebar" aria-expanded={sidebarOpen}
        onClick={() => setSidebarOpen(open => !open)}>
        {sidebarOpen ? "Hide sidebar" : "Show sidebar"}
      </button>
      <button type="button" data-highlight-tools aria-controls="highlight-menu" aria-haspopup="menu"
        aria-expanded={menuOpen} onClick={() => {
          clearSelection();
          setEdit(null);
          setMenuOpen(open => !open);
        }}>Highlights</button>
      <span className="app-toolbar-label">System design field guide</span>
    </header>
    {(warning || actionError) && <div className="app-notice" role="status">{actionError || warning}</div>}
    <div className={`app-layout${sidebarOpen ? "" : " app-layout-collapsed"}`}>
      <aside className="app-sidebar" id="guide-sidebar" hidden={!sidebarOpen}
        aria-label="Guide sections" onKeyDown={event => {
          if (event.key === "Escape") {
            setSidebarOpen(false);
            window.document.querySelector('[aria-controls="guide-sidebar"]')?.focus();
          }
        }}>
        <div className="app-eyebrow">System design field guide</div>
        <div className="app-sidebar-title">{document.title}</div>
        <p>Senior IC3 preparation<br />Target: Above Expectations</p>
        <nav aria-label="Study guide sections">
          <Link to="/">All questions</Link>
          {document.navigation.map((item, index) => item.type === "group"
            ? <div className="app-nav-group" key={index}>{item.label}</div>
            : <Link key={index} to={item.href}
              aria-current={(location.hash || "#overview") === item.href ? "location" : undefined}
            >{item.label}</Link>)}
        </nav>
        <div className="app-sidebar-note">Highlights and rehearsal progress are saved per guide in this browser.</div>
      </aside>
      <main id="main" tabIndex={-1} className="app-reader-main">
        <GuideDocument document={document} reader={reader} contentRef={contentRef} />
      </main>
    </div>
    <HighlightTools selection={selection} edit={edit} records={value.highlights}
      menuOpen={menuOpen} setMenuOpen={setMenuOpen} onColor={colorHighlight}
      onRemove={removeHighlights} closePopovers={closePopovers}
      onClear={() => {
        if (window.confirm("Remove all highlights from this guide?")) {
          update({ ...value, highlights: [] });
          setMenuOpen(false);
        }
      }} />
    <DiagramDialog diagram={diagram} onClose={() => setDiagram(null)} triggerRef={triggerRef} />
  </>;
}
