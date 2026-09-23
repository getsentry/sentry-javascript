import { getSqlQuerySummary, sanitizeSqlQuery } from '@sentry/server-utils';

export interface SanitizedSqlQuery {
  /** The sanitized statement, used as `db.query.text`. */
  text: string;
  /** The `db.query.summary` derived from `text`. */
  summary: string | undefined;
}

const MAX_ENTRIES = 200;
const MAX_CACHED_QUERY_LENGTH = 2000;
const cache = new Map<string, SanitizedSqlQuery>();

/**
 * Returns the sanitized statement and its summary, cached per raw statement.
 *
 * Apps run the same statement many times with different bindings, so this skips the regex work on
 * repeat calls. Statements longer than `MAX_CACHED_QUERY_LENGTH` are not cached, to cap memory.
 */
export function getSanitizedSqlQuery(query: string): SanitizedSqlQuery {
  const cached = cache.get(query);
  if (cached) {
    return cached;
  }

  const text = sanitizeSqlQuery(query);
  const result = { text, summary: getSqlQuerySummary(text) };

  if (query.length <= MAX_CACHED_QUERY_LENGTH) {
    if (cache.size >= MAX_ENTRIES) {
      cache.clear();
    }
    cache.set(query, result);
  }

  return result;
}
