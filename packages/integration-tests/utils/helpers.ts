import { Page, Request } from '@playwright/test';
import { Event } from '@sentry/types';

const storeUrlRegex = /\.sentry\.io\/api\/\d+\/store\//;
const envelopeUrlRegex = /\.sentry\.io\/api\/\d+\/envelope\//;

const storeRequestParser = (request: Request | null): Event => JSON.parse((request && request.postData()) || '');
const envelopeRequestParser = (request: Request | null): Event => {
  // https://develop.sentry.dev/sdk/envelopes/
  const envelope = request?.postData() || '';

  // Third row of the envelop is the event payload.
  return envelope.split('\n').map(line => JSON.parse(line))[2];
};

type SentryRequestType = 'event' | 'transaction';

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
 * Wait and get Sentry's request sending the event.
 *
 * @param {Page} page
 * @returns {*} {Promise<Request>}
 */
async function waitForSentryRequest(page: Page, requestType: SentryRequestType = 'event'): Promise<Request> {
  return page.waitForRequest(requestType === 'event' ? storeUrlRegex : envelopeUrlRegex);
}

/**
 * Wait and get Sentry's request sending the event at the given URL, or the current page
 *
 * @param {Page} page
 * @param {string} [url]
 * @return {*}  {Promise<Event>}
 */
async function getSentryRequest(page: Page, url?: string): Promise<Event> {
  const request = (await Promise.all([url ? page.goto(url) : Promise.resolve(null), waitForSentryRequest(page)]))[1];

  return storeRequestParser(request);
}

/**
 * Wait and get Sentry's request sending transaction at the given URL, or the current page
 *
 * @param {Page} page
 * @param {string} [url]
 * @return {*}  {Promise<Event>}
 */
async function getSentryTransactionRequest(page: Page, url?: string): Promise<Event> {
  const request = (
    await Promise.all([url ? page.goto(url) : Promise.resolve(null), waitForSentryRequest(page, 'transaction')])
  )[1];

  try {
    return envelopeRequestParser(request);
  } catch (err) {
    return Promise.reject(err);
  }
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
 * Wait and get multiple requests matching urlRgx at the given URL, or the current page
 *
 * @param {Page} page
 * @param {number} count
 * @param {RegExp} urlRgx
 * @param {(req: Request) => Event} requestParser
 * @param {string} [url]
 * @return {*}  {Promise<Event[]>}
 */
async function getMultipleRequests(
  page: Page,
  count: number,
  urlRgx: RegExp,
  requestParser: (req: Request) => Event,
  url?: string,
): Promise<Event[]> {
  const requests: Promise<Event[]> = new Promise((resolve, reject) => {
    let reqCount = count;
    const requestData: Event[] = [];

    page.on('request', request => {
      if (urlRgx.test(request.url())) {
        try {
          reqCount -= 1;
          requestData.push(requestParser(request));
          if (reqCount === 0) {
            resolve(requestData);
          }
        } catch (err) {
          reject(err);
        }
      }
    });
  });

  if (url) {
    await page.goto(url);
  }

  return requests;
}

/**
 * Wait and get multiple event requests at the given URL, or the current page
 *
 * @param {Page} page
 * @param {number} count
 * @param {string} [url]
 * @return {*}  {Promise<Event>}
 */
async function getMultipleSentryRequests(page: Page, count: number, url?: string): Promise<Event[]> {
  return getMultipleRequests(page, count, storeUrlRegex, storeRequestParser, url);
}

/**
 * Wait and get multiple transaction requests at the given URL, or the current page
 *
 * @param {Page} page
 * @param {number} count
 * @param {string} [url]
 * @return {*}  {Promise<Event>}
 */
async function getMultipleSentryTransactionRequests(page: Page, count: number, url?: string): Promise<Event[]> {
  return getMultipleRequests(page, count, envelopeUrlRegex, envelopeRequestParser, url);
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
  waitForSentryRequest,
  getMultipleSentryRequests,
  getMultipleSentryTransactionRequests,
  getSentryRequest,
  getSentryTransactionRequest,
  getSentryEvents,
  injectScriptAndGetEvents,
};
