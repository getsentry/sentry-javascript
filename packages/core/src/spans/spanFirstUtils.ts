import type { RawAttributes } from '../attributes';
import { isAttributeObject } from '../attributes';
import type { SerializedAttributes } from '../types-hoist/attributes';
import type { Span } from '../types-hoist/span';

/**
 * Only set a span attribute if it is not already set.
 */
export function safeSetSpanAttributes(
  span: Span,
  newAttributes: RawAttributes<Record<string, unknown>>,
  originalAttributeKeys: SerializedAttributes | undefined,
): void {
  Object.keys(newAttributes).forEach(key => {
    if (!originalAttributeKeys?.[key]) {
      setAttributeOnSpanWithMaybeUnit(span, key, newAttributes[key]);
    }
  });
}

function setAttributeOnSpanWithMaybeUnit(span: Span, attributeKey: string, attributeValue: unknown): void {
  if (isAttributeObject(attributeValue)) {
    const { value, unit } = attributeValue;

    if (isSupportedAttributeType(value)) {
      span.setAttribute(attributeKey, value);
    }

    if (unit) {
      span.setAttribute(`${attributeKey}.unit`, unit);
    }
  } else if (isSupportedAttributeType(attributeValue)) {
    span.setAttribute(attributeKey, attributeValue);
  }
}

function isSupportedAttributeType(value: unknown): value is Parameters<Span['setAttribute']>[1] {
  return ['string', 'number', 'boolean'].includes(typeof value) || Array.isArray(value);
}
