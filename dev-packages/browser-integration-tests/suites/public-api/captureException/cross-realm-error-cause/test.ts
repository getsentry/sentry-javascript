import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

sentryTest('captures causes from errors thrown in an iframe @firefox', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });
  const req = await waitForErrorRequestOnUrl(page, url);
  const eventData = envelopeRequestParser(req);

  expect(eventData.exception?.values).toHaveLength(2);
  expect(eventData.exception?.values).toEqual([
    expect.objectContaining({
      type: 'Error',
      value: 'iframe cause error',
      mechanism: {
        exception_id: 1,
        handled: true,
        parent_id: 0,
        source: 'cause',
        type: 'chained',
      },
    }),
    expect.objectContaining({
      type: 'Error',
      value: 'iframe root error',
      mechanism: {
        exception_id: 0,
        handled: true,
        type: 'generic',
      },
    }),
  ]);
});
