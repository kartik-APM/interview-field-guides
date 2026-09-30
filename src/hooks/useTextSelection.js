import { useCallback, useEffect, useState } from "react";
import { DOM_EXCLUSIONS } from "../lib/content.js";

function eligibleText(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      return node.nodeValue && !node.parentElement.closest(DOM_EXCLUSIONS)
        ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    },
  });
  const nodes = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node);
  return nodes;
}

function boundaryOffset(nodes, container, offset) {
  const point = document.createRange();
  point.setStart(container, offset);
  point.collapse(true);
  let total = 0;
  for (const node of nodes) {
    if (point.comparePoint(node, node.length) <= 0) {
      total += node.length;
    } else if (point.comparePoint(node, 0) >= 0) {
      return total;
    } else {
      return total + (container === node ? offset : 0);
    }
  }
  return total;
}

export function useTextSelection(rootRef) {
  const [selection, setSelection] = useState(null);
  useEffect(() => {
    let timer;
    function inspect() {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const native = window.getSelection();
        const root = rootRef.current;
        if (!root || !native?.rangeCount || native.isCollapsed ||
            document.querySelector("#diagram-viewer[open]")) {
          setSelection(null);
          return;
        }
        const range = native.getRangeAt(0);
        const container = range.commonAncestorContainer;
        const element = container.nodeType === Node.ELEMENT_NODE ? container : container.parentElement;
        if (!root.contains(element) || element.closest(DOM_EXCLUSIONS)) {
          setSelection(null);
          return;
        }
        const nodes = eligibleText(root);
        const start = boundaryOffset(nodes, range.startContainer, range.startOffset);
        const end = boundaryOffset(nodes, range.endContainer, range.endOffset);
        const rect = range.getBoundingClientRect();
        setSelection(end > start && rect.width && rect.height
          ? { start, end, rect: { left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom, width: rect.width } }
          : null);
      }, 0);
    }
    const clear = () => setSelection(null);
    document.addEventListener("mouseup", inspect);
    document.addEventListener("keyup", inspect);
    window.addEventListener("resize", clear);
    window.addEventListener("scroll", clear, true);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("mouseup", inspect);
      document.removeEventListener("keyup", inspect);
      window.removeEventListener("resize", clear);
      window.removeEventListener("scroll", clear, true);
    };
  }, [rootRef]);
  const clearSelection = useCallback((clearRange = true) => {
    if (clearRange) window.getSelection()?.removeAllRanges();
    setSelection(null);
  }, []);
  return [selection, clearSelection];
}
