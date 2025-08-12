import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

sentryTest(
  'sets sdk.settings.infer_ip to "auto" on errors when sendDefaultPii: true',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    const eventData = await envelopeRequestParser(await waitForErrorRequestOnUrl(page, url));
    expect(eventData.sdk?.settings?.infer_ip).toBe('auto');
  },
);
