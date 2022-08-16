import path from 'path';

import { getEnvelopeRequest, runServer } from '../../../utils';

test('should aggregate successful sessions', async () => {
  const { url, server, scope } = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const envelope = await Promise.race([
    getEnvelopeRequest({ url: `${url}/success`, server, scope }, { endServer: false }),
    getEnvelopeRequest({ url: `${url}/success_next`, server, scope }, { endServer: false }),
    getEnvelopeRequest({ url: `${url}/success_slow`, server, scope }, { endServer: false }),
  ]);

  scope.persist(false);
  server.close();

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
