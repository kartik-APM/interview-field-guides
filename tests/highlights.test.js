import test from "node:test";
import assert from "node:assert/strict";
import { addHighlight, highlightSegments, validateReaderState } from "../src/lib/highlights.js";

const text = "abcdefghijklmnopqrstuvwxyz";
const make = (id, start, end, color = "yellow") => ({ id, start, end, color, text: text.slice(start, end) });

test("highlight creation and overlap preserve the selected characters", () => {
  const original = [make("a", 0, 4), make("b", 8, 12)];
  const merged = addHighlight(original, { start: 3, end: 9 }, "green", text, "c");
  assert.deepEqual(merged, [make("c", 0, 12, "green")]);
  assert.deepEqual(original, [make("a", 0, 4), make("b", 8, 12)]);
});

test("touching ranges are merged transitively, without swallowing gaps", () => {
  const records = [make("a", 0, 3), make("b", 3, 6), make("c", 10, 12)];
  assert.deepEqual(addHighlight(records, { start: 6, end: 8 }, "blue", text, "new"),
    [make("new", 0, 8, "blue"), make("c", 10, 12)]);
});

test("rendering highlights across nested text nodes preserves all text", () => {
  const records = [make("a", 2, 8)];
  const first = highlightSegments("abcde", 0, records);
  const second = highlightSegments("fghij", 5, records);
  assert.deepEqual(first, [{ text: "ab" }, { text: "cde", id: "a", color: "yellow" }]);
  assert.deepEqual(second, [{ text: "fgh", id: "a", color: "yellow" }, { text: "ij" }]);
  assert.equal([...first, ...second].map(item => item.text).join(""), "abcdefghij");
  assert.deepEqual(highlightSegments("controls", null, records), [{ text: "controls" }]);
});

test("invalid selections and outdated persisted highlights are rejected", () => {
  assert.throws(() => addHighlight([], { start: 0, end: 100 }, "red", text, "x"));
  assert.throws(() => addHighlight([], { start: 5, end: 5 }, "red", text, "x"));
  assert.throws(() => addHighlight([], { start: 0, end: 5 }, "purple", text, "x"));
  const document = { text, textHash: "hash" };
  const valid = { textHash: "hash", highlights: [make("a", 0, 3)], checks: { point: true } };
  assert(validateReaderState(valid, document));
  assert(!validateReaderState({ ...valid, textHash: "old-hash" }, document));
  assert(!validateReaderState({ ...valid, highlights: [{ ...make("a", 0, 3), text: "wrong" }] }, document));
  assert(!validateReaderState({ ...valid, highlights: [make("a", 0, 3), make("b", 2, 5)] }, document));
  assert(!validateReaderState({ ...valid, checks: [] }, document));
});
