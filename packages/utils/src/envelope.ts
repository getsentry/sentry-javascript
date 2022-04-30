import { Attachment, AttachmentItem, DataCategory, Envelope, EnvelopeItem, EnvelopeItemType } from '@sentry/types';

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
 * Serializes an envelope.
 */
export function serializeEnvelope(envelope: Envelope): string | Uint8Array {
  const [, items] = envelope;

  // Have to cast items to any here since Envelope is a union type
  // Fixed in Typescript 4.2
  // TODO: Remove any[] cast when we upgrade to TS 4.2
  // https://github.com/microsoft/TypeScript/issues/36390
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const hasBinaryAttachment = (items as any[]).some(
    (item: typeof items[number]) => item[0].type === 'attachment' && item[1] instanceof Uint8Array,
  );

  return hasBinaryAttachment ? serializeBinaryEnvelope(envelope) : serializeStringEnvelope(envelope);
}

/**
 * Serializes an envelope to a string.
 */
export function serializeStringEnvelope(envelope: Envelope): string {
  const [headers, items] = envelope;
  const serializedHeaders = JSON.stringify(headers);

  // TODO: Remove any[] cast when we upgrade to TS 4.2
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (items as any[]).reduce((acc, item: typeof items[number]) => {
    const [itemHeaders, payload] = item;
    // We do not serialize payloads that are primitives
    const serializedPayload = isPrimitive(payload) ? String(payload) : JSON.stringify(payload);
    return `${acc}\n${JSON.stringify(itemHeaders)}\n${serializedPayload}`;
  }, serializedHeaders);
}

function serializeBinaryEnvelope(envelope: Envelope): Uint8Array {
  const encoder = new TextEncoder();
  const [headers, items] = envelope;
  const serializedHeaders = JSON.stringify(headers);

  const chunks = [encoder.encode(serializedHeaders)];

  for (const item of items) {
    const [itemHeaders, payload] = item as typeof items[number];
    chunks.push(encoder.encode(`\n${JSON.stringify(itemHeaders)}\n`));
    if (typeof payload === 'string') {
      chunks.push(encoder.encode(payload));
    } else if (payload instanceof Uint8Array) {
      chunks.push(payload);
    } else {
      chunks.push(encoder.encode(JSON.stringify(payload)));
    }
  }

  return concatBuffers(chunks);
}

function concatBuffers(buffers: Uint8Array[]): Uint8Array {
  const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);

  const merged = new Uint8Array(totalLength);
  let offset = 0;
  for (const buffer of buffers) {
    merged.set(buffer, offset);
    offset += buffer.length;
  }

  return merged;
}

/**
 * Creates attachment envelope items
 */
export function createAttachmentEnvelopeItem(attachment: Attachment): AttachmentItem {
  const [pathOrData, options] = attachment;

  const buffer = typeof pathOrData === 'string' ? new TextEncoder().encode(pathOrData) : pathOrData;

  return [
    {
      type: 'attachment',
      length: buffer.length,
      filename: options?.filename || 'No filename',
      content_type: options?.contentType,
      attachment_type: options?.attachmentType,
    },
    buffer,
  ];
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
