import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getSentryRequest } from '../../../../utils/helpers';

sentryTest('should set a simple context', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getSentryRequest(page, url);

  expect(eventData.message).toBe('simple_context_object');
  expect(eventData.contexts).toMatchObject({
    foo: {
      bar: 'baz',
      qux: '6789',
    },
  });
});
