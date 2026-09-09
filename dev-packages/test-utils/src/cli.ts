import { spawnSync } from 'node:child_process';

/**
 * Spans only become queryable once they have made it through to EAP, which takes
 * noticeably longer than the error pipeline (~2min vs ~20s when this was measured).
 */
export const EVENT_POLLING_OPTIONS = { timeout: 180_000, intervals: [5_000] };

/**
 * A node of the span tree returned by `sentry trace view`. Spans, errors and occurrences all
 * share this shape and are discriminated by `event_type`.
 */
export interface TraceItem {
  /** On a span this is the span id. */
  event_id?: string;
  event_type?: 'span' | 'error' | 'occurrence' | 'uptime_check';
  op?: string | null;
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

/**
 * Fetch a trace of the E2E test project through the `sentry` CLI, which the calling test app has to
 * list as a dev dependency. Returns an empty list while the trace has not landed yet.
 */
export function fetchTrace(traceId: string): TraceItem[] {
  const target = traceTarget(traceId);
  const result = spawnSync('pnpm', ['exec', 'sentry', 'trace', 'view', target, '--json', '--fresh'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      // The E2E token is the only credential CI has. Locally the CLI would prefer a stored login
      // over an env token, so force the env token for identical behaviour everywhere.
      SENTRY_AUTH_TOKEN: process.env['E2E_TEST_AUTH_TOKEN'],
      SENTRY_FORCE_ENV_TOKEN: '1',
    },
  });

  if (result.status === 0) {
    return (JSON.parse(result.stdout) as { spans?: TraceItem[] }).spans ?? [];
  }

  // Exit codes 10-19 are auth errors, and a rejected token also surfaces as an API error (exit 30)
  // with a 401 in the message. Neither resolves by waiting, so fail loudly instead of polling until
  // the timeout and reporting it as a missing event. The trace endpoint is org scoped, so the token
  // needs `org:read` on top of the project scopes.
  const isAuthError = result.status !== null && result.status >= 10 && result.status < 20;
  if (isAuthError || /\b40[13]\b/.test(result.stderr)) {
    throw new Error(
      `sentry trace view ${target} failed with exit code ${result.status}: ${result.stderr}` +
        'E2E_TEST_AUTH_TOKEN needs the `org:read` scope.',
    );
  }

  // Exit code 23 means the trace has not landed yet. Log anything else, since a rejected request
  // and a trace that has not landed are otherwise indistinguishable.
  if (result.status !== 23) {
    // eslint-disable-next-line no-console
    console.log(`sentry trace view ${target} exited with ${result.status}: ${result.stderr}`);
  }

  return [];
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
