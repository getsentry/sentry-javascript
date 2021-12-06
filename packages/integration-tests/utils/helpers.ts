import { Page } from '@playwright/test';
import { Event } from '@sentry/types';

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
 * Wait and get Sentry's request sending the event at the given URL
 *
 * @param {Page} page
 * @param {string} url
 * @return {*}  {Promise<Event>}
 */
async function getSentryRequest(page: Page, url: string): Promise<Event> {
  const request = (await Promise.all([page.goto(url), page.waitForRequest(/\.sentry\.io\/api\//)]))[1];

  return JSON.parse((request && request.postData()) || '');
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

export { runScriptInSandbox, getSentryRequest, getSentryEvents, injectScriptAndGetEvents };
