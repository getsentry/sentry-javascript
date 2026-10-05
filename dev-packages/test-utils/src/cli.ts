import { spawnSync } from 'node:child_process';
import type { SpawnSyncReturns } from 'node:child_process';

/**
 * Spans only become queryable once they have made it through to EAP, which takes
 * noticeably longer than the error pipeline (~2min vs ~20s when this was measured).
 */
export const EVENT_POLLING_OPTIONS = { timeout: 180_000, intervals: [5_000] };

/**
 * A node of the span tree returned by the trace endpoint. Spans, errors and occurrences all
 * share this shape and are discriminated by `event_type`.
 */
export interface TraceItem {
  /** On a span this is the span id. */
  event_id?: string;
  /** On a span this is the span id of its parent span. */
  parent_span_id?: string | null;
  event_type?: 'span' | 'error' | 'occurrence' | 'uptime_check';
  op?: string | null;
  /** On a span this is the span name. */
  description?: string | null;
  children?: TraceItem[] | null;
  errors?: TraceItem[] | null;
  occurrences?: TraceItem[] | null;
}

/**
 * The `sentry trace view` target of a trace in the E2E test project, so a log line can be pasted
 * into a terminal as-is.
 */
export function traceTarget(traceId: string): string {
  return `${process.env['E2E_TEST_SENTRY_ORG_SLUG']}/${process.env['E2E_TEST_SENTRY_PROJECT']}/${traceId}`;
}

function runSentryCli(args: string[]): SpawnSyncReturns<string> {
  const result = spawnSync('pnpm', ['exec', 'sentry', ...args], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
    env: {
      ...process.env,
      // The E2E token is the only credential CI has. Locally the CLI would prefer a stored login
      // over an env token, so force the env token for identical behaviour everywhere.
      SENTRY_AUTH_TOKEN: process.env['E2E_TEST_AUTH_TOKEN'],
      SENTRY_FORCE_ENV_TOKEN: '1',
      // Every call polls for data that is still arriving. `sentry api` has no `--fresh` flag and would
      // otherwise answer every poll from the cached response of the first one.
      SENTRY_NO_CACHE: '1',
    },
  });

  if (result.error) {
    throw new Error(
      `Could not run \`pnpm exec sentry ${args[0]}\`: ${result.error.message}. ` +
        'The test app needs `sentry` as a dev dependency.',
    );
  }

  return result;
}

/**
 * The API rate limit is shared by every GET request of the E2E token's user, so concurrent jobs can
 * exhaust it. The callers poll anyway, so a rate limited request is treated like data that has not
 * landed yet instead of failing the test.
 */
function isRateLimited(result: SpawnSyncReturns<string>): boolean {
  return /\b429\b|too frequently/i.test(`${result.stdout}${result.stderr}`);
}

/**
 * Fetch a trace of the E2E test project through the `sentry` CLI, which the calling test app has to
 * list as a dev dependency. Returns an empty list while the trace has not landed yet.
 *
 * This calls the trace endpoint directly instead of `sentry trace view --json`, which also looks up
 * the project and fetches the details of every span, one request each. That turns every poll into
 * dozens of requests and gets the E2E token rate limited.
 */
export function fetchTrace(traceId: string): TraceItem[] {
  const params = new URLSearchParams({ project: '-1', statsPeriod: '1h', limit: '10000' });
  const path = `/organizations/${process.env['E2E_TEST_SENTRY_ORG_SLUG']}/trace/${traceId}/?${params}`;
  const result = runSentryCli(['api', path]);

  if (result.status === 0) {
    return JSON.parse(result.stdout) as TraceItem[];
  }

  if (isRateLimited(result)) {
    return [];
  }

  // Exit codes 10-19 are auth errors, and a rejected token also surfaces as an API error with a 401
  // or 403 in the message. Neither resolves by waiting, so fail loudly instead of polling until the
  // timeout and reporting it as a missing event. The trace endpoint is org scoped, so the token needs
  // `org:read` on top of the project scopes.
  const isAuthError = result.status !== null && result.status >= 10 && result.status < 20;
  if (isAuthError || /\b40[13]\b/.test(`${result.stdout}${result.stderr}`)) {
    throw new Error(
      `sentry api ${path} failed with exit code ${result.status}: ${result.stdout}${result.stderr}` +
        'E2E_TEST_AUTH_TOKEN needs the `org:read` scope.',
    );
  }

  throw new Error(`sentry api ${path} exited with ${result.status}: ${result.stdout}${result.stderr}`);
}

/**
 * Fetch all attributes of a span in the E2E test project, keyed by attribute name. Returns
 * `undefined` while the span is not queryable yet.
 *
 * `sentry trace view --json` cannot be used for this: the trace-items endpoint sends `int` attribute
 * values as strings, the CLI's schema rejects that, and the CLI then drops all attributes of the span.
 */
export function fetchSpanAttributes(traceId: string, spanId: string): Record<string, unknown> | undefined {
  const path =
    `/projects/${process.env['E2E_TEST_SENTRY_ORG_SLUG']}/${process.env['E2E_TEST_SENTRY_PROJECT']}` +
    `/trace-items/${spanId}/?trace_id=${traceId}&item_type=spans`;
  const result = runSentryCli(['api', path]);

  if (result.status === 0) {
    const { attributes } = JSON.parse(result.stdout) as { attributes: { name: string; value: unknown }[] };
    return Object.fromEntries(attributes.map(({ name, value }) => [name, value]));
  }

  if (result.stdout.includes('"Not found."') || isRateLimited(result)) {
    return undefined;
  }

  throw new Error(`sentry api ${path} exited with ${result.status}: ${result.stdout}${result.stderr}`);
}

/** An error event in the shape the Sentry API returns it. The exception is the entry of type `exception`. */
export interface ApiEvent {
  entries: {
    type: string;
    data: { values?: { type?: string; value?: string; mechanism?: { type?: string; handled?: boolean } }[] };
  }[];
}

/** Fetch an error event of the E2E test project. Returns `undefined` while the event is not stored yet. */
export function fetchEvent(eventId: string): ApiEvent | undefined {
  const path =
    `/projects/${process.env['E2E_TEST_SENTRY_ORG_SLUG']}/${process.env['E2E_TEST_SENTRY_PROJECT']}` +
    `/events/${eventId}/`;
  const result = runSentryCli(['api', path]);

  if (result.status === 0) {
    return JSON.parse(result.stdout) as ApiEvent;
  }

  if (result.stdout.includes('"Event not found"') || isRateLimited(result)) {
    return undefined;
  }

  throw new Error(`sentry api ${path} exited with ${result.status}: ${result.stdout}${result.stderr}`);
}

/**
 * Search the spans of the E2E test project from the last hour, and return the trace id of a span that
 * matches `query`. `query` uses the Sentry search syntax, for example `gen_ai.conversation.id:abc`.
 * Returns `undefined` while no span matches.
 *
 * `sentry span list --json` cannot be used for this: it returns no trace id for a project search.
 */
export function findTraceIdOfSpan(query: string): string | undefined {
  const params = new URLSearchParams({
    dataset: 'spans',
    field: 'trace',
    query: `project:${process.env['E2E_TEST_SENTRY_PROJECT']} ${query}`,
    statsPeriod: '1h',
    per_page: '1',
  });
  const path = `/organizations/${process.env['E2E_TEST_SENTRY_ORG_SLUG']}/events/?${params}`;
  const result = runSentryCli(['api', path]);

  if (result.status === 0) {
    return (JSON.parse(result.stdout) as { data: { trace: string }[] }).data[0]?.trace;
  }

  if (isRateLimited(result)) {
    return undefined;
  }

  throw new Error(`sentry api ${path} exited with ${result.status}: ${result.stdout}${result.stderr}`);
}

/**
 * Errors attach to whichever span was active when they were captured, and relocate from the
 * top level into that span once it lands, so a given event can surface at any depth.
 */
export function flattenTrace(items: TraceItem[]): TraceItem[] {
  return items.flatMap(item => [
    item,
    ...flattenTrace(item.children ?? []),
    ...flattenTrace(item.errors ?? []),
    ...flattenTrace(item.occurrences ?? []),
  ]);
}

/**
 * Without an `eventId` any error in the trace matches. That is what a request the server failed
 * needs, because the client never learns the event id of an unhandled exception.
 */
export function findErrorInTrace(traceId: string, eventId?: string): TraceItem | undefined {
  return flattenTrace(fetchTrace(traceId)).find(
    item => item.event_type === 'error' && (eventId === undefined || item.event_id === eventId),
  );
}

let loggedTraceShape = false;

/**
 * Streamed spans never become transaction events, so the segment is matched by its op rather than by
 * the event id of an enclosing transaction. The trace is already unique to the request under test,
 * so the op identifies the segment within it.
 */
export function findSpanInTrace(traceId: string, op: string): TraceItem | undefined {
  const items = flattenTrace(fetchTrace(traceId));
  const match = items.find(item => item.op === op);

  // The trace endpoint's exact span shape is what this lookup depends on, so report it once when a
  // non-empty trace does not contain the op we are waiting for.
  if (!match && items.length && !loggedTraceShape) {
    loggedTraceShape = true;
    // eslint-disable-next-line no-console
    console.log(
      `Trace ${traceId} has no "${op}" item yet. Items so far:`,
      JSON.stringify(
        items.map(item => ({ event_type: item.event_type, op: item.op, event_id: item.event_id })),
        null,
        2,
      ),
    );
  }

  return match;
}
