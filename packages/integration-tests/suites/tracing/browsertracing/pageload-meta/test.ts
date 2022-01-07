import { expect } from '@playwright/test';

import { sentryTest } from '../../../../utils/fixtures';
import { getSentryTransactionRequest } from '../../../../utils/helpers';

sentryTest(
  'should create a pageload transaction based on `sentry-trace` <meta>',
  async ({ getLocalTestPath, page }) => {
    const url = await getLocalTestPath({ testDir: __dirname });

    const eventData = await getSentryTransactionRequest(page, url);

    expect(eventData.contexts?.trace).toMatchObject({
      op: 'pageload',
      parent_span_id: '1121201211212012',
      trace_id: '12312012123120121231201212312012',
    });

    expect(eventData.spans?.length).toBeGreaterThan(0);
  },
);
