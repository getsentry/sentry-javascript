import type { CollectBehavior } from '../../types/datacollection';
import { FILTERED_VALUE } from './filtering-snippets';
import { shouldFilterDataKey } from './filterKeyValueData';

/**
 * Filters a single `key=value` (or bare `key`) query pair according to a `CollectBehavior`.
 *
 * The key is decoded for filtering, while the pair keeps its original encoding.
 */
export function filterQueryPair(pair: string, behavior: CollectBehavior): string {
  const separatorIndex = pair.indexOf('=');
  const encodedKey = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);
  const key = new URLSearchParams(`${encodedKey}=`).keys().next().value;

  return key !== undefined && shouldFilterDataKey(key, behavior) ? `${encodedKey}=${FILTERED_VALUE}` : pair;
}

/**
 * Filters a query parameter string according to a `CollectBehavior`.
 *
 * Parameter names are decoded for filtering, while the original encoding, order, and duplicate keys are preserved.
 */
export function filterQueryParams(queryString: string, behavior: CollectBehavior): string | undefined {
  if (!queryString || behavior === false) {
    return undefined;
  }

  return queryString
    .split('&')
    .map(pair => filterQueryPair(pair, behavior))
    .join('&');
}
