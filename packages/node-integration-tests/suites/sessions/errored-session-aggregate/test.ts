import path from 'path';

import { getMultipleEnvelopeRequest, runServer } from '../../../utils';

test('should aggregate successful, crashed and erroneous sessions', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const envelopes = await Promise.race([
    getMultipleEnvelopeRequest(`${url}/success`, 3),
    getMultipleEnvelopeRequest(`${url}/error_handled`, 3),
    getMultipleEnvelopeRequest(`${url}/error_unhandled`, 3),
  ]);

  expect(envelopes).toHaveLength(3);
  const aggregateSessionEnvelope = envelopes[2];
  expect(aggregateSessionEnvelope[0]).toMatchObject({
    sent_at: expect.any(String),
    sdk: {
      name: 'sentry.javascript.node',
      version: expect.any(String),
    },
  });

  expect(aggregateSessionEnvelope[1]).toMatchObject({
    type: 'sessions',
  });

  expect(aggregateSessionEnvelope[2]).toMatchObject({
    aggregates: [
      {
        started: expect.any(String),
        exited: 1,
        crashed: 1,
        errored: 1,
      },
    ],
  });
});
