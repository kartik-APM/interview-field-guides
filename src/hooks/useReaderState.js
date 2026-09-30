import { useState } from "react";
import { validateReaderState } from "../lib/highlights.js";

export const STORAGE_PREFIX = "interview-field-guides:v1:";

export function useReaderState(document) {
  const key = STORAGE_PREFIX + document.id;
  const empty = { textHash: document.textHash, highlights: [], checks: {} };
  const [loaded] = useState(() => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { value: empty, warning: "", preserved: null };
      const parsed = JSON.parse(raw);
      if (!validateReaderState(parsed, document)) {
        return {
          value: empty, preserved: raw,
          warning: "This guide or its saved data has changed. Old marks are not being applied to different text. The next change will keep a backup of the previous data.",
        };
      }
      return { value: parsed, warning: "", preserved: null };
    } catch (error) {
      return { value: empty, preserved: null, warning: `Saved progress could not be read: ${error.message}` };
    }
  });
  const [value, setValue] = useState(loaded.value);
  const [warning, setWarning] = useState(loaded.warning);
  const [preserved, setPreserved] = useState(loaded.preserved);

  function update(next) {
    setValue(next);
    try {
      if (preserved !== null) {
        localStorage.setItem(`${key}:backup:${Date.now()}`, preserved);
        setPreserved(null);
      }
      localStorage.setItem(key, JSON.stringify(next));
      setWarning("");
    } catch (error) {
      setWarning(`Changes are kept in this tab but could not be saved: ${error.message}`);
    }
  }
  return { value, update, warning };
}
