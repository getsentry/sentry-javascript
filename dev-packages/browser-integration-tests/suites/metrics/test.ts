import { expect } from '@playwright/test';

import { sentryTest } from '../../utils/fixtures';
import { getFirstSentryEnvelopeRequest, properEnvelopeRequestParser } from '../../utils/helpers';

sentryTest('collects metrics', async ({ getLocalTestUrl, page }) => {
  const url = await getLocalTestUrl({ testDir: __dirname });

  const statsdBuffer = await getFirstSentryEnvelopeRequest<Uint8Array>(page, url, properEnvelopeRequestParser);
  const statsdString = new TextDecoder().decode(statsdBuffer);
  // Replace all the Txxxxxx to remove the timestamps
  const normalisedStatsdString = statsdString.replace(/T\d+\n?/g, 'T000000');

  expect(normalisedStatsdString).toEqual(
    'increment@none:2|c|T000000distribution@none:42:45|d|T000000gauge@none:15:5:15:20:2|g|T000000set@none:3387254:3443787523|s|T000000',
  );
});
