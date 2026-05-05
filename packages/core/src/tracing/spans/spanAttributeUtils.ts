import type { RawAttributes } from '../../attributes';
import type { StreamedSpanJSON } from '../../types-hoist/span';

/**
 * Safely set attributes on a span JSON.
 * If an attribute already exists, it will not be overwritten.
 */
export function safeSetSpanJSONAttributes(
  spanJSON: StreamedSpanJSON,
  newAttributes: RawAttributes<Record<string, unknown>>,
): void {
  const originalAttributes = spanJSON.attributes ?? (spanJSON.attributes = {});

  Object.entries(newAttributes).forEach(([key, value]) => {
    if (value != null && !(key in originalAttributes)) {
      originalAttributes[key] = value;
    }
  });
}
