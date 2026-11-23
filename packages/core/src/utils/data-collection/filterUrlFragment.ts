import type { CollectBehavior } from '../../types/datacollection';
import { filterQueryPair } from './filterQueryParams';

/**
 * Filters a URL fragment (without the leading `#`) according to a `CollectBehavior`.
 *
 * Fragments can carry the same secrets as query strings, e.g. OAuth implicit-flow redirects
 * (`#access_token=...`) or hash-based routing (`#/callback?token=...`). `key=value` pairs are filtered like
 * query params: after the first `?` if there is one, across the whole fragment otherwise. Segments without
 * a `=`, such as an anchor (`details`) or a hash route path (`/settings`), are kept as-is so they stay useful
 * for debugging.
 *
 * Returns `undefined` when the fragment must not be collected at all.
 */
export function filterUrlFragment(fragment: string, behavior: CollectBehavior): string | undefined {
  if (!fragment || behavior === false) {
    return undefined;
  }

  const queryStart = fragment.indexOf('?');
  const prefix = queryStart === -1 ? '' : fragment.slice(0, queryStart + 1);
  const pairs = queryStart === -1 ? fragment : fragment.slice(queryStart + 1);

  const filtered = pairs
    .split('&')
    .map(segment => (segment.includes('=') ? filterQueryPair(segment, behavior) : segment))
    .join('&');

  return `${prefix}${filtered}`;
}
