import path from 'path';

import { getMultipleEnvelopeRequest, runServer } from '../../../utils';

test('should aggregate successful and crashed sessions', async () => {
  const { url, server, scope } = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const envelopes = await Promise.race([
    getMultipleEnvelopeRequest({ url: `${url}/success`, server, scope }, { count: 2, endServer: false }),
    getMultipleEnvelopeRequest({ url: `${url}/error_unhandled`, server, scope }, { count: 2, endServer: false }),
    getMultipleEnvelopeRequest({ url: `${url}/success_next`, server, scope }, { count: 2, endServer: false }),
  ]);

  scope.persist(false);
  server.close();

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
