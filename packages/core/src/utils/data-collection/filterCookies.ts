import type { CollectBehavior } from '../../types/datacollection';
import { parseCookiePairs } from '../cookie';
import { FILTERED_VALUE as FILTERED, SENSITIVE_COOKIE_NAME_SNIPPETS } from './filtering-snippets';
import { filterKeyValueData } from './filterKeyValueData';

/**
 * Filters a cookie string according to a `CollectBehavior`.
 *
 * When individual cookies can be parsed, each key-value pair is filtered
 * independently. When parsing fails, the entire string is replaced with `[Filtered]`.
 * A nameless segment is dropped: a record key cannot carry a `[Filtered]` marker
 * without leaking the bare token.
 */
export function filterCookies(cookieString: string, behavior: CollectBehavior): Record<string, string> | string {
  if (behavior === false) {
    return {};
  }

  try {
    const parsed: Record<string, string> = {};

    for (const [name, value] of parseCookiePairs(cookieString)) {
      // only assign once
      if (name !== '' && !(name in parsed)) {
        parsed[name] = value;
      }
    }

    if (Object.keys(parsed).length === 0) {
      return {};
    }

    return filterKeyValueData(parsed, behavior, SENSITIVE_COOKIE_NAME_SNIPPETS);
  } catch {
    return FILTERED;
  }
}
