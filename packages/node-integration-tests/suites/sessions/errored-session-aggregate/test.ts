import path from 'path';

import { getEnvelopeRequest, runServer } from '../../../utils';

test('should aggregate successful, crashed and erroneous sessions', async () => {
  const url = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const envelope = await Promise.race([
    getEnvelopeRequest(`${url}/success_slow`),
    getEnvelopeRequest(`${url}/error_handled`),
    getEnvelopeRequest(`${url}/error_unhandled`),
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
        exited: 1,
        crashed: 1,
        errored: 1,
      },
    ],
  });
});
