import type { RawAttributes } from '../attributes';
import { isAttributeObject } from '../attributes';
import type { Context, Contexts } from '../types-hoist/context';
import type { SpanV2JSON } from '../types-hoist/span';
import { attributeValueToSerializedAttribute } from '../utils/attributes';
import { isPrimitive } from '../utils/is';
import { showSpanDropWarning } from '../utils/spanUtils';

/**
 * Only set a span JSON attribute if it is not already set.
 * This is used to safely set attributes on JSON objects without mutating already-ended span instances.
 */
export function safeSetSpanJSONAttributes(
  spanJSON: SpanV2JSON,
  newAttributes: RawAttributes<Record<string, unknown>>,
): void {
  if (!spanJSON.attributes) {
    spanJSON.attributes = {};
  }

  const originalAttributes = spanJSON.attributes;

  Object.keys(newAttributes).forEach(key => {
    if (!originalAttributes?.[key]) {
      setAttributeOnSpanJSONWithMaybeUnit(
        // type-casting here because we ensured above that the attributes object exists
        spanJSON as SpanV2JSON & Required<Pick<SpanV2JSON, 'attributes'>>,
        key,
        newAttributes[key],
      );
    }
  });
}

/**
 * Apply a user-provided beforeSendSpan callback to a span JSON.
 */
export function applyBeforeSendSpanCallback(
  span: SpanV2JSON,
  beforeSendSpan: (span: SpanV2JSON) => SpanV2JSON,
): SpanV2JSON {
  const modifedSpan = beforeSendSpan(span);
  if (!modifedSpan) {
    showSpanDropWarning();
    return span;
  }
  return modifedSpan;
}

function setAttributeOnSpanJSONWithMaybeUnit(
  spanJSON: SpanV2JSON & Required<Pick<SpanV2JSON, 'attributes'>>,
  attributeKey: string,
  attributeValue: unknown,
): void {
  if (isAttributeObject(attributeValue)) {
    const { value, unit } = attributeValue;

    if (isSupportedSerializableType(value)) {
      spanJSON.attributes[attributeKey] = attributeValueToSerializedAttribute(value);
      if (unit) {
        spanJSON.attributes[attributeKey].unit = unit;
      }
    }
  } else if (isSupportedSerializableType(attributeValue)) {
    spanJSON.attributes[attributeKey] = attributeValueToSerializedAttribute(attributeValue);
  }
}

function isSupportedSerializableType(value: unknown): boolean {
  return ['string', 'number', 'boolean'].includes(typeof value) || Array.isArray(value);
}

// map of attributes->context keys for those attributes that don't correspond 1:1 to the context key
const explicitAttributeToContextMapping = {
  'os.build_id': 'os.build',
  'app.name': 'app.app_name',
  'app.identifier': 'app.app_identifier',
  'app.version': 'app.app_version',
  'app.memory': 'app.app_memory',
  'app.start_time': 'app.app_start_time',
};

const knownContexts = ['app', 'os', 'device', 'culture', 'cloud_resource', 'runtime'];

/**
 * Converts a context object to a set of attributes.
 * Only includes attributes that are primitives (for now).
 * @param contexts - The context object to convert.
 * @returns The attributes object.
 */
export function contextsToAttributes(contexts: Contexts): RawAttributes<Record<string, unknown>> {
  function contextToAttribute(context: Context): Context {
    return Object.keys(context).reduce(
      (acc, key) => {
        if (!isPrimitive(context[key])) {
          return acc;
        }
        acc[key] = context[key];
        return acc;
      },
      {} as Record<string, unknown>,
    );
  }

  const contextsWithPrimitiveValues = Object.keys(contexts).reduce((acc, key) => {
    if (!knownContexts.includes(key)) {
      return acc;
    }
    const context = contexts[key];
    if (context) {
      acc[key] = contextToAttribute(context);
    }
    return acc;
  }, {} as Contexts);

  const explicitlyMappedAttributes = Object.entries(explicitAttributeToContextMapping).reduce(
    (acc, [attributeKey, contextKey]) => {
      const [contextName, contextValueKey] = contextKey.split('.');
      if (contextName && contextValueKey && contextsWithPrimitiveValues[contextName]?.[contextValueKey]) {
        acc[attributeKey] = contextsWithPrimitiveValues[contextName]?.[contextValueKey];
        // now we delete this key from `contextsWithPrimitiveValues` so we don't include it in the next step
        delete contextsWithPrimitiveValues[contextName]?.[contextValueKey];
      }
      return acc;
    },
    {} as Record<string, unknown>,
  );

  return {
    ...explicitlyMappedAttributes,
    ...Object.entries(contextsWithPrimitiveValues).reduce(
      (acc, [contextName, contextObj]) => {
        contextObj &&
          Object.entries(contextObj).forEach(([key, value]) => {
            if (value) {
              acc[`${contextName}.${key}`] = value;
            }
          });
        return acc;
      },
      {} as Record<string, unknown>,
    ),
  };
}
