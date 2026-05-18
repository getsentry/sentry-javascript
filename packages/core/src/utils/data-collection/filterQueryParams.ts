import type { CollectBehavior } from '../../types/datacollection';
import { FILTERED_VALUE as FILTERED } from './filtering-snippets';
import { filterKeyValueData } from './filterKeyValueData';

function parseQueryParams(queryString: string): Record<string, string> | undefined {
  try {
    const params = new URLSearchParams(queryString);
    const result: Record<string, string> = {};
    params.forEach((value, key) => {
      result[key] = value;
    });
    return Object.keys(result).length > 0 ? result : undefined;
  } catch {
    return undefined;
  }
}

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

  const parsed = parseQueryParams(queryString);

  if (parsed == null) {
    return FILTERED;
  }

  return filterKeyValueData(parsed, behavior);
}
