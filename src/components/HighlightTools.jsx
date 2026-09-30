import React, { useEffect, useRef } from "react";
import { COLORS } from "../lib/highlights.js";

export default function HighlightTools({
  selection, edit, records, menuOpen, setMenuOpen, onColor, onRemove,
  onClear, closePopovers,
}) {
  const menuRef = useRef(null);
  useEffect(() => {
    function outside(event) {
      if (event.target.closest("[data-highlight-tools]")) return;
      setMenuOpen(false);
      closePopovers();
    }
    function escape(event) {
      if (event.key === "Escape") {
        closePopovers(true);
        setMenuOpen(false);
      }
    }
    const hide = () => { closePopovers(); setMenuOpen(false); };
    document.addEventListener("mousedown", outside);
    document.addEventListener("keydown", escape);
    window.addEventListener("resize", hide);
    window.addEventListener("scroll", hide, true);
    return () => {
      document.removeEventListener("mousedown", outside);
      document.removeEventListener("keydown", escape);
      window.removeEventListener("resize", hide);
      window.removeEventListener("scroll", hide, true);
    };
  }, [closePopovers, setMenuOpen]);

  const active = selection || edit;
  const overlap = selection
    ? records.filter(record => record.start < selection.end && selection.start < record.end)
    : [];
  const rect = active?.rect;
  const left = rect ? Math.max(8, Math.min(rect.left + rect.width / 2 - 122, window.innerWidth - 252)) : 0;
  const top = rect ? Math.max(8, Math.min(rect.top > 100 ? rect.top - 52 : rect.bottom + 8, window.innerHeight - 60)) : 0;
  return <>
    {active && <div className="app-highlight-popover" data-highlight-tools
      role="toolbar" aria-label={selection ? "Highlight selected text" : "Change highlight"}
      style={{ left, top }} onMouseDown={event => event.preventDefault()}>
      {COLORS.map(color => <button key={color.id} type="button" className="app-color"
        style={{ backgroundColor: color.background }} aria-label={color.label}
        title={color.label} onClick={() => onColor(color.id)} />)}
      <button type="button" className="app-remove-highlight"
        aria-label={selection ? "Remove highlights from selected text" : "Remove highlight"}
        disabled={Boolean(selection && !overlap.length)}
        onClick={() => onRemove(selection ? overlap.map(record => record.id) : [edit.id])}
      >{selection ? "\u00d7" : "Remove"}</button>
    </div>}
    <div id="highlight-menu" className="app-highlight-menu" data-highlight-tools
      role="menu" aria-label="Highlighter options" ref={menuRef} hidden={!menuOpen}>
      <strong>Highlights</strong>
      <p>{records.length ? `${records.length} highlight${records.length === 1 ? "" : "s"} on this guide` : "No highlights yet."}</p>
      <p>Select text, then choose a color. Click a highlight to recolor or remove it.</p>
      <button type="button" role="menuitem" disabled={!records.length} onClick={onClear}>Clear this guide's highlights</button>
    </div>
  </>;
}
