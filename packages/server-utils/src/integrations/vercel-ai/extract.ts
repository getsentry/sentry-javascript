/** Maps the AI SDK `experimental_extract` input and output to the Clairic shape of the `gen_ai.extract` schemas. */

import { isObjectLike, stringify } from '@sentry/core';
import { mapObjectValues } from './util';

/**
 * Joins the text of the AI SDK state parts into one Clairic `state` string. The gateway does this join on
 * the server and does not show its separator, so this one is our choice. It only makes the recorded text
 * easier to read: the answer spans stay correct with any separator, because we add each part's offset.
 */
const EXTRACT_STATE_SEPARATOR = '\n\n';
const BLOB_SUBSTITUTE = '[Blob substitute]';

interface ExtractState {
  request: { state?: string; images?: string[]; documents?: string[] };
  /** For each AI SDK state part, the offset of its text in `request.state`, or `'image'` for an image part. */
  parts: (number | 'image' | undefined)[];
}

/**
 * Clairic takes the text as one `state` string, with images and PDF documents in their own arrays. The AI SDK
 * also takes a JSON object, or an array of text, JSON and file parts. Join the text of the parts and keep the
 * offset of each part, so that the answer spans point into the joined `state`.
 */
export function toExtractState(state: unknown): ExtractState {
  const images: string[] = [];
  const documents: string[] = [];
  // Each text gets a separator in front, which is cut off from the start of `state` at the end.
  let joined = '';

  const parts = (Array.isArray(state) ? state : [{ type: 'json', value: state }]).map(part => {
    if (!isObjectLike(part)) {
      return undefined;
    }
    if (part.type === 'file') {
      if (String(part.mediaType).startsWith('image/')) {
        images.push(BLOB_SUBSTITUTE);
        return 'image' as const;
      }
      if (part.mediaType === 'application/pdf') {
        documents.push(BLOB_SUBSTITUTE);
      }
      return undefined;
    }
    const text = part.type === 'text' ? part.text : stringify(part.value);
    if (typeof text !== 'string') {
      return undefined;
    }
    joined += EXTRACT_STATE_SEPARATOR + text;
    return joined.length - text.length - EXTRACT_STATE_SEPARATOR.length;
  });

  return {
    request: {
      state: joined ? joined.slice(EXTRACT_STATE_SEPARATOR.length) : undefined,
      images: images.length ? images : undefined,
      documents: documents.length ? documents : undefined,
    },
    parts,
  };
}

/**
 * The AI SDK also takes JSON or `null` as field `instructions`, but the schema allows only a string.
 */
export function toExtractFields(fields: unknown): unknown {
  return isObjectLike(fields)
    ? mapObjectValues(fields, field => ({
        ...field,
        instructions: field.instructions === null ? undefined : stringify(field.instructions),
      }))
    : fields;
}

/**
 * The AI SDK normalizes the provider's extraction answers. Map them back to the provider shape of
 * `gen_ai.output.messages` on `gen_ai.extract` spans. The AI SDK does not expose `truncated`.
 */
export function toExtractAnswers(
  answers: Record<string, unknown>,
  parts: ExtractState['parts'],
): Record<string, unknown> {
  return mapObjectValues(answers, ({ pNull, source, items, ...rest }) => {
    const mapped: Record<string, unknown> = { ...rest, p_null: pNull };
    const span = toExtractSpan(source, parts);
    if (span) {
      mapped.source = 'input';
      mapped.span = span;
    } else if (isObjectLike(source) && parts[Number(source.part)] === 'image') {
      mapped.source = 'image';
    }
    if (Array.isArray(items)) {
      const confidences = items.map(item => (isObjectLike(item) ? item.confidence : undefined));
      if (confidences.every(confidence => typeof confidence === 'number')) {
        mapped.confidences = confidences;
      }
      const spans = items.map(item => toExtractSpan(isObjectLike(item) ? item.source : undefined, parts));
      if (spans.some(Boolean)) {
        mapped.spans = spans;
      }
    }
    return mapped;
  });
}

function toExtractSpan(source: unknown, parts: ExtractState['parts']): [number, number] | null {
  if (!isObjectLike(source) || source.type !== 'text') {
    return null;
  }
  const offset = parts[Number(source.part)];
  return typeof offset === 'number' ? [offset + Number(source.start), offset + Number(source.end)] : null;
}
