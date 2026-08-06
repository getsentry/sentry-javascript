import { getClient } from '../../currentScopes';
import type { CollectBehavior } from '../../types/datacollection';
import { filterQueryParams } from './filterQueryParams';
import { filterUrlQuery } from './filterUrlQuery';

function urlQueryParamsBehavior(): CollectBehavior {
  // Instrumentation can run before a client exists; the denylist default is the safe fallback.
  return getClient()?.getDataCollectionOptions().urlQueryParams ?? true;
}

/**
 * Applies `dataCollection.urlQueryParams` to a URL the SDK collected itself, for use as `url.full`.
 *
 * Call this at every site where instrumentation records a URL. Routing the SDK's own URLs through a
 * helper is what makes the filtering provenance-correct: a URL a user attaches themselves never passes
 * through here, and `dataCollection` is only meant to gate automatically collected data.
 */
export function filterCollectedUrl(url: string): string;
export function filterCollectedUrl(url: string | undefined): string | undefined;
export function filterCollectedUrl(url: string | undefined): string | undefined {
  return url === undefined ? undefined : filterUrlQuery(url, urlQueryParamsBehavior());
}

/**
 * Applies `dataCollection.urlQueryParams` to a query string the SDK collected itself, for use as
 * `url.query`. Returns `undefined` when the query must not be collected at all.
 *
 * See {@link filterCollectedUrl} for why this is a helper rather than a central pass.
 */
export function filterCollectedUrlQuery(query: string | undefined): string | undefined {
  return query ? filterQueryParams(query, urlQueryParamsBehavior()) : undefined;
}
