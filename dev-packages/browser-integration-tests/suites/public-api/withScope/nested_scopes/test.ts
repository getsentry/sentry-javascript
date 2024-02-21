import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest('should allow nested scoping', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const eventData = await getMultipleSentryEnvelopeRequests<Event>(page, 5, { url });

  expect(eventData[0].message).toBe('root_before');
  expect(eventData[0].user).toMatchObject({ id: 'qux' });
  expect(eventData[0].tags).toBeUndefined();

  expect(eventData[1].message).toBe('outer_before');
  expect(eventData[1].user).toMatchObject({ id: 'qux' });
  expect(eventData[1].tags).toMatchObject({ foo: false });

  expect(eventData[2].message).toBe('inner');
  expect(eventData[2].user).toBeUndefined();
  expect(eventData[2].tags).toMatchObject({ foo: false, bar: 10 });

  expect(eventData[3].message).toBe('outer_after');
  expect(eventData[3].user).toMatchObject({ id: 'baz' });
  expect(eventData[3].tags).toMatchObject({ foo: false });

  expect(eventData[4].message).toBe('root_after');
  expect(eventData[4].user).toMatchObject({ id: 'qux' });
  expect(eventData[4].tags).toBeUndefined();
});
