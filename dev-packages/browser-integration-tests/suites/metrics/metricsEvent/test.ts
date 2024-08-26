import { expect } from '@playwright/test';

import { sentryTest } from '../../../utils/fixtures';
import {
  getFirstSentryEnvelopeRequest,
  properEnvelopeRequestParser,
  shouldSkipMetricsTest,
} from '../../../utils/helpers';

sentryTest('collects metrics', async ({ getLocalTestUrl, page }) => {
  if (shouldSkipMetricsTest()) {
    sentryTest.skip();
  }

  const url = await getLocalTestUrl({ testDir: __dirname });

  const statsdBuffer = await getFirstSentryEnvelopeRequest<Uint8Array>(page, url, properEnvelopeRequestParser);
  const statsdString = new TextDecoder().decode(statsdBuffer);
  // Replace all the Txxxxxx to remove the timestamps
  const normalisedStatsdString = statsdString.replace(/T\d+\n?/g, 'T000000').trim();

  const parts = normalisedStatsdString.split('T000000');

  expect(parts).toEqual([
    'increment@none:6|c|',
    'distribution@none:42:45|d|',
    'gauge@none:15:5:15:20:2|g|',
    'set@none:3387254:3443787523|s|',
    'timing@hour:99|d|',
    expect.stringMatching(/timingSync@second:0.(\d+)\|d\|/),
    expect.stringMatching(/timingAsync@second:0.(\d+)\|d\|/),
    '', // trailing element
  ]);
});
