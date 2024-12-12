// Note that these are the serialized attributes and not attributes directly on
// the DOM Node. Attributes we are interested in:
const ATTRIBUTES_TO_RECORD = new Set([
  'id',
  'class',
  'aria-label',
  'role',
  'name',
  'alt',
  'title',
  'data-test-id',
  'data-testid',
  'disabled',
  'aria-disabled',
  'data-sentry-component',
]);

/**
 * Inclusion list of attributes that we want to record from the DOM element
 */
export function getAttributesToRecord(attributes: Record<string, unknown>): Record<string, unknown> {
  const obj: Record<string, unknown> = {};
  if (!attributes['data-sentry-component'] && attributes['data-sentry-element']) {
    attributes['data-sentry-component'] = attributes['data-sentry-element'];
  }
  for (const key in attributes) {
    if (ATTRIBUTES_TO_RECORD.has(key)) {
      let normalizedKey = key;

      if (key === 'data-testid' || key === 'data-test-id') {
        normalizedKey = 'testId';
      }

      obj[normalizedKey] = attributes[key];
    }
  }

  return obj;
}
