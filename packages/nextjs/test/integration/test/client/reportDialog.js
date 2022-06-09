const { equal } = require('assert');

module.exports = async ({ page, url }) => {
  await page.goto(`${url}/reportDialog`);

  await page.click('button');

  const dialogScriptSelector = 'head > script[src^="https://dsn.ingest.sentry.io/api/embed/error-page"]';

  const dialogScript = await page.waitForSelector(dialogScriptSelector, { state: 'attached' });
  const dialogScriptSrc = await (await dialogScript.getProperty('src')).jsonValue();

  equal(dialogScriptSrc?.startsWith('https://dsn.ingest.sentry.io/api/embed/error-page/?'), true);
};
