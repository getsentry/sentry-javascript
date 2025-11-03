import { expect, test } from '@playwright/test';
import { waitForRequest } from '@sentry-internal/test-utils';
import { SDK_VERSION } from '@sentry/node';

test('sends user-agent header with SDK name and version in envelope requests', async ({ baseURL }) => {
  const requestPromise = waitForRequest('node-express', () => true);

  await fetch(`${baseURL}/test-exception/123`);

  const request = await requestPromise;

  expect(request.rawProxyRequestHeaders).toMatchObject({
    'user-agent': `sentry.javascript.node/${SDK_VERSION}`,
  });
});
