import type { CollectBehavior } from '../../types/datacollection';
import { parseCookie } from '../cookie';
import { FILTERED_VALUE as FILTERED, SENSITIVE_COOKIE_NAME_SNIPPETS } from './filtering-snippets';
import { filterKeyValueData } from './filterKeyValueData';

/**
 * Filters a cookie string according to a `CollectBehavior`.
 *
 * When individual cookies can be parsed, each key-value pair is filtered
 * independently. When parsing fails, the entire string is replaced with `[Filtered]`.
 */
export function filterCookies(cookieString: string, behavior: CollectBehavior): Record<string, string> | string {
  if (behavior === false) {
    return {};
  }

  try {
    const parsed = parseCookie(cookieString);

    if (Object.keys(parsed).length === 0) {
      return {};
    }

    return filterKeyValueData(parsed, behavior, SENSITIVE_COOKIE_NAME_SNIPPETS);
  } catch {
    return FILTERED;
  }
}
