import React, { useEffect, useRef } from "react";
import { collectIds, plainText } from "../lib/content.js";
import { DocumentNode } from "./GuideDocument.jsx";

export default function DiagramDialog({ diagram, onClose, triggerRef }) {
  const dialogRef = useRef(null);
  const closeRef = useRef(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (diagram) {
      if (!dialog.open) dialog.showModal();
      closeRef.current.focus();
    } else if (dialog.open) {
      dialog.close();
      triggerRef.current?.focus({ preventScroll: true });
    }
  }, [diagram, triggerRef]);

  let title = "Full-size diagram";
  let expanded;
  if (diagram) {
    const node = diagram.node;
    const titleNode = node.children?.find(child => child.tag === "title");
    title = titleNode ? plainText(titleNode.children) : "High-level design diagram";
    const width = node.tag === "svg"
      ? Number(String(node.props.viewBox).split(/\s+/)[2])
      : 1800;
    expanded = {
      ...node,
      props: { ...node.props, style: { ...node.props.style, width, height: "auto", maxWidth: "none" } },
    };
  }
  return (
    <dialog id="diagram-viewer" className="app-diagram-dialog" ref={dialogRef}
      aria-labelledby="diagram-viewer-title"
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left || event.clientX > box.right ||
            event.clientY < box.top || event.clientY > box.bottom) onClose();
      }}
    >
      <div className="app-dialog-header">
        <strong id="diagram-viewer-title">{title}</strong>
        <button type="button" ref={closeRef} onClick={onClose}>Close</button>
      </div>
      <div className="app-diagram-scroll" tabIndex={0} role="region"
        aria-label="Full-size diagram; scroll to explore">
        {expanded && <div className="guide-document">
          <DocumentNode node={expanded} prefix={`zoom-${diagram.id}-`} ids={collectIds(expanded)} />
        </div>}
      </div>
    </dialog>
  );
}
