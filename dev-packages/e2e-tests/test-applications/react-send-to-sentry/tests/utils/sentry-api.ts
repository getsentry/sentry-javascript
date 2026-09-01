const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;

/**
 * Spans only become queryable once they have made it through to EAP, which takes
 * noticeably longer than the error pipeline (~2min vs ~20s when this was measured).
 */
export const EVENT_POLLING_OPTIONS = { timeout: 180_000, intervals: [5_000] };

/**
 * A node of the span tree returned by the organization trace endpoint. Spans, errors and
 * occurrences all share this shape and are discriminated by `event_type`.
 */
export interface TraceItem {
  /** On a span this is the span id. */
  event_id?: string;
  event_type?: 'span' | 'error' | 'occurrence' | 'uptime_check';
  op?: string;
  children?: TraceItem[];
  errors?: TraceItem[];
  occurrences?: TraceItem[];
}

export async function fetchTrace(traceId: string): Promise<TraceItem[]> {
  const response = await fetch(
    `https://sentry.io/api/0/organizations/${sentryTestOrgSlug}/trace/${traceId}/?statsPeriod=1h`,
    { headers: { Authorization: `Bearer ${authToken}` } },
  );

  // The trace endpoint is org scoped, so the auth token needs `org:read` on top of the
  // project scopes the other assertions rely on. That never resolves by waiting, so fail
  // loudly instead of polling until the timeout and reporting it as a missing event.
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Trace lookup for ${traceId} was rejected with ${response.status}: ${await response.text()}. ` +
        'E2E_TEST_AUTH_TOKEN needs the `org:read` scope.',
    );
  }

  // Empty traces and the occasional rate limit are expected while polling, so treat anything
  // else that is not a success as "not there yet" -- but log it, since a rejected request and
  // a trace that has not landed are otherwise indistinguishable.
  if (!response.ok) {
    console.log(`Trace lookup for ${traceId} returned ${response.status}: ${await response.text()}`);
    return [];
  }

  return await response.json();
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

export async function findErrorInTrace(traceId: string, eventId: string): Promise<TraceItem | undefined> {
  return flattenTrace(await fetchTrace(traceId)).find(item => item.event_type === 'error' && item.event_id === eventId);
}

/**
 * Streamed spans never become transaction events, so a segment span is looked up by its span id
 * rather than by the event id of an enclosing transaction.
 */
export async function findSegmentSpanInTrace(traceId: string, spanId: string): Promise<TraceItem | undefined> {
  return flattenTrace(await fetchTrace(traceId)).find(item => item.event_type === 'span' && item.event_id === spanId);
}
