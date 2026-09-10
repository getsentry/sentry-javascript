import { isPlainObject } from '../is';
import { FILTERED_VALUE } from './filtering-snippets';
import { shouldFilterDataKey } from './filterKeyValueData';
import { filterQueryParams } from './filterQueryParams';

/** Matches `key=value&key2=value2` bodies, the only non-JSON shape whose keys the denylist can check. */
const FORM_BODY_RE = /^[^=&]+=[^&]*(?:&[^=&]+=[^&]*)*$/;

/**
 * Scrubs an HTTP body the SDK collected itself, before it becomes `request.data` or
 * `http.request.body.data`. A parseable body keeps its shape, and only the values of sensitive keys
 * are replaced. An unparseable body has no keys to match, so the whole value becomes `[Filtered]`.
 */
export function filterCollectedHttpBody(body: unknown): unknown {
  if (body == null) {
    return body;
  }

  if (typeof body === 'string') {
    return filterCollectedHttpBodyString(body);
  }

  // A `Buffer`, a stream, or a number has no keys to match, so the whole value is filtered.
  return isPlainObject(body) || Array.isArray(body) ? filterBodyValue(body) : FILTERED_VALUE;
}

/**
 * String-only variant of {@link filterCollectedHttpBody}. Capture sites call this before they
 * truncate, because a truncated JSON body no longer parses and would be dropped wholesale.
 */
export function filterCollectedHttpBodyString(body: string): string {
  if (!body) {
    return body;
  }

  try {
    const json: unknown = JSON.parse(body);
    // A bare JSON scalar (`"hi"`, `42`) has no keys to match against, so it counts as unparseable.
    if (typeof json === 'object' && json !== null) {
      return JSON.stringify(filterBodyValue(json));
    }
  } catch {
    // Not JSON. The form-encoded attempt below runs instead.
  }

  // The query-param filter keeps the body's original encoding byte-for-byte.
  return (FORM_BODY_RE.test(body) && filterQueryParams(body, true)) || FILTERED_VALUE;
}

function filterBodyValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(filterBodyValue);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    result[key] = shouldFilterDataKey(key, true) ? FILTERED_VALUE : filterBodyValue(nested);
  }
  return result;
}
