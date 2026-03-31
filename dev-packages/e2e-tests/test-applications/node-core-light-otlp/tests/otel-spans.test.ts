import { expect, test } from '@playwright/test';
import { waitForPlainRequest } from '@sentry-internal/test-utils';

test('User OTel exporter still receives spans', async ({ request }) => {
  // The user's own OTel exporter sends spans to port 3032 (our test proxy).
  // Verify that OTel span export still works alongside the Sentry OTLP integration.
  const otelPromise = waitForPlainRequest('node-core-light-otlp-otel', data => {
    const json = JSON.parse(data) as { resourceSpans: unknown[] };
    return json.resourceSpans.length > 0;
  });

  await request.get('/test-otel-span');

  const otelData = await otelPromise;
  expect(otelData).toBeDefined();
});
