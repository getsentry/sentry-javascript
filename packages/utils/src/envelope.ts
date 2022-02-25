import { Envelope } from '@sentry/types';

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
    return `${acc}\n${JSON.stringify(itemHeaders)}\n${JSON.stringify(payload)}`;
  }, serializedHeaders);
}
