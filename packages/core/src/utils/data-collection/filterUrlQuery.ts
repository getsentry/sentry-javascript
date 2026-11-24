import type { CollectBehavior } from '../../types/datacollection';
import { filterQueryParams } from './filterQueryParams';
import { filterUrlFragment } from './filterUrlFragment';

/**
 * Applies a `CollectBehavior` to the query string and fragment of a full URL, leaving every other URL
 * component (scheme, host, path) untouched.
 *
 * The query and fragment are located by string offsets rather than by parsing, so the URL is returned
 * byte-for-byte apart from those two parts. This keeps relative URLs, non-HTTP schemes and unusual encodings
 * intact, none of which survive a `URL` round-trip.
 *
 * Returns the URL with its query and fragment filtered, or with both removed entirely when collection is off.
 */
export function filterUrlQuery(url: string, behavior: CollectBehavior): string {
  // The fragment is delimited first: a `?` after a `#` belongs to the fragment, not the query.
  const fragmentStart = url.indexOf('#');
  const beforeFragment = fragmentStart === -1 ? url : url.slice(0, fragmentStart);
  const fragment = fragmentStart === -1 ? undefined : url.slice(fragmentStart + 1);

  const queryStart = beforeFragment.indexOf('?');
  let filteredUrl = beforeFragment;
  if (queryStart !== -1) {
    const filteredQuery = filterQueryParams(beforeFragment.slice(queryStart + 1), behavior);
    filteredUrl = `${beforeFragment.slice(0, queryStart)}${filteredQuery ? `?${filteredQuery}` : ''}`;
  }

  const filteredFragment = fragment === undefined ? undefined : filterUrlFragment(fragment, behavior);

  return filteredFragment ? `${filteredUrl}#${filteredFragment}` : filteredUrl;
}
