import { expect } from '@playwright/test';
import type { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getMultipleSentryEnvelopeRequests } from '../../../../utils/helpers';

sentryTest(
  'should provide module_metadata on stack frames in beforeSend even though an event processor (rewriteFramesIntegration) modified the filename',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const envelopes = await getMultipleSentryEnvelopeRequests<Event>(page, 3, { url, timeout: 10000 });
    const errorEvent = envelopes.find(event => !event.type)!;
    expect(errorEvent.extra?.['module_metadata_entries']).toEqual([{ foo: 'baz' }]);
  },
);
