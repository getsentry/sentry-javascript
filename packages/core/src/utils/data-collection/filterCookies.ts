import type { CollectBehavior } from '../../types/datacollection';
import { cookiePairsToRecord, parseCookieHeader } from '../cookie';
import { FILTERED_VALUE as FILTERED, SENSITIVE_COOKIE_NAME_SNIPPETS } from './filtering-snippets';
import { filterKeyValueData } from './filterKeyValueData';

/**
 * Filters a `Cookie` / `Set-Cookie` header string according to a `CollectBehavior`.
 *
 * Each named cookie is filtered independently. When the string holds no named cookie, the entire
 * string is replaced with `[Filtered]`.
 * A nameless segment inside an otherwise parseable string (`"opaque-blob; theme=dark"`) is
 * dropped, since a record key cannot carry a `[Filtered]` marker without leaking the token.
 *
 * @param headerName - `'set-cookie'` keeps only the cookie pair and ignores the attributes (`Path`, `Max-Age`, ...)
 */
export function filterCookies(
  cookieString: string,
  behavior: CollectBehavior,
  headerName: 'cookie' | 'set-cookie' = 'cookie',
): Record<string, string> | string {
  if (behavior === false) {
    return {};
  }

  try {
    const cookies = cookiePairsToRecord(parseCookieHeader(cookieString, headerName));

    // A non-empty string without a named cookie may still hold a session token, so it counts as sensitive.
    if (Object.keys(cookies).length === 0) {
      return cookieString ? FILTERED : {};
    }

    return filterKeyValueData(cookies, behavior, SENSITIVE_COOKIE_NAME_SNIPPETS);
  } catch {
    return FILTERED;
  }
}
