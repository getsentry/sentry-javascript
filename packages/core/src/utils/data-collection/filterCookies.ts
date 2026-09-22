import type { CollectBehavior } from '../../types/datacollection';
import { cookiePairsToRecord, parseCookieHeader } from '../cookie';
import { SENSITIVE_COOKIE_NAME_SNIPPETS } from './filtering-snippets';
import { filterKeyValueData } from './filterKeyValueData';

/**
 * Filters a `Cookie` / `Set-Cookie` header string according to a `CollectBehavior`.
 *
 * Each named cookie is filtered independently. A nameless cookie (`"opaque-blob"`, `"=opaque-blob"`)
 * is reported as `{ '': '[Filtered]' }`, since its token is the value.
 *
 * @param headerName - `'set-cookie'` keeps only the cookie pair and ignores the attributes (`Path`, `Max-Age`, ...)
 */
export function filterCookies(
  cookieString: string,
  behavior: CollectBehavior,
  headerName: 'cookie' | 'set-cookie',
): Record<string, string> {
  if (behavior === false) {
    return {};
  }

  const cookies = cookiePairsToRecord(parseCookieHeader(cookieString, headerName));
  return filterKeyValueData(cookies, behavior, SENSITIVE_COOKIE_NAME_SNIPPETS);
}
