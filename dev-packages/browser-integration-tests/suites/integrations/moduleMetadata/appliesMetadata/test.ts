import { expect } from '@playwright/test';
import type { Event } from '@sentry/core';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('should provide module_metadata on stack frames in beforeSend', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const errorEvent = await getFirstSentryEnvelopeRequest<Event>(page, url);
  // Filter out null entries from internal Sentry frames that don't have module metadata
  const metadataEntries = (errorEvent.extra?.['module_metadata_entries'] as Array<unknown>)?.filter(
    entry => entry !== null,
  );
  expect(metadataEntries).toEqual([{ foo: 'bar' }]);
});
