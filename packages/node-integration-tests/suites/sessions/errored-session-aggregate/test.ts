import path from 'path';

import { getMultipleEnvelopeRequest, runServer } from '../../../utils';

test('should aggregate successful, crashed and erroneous sessions', async () => {
  const { url, server, scope } = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const envelopes = await Promise.race([
    getMultipleEnvelopeRequest({ url: `${url}/success`, server, scope }, { count: 3, endServer: false }),
    getMultipleEnvelopeRequest({ url: `${url}/error_handled`, server, scope }, { count: 3, endServer: false }),
    getMultipleEnvelopeRequest({ url: `${url}/error_unhandled`, server, scope }, { count: 3, endServer: false }),
  ]);

  scope.persist(false);
  await new Promise(resolve => server.close(resolve));

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
