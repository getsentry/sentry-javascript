import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequest } from '../../../../utils/helpers';

sentryTest('error handler works', async ({ getLocalTestUrl, page, browserName }) => {
  const req = waitForErrorRequest(page);

  const url = await getLocalTestUrl({ testDir: __dirname });
  await page.goto(url);

  const eventData = envelopeRequestParser(await req);

  expect(eventData.exception?.values?.length).toBe(1);

  if (browserName === 'webkit') {
    expect(eventData.exception?.values?.[0]?.value).toBe(
      "window.doSomethingWrong is not a function. (In 'window.doSomethingWrong()', 'window.doSomethingWrong' is undefined)",
    );
  } else {
    expect(eventData.exception?.values?.[0]?.value).toBe('window.doSomethingWrong is not a function');
  }
});
