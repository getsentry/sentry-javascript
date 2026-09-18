import type { CollectBehavior } from '../../types/datacollection';
import { filterQueryParams } from './filterQueryParams';

/**
 * Applies a `CollectBehavior` to the query string of a full URL, leaving every other URL component
 * (scheme, host, path, fragment) untouched.
 *
 * The query is located by string offsets rather than by parsing, so the URL is returned byte-for-byte
 * apart from the query itself. This keeps relative URLs, non-HTTP schemes and unusual encodings intact,
 * none of which survive a `URL` round-trip.
 *
 * Returns the URL with its query filtered, or with the query removed entirely when collection is off.
 */
export function filterUrlQuery(url: string, behavior: CollectBehavior): string {
  // The fragment is delimited first: a `?` after a `#` belongs to the fragment, not the query.
  const fragmentStart = url.indexOf('#');
  const queryEnd = fragmentStart === -1 ? url.length : fragmentStart;

  const queryStart = url.indexOf('?');
  if (queryStart === -1 || queryStart > queryEnd) {
    return url;
  }

  const prefix = url.slice(0, queryStart);
  const query = url.slice(queryStart + 1, queryEnd);
  const suffix = url.slice(queryEnd);

  const filtered = filterQueryParams(query, behavior);

  return filtered ? `${prefix}?${filtered}${suffix}` : `${prefix}${suffix}`;
}
