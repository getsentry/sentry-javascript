import path from 'path';
import nock from 'nock';

import { TestEnv } from '../../../utils';

test('should aggregate successful sessions', async () => {
  const env = await TestEnv.init(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const envelope = await Promise.race([
    env.getEnvelopeRequest({ url: `${env.url}/success`, endServer: false, envelopeType: 'sessions' }),
    env.getEnvelopeRequest({ url: `${env.url}/success_next`, endServer: false, envelopeType: 'sessions' }),
    env.getEnvelopeRequest({ url: `${env.url}/success_slow`, endServer: false, envelopeType: 'sessions' }),
  ]);

  nock.cleanAll();
  env.server.close();

  expect(envelope).toHaveLength(3);
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
        exited: 3,
      },
    ],
  });
});
