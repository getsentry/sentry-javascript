import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { envelopeRequestParser, waitForErrorRequestOnUrl } from '../../../../utils/helpers';

sentryTest(
  'overrides IP inference by explicitly passing sdk.settings.infer_ip to "auto"',
  async ({ getLocalTestUrl, page }) => {
    const url = await getLocalTestUrl({ testDir: __dirname });
    const eventData = await envelopeRequestParser(await waitForErrorRequestOnUrl(page, url));
    expect(eventData.sdk?.settings?.infer_ip).toBe('auto');
  },
);
