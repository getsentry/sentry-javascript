import type { CollectBehavior } from '../../types/datacollection';
import { FILTERED_VALUE } from './filtering-snippets';
import { shouldFilterDataKey } from './filterKeyValueData';

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
    .map(pair => {
      const separatorIndex = pair.indexOf('=');
      const encodedKey = separatorIndex === -1 ? pair : pair.slice(0, separatorIndex);
      const key = new URLSearchParams(`${encodedKey}=`).keys().next().value;

      return key !== undefined && shouldFilterDataKey(key, behavior) ? `${encodedKey}=${FILTERED_VALUE}` : pair;
    })
    .join('&');
}
