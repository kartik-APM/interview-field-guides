import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { createHash } from "node:crypto";
import { parse } from "parse5";
import postcss from "postcss";
import { prepareDocument, plainText, collectIds, remapDiagramProps } from "../src/lib/content.js";

const catalog = JSON.parse(await fs.readFile(new URL("../src/content/catalog.json", import.meta.url)));
const documents = await Promise.all(catalog.map(async guide =>
  JSON.parse(await fs.readFile(new URL(`../src/content/guides/${guide.id}.json`, import.meta.url))),
));
const hash = text => createHash("sha256").update(text).digest("hex");
function walk(nodes, visit) {
  for (const node of nodes) {
    visit(node);
    if (node.type === "element") walk(node.children, visit);
  }
}
function findHtml(node, tag) {
  if (node.tagName === tag) return node;
  for (const child of node.childNodes || []) {
    const found = findHtml(child, tag);
    if (found) return found;
  }
}
function htmlText(node) {
  return node.nodeName === "#text" ? node.value : (node.childNodes || []).map(htmlText).join("");
}

test("all five SDA guides are included, with their full content and controls", () => {
  assert.deepEqual(catalog.map(guide => guide.id), [
    "calendaring", "trending-shares", "metrics-monitoring", "distributed-kv-store", "top-n-requests",
  ]);
  for (const document of documents) {
    const ids = new Set();
    let checks = 0, details = 0, sections = 0, images = 0;
    walk(document.body, node => {
      if (node.type !== "element") return;
      assert(!["script", "iframe", "style"].includes(node.tag));
      assert(!Object.keys(node.props).some(prop => /^on/i.test(prop)));
      if (node.props.id) {
        assert(!ids.has(node.props.id), `Duplicate ID: ${node.props.id}`);
        ids.add(node.props.id);
      }
      if (node.tag === "button") {
        assert(["expand-details", "collapse-details", "print-guide"].includes(node.props.id) ||
          node.props["data-diagram"] || node.props["data-hld-image"], "Unwired reader button");
      }
      if (node.props.src) {
        assert(node.props.src.startsWith("data:image/"));
        images++;
      }
      if (node.checkId) checks++;
      if (node.detailId) details++;
      if (node.tag === "section") sections++;
    });
    assert.equal(checks, document.checklistCount);
    assert.equal(details, document.details.length);
    assert.equal(sections, document.sectionCount);
    assert(checks >= 14);
    assert.equal(images, document.id === "calendaring" ? 1 : 0);
    assert.equal(hash(plainText(document.body)), document.textHash, "Content text changed during conversion");
    for (const item of document.navigation)
      if (item.type === "link") assert(ids.has(item.href.slice(1)), item.href);
    for (const section of document.sections) assert(ids.has(section.id));
  }
});

test("original HTML source files remain unchanged when present", async t => {
  for (const document of documents) {
    const file = new URL(`../../SDA%20Problems/${document.sourceFile}`, import.meta.url);
    let raw;
    try { raw = await fs.readFile(file, "utf8"); }
    catch (error) {
      if (error.code !== "ENOENT") throw error;
      t.diagnostic(`Original not beside project: ${document.sourceFile}; using embedded content hash.`);
      continue;
    }
    assert.equal(hash(raw), document.sourceHash, document.sourceFile);
    assert.equal(plainText(document.body), htmlText(findHtml(parse(raw), "main")));
  }
});

test("guide styles are scoped and text offsets are stable", () => {
  for (const document of documents) {
    postcss.parse(document.styles).walkRules(rule => {
      assert(rule.selectors.every(selector => selector.startsWith(".guide-document")), rule.selector);
    });
    const prepared = prepareDocument(document);
    let offset = 0;
    walk(prepared.body, node => {
      if (node.type === "text" && node.start !== null) {
        assert.equal(node.start, offset);
        assert.equal(prepared.text.slice(node.start, node.start + node.value.length), node.value);
        offset += node.value.length;
      }
    });
    assert.equal(offset, prepared.text.length);
    assert(prepared.text.length > 20000);
  }
});

test("expanded diagram IDs and marker references remain consistent", () => {
  const props = {
    id: "box", "aria-labelledby": "title external", markerEnd: "url(#arrow)", href: "#box",
  };
  assert.deepEqual(remapDiagramProps(props, "zoom-", new Set(["box", "title", "arrow"])), {
    id: "zoom-box", "aria-labelledby": "zoom-title external", markerEnd: "url(#zoom-arrow)", href: "#zoom-box",
  });
  for (const document of documents) {
    const prepared = prepareDocument(document);
    walk(prepared.body, node => {
      if (node.type !== "element" || !node.props["data-diagram"]) return;
      const source = prepared.byId[node.props["data-diagram"]];
      assert(source && source.tag === "svg");
      const ids = collectIds(source);
      walk([source], part => {
        if (part.type !== "element") return;
        for (const value of Object.values(part.props)) {
          if (typeof value !== "string") continue;
          for (const [, id] of value.matchAll(/url\(#([^)]+)\)/g)) assert(ids.has(id), id);
        }
      });
    });
  }
});
