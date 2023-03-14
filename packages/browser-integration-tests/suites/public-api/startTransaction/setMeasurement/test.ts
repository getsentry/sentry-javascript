import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should attach measurement to transaction', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });
  const event = await getFirstSentryEnvelopeRequest<Event>(page, url);

  expect(event.measurements?.['metric.foo'].value).toBe(42);
  expect(event.measurements?.['metric.bar'].value).toBe(1337);
  expect(event.measurements?.['metric.baz'].value).toBe(1);

  expect(event.measurements?.['metric.foo'].unit).toBe('ms');
  expect(event.measurements?.['metric.bar'].unit).toBe('nanoseconds');
  expect(event.measurements?.['metric.baz'].unit).toBe('');
});
