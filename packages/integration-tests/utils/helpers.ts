import { Page, Request } from '@playwright/test';
import { Event, EventEnvelopeHeaders } from '@sentry/types';

const envelopeUrlRegex = /\.sentry\.io\/api\/\d+\/envelope\//;

const envelopeRequestParser = (request: Request | null): Event => {
  // https://develop.sentry.dev/sdk/envelopes/
  const envelope = request?.postData() || '';

  // Third row of the envelop is the event payload.
  return envelope.split('\n').map(line => JSON.parse(line))[2];
};

export const envelopeHeaderRequestParser = (request: Request | null): EventEnvelopeHeaders => {
  // https://develop.sentry.dev/sdk/envelopes/
  const envelope = request?.postData() || '';

  // First row of the envelop is the event payload.
  return envelope.split('\n').map(line => JSON.parse(line))[0];
};

/**
 * Run script at the given path inside the test environment.
 *
 * @param {Page} page
 * @param {string} path
 * @return {*}  {Promise<void>}
 */
async function runScriptInSandbox(page: Page, path: string): Promise<void> {
  await page.addScriptTag({ path });
}

/**
 * Get Sentry events at the given URL, or the current page.
 *
 * @param {Page} page
 * @param {string} [url]
 * @return {*}  {Promise<Array<Event>>}
 */
async function getSentryEvents(page: Page, url?: string): Promise<Array<Event>> {
  if (url) {
    await page.goto(url);
  }
  const eventsHandle = await page.evaluateHandle<Array<Event>>('window.events');

  return eventsHandle.jsonValue();
}

/**
 * Waits until a number of requests matching urlRgx at the given URL arrive.
 * If the timout option is configured, this function will abort waiting, even if it hasn't reveived the configured
 * amount of requests, and returns all the events recieved up to that point in time.
 */
async function getMultipleRequests(
  page: Page,
  count: number,
  urlRgx: RegExp,
  requestParser: (req: Request) => Event,
  options?: {
    url?: string;
    timeout?: number;
  },
): Promise<Event[]> {
  const requests: Promise<Event[]> = new Promise((resolve, reject) => {
    let reqCount = count;
    const requestData: Event[] = [];
    let timeoutId: NodeJS.Timeout | undefined = undefined;

    function requestHandler(request: Request): void {
      if (urlRgx.test(request.url())) {
        try {
          reqCount -= 1;

          // TODO: This is to compensate for a temporary debugging hack which adds data the tests aren't anticipating to
          // the request. The code can be restored to its original form (the commented-out line below) once that hack is
          // removed. See https://github.com/getsentry/sentry-javascript/pull/4425.
          const parsedRequest = requestParser(request);
          if (parsedRequest.tags) {
            if (
              Object.keys(parsedRequest.tags).length === 0 ||
              (Object.keys(parsedRequest.tags).length === 1 && 'skippedNormalization' in parsedRequest.tags)
            ) {
              delete parsedRequest.tags;
            } else {
              delete parsedRequest.tags.skippedNormalization;
            }
          }
          if (parsedRequest.extra && Object.keys(parsedRequest.extra).length === 0) {
            delete parsedRequest.extra;
          }
          requestData.push(parsedRequest);
          // requestData.push(requestParser(request));

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
async function getMultipleSentryEnvelopeRequests<T>(
  page: Page,
  count: number,
  options?: {
    url?: string;
    timeout?: number;
  },
  requestParser: (req: Request) => T = envelopeRequestParser as (req: Request) => T,
): Promise<T[]> {
  // TODO: This is not currently checking the type of envelope, just casting for now.
  // We can update this to include optional type-guarding when we have types for Envelope.
  return getMultipleRequests(page, count, envelopeUrlRegex, requestParser, options) as Promise<T[]>;
}

/**
 * Wait and get the first envelope request at the given URL, or the current page
 *
 * @template T
 * @param {Page} page
 * @param {string} [url]
 * @return {*}  {Promise<T>}
 */
async function getFirstSentryEnvelopeRequest<T>(
  page: Page,
  url?: string,
  requestParser: (req: Request) => T = envelopeRequestParser as (req: Request) => T,
): Promise<T> {
  return (await getMultipleSentryEnvelopeRequests<T>(page, 1, { url }, requestParser))[0];
}

/**
 * Manually inject a script into the page of given URL.
 * This function is useful to create more complex test subjects that can't be achieved by pre-built pages.
 * The given script should be vanilla browser JavaScript
 *
 * @param {Page} page
 * @param {string} url
 * @param {string} scriptPath
 * @return {*}  {Promise<Array<Event>>}
 */
async function injectScriptAndGetEvents(page: Page, url: string, scriptPath: string): Promise<Array<Event>> {
  await page.goto(url);
  await runScriptInSandbox(page, scriptPath);

  return await getSentryEvents(page);
}

export {
  runScriptInSandbox,
  getMultipleSentryEnvelopeRequests,
  getFirstSentryEnvelopeRequest,
  getSentryEvents,
  injectScriptAndGetEvents,
};
