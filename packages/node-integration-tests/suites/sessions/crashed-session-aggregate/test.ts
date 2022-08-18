import nock from 'nock';
import path from 'path';

import { getMultipleEnvelopeRequest, runServer } from '../../../utils';

test('should aggregate successful and crashed sessions', async () => {
  const { url, server } = await runServer(__dirname, `${path.resolve(__dirname, '..')}/server.ts`);

  const envelope = (
    await Promise.race([
      getMultipleEnvelopeRequest({ url: `${url}/success`, server }, { endServer: false, envelopeType: 'sessions' }),
      getMultipleEnvelopeRequest(
        { url: `${url}/error_unhandled`, server },
        { endServer: false, envelopeType: 'sessions' },
      ),
      getMultipleEnvelopeRequest(
        { url: `${url}/success_next`, server },
        { endServer: false, envelopeType: 'sessions' },
      ),
    ])
  )[0];

  nock.cleanAll();
  server.close();

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
