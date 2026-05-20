import type { CollectBehavior } from '../../types/datacollection';
import { FILTERED_VALUE as FILTERED } from './filtering-snippets';
import { filterKeyValueData } from './filterKeyValueData';

/**
 * Filters a query parameter string according to a `CollectBehavior`.
 *
 * When individual params can be parsed, each key-value pair is filtered
 * independently. When parsing fails, the entire string is replaced with `[Filtered]`.
 */
export function filterQueryParams(queryString: string, behavior: CollectBehavior): Record<string, string> | string {
  if (behavior === false) {
    return {};
  }

  try {
    const params = new URLSearchParams(queryString);
    const parsed: Record<string, string> = {};
    params.forEach((value, key) => {
      parsed[key] = value;
    });

    if (Object.keys(parsed).length === 0) {
      return {};
    }

    return filterKeyValueData(parsed, behavior);
  } catch {
    return FILTERED;
  }
}
