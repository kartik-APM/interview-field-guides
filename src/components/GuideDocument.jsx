import React from "react";
import { Link } from "react-router-dom";
import { highlightSegments, COLORS } from "../lib/highlights.js";
import { remapDiagramProps } from "../lib/content.js";

const colorById = new Map(COLORS.map(color => [color.id, color.background]));
const voidTags = new Set(["br", "img", "input"]);

export function DocumentNode({ node, reader, prefix = "", ids = new Set() }) {
  if (node.type === "text") {
    if (prefix) return node.value;
    return highlightSegments(node.value, node.start, reader.highlights).map((segment, index) =>
      segment.id ? (
        <mark
          key={index}
          className="hl"
          data-hl-id={segment.id}
          data-hl-color={segment.color}
          style={{ backgroundColor: colorById.get(segment.color) }}
          title="Change or remove this highlight"
          onClick={event => {
            event.preventDefault();
            event.stopPropagation();
            reader.editHighlight(segment.id, event.currentTarget.getBoundingClientRect());
          }}
        >{segment.text}</mark>
      ) : <React.Fragment key={index}>{segment.text}</React.Fragment>
    );
  }

  const props = remapDiagramProps(node.props, prefix, ids);
  const children = node.children.map(child =>
    <DocumentNode key={child.key} node={child} reader={reader} prefix={prefix} ids={ids} />
  );
  if (node.checkId && !prefix) {
    return <input {...props} checked={Boolean(reader.checks[node.checkId])}
      onChange={event => reader.setCheck(node.checkId, event.target.checked)} />;
  }
  if (props.id === "check-progress" && !prefix) {
    return <p {...props}>{reader.checkedCount} of {reader.checkCount} rehearsal points covered</p>;
  }
  if (node.tag === "details" && !prefix) {
    return <details {...props}
      open={reader.details[node.detailId]}
      onToggle={event => reader.setDetail(node.detailId, event.currentTarget.open)}
    >{children}</details>;
  }
  if (node.tag === "button" && !prefix) {
    let onClick;
    if (props.id === "expand-details") onClick = () => reader.setAllDetails(true);
    else if (props.id === "collapse-details") onClick = () => reader.setAllDetails(false);
    else if (props.id === "print-guide") onClick = () => window.print();
    else if (props["data-diagram"] || props["data-hld-image"]) {
      const id = props["data-diagram"] || props["data-hld-image"];
      onClick = event => reader.showDiagram(id, event.currentTarget);
    }
    return <button {...props} onClick={onClick}>{children}</button>;
  }
  if (node.tag === "a" && !prefix && (props.href?.startsWith("/") || props.href?.startsWith("#"))) {
    const { href, ...rest } = props;
    return <Link {...rest} to={href}>{children}</Link>;
  }
  if (voidTags.has(node.tag)) return React.createElement(node.tag, props);
  return React.createElement(node.tag, props, children);
}

export default function GuideDocument({ document, reader, contentRef }) {
  return (
    <article className="guide-document" ref={contentRef} aria-label={document.title}>
      {document.body.map(node => <DocumentNode key={node.key} node={node} reader={reader} />)}
    </article>
  );
}
