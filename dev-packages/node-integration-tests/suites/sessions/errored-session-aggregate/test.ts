import path from 'path';

import { TestEnv } from '../../../utils';

test('should aggregate successful, crashed and erroneous sessions', async () => {
  const env = await TestEnv.init(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const aggregateSessionEnvelope = await Promise.race([
    env.getEnvelopeRequest({ url: `${env.url}/success`, endServer: false, envelopeType: 'sessions' }),
    env.getEnvelopeRequest({ url: `${env.url}/error_handled`, endServer: false, envelopeType: 'sessions' }),
    env.getEnvelopeRequest({ url: `${env.url}/error_unhandled`, endServer: false, envelopeType: 'sessions' }),
  ]);

  await new Promise(resolve => env.server.close(resolve));

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
