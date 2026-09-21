import type { CollectBehavior } from '../../types/datacollection';
import { cookiePairsToRecord, parseCookieHeader } from '../cookie';
import { FILTERED_VALUE as FILTERED, SENSITIVE_COOKIE_NAME_SNIPPETS } from './filtering-snippets';
import { filterKeyValueData } from './filterKeyValueData';

/**
 * Filters a `Cookie` / `Set-Cookie` header string according to a `CollectBehavior`.
 *
 * Each named cookie is filtered independently. A nameless cookie (`"opaque-blob"`, `"=opaque-blob"`)
 * is reported as `{ '': '[Filtered]' }`, since its token is the value. When the string holds no
 * cookie at all, the entire string is replaced with `[Filtered]`.
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

    // A non-empty string we cannot parse may still hold a session token, so it counts as sensitive.
    if (Object.keys(cookies).length === 0) {
      return cookieString ? FILTERED : {};
    }

    return filterKeyValueData(cookies, behavior, SENSITIVE_COOKIE_NAME_SNIPPETS);
  } catch {
    return FILTERED;
  }
}
