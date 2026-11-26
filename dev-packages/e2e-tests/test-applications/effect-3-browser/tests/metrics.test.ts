import { expect, test } from '@playwright/test';
import { waitForEnvelopeItem } from '@sentry-internal/test-utils';
import type { SerializedMetricContainer } from '@sentry/core';

test('sends Effect metrics', async ({ page }) => {
  const metricContainerPromise = waitForEnvelopeItem('effect-3-browser', envelopeItem => {
    return (
      envelopeItem[0].type === 'trace_metric' &&
      (envelopeItem[1] as SerializedMetricContainer).items.some(metric => metric.name === 'orders_placed')
    );
  });

  await page.goto('/');
  await page.locator('id=metrics-button').click();

  await expect(page.locator('id=metrics-result')).toHaveText('Metrics updated!');

  const metrics = ((await metricContainerPromise)[1] as SerializedMetricContainer).items;
  expect(metrics).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        name: 'orders_placed',
        type: 'counter',
        value: 1,
        attributes: expect.objectContaining({ shop: { value: 'e2e', type: 'string' } }),
      }),
      expect.objectContaining({ name: 'queue_depth', type: 'gauge', value: 7 }),
    ]),
  );
});
