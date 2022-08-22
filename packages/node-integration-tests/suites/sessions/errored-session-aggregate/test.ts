import path from 'path';

import { getEnvelopeRequest, runServer } from '../../../utils';

test('should aggregate successful, crashed and erroneous sessions', async () => {
  const { url, server } = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const aggregateSessionEnvelope = await Promise.race([
    getEnvelopeRequest({ url: `${url}/success`, server }, { endServer: false, envelopeType: 'sessions' }),
    getEnvelopeRequest({ url: `${url}/error_handled`, server }, { endServer: false, envelopeType: 'sessions' }),
    getEnvelopeRequest({ url: `${url}/error_unhandled`, server }, { endServer: false, envelopeType: 'sessions' }),
  ]);

  await new Promise(resolve => server.close(resolve));

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
