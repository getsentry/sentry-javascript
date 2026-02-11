import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest('should allow nested scoping', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const eventData = await getMultipleSentryEnvelopeRequests<Event>(page, 5, { url });

  expect(eventData[0].message).toBe('root_before');
  expect(eventData[0].user).toEqual({
    id: 'qux',
  });
  expect(eventData[0].tags).toBeUndefined();

  expect(eventData[1].message).toBe('outer_before');
  expect(eventData[1].user).toEqual({
    id: 'qux',
  });
  expect(eventData[1].tags).toMatchObject({ foo: false });

  expect(eventData[2].message).toBe('inner');
  expect(eventData[2].user).toEqual({});
  expect(eventData[2].tags).toMatchObject({ foo: false, bar: 10 });

  expect(eventData[3].message).toBe('outer_after');
  expect(eventData[3].user).toEqual({
    id: 'baz',
  });
  expect(eventData[3].tags).toMatchObject({ foo: false });

  expect(eventData[4].message).toBe('root_after');
  expect(eventData[4].user).toEqual({
    id: 'qux',
  });
  expect(eventData[4].tags).toBeUndefined();
});
