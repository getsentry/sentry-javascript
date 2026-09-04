import type { Client } from '../../client';
import { getClient } from '../../currentScopes';
import type { SqlDialect } from '../sql';
import { sanitizeSqlQuery } from '../sql';

/**
 * Applies `dataCollection.databaseQueryData` to a SQL statement the SDK collected itself, for use as
 * `db.query.text`.
 *
 * A statement can carry inline literal values (`WHERE email = 'jane@example.com'`), which the spec
 * counts as database query data. Sanitized statements are not gated, so with the option off the
 * literals are replaced with `?` rather than the attribute being dropped — the shape of the query
 * stays available for debugging.
 *
 * Pass the `client` the statement belongs to whenever one is at hand; falling back to `getClient()`
 * resolves against the current scope, which is the wrong client in a multi-client setup.
 */
export function filterCollectedDbQueryText(query: string, dialect?: SqlDialect, client?: Client): string;
export function filterCollectedDbQueryText(
  query: string | undefined,
  dialect?: SqlDialect,
  client?: Client,
): string | undefined;
export function filterCollectedDbQueryText(
  query: string | undefined,
  dialect?: SqlDialect,
  client?: Client,
): string | undefined {
  if (query === undefined) {
    return undefined;
  }
  // Instrumentation can run before a client exists; collecting is the documented default.
  const collect = (client ?? getClient())?.getDataCollectionOptions().databaseQueryData !== false;
  return collect ? query : sanitizeSqlQuery(query, dialect);
}
