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
 * query.
 */
export function targetsCloudflareInternalTable(
  querySummary: string | undefined,
  allowlist?: Array<string | RegExp>,
): boolean {
  if (!querySummary) {
    return false;
  }

  const [, ...tables] = querySummary.split(' ');

  return tables.some(table => {
    if (!table.toLowerCase().startsWith('cf_')) {
      return false;
    }

    // A table on the allowlist is treated as a user table and stays instrumented, even though it
    // matches the reserved prefix.
    return !allowlist?.length || !stringMatchesSomePattern(table, allowlist, true);
  });
}
