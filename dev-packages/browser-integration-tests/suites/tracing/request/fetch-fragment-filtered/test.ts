import { HTTP_CLIENT } from '@sentry/conventions/op';
import { URL_FRAGMENT, URL_FULL, URL_QUERY } from '@sentry/conventions/attributes';
import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { getSpanOp, waitForStreamedSpan } from '../../../../utils/spanUtils';

sentryTest('filters sensitive pairs in the URL fragment of fetch request spans', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipTracingTest()) {
    sentryTest.skip();
  }

  await page.route('http://sentry-test-site.example/*', route => route.fulfill({ body: 'ok' }));

  const url = await getLocalTestUrl({ testDir: __dirname });

  await page.goto(url);

  const requestPromise = waitForStreamedSpan(page, span => getSpanOp(span) === HTTP_CLIENT);
  await page.locator('#btnFragment').click();
  const requestSpan = await requestPromise;

  expect(requestSpan.attributes).toMatchObject({
    [URL_FULL]: {
      type: 'string',
      value: 'http://sentry-test-site.example/callback?id=1#access_token=[Filtered]&state=xyz',
    },
    [URL_QUERY]: { type: 'string', value: 'id=1' },
    [URL_FRAGMENT]: { type: 'string', value: 'access_token=[Filtered]&state=xyz' },
  });
});
