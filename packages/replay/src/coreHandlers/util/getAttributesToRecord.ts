// Attributes we are interested in:
const ATTRIBUTES_TO_RECORD = new Set(['id', 'class', 'aria-label', 'role', 'name']);

/**
 * Inclusion list of attributes that we want to record from the DOM element
 */
export function getAttributesToRecord(attributes: Record<string, unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  for (const key in attributes) {
    if (ATTRIBUTES_TO_RECORD.has(key)) {
      obj[key] = attributes[key];
    }
  }

  return obj;
}
