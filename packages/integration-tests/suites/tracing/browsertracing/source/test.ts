import { expect } from '@playwright/test';
import { Event } from '@sentry/types';

import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest('transactions should contain transaction source', async ({ getLocalTestPath, page }) => {
  const url = await getLocalTestPath({ testDir: __dirname });

  const pageloadRequest = await getFirstSentryEnvelopeRequest<Event>(page, url);
  const navigationRequest = await getFirstSentryEnvelopeRequest<Event>(page, `${url}#foo`);

  expect(pageloadRequest).toEqual({});

  expect(pageloadRequest.transaction_info?.source).toEqual('url');
  expect(navigationRequest.transaction_info?.source).toEqual('url');
});
