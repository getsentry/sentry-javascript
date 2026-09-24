import { isPlainObject } from '../is';
import { FILTERED_VALUE } from './filtering-snippets';
import { shouldFilterDataKey } from './filterKeyValueData';
import { filterQueryParams } from './filterQueryParams';

/**
 * Matches `key=value&key2=value2` bodies, the only non-JSON shape whose keys the denylist can check.
 * Keys are limited to the characters `application/x-www-form-urlencoded` encoding produces and raw
 * whitespace disqualifies (encoded forms write spaces as `+` or `%20`), so prose, URLs, XML, and
 * base64 blobs never pass as a pseudo-form whose "keys" would then ship unfiltered.
 */
const FORM_BODY_RE = /^[\w%.*+-]+=[^&\s]*(?:&[\w%.*+-]+=[^&\s]*)*$/;

function looksLikeFormBody(body: string): boolean {
  // A lone `key=` token is more likely base64 padding than a one-field form, so it does not count.
  return FORM_BODY_RE.test(body) && (body.includes('&') || !body.endsWith('='));
}

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
  return isPlainObject(body) || Array.isArray(body) ? filterBodyValue(body, false) : FILTERED_VALUE;
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
      return JSON.stringify(filterBodyValue(json, false));
    }
  } catch {
    // Not JSON. The form-encoded attempt below runs instead.
  }

  if (looksLikeFormBody(body)) {
    // The query-param filter keeps the body's original encoding byte-for-byte.
    return filterQueryParams(body, true) ?? FILTERED_VALUE;
  }

  return FILTERED_VALUE;
}

/**
 * `keyVouched` tracks whether a non-sensitive key sits above this value. A scalar without such a
 * key (a top-level array element like `["my-secret-token"]`) has nothing the denylist can clear it
 * by, so it is filtered — same reasoning as a bare scalar body.
 */
function filterBodyValue(value: unknown, keyVouched: boolean): unknown {
  if (Array.isArray(value)) {
    return value.map(entry => filterBodyValue(entry, keyVouched));
  }

  if (!isPlainObject(value)) {
    return keyVouched ? value : FILTERED_VALUE;
  }

  const result: Record<string, unknown> = {};
  for (const [key, nested] of Object.entries(value)) {
    result[key] = shouldFilterDataKey(key, true) ? FILTERED_VALUE : filterBodyValue(nested, true);
  }
  return result;
}
