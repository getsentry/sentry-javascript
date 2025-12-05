import type { RawAttributes } from '../attributes';
import { isAttributeObject } from '../attributes';
import type { SerializedAttributes } from '../types-hoist/attributes';
import type { Span, SpanV2JSON } from '../types-hoist/span';
import { attributeValueToSerializedAttribute } from '../utils/attributes';

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

/**
 * Only set a span JSON attribute if it is not already set.
 * This is used to safely set attributes on JSON objects without mutating already-ended span instances.
 */
export function safeSetSpanJSONAttributes(
  spanJSON: SpanV2JSON,
  newAttributes: RawAttributes<Record<string, unknown>>,
  originalAttributeKeys: SerializedAttributes | undefined,
): void {
  if (!spanJSON.attributes) {
    spanJSON.attributes = {};
  }

  Object.keys(newAttributes).forEach(key => {
    if (!originalAttributeKeys?.[key]) {
      setAttributeOnSpanJSONWithMaybeUnit(spanJSON, key, newAttributes[key]);
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

function setAttributeOnSpanJSONWithMaybeUnit(
  spanJSON: SpanV2JSON,
  attributeKey: string,
  attributeValue: unknown,
): void {
  // Ensure attributes object exists (it's initialized in safeSetSpanJSONAttributes)
  if (!spanJSON.attributes) {
    return;
  }

  if (isAttributeObject(attributeValue)) {
    const { value, unit } = attributeValue;

    if (isSupportedSerializableType(value)) {
      spanJSON.attributes[attributeKey] = attributeValueToSerializedAttribute(value);
    }

    if (unit) {
      spanJSON.attributes[`${attributeKey}.unit`] = attributeValueToSerializedAttribute(unit);
    }
  } else if (isSupportedSerializableType(attributeValue)) {
    spanJSON.attributes[attributeKey] = attributeValueToSerializedAttribute(attributeValue);
  }
}

function isSupportedAttributeType(value: unknown): value is Parameters<Span['setAttribute']>[1] {
  return ['string', 'number', 'boolean'].includes(typeof value) || Array.isArray(value);
}

function isSupportedSerializableType(value: unknown): boolean {
  return ['string', 'number', 'boolean'].includes(typeof value) || Array.isArray(value);
}
