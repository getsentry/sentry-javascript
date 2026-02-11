import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { getFirstSentryEnvelopeRequest } from '../../../../utils/helpers';

sentryTest(
  'sets attrs.ip_address user to {{auto}} on sessions when sendDefaultPii: true',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    const session = await getFirstSentryEnvelopeRequest(page, url);
    expect((session as any).attrs.ip_address).toBe('{{auto}}');
  },
);
