import { isPlainObject } from '../is';
import { FILTERED_VALUE } from './filtering-snippets';
import { shouldFilterDataKey } from './filterKeyValueData';
import { filterQueryParams } from './filterQueryParams';

/** Matches `key=value&key2=value2` bodies, the only non-JSON shape whose keys the denylist can check. */
const FORM_BODY_RE = /^[^=&]+=[^&]*(?:&[^=&]+=[^&]*)*$/;

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

  if (FORM_BODY_RE.test(body)) {
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

  // Null prototype so user-controlled keys like `__proto__` cannot pollute (CodeQL js/remote-property-injection).
  const result: Record<string, unknown> = Object.create(null);
  for (const [key, nested] of Object.entries(value)) {
    result[key] = shouldFilterDataKey(key, true) ? FILTERED_VALUE : filterBodyValue(nested);
  }
  return result;
}
