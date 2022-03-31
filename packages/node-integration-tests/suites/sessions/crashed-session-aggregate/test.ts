import path from 'path';

import { getEnvelopeRequest, runServer } from '../../../utils';

test('should aggregate successful and crashed sessions', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const envelope = await Promise.race([
    getEnvelopeRequest(`${url}/success`),
    getEnvelopeRequest(`${url}/error_unhandled`),
    getEnvelopeRequest(`${url}/success_slow`),
  ]);

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
        exited: 2,
        crashed: 1,
      },
    ],
  });
});
