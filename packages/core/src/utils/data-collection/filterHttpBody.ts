import { isPlainObject } from '../is';
import { FILTERED_VALUE } from './filtering-snippets';
import { shouldFilterDataKey } from './filterKeyValueData';
import { filterQueryParams } from './filterQueryParams';

/**
 * One `&`-separated form segment: empty, a bare key, or `key=value`. Keys are limited to the
 * characters `application/x-www-form-urlencoded` encoding produces and raw whitespace disqualifies
 * (encoded forms write spaces as `+` or `%20`), so XML, multipart, prose, and URLs never count as
 * a pseudo-form that the filter would then rewrite.
 */
const FORM_SEGMENT_RE = /^(?:[\w%.*+-]+(?:=[^&\s]*)?)?$/;

/**
 * A form body is `&`-separated `key=value` pairs, the only non-JSON shape whose keys the denylist
 * can check. Valueless keys, empty segments, and a trailing `&` are tolerated — a too-strict gate
 * would let a body like `password=secret&` skip the filter and ship raw. At least one `=` is
 * required so prose is never rewritten as a pseudo-form.
 */
function isFormBody(body: string): boolean {
  return body.includes('=') && body.split('&').every(segment => FORM_SEGMENT_RE.test(segment));
}

/**
 * Scrubs the values of known-sensitive keys in an HTTP body the SDK collected itself, before it
 * becomes `request.data` or `http.request.body.data`.
 *
 * Only values the SDK can attribute to a sensitive key are replaced. Everything else passes
 * through unchanged: Relay scrubs server-side anyway and cannot tell an SDK-filtered value from a
 * literal one, so client-side filtering beyond known-sensitive keys only destroys data.
 */
export function filterCollectedHttpBody(body: unknown): unknown {
  if (typeof body === 'string') {
    return filterCollectedHttpBodyString(body);
  }

  return isPlainObject(body) || Array.isArray(body) ? filterBodyValue(body) : body;
}

/**
 * String-only variant of {@link filterCollectedHttpBody}. Capture sites call this before they
 * truncate, because a truncated JSON body no longer parses and would pass through unfiltered.
 */
export function filterCollectedHttpBodyString(body: string): string {
  if (!body) {
    return body;
  }

  try {
    const json: unknown = JSON.parse(body);
    if (typeof json === 'object' && json !== null) {
      return JSON.stringify(filterBodyValue(json));
    }
  } catch {
    // Not JSON. The form-encoded attempt below runs instead.
  }

  if (isFormBody(body)) {
    // The query-param filter keeps the body's original encoding byte-for-byte.
    return filterQueryParams(body, true) ?? body;
  }

  return body;
}

function filterBodyValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(filterBodyValue);
  }

  if (!isPlainObject(value)) {
    return value;
  }

  // `Object.fromEntries` instead of assigning `result[key]`, so user-controlled keys like
  // `__proto__` never hit a computed property write (CodeQL js/remote-property-injection).
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [
      key,
      shouldFilterDataKey(key, true) ? FILTERED_VALUE : filterBodyValue(nested),
    ]),
  );
}
