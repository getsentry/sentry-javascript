import path from 'path';

import { getMultipleEnvelopeRequest, runServer } from '../../../utils';

test('should aggregate successful and crashed sessions', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const envelopes = await Promise.race([
    getMultipleEnvelopeRequest(`${url}/success`, 2),
    getMultipleEnvelopeRequest(`${url}/error_unhandled`, 2),
    getMultipleEnvelopeRequest(`${url}/success_next`, 2),
  ]);
  const envelope = envelopes[1];

  expect(envelope[0]).toMatchObject({
    sent_at: expect.any(String),
    sdk: {
      name: 'sentry.javascript.node',
      version: expect.any(String),
    },
  });

  expect(envelope[1]).toMatchObject({
    type: 'sessions',
  });

  expect(envelope[2]).toMatchObject({
    aggregates: [
      {
        started: expect.any(String),
        exited: 2,
        crashed: 1,
      },
    ],
  });
});
