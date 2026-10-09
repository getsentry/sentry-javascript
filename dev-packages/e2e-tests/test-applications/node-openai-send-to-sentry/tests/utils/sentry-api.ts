const authToken = process.env.E2E_TEST_AUTH_TOKEN;
const sentryTestOrgSlug = process.env.E2E_TEST_SENTRY_ORG_SLUG;
const sentryTestProject = process.env.E2E_TEST_SENTRY_PROJECT;

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
  /** On a span this is the span name. */
  description?: string;
  children?: TraceItem[];
  errors?: TraceItem[];
  occurrences?: TraceItem[];
}

/**
 * One request to the Sentry API with the E2E token. Returns `undefined` when the connection
 * fails or drops mid-response: over the minutes a test polls, the API closes the odd
 * connection ("TypeError: terminated"), and an error thrown inside `expect.poll` fails the
 * test instead of letting it retry, so a network error is treated like a "not there yet".
 */
async function fetchSentryApi(what: string, path: string): Promise<{ status: number; body: string } | undefined> {
  try {
    const response = await fetch(`https://sentry.io/api/0/${path}`, {
      headers: { Authorization: `Bearer ${authToken}` },
    });
    return { status: response.status, body: await response.text() };
  } catch (error) {
    console.log(`${what} failed: ${error}`);
    return undefined;
  }
}

export async function fetchTrace(traceId: string): Promise<TraceItem[]> {
  const what = `Trace lookup for ${traceId}`;
  const response = await fetchSentryApi(what, `organizations/${sentryTestOrgSlug}/trace/${traceId}/?statsPeriod=1h`);
  if (!response) {
    return [];
  }

  // The trace endpoint is org scoped, so the auth token needs `org:read` on top of the
  // project scopes the other assertions rely on. That never resolves by waiting, so fail
  // loudly instead of polling until the timeout and reporting it as a missing event.
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `${what} was rejected with ${response.status}: ${response.body}. ` +
        'E2E_TEST_AUTH_TOKEN needs the `org:read` scope.',
    );
  }

  // Empty traces and the occasional rate limit are expected while polling, so treat anything
  // else that is not a success as "not there yet" -- but log it, since a rejected request and
  // a trace that has not landed are otherwise indistinguishable.
  if (response.status !== 200) {
    console.log(`${what} returned ${response.status}: ${response.body}`);
    return [];
  }

  return JSON.parse(response.body);
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

export async function findSpanInTrace(traceId: string, op: string): Promise<TraceItem | undefined> {
  return flattenTrace(await fetchTrace(traceId)).find(item => item.op === op);
}

/**
 * The attributes of one span, keyed by name, as Sentry stores them. The trace endpoint only carries
 * a span's op, name and place in the tree; the attributes come from the project trace-items
 * endpoint. Returns `undefined` while the span has not landed.
 *
 * Ingest normalises what the SDK sent: `sentry.origin` comes back as `origin`, `sentry.op` as
 * `span.op`, `gen_ai.response.text` as `gen_ai.output.messages`, and some numbers are indexed as
 * tags (`tags[<name>,number]`). Integers are returned as strings and are converted here; everything
 * else is passed through as is.
 */
export async function fetchSpanAttributes(
  traceId: string,
  spanId: string,
): Promise<Record<string, unknown> | undefined> {
  const what = `Span lookup for ${spanId}`;
  const response = await fetchSentryApi(
    what,
    `projects/${sentryTestOrgSlug}/${sentryTestProject}/trace-items/${spanId}/?trace_id=${traceId}&item_type=spans`,
  );
  if (!response) {
    return undefined;
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `${what} was rejected with ${response.status}: ${response.body}. ` +
        'E2E_TEST_AUTH_TOKEN needs the `org:read` scope.',
    );
  }

  if (response.status !== 200) {
    if (response.status !== 404) {
      console.log(`${what} returned ${response.status}: ${response.body}`);
    }
    return undefined;
  }

  const { attributes } = JSON.parse(response.body) as { attributes?: { name: string; type: string; value: unknown }[] };
  return Object.fromEntries(
    (attributes ?? []).map(({ name, type, value }) => [name, type === 'int' ? Number(value) : value]),
  );
}
