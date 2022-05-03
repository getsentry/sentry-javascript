import {
  AttachmentItem,
  AttachmentWithData,
  DataCategory,
  Envelope,
  EnvelopeItem,
  EnvelopeItemType,
} from '@sentry/types';

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

// Combination of global TextEncoder and Node require('util').TextEncoder
interface TextEncoderInternal extends TextEncoderCommon {
  encode(input?: string): Uint8Array;
}

/**
 * Serializes an envelope.
 */
export function serializeEnvelope(envelope: Envelope, textEncoder?: TextEncoderInternal): string | Uint8Array {
  const utf8 = textEncoder || new TextEncoder();

  const [envHeaders, items] = envelope;

  // Initially we construct our envelope as a string and only convert to binary chunks if we encounter binary data
  let parts: string | Uint8Array[] = JSON.stringify(envHeaders);

  function append(next: string | Uint8Array): void {
    if (typeof parts === 'string') {
      parts = typeof next === 'string' ? parts + next : [utf8.encode(parts), next];
    } else {
      parts.push(typeof next === 'string' ? utf8.encode(next) : next);
    }
  }

  for (const item of items) {
    const [itemHeaders, payload] = item as typeof items[number];
    append(`\n${JSON.stringify(itemHeaders)}\n`);
    append(typeof payload === 'string' || payload instanceof Uint8Array ? payload : JSON.stringify(payload));
  }

  return typeof parts === 'string' ? parts : concatBuffers(parts);
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
export function createAttachmentEnvelopeItem(
  attachment: AttachmentWithData,
  textEncoder?: TextEncoderInternal,
): AttachmentItem {
  const utf8 = textEncoder || new TextEncoder();

  const buffer = typeof attachment.data === 'string' ? utf8.encode(attachment.data) : attachment.data;

  return [
    {
      type: 'attachment',
      length: buffer.length,
      filename: attachment.filename,
      content_type: attachment.contentType,
      attachment_type: attachment.attachmentType,
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
