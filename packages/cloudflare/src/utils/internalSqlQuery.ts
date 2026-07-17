/**
 * Cloudflare frameworks that build on Durable Objects (`agents`, `partyserver`, ...) manage their
 * own internal SQLite tables, all namespaced with a `cf_` prefix — e.g. `cf_agents_schedules`,
 * `cf_agent_state`, `cf_ai_chat_stream_chunks`. Queries against them (schedule polling, chat-stream
 * persistence, state bookkeeping) are framework implementation details that otherwise flood traces
 * with dozens of zero-signal `db.query` spans per request. The exact set of tables even varies
 * between framework versions, so we match the reserved prefix rather than an enumerated list.
 *
 * User tables never use this prefix, so skipping their spans by default is safe. Users can opt back
 * in via `includeCloudflareInternalSpans`.
 *
 * The check operates on the query summary produced by `getSqlQuerySummary` (`{operation} {table} ...`,
 * the same value used as the span name), so table targets are already isolated from the rest of the
 * query.
 */
export function targetsCloudflareInternalTable(querySummary: string | undefined): boolean {
  if (!querySummary) {
    return false;
  }

  const [, ...tables] = querySummary.split(' ');

  return tables.some(table => table.toLowerCase().startsWith('cf_'));
}
