const excludedTags = new Set(["svg", "button", "summary", "input"]);

export function isExcluded(node) {
  if (node.type !== "element") return false;
  const props = node.props || {};
  const classes = (props.className || "").split(/\s+/);
  return excludedTags.has(node.tag) || props.id === "check-progress" ||
    Object.hasOwn(props, "data-no-highlight") || classes.includes("diagram-actions") ||
    classes.includes("toolbar");
}

export const DOM_EXCLUSIONS = "svg, button, summary, input, #check-progress, [data-no-highlight], .diagram-actions, .toolbar";

export function prepareDocument(document) {
  let offset = 0;
  const text = [];
  const byId = {};
  function visit(node, excluded = false) {
    if (node.type === "text") {
      const start = excluded ? null : offset;
      if (!excluded) {
        offset += node.value.length;
        text.push(node.value);
      }
      return { ...node, start };
    }
    const result = {
      ...node,
      children: node.children.map(child => visit(child, excluded || isExcluded(node))),
    };
    if (node.props.id) byId[node.props.id] = result;
    return result;
  }
  const body = document.body.map(node => visit(node));
  return { ...document, body, text: text.join(""), byId };
}

export function plainText(nodes) {
  return nodes.map(node => node.type === "text" ? node.value : plainText(node.children)).join("");
}

export function remapDiagramProps(props, prefix, ids) {
  if (!prefix) return props;
  return Object.fromEntries(Object.entries(props).map(([name, original]) => {
    if (typeof original !== "string") return [name, original];
    let value = original;
    if (name === "id") value = prefix + value;
    if (name === "aria-labelledby" || name === "aria-describedby")
      value = value.split(/\s+/).map(id => ids.has(id) ? prefix + id : id).join(" ");
    value = value.replace(/url\(#([^)]+)\)/g, (match, id) =>
      ids.has(id) ? `url(#${prefix}${id})` : match);
    if ((name === "href" || name === "xlinkHref") && value.startsWith("#") && ids.has(value.slice(1)))
      value = `#${prefix}${value.slice(1)}`;
    return [name, value];
  }));
}

export function collectIds(node, result = new Set()) {
  if (node.type === "element") {
    if (node.props.id) result.add(node.props.id);
    node.children.forEach(child => collectIds(child, result));
  }
  return result;
}
