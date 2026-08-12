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
  event_id?: string;
  /** On spans this is the event id of the transaction the span belongs to. */
  transaction_id?: string;
  event_type?: 'span' | 'error' | 'occurrence' | 'uptime_check';
  op?: string;
  is_transaction?: boolean;
  children?: TraceItem[];
  errors?: TraceItem[];
  occurrences?: TraceItem[];
}

export async function fetchTrace(traceId: string): Promise<TraceItem[]> {
  const response = await fetch(
    `https://sentry.io/api/0/organizations/${sentryTestOrgSlug}/trace/${traceId}/?statsPeriod=1h`,
    { headers: { Authorization: `Bearer ${authToken}` } },
  );

  // While polling we expect to see empty traces and the occasional rate limit, so anything
  // other than a successful response is treated as "not there yet". Log it regardless -- a
  // rejected request and a trace that has not landed yet are otherwise indistinguishable,
  // which makes a permanently failing lookup look like a timeout.
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

export async function findTransactionInTrace(traceId: string, eventId: string): Promise<TraceItem | undefined> {
  return flattenTrace(await fetchTrace(traceId)).find(item => item.is_transaction && item.transaction_id === eventId);
}
