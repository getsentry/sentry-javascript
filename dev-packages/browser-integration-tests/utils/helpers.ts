/* eslint-disable max-lines */
import type { Page, Request } from '@playwright/test';
import type {
  ClientReport,
  Envelope,
  EnvelopeItem,
  EnvelopeItemType,
  Event as SentryEvent,
  EventEnvelope,
  EventEnvelopeHeaders,
  SessionContext,
  TransactionEvent,
} from '@sentry/core';
import { parseEnvelope } from '@sentry/core';

export const envelopeUrlRegex = /\.sentry\.io\/api\/\d+\/envelope\//;

export const envelopeParser = (request: Request | null): unknown[] => {
  // https://develop.sentry.dev/sdk/envelopes/
  const envelope = request?.postData() || '';

  // Third row of the envelop is the event payload.
  return envelope.split('\n').map(line => {
    try {
      return JSON.parse(line);
    } catch {
      return line;
    }
  });
};

// Rather use the `properEnvelopeRequestParser`, as the `envelopeParser` does not follow the envelope spec.
export const envelopeRequestParser = <T = SentryEvent>(request: Request | null, envelopeIndex = 2): T => {
  return envelopeParser(request)[envelopeIndex] as T;
};

/**
 * The above envelope parser does not follow the envelope spec...
 * ...but modifying it to follow the spec breaks a lot of the test which rely on the current indexing behavior.
 *
 * This parser is a temporary solution to allow us to test metrics with statsd envelopes.
 *
 * Eventually, all the tests should be migrated to use this 'proper' envelope parser!
 */
export const properEnvelopeParser = (request: Request | null): EnvelopeItem[] => {
  // https://develop.sentry.dev/sdk/envelopes/
  const envelope = request?.postData() || '';

  const [, items] = parseEnvelope(envelope);

  return items;
};

export type EventAndTraceHeader = [SentryEvent, EventEnvelopeHeaders['trace']];

/**
 * Returns the first event item and `trace` envelope header from an envelope.
 * This is particularly helpful if you want to test dynamic sampling and trace propagation-related cases.
 */
export const eventAndTraceHeaderRequestParser = (request: Request | null): EventAndTraceHeader => {
  const envelope = properFullEnvelopeParser<EventEnvelope>(request);
  return getEventAndTraceHeader(envelope);
};

const properFullEnvelopeParser = <T extends Envelope>(request: Request | null): T => {
  // https://develop.sentry.dev/sdk/envelopes/
  const envelope = request?.postData() || '';

  return parseEnvelope(envelope) as T;
};

function getEventAndTraceHeader(envelope: EventEnvelope): EventAndTraceHeader {
  const event = envelope[1][0]?.[1] as SentryEvent | undefined;
  const trace = envelope[0]?.trace;

  if (!event || !trace) {
    throw new Error('Could not get event or trace from envelope');
  }

  return [event, trace];
}

export const properEnvelopeRequestParser = <T = SentryEvent>(
  request: Request | null,
  envelopeItemIndex: number,
  envelopeIndex = 1, // 1 is usually the payload of the envelope (0 is the header)
): T => {
  return properEnvelopeParser(request)[envelopeItemIndex]?.[envelopeIndex] as T;
};

export const properFullEnvelopeRequestParser = <T extends Envelope>(request: Request | null): T => {
  // https://develop.sentry.dev/sdk/envelopes/
  const envelope = request?.postData() || '';

  return parseEnvelope(envelope) as T;
};

export const envelopeHeaderRequestParser = (request: Request | null): EventEnvelopeHeaders => {
  // https://develop.sentry.dev/sdk/envelopes/
  const envelope = request?.postData() || '';

  // First row of the envelop is the event payload.
  return envelope.split('\n').map(line => JSON.parse(line))[0];
};

export const getEnvelopeType = (request: Request | null): EnvelopeItemType => {
  const envelope = request?.postData() || '';

  return (envelope.split('\n').map(line => JSON.parse(line))[1] as Record<string, unknown>).type as EnvelopeItemType;
};

export const countEnvelopes = async (
  page: Page,
  options?: {
    url?: string;
    timeout?: number;
    envelopeType: EnvelopeItemType | EnvelopeItemType[];
  },
): Promise<number> => {
  const countPromise = new Promise<number>((resolve, reject) => {
    let reqCount = 0;

    const requestHandler = (request: Request): void => {
      if (envelopeUrlRegex.test(request.url())) {
        try {
          if (options?.envelopeType) {
            const envelopeTypeArray = options
              ? typeof options.envelopeType === 'string'
                ? [options.envelopeType]
                : options.envelopeType || (['event'] as EnvelopeItemType[])
              : (['event'] as EnvelopeItemType[]);

            if (envelopeTypeArray.includes(getEnvelopeType(request))) {
              reqCount++;
            }
          }
        } catch (e) {
          reject(e);
        }
      }
    };

    page.on('request', requestHandler);

    setTimeout(() => {
      page.off('request', requestHandler);
      resolve(reqCount);
    }, options?.timeout || 1000);
  });

  if (options?.url) {
    await page.goto(options.url);
  }

  return countPromise;
};

/**
 * Run script inside the test environment.
 * This is useful for throwing errors in the test environment.
 *
 * Errors thrown from this function are not guaranteed to be captured by Sentry, especially in Webkit.
 *
 * @param {Page} page
 * @param {{ path?: string; content?: string }} impl
 * @return {*}  {Promise<void>}
 */
export async function runScriptInSandbox(
  page: Page,
  impl: {
    path?: string;
    content?: string;
  },
): Promise<void> {
  try {
    await page.addScriptTag({ path: impl.path, content: impl.content });
  } catch {
    // no-op
  }
}

/**
 * Get Sentry events at the given URL, or the current page.
 *
 * @param {Page} page
 * @param {string} [url]
 * @return {*}  {Promise<Array<SentryEvent>>}
 */
export async function getSentryEvents(page: Page, url?: string): Promise<Array<SentryEvent>> {
  if (url) {
    await page.goto(url);
  }
  const eventsHandle = await page.evaluateHandle<Array<SentryEvent>>('window.events');

  return eventsHandle.jsonValue();
}

export async function waitForErrorRequestOnUrl(page: Page, url: string): Promise<Request> {
  const [req] = await Promise.all([waitForErrorRequest(page), page.goto(url)]);
  return req;
}

export async function waitForTransactionRequestOnUrl(page: Page, url: string): Promise<Request> {
  const [req] = await Promise.all([waitForTransactionRequest(page), page.goto(url)]);
  return req;
}

export function waitForErrorRequest(page: Page, callback?: (event: SentryEvent) => boolean): Promise<Request> {
  return page.waitForRequest(req => {
    const postData = req.postData();
    if (!postData) {
      return false;
    }

    try {
      const event = envelopeRequestParser(req);

      if (event.type) {
        return false;
      }

      if (callback) {
        return callback(event);
      }

      return true;
    } catch {
      return false;
    }
  });
}

export function waitForTransactionRequest(
  page: Page,
  callback?: (event: TransactionEvent) => boolean,
): Promise<Request> {
  return page.waitForRequest(req => {
    const postData = req.postData();
    if (!postData) {
      return false;
    }

    try {
      const event = envelopeRequestParser(req);

      if (event.type !== 'transaction') {
        return false;
      }

      if (callback) {
        return callback(event as TransactionEvent);
      }

      return true;
    } catch {
      return false;
    }
  });
}

export function waitForClientReportRequest(page: Page, callback?: (report: ClientReport) => boolean): Promise<Request> {
  return page.waitForRequest(req => {
    const postData = req.postData();
    if (!postData) {
      return false;
    }

    try {
      const maybeReport = envelopeRequestParser<Partial<ClientReport>>(req);

      if (typeof maybeReport.discarded_events !== 'object') {
        return false;
      }

      if (callback) {
        return callback(maybeReport as ClientReport);
      }

      return true;
    } catch {
      return false;
    }
  });
}

export async function waitForSession(page: Page): Promise<SessionContext> {
  const req = await page.waitForRequest(req => {
    const postData = req.postData();
    if (!postData) {
      return false;
    }

    try {
      const event = envelopeRequestParser<SessionContext>(req);

      return typeof event.init === 'boolean' && event.started !== undefined;
    } catch {
      return false;
    }
  });

  return envelopeRequestParser<SessionContext>(req);
}

/**
 * We can only test tracing tests in certain bundles/packages:
 * - NPM (ESM, CJS)
 * - CDN bundles that contain Tracing
 *
 * @returns `true` if we should skip the tracing test
 */
export function shouldSkipTracingTest(): boolean {
  const bundle = process.env.PW_BUNDLE;
  return bundle != null && !bundle.includes('tracing') && !bundle.includes('esm') && !bundle.includes('cjs');
}

/**
 * We can only test metrics tests in certain bundles/packages:
 * - NPM (ESM, CJS)
 * - CDN bundles that contain metrics
 *
 * @returns `true` if we should skip the metrics test
 */
export function shouldSkipMetricsTest(): boolean {
  const bundle = process.env.PW_BUNDLE;
  return bundle != null && !bundle.includes('metrics') && !bundle.includes('esm') && !bundle.includes('cjs');
}

/**
 * We can only test logs tests in certain bundles/packages:
 * - NPM (ESM, CJS)
 * - CDN bundles that contain logs
 *
 * @returns `true` if we should skip the logs test
 */
export function shouldSkipLogsTest(): boolean {
  const bundle = process.env.PW_BUNDLE;
  return bundle != null && !bundle.includes('logs') && !bundle.includes('esm') && !bundle.includes('cjs');
}

/**
 * @returns `true` if we are testing a CDN bundle
 */
export function testingCdnBundle(): boolean {
  const bundle = process.env.PW_BUNDLE;
  return bundle != null && (bundle.startsWith('bundle') || bundle.startsWith('loader'));
}

/**
 * Today we always run feedback tests, but this can be used to guard this if we ever need to.
 */
export function shouldSkipFeedbackTest(): boolean {
  // We always run these, in bundles the pluggable integration is automatically added
  return false;
}

/**
 * We only test feature flags integrations in certain bundles/packages:
 * - NPM (ESM, CJS)
 * - Not CDNs.
 *
 * @returns `true` if we should skip the feature flags test
 */
export function shouldSkipFeatureFlagsTest(): boolean {
  const bundle = process.env.PW_BUNDLE;
  return bundle != null && !bundle.includes('esm') && !bundle.includes('cjs');
}

/**
 * Returns true if the current bundle has debug logs.
 */
export function hasDebugLogs(): boolean {
  const bundle = process.env.PW_BUNDLE;
  return !bundle?.includes('min');
}

/**
 * Waits until a number of requests matching urlRgx at the given URL arrive.
 * If the timeout option is configured, this function will abort waiting, even if it hasn't received the configured
 * amount of requests, and returns all the events received up to that point in time.
 */
async function getMultipleRequests<T>(
  page: Page,
  count: number,
  urlRgx: RegExp,
  requestParser: (req: Request) => T,
  options?: {
    url?: string;
    timeout?: number;
    envelopeType?: EnvelopeItemType | EnvelopeItemType[];
  },
): Promise<T[]> {
  const requests: Promise<T[]> = new Promise((resolve, reject) => {
    let reqCount = count;
    const requestData: T[] = [];
    let timeoutId: NodeJS.Timeout | undefined = undefined;

    function requestHandler(request: Request): void {
      if (urlRgx.test(request.url())) {
        try {
          if (options?.envelopeType) {
            const envelopeTypeArray = options
              ? typeof options.envelopeType === 'string'
                ? [options.envelopeType]
                : options.envelopeType || (['event'] as EnvelopeItemType[])
              : (['event'] as EnvelopeItemType[]);

            if (!envelopeTypeArray.includes(getEnvelopeType(request))) {
              return;
            }
          }

          reqCount--;
          requestData.push(requestParser(request));

          if (reqCount === 0) {
            if (timeoutId) {
              clearTimeout(timeoutId);
            }
            page.off('request', requestHandler);
            resolve(requestData);
          }
        } catch (err) {
          reject(err);
        }
      }
    }

    page.on('request', requestHandler);

    if (options?.timeout) {
      timeoutId = setTimeout(() => {
        resolve(requestData);
      }, options.timeout);
    }
  });

  if (options?.url) {
    await page.goto(options.url);
  }

  return requests;
}

/**
 * Wait and get multiple envelope requests at the given URL, or the current page
 */
export async function getMultipleSentryEnvelopeRequests<T>(
  page: Page,
  count: number,
  options?: {
    url?: string;
    timeout?: number;
    envelopeType?: EnvelopeItemType | EnvelopeItemType[];
  },
  requestParser: (req: Request) => T = envelopeRequestParser as (req: Request) => T,
): Promise<T[]> {
  return getMultipleRequests<T>(page, count, envelopeUrlRegex, requestParser, options);
}

/**
 * Wait and get the first envelope request at the given URL, or the current page
 *
 * @template T
 * @param {Page} page
 * @param {string} [url]
 * @return {*}  {Promise<T>}
 */
export async function getFirstSentryEnvelopeRequest<T>(
  page: Page,
  url?: string,
  requestParser: (req: Request) => T = envelopeRequestParser as (req: Request) => T,
): Promise<T> {
  const reqs = await getMultipleSentryEnvelopeRequests<T>(page, 1, { url }, requestParser);

  const req = reqs[0];
  if (!req) {
    throw new Error('No request found');
  }

  return req;
}

export async function hidePage(page: Page): Promise<void> {
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', {
      configurable: true,
      get: function () {
        return 'hidden';
      },
    });

    // Dispatch the visibilitychange event to notify listeners
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

export async function waitForTracingHeadersOnUrl(
  page: Page,
  url: string,
): Promise<{ baggage: string; sentryTrace: string }> {
  return new Promise<{ baggage: string; sentryTrace: string }>(resolve => {
    page
      .route(url, (route, req) => {
        const baggage = req.headers()['baggage'];
        const sentryTrace = req.headers()['sentry-trace'];
        resolve({ baggage, sentryTrace });
        return route.fulfill({ status: 200, body: 'ok' });
      })
      .catch(error => {
        // Handle any routing setup errors
        throw error;
      });
  });
}
