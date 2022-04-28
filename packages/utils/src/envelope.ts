import { DataCategory, Envelope, EnvelopeItem, EnvelopeItemType } from '@sentry/types';

import { isPrimitive } from './is';

/**
 * Creates an envelope.
 * Make sure to always explicitly provide the generic to this function
 * so that the envelope types resolve correctly.
 */
export function createEnvelope<E extends Envelope>(headers: E[0], items: E[1] = []): E {
  return [headers, items] as E;
}

/**
 * Add an item to an envelope.
 * Make sure to always explicitly provide the generic to this function
 * so that the envelope types resolve correctly.
 */
export function addItemToEnvelope<E extends Envelope>(envelope: E, newItem: E[1][number]): E {
  const [headers, items] = envelope;
  return [headers, [...items, newItem]] as E;
}

/**
 * Convenience function to loop through the items and item types of an envelope.
 * (This function was mostly created because working with envelope types is painful at the moment)
 */
export function forEachEnvelopeItem<E extends Envelope>(
  envelope: Envelope,
  callback: (envelopeItem: E[1][number], envelopeItemType: E[1][number][0]['type']) => void,
): void {
  const envelopeItems = envelope[1];
  envelopeItems.forEach((envelopeItem: EnvelopeItem) => {
    const envelopeItemType = envelopeItem[0].type;
    callback(envelopeItem, envelopeItemType);
  });
}

/**
 * Serializes an envelope into a string.
 */
export function serializeEnvelope(envelope: Envelope): string {
  const [headers, items] = envelope;
  const serializedHeaders = JSON.stringify(headers);

  // Have to cast items to any here since Envelope is a union type
  // Fixed in Typescript 4.2
  // TODO: Remove any[] cast when we upgrade to TS 4.2
  // https://github.com/microsoft/TypeScript/issues/36390
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (items as any[]).reduce((acc, item: typeof items[number]) => {
    const [itemHeaders, payload] = item;
    // We do not serialize payloads that are primitives
    const serializedPayload = isPrimitive(payload) ? String(payload) : JSON.stringify(payload);
    return `${acc}\n${JSON.stringify(itemHeaders)}\n${serializedPayload}`;
  }, serializedHeaders);
}

const ITEM_TYPE_TO_DATA_CATEGORY_MAP: Record<EnvelopeItemType, DataCategory> = {
  session: 'session',
  sessions: 'session',
  attachment: 'attachment',
  transaction: 'transaction',
  event: 'error',
  client_report: 'internal',
  user_report: 'default',
};

/**
 * Maps the type of an envelope item to a data category.
 */
export function envelopeItemTypeToDataCategory(type: EnvelopeItemType): DataCategory {
  return ITEM_TYPE_TO_DATA_CATEGORY_MAP[type];
}
