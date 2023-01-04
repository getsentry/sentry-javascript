import type {
  Attachment,
  AttachmentItem,
  BaseEnvelopeHeaders,
  BaseEnvelopeItemHeaders,
  DataCategory,
  DsnComponents,
  Envelope,
  EnvelopeItem,
  EnvelopeItemType,
  Event,
  EventEnvelopeHeaders,
  SdkInfo,
  SdkMetadata,
  TextEncoderInternal,
} from '@sentry/types';

import { dsnToString } from './dsn';
import { normalize } from './normalize';
import { dropUndefinedKeys } from './object';

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

function encodeUTF8(input: string, textEncoder?: TextEncoderInternal): Uint8Array {
  const utf8 = textEncoder || new TextEncoder();
  return utf8.encode(input);
}

/**
 * Serializes an envelope.
 */
export function serializeEnvelope(envelope: Envelope, textEncoder?: TextEncoderInternal): string | Uint8Array {
  const [envHeaders, items] = envelope;

  // Initially we construct our envelope as a string and only convert to binary chunks if we encounter binary data
  let parts: string | Uint8Array[] = JSON.stringify(envHeaders);

  function append(next: string | Uint8Array): void {
    if (typeof parts === 'string') {
      parts = typeof next === 'string' ? parts + next : [encodeUTF8(parts, textEncoder), next];
    } else {
      parts.push(typeof next === 'string' ? encodeUTF8(next, textEncoder) : next);
    }
  }

  for (const item of items) {
    const [itemHeaders, payload] = item;

    append(`\n${JSON.stringify(itemHeaders)}\n`);

    if (typeof payload === 'string' || payload instanceof Uint8Array) {
      append(payload);
    } else {
      let stringifiedPayload: string;
      try {
        stringifiedPayload = JSON.stringify(payload);
      } catch (e) {
        // In case, despite all our efforts to keep `payload` circular-dependency-free, `JSON.strinify()` still
        // fails, we try again after normalizing it again with infinite normalization depth. This of course has a
        // performance impact but in this case a performance hit is better than throwing.
        stringifiedPayload = JSON.stringify(normalize(payload));
      }
      append(stringifiedPayload);
    }
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

interface TextDecoderInternal {
  decode(input?: Uint8Array): string;
}

/**
 * Parses an envelope
 */
export function parseEnvelope(
  env: string | Uint8Array,
  textEncoder: TextEncoderInternal,
  textDecoder: TextDecoderInternal,
): Envelope {
  let buffer = typeof env === 'string' ? textEncoder.encode(env) : env;

  function readBinary(length: number): Uint8Array {
    const bin = buffer.subarray(0, length);
    // Replace the buffer with the remaining data excluding trailing newline
    buffer = buffer.subarray(length + 1);
    return bin;
  }

  function readJson<T>(): T {
    let i = buffer.indexOf(0xa);
    // If we couldn't find a newline, we must have found the end of the buffer
    if (i < 0) {
      i = buffer.length;
    }

    return JSON.parse(textDecoder.decode(readBinary(i))) as T;
  }

  const envelopeHeader = readJson<BaseEnvelopeHeaders>();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const items: [any, any][] = [];

  while (buffer.length) {
    const itemHeader = readJson<BaseEnvelopeItemHeaders>();
    const binaryLength = typeof itemHeader.length === 'number' ? itemHeader.length : undefined;

    items.push([itemHeader, binaryLength ? readBinary(binaryLength) : readJson()]);
  }

  return [envelopeHeader, items];
}

/**
 * Creates attachment envelope items
 */
export function createAttachmentEnvelopeItem(
  attachment: Attachment,
  textEncoder?: TextEncoderInternal,
): AttachmentItem {
  const buffer = typeof attachment.data === 'string' ? encodeUTF8(attachment.data, textEncoder) : attachment.data;

  return [
    dropUndefinedKeys({
      type: 'attachment',
      length: buffer.length,
      filename: attachment.filename,
      content_type: attachment.contentType,
      attachment_type: attachment.attachmentType,
    }),
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
  profile: 'profile',
  replay_event: 'replay_event',
  replay_recording: 'replay_recording',
};

/**
 * Maps the type of an envelope item to a data category.
 */
export function envelopeItemTypeToDataCategory(type: EnvelopeItemType): DataCategory {
  return ITEM_TYPE_TO_DATA_CATEGORY_MAP[type];
}

/** Extracts the minimal SDK info from from the metadata or an events */
export function getSdkMetadataForEnvelopeHeader(metadataOrEvent?: SdkMetadata | Event): SdkInfo | undefined {
  if (!metadataOrEvent || !metadataOrEvent.sdk) {
    return;
  }
  const { name, version } = metadataOrEvent.sdk;
  return { name, version };
}

/**
 * Creates event envelope headers, based on event, sdk info and tunnel
 * Note: This function was extracted from the core package to make it available in Replay
 */
export function createEventEnvelopeHeaders(
  event: Event,
  sdkInfo: SdkInfo | undefined,
  tunnel: string | undefined,
  dsn: DsnComponents,
): EventEnvelopeHeaders {
  const dynamicSamplingContext = event.sdkProcessingMetadata && event.sdkProcessingMetadata.dynamicSamplingContext;

  return {
    event_id: event.event_id as string,
    sent_at: new Date().toISOString(),
    ...(sdkInfo && { sdk: sdkInfo }),
    ...(!!tunnel && { dsn: dsnToString(dsn) }),
    ...(event.type === 'transaction' &&
      dynamicSamplingContext && {
        trace: dropUndefinedKeys({ ...dynamicSamplingContext }),
      }),
  };
}
