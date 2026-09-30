import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";
import { parse } from "parse5";
import postcss from "postcss";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const source = path.resolve(process.argv[2] || path.join(root, "..", "SDA Problems"));
const output = path.join(root, "src", "content");
const definitions = [
  { id: "calendaring", card: "calendar", category: "Calendaring", file: "senior-ic3-calendaring-system-design.html" },
  { id: "trending-shares", card: "trending", category: "Trending Shares", file: "senior-ic3-trending-shares-design.html" },
  { id: "metrics-monitoring", card: "metrics", category: "Metrics", file: "senior-ic3-metrics-monitoring-design.html" },
  { id: "distributed-kv-store", card: "kv", category: "Distributed storage", file: "senior-ic3-distributed-kv-store-design.html" },
  { id: "top-n-requests", card: "topn", category: "Distributed Top-N", file: "senior-ic3-top-n-requests-design.html" },
];
const routes = new Map(definitions.map(guide => [guide.file, `/guides/${guide.id}`]));
const digest = value => createHash("sha256").update(value).digest("hex");
const attributes = node => Object.fromEntries((node.attrs || []).map(attr => [attr.name, attr.value]));
const hasClass = (node, name) => (attributes(node).class || "").split(/\s+/).includes(name);
const text = node => node.nodeName === "#text" ? node.value : (node.childNodes || []).map(text).join("");
const cleanText = node => text(node).replace(/\s+/g, " ").trim();

function findAll(node, predicate) {
  return [
    ...(predicate(node) ? [node] : []),
    ...(node.childNodes || []).flatMap(child => findAll(child, predicate)),
  ];
}

function find(node, predicate, description) {
  const found = findAll(node, predicate)[0];
  if (!found) throw new Error(`Missing ${description}`);
  return found;
}

function link(href) {
  if (!href || href.startsWith("#") || /^https?:\/\//.test(href)) return href;
  if (href === "index.html") return "/";
  const [filename, fragment] = href.split("#");
  const route = routes.get(decodeURIComponent(filename));
  if (!route) throw new Error(`Unmapped local guide link: ${href}`);
  return route + (fragment ? `#${fragment}` : "");
}

const propNames = {
  class: "className", for: "htmlFor", tabindex: "tabIndex",
  colspan: "colSpan", rowspan: "rowSpan", autofocus: "autoFocus",
  "xlink:href": "xlinkHref", "xmlns:xlink": "xmlnsXlink",
};
const booleans = new Set(["open", "checked", "disabled", "hidden", "autofocus"]);
const allowedTags = new Set([
  "header", "footer", "section", "div", "span", "p", "h1", "h2", "h3", "h4",
  "a", "button", "strong", "em", "code", "pre", "br", "ul", "ol", "li",
  "table", "caption", "thead", "tbody", "tr", "th", "td", "blockquote",
  "figure", "figcaption", "svg", "title", "desc", "defs", "marker", "path",
  "rect", "text", "g", "circle", "details", "summary", "label", "input", "img",
]);

function propsFor(node) {
  const props = {};
  for (const attr of node.attrs || []) {
    let name = attr.prefix ? `${attr.prefix}:${attr.name}` : attr.name;
    let value = attr.value;
    if (/^on/i.test(name)) throw new Error(`Inline event handler rejected: ${name}`);
    if (name === "href") value = link(value);
    if (name === "src" && !value.startsWith("data:image/"))
      throw new Error(`Non-embedded media rejected: ${value}`);
    if (name === "class") value = value.split(/\s+/).filter(part => part !== "js-only").join(" ");
    if (name === "style") {
      const style = {};
      postcss.parse(`x{${value}}`).walkDecls(decl => {
        const property = decl.prop.startsWith("--") ? decl.prop
          : decl.prop.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
        style[property] = decl.value;
      });
      props.style = style;
      continue;
    }
    if (booleans.has(name)) value = true;
    if (!name.startsWith("data-") && !name.startsWith("aria-")) {
      name = propNames[name] || name.replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
    }
    props[name] = value;
  }
  if (props.target === "_blank") props.rel = "noopener noreferrer";
  return props;
}

function contentTree(main, guideId) {
  const checks = [];
  const details = [];
  function convert(node, key) {
    if (node.nodeName === "#text") return { type: "text", key, value: node.value };
    if (!node.tagName) return null;
    if (!allowedTags.has(node.tagName)) throw new Error(`Unexpected content tag: ${node.tagName}`);
    const result = { type: "element", key, tag: node.tagName, props: propsFor(node), children: [] };
    if (node.tagName === "input" && "data-check" in attributes(node)) {
      const label = cleanText(node.parentNode);
      result.checkId = digest(`${guideId}:${label}`).slice(0, 16);
      checks.push({ id: result.checkId, label });
    }
    if (node.tagName === "details") {
      result.detailId = `detail-${details.length}`;
      details.push({ id: result.detailId, open: Boolean(result.props.open) });
    }
    result.children = (node.childNodes || []).map((child, index) => convert(child, `${key}.${index}`)).filter(Boolean);
    return result;
  }
  const body = main.childNodes.map((node, index) => convert(node, String(index))).filter(Boolean);
  if (new Set(checks.map(check => check.id)).size !== checks.length) throw new Error("Duplicate checklist labels");
  return { body, checks, details };
}

function scopeStyles(css) {
  const sheet = postcss.parse(css);
  sheet.walkAtRules(rule => {
    if (rule.name === "import") throw new Error("External stylesheet imports are not supported");
  });
  sheet.walkRules(rule => {
    rule.selectors = rule.selectors.map(selector => {
      selector = selector.replace(/^\.js\s+/, "");
      if (/^(?::root|html(?:\.js)?|body|main)(?=[\s.:#[>+~]|$)/.test(selector)) {
        return selector.replace(/^(?::root|html(?:\.js)?|body|main)/, ".guide-document");
      }
      return `.guide-document ${selector}`;
    });
  });
  return sheet.toString();
}

const index = parse(await fs.readFile(path.join(source, "index.html"), "utf8"));
const catalog = [];
const documents = [];
for (const [number, definition] of definitions.entries()) {
  const raw = await fs.readFile(path.join(source, definition.file), "utf8");
  const html = parse(raw);
  const main = find(html, node => node.tagName === "main", "guide main");
  const css = text(find(html, node => node.tagName === "style", "guide stylesheet"));
  const nav = find(html, node => node.tagName === "nav" && attributes(node)["aria-label"] === "Study guide sections", "guide navigation");
  const card = find(index, node => node.tagName === "article" && attributes(node).id === definition.card, "index card");
  const title = cleanText(find(card, node => node.tagName === "h3", "card title"));
  const description = cleanText(find(card, node => hasClass(node, "question"), "card description")).replace(/^Question:\s*/, "");
  const focus = cleanText(find(card, node => hasClass(node, "focus"), "card focus")).replace(/^Focus:\s*/, "");
  const sections = findAll(main, node => node.tagName === "section").map(node => ({
    id: attributes(node).id,
    title: cleanText(find(node, child => child.tagName === "h2", "section heading")),
  }));
  const navigation = nav.childNodes.flatMap(node => {
    if (node.tagName === "a" && attributes(node).href.startsWith("#"))
      return [{ type: "link", href: attributes(node).href, label: cleanText(node) }];
    if (hasClass(node, "nav-group")) return [{ type: "group", label: cleanText(node) }];
    return [];
  });
  const { body, checks, details } = contentTree(main, definition.id);
  const metadata = {
    id: definition.id, number: number + 1, title, category: definition.category,
    description, focus, sectionCount: sections.length, checklistCount: checks.length,
    sourceFile: definition.file, sourceHash: digest(raw), textHash: digest(text(main)),
  };
  catalog.push(metadata);
  documents.push({
    ...metadata, body, navigation, sections, checks, details, styles: scopeStyles(css),
  });
}
await fs.mkdir(path.join(output, "guides"), { recursive: true });
for (const document of documents)
  await fs.writeFile(path.join(output, "guides", `${document.id}.json`), JSON.stringify(document));
await fs.writeFile(path.join(output, "catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
console.log(`Imported ${documents.length} SDA guides as React-renderable content. Original HTML was not modified.`);
