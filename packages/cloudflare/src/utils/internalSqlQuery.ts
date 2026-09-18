import { stringMatchesSomePattern } from '@sentry/core';

/**
 * Cloudflare frameworks that build on Durable Objects (`agents`, `partyserver`, ...) manage their
 * own internal SQLite tables, all namespaced with a `cf_` prefix — e.g. `cf_agents_schedules`,
 * `cf_agent_state`, `cf_ai_chat_stream_chunks`. Queries against them (schedule polling, chat-stream
 * persistence, state bookkeeping) are framework implementation details that otherwise flood traces
 * with dozens of zero-signal `db.query` spans per request. The exact set of tables even varies
 * between framework versions, so we match the reserved prefix rather than an enumerated list.
 *
 * The `cf_` prefix is a reserved convention for framework-managed tables, so user tables should not
 * use it. In case a user table does collide with the prefix, the `durableObjectSqlSpanAllowlist`
 * option lets them opt those tables back into instrumentation.
 *
 * The check operates on the query summary produced by `getSqlQuerySummary` (`{operation} {table} ...`,
 * the same value used as the span name), so table targets are already isolated from the rest of the
 * query. The one exception is `CREATE INDEX`: its summary carries the index name, not the indexed
 * table (upstream OTel convention), so the `cf_` target only appears in the ON clause of the full
 * statement, which `queryText` is needed for.
 */
export function targetsCloudflareInternalTable(
  querySummary: string | undefined,
  allowlist?: Array<string | RegExp>,
  queryText?: string,
): boolean {
  if (!querySummary) {
    return false;
  }

  const indexedTable = queryText ? CREATE_INDEX_TABLE_RE.exec(queryText)?.groups?.['table'] : undefined;
  if (indexedTable) {
    return isCloudflareInternalTable(indexedTable, allowlist);
  }

  const [, ...tables] = querySummary.split(' ');

  return tables.some(table => isCloudflareInternalTable(table, allowlist));
}

// `CREATE [UNIQUE] INDEX [IF NOT EXISTS] <name> ON <table>` — the IF EXISTS shape mirrors DDL_RE
// in @sentry/core.
const CREATE_INDEX_TABLE_RE =
  /^\s*CREATE\s+(?:UNIQUE\s+)?INDEX(?:\s+IF\s+(?:NOT\s+)?EXISTS)?\s+[^\s(,;)]+\s+ON\s+(?<table>[^\s(,;)]+)/i;

function isCloudflareInternalTable(table: string, allowlist?: Array<string | RegExp>): boolean {
  if (!table.toLowerCase().startsWith('cf_')) {
    return false;
  }

  // A table on the allowlist is treated as a user table and stays instrumented, even though it
  // matches the reserved prefix.
  return !allowlist?.length || !stringMatchesSomePattern(table, allowlist, true);
}
