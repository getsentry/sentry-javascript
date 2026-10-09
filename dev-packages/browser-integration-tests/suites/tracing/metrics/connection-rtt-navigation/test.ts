import { expect } from '@playwright/test';
import { sentryTest } from '../../../../utils/fixtures';
import { shouldSkipTracingTest } from '../../../../utils/helpers';
import { waitForStreamedSpanAndTraceHeaderOnUrl } from '../../../../utils/spanUtils';
import {
  BROWSER_WEB_VITAL_FCP_VALUE,
  BROWSER_WEB_VITAL_TTFB_VALUE,
  NETWORK_CONNECTION_RTT,
} from '@sentry/conventions/attributes';

sentryTest(
  'records connection RTT on pageload and navigation spans',
  async ({ getLocalTestUrl, page, browserName }) => {
    sentryTest.skip(shouldSkipTracingTest() || browserName !== 'chromium');
    const url = await getLocalTestUrl({ testDir: __dirname });
    const [pageload] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, url);
    const [navigation] = await waitForStreamedSpanAndTraceHeaderOnUrl(page, `${url}#foo`);

    expect(pageload.attributes[NETWORK_CONNECTION_RTT]).toEqual({ type: 'integer', value: 0 });
    expect(navigation.attributes[NETWORK_CONNECTION_RTT]).toEqual(pageload.attributes[NETWORK_CONNECTION_RTT]);
    expect(navigation.attributes[BROWSER_WEB_VITAL_FCP_VALUE]).toBeUndefined();
    expect(navigation.attributes[BROWSER_WEB_VITAL_TTFB_VALUE]).toBeUndefined();
  },
);
