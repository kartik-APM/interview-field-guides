export const COLORS = [
  { id: "yellow", label: "Yellow", background: "#ffe98f" },
  { id: "red", label: "Red", background: "#ffc4c4" },
  { id: "green", label: "Green", background: "#b9e7c2" },
  { id: "blue", label: "Blue", background: "#c3ddff" },
];
const colorIds = new Set(COLORS.map(color => color.id));

export function addHighlight(records, selection, color, text, id) {
  if (!colorIds.has(color) || !Number.isInteger(selection.start) ||
      !Number.isInteger(selection.end) || selection.start < 0 ||
      selection.end > text.length || selection.start >= selection.end)
    throw new Error("The selected text cannot be highlighted.");
  let { start, end } = selection;
  const keep = [];
  for (const record of [...records].sort((a, b) => a.start - b.start)) {
    if (record.start <= end && start <= record.end) {
      start = Math.min(start, record.start);
      end = Math.max(end, record.end);
      while (keep.length && keep[keep.length - 1].end >= start) {
        start = Math.min(start, keep.pop().start);
      }
    } else {
      keep.push(record);
    }
  }
  keep.push({ id, start, end, color, text: text.slice(start, end) });
  return keep.sort((a, b) => a.start - b.start);
}

export function highlightSegments(value, start, records) {
  if (start === null) return [{ text: value }];
  let cursor = 0;
  const result = [];
  for (const record of records) {
    const from = Math.max(0, record.start - start);
    const to = Math.min(value.length, record.end - start);
    if (from >= to) continue;
    if (from > cursor) result.push({ text: value.slice(cursor, from) });
    result.push({ text: value.slice(from, to), id: record.id, color: record.color });
    cursor = to;
  }
  if (cursor < value.length) result.push({ text: value.slice(cursor) });
  return result;
}

export function validateReaderState(value, document) {
  if (!value || value.textHash !== document.textHash || !Array.isArray(value.highlights) ||
      !value.checks || typeof value.checks !== "object" || Array.isArray(value.checks))
    return false;
  let end = -1;
  const ids = new Set();
  for (const record of value.highlights) {
    if (!record || typeof record.id !== "string" || ids.has(record.id) ||
        !Number.isInteger(record.start) || !Number.isInteger(record.end) ||
        record.start < 0 || record.start < end || record.end <= record.start ||
        record.end > document.text.length || !colorIds.has(record.color) ||
        record.text !== document.text.slice(record.start, record.end))
      return false;
    ids.add(record.id);
    end = record.end;
  }
  return Object.values(value.checks).every(checked => typeof checked === "boolean");
}
