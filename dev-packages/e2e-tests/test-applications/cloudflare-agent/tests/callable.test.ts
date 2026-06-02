import { expect, test } from '@playwright/test';
import { waitForTransaction } from '@sentry-internal/test-utils';

test('@callable() methods work correctly with Sentry instrumentDurableObjectWithSentry', async ({ page, baseURL }) => {
  const transactionPromise = waitForTransaction('cloudflare-agent', transactionEvent => {
    return (
      transactionEvent.transaction === 'GET /agents/my-agent/user-123' &&
      transactionEvent.contexts?.trace?.parent_span_id !== undefined
    );
  });

  await page.goto(baseURL!);

  await expect(page.getByText('Connected')).toBeVisible();
  await page.getByRole('button', { name: 'Call Agent' }).click();
  await expect(page.getByText('Hello, World!')).toBeVisible();

  const transaction = await transactionPromise;

  expect(transaction).toEqual({
    contexts: {
      trace: {
        parent_span_id: expect.stringMatching(/[a-f0-9]{16}/),
        span_id: expect.stringMatching(/[a-f0-9]{16}/),
        trace_id: expect.stringMatching(/[a-f0-9]{32}/),
        data: expect.any(Object),
        op: 'http.server',
        status: 'ok',
        origin: 'auto.http.cloudflare',
      },
      cloud_resource: { 'cloud.provider': 'cloudflare' },
      culture: { timezone: expect.any(String) },
      runtime: { name: 'cloudflare' },
    },
    spans: expect.arrayContaining([
      expect.objectContaining({
        op: 'db',
        description: 'durable_object_storage_get',
      }),
    ]),
    start_timestamp: expect.any(Number),
    timestamp: expect.any(Number),
    transaction: 'GET /agents/my-agent/user-123',
    type: 'transaction',
    request: {
      headers: expect.any(Object),
      method: 'GET',
      url: expect.stringContaining('/agents/my-agent/user-123'),
      query_string: expect.any(String),
    },
    transaction_info: { source: 'url' },
    platform: 'javascript',
    event_id: expect.stringMatching(/[a-f0-9]{32}/),
    environment: expect.any(String),
    release: expect.any(String),
    sdk: {
      integrations: expect.any(Array),
      name: 'sentry.javascript.cloudflare',
      version: expect.any(String),
      packages: expect.any(Array),
    },
  });
});
