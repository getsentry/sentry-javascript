import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getSentryRequest } from '../../../../utils/helpers';

sentryTest('should record a simple extra object', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  expect(eventData.message).toBe('simple_extra');
  expect(eventData.extra).toMatchObject({ simple_extra: { foo: 'bar', baz: { qux: 'quux' } } });
});
