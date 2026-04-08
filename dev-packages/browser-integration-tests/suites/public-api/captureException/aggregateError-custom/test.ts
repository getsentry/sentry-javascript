import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

sentryTest('captures custom AggregateErrors', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForErrorRequestOnUrl(page, url);
  const eventData = envelopeRequestParser(req);

  expect(eventData.exception?.values).toHaveLength(5); // CustomAggregateError + 3 embedded errors + 1 aggregate cause

  // Verify the embedded errors come first
  expect(eventData.exception?.values).toEqual([
    expect.objectContaining({
      mechanism: { exception_id: 4, handled: true, parent_id: 0, source: 'errors[1]', type: 'chained' },
      type: 'Error',
      value: 'error 2',
    }),
    expect.objectContaining({
      mechanism: { exception_id: 3, handled: true, parent_id: 2, source: 'cause', type: 'chained' },
      type: 'Error',
      value: 'error 1 cause',
    }),
    expect.objectContaining({
      mechanism: { exception_id: 2, handled: true, parent_id: 0, source: 'errors[0]', type: 'chained' },
      type: 'Error',
      value: 'error 1',
    }),
    expect.objectContaining({
      mechanism: { exception_id: 1, handled: true, parent_id: 0, source: 'cause', type: 'chained' },
      type: 'Error',
      value: 'aggregate cause',
    }),
    expect.objectContaining({
      mechanism: { exception_id: 0, handled: true, type: 'generic', is_exception_group: true },
      type: 'CustomAggregateError',
      value: 'custom aggregate error',
    }),
  ]);
});
